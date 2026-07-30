/**
 * Recording and replaying a run.
 *
 * The simulation is a pure function of (state, action, rng), so a run is fully
 * described by the options it started from plus the ordered list of actions
 * dispatched into it. That makes a bug report reproducible: hand over the log,
 * replay it, and the same day falls over in the same way.
 *
 * Two things make that promise stick rather than merely sound true:
 *
 *   1. Ticks are run-length encoded, never summed. `TICK 1` twice is not the
 *      same as `TICK 2` — the session loop reads thresholds off `state.minute`,
 *      so a coarser step can start two sessions in one pass and draw their
 *      variance in schedule order instead of clock order. Recording `{n: 240}`
 *      re-dispatches the identical sequence and collapses a day's ~600 ticks
 *      into a handful of entries.
 *
 *   2. Fingerprints are stamped at every day boundary, so a replay that drifts
 *      can say *when* rather than merely *that* it drifted.
 */
import { REPLAY_FORMAT, REPLAY_MAX_ENTRIES, SAVE_VERSION } from './balance';
import { Game, type NewGameOptions } from './engine';
import { EventBus } from './bus';
import { migrate } from './save';
import type { GameAction, GameState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The log format
// ─────────────────────────────────────────────────────────────────────────────

/** Where the recorded run began. */
export type ReplayOrigin =
  /** A fresh game — the common case, and the small one. */
  | { kind: 'new'; options: NewGameOptions }
  /**
   * A run resumed from a save or an autosave. There is no seed that reproduces
   * a mid-run state, so the state itself rides along. Larger, but a player who
   * loaded yesterday's practice and then hit a bug still gets a replayable log.
   */
  | { kind: 'state'; state: GameState };

/** One dispatch, or a run of identical consecutive dispatches. */
export interface ReplayEntry {
  /** Sim day the action was dispatched on. */
  day: number;
  /** Minute within the working day. */
  minute: number;
  phase: GameState['dayPhase'];
  action: GameAction;
  /** Repeat count. Absent means 1. Only ever set for runs of identical ticks. */
  n?: number;
}

/** A stamp of the truth at a point in the log, used to locate drift. */
export interface ReplayCheckpoint {
  /**
   * Index of the entry this fingerprint follows, so `-1` is the state as
   * created, before anything was dispatched.
   */
  entryIndex: number;
  day: number;
  fingerprint: string;
}

export interface ReplayLog {
  /** Shape of this file. See REPLAY_FORMAT. */
  format: number;
  /** Save version of the build that recorded it — a mismatch is worth saying. */
  saveVersion: number;
  /** Wall-clock ms, stamped by whoever took the snapshot. Never read by the sim. */
  recordedAt?: number;
  label: string;
  origin: ReplayOrigin;
  entries: ReplayEntry[];
  checkpoints: ReplayCheckpoint[];
  /** True when the recorder hit its ceiling and stopped appending. */
  truncated?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fingerprinting
// ─────────────────────────────────────────────────────────────────────────────

function fnv1a(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Folds a collection commutatively, so the digest depends on what is in the
 * state rather than on the order a list happens to hold it in. Collections do
 * get reordered — clients are filtered and re-pushed, the log unshifts — and a
 * fingerprint that flinched at that would cry wolf.
 */
function foldSet(parts: string[]): number {
  let x = 0;
  let sum = 0;
  for (const p of parts) {
    const h = fnv1a(p);
    x ^= h;
    sum = (sum + h) >>> 0;
  }
  return (Math.imul(x, 0x9e3779b1) ^ sum) >>> 0;
}

const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');

/**
 * A cheap, stable digest of everything about a run that a replay is supposed to
 * reproduce. Deliberately not a hash of the whole state: `stats.history` grows
 * without bound and pending-event bodies are re-derived prose, so both would
 * cost more than they catch. Everything that carries a decision is in here.
 */
export function stateFingerprint(state: GameState): string {
  const scalars = [
    state.day,
    state.minute,
    state.dayPhase,
    state.paused,
    state.act,
    state.difficulty,
    state.seed,
    state.rng.a,
    state.rng.b,
    state.rng.c,
    state.rng.d,
    state.idSeq,
    state.cash,
    state.xp,
    state.practiceLevel,
    state.reputation,
    state.communityTrust,
    state.quarter,
    state.year,
    state.philosophy ?? '',
    state.tutorialStep,
    state.campaign.stageIndex,
    state.campaign.accredited,
    state.ended?.kind ?? '',
    state.log.length,
    state.pendingEvents.length,
  ].join('|');

  const st = state.stats;
  const stats = [
    st.sessionsRun,
    st.cures,
    st.complexCures,
    st.dropouts,
    st.breakthroughs,
    st.regressions,
    st.burnouts,
    st.totalRevenue,
    st.totalExpenses,
    st.qualitySum,
    st.qualityCount,
    st.maxStreak,
    st.hires,
    st.departures,
  ].join('|');

  const words = [
    fnv1a(scalars),
    fnv1a(stats),
    foldSet(
      state.therapists.map((t) =>
        [t.id, t.skill, t.energy, t.morale, t.xp, t.level, t.strain, t.status, t.salary, t.techniques.length].join(','),
      ),
    ),
    foldSet(
      state.clients.map((c) =>
        [c.id, c.status, c.progress, c.stability, c.rapport, c.resilience, c.patience, c.chapter, c.sessionsAttended].join(','),
      ),
    ),
    foldSet(state.alumni.map((a) => `${a.id},${a.curedDay},${a.sessions}`)),
    foldSet(state.schedule.map((x) => [x.id, x.slot, x.status, x.focus, x.techniqueUsed ?? ''].join(','))),
    foldSet(state.programs.map((p) => `${p.id},${p.active},${p.progressDays},${p.lifetimeCash}`)),
    foldSet(state.candidates.map((c) => `${c.therapist.id},${c.askingSalary},${c.expiresInDays}`)),
    foldSet(state.upgrades),
    foldSet(state.milestonesEarned),
    foldSet(state.firedOnce),
    foldSet(Object.entries(state.flags).map(([k, v]) => `${k}=${String(v)}`)),
    foldSet(state.pendingEvents.map((p) => `${p.def.id},${p.instanceId}`)),
    foldSet(state.log.map((l) => `${l.id},${l.day},${l.kind},${l.text}`)),
  ];

  return words.map(hex).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────

/** The stamp taken *before* a dispatch, so a divergence names the day you were on. */
export function replayStamp(state: GameState): Pick<ReplayEntry, 'day' | 'minute' | 'phase'> {
  return { day: state.day, minute: state.minute, phase: state.dayPhase };
}

/** Two dispatches that may be collapsed into one entry with a repeat count. */
function coalescable(a: GameAction, b: GameAction): boolean {
  // Ticks only. Every action repeats losslessly by construction, but folding
  // the interesting ones would make the log unreadable for the person it is
  // meant to help, and ticks are the entire volume problem.
  return a.type === 'TICK' && b.type === 'TICK' && a.dtMinutes === b.dtMinutes;
}

/**
 * Appends every dispatch of one run. Cheap on purpose — this sits in the hot
 * path of the clock loop, so the per-action cost is a type comparison and,
 * usually, one integer increment.
 */
export class Recorder {
  private origin: ReplayOrigin;
  private entries: ReplayEntry[] = [];
  private checkpoints: ReplayCheckpoint[] = [];
  private lastCheckpointDay: number;
  private truncated = false;
  /** Set after a checkpoint so the next tick starts a fresh run rather than
   *  extending one the checkpoint already sits behind. */
  private sealed = true;
  private label: string;

  constructor(origin: ReplayOrigin, initial: GameState, label?: string) {
    this.origin = origin;
    this.label = label ?? `${initial.practiceName} — from day ${initial.day}`;
    this.lastCheckpointDay = initial.day;
    this.checkpoints.push({ entryIndex: -1, day: initial.day, fingerprint: stateFingerprint(initial) });
  }

  /** A recorder for a game that started fresh from `opts`. */
  static forNewGame(opts: NewGameOptions, initial: GameState): Recorder {
    // The seed and legacy carried by the state are the *resolved* ones — a
    // caller that passed no seed still gets a log that reproduces exactly.
    //
    // Deep-copied, like `forLoadedState`, because `createInitialState` does
    // `legacy: opts.legacy ?? {…}` — no copy — so `initial.legacy` *is* the
    // caller's object, and the live state's. `retire()` adds points to it and
    // the end screen's `spendLegacy` appends to `spent`. Held by reference,
    // those later writes would rewrite the recorded starting conditions after
    // the fact, and the log would replay with perks the run never had — a
    // fabricated divergence at entry -1, blaming the person filing the report.
    return new Recorder(
      { kind: 'new', options: clone({ ...opts, seed: initial.seed, legacy: initial.legacy }) },
      initial,
    );
  }

  /** A recorder for a run picked up mid-flight from a save. */
  static forLoadedState(state: GameState): Recorder {
    return new Recorder({ kind: 'state', state: clone(state) }, state);
  }

  get length(): number {
    return this.entries.length;
  }

  /** Call once per dispatch, with the stamp taken before and the state after. */
  record(action: GameAction, at: Pick<ReplayEntry, 'day' | 'minute' | 'phase'>, after: GameState): void {
    if (this.truncated) return;
    if (this.entries.length >= REPLAY_MAX_ENTRIES) {
      this.truncated = true;
      return;
    }

    const tail = this.entries[this.entries.length - 1];
    if (!this.sealed && tail && coalescable(tail.action, action)) {
      tail.n = (tail.n ?? 1) + 1;
    } else {
      this.entries.push({ ...at, action });
      this.sealed = false;
    }

    if (after.day !== this.lastCheckpointDay) {
      this.lastCheckpointDay = after.day;
      this.checkpoint(after);
    }
  }

  /** Stamp the current truth at the tail of the log. */
  checkpoint(state: GameState): void {
    this.checkpoints.push({
      entryIndex: this.entries.length - 1,
      day: state.day,
      fingerprint: stateFingerprint(state),
    });
    this.sealed = true;
  }

  /**
   * The log as it stands. Takes the live state so it can close with a final
   * fingerprint — without one, a crash mid-day would verify only up to
   * midnight, which is precisely the part that was working.
   */
  snapshot(state: GameState, recordedAt?: number): ReplayLog {
    const last = this.checkpoints[this.checkpoints.length - 1];
    // A truncated log stopped recording somewhere behind the live state, so a
    // closing fingerprint would be stamped against actions the log never kept —
    // and the replay would report a divergence that is really just the missing
    // tail. Verify what we have, and let the `truncated` flag say the rest.
    if (!this.truncated && (!last || last.entryIndex !== this.entries.length - 1)) this.checkpoint(state);
    return {
      format: REPLAY_FORMAT,
      saveVersion: SAVE_VERSION,
      recordedAt,
      label: this.label,
      origin: this.origin,
      entries: this.entries.map((e) => ({ ...e })),
      checkpoints: this.checkpoints.map((c) => ({ ...c })),
      ...(this.truncated ? { truncated: true } : {}),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialising
// ─────────────────────────────────────────────────────────────────────────────

export function serializeReplay(log: ReplayLog): string {
  return JSON.stringify(log, null, 2);
}

/** Returns undefined rather than throwing — the input is often a pasted file. */
export function parseReplay(json: string): ReplayLog | undefined {
  try {
    const log = JSON.parse(json) as ReplayLog;
    if (!log || typeof log !== 'object') return undefined;
    if (typeof log.format !== 'number') return undefined;
    if (!Array.isArray(log.entries) || !log.origin) return undefined;
    log.checkpoints ??= [];
    return log;
  } catch (err) {
    console.warn('[replay] parse failed', err);
    return undefined;
  }
}

export function downloadReplay(log: ReplayLog, practiceName = 'run'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([serializeReplay(log)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = log.checkpoints[log.checkpoints.length - 1]?.day ?? 1;
  a.href = url;
  a.download = `therapy-tycoon-replay-${practiceName.toLowerCase().replace(/\W+/g, '-')}-day${day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Replaying
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayDivergence {
  /** The day the run was on when the fingerprints stopped agreeing. */
  day: number;
  entryIndex: number;
  /** Dispatches performed before the mismatch was noticed. */
  dispatched: number;
  expected: string;
  actual: string;
}

export interface ReplayResult {
  game: Game;
  state: GameState;
  /** Individual actions re-dispatched, ticks expanded. */
  dispatched: number;
  /** Entries consumed — fewer than `log.entries.length` if `untilDay` stopped us. */
  entriesPlayed: number;
  /** Checkpoints that matched before we stopped. */
  verified: number;
  divergence?: ReplayDivergence;
}

export interface ReplayOptions {
  /** Stop before the first action recorded after this day. */
  untilDay?: number;
  /** Compare against the recorded fingerprints. On by default when any exist. */
  verify?: boolean;
  /** Supply a bus to narrate the replay the way the real game would. */
  bus?: EventBus;
  /** Called after each matching checkpoint — progress for a long log. */
  onCheckpoint?: (c: ReplayCheckpoint) => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function gameFrom(origin: ReplayOrigin, bus: EventBus): Game {
  if (origin.kind === 'state') {
    return new Game(migrate(clone(origin.state) as unknown as Record<string, unknown>), bus);
  }
  return Game.create({ ...origin.options }, bus);
}

/**
 * Rebuilds the run. Stops at the first checkpoint that disagrees: past that
 * point nothing downstream means anything, and the honest answer is the day it
 * first went wrong.
 */
export function replay(log: ReplayLog, opts: ReplayOptions = {}): ReplayResult {
  const bus = opts.bus ?? new EventBus();
  const game = gameFrom(log.origin, bus);
  const verify = opts.verify ?? log.checkpoints.length > 0;

  // entryIndex → fingerprint, including the -1 stamp of the state as created.
  const expected = new Map<number, ReplayCheckpoint>();
  for (const c of log.checkpoints) expected.set(c.entryIndex, c);

  let dispatched = 0;
  let verified = 0;
  let entriesPlayed = 0;

  const check = (index: number): ReplayDivergence | undefined => {
    if (!verify) return undefined;
    const want = expected.get(index);
    if (!want) return undefined;
    const actual = stateFingerprint(game.state);
    if (actual === want.fingerprint) {
      verified += 1;
      opts.onCheckpoint?.(want);
      return undefined;
    }
    return { day: game.state.day, entryIndex: index, dispatched, expected: want.fingerprint, actual };
  };

  let divergence = check(-1);
  if (divergence) {
    return { game, state: game.state, dispatched, entriesPlayed, verified, divergence };
  }

  for (let i = 0; i < log.entries.length; i++) {
    const entry = log.entries[i];
    if (opts.untilDay !== undefined && entry.day > opts.untilDay) break;
    const times = entry.n ?? 1;
    for (let k = 0; k < times; k++) {
      game.dispatch(entry.action);
      dispatched += 1;
    }
    entriesPlayed = i + 1;
    divergence = check(i);
    if (divergence) break;
  }

  return { game, state: game.state, dispatched, entriesPlayed, verified, divergence };
}
