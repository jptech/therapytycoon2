import { SAVE_VERSION } from './balance';
import { DEFAULT_POLICIES } from './scheduler';
import type { GameState } from './types';

const KEY = 'tt2:save';
const RING_KEY = 'tt2:autosave-ring';
const LEGACY_KEY = 'tt2:legacy';
const RING_SIZE = 5;

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  label: string;
  state: GameState;
}

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations run in order from the save's version up to SAVE_VERSION. Each one
 * takes the raw parsed object and returns it upgraded by exactly one version.
 */
const MIGRATIONS: Record<number, Migration> = {
  1: (s) => {
    // v1 → v2: policies and campaign were added.
    s.policies ??= DEFAULT_POLICIES.map((p) => ({ ...p }));
    s.campaign ??= { stageIndex: 0, completed: [], accredited: false };
    return s;
  },
  2: (s) => {
    // v2 → v3: seasons.
    s.quarter ??= 1;
    s.year ??= 1;
    s.milestonesEarned ??= [];
    return s;
  },
  3: (s) => {
    // v3 → v4: settings block and legacy meta.
    s.settings ??= {
      calmMode: false,
      reducedMotion: false,
      sound: true,
      music: true,
      volume: 0.6,
      autoPauseOnEvent: true,
      showAdvancedNumbers: false,
    };
    s.legacy ??= { points: 0, spent: [], runsCompleted: 0 };
    s.alumni ??= [];
    return s;
  },
  4: (s) => {
    // v4 → v5: per-event cooldowns so random texture stops repeating.
    s.eventCooldowns ??= {};
    return s;
  },
};

export function migrate(raw: Record<string, unknown>): GameState {
  let v = Number(raw.version ?? 1);
  let s = raw;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) break;
    s = m(s);
    v += 1;
    s.version = v;
  }
  // Defensive fill for anything a hand-edited save might be missing.
  s.toasts ??= [];
  s.pendingEvents ??= [];
  s.queuedEvents ??= [];
  s.firedOnce ??= [];
  s.eventCooldowns ??= {};
  s.flags ??= {};
  s.candidates ??= [];
  s.programs ??= [];
  s.upgrades ??= [];
  s.log ??= [];
  return s as unknown as GameState;
}

function storage(): Storage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

export function saveGame(state: GameState, label = 'Manual save'): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const env: SaveEnvelope = { version: SAVE_VERSION, savedAt: Date.now(), label, state };
    store.setItem(KEY, JSON.stringify(env));
    return true;
  } catch (err) {
    console.warn('[save] failed', err);
    return false;
  }
}

export function loadGame(): GameState | undefined {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return undefined;
    const env = JSON.parse(raw) as SaveEnvelope;
    return migrate(env.state as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn('[save] load failed', err);
    return undefined;
  }
}

export function hasSave(): boolean {
  return !!storage()?.getItem(KEY);
}

export function clearSave(): void {
  const store = storage();
  store?.removeItem(KEY);
  store?.removeItem(RING_KEY);
}

/** Rolling autosave buffer so a bad decision is always recoverable. */
export function pushAutosave(state: GameState): void {
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(RING_KEY);
    const ring: SaveEnvelope[] = raw ? JSON.parse(raw) : [];
    ring.unshift({
      version: SAVE_VERSION,
      savedAt: Date.now(),
      label: `Day ${state.day}`,
      state,
    });
    while (ring.length > RING_SIZE) ring.pop();
    store.setItem(RING_KEY, JSON.stringify(ring));
  } catch (err) {
    console.warn('[save] autosave failed', err);
  }
}

export function listAutosaves(): { label: string; savedAt: number; index: number }[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(RING_KEY);
    if (!raw) return [];
    const ring: SaveEnvelope[] = JSON.parse(raw);
    return ring.map((e, index) => ({ label: e.label, savedAt: e.savedAt, index }));
  } catch {
    return [];
  }
}

export function loadAutosave(index: number): GameState | undefined {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(RING_KEY);
    if (!raw) return undefined;
    const ring: SaveEnvelope[] = JSON.parse(raw);
    const env = ring[index];
    return env ? migrate(env.state as unknown as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// ── Legacy (meta-progression across runs) ───────────────────────────────────

export function loadLegacy(): GameState['legacy'] {
  const store = storage();
  const fallback = { points: 0, spent: [], runsCompleted: 0 };
  if (!store) return fallback;
  try {
    const raw = store.getItem(LEGACY_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveLegacy(legacy: GameState['legacy']): void {
  storage()?.setItem(LEGACY_KEY, JSON.stringify(legacy));
}

// ── Export / import as a file ───────────────────────────────────────────────

export function exportSave(state: GameState): string {
  const env: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    label: `${state.practiceName} — Day ${state.day}`,
    state,
  };
  return JSON.stringify(env, null, 2);
}

export function importSave(json: string): GameState | undefined {
  try {
    const env = JSON.parse(json) as SaveEnvelope;
    if (!env?.state) return undefined;
    return migrate(env.state as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn('[save] import failed', err);
    return undefined;
  }
}

export function downloadSave(state: GameState): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([exportSave(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `therapy-tycoon-${state.practiceName.toLowerCase().replace(/\W+/g, '-')}-day${state.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
