import { describe, it, expect } from 'vitest';
import {
  autofillSchedule,
  bookableTherapists,
  clientBooked,
  clientPriority,
  computeExceptions,
  energyForecast,
  slotTaken,
  suggestFocus,
} from './scheduler';
import { AT_RISK_PATIENCE_THRESHOLD, FOCUSES, SLOTS_PER_DAY } from './balance';
import { Game, createInitialState } from './engine';
import { generateClient, generateTherapist } from './generators';
import { Rng } from './rng';
import type { Client, GameState, Policy, ScheduledSession, Therapist } from './types';

// ─────────────────────────────────────────────────────────────────────────────

function freshState(seed = 1): GameState {
  return createInitialState({ seed, skipTutorial: true });
}

function policyValue(state: GameState, kind: Policy['kind']): number | undefined {
  return state.policies.find((p) => p.kind === kind && p.enabled)?.value;
}

/** A busy practice: several therapists, a full caseload, room to book. */
function busyPractice(seed: number): { game: Game; state: GameState; staff: Therapist[] } {
  const game = Game.create({ seed, skipTutorial: true });
  const state = game.state;
  state.practiceLevel = 8;
  for (let i = 0; i < 4; i++) state.therapists.push(generateTherapist(state, game.rng, {}));
  for (let i = 0; i < 30; i++) state.clients.push(generateClient(state, game.rng, {}));
  for (const c of [...state.clients]) game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
  return { game, state, staff: state.therapists };
}

let sessionCounter = 0;
function mkSession(over: Partial<ScheduledSession> & { clientId: string; therapistId: string }): ScheduledSession {
  return {
    id: `sched_test_${sessionCounter++}`,
    slot: 0,
    focus: 'build_skills',
    type: 'individual',
    status: 'scheduled',
    t: 0,
    ...over,
  };
}

