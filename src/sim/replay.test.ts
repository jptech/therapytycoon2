import { describe, it, expect } from 'vitest';
import { REPLAY_FORMAT, SAVE_VERSION } from './balance';
import { Game, createInitialState } from './engine';
import {
  Recorder,
  parseReplay,
  replay,
  replayStamp,
  serializeReplay,
  stateFingerprint,
  type ReplayLog,
} from './replay';
import { exportSave, importSave } from './save';
import type { GameAction, GameState } from './types';

/**
 * Replay is the debugging promise the whole architecture is making: the sim is
 * a pure function of (state, action, rng), therefore a list of actions is a
 * complete description of a run. These tests are what keep that true.
 */

// ─────────────────────────────────────────────────────────────────────────────
// A recorded run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drives a game the way a player would — everything through dispatch, nothing
 * reaching into the sim — and keeps the action log as it goes.
 */
function recordRun(seed: number, days: number): { game: Game; log: ReplayLog } {
  const opts = { seed, skipTutorial: true };
  const game = Game.create(opts);
  const s = game.state;
  const recorder = Recorder.forNewGame(opts, s);

  const act = (action: GameAction) => {
    const at = replayStamp(s);
    game.dispatch(action);
    recorder.record(action, at, s);
  };

  const resolvePending = () => {
    let guard = 0;
    while (s.pendingEvents.length && guard++ < 60) {
      const p = s.pendingEvents[0];
      if (p.techniqueCards?.length) {
        act({ type: 'CHOOSE_TECHNIQUE', instanceId: p.instanceId, techniqueId: p.techniqueCards[0].techniqueId });
      } else {
        act({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      }
    }
  };

  let guard = 0;
  while (s.day <= days && !s.ended && guard++ < days * 4000) {
    if (s.pendingEvents.length) {
      resolvePending();
      continue;
    }
    if (s.dayPhase === 'morning_brief') {
      for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
        act({ type: 'ACCEPT_CLIENT', clientId: c.id });
      }
      act({ type: 'AUTOFILL_SCHEDULE' });
      act({ type: 'START_DAY' });
      continue;
    }
    if (s.dayPhase === 'running') {
      act({ type: 'TICK', dtMinutes: 10 });
      continue;
    }
    act({ type: 'END_DAY' });
  }

  return { game, log: recorder.snapshot(s, 0) };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('stateFingerprint', () => {
  it('agrees with itself and disagrees with a different seed', () => {
    const a = createInitialState({ seed: 31, skipTutorial: true });
    const b = createInitialState({ seed: 31, skipTutorial: true });
    const c = createInitialState({ seed: 32, skipTutorial: true });

    expect(stateFingerprint(a)).toBe(stateFingerprint(b));
    expect(stateFingerprint(a)).not.toBe(stateFingerprint(c));
  });

  it('notices a single changed number anywhere it looks', () => {
    const base = createInitialState({ seed: 77, skipTutorial: true });
    const before = stateFingerprint(base);

    const nudge = (mutate: (s: GameState) => void) => {
      const s = JSON.parse(JSON.stringify(base)) as GameState;
      mutate(s);
      return stateFingerprint(s);
    };

    expect(nudge((s) => (s.cash += 1))).not.toBe(before);
    expect(nudge((s) => (s.clients[0].progress += 0.001))).not.toBe(before);
    expect(nudge((s) => (s.therapists[0].morale += 1))).not.toBe(before);
    expect(nudge((s) => (s.rng.a += 1))).not.toBe(before);
    expect(nudge((s) => (s.upgrades.push('up_ghost')))).not.toBe(before);
    expect(nudge((s) => (s.flags.mood = 'strange'))).not.toBe(before);
    expect(nudge((s) => (s.log[0].text = 'a different opening line'))).not.toBe(before);
  });

  it('does not flinch when a collection is merely reordered', () => {
    const s = createInitialState({ seed: 99, skipTutorial: true });
    const before = stateFingerprint(s);
    s.clients.reverse();
    expect(stateFingerprint(s)).toBe(before);
  });

  it('survives a save round trip — a restored run fingerprints identically', () => {
    const { game } = recordRun(1212, 12);
    const restored = importSave(exportSave(game.state))!;
    expect(stateFingerprint(restored)).toBe(stateFingerprint(game.state));
  });
});

describe('recording and replaying', () => {
  it('replays a recorded run to an identical fingerprint', () => {
    const { game, log } = recordRun(4242, 20);
    const result = replay(log);

    expect(result.divergence).toBeUndefined();
    expect(result.verified).toBe(log.checkpoints.length);
    expect(stateFingerprint(result.state)).toBe(stateFingerprint(game.state));
    expect(result.state.day).toBe(game.state.day);
    expect(result.state.cash).toBe(game.state.cash);
    expect(result.state.stats.sessionsRun).toBe(game.state.stats.sessionsRun);
    expect(result.state.rng).toEqual(game.state.rng);
    // Down to the last string, which is what the idSeq fix bought.
    expect(result.state.log.map((l) => l.id)).toEqual(game.state.log.map((l) => l.id));
  });

  it('run-length encodes ticks without changing what they do', () => {
    const { log } = recordRun(808, 10);
    const ticks = log.entries.filter((e) => e.action.type === 'TICK');
    const dispatches = log.entries.reduce((a, e) => a + (e.n ?? 1), 0);

    expect(ticks.some((e) => (e.n ?? 1) > 1)).toBe(true);
    // The whole point: far fewer entries than actions, and still exact.
    expect(log.entries.length).toBeLessThan(dispatches / 2);
    expect(replay(log).divergence).toBeUndefined();
  });

  it('stamps every entry with the day it was dispatched on', () => {
    const { log } = recordRun(55, 8);
    expect(log.entries.length).toBeGreaterThan(0);
    for (const e of log.entries) {
      expect(e.day).toBeGreaterThanOrEqual(1);
      expect(e.minute).toBeGreaterThanOrEqual(0);
      expect(['morning_brief', 'running', 'day_end']).toContain(e.phase);
    }
    // Days only ever move forward through the log.
    const days = log.entries.map((e) => e.day);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it('stops where --until asks it to', () => {
    const { log } = recordRun(606, 20);
    const partial = replay(log, { untilDay: 8 });

    expect(partial.divergence).toBeUndefined();
    expect(partial.state.day).toBeLessThanOrEqual(9);
    expect(partial.entriesPlayed).toBeLessThan(log.entries.length);
    expect(partial.state.stats.sessionsRun).toBeGreaterThan(0);
  });

  it('freezes the starting conditions, so later legacy spending cannot rewrite them', () => {
    // `createInitialState` does `legacy: opts.legacy ?? {…}` — no copy — so the
    // live state shares the caller's legacy object. `retire()` banks points into
    // it and the end screen's `spendLegacy` appends to `spent`. If the recorder
    // held that object rather than a copy, those writes would retroactively
    // change what the log claims the run started from, and it would replay with
    // perks the run never had: a fabricated divergence at entry -1, in the one
    // moment the tool exists to be trusted.
    const legacy: GameState['legacy'] = { points: 40, spent: [], runsCompleted: 1 };
    const opts = { seed: 5150, skipTutorial: true, legacy };
    const game = Game.create(opts);
    const s = game.state;
    const recorder = Recorder.forNewGame(opts, s);

    const act = (action: GameAction) => {
      const at = replayStamp(s);
      game.dispatch(action);
      recorder.record(action, at, s);
    };
    act({ type: 'AUTOFILL_SCHEDULE' });
    act({ type: 'START_DAY' });
    for (let i = 0; i < 8; i++) act({ type: 'TICK', dtMinutes: 10 });

    const log = recorder.snapshot(s, 0);
    const originLegacy = JSON.stringify((log.origin as { options: { legacy?: unknown } }).options.legacy);
    expect(replay(log).divergence).toBeUndefined();

    // Exactly what EndScreen.spendLegacy and retire() do to the live state.
    s.legacy.spent = [...s.legacy.spent, 'legacy_nest_egg'];
    s.legacy.points += 25;

    // The log already taken is unchanged...
    expect(JSON.stringify((log.origin as { options: { legacy?: unknown } }).options.legacy)).toBe(originLegacy);
    expect(replay(log).divergence).toBeUndefined();

    // ...and so is one taken afterwards, from the same recorder.
    const later = recorder.snapshot(s, 0);
    expect(JSON.stringify((later.origin as { options: { legacy?: unknown } }).options.legacy)).toBe(originLegacy);
    expect(replay(later).divergence).toBeUndefined();
  });

  it('replays a run that was resumed from a save', () => {
    const { game } = recordRun(313, 10);
    const resumed = new Game(importSave(exportSave(game.state))!);
    const recorder = Recorder.forLoadedState(resumed.state);

    for (let i = 0; i < 30; i++) {
      const at = replayStamp(resumed.state);
      const action: GameAction = { type: 'TICK', dtMinutes: 10 };
      resumed.dispatch(action);
      recorder.record(action, at, resumed.state);
    }

    const log = recorder.snapshot(resumed.state, 0);
    expect(log.origin.kind).toBe('state');
    const result = replay(log);
    expect(result.divergence).toBeUndefined();
    expect(stateFingerprint(result.state)).toBe(stateFingerprint(resumed.state));
  });
});

describe('a tampered log', () => {
  it('diverges, and says which day it happened on', () => {
    const { log } = recordRun(1717, 24);
    expect(replay(log).divergence).toBeUndefined();

    // Nudge one decision in the middle of the run and nothing else.
    const i = log.entries.findIndex(
      (e, idx) => idx > log.entries.length / 3 && e.action.type === 'ACCEPT_CLIENT',
    );
    expect(i).toBeGreaterThan(0);
    const tamperedDay = log.entries[i].day;
    const tampered: ReplayLog = {
      ...log,
      entries: log.entries.map((e, idx) => (idx === i ? { ...e, action: { type: 'TOGGLE_PAUSE' } } : e)),
    };

    const result = replay(tampered);
    expect(result.divergence).toBeDefined();
    expect(result.divergence!.expected).not.toBe(result.divergence!.actual);
    // The first checkpoint after the edit is the one that catches it, so the
    // report lands on the tampered day or the one immediately after.
    expect(result.divergence!.day).toBeGreaterThanOrEqual(tamperedDay);
    expect(result.divergence!.day).toBeLessThanOrEqual(tamperedDay + 1);
    // And it stops there rather than reporting nonsense from downstream.
    expect(result.entriesPlayed).toBeLessThan(log.entries.length);
  });

  it('catches a log whose starting options were edited, before dispatching anything', () => {
    const { log } = recordRun(2323, 6);
    const wrongSeed: ReplayLog = {
      ...log,
      origin: { kind: 'new', options: { ...(log.origin as { options: object }).options, seed: 2324 } },
    };
    const result = replay(wrongSeed);
    expect(result.divergence).toBeDefined();
    expect(result.divergence!.entryIndex).toBe(-1);
    expect(result.divergence!.dispatched).toBe(0);
  });

  it('catches a dropped action', () => {
    const { log } = recordRun(2929, 16);
    const i = log.entries.findIndex((e, idx) => idx > 20 && e.action.type === 'AUTOFILL_SCHEDULE');
    expect(i).toBeGreaterThan(0);
    const result = replay({ ...log, entries: log.entries.filter((_, idx) => idx !== i) });
    expect(result.divergence).toBeDefined();
  });
});

describe('serialize / parse', () => {
  it('round-trips a log unchanged, and the parsed copy still replays', () => {
    const { game, log } = recordRun(3131, 14);
    const parsed = parseReplay(serializeReplay(log));

    expect(parsed).toBeDefined();
    expect(parsed!.format).toBe(REPLAY_FORMAT);
    expect(parsed!.saveVersion).toBe(SAVE_VERSION);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(log));

    const result = replay(parsed!);
    expect(result.divergence).toBeUndefined();
    expect(stateFingerprint(result.state)).toBe(stateFingerprint(game.state));
  });

  it('returns undefined for anything that is not a replay log', () => {
    const bad = ['', 'not json', '{', 'null', '[]', '42', '{"entries":[]}', '{"format":1}'];
    for (const input of bad) {
      let out: ReplayLog | undefined;
      expect(() => {
        out = parseReplay(input);
      }, input).not.toThrow();
      expect(out, input).toBeUndefined();
    }
  });

  it('rejects a save file, which is the easy thing to hand it by mistake', () => {
    const { game } = recordRun(4141, 4);
    expect(parseReplay(exportSave(game.state))).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The determinism wart replay depends on
// ─────────────────────────────────────────────────────────────────────────────

describe('id minting', () => {
  it('two same-seed games in one process produce byte-identical state', () => {
    // This is the guarantee the old process-global log counter quietly broke:
    // everything agreed except the ids, because the second game inherited
    // whatever the first had counted to. A whole-state diff needs this.
    const a = recordRun(6161, 8).game.state;
    const b = recordRun(6161, 8).game.state;

    expect(b.log.map((l) => l.id)).toEqual(a.log.map((l) => l.id));
    expect(b.idSeq).toBe(a.idSeq);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('ids stay unique across a run, including over a day boundary', () => {
    const { game } = recordRun(7171, 12);
    const ids = game.state.log.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(game.state.log.map((l) => l.day)).size).toBeGreaterThan(1);
  });

  it('a save round trip carries the counter, so restored runs keep minting fresh ids', () => {
    const { game } = recordRun(8181, 10);
    const restored = new Game(importSave(exportSave(game.state))!);
    expect(restored.state.idSeq).toBe(game.state.idSeq);

    const before = new Set(restored.state.log.map((l) => l.id));
    // Autofill always says what it did, so it is a reliable way to mint lines.
    for (let i = 0; i < 5; i++) restored.dispatch({ type: 'AUTOFILL_SCHEDULE' });
    const minted = restored.state.log.map((l) => l.id).filter((id) => !before.has(id));
    expect(minted.length).toBeGreaterThan(0);
    expect(new Set(restored.state.log.map((l) => l.id)).size).toBe(restored.state.log.length);
  });
});
