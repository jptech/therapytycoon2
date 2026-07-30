import { describe, expect, it } from 'vitest';
import { placeAnchored, type Box } from './anchor';

const VP = { viewportWidth: 1280, viewportHeight: 720, gap: 8, margin: 8 };
const TIP = { width: 240, height: 60 };

/** A trigger somewhere in the HUD strip. */
const anchorAt = (left: number, top = 30): Box => ({ left, top, width: 40, height: 20 });

describe('placeAnchored', () => {
  it('centres under the anchor when there is room', () => {
    const p = placeAnchored(anchorAt(600), TIP, 'bottom', VP);
    expect(p.side).toBe('bottom');
    expect(p.left).toBeCloseTo(600 + 20 - 120, 5);
    expect(p.top).toBe(50 + 8);
  });

  it('never runs off the right edge', () => {
    // A meter at the far right of the HUD — the case in the screenshot.
    const p = placeAnchored(anchorAt(1250), TIP, 'bottom', VP);
    expect(p.left + TIP.width).toBeLessThanOrEqual(1280 - 8);
    expect(p.left).toBe(1280 - 240 - 8);
  });

  it('never runs off the left edge', () => {
    const p = placeAnchored(anchorAt(2), TIP, 'bottom', VP);
    expect(p.left).toBe(8);
  });

  it('flips above when there is no room below', () => {
    const anchor: Box = { left: 600, top: 690, width: 40, height: 20 };
    const p = placeAnchored(anchor, TIP, 'bottom', VP);
    expect(p.side).toBe('top');
    expect(p.top + TIP.height).toBeLessThanOrEqual(720 - 8);
  });

  it('flips below when there is no room above — the HUD case', () => {
    const anchor: Box = { left: 600, top: 20, width: 40, height: 20 };
    const p = placeAnchored(anchor, TIP, 'top', VP);
    expect(p.side).toBe('bottom');
    expect(p.top).toBe(48);
  });

  it('flips a left-side tooltip to the right when pinned to the left edge', () => {
    const p = placeAnchored(anchorAt(10, 300), TIP, 'left', VP);
    expect(p.side).toBe('right');
  });

  it('stays on screen even when the element is wider than the viewport', () => {
    const huge = { width: 2000, height: 60 };
    const p = placeAnchored(anchorAt(600), huge, 'bottom', VP);
    expect(p.left).toBe(8); // pinned to the left edge rather than off the right
  });

  it('keeps every placement fully on screen across the whole viewport', () => {
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      for (let x = 0; x <= 1280; x += 40) {
        for (let y = 0; y <= 720; y += 40) {
          const p = placeAnchored({ left: x, top: y, width: 40, height: 20 }, TIP, side, VP);
          expect(p.left).toBeGreaterThanOrEqual(8);
          expect(p.top).toBeGreaterThanOrEqual(8);
          expect(p.left + TIP.width).toBeLessThanOrEqual(1280 - 8);
          expect(p.top + TIP.height).toBeLessThanOrEqual(720 - 8);
        }
      }
    }
  });
});