describe('autofillSchedule', () => {
  it('never double-books a therapist into the same slot', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state, game } = busyPractice(seed);
      const result = autofillSchedule(state, game.rng);
      expect(result.booked).toBeGreaterThan(0);

      const seen = new Set<string>();
      for (const s of state.schedule) {
        const key = `${s.therapistId}:${s.slot}`;
        expect(seen.has(key), `double-booked ${key}`).toBe(false);
        seen.add(key);
        expect(s.slot).toBeGreaterThanOrEqual(0);
        expect(s.slot).toBeLessThan(SLOTS_PER_DAY);
      }
    }
  });

  it('never books the same client twice in a day', () => {
    const { state, game } = busyPractice(7);
    autofillSchedule(state, game.rng);
    autofillSchedule(state, game.rng); // running it twice must be idempotent-ish
    const seen = new Set<string>();
    for (const s of state.schedule) {
      expect(seen.has(s.clientId)).toBe(false);
      seen.add(s.clientId);
    }
  });

  it('never exceeds the max-sessions policy', () => {
    for (const cap of [1, 2, 3, 5, 7]) {
      const { state, game } = busyPractice(20 + cap);
      const policy = state.policies.find((p) => p.kind === 'max_sessions_per_therapist')!;
      policy.value = cap;
      policy.enabled = true;
      // Take the energy reserve out of the way so the cap is what binds.
      state.policies.find((p) => p.kind === 'min_energy_reserve')!.value = 0;

      autofillSchedule(state, game.rng);
      const load: Record<string, number> = {};
      for (const s of state.schedule) load[s.therapistId] = (load[s.therapistId] ?? 0) + 1;
      for (const [id, n] of Object.entries(load)) {
        expect(n, `therapist ${id} booked ${n} with cap ${cap}`).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('never books a therapist who is training, on sabbatical or departed', () => {
    const { state, game } = busyPractice(31);
    const [, training, sabbatical, departed] = state.therapists;
    training.status = 'training';
    training.statusDays = 2;
    sabbatical.status = 'sabbatical';
    sabbatical.statusDays = 3;
    departed.status = 'departed';

    autofillSchedule(state, game.rng);
    expect(state.schedule.length).toBeGreaterThan(0);

    const unavailable = new Set([training.id, sabbatical.id, departed.id]);
    for (const s of state.schedule) expect(unavailable.has(s.therapistId)).toBe(false);
    for (const t of bookableTherapists(state)) expect(unavailable.has(t.id)).toBe(false);
  });

  it('only books clients who are actually on the caseload', () => {
    const { state, game } = busyPractice(41);
    for (let i = 0; i < 5; i++) state.clients.push(generateClient(state, game.rng, {}));
    autofillSchedule(state, game.rng);
    for (const s of state.schedule) {
      const c = state.clients.find((x) => x.id === s.clientId)!;
      expect(c.status).toBe('active');
    }
  });

  it('honours the energy reserve policy', () => {
    const { state, game } = busyPractice(51);
    state.policies.find((p) => p.kind === 'max_sessions_per_therapist')!.value = SLOTS_PER_DAY;
    const reserve = state.policies.find((p) => p.kind === 'min_energy_reserve')!;
    reserve.value = 60;
    reserve.enabled = true;
    for (const t of state.therapists) {
      t.maxEnergy = 100;
      t.energy = 100;
    }

    autofillSchedule(state, game.rng);
    const load: Record<string, number> = {};
    for (const s of state.schedule) load[s.therapistId] = (load[s.therapistId] ?? 0) + 1;
    // With 100 energy, a 60% reserve and 13 projected per session, at most 3 fit.
    for (const n of Object.values(load)) expect(n).toBeLessThanOrEqual(3);
  });

  it('is deterministic for a given rng seed', () => {
    const shape = (seed: number) => {
      const { state, game } = busyPractice(61);
      autofillSchedule(state, Rng.fromSeed(seed));
      return state.schedule.map((s) => `${s.clientId}@${s.therapistId}:${s.slot}:${s.focus}`);
    };
    expect(shape(4242)).toEqual(shape(4242));
  });

  it('tags auto-scheduled sessions so the UI can tell them apart', () => {
    const { state, game } = busyPractice(71);
    autofillSchedule(state, game.rng, { auto: true });
    expect(state.schedule.length).toBeGreaterThan(0);
    for (const s of state.schedule) expect(s.auto).toBe(true);
  });
});

describe('suggestFocus', () => {
  it("returns 'stabilize' for a destabilised client", () => {
    const state = freshState(80);
    const c = generateClient(state, Rng.fromSeed(81), {});
    c.stability = 0.1;
    c.chapter = 'work';
    c.rapport = 0.9;
    c.resilience = 0.9;
    expect(suggestFocus(state, c)).toBe('stabilize');

    // Also true across the whole band below the protect threshold.
    const threshold = policyValue(state, 'protect_low_stability') ?? 0.5;
    for (let stability = 0; stability < threshold; stability += 0.05) {
      c.stability = stability;
      expect(suggestFocus(state, c)).toBe('stabilize');
    }
  });

  it("returns 'stabilize' while the alliance is still forming", () => {
    const state = freshState(82);
    const c = generateClient(state, Rng.fromSeed(83), {});
    c.stability = 0.9;
    c.chapter = 'trust';
    c.rapport = 0.2;
    expect(suggestFocus(state, c)).toBe('stabilize');
  });

  it("returns 'process' for a steady, resilient client mid-work", () => {
    const state = freshState(84);
    const c = generateClient(state, Rng.fromSeed(85), {});
    c.stability = FOCUSES.process.safeStability + 0.3;
    c.chapter = 'work';
    c.rapport = 0.7;
    c.resilience = 0.6;
    expect(suggestFocus(state, c)).toBe('process');
  });

  it("returns 'build_skills' in consolidation", () => {
    const state = freshState(86);
    const c = generateClient(state, Rng.fromSeed(87), {});
    c.stability = 0.9;
    c.chapter = 'consolidation';
    c.rapport = 0.8;
    expect(suggestFocus(state, c)).toBe('build_skills');
  });

  it('always returns a real focus', () => {
    const state = freshState(88);
    for (let seed = 0; seed < 40; seed++) {
      const c = generateClient(state, Rng.fromSeed(seed + 200), {});
      expect(Object.keys(FOCUSES)).toContain(suggestFocus(state, c));
    }
  });
});

describe('clientPriority', () => {
  const shape = (state: GameState, over: Partial<Client>): Client => {
    const c = generateClient(state, Rng.fromSeed(91), {});
    return Object.assign(c, over);
  };

  it('ranks an at-risk, long-unseen client above a fresh one', () => {
    const state = freshState(90);
    const atRisk = shape(state, {
      atRisk: true,
      patience: 18,
      daysSinceSession: 6,
      severity: 4,
      stability: 0.2,
      progress: 20,
      chapter: 'trust',
    });
    const fresh = shape(state, {
      atRisk: false,
      patience: 92,
      daysSinceSession: 0,
      severity: 2,
      stability: 0.75,
      progress: 20,
      chapter: 'trust',
    });
    expect(clientPriority(state, atRisk)).toBeGreaterThan(clientPriority(state, fresh));
  });

  it('rises monotonically with days unseen, all else equal', () => {
    const state = freshState(92);
    let prev = -Infinity;
    for (let days = 0; days <= 10; days++) {
      const c = shape(state, { daysSinceSession: days, patience: 70, atRisk: false, severity: 3, stability: 0.6 });
      const p = clientPriority(state, c);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it('lifts a client who is one session from finishing', () => {
    const state = freshState(93);
    const base = { patience: 80, daysSinceSession: 1, severity: 3, stability: 0.7, atRisk: false };
    const nearlyDone = shape(state, { ...base, progress: 95, chapter: 'consolidation' });
    const midway = shape(state, { ...base, progress: 50, chapter: 'work' });
    expect(clientPriority(state, nearlyDone)).toBeGreaterThan(clientPriority(state, midway));
  });

  it('is always finite', () => {
    const state = freshState(94);
    for (let seed = 0; seed < 40; seed++) {
      const c = generateClient(state, Rng.fromSeed(seed + 300), {});
      expect(Number.isFinite(clientPriority(state, c))).toBe(true);
    }
  });
});

describe('computeExceptions', () => {
  it('surfaces a low-morale therapist and an at-risk client', () => {
    const { state, game } = busyPractice(100);
    const grumpy = state.therapists[1];
    grumpy.morale = 20;
    const drifting = state.clients.find((c) => c.status === 'active')!;
    drifting.patience = AT_RISK_PATIENCE_THRESHOLD - 15;
    drifting.atRisk = true;
    drifting.daysSinceSession = 5;

    const exceptions = computeExceptions(state);

    const morale = exceptions.find((e) => e.kind === 'low_morale' && e.therapistId === grumpy.id);
    expect(morale).toBeDefined();
    expect(morale!.label).toContain(grumpy.name);

    const risk = exceptions.find((e) => e.kind === 'client_at_risk' && e.clientId === drifting.id);
    expect(risk).toBeDefined();
    expect(risk!.label).toContain(drifting.handle);

    for (const e of exceptions) {
      expect([1, 2, 3]).toContain(e.severity);
      expect(e.id.length).toBeGreaterThan(0);
      expect(e.detail.length).toBeGreaterThan(0);
    }
    // Sorted worst-first.
    for (let i = 1; i < exceptions.length; i++) {
      expect(exceptions[i - 1].severity).toBeGreaterThanOrEqual(exceptions[i].severity);
    }
    void game;
  });

  it('surfaces strain, poaching and low cash', () => {
    const { state } = busyPractice(101);
    state.therapists[0].strain = 90;
    state.therapists[2].poachOffer = { salary: 900, daysLeft: 2, rival: 'Northgate Associates' };
    state.cash = 100;

    const kinds = new Set(computeExceptions(state).map((e) => e.kind));
    expect(kinds.has('therapist_strain')).toBe(true);
    expect(kinds.has('poach')).toBe(true);
    expect(kinds.has('cash')).toBe(true);
  });

  it('is quiet when nothing needs attention', () => {
    const { state, game } = busyPractice(102);
    state.cash = 50000;
    for (const t of state.therapists) {
      t.morale = 80;
      t.strain = 10;
      t.poachOffer = undefined;
    }
    for (const c of state.clients) {
      c.patience = 95;
      c.daysSinceSession = 0;
      c.atRisk = false;
    }
    autofillSchedule(state, game.rng);
    expect(computeExceptions(state)).toEqual([]);
  });

  it('ignores departed therapists', () => {
    const { state } = busyPractice(103);
    const gone = state.therapists[1];
    gone.morale = 1;
    gone.strain = 100;
    gone.status = 'departed';
    expect(computeExceptions(state).some((e) => e.therapistId === gone.id)).toBe(false);
  });
});

describe('energyForecast', () => {
  it('decreases as more sessions are booked', () => {
    const { state } = busyPractice(110);
    const t = state.therapists[0];
    t.maxEnergy = 100;
    t.energy = 100;
    const clients = state.clients.filter((c) => c.status === 'active');
    expect(clients.length).toBeGreaterThan(5);

    let prev = energyForecast(state, t);
    expect(prev).toBe(100);

    for (let i = 0; i < 5; i++) {
      state.schedule.push(mkSession({ clientId: clients[i].id, therapistId: t.id, slot: i }));
      const next = energyForecast(state, t);
      expect(next).toBeLessThan(prev);
      prev = next;
    }
  });

  it('never forecasts below zero', () => {
    const { state } = busyPractice(111);
    const t = state.therapists[0];
    t.maxEnergy = 100;
    t.energy = 10;
    const clients = state.clients.filter((c) => c.status === 'active');
    for (let i = 0; i < SLOTS_PER_DAY && i < clients.length; i++) {
      state.schedule.push(mkSession({ clientId: clients[i].id, therapistId: t.id, slot: i, focus: 'process' }));
    }
    expect(energyForecast(state, t)).toBe(0);
  });

  it('only counts that therapist’s still-scheduled sessions', () => {
    const { state } = busyPractice(112);
    const [a, b] = state.therapists;
    a.energy = 100;
    a.maxEnergy = 100;
    const clients = state.clients.filter((c) => c.status === 'active');
    state.schedule.push(mkSession({ clientId: clients[0].id, therapistId: b.id, slot: 0 }));
    expect(energyForecast(state, a)).toBe(100);

    state.schedule.push(mkSession({ clientId: clients[1].id, therapistId: a.id, slot: 1, status: 'done' }));
    expect(energyForecast(state, a)).toBe(100);
  });
});

describe('booking helpers', () => {
  it('slotTaken and clientBooked agree with the schedule', () => {
    const { state } = busyPractice(120);
    const t = state.therapists[0];
    const c = state.clients.find((x) => x.status === 'active')!;
    expect(slotTaken(state, t.id, 3)).toBe(false);
    expect(clientBooked(state, c.id)).toBe(false);

    state.schedule.push(mkSession({ clientId: c.id, therapistId: t.id, slot: 3 }));
    expect(slotTaken(state, t.id, 3)).toBe(true);
    expect(slotTaken(state, t.id, 4)).toBe(false);
    expect(clientBooked(state, c.id)).toBe(true);
  });
});
