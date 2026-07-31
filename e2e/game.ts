import { expect, type Locator, type Page } from '@playwright/test';
import type { GameState, UiScreenLike } from './types';

/**
 * The driver the specs are written against.
 *
 * Two rules keep these tests honest:
 *
 *  1. **Everything a player does goes through the UI.** Buttons are clicked by
 *     their accessible name, exactly as a screen reader would find them. The
 *     game already ships real buttons with real labels, so no test ids were
 *     added for this — if a selector here is ugly, that is a fact about the
 *     markup and worth knowing.
 *  2. **Everything a test asserts comes from `window.__tt`.** The whole sim is
 *     one object and dev builds expose it, so "the clock did not move" is read
 *     off `state.minute` rather than inferred from a screenshot of the clock.
 *     Reading state is observation; it is never used to drive the run.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Booting a deterministic run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `createInitialState` falls back to `Math.random()` when no seed is passed, and
 * the setup screen has no seed field — so the page's own `Math.random` is
 * replaced before any app code runs. That makes the whole boot reproducible
 * (seed, practice name, who is on the waitlist) without reaching past the UI to
 * construct the run, which would skip the title→setup→playing seam this suite
 * exists to cover.
 *
 * mulberry32 — small, well-distributed, and short enough to inline into an init
 * script.
 */
function seedScript(seed: number): string {
  return `
    (() => {
      let s = ${seed} >>> 0;
      Math.random = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      try { localStorage.clear(); } catch {}
    })();
  `;
}

/** Anything the page did that should fail the test, however it presents. */
export interface Failures {
  readonly messages: string[];
}

/**
 * A pending event nobody can render freezes the clock silently, and a render
 * throw presents identically. Both leave a trace — the watchdog logs, the error
 * boundary rethrows — so every spec listens for them and asserts they never
 * happened. Without this, a test could "pass" against a game that had already
 * fallen over into the recovery path.
 */
export function watchForTrouble(page: Page): Failures {
  const messages: string[] = [];
  page.on('pageerror', (err) => messages.push(`uncaught: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('[watchdog]')) messages.push(text);
  });
  return { messages };
}

/** Open the game at a fixed seed with an empty profile. Call before anything else. */
export async function openGame(page: Page, seed = 0x7a11ed): Promise<void> {
  await page.addInitScript({ content: seedScript(seed) });
  await page.goto('/');
  // The dev handle is installed by src/store.ts at module scope, so its presence
  // means the app's own modules have evaluated — a better ready signal than any
  // element, which could be rendered by a half-booted tree.
  await page.waitForFunction(() => !!window.__tt, undefined, { timeout: 30_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the sim
// ─────────────────────────────────────────────────────────────────────────────

export interface Snapshot {
  day: number;
  minute: number;
  dayPhase: GameState['dayPhase'];
  paused: boolean;
  speed: number;
  pending: number;
  tutorialStep: number;
  booked: number;
  activeClients: number;
  waitlist: number;
  results: number;
  screen: UiScreenLike;
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const tt = window.__tt!;
    const s = tt.state;
    return {
      day: s.day,
      minute: s.minute,
      dayPhase: s.dayPhase,
      paused: s.paused,
      speed: s.speed,
      pending: s.pendingEvents.length,
      tutorialStep: s.tutorialStep,
      booked: s.schedule.filter((x) => x.status !== 'cancelled').length,
      activeClients: s.clients.filter((c) => c.status === 'active').length,
      waitlist: s.clients.filter((c) => c.status === 'waitlist').length,
      results: s.lastDayResults.length,
      screen: tt.ui.screen,
    };
  });
}

/** The game clock, in minutes since the doors opened. */
export async function minute(page: Page): Promise<number> {
  return page.evaluate(() => window.__tt!.state.minute);
}

/**
 * Let the render loop run N frames.
 *
 * This is the honest way to assert *absence* — "the clock did not move". A flat
 * sleep proves nothing about whether the game had a chance to move; counting
 * frames proves the requestAnimationFrame loop that drives the clock actually
 * ran, and the clock still did not advance. At 4× and 60fps, 30 frames is around
 * twenty minutes of game time.
 */
export async function runFrames(page: Page, frames = 30): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const step = () => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout truths
// ─────────────────────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box — it is not rendered');
  return b;
}

/**
 * Is this element actually the thing you would see at that point?
 *
 * `getBoundingClientRect` cannot see a clip: an element cut off by an ancestor's
 * `overflow: hidden`, or buried under a higher stacking context, still reports a
 * perfectly good rectangle. Hit-testing is the only check that catches both, and
 * both are bugs this project has actually shipped.
 *
 * `pointer-events` is forced on for the duration of the probe and put straight
 * back. A tooltip is deliberately click-through, and without this every tooltip
 * would report "not on top" for a reason that has nothing to do with whether the
 * player can read it.
 *
 * @param fx horizontal position inside the element, 0..1
 * @param dy pixels down from the element's top edge
 */
export async function isTopmostAt(locator: Locator, fx = 0.5, dy = 4): Promise<boolean> {
  return locator.evaluate(
    (el, { fx: fxIn, dy: dyIn }) => {
      const style = (el as HTMLElement).style;
      const previous = style.pointerEvents;
      style.pointerEvents = 'auto';
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width * fxIn, r.top + dyIn);
      style.pointerEvents = previous;
      return !!hit && (hit === el || el.contains(hit));
    },
    { fx, dy },
  );
}

export async function viewport(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

// ─────────────────────────────────────────────────────────────────────────────
// The furniture
// ─────────────────────────────────────────────────────────────────────────────

/** The glassy strip across the top. It clips overflow and makes a stacking context. */
export function hud(page: Page): Locator {
  return page.locator('header').first();
}

/** A door on the left rail, by its label — the aria-label is `${label} — ${hint}`. */
export function railDoor(page: Page, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${label} — `) });
}

