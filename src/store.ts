import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { bus } from './sim/bus';
import { MS_PER_GAME_MINUTE } from './sim/balance';
import { Game, type NewGameOptions } from './sim/engine';
import { Recorder, downloadReplay, replayStamp, type ReplayLog } from './sim/replay';
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
  /** Adopt an already-migrated state — used by save import and autosave restore. */
  loadState: (state: GameState) => void;
  save: () => void;
  setUi: (patch: Partial<UiState>) => void;
  openPanel: (p: PanelId | null) => void;
}

const legacy = loadLegacy();

const BOOT_OPTIONS: NewGameOptions = { legacy, skipTutorial: false };
const bootGame = Game.create(BOOT_OPTIONS, bus);

/**
 * Every dispatch of the current run, kept so a bug report can be replayed
 * exactly. It costs a type comparison and usually an integer increment per
 * action — see src/sim/replay.ts for why ticks are counted rather than summed.
 * One recorder per run; adopting a save starts a new one from that state.
 */
let recorder = Recorder.forNewGame(BOOT_OPTIONS, bootGame.state);

export const useStore = create<Store>((set, get) => ({
  game: bootGame,
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
    // Stamped before the dispatch so a divergence names the day you were on,
    // not the day the action carried you into.
    const at = replayStamp(game.state);
    game.dispatch(action);
    recorder.record(action, at, game.state);
    set({ rev: get().rev + 1 });
  },

  newGame(opts) {
    const resolved: NewGameOptions = { ...opts, legacy: loadLegacy() };
    const game = Game.create(resolved, bus);
    recorder = Recorder.forNewGame(resolved, game.state);
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
    recorder = Recorder.forLoadedState(state);
    set({
      game: new Game(state, bus),
      rev: get().rev + 1,
      ui: { ...get().ui, screen: 'playing', panel: null },
    });
    return true;
  },

  loadState(state) {
    recorder = Recorder.forLoadedState(state);
    set({
      game: new Game(state, bus),
      rev: get().rev + 1,
      ui: { ...get().ui, screen: 'playing', panel: null, reflectResult: undefined },
    });
    saveGame(state, `Day ${state.day}`);
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

/**
 * Re-exported so UI code has one import site. The definitions live in the sim
 * because they are a liveness contract — see src/sim/pending.ts.
 */
export { isStuck, pendingChoice, pendingDecision } from './sim/pending';

export function dispatch(action: GameAction): void {
  useStore.getState().dispatch(action);
}

export function saveNow(): void {
  useStore.getState().save();
}

export function savedGameExists(): boolean {
  return hasSave();
}

/**
 * The current run as a replayable action log. Snapshotting closes it with a
 * fingerprint of right now, so the log verifies all the way to this instant
 * rather than only to the last midnight.
 */
export function replayLog(): ReplayLog {
  return recorder.snapshot(useStore.getState().game.state, Date.now());
}

/** Save the current run's action log to disk. Used by the crash screen. */
export function downloadReplayLog(): void {
  const state = useStore.getState().game.state;
  downloadReplay(recorder.snapshot(state, Date.now()), state.practiceName);
}

/** Adopt a state produced by importSave / loadAutosave. Returns false if unusable. */
export function adoptState(state: GameState | undefined): boolean {
  if (!state) return false;
  useStore.getState().loadState(state);
  return true;
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

// Dev-only inspection handle. The sim is deterministic and its whole state is
// one object, so being able to read it from the console is the fastest way to
// diagnose "the game is stuck" without adding logging everywhere.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__tt = {
    get state() {
      return useStore.getState().game.state;
    },
    get ui() {
      return useStore.getState().ui;
    },
    dispatch,
    store: useStore,
    /** The run so far as an action log — `__tt.replay` to read, `__tt.saveReplay()` to keep. */
    get replay() {
      return replayLog();
    },
    saveReplay: downloadReplayLog,
  };
}

/** Keeps React honest about sim events that don't come from a dispatch. */
bus.onAny(() => {
  const st = useStore.getState();
  useStore.setState({ rev: st.rev + 1 });
});
