import { useShallow } from 'zustand/react/shallow';
import { pendingChoice, pendingDecision, useStore, type UiState } from '../store';
import type { GameState } from '../sim/types';

/**
 * Who currently owns the centre of the screen.
 *
 * `App.tsx` mounts from this and the keyboard layer suppresses from it, so the
 * two can never disagree about whether a decision is on the table — which is
 * the same class of bug as the pending-event predicates that now live in
 * `src/sim/pending.ts`, and it is worth heading off the same way. The pending
 * ones are re-used from there rather than re-derived here.
 *
 * Order matters: the fields are listed most-blocking first, and `App` renders
 * them in that order.
 */
export interface ModalState {
  /** The run is over and the end screen is up. */
  ended: boolean;
  /** A session is waiting on a technique — the deck takes 1–4. */
  session: boolean;
  /** A plain event is waiting on a choice. */
  event: boolean;
  hire: boolean;
  philosophy: boolean;
  quarter: boolean;
  keys: boolean;
}

export function modalState(s: GameState, ui: UiState): ModalState {
  return {
    ended: !!s.ended,
    session: !!pendingDecision(s),
    event: !!pendingChoice(s),
    hire: ui.hireOpen,
    philosophy: !!s.flags.philosophyAvailable && !s.philosophy,
    quarter: !!s.flags.showQuarterReview,
    keys: ui.keysOpen,
  };
}

/** True when anything at all is holding the screen. */
export function anyModalUp(m: ModalState): boolean {
  return m.ended || m.session || m.event || m.hire || m.philosophy || m.quarter || m.keys;
}

/**
 * The keys card is the only purely informational thing in this list, which
 * makes it the only one that must never sit on top of a decision. Opening it is
 * already suppressed while a modal is up — but the reverse order is reachable:
 * leave the card open at 4×, an event fires a second later, and a shortcut list
 * is painted over the thing holding the clock. `tick()` refuses to advance
 * while an event is pending, so that reads as a freeze with the explanation
 * hidden behind it. The card stays open in `ui.keysOpen` and comes back on its
 * own once the decision is answered.
 */
export function keysCardOwnsScreen(m: ModalState): boolean {
  return m.keys && !m.ended && !m.session && !m.event && !m.hire && !m.philosophy && !m.quarter;
}

/** Subscribe to the whole set at once. Shallow — one re-render when it moves. */
export function useModals(): ModalState {
  return useStore(
    useShallow((st) => {
      void st.rev; // the sim mutates in place; the revision is the dependency
      return modalState(st.game.state, st.ui);
    }),
  );
}
