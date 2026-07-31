import type { GameAction, GameState } from '../src/sim/types';

/**
 * The dev-only handle the app installs on `window` (see the bottom of
 * src/store.ts). It is the whole simulation in one object, which is why these
 * tests can assert on what the game *did* rather than on what a screenshot of it
 * looked like.
 *
 * Typed against the sim's own `GameState` on purpose: if the contract moves, the
 * tests stop compiling instead of quietly asserting on a field that no longer
 * exists.
 */

export type UiScreenLike = 'title' | 'setup' | 'playing' | 'ended';

export interface DevHandle {
  readonly state: GameState;
  readonly ui: { screen: UiScreenLike; panel: string | null };
  dispatch: (action: GameAction) => void;
  store: { getState: () => unknown };
  readonly replay: unknown;
  saveReplay: () => void;
}

declare global {
  interface Window {
    __tt?: DevHandle;
  }
}

export type { GameState };
