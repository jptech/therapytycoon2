import { describe, expect, it } from 'vitest';
import { anyModalUp, keysCardOwnsScreen, type ModalState } from './modals';

/**
 * `modalState` itself needs a GameState and a store, but the two predicates the
 * rest of the UI branches on are pure — and one of them encodes a liveness
 * rule, so it is worth pinning without a DOM.
 */
function modals(patch: Partial<ModalState> = {}): ModalState {
  return {
    ended: false,
    session: false,
    event: false,
    hire: false,
    philosophy: false,
    quarter: false,
    keys: false,
    ...patch,
  };
}

describe('anyModalUp', () => {
  it('is false on an empty screen', () => {
    expect(anyModalUp(modals())).toBe(false);
  });

  it('is true for every member, so the keyboard layer cannot miss one', () => {
    for (const key of Object.keys(modals()) as (keyof ModalState)[]) {
      expect(anyModalUp(modals({ [key]: true }))).toBe(true);
    }
  });
});

describe('keysCardOwnsScreen', () => {
  it('shows the card when nothing else wants the screen', () => {
    expect(keysCardOwnsScreen(modals({ keys: true }))).toBe(true);
  });

  it('never paints over a decision that is holding the clock', () => {
    // The card can be open *before* the event arrives — opening it is already
    // suppressed the other way round — so this is the case that matters.
    expect(keysCardOwnsScreen(modals({ keys: true, event: true }))).toBe(false);
    expect(keysCardOwnsScreen(modals({ keys: true, session: true }))).toBe(false);
  });

  it('yields to every other modal, not just the blocking two', () => {
    for (const key of ['ended', 'hire', 'philosophy', 'quarter'] as const) {
      expect(keysCardOwnsScreen(modals({ keys: true, [key]: true }))).toBe(false);
    }
  });

  it('stays hidden when it was never opened', () => {
    expect(keysCardOwnsScreen(modals())).toBe(false);
  });
});