/** Whatever slide-over panel is open. PanelShell renders an <aside> with a label. */
export function panel(page: Page): Locator {
  return page.getByRole('complementary');
}

/** The mid-session technique choice. */
export function sessionOverlay(page: Page): Locator {
  return page.locator('[role="dialog"]').filter({ has: page.locator('#session-overlay-title') });
}

/** An ordinary dilemma. */
export function eventModal(page: Page): Locator {
  return page.locator('[role="dialog"]').filter({ has: page.locator('#event-modal-title') });
}

/** Dr. Halloway's coach-mark, if the tour is showing one. */
export function coachMark(page: Page): Locator {
  return page.getByText('Dr. Wren Halloway', { exact: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Playing
// ─────────────────────────────────────────────────────────────────────────────

export interface NewPracticeOptions {
  /** Leave Dr. Halloway's tour switched on. Default true — it is on by default in game. */
  tour?: boolean;
  difficulty?: 'Cozy' | 'Standard' | 'Challenge';
}

/** Title screen → setup → an open practice, entirely by clicking. */
export async function newPractice(page: Page, opts: NewPracticeOptions = {}): Promise<void> {
  const { tour = true, difficulty = 'Cozy' } = opts;

  await page.getByRole('button', { name: 'New practice' }).click();
  await page.getByRole('radio', { name: new RegExp(`^${difficulty}`) }).click();

  const ropes = page.getByRole('checkbox');
  if ((await ropes.isChecked()) !== tour) await ropes.setChecked(tour);

  await page.getByRole('button', { name: 'Open the practice' }).click();
  await page.waitForFunction(() => window.__tt!.ui.screen === 'playing');
  await page.waitForFunction(() => window.__tt!.state.dayPhase === 'morning_brief');
}

/** Take the first person at the door onto the caseload, from the morning brief. */
export async function acceptFirstAtTheDoor(page: Page): Promise<void> {
  const before = await page.evaluate(
    () => window.__tt!.state.clients.filter((c) => c.status === 'active').length,
  );
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await page.waitForFunction(
    (n) => window.__tt!.state.clients.filter((c) => c.status === 'active').length > n,
    before,
  );
}

/**
 * Book the earliest free hour in the Day Book: open the panel, click an empty
 * cell, pick whoever the picker puts at the top of the queue.
 */
export async function bookFirstFreeHour(page: Page): Promise<void> {
  await railDoor(page, 'Today').click();
  await expect(panel(page)).toBeVisible();

  await page.getByRole('button', { name: /^Book .+ at / }).first().click();

  const picker = page.locator('[role="dialog"]').filter({ hasText: 'Who takes' });
  await expect(picker).toBeVisible();
  await picker.locator('li button').first().click();

  await page.waitForFunction(() => window.__tt!.state.schedule.length > 0);
}

export async function closePanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(panel(page)).toHaveCount(0);
}

export async function openTheDoors(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open the doors' }).click();
  await page.waitForFunction(() => window.__tt!.state.dayPhase === 'running');
}

export async function skipTheTour(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Skip the tour' }).click();
  await page.waitForFunction(() => window.__tt!.state.tutorialStep < 0);
}

export async function setSpeed(page: Page, speed: 1 | 2 | 4): Promise<void> {
  const key = speed === 1 ? 1 : speed === 2 ? 2 : 3;
  await page.getByRole('button', { name: `Speed ${speed} times (key ${key})` }).click();
  await page.waitForFunction((s) => window.__tt!.state.speed === s, speed);
}

/**
 * How long a modal is given to reach the screen after the sim publishes the
 * pending event that owns it.
 *
 * The sim is synchronous but the modal is not: the store bumps its revision,
 * React schedules, and only then does the dialog exist in the DOM. Under six
 * parallel workers that gap is measurable. Anything inside this window is a slow
 * machine; anything past it is the freeze.
 */
const MODAL_COMMIT_MS = 10_000;

/**
 * Which modal owns the clock right now — read from the sim, never from the DOM.
 *
 * This deliberately mirrors `pendingDecision`/`pendingChoice` in
 * `src/sim/pending.ts`, which are also exactly what `App.tsx` mounts from. State
 * is the source of truth for *what is blocking*; the DOM is then checked for
 * whether the matching modal actually arrived. Doing it the other way round —
 * asking the DOM what is up and acting on the answer — reads a value that is one
 * React commit stale, and every race in this file came from that.
 */
export async function whatIsBlocking(page: Page): Promise<'technique' | 'event' | null> {
  return page.evaluate(() => {
    const pending = window.__tt!.state.pendingEvents;
    if (pending.some((p) => !!p.techniqueCards && p.techniqueCards.length > 0)) return 'technique';
    return pending.length > 0 ? 'event' : null;
  });
}

/**
 * Answer whatever is currently holding the clock, and wait until it has actually
 * let go.
 *
 * The decision of *what* to answer comes from the sim, so this can never click a
 * technique card while it believes it is dismissing a dilemma — the bug that
 * made this helper eat the very beat its caller was waiting for.
 *
 * The wait for the modal is a poll, not a single look. A dialog that has not
 * been committed yet is indistinguishable, in one round trip, from a dialog that
 * will never exist; only the first is normal, and reporting it as the second
 * raises a false alarm on the one contract this suite is built to protect. The
 * freeze error below is therefore only reachable after `MODAL_COMMIT_MS` of the
 * clock being blocked with nothing on screen.
 *
 * Waiting on the pending count afterwards rather than on the modal disappearing
 * matters too: both the technique beat and an event's aftermath line hold the
 * modal on screen for a moment *after* the click, and clicking twice into that
 * gap is exactly how a flaky test is born.
 */
export async function answerWhateverIsBlocking(page: Page): Promise<'technique' | 'event'> {
  const kind = await whatIsBlocking(page);
  if (!kind) throw new Error('nothing is pending — there is nothing to answer');

  const modal = kind === 'technique' ? sessionOverlay(page) : eventModal(page);
  try {
    await expect(modal).toBeVisible({ timeout: MODAL_COMMIT_MS });
  } catch {
    const still = await page.evaluate(() =>
      window.__tt!.state.pendingEvents.map((p) => ({
        id: p.def.id,
        cards: p.techniqueCards?.length ?? 0,
      })),
    );
    if (still.length === 0) {
      throw new Error(
        `a ${kind} decision resolved itself before anything answered it — ` +
          'the clock was handed back by something other than the player',
      );
    }
    throw new Error(
      `the clock is blocked by a pending event and nothing on screen can answer it after ` +
        `${MODAL_COMMIT_MS}ms — this is the freeze src/sim/pending.ts exists to prevent. ` +
        `Pending: ${JSON.stringify(still)}`,
    );
  }

  const before = await page.evaluate(() => window.__tt!.state.pendingEvents.length);
  if (kind === 'technique') {
    // Cards are keyed 1..n and say so in aria-keyshortcuts; card 1 is always
    // there. Scoped to the overlay so a stray keyed button elsewhere on the
    // page can never stand in for it.
    await modal.locator('button[aria-keyshortcuts="1"]').first().click();
  } else {
    await modal.getByRole('button').first().click();
  }

  await page.waitForFunction((n) => window.__tt!.state.pendingEvents.length < n, before, {
    timeout: 20_000,
  });
  return kind;
}

/**
 * Wait for the clock to get past a minute you read earlier.
 *
 * The honest test of "the game handed the clock back", and better than watching
 * `paused`: a day that restarts and then stops again half a minute later at a
 * decision beat was never stuck, but `paused` is true at both ends of that. Read
 * `from` *before* the thing that is supposed to release the clock, or this waits
 * for the clock to leave a minute it has already stopped on.
 */
export async function waitForClockPast(page: Page, from: number): Promise<void> {
  await page.waitForFunction((m) => window.__tt!.state.minute > m, from, { timeout: 20_000 });
}

/**
 * Answer everything currently holding the clock. A new day can open with a
 * dilemma waiting, and that is not a bug — but it does mean nothing else on
 * screen is reachable until somebody deals with it.
 */
export async function clearAnythingBlocking(page: Page, max = 6): Promise<number> {
  let answered = 0;
  while ((await snapshot(page)).pending > 0) {
    if (answered >= max) throw new Error(`still blocked after answering ${max} events in a row`);
    await answerWhateverIsBlocking(page);
    answered++;
  }
  return answered;
}

/**
 * Run the day forward until a session reaches its decision beat, dealing with
 * any ordinary dilemma that turns up first.
 *
 * The beat lands a little over halfway through the hour, so at 4× it is roughly
 * a second away — but an event can arrive before it, and a test that assumed
 * otherwise would be flaky for a reason that is not a bug.
 *
 * The beat is recognised from `pendingEvents`, not from the overlay being on
 * screen, and that is load-bearing rather than stylistic. Looking at the DOM
 * first means a beat that has published but not yet rendered falls through to
 * "something is pending, answer it" — and by the time the click lands the
 * overlay *has* rendered, so the helper spends the caller's beat and then waits
 * out its whole budget for a second one that is never coming. Only one session
 * is booked in these specs, so that is a guaranteed failure rather than a rare
 * one, and it presents as "no session ever asked for a technique" against a game
 * that asked perfectly well.
 *
 * Returns with the overlay actually visible, so callers can assert on it.
 */
export async function waitForTechniqueBeat(
  page: Page,
  failures: Failures,
  budgetMs = 40_000,
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (failures.messages.length) throw new Error(failures.messages.join('\n'));

    const blocking = await whatIsBlocking(page);
    if (blocking === 'technique') {
      await expect(sessionOverlay(page)).toBeVisible({ timeout: MODAL_COMMIT_MS });
      return;
    }
    if (blocking === 'event') {
      // An ordinary dilemma got here first. `answerWhateverIsBlocking` decides
      // from the same state, so this can only ever dismiss the dilemma.
      await answerWhateverIsBlocking(page);
      continue;
    }

    const s = await snapshot(page);
    if (s.dayPhase !== 'running') {
      throw new Error(`the day left 'running' (now ${s.dayPhase}) before any session asked for a technique`);
    }
    await runFrames(page, 12);
  }
  throw new Error('no session ever asked for a technique');
}

/**
 * Let the day run, answering every decision it raises, until the lamps go out.
 *
 * Deliberately a loop rather than one long wait: if the clock stops with a
 * pending event that nothing renders, this says so in as many words instead of
 * timing out with "element not found".
 */
export async function playTheDayOut(
  page: Page,
  failures: Failures,
  budgetMs = 60_000,
): Promise<{ decisions: number }> {
  const deadline = Date.now() + budgetMs;
  let decisions = 0;

  while (Date.now() < deadline) {
    if (failures.messages.length) throw new Error(failures.messages.join('\n'));

    const s = await snapshot(page);
    if (s.dayPhase === 'day_end') return { decisions };

    if (s.pending > 0) {
      await answerWhateverIsBlocking(page);
      decisions++;
      continue;
    }

    if (s.paused) {
      throw new Error(
        `the day is paused at minute ${s.minute} with nothing pending — the clock will never restart`,
      );
    }

    await runFrames(page, 12);
  }

  const s = await snapshot(page);
  throw new Error(
    `the day never closed: phase=${s.dayPhase} minute=${s.minute} pending=${s.pending} paused=${s.paused}`,
  );
}
