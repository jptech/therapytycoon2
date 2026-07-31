import { expect, test } from '@playwright/test';
import {
  acceptFirstAtTheDoor,
  answerWhateverIsBlocking,
  bookFirstFreeHour,
  closePanel,
  coachMark,
  minute,
  newPractice,
  openGame,
  openTheDoors,
  runFrames,
  sessionOverlay,
  setSpeed,
  skipTheTour,
  snapshot,
  waitForClockPast,
  waitForTechniqueBeat,
  watchForTrouble,
} from './game';

/**
 * Two ways the clock is allowed to stop, and one way it is not.
 *
 * `tick()` refuses to advance time while an event is pending, and `startDay()`
 * holds the day while the tour is up. Both are deliberate; both are silent;
 * both are indistinguishable from a freeze if the thing that is supposed to
 * hand the clock back never does. These tests watch the clock in a real browser
 * across both edges — stopped, and started again — because the "started again"
 * half is what proves the "stopped" half is not just a dead game.
 *
 * See src/sim/pending.ts and the `startDay` comment in src/sim/engine.ts.
 */

/** Enough frames that a running clock would visibly move: ~1s at 60fps, 40 game minutes at 4×. */
const ENOUGH_FRAMES = 60;

test('the clock stops for a decision, and starts again once it is answered', async ({ page }) => {
  const failures = watchForTrouble(page);
  await openGame(page);

  await newPractice(page, { tour: false, difficulty: 'Cozy' });
  await acceptFirstAtTheDoor(page);
  await bookFirstFreeHour(page);
  await closePanel(page);
  await openTheDoors(page);
  // Left at 1×. The beat lands under three seconds in either way, and clicking
  // a speed button after the doors open is a race against the modal it raises.
  await waitForTechniqueBeat(page, failures);

  const blocked = await snapshot(page);
  expect(blocked.pending).toBeGreaterThan(0);
  await expect(sessionOverlay(page)).toBeVisible();

  await test.step('time does not pass while the room is waiting on you', async () => {
    const before = await minute(page);
    await runFrames(page, ENOUGH_FRAMES);
    const after = await minute(page);
    expect(after).toBe(before);

    const stillPending = await snapshot(page);
    expect(stillPending.pending).toBeGreaterThan(0);
    expect(stillPending.dayPhase).toBe('running');

    // The decision also auto-pauses, so `paused` alone cannot tell you which of
    // the two is holding the clock — and that ambiguity is exactly why the
    // reported freeze was so hard to read. Take the pause away and the clock
    // still does not move: `tick()` refuses while anything is pending, so the
    // pause button is not what is blocking and pressing it cannot help.
    await page.evaluate(() => window.__tt!.dispatch({ type: 'TOGGLE_PAUSE', paused: false }));
    expect((await snapshot(page)).paused).toBe(false);
    const unpaused = await minute(page);
    await runFrames(page, ENOUGH_FRAMES);
    expect(await minute(page)).toBe(unpaused);
  });

  await test.step('answering it hands the clock back', async () => {
    const before = await minute(page);
    await answerWhateverIsBlocking(page);

    await page.waitForFunction(() => window.__tt!.state.pendingEvents.length === 0);
    await waitForClockPast(page, before);
    await runFrames(page, ENOUGH_FRAMES);

    expect(await minute(page)).toBeGreaterThan(before);
  });

  expect(failures.messages).toEqual([]);
});

test('the day does not start running under a coach-mark', async ({ page }) => {
  const failures = watchForTrouble(page);
  await openGame(page);

  await newPractice(page, { tour: true, difficulty: 'Cozy' });
  await acceptFirstAtTheDoor(page);
  await bookFirstFreeHour(page);
  await closePanel(page);
  await openTheDoors(page);

  await test.step('the doors are open and the clock is holding', async () => {
    const s = await snapshot(page);
    expect(s.dayPhase).toBe('running');
    expect(s.paused).toBe(true);
    expect(s.tutorialStep).toBeGreaterThanOrEqual(0);

    await expect(coachMark(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip the tour' })).toBeVisible();

    // You cannot read a coach-mark against a moving schedule. Even at 4× — the
    // fastest the game can run away from you — nothing moves.
    await setSpeed(page, 4);
    await expect(coachMark(page)).toBeVisible();
    const before = await minute(page);
    await runFrames(page, ENOUGH_FRAMES);
    expect(await minute(page)).toBe(before);

    // Back to walking pace, so the restart below is measured against an empty
    // stretch of morning rather than against the first session's decision beat.
    await setSpeed(page, 1);
  });

  await test.step('finishing the tour hands the clock back', async () => {
    // Read before the skip: by the time the tour lets go, the clock can already
    // have run to the first session's decision beat and stopped there.
    const before = await minute(page);
    await skipTheTour(page);
    await expect(coachMark(page)).toHaveCount(0);

    await waitForClockPast(page, before);
    await runFrames(page, ENOUGH_FRAMES);
    expect(await minute(page)).toBeGreaterThan(before);
  });

  expect(failures.messages).toEqual([]);
});
