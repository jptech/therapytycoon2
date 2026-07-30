import { describe, expect, it } from 'vitest';
import {
  CARD_MIN_WIDTH,
  DOCK_GAP,
  RAIL_INSET,
  dayCardDock,
  getPanelWidth,
  setPanelWidth,
  subscribePanelWidth,
} from './dock';

/** The two shells a panel can wear, plus the 12px right margin they sit on. */
const NARROW_PANEL = 460 + 12;
const WIDE_PANEL = 760 + 12;

describe('dayCardDock', () => {
  it('leaves the card alone when no panel is open', () => {
    expect(dayCardDock(1440, 0)).toEqual({ leftInset: 0, rightInset: 0, yielded: false });
  });

  it('reserves the panel plus a gap on a desktop viewport', () => {
    const d = dayCardDock(1440, WIDE_PANEL);
    expect(d.yielded).toBe(false);
    expect(d.rightInset).toBe(WIDE_PANEL + DOCK_GAP);
    expect(d.leftInset).toBe(RAIL_INSET); // clear of the door rail
  });

  it('leaves the card a readable column whenever it docks', () => {
    for (let vw = 600; vw <= 2560; vw += 7) {
      for (const panel of [NARROW_PANEL, WIDE_PANEL]) {
        const d = dayCardDock(vw, panel);
        if (d.yielded) continue;
        expect(vw - d.rightInset - d.leftInset - 16).toBeGreaterThanOrEqual(CARD_MIN_WIDTH);
      }
    }
  });

  it('yields rather than squeezing the card to a ribbon', () => {
    // A 13" laptop with the wide shell open: there is no honest way to show
    // both, so the card steps back instead of being shredded.
    const d = dayCardDock(1024, WIDE_PANEL);
    expect(d.yielded).toBe(true);
    expect(d.rightInset).toBe(0);
    expect(d.leftInset).toBe(0);
  });

  it('still docks a narrow panel on the same laptop', () => {
    expect(dayCardDock(1024, NARROW_PANEL).yielded).toBe(false);
  });

  it('docks both shells on a 1280 laptop — the common case must not yield', () => {
    expect(dayCardDock(1280, WIDE_PANEL).yielded).toBe(false);
    expect(dayCardDock(1280, NARROW_PANEL).yielded).toBe(false);
  });

  it('never yields on a wide screen', () => {
    expect(dayCardDock(1920, WIDE_PANEL).yielded).toBe(false);
    expect(dayCardDock(1920, NARROW_PANEL).yielded).toBe(false);
  });
});

describe('the published panel width', () => {
  it('notifies subscribers only when the number actually moves', () => {
    let calls = 0;
    const stop = subscribePanelWidth(() => {
      calls += 1;
    });
    setPanelWidth(0);
    setPanelWidth(772);
    setPanelWidth(772.4); // rounds to the same px — no re-render
    expect(calls).toBe(1);
    expect(getPanelWidth()).toBe(772);
    setPanelWidth(0);
    expect(calls).toBe(2);
    stop();
    setPanelWidth(500);
    expect(calls).toBe(2);
    setPanelWidth(0);
  });
});
