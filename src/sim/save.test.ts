import { describe, it, expect } from 'vitest';
import { exportSave, importSave, migrate } from './save';
import { SAVE_VERSION } from './balance';
import { Game, capacity } from './engine';
import { activeClients, autofillSchedule } from './scheduler';
import { activeTherapists } from './eventsys';
import type { GameState } from './types';

// ─────────────────────────────────────────────────────────────────────────────

function resolvePending(game: Game, limit = 60): void {
  const s = game.state;
  let guard = 0;
  while (s.pendingEvents.length && guard++ < limit) {
    const p = s.pendingEvents[0];
    if (p.techniqueCards?.length) {
      game.dispatch({
        type: 'CHOOSE_TECHNIQUE',
        instanceId: p.instanceId,
        techniqueId: p.techniqueCards[0].techniqueId,
      });
    } else {
      game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
    }
  }
}

/** Drive a run forward through the public action surface. */
function drive(game: Game, days: number): void {
  const s = game.state;
  let guard = 0;
  while (s.day <= days && !s.ended && guard++ < days * 4000) {
    if (s.pendingEvents.length) {
      resolvePending(game);
      continue;
    }
    if (s.dayPhase === 'morning_brief') {
      for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
        if (activeClients(s).length >= capacity(s)) break;
        game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
      }
      autofillSchedule(s, game.rng);
      game.dispatch({ type: 'START_DAY' });
      continue;
    }
    if (s.dayPhase === 'running') {
      game.dispatch({ type: 'TICK', dtMinutes: 10 });
      continue;
    }
    game.dispatch({ type: 'END_DAY' });
  }
}

function midRunGame(seed: number, days = 20): Game {
  const game = Game.create({ seed, skipTutorial: true });
  drive(game, days);
  return game;
}

