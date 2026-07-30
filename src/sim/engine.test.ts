import { describe, it, expect } from 'vitest';
import {
  Game,
  capacity,
  createInitialState,
  dailyExpenses,
  therapistSlots,
} from './engine';
import {
  ACT2_DAY,
  COMFORTABLE_SESSIONS_PER_DAY,
  SABBATICAL_DAYS,
  SABBATICAL_MAX_ENERGY_BONUS,
  SAVE_VERSION,
  XP_PER_LEVEL,
} from './balance';
import { activeTherapists } from './eventsys';
import { generateCandidate, generateClient, generateTherapist } from './generators';
import { autofillSchedule, activeClients } from './scheduler';
import { MILESTONES } from '../content';
import type { GameState, Therapist } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers. Everything below goes through dispatch(), so the tests exercise the
// same surface the UI does.
// ─────────────────────────────────────────────────────────────────────────────

/** Answer whatever modal is blocking the clock, always taking the first option. */
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

/** Tick the clock until the day finishes, answering modals along the way. */
function runDayToEnd(game: Game, maxTicks = 500): void {
  let guard = 0;
  while (game.state.dayPhase === 'running' && guard++ < maxTicks) {
    if (game.state.pendingEvents.length) {
      resolvePending(game);
      continue;
    }
    game.dispatch({ type: 'TICK', dtMinutes: 10 });
  }
}

/**
 * A reasonable headless player, in the spirit of tools/autoplay.ts but driven
 * entirely through dispatch so every action goes through the reducer.
 */
