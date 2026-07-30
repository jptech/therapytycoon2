/**
 * How the morning brief and the day-end card share the screen with a panel.
 *
 * Both of those are notebook pages the player is meant to sit with — the brief
 * is where the day is decided and the day-end card is the whole point of the
 * day — so a panel must never quietly delete one to make room for a spreadsheet.
 * Instead the card *docks*: it slides left and gives the panel the right-hand
 * column, and both stay live. You can book someone in the schedule panel and
 * then press "Open the doors" without closing anything.
 *
 * There is a floor. Below a certain width a notebook page stops being a page
 * and becomes a column of orphaned words, so on a narrow screen the card yields
 * instead: it stays mounted and dims out of the way, and the moment the panel
 * closes it is exactly where it was. Yielding is the fallback, never the plan.
 *
 * The maths is pure and viewport-agnostic so it can be unit tested without a
 * DOM, the same way `anchor.ts` is. The measurement of the live panel is not
 * guessed from a table of widths — `PanelShell` publishes its real width here on
 * mount and on resize, which is the only version of this that cannot drift when
 * a panel changes its shell.
 */

/**
 * Narrower than this and a notebook page is no longer worth reading. Set so a
 * 1280px laptop — the most common screen this game will meet — still docks the
 * card beside the *wide* shell rather than fading it out.
 */
export const CARD_MIN_WIDTH = 400;

/** Breathing room between the docked card and the panel's left edge. */
export const DOCK_GAP = 14;

/**
 * The rail of doors down the left, plus a little air. A centred card clears it
 * on its own; a docked one would slide its punched margin underneath it.
 */
export const RAIL_INSET = 76;

export interface DayCardDock {
  /** Left-hand space to keep clear, in px — the door rail. */
  leftInset: number;
  /** Right-hand space to keep clear, in px. Zero when nothing is in the way. */
  rightInset: number;
  /** True when there was not enough room to dock and the card has stepped back. */
  yielded: boolean;
}

export const NO_DOCK: DayCardDock = { leftInset: 0, rightInset: 0, yielded: false };

/**
 * Where a day card should sit given the panel currently on screen.
 *
 * @param viewportWidth  window.innerWidth
 * @param panelWidth     the open panel's outer width including its own right
 *                       margin, or 0 for no panel
 * @param sidePadding    the card container's own horizontal padding
 */
export function dayCardDock(viewportWidth: number, panelWidth: number, sidePadding = 16): DayCardDock {
  if (panelWidth <= 0) return NO_DOCK;
  const reserved = panelWidth + DOCK_GAP;
  const roomLeftForTheCard = viewportWidth - reserved - RAIL_INSET - sidePadding;
  if (roomLeftForTheCard < CARD_MIN_WIDTH) return { leftInset: 0, rightInset: 0, yielded: true };
  return { leftInset: RAIL_INSET, rightInset: reserved, yielded: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// The live measurement
//
// A tiny external store rather than a field on the zustand store: this changes
// on every window resize and is read by exactly one component, so routing it
// through the app store would re-render the whole tree for a number nothing
// else cares about.
// ─────────────────────────────────────────────────────────────────────────────

let measured = 0;
const listeners = new Set<() => void>();

/** Called by PanelShell. Includes the panel's right margin. */
export function setPanelWidth(width: number): void {
  const next = Math.max(0, Math.round(width));
  if (next === measured) return;
  measured = next;
  for (const notify of listeners) notify();
}

export function getPanelWidth(): number {
  return measured;
}

export function subscribePanelWidth(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