describe('exportSave / importSave', () => {
  it('round-trips a mid-run state', () => {
    const game = midRunGame(777);
    const original = game.state;
    expect(original.day).toBeGreaterThan(20);
    expect(original.stats.sessionsRun).toBeGreaterThan(10);

    const restored = importSave(exportSave(original));
    expect(restored).toBeDefined();
    const s = restored!;

    expect(s.day).toBe(original.day);
    expect(s.cash).toBe(original.cash);
    expect(s.reputation).toBe(original.reputation);
    expect(s.communityTrust).toBe(original.communityTrust);
    expect(s.practiceLevel).toBe(original.practiceLevel);
    expect(s.xp).toBe(original.xp);
    expect(s.seed).toBe(original.seed);
    expect(s.rng).toEqual(original.rng);

    expect(s.clients.map((c) => c.id)).toEqual(original.clients.map((c) => c.id));
    expect(s.therapists.map((t) => t.id)).toEqual(original.therapists.map((t) => t.id));
    expect(s.alumni.map((a) => a.id)).toEqual(original.alumni.map((a) => a.id));
    expect(s.milestonesEarned).toEqual(original.milestonesEarned);
    expect(s.upgrades).toEqual(original.upgrades);
    expect(s.stats.cures).toBe(original.stats.cures);
    expect(s.stats.sessionsRun).toBe(original.stats.sessionsRun);
  });

  it('writes an envelope carrying the current save version and a readable label', () => {
    const game = midRunGame(778, 5);
    const envelope = JSON.parse(exportSave(game.state)) as {
      version: number;
      label: string;
      state: GameState;
    };
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.label).toContain(game.state.practiceName);
    expect(envelope.state.day).toBe(game.state.day);
  });

  it('a game restored from a round-tripped save continues on the identical rng stream', () => {
    const original = midRunGame(4242);
    const restored = new Game(importSave(exportSave(original.state))!);

    const a = Array.from({ length: 40 }, () => original.rng.next());
    const b = Array.from({ length: 40 }, () => restored.rng.next());
    expect(b).toEqual(a);
  });

  it('a restored game plays out exactly like the original would have', () => {
    const seed = 9191;
    const control = midRunGame(seed);
    const branch = new Game(importSave(exportSave(control.state))!);

    drive(control, control.state.day + 10);
    drive(branch, branch.state.day + 10);

    expect(branch.state.day).toBe(control.state.day);
    expect(branch.state.cash).toBe(control.state.cash);
    expect(branch.state.reputation).toBe(control.state.reputation);
    expect(branch.state.stats.cures).toBe(control.state.stats.cures);
    expect(branch.state.stats.sessionsRun).toBe(control.state.stats.sessionsRun);
    expect(branch.state.rng).toEqual(control.state.rng);
    expect(activeTherapists(branch.state).length).toBe(activeTherapists(control.state).length);
  });

  it('survives a second round trip unchanged', () => {
    const game = midRunGame(555, 10);
    const once = importSave(exportSave(game.state))!;
    const twice = importSave(exportSave(once))!;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe('migrate', () => {
  /** Everything the migration chain is responsible for adding. */
  const MIGRATION_FIELDS = [
    'policies',
    'campaign',
    'quarter',
    'year',
    'milestonesEarned',
    'settings',
    'legacy',
    'alumni',
    'eventCooldowns',
    'idSeq',
  ] as const;

  function v1Shaped(seed = 3131): Record<string, unknown> {
    const game = midRunGame(seed, 6);
    const raw = JSON.parse(JSON.stringify(game.state)) as Record<string, unknown>;
    for (const field of MIGRATION_FIELDS) delete raw[field];
    raw.version = 1;
    return raw;
  }

  it('upgrades a v1-shaped object to the current SAVE_VERSION without throwing', () => {
    const raw = v1Shaped();
    for (const field of MIGRATION_FIELDS) expect(raw[field]).toBeUndefined();

    let migrated!: GameState;
    expect(() => {
      migrated = migrate(raw);
    }).not.toThrow();

    expect(migrated.version).toBe(SAVE_VERSION);
  });

  it('fills in every field the migrations are responsible for', () => {
    const migrated = migrate(v1Shaped(3132));

    expect(Array.isArray(migrated.policies)).toBe(true);
    expect(migrated.policies.length).toBeGreaterThan(0);
    for (const p of migrated.policies) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.kind).toBe('string');
    }

    expect(migrated.campaign).toBeDefined();
    expect(migrated.campaign.stageIndex).toBe(0);
    expect(migrated.campaign.completed).toEqual([]);
    expect(migrated.campaign.accredited).toBe(false);

    expect(migrated.quarter).toBe(1);
    expect(migrated.year).toBe(1);
    expect(migrated.milestonesEarned).toEqual([]);

    expect(migrated.settings).toBeDefined();
    expect(typeof migrated.settings.calmMode).toBe('boolean');
    expect(typeof migrated.settings.volume).toBe('number');

    expect(migrated.legacy).toEqual({ points: 0, spent: [], runsCompleted: 0 });
    expect(migrated.alumni).toEqual([]);
    expect(migrated.eventCooldowns).toEqual({});
    expect(typeof migrated.idSeq).toBe('number');
  });

  it('resumes id minting past the ids an older save already holds', () => {
    // A save from before v6 has log ids from the old process-global counter.
    // Restarting the new counter at zero would mint a second `log_12_3`.
    const raw = v1Shaped(3137);
    const highest = Math.max(
      ...(raw.log as { id: string }[]).map((l) => Number(l.id.split('_').pop())),
    );
    const migrated = migrate(raw);
    expect(migrated.idSeq).toBe(highest + 1);

    const game = new Game(migrated);
    const before = new Set(game.state.log.map((l) => l.id));
    game.dispatch({ type: 'AUTOFILL_SCHEDULE' });
    expect(game.state.log.filter((l) => !before.has(l.id))).toHaveLength(1);
  });

  it('preserves the run itself while migrating', () => {
    const game = midRunGame(3133, 6);
    const before = {
      day: game.state.day,
      cash: game.state.cash,
      clientIds: game.state.clients.map((c) => c.id),
      rng: { ...game.state.rng },
    };
    const raw = JSON.parse(JSON.stringify(game.state)) as Record<string, unknown>;
    for (const field of MIGRATION_FIELDS) delete raw[field];
    raw.version = 1;

    const migrated = migrate(raw);
    expect(migrated.day).toBe(before.day);
    expect(migrated.cash).toBe(before.cash);
    expect(migrated.clients.map((c) => c.id)).toEqual(before.clientIds);
    expect(migrated.rng).toEqual(before.rng);
  });

  it('never downgrades a save that is already current', () => {
    const game = midRunGame(3134, 4);
    const raw = JSON.parse(JSON.stringify(game.state)) as Record<string, unknown>;
    const migrated = migrate(raw);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.policies.length).toBe(game.state.policies.length);
  });

  it('defensively fills the loose collections on a hand-edited save', () => {
    const game = midRunGame(3135, 4);
    const raw = JSON.parse(JSON.stringify(game.state)) as Record<string, unknown>;
    for (const field of ['toasts', 'pendingEvents', 'queuedEvents', 'firedOnce', 'flags', 'candidates', 'programs', 'upgrades', 'log']) {
      delete raw[field];
    }
    const migrated = migrate(raw);
    expect(migrated.toasts).toEqual([]);
    expect(migrated.pendingEvents).toEqual([]);
    expect(migrated.queuedEvents).toEqual([]);
    expect(migrated.firedOnce).toEqual([]);
    expect(migrated.flags).toEqual({});
    expect(migrated.candidates).toEqual([]);
    expect(migrated.programs).toEqual([]);
    expect(migrated.upgrades).toEqual([]);
    expect(migrated.log).toEqual([]);
  });

  it('a migrated save is still loadable as a Game', () => {
    const migrated = migrate(v1Shaped(3136));
    const game = new Game(migrated);
    expect(() => drive(game, game.state.day + 3)).not.toThrow();
    expect(Number.isFinite(game.state.cash)).toBe(true);
  });
});

describe('importSave with bad input', () => {
  it('returns undefined rather than throwing', () => {
    const bad = [
      '',
      'not json at all',
      '{',
      '{"version":5}',
      'null',
      'undefined',
      '[]',
      '[1,2,3]',
      '"a string"',
      '42',
      '{"state":null}',
      '{"nope":true}',
    ];
    for (const input of bad) {
      let result: GameState | undefined;
      expect(() => {
        result = importSave(input);
      }, input).not.toThrow();
      expect(result, input).toBeUndefined();
    }
  });

  it('accepts an envelope whose state is only partially populated', () => {
    const result = importSave(JSON.stringify({ version: 1, savedAt: 0, label: 'x', state: { day: 3 } }));
    expect(result).toBeDefined();
    expect(result!.day).toBe(3);
    expect(result!.version).toBe(SAVE_VERSION);
    expect(result!.policies.length).toBeGreaterThan(0);
  });
});