function drivePlayer(game: Game, days: number): void {
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
      const best = [...s.candidates].sort((a, b) => b.therapist.skill - a.therapist.skill)[0];
      if (best && activeTherapists(s).length < therapistSlots(s) && s.cash > best.askingSalary * 6) {
        game.dispatch({ type: 'HIRE', candidateId: best.therapist.id });
      }
      if (s.flags.philosophyAvailable && !s.philosophy) {
        game.dispatch({ type: 'CHOOSE_PHILOSOPHY', philosophy: 'trauma_informed' });
      }
      game.dispatch({ type: 'AUTOFILL_SCHEDULE' });
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

function acceptAll(game: Game): void {
  for (const c of [...game.state.clients]) {
    if (c.status === 'waitlist') game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('a new game', () => {
  it('opens with one therapist, three waitlist clients, cash in hand, on day 1', () => {
    const game = Game.create({ seed: 1, skipTutorial: true });
    const s = game.state;

    expect(s.therapists).toHaveLength(1);
    expect(s.therapists[0].isPlayer).toBe(true);
    expect(s.therapists[0].status).toBe('available');
    expect(s.therapists[0].salary).toBe(0);

    expect(s.clients).toHaveLength(3);
    expect(s.clients.every((c) => c.status === 'waitlist')).toBe(true);

    expect(s.cash).toBeGreaterThan(0);
    expect(s.day).toBe(1);
    expect(s.minute).toBe(0);
    expect(s.dayPhase).toBe('morning_brief');
    expect(s.act).toBe(1);
    expect(s.practiceLevel).toBe(1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.schedule).toEqual([]);
    expect(s.log.length).toBeGreaterThan(0);
  });

  it('is fully determined by its seed', () => {
    // Log entry ids come from a process-global counter rather than the rng, so
    // they are compared by text rather than by id.
    const shape = (state: GameState) =>
      JSON.stringify({ ...state, log: state.log.map((l) => `${l.day}:${l.kind}:${l.text}`) });

    const a = createInitialState({ seed: 4242, skipTutorial: true });
    const b = createInitialState({ seed: 4242, skipTutorial: true });
    expect(shape(a)).toBe(shape(b));

    const c = createInitialState({ seed: 4243, skipTutorial: true });
    expect(shape(c)).not.toBe(shape(a));
  });
});

describe('determinism at the top level', () => {
  it('two games with the same seed driven through 30 identical days agree exactly', () => {
    const run = () => {
      const game = Game.create({ seed: 8888, skipTutorial: true });
      drivePlayer(game, 30);
      const s = game.state;
      return {
        day: s.day,
        cash: s.cash,
        reputation: s.reputation,
        communityTrust: s.communityTrust,
        cures: s.stats.cures,
        complexCures: s.stats.complexCures,
        sessions: s.stats.sessionsRun,
        alumni: s.alumni.length,
        practiceLevel: s.practiceLevel,
        rng: JSON.stringify(s.rng),
      };
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.day).toBeGreaterThan(30);
  });

  it('different seeds diverge', () => {
    const run = (seed: number) => {
      const game = Game.create({ seed, skipTutorial: true });
      drivePlayer(game, 20);
      return { cash: game.state.cash, rep: game.state.reputation, cures: game.state.stats.cures };
    };
    expect(run(101)).not.toEqual(run(202));
  });
});

describe('the day loop', () => {
  it('START_DAY → ticking → every session resolves → day_end → END_DAY clears the schedule', () => {
    const game = Game.create({ seed: 2, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    autofillSchedule(s, game.rng);
    const booked = s.schedule.length;
    expect(booked).toBeGreaterThan(0);

    game.dispatch({ type: 'START_DAY' });
    expect(s.dayPhase).toBe('running');
    expect(s.paused).toBe(false);
    expect(s.minute).toBe(0);

    runDayToEnd(game);

    expect(s.dayPhase).toBe('day_end');
    expect(s.schedule).toHaveLength(booked);
    expect(s.schedule.every((x) => x.status === 'done')).toBe(true);
    expect(s.lastDayResults).toHaveLength(booked);
    for (const r of s.lastDayResults) {
      expect(Number.isFinite(r.quality)).toBe(true);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
    expect(s.stats.sessionsRun).toBe(booked);
    expect(s.stats.history).toHaveLength(1);

    const dayBefore = s.day;
    game.dispatch({ type: 'END_DAY' });
    expect(s.day).toBe(dayBefore + 1);
    expect(s.dayPhase).toBe('morning_brief');
    expect(s.schedule).toEqual([]);
    expect(s.lastDayResults).toEqual([]);
    expect(s.minute).toBe(0);
  });

  it('ignores ticks outside the running phase', () => {
    const game = Game.create({ seed: 3, skipTutorial: true });
    game.dispatch({ type: 'TICK', dtMinutes: 60 });
    expect(game.state.minute).toBe(0);
    expect(game.state.dayPhase).toBe('morning_brief');
  });

  it('marks unrun sessions as missed when the day is wrapped up early', () => {
    const game = Game.create({ seed: 4, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    autofillSchedule(s, game.rng);
    expect(s.schedule.length).toBeGreaterThan(0);

    game.dispatch({ type: 'START_DAY' });
    game.dispatch({ type: 'END_DAY' }); // "wrap up" before anything ran
    expect(s.dayPhase).toBe('day_end');
    expect(s.schedule.every((x) => x.status === 'missed')).toBe(true);
  });
});

describe('booking rules', () => {
  it('cannot double-book a therapist in one slot', () => {
    const game = Game.create({ seed: 5, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    const [a, b] = s.clients;
    const t = s.therapists[0].id;

    game.dispatch({ type: 'BOOK_SESSION', clientId: a.id, therapistId: t, slot: 0 });
    expect(s.schedule).toHaveLength(1);
    game.dispatch({ type: 'BOOK_SESSION', clientId: b.id, therapistId: t, slot: 0 });
    expect(s.schedule).toHaveLength(1);

    game.dispatch({ type: 'BOOK_SESSION', clientId: b.id, therapistId: t, slot: 1 });
    expect(s.schedule).toHaveLength(2);
  });

  it('cannot book the same client twice in a day', () => {
    const game = Game.create({ seed: 6, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    s.practiceLevel = 4;
    s.therapists.push(generateTherapist(s, game.rng, {}));
    const [a] = s.clients;

    game.dispatch({ type: 'BOOK_SESSION', clientId: a.id, therapistId: s.therapists[0].id, slot: 0 });
    expect(s.schedule).toHaveLength(1);
    game.dispatch({ type: 'BOOK_SESSION', clientId: a.id, therapistId: s.therapists[0].id, slot: 5 });
    expect(s.schedule).toHaveLength(1);
    // Not even with a different therapist.
    game.dispatch({ type: 'BOOK_SESSION', clientId: a.id, therapistId: s.therapists[1].id, slot: 5 });
    expect(s.schedule).toHaveLength(1);
  });

  it('cannot book a client who is still on the waitlist', () => {
    const game = Game.create({ seed: 7, skipTutorial: true });
    const s = game.state;
    const waiting = s.clients[0];
    expect(waiting.status).toBe('waitlist');
    game.dispatch({ type: 'BOOK_SESSION', clientId: waiting.id, therapistId: s.therapists[0].id, slot: 0 });
    expect(s.schedule).toEqual([]);

    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: waiting.id });
    game.dispatch({ type: 'BOOK_SESSION', clientId: waiting.id, therapistId: s.therapists[0].id, slot: 0 });
    expect(s.schedule).toHaveLength(1);
  });

  it('cannot book a therapist who is away, or an id that does not exist', () => {
    const game = Game.create({ seed: 8, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    const t = s.therapists[0];
    t.status = 'training';
    game.dispatch({ type: 'BOOK_SESSION', clientId: s.clients[0].id, therapistId: t.id, slot: 0 });
    expect(s.schedule).toEqual([]);

    t.status = 'available';
    game.dispatch({ type: 'BOOK_SESSION', clientId: s.clients[0].id, therapistId: 'nobody', slot: 0 });
    game.dispatch({ type: 'BOOK_SESSION', clientId: 'nobody', therapistId: t.id, slot: 0 });
    expect(s.schedule).toEqual([]);
  });

  it('UNBOOK_SESSION removes a scheduled session', () => {
    const game = Game.create({ seed: 9, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    game.dispatch({ type: 'BOOK_SESSION', clientId: s.clients[0].id, therapistId: s.therapists[0].id, slot: 2 });
    const id = s.schedule[0].id;
    game.dispatch({ type: 'UNBOOK_SESSION', sessionId: id });
    expect(s.schedule).toEqual([]);
  });
});

describe('ACCEPT_CLIENT', () => {
  it('respects capacity', () => {
    const game = Game.create({ seed: 10, skipTutorial: true });
    const s = game.state;
    for (let i = 0; i < 12; i++) s.clients.push(generateClient(s, game.rng, {}));
    const cap = capacity(s);
    expect(s.clients.filter((c) => c.status === 'waitlist').length).toBeGreaterThan(cap);

    acceptAll(game);
    expect(activeClients(s)).toHaveLength(cap);
    expect(s.clients.some((c) => c.status === 'waitlist')).toBe(true);
  });

  it('takes more once the practice levels up', () => {
    const game = Game.create({ seed: 11, skipTutorial: true });
    const s = game.state;
    for (let i = 0; i < 20; i++) s.clients.push(generateClient(s, game.rng, {}));
    acceptAll(game);
    const before = activeClients(s).length;

    s.practiceLevel = 4;
    expect(capacity(s)).toBeGreaterThan(before);
    acceptAll(game);
    expect(activeClients(s).length).toBeGreaterThan(before);
    expect(activeClients(s).length).toBe(capacity(s));
  });

  it('does nothing for an unknown or already-active client', () => {
    const game = Game.create({ seed: 12, skipTutorial: true });
    const s = game.state;
    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: 'nobody' });
    expect(activeClients(s)).toHaveLength(0);
    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: s.clients[0].id });
    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: s.clients[0].id });
    expect(activeClients(s)).toHaveLength(1);
  });
});

describe('money', () => {
  it('charges expenses at day end — cash falls by exactly dailyExpenses when no sessions run', () => {
    const game = Game.create({ seed: 13, skipTutorial: true });
    const s = game.state;
    const before = s.cash;
    const expected = dailyExpenses(s);
    expect(expected).toBeGreaterThan(0);

    game.dispatch({ type: 'START_DAY' });
    runDayToEnd(game);

    expect(s.dayPhase).toBe('day_end');
    expect(s.cash).toBe(before - expected);
    expect(s.stats.totalExpenses).toBe(expected);
    expect(s.stats.history[0].expenses).toBe(expected);
    expect(s.stats.history[0].revenue).toBe(0);
  });

  it('sessions bring revenue in before expenses go out', () => {
    const game = Game.create({ seed: 14, skipTutorial: true });
    const s = game.state;
    acceptAll(game);
    autofillSchedule(s, game.rng);
    expect(s.schedule.length).toBeGreaterThan(0);

    game.dispatch({ type: 'START_DAY' });
    runDayToEnd(game);
    const revenue = s.lastDayResults.reduce((a, r) => a + r.revenue, 0);
    expect(revenue).toBeGreaterThan(0);
    expect(s.stats.totalRevenue).toBeGreaterThanOrEqual(revenue);
  });
});

describe('burnout is fail-forward', () => {
  it('sends an overloaded therapist on sabbatical and returns them stronger', () => {
    const game = Game.create({ seed: 15, skipTutorial: true });
    const s = game.state;
    s.practiceLevel = 5;
    for (let i = 0; i < 12; i++) s.clients.push(generateClient(s, game.rng, {}));
    acceptAll(game);

    // Let the therapist carry a genuinely heavy day.
    s.policies.find((p) => p.kind === 'max_sessions_per_therapist')!.value = 10;
    s.policies.find((p) => p.kind === 'min_energy_reserve')!.value = 0;
    autofillSchedule(s, game.rng);

    const t = s.therapists[0];
    game.dispatch({ type: 'START_DAY' });
    runDayToEnd(game);
    const worked = s.schedule.filter((x) => x.therapistId === t.id && x.status === 'done').length;
    expect(worked).toBeGreaterThan(COMFORTABLE_SESSIONS_PER_DAY);

    const maxEnergyBefore = t.maxEnergy;
    t.strain = 100;

    game.dispatch({ type: 'END_DAY' });
    resolvePending(game);

    expect(t.status).toBe('sabbatical');
    expect(t.statusDays).toBeGreaterThanOrEqual(SABBATICAL_DAYS[0]);
    expect(t.statusDays).toBeLessThanOrEqual(SABBATICAL_DAYS[1]);
    expect(t.strain).toBeLessThan(100);
    expect(t.stats.sabbaticals).toBe(1);
    expect(s.stats.burnouts).toBe(1);
    expect(s.ended).toBeUndefined(); // fail-forward, never a game over

    // Their schedule is cleared and the auto-scheduler will not book them.
    expect(s.schedule.filter((x) => x.therapistId === t.id)).toEqual([]);
    autofillSchedule(s, game.rng);
    expect(s.schedule.filter((x) => x.therapistId === t.id)).toEqual([]);
    s.schedule = [];

    const daysOff = t.statusDays;
    for (let i = 0; i <= daysOff + 1 && t.status === 'sabbatical'; i++) {
      game.dispatch({ type: 'START_DAY' });
      runDayToEnd(game);
      game.dispatch({ type: 'END_DAY' });
      resolvePending(game);
    }

    expect(t.status).toBe('available');
    expect(t.statusDays).toBe(0);
    expect(t.maxEnergy).toBeGreaterThanOrEqual(maxEnergyBefore + SABBATICAL_MAX_ENERGY_BONUS);
    expect(t.morale).toBeGreaterThan(40);
  });
});

describe('poaching', () => {
  it('COUNTER_POACH with a large raise retains a low-morale therapist', () => {
    const game = Game.create({ seed: 16, skipTutorial: true });
    const s = game.state;
    s.practiceLevel = 3;
    const hired = generateTherapist(s, game.rng, { stage: 'mid' });
    hired.salary = 300;
    hired.morale = 18;
    hired.poachOffer = { salary: 420, daysLeft: 3, rival: 'Northgate Associates' };
    s.therapists.push(hired);

    game.dispatch({ type: 'COUNTER_POACH', therapistId: hired.id, raise: 250 });

    expect(hired.poachOffer).toBeUndefined();
    expect(hired.salary).toBe(550);
    expect(hired.morale).toBeGreaterThan(18);
    expect(hired.status).not.toBe('departed');
    expect(activeTherapists(s).some((x) => x.id === hired.id)).toBe(true);
  });

  it('does nothing when there is no offer on the table', () => {
    const game = Game.create({ seed: 17, skipTutorial: true });
    const s = game.state;
    const t = s.therapists[0];
    const salary = t.salary;
    game.dispatch({ type: 'COUNTER_POACH', therapistId: t.id, raise: 500 });
    expect(t.salary).toBe(salary);
  });
});

describe('progression', () => {
  it('granting enough xp raises the practice level and the capacity it buys', () => {
    const game = Game.create({ seed: 18, skipTutorial: true });
    const s = game.state;
    const capBefore = capacity(s);
    const slotsBefore = therapistSlots(s);
    expect(s.practiceLevel).toBe(1);

    s.xp = XP_PER_LEVEL[4];
    game.dispatch({ type: 'START_DAY' });
    runDayToEnd(game);
    game.dispatch({ type: 'END_DAY' });
    resolvePending(game);

    expect(s.practiceLevel).toBeGreaterThanOrEqual(5);
    expect(capacity(s)).toBeGreaterThan(capBefore);
    expect(therapistSlots(s)).toBeGreaterThan(slotsBefore);
  });

  it('the act changes to 2 once a second therapist is present', () => {
    const game = Game.create({ seed: 19, skipTutorial: true });
    const s = game.state;
    expect(s.act).toBe(1);
    expect(s.day).toBeLessThan(ACT2_DAY);

    s.practiceLevel = 2;
    s.cash = 100000;
    const candidate = generateCandidate(s, game.rng, { stage: 'mid' });
    s.candidates.push(candidate);

    game.dispatch({ type: 'HIRE', candidateId: candidate.therapist.id });

    expect(activeTherapists(s)).toHaveLength(2);
    expect(s.act).toBe(2);
    expect(s.stats.hires).toBe(1);
  });

  it('will not hire past the therapist slots the practice level supports', () => {
    const game = Game.create({ seed: 20, skipTutorial: true });
    const s = game.state;
    s.cash = 100000;
    expect(therapistSlots(s)).toBe(1);
    const candidate = generateCandidate(s, game.rng, { stage: 'mid' });
    s.candidates.push(candidate);
    game.dispatch({ type: 'HIRE', candidateId: candidate.therapist.id });
    expect(activeTherapists(s)).toHaveLength(1);
  });

  it('milestones fire at most once each', () => {
    const game = Game.create({ seed: 21, skipTutorial: true });
    drivePlayer(game, 60);
    const earned = game.state.milestonesEarned;
    expect(earned.length).toBeGreaterThan(0);
    expect(new Set(earned).size).toBe(earned.length);
    const known = new Set(MILESTONES.map((m) => m.id));
    for (const id of earned) expect(known.has(id)).toBe(true);
  });
});

describe('invariants', () => {
  it('a 60-day autoplay leaves no NaN or Infinity anywhere in the state', () => {
    const game = Game.create({ seed: 31337, skipTutorial: true });
    drivePlayer(game, 60);
    const s = game.state;

    expect(s.day).toBeGreaterThan(60);
    expect(s.stats.sessionsRun).toBeGreaterThan(50);

    const offenders: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) offenders.push(`${path} = ${value}`);
        return;
      }
      if (value === null || typeof value !== 'object') return;
      if (seen.has(value as object)) return;
      seen.add(value as object);
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${path}.${k}`);
    };
    walk(s, 'state');
    expect(offenders).toEqual([]);

    // The headline numbers specifically.
    for (const [label, v] of [
      ['cash', s.cash],
      ['reputation', s.reputation],
      ['communityTrust', s.communityTrust],
      ['xp', s.xp],
      ['practiceLevel', s.practiceLevel],
    ] as const) {
      expect(Number.isFinite(v), label).toBe(true);
    }
    expect(s.reputation).toBeGreaterThanOrEqual(0);
    expect(s.reputation).toBeLessThanOrEqual(100);
    expect(s.communityTrust).toBeGreaterThanOrEqual(0);
    expect(s.communityTrust).toBeLessThanOrEqual(100);

    for (const t of s.therapists) {
      expect(t.morale).toBeGreaterThanOrEqual(0);
      expect(t.morale).toBeLessThanOrEqual(100);
      expect(t.energy).toBeGreaterThanOrEqual(0);
      expect(t.energy).toBeLessThanOrEqual(t.maxEnergy);
      expect(t.strain).toBeGreaterThanOrEqual(0);
      expect(t.strain).toBeLessThanOrEqual(100);
      expect(t.skill).toBeGreaterThanOrEqual(0);
      expect(t.skill).toBeLessThanOrEqual(100);
    }
    for (const c of s.clients) {
      expect(c.progress).toBeGreaterThanOrEqual(0);
      expect(c.progress).toBeLessThanOrEqual(100);
      expect(c.patience).toBeGreaterThanOrEqual(0);
      expect(c.patience).toBeLessThanOrEqual(100);
      for (const v of [c.rapport, c.stability, c.resilience]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(c.chapter).toBe(
        c.progress >= 76 ? 'consolidation' : c.progress >= 34 ? 'work' : 'trust',
      );
    }
  });

  it('every action type can be dispatched on a fresh game without throwing', () => {
    const game = Game.create({ seed: 22, skipTutorial: true });
    const s = game.state;
    const t = s.therapists[0];
    const c = s.clients[0];

    const actions: Parameters<Game['dispatch']>[0][] = [
      { type: 'SET_SPEED', speed: 2 },
      { type: 'TOGGLE_PAUSE' },
      { type: 'TOGGLE_PAUSE', paused: true },
      { type: 'SET_SESSION_FOCUS', sessionId: 'nope', focus: 'process' },
      { type: 'UNBOOK_SESSION', sessionId: 'nope' },
      { type: 'ACCEPT_CLIENT', clientId: c.id },
      { type: 'REASSIGN_CLIENT', clientId: c.id, therapistId: t.id },
      { type: 'AUTOFILL_SCHEDULE' },
      { type: 'RUN_AUTOSCHEDULER' },
      { type: 'RESOLVE_EVENT', instanceId: 'nope', choiceId: 'nope' },
      { type: 'CHOOSE_TECHNIQUE', instanceId: 'nope', techniqueId: 'nope' },
      { type: 'HIRE', candidateId: 'nope' },
      { type: 'DISMISS_CANDIDATE', candidateId: 'nope' },
      { type: 'FIRE_THERAPIST', therapistId: t.id },
      { type: 'COUNTER_POACH', therapistId: t.id, raise: 10 },
      { type: 'START_TRAINING', therapistId: t.id, trainingId: 'nope' },
      { type: 'SET_MENTORSHIP', mentorId: t.id, menteeId: t.id },
      { type: 'BUY_UPGRADE', upgradeId: 'nope' },
      { type: 'LAUNCH_PROGRAM', programId: 'group_therapy', therapistIds: [] },
      { type: 'STAFF_PROGRAM', programId: 'group_therapy', therapistIds: [] },
      { type: 'CLOSE_PROGRAM', programId: 'group_therapy' },
      { type: 'CHOOSE_PHILOSOPHY', philosophy: 'integrative_wellness' },
      { type: 'REMOVE_POLICY', policyId: 'nope' },
      { type: 'DISMISS_TOAST', toastId: 'nope' },
      { type: 'SET_SETTING', key: 'calmMode', value: true },
      { type: 'ADVANCE_TUTORIAL' },
      { type: 'SET_PRACTICE_NAME', name: 'The Lamplight Rooms' },
      { type: 'DECLINE_CLIENT', clientId: s.clients[2].id },
      { type: 'RETIRE_RUN' },
    ];

    for (const action of actions) {
      expect(() => game.dispatch(action), action.type).not.toThrow();
      expect(Number.isFinite(s.cash), action.type).toBe(true);
      expect(Number.isFinite(s.reputation), action.type).toBe(true);
      expect(Number.isFinite(s.communityTrust), action.type).toBe(true);
    }
    expect(s.practiceName).toBe('The Lamplight Rooms');
    expect(s.philosophy).toBe('integrative_wellness');
    expect(s.ended?.kind).toBe('retired');
  });

  it('keeps the rng state on the game object and the state object in sync', () => {
    const game = Game.create({ seed: 23, skipTutorial: true });
    acceptAll(game);
    game.dispatch({ type: 'AUTOFILL_SCHEDULE' });
    game.dispatch({ type: 'START_DAY' });
    runDayToEnd(game);
    expect(game.state.rng).toEqual(game.rng.state);
  });

  it('choosing a philosophy grants its exclusive techniques to the whole team', () => {
    const game = Game.create({ seed: 24, skipTutorial: true });
    const s = game.state;
    s.therapists.push(generateTherapist(s, game.rng, {}));
    game.dispatch({ type: 'CHOOSE_PHILOSOPHY', philosophy: 'trauma_informed' });
    expect(s.philosophy).toBe('trauma_informed');

    for (const t of s.therapists) {
      const exclusive = t.techniques.filter((id) => id.length > 0);
      expect(exclusive.length).toBeGreaterThan(0);
    }
    // A second call cannot switch philosophies mid-run.
    game.dispatch({ type: 'CHOOSE_PHILOSOPHY', philosophy: 'family_community' });
    expect(s.philosophy).toBe('trauma_informed');
  });
});

describe('helpers', () => {
  it('dailyExpenses grows with staff and caseload', () => {
    const game = Game.create({ seed: 25, skipTutorial: true });
    const s = game.state;
    s.practiceLevel = 6;
    const solo = dailyExpenses(s);

    acceptAll(game);
    const withClients = dailyExpenses(s);
    expect(withClients).toBeGreaterThan(solo);

    const hire: Therapist = generateTherapist(s, game.rng, { stage: 'veteran' });
    s.therapists.push(hire);
    expect(dailyExpenses(s)).toBeGreaterThan(withClients);
  });

  it('capacity and therapistSlots are clamped above the top level', () => {
    const s: GameState = createInitialState({ seed: 26, skipTutorial: true });
    s.practiceLevel = 999;
    expect(Number.isFinite(capacity(s))).toBe(true);
    expect(Number.isFinite(therapistSlots(s))).toBe(true);
  });

  /**
   * BUG (reported, not fixed here): capacity() and therapistSlots() index their
   * lookup tables with `Math.min(len - 1, practiceLevel - 1)` and never clamp
   * the low end, so a practiceLevel of 0 reads index −1 and returns NaN. Compare
   * skillCap(), which does `Math.max(0, ...)`. A save that predates the field —
   * migrate() does not default practiceLevel — lands straight in this hole.
   */
  it('capacity and therapistSlots are clamped below level 1 too', () => {
    const s: GameState = createInitialState({ seed: 26, skipTutorial: true });
    s.practiceLevel = 0;
    expect(Number.isFinite(capacity(s))).toBe(true);
    expect(Number.isFinite(therapistSlots(s))).toBe(true);
  });
});
