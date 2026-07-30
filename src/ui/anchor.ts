export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlaceOptions {
  /** Gap between the anchor and the floating element. */
  gap?: number;
  /** Minimum distance to keep from the viewport edge. */
  margin?: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface Placement {
  left: number;
  top: number;
  /** The side actually used — may differ from the request if it had to flip. */
  side: Side;
}

/**
 * Positions a floating element (tooltip, popover) beside an anchor and keeps it
 * inside the viewport.
 *
 * Two behaviours, in order:
 *  1. **Flip** — if the preferred side has no room but the opposite side does,
 *     use the opposite side. Flipping preserves the visual relationship better
 *     than sliding a long way.
 *  2. **Clamp** — then shift along the cross axis so the element cannot hang off
 *     an edge. A HUD meter near the right edge would otherwise put half its
 *     tooltip off-screen.
 *
 * Pure and viewport-agnostic so it can be unit tested without a DOM.
 */
export function placeAnchored(
  anchor: Box,
  floating: { width: number; height: number },
  side: Side,
  opts: PlaceOptions,
): Placement {
  const gap = opts.gap ?? 8;
  const margin = opts.margin ?? 8;
  const { viewportWidth: vw, viewportHeight: vh } = opts;

  const anchorRight = anchor.left + anchor.width;
  const anchorBottom = anchor.top + anchor.height;

  const roomAbove = anchor.top - margin;
  const roomBelow = vh - anchorBottom - margin;
  const roomLeft = anchor.left - margin;
  const roomRight = vw - anchorRight - margin;

  // 1. Flip to the opposite side when the preferred one genuinely lacks room
  //    and the opposite one has it.
  let used: Side = side;
  const need = { top: floating.height + gap, bottom: floating.height + gap, left: floating.width + gap, right: floating.width + gap };
  if (side === 'top' && roomAbove < need.top && roomBelow >= need.bottom) used = 'bottom';
  else if (side === 'bottom' && roomBelow < need.bottom && roomAbove >= need.top) used = 'top';
  else if (side === 'left' && roomLeft < need.left && roomRight >= need.right) used = 'right';
  else if (side === 'right' && roomRight < need.right && roomLeft >= need.left) used = 'left';

  let left: number;
  let top: number;
  switch (used) {
    case 'bottom':
      left = anchor.left + anchor.width / 2 - floating.width / 2;
      top = anchorBottom + gap;
      break;
    case 'left':
      left = anchor.left - gap - floating.width;
      top = anchor.top + anchor.height / 2 - floating.height / 2;
      break;
    case 'right':
      left = anchorRight + gap;
      top = anchor.top + anchor.height / 2 - floating.height / 2;
      break;
    default:
      left = anchor.left + anchor.width / 2 - floating.width / 2;
      top = anchor.top - gap - floating.height;
  }

  // 2. Clamp into the viewport. `Math.max(margin, …)` last so that an element
  //    wider than the viewport pins to the left edge rather than off the right.
  left = Math.max(margin, Math.min(left, vw - floating.width - margin));
  top = Math.max(margin, Math.min(top, vh - floating.height - margin));

  return { left, top, side: used };
}
