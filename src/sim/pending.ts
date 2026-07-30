import type { GameState, PendingEvent } from './types';

/**
 * Which pending event owns the clock.
 *
 * `tick()` refuses to advance time while any event is pending — deliberately,
 * so a decision can never be skipped. That makes it critical that *something*
 * is always on screen to resolve it: a pending event nobody renders freezes the
 * game in a way pause/play cannot fix, because pause is not what is blocking it.
 *
 * These are the single source of truth. App.tsx decides what to mount with
 * exactly the same predicates the modals use to pick their subject, so the two
 * can never disagree about whose turn it is. They live in `sim/` rather than the
 * UI because they are a liveness contract, not a presentation detail — and so
 * the liveness tests can assert on them without importing React.
 */

/** The mid-session technique choice, if one is waiting. Takes priority. */
export function pendingDecision(s: GameState): PendingEvent | undefined {
  return s.pendingEvents.find((p) => !!p.techniqueCards && p.techniqueCards.length > 0);
}

/** The next ordinary dilemma, once no session decision is outstanding. */
export function pendingChoice(s: GameState): PendingEvent | undefined {
  if (pendingDecision(s)) return undefined;
  return s.pendingEvents.find((p) => !p.techniqueCards || p.techniqueCards.length === 0);
}

/** True when the clock is blocked but nothing is on screen to unblock it. */
export function isStuck(s: GameState): boolean {
  return s.pendingEvents.length > 0 && !pendingDecision(s) && !pendingChoice(s);
}
