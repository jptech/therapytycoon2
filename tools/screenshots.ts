/**
 * The four screenshots the README embeds, regenerated from the real game.
 *
 *   bun run shots            # writes docs/media/*.png
 *   bun run shots --headed   # watch it drive
 *
 * These exist because a README picture of a game is a claim about what the game
 * looks like, and every art pass silently makes that claim false. Regenerating
 * them is one command rather than an afternoon of cropping, which is the only
 * reason it actually gets done.
 *
 * The run is seeded, so the same four frames come back every time and a diff in
 * `docs/media/` means the art changed rather than that the dice did. Unlike the
 * e2e suite this one *wants* the office scene: it is the thing being pictured,
 * so it waits for the canvas and for the ambient light to settle before firing.
 */
import { chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 5399;
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/media';
const HEADED = process.argv.includes('--headed');

/** The same mulberry32 the e2e driver installs, for the same reason. */
const SEED_SCRIPT = `
  (() => {
    let s = 0x7a11ed >>> 0;
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

/**
 * Pixi drives itself off rAF, and Playwright will happily screenshot the frame
 * where the lamps have not come up yet. Waiting on wall-clock time is flaky on a
 * loaded machine; waiting on a count of actual presented frames is not.
 */
async function frames(page: Page, n = 40): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        let left = count;
        const step = () => (--left <= 0 ? done() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
}

async function shot(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await frames(page, 50);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${OUT}/${name}.png  ${w}×${h}`);
}

const click = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name }).first().click();

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const server = spawn(
    'bun',
    ['--bun', 'vite', '--config', 'e2e/vite.e2e.config.ts', '--port', String(PORT)],
    { stdio: 'ignore' },
  );
  const stop = () => server.kill();
  process.on('exit', stop);

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript({ content: SEED_SCRIPT });

  // The dev server needs a moment to bind, and Vite compiles on first request.
  for (let i = 0; i < 40; i++) {
    try {
      await page.goto(BASE, { timeout: 2000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await page.waitForFunction(() => !!window.__tt, undefined, { timeout: 60_000 });

  console.log('Writing screenshots…');

  // ── The title screen ──────────────────────────────────────────────────────
  await shot(page, 'title', 1280, 800);

  // ── Into a practice ───────────────────────────────────────────────────────
  await click(page, 'New practice');
  await page.getByRole('radio', { name: /^Cozy/ }).click();
  await click(page, 'Open the practice');
  await page.waitForFunction(() => window.__tt!.state.dayPhase === 'morning_brief');

  // Everyone at the door comes in, so the caseload panel has something in it.
  // Accepting somebody takes them off the list, so this always clicks the first
  // remaining button rather than walking a snapshot that goes stale as it goes.
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  for (let n = await accept.count(); n > 0; n = await accept.count()) {
    await accept.first().click();
    await page.waitForFunction((was) => {
      const doc = document.querySelectorAll('button');
      let seen = 0;
      for (const b of doc) if (b.textContent?.trim() === 'Accept') seen++;
      return seen < was;
    }, n);
  }

  // ── The caseload, docked beside the morning brief ─────────────────────────
  await page.getByRole('button', { name: /^Caseload/ }).click();
  await page.waitForSelector('text=The Caseload');
  await shot(page, 'caseload', 1280, 800);
  await click(page, 'Close panel');

  // ── Open the doors and let the first hour start ───────────────────────────
  await click(page, 'Auto-fill the day');
  await click(page, 'Open the doors');
  await page.waitForFunction(() => window.__tt!.state.dayPhase === 'running');
  await click(page, 'Skip the tour');
  await page.waitForFunction(() => window.__tt!.state.tutorialStep < 0);

  // ── The mid-session decision ──────────────────────────────────────────────
  // Taken first, and answered, because the technique beat halts the clock: any
  // frame of the office after this point would have the overlay sitting over it.
  await page.waitForSelector('text=What do you reach for?', { timeout: 90_000 });
  await shot(page, 'session', 1280, 800);
  await page.getByRole('group', { name: 'Technique choices' }).getByRole('button').first().click();

  // ── The office, with an hour under way ────────────────────────────────────
  // Nothing may be on top of it: this is the one picture that is only about
  // what the scene looks like. The clock is held first — the answered hour runs
  // on for several minutes, but the moment it ends a reflection slides in, and
  // the hour after that stops for its own decision. Holding the day is the only
  // way to be sure the frame stays clear long enough to take it.
  await page.waitForFunction(() => window.__tt!.state.pendingEvents.length === 0);
  await click(page, 'Hold the day (space)');
  await page.waitForFunction(() => window.__tt!.state.paused === true);
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0);
  await page.waitForFunction(() => window.__tt!.state.schedule.some((s) => s.status === 'active'));
  await shot(page, 'office', 1280, 600);

  await browser.close();
  stop();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
