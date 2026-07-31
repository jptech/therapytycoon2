import { expect, test, type Page } from '@playwright/test';
import {
  box,
  closePanel,
  hud,
  isTopmostAt,
  newPractice,
  openGame,
  panel,
  railDoor,
  viewport,
  watchForTrouble,
} from './game';

/**
 * The layout faults a person found and neither the typechecker nor the balance
 * harness could see. All three are the same shape: geometry is fine in the
 * component and wrong on the page.
 *
 *  · A tooltip clipped by an ancestor's `overflow`.
 *  · A tooltip running off the right edge of the viewport.
 *  · A panel opening underneath the HUD, hiding its own header.
 *
 * The HUD strip is what makes the first two possible: it sets `overflow: hidden`
 * *and* establishes a stacking context via `backdrop-filter`, which clips even
 * `position: fixed` descendants. So a rectangle in the right place is not
 * evidence of anything — every assertion here hit-tests.
 */

/** The rightmost control on the HUD, and therefore the meanest case for placement. */
function farRightHudControl(page: Page) {
  return hud(page).getByText('Clients', { exact: true });
}

test('a tooltip on the HUD escapes the strip and stays inside the viewport', async ({ page }) => {
  const failures = watchForTrouble(page);
  await openGame(page);
  await newPractice(page, { tour: false, difficulty: 'Cozy' });

  const label = farRightHudControl(page);
  await expect(label).toBeVisible();
  await label.hover();

  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();

  const view = await viewport(page);
  const tipBox = await box(tip);
  const trigger = await label.evaluate((el) => {
    // The Tooltip's trigger is the <span> wrapper it puts around its children.
    const r = (el.closest('span') ?? el).getBoundingClientRect();
    return { left: r.left, width: r.width };
  });

  await test.step('this control genuinely stresses the right edge', async () => {
    // Without the clamp in placeAnchored(), a bottom-anchored tooltip is centred
    // on its trigger. Asserting that *that* would have overflowed is what stops
    // this test quietly becoming vacuous the day somebody re-arranges the HUD.
    const unclampedRight = trigger.left + trigger.width / 2 + tipBox.width / 2;
    expect(unclampedRight).toBeGreaterThan(view.width);
  });

  await test.step('and yet it is on the page, in one piece', async () => {
    expect(tipBox.x).toBeGreaterThanOrEqual(0);
    expect(tipBox.y).toBeGreaterThanOrEqual(0);
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(view.width);
    expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(view.height);
  });

  await test.step('and it is not clipped or buried by the strip it came from', async () => {
    // Portalled to document.body — the only reliable escape from an ancestor's
    // clip, transform, filter or z-index.
    expect(await tip.evaluate((el) => el.parentElement === document.body)).toBe(true);
    // A rect is not visibility. This is the check that would have caught the
    // clipped tooltip, which reported a perfectly good rectangle the whole time.
    // Polled because the tooltip fades in over 140ms.
    await expect.poll(() => isTopmostAt(tip, 0.5, 6)).toBe(true);
    await expect.poll(() => isTopmostAt(tip, 0.9, 6)).toBe(true);
  });

  expect(failures.messages).toEqual([]);
});

test('a rail tooltip clears the rail and reads at the left edge', async ({ page }) => {
  await openGame(page);
  await newPractice(page, { tour: false, difficulty: 'Cozy' });

  // The rail sits at x=12 and its tooltips prefer the right, so this is the
  // opposite corner of the same placement logic.
  await railDoor(page, 'Caseload').hover();

  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();

  const view = await viewport(page);
  const tipBox = await box(tip);
  expect(tipBox.x).toBeGreaterThanOrEqual(0);
  expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(view.width);
  await expect.poll(() => isTopmostAt(tip, 0.5, 6)).toBe(true);
});

test('every panel opens below the HUD, not underneath it', async ({ page }) => {
  const failures = watchForTrouble(page);
  await openGame(page);
  await newPractice(page, { tour: false, difficulty: 'Cozy' });

  const strip = await box(hud(page));
  const hudBottom = strip.y + strip.height;
  expect(hudBottom).toBeGreaterThan(0);

  // Every door on the rail on day one. The bug was a shared token drifting, so
  // checking one panel would not have caught it — checking all of them will.
  const doors = ['Today', 'Caseload', 'The team', 'The books', 'The office', 'The wall', 'Day book', 'Comfort'];

  for (const door of doors) {
    await test.step(door, async () => {
      await railDoor(page, door).click();

      const open = panel(page);
      await expect(open).toBeVisible();

      const p = await box(open);
      expect(p.y).toBeGreaterThanOrEqual(hudBottom);

      // Its own header is the part the HUD used to eat, so hit-test the title
      // rather than the panel body.
      const heading = open.getByRole('heading').first();
      await expect(heading).toBeVisible();
      // Polled: the panel slides in over 380ms, and a rect read mid-animation
      // says nothing about where it comes to rest.
      await expect.poll(() => isTopmostAt(heading, 0.1, 4)).toBe(true);
      await expect.poll(() => isTopmostAt(open, 0.5, 2)).toBe(true);

      // The close button is inside that same header strip. If the panel were
      // under the HUD this click is the one that would fail.
      await closePanel(page);
    });
  }

  expect(failures.messages).toEqual([]);
});
