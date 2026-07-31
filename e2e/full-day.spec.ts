import { expect, test } from '@playwright/test';
import {
  acceptFirstAtTheDoor,
  answerWhateverIsBlocking,
  bookFirstFreeHour,
  clearAnythingBlocking,
  closePanel,
  coachMark,
  newPractice,
  openGame,
  openTheDoors,
  playTheDayOut,
  railDoor,
  runFrames,
  sessionOverlay,
  setSpeed,
  skipTheTour,
  snapshot,
  waitForTechniqueBeat,
  watchForTrouble,
} from './game';

/**
 * The core path: one whole day, front door to closing up.
 *
 * Open a practice, take somebody on, give them an hour, open the doors, answer
 * the decision the room asks, read the reflect card, close the day. Every seam
 * the unit tests cannot reach is on this line — the store bridge, the modal
 * priority order, the clock loop, the bus, and the two notebook pages that
 * bracket a day.
 */

test('a whole day, from the front door to closing up', async ({ page }) => {
  const failures = watchForTrouble(page);
  await openGame(page);

  await test.step('the front door', async () => {
    await expect(page.getByRole('heading', { name: 'Therapy Tycoon II' })).toBeVisible();
    await newPractice(page, { tour: true, difficulty: 'Cozy' });

    const s = await snapshot(page);
    expect(s.day).toBe(1);
    expect(s.dayPhase).toBe('morning_brief');
    expect(s.activeClients).toBe(0);
    // Act 1 opens with three people already waiting.
    expect(s.waitlist).toBe(3);
  });

  await test.step('somebody is waiting', async () => {
    await expect(page.getByRole('heading', { name: 'Day 1 · Week 1' })).toBeVisible();
    await acceptFirstAtTheDoor(page);

    const s = await snapshot(page);
    expect(s.activeClients).toBe(1);
    expect(s.waitlist).toBe(2);
  });

  await test.step('give them an hour', async () => {
    await bookFirstFreeHour(page);
    await closePanel(page);

    const s = await snapshot(page);
    expect(s.booked).toBe(1);
    // Booking is a dispatch, not a mutation: the morning brief behind the panel
    // has to have heard about it.
    await expect(page.getByRole('button', { name: 'Open the doors' })).toBeVisible();
  });

  await test.step('the doors open, but the tour holds the clock', async () => {
    await openTheDoors(page);

    const s = await snapshot(page);
    expect(s.dayPhase).toBe('running');
    expect(s.paused).toBe(true);
    await expect(coachMark(page)).toBeVisible();

    // Speed first, while the tour still has the clock: setting it afterwards is
    // a race against the first session's decision beat, which is only half a
    // minute of game time away and puts a modal over the speed control.
    await setSpeed(page, 4);
    await skipTheTour(page);
    // No wait here: the very next step waits for the room to ask its question,
    // which cannot happen unless the clock actually started.
  });

  await test.step('the room asks you something', async () => {
    await waitForTechniqueBeat(page, failures);

    const overlay = sessionOverlay(page);
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('heading', { name: 'In the room' })).toBeVisible();

    // Every card shows its own odds before you choose it. The count on screen
    // must be the count the sim dealt — a card the player cannot see is a card
    // the sim will still let them press a number key for.
    const dealt = await page.evaluate(
      () => window.__tt!.state.pendingEvents.find((p) => p.techniqueCards?.length)?.techniqueCards?.length ?? 0,
    );
    expect(dealt).toBeGreaterThan(0);
    await expect(overlay.locator('button[aria-keyshortcuts]')).toHaveCount(dealt);
    await expect(overlay.getByText('Regression').first()).toBeVisible();

    expect(await answerWhateverIsBlocking(page)).toBe('technique');

    const used = await page.evaluate(() => window.__tt!.state.schedule[0]?.techniqueUsed ?? '');
    expect(used).not.toBe('');
  });

  await test.step('and afterwards, the reasons', async () => {
    const card = page.locator('[role="status"]').first();
    await expect(card).toBeVisible({ timeout: 25_000 });

    const result = await page.evaluate(() => {
      const s = window.__tt!.state;
      const r = s.lastDayResults[0];
      if (!r) return null;
      return {
        handle: s.clients.find((c) => c.id === r.clientId)?.handle ?? '',
        delta: r.progressDelta,
        reasons: r.reasons.length,
        narrative: r.narrative,
      };
    });
    expect(result).not.toBeNull();

    await expect(card).toContainText(result!.handle);
    await expect(card).toContainText(result!.narrative);

    // The no-hidden-punishments commitment, checked in a browser: the figure on
    // the card is the *total* change the sim applied, and every reason behind it
    // is on screen — not a summary of the interesting ones.
    const shown = `${result!.delta >= 0 ? '+' : '−'}${Math.abs(result!.delta).toFixed(1)}`;
    await expect(card).toContainText(shown);
    await expect(card.getByText('Why the hour went this way')).toBeVisible();
    await expect(card.locator('ul li')).toHaveCount(result!.reasons);
  });

  await test.step('close up for the night', async () => {
    await playTheDayOut(page, failures);

    await expect(page.getByRole('heading', { name: 'Day 1, closed' })).toBeVisible();

    const ledger = await page.evaluate(() => {
      const s = window.__tt!.state;
      return {
        results: s.lastDayResults.length,
        revenue: s.lastDayResults.reduce((a, r) => a + r.revenue, 0),
        handles: s.lastDayResults.map(
          (r) => s.clients.find((c) => c.id === r.clientId)?.handle ?? '',
        ),
      };
    });
    expect(ledger.results).toBe(1);
    for (const handle of ledger.handles) {
      await expect(page.getByText(handle).first()).toBeVisible();
    }

    await page.getByRole('button', { name: 'Close up for the night' }).click();
    await page.waitForFunction(() => window.__tt!.state.day === 2);

    const s = await snapshot(page);
    expect(s.dayPhase).toBe('morning_brief');
    expect(s.day).toBe(2);
    // Overnight referrals: the practice is still alive tomorrow.
    await expect(page.getByRole('heading', { name: 'Day 2 · Week 1' })).toBeVisible();
  });

  await test.step('nothing fell over on the way', async () => {
    // A new morning can open with a dilemma waiting. It has to be answerable —
    // that is the liveness contract — and it has to let go afterwards.
    await clearAnythingBlocking(page);

    // The rail is still there and still opens things — the cheapest possible
    // check that the tree survived a full day of dispatches.
    await railDoor(page, 'Caseload').click();
    await expect(page.getByRole('complementary')).toBeVisible();
    await closePanel(page);

    await runFrames(page, 10);
    expect(failures.messages).toEqual([]);
  });
});
