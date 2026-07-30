import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { bus } from './sim/bus';
import { MS_PER_GAME_MINUTE } from './sim/balance';
import { Game, type NewGameOptions } from './sim/engine';
import type { GameAction, GameState } from './sim/types';
import { hasSave, loadGame, loadLegacy, pushAutosave, saveGame, saveLegacy } from './sim/save';

/**
 * The bridge between the headless sim and React.
 *
 * The sim mutates its own state in place; this store publishes a monotonically
 * increasing `rev` so selectors re-run. Always read game data through
 * `useSim(selector)` — never hold onto a GameState reference across renders.
 */

export type PanelId =
  | 'schedule'
  | 'clients'
  | 'staff'
  | 'finances'
  | 'programs'
  | 'policies'
  | 'campaign'
  | 'upgrades'
  | 'wall'
  | 'settings'
  | 'log';

export interface UiState {
  panel: PanelId | null;
  selectedClientId?: string;
  selectedTherapistId?: string;
  hireOpen: boolean;
  philosophyOpen: boolean;
  quarterReviewOpen: boolean;
  reflectResult?: import('./sim/types').SessionResult;
  screen: 'title' | 'setup' | 'playing' | 'ended';
}

interface Store {
  game: Game;
  rev: number;
  ui: UiState;

  dispatch: (action: GameAction) => void;
  newGame: (opts?: NewGameOptions) => void;
  loadSaved: () => boolean;
  save: () => void;
  setUi: (patch: Partial<UiState>) => void;
  openPanel: (p: PanelId | null) => void;
}

const legacy = loadLegacy();

export const useStore = create<Store>((set, get) => ({
  game: Game.create({ legacy, skipTutorial: false }, bus),
  rev: 0,
  ui: {
    panel: null,
    hireOpen: false,
    philosophyOpen: false,
    quarterReviewOpen: false,
    screen: 'title',
  },

  dispatch(action) {
    const { game } = get();
    game.dispatch(action);
    set({ rev: get().rev + 1 });
  },

  newGame(opts) {
    const game = Game.create({ ...opts, legacy: loadLegacy() }, bus);
    set({
      game,
      rev: get().rev + 1,
      ui: { ...get().ui, screen: 'playing', panel: null },
    });
    saveGame(game.state, 'New run');
  },

  loadSaved() {
    const state = loadGame();
    if (!state) return false;
    set({
      game: new Game(state, bus),
      rev: get().rev + 1,
      ui: { ...get().ui, screen: 'playing', panel: null },
    });
    return true;
  },

  save() {
    const { game } = get();
    saveGame(game.state);
    pushAutosave(game.state);
    saveLegacy(game.state.legacy);
  },

  setUi(patch) {
    set({ ui: { ...get().ui, ...patch } });
  },

  openPanel(p) {
    set({ ui: { ...get().ui, panel: get().ui.panel === p ? null : p } });
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Reading the sim
// ─────────────────────────────────────────────────────────────────────────────

/** Subscribe to a derived value from the sim state. Re-renders only when it changes. */
export function useSim<T>(selector: (s: GameState) => T): T {
  return useStore((st) => {
    void st.rev; // establish the dependency on the revision counter
    return selector(st.game.state);
  });
}

/** Same, but with shallow comparison — use for arrays and objects. */
export function useSimShallow<T>(selector: (s: GameState) => T): T {
  return useStore(
    useShallow((st: Store) => {
      void st.rev;
      return selector(st.game.state);
    }),
  );
}

export function useDispatch() {
  return useStore((s) => s.dispatch);
}

export function useUi<T>(selector: (u: UiState) => T): T {
  return useStore((s) => selector(s.ui));
}

/** Escape hatch for imperative reads (Pixi scene, audio) — never call in render. */
export function getSim(): GameState {
  return useStore.getState().game.state;
}

export function dispatch(action: GameAction): void {
  useStore.getState().dispatch(action);
}

export function saveNow(): void {
  useStore.getState().save();
}

export function savedGameExists(): boolean {
  return hasSave();
}

// ─────────────────────────────────────────────────────────────────────────────
// The clock loop
// ─────────────────────────────────────────────────────────────────────────────

let rafId: number | null = null;
let lastTs = 0;
let accumulator = 0;
let lastAutosaveDay = 0;

function frame(ts: number): void {
  rafId = requestAnimationFrame(frame);
  const st = useStore.getState();
  const s = st.game.state;

  if (!lastTs) lastTs = ts;
  const dtMs = Math.min(250, ts - lastTs);
  lastTs = ts;

  if (st.ui.screen !== 'playing') return;
  if (s.paused || s.dayPhase !== 'running' || s.pendingEvents.length) {
    // Still publish occasionally so paused UI (e.g. hover previews) stays live.
    return;
  }

  accumulator += (dtMs / MS_PER_GAME_MINUTE) * s.speed;
  if (accumulator >= 1) {
    const whole = Math.floor(accumulator);
    accumulator -= whole;
    st.dispatch({ type: 'TICK', dtMinutes: whole });
  }

  if (s.day !== lastAutosaveDay && s.dayPhase === 'running') {
    lastAutosaveDay = s.day;
    pushAutosave(s);
    saveGame(s, `Day ${s.day}`);
  }
}

export function startClock(): void {
  if (rafId !== null) return;
  lastTs = 0;
  rafId = requestAnimationFrame(frame);
}

export function stopClock(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

/** Keeps React honest about sim events that don't come from a dispatch. */
bus.onAny(() => {
  const st = useStore.getState();
  useStore.setState({ rev: st.rev + 1 });
});
