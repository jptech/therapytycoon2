import { describe, it, expect } from 'vitest';
import {
  resolveSession,
  sessionEnergyCost,
  sessionIncludes,
  sessionMemberClients,
  sessionMembers,
  sessionPacer,
  unlockedSessionTypes,
} from './session';
import {
  autofillSchedule,
  clientBooked,
  detachClientFromSchedule,
  groupSessionAt,
} from './scheduler';
import {
  GROUP_MAX_MEMBERS,
  GROUP_MIN_MEMBERS,
  GROUP_QUALITY_FLOOR,
  SESSION_TYPE_ENERGY_MULT,
  SESSION_TYPE_PROGRESS_MULT,
  SESSION_TYPE_RAPPORT_MULT,
  SESSION_TYPE_RATE_MULT,
  SESSION_TYPE_REVENUE_MULT,
  SAVE_VERSION,
} from './balance';
import { UPGRADES } from '../content';
import { EventBus } from './bus';
import { Game, createInitialState } from './engine';
import { generateClient, generateTherapist } from './generators';
import { migrate } from './save';
import { Rng } from './rng';
import type { Client, GameState, ScheduledSession, SessionType, Therapist } from './types';

// ─────────────────────────────────────────────────────────────────────────────

const ALL_SESSION_TYPES: SessionType[] = ['individual', 'couples', 'family', 'group'];

function freshState(seed = 1): GameState {
  return createInitialState({ seed, skipTutorial: true });
}

let sessionCounter = 0;
function mkSession(over: Partial<ScheduledSession> & { therapistId: string }): ScheduledSession {
  return {
    id: `types_test_${sessionCounter++}`,
    clientId: over.memberIds?.[0] ?? over.clientId ?? '',
    slot: 2,
    focus: 'build_skills',
    type: 'individual',
    status: 'scheduled',
    t: 0,
    variance: 0,
    ...over,
  };
}

/** N active clients of a given kind, already on the caseload. */
function addClients(
  state: GameState,
  rng: Rng,
  n: number,
  sessionType: SessionType,
  over: Partial<Client> = {},
): Client[] {
  const out: Client[] = [];
  for (let i = 0; i < n; i++) {
    const c = generateClient(state, rng, { sessionType });
    c.status = 'active';
    Object.assign(c, over);
    state.clients.push(c);
    out.push(c);
  }
  return out;
}

/** A practice with the room built and enough people waiting to fill it. */
function practiceWithGroupRoom(seed: number, members = 4): {
  game: Game;
  state: GameState;
  therapist: Therapist;
  clients: Client[];
} {
  const game = Game.create({ seed, skipTutorial: true });
  const state = game.state;
  state.practiceLevel = 8;
  state.upgrades.push('up_group_room');
  const therapist = state.therapists[0];
  therapist.energy = therapist.maxEnergy;
  const clients = addClients(state, game.rng, members, 'group');
  return { game, state, therapist, clients };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('reading a session as a room', () => {
  it('a session with no memberIds is exactly one person, everywhere', () => {
    const s = freshState(1);
    const rng = Rng.fromSeed(1);
    const [c] = addClients(s, rng, 1, 'individual');
    const sess = mkSession({ clientId: c.id, therapistId: s.therapists[0].id });

    expect(sessionMembers(sess)).toEqual([c.id]);
    expect(sessionIncludes(sess, c.id)).toBe(true);
    expect(sessionIncludes(sess, 'somebody_else')).toBe(false);
    expect(sessionMemberClients(s, sess).map((x) => x.id)).toEqual([c.id]);
    expect(sessionPacer(s, sess)?.id).toBe(c.id);
  });

  it('the room is paced by whoever is least steady in it', () => {
    const { state, therapist, clients } = practiceWithGroupRoom(2, 4);
    clients.forEach((c, i) => {
      c.stability = 0.8 - i * 0.1;
    });
    const sess = mkSession({
      memberIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      type: 'group',
    });
    expect(sessionPacer(state, sess)?.id).toBe(clients[3].id);
  });

  it('drops members who have left the caseload rather than reporting ghosts', () => {
    const { state, therapist, clients } = practiceWithGroupRoom(3, 3);
    const sess = mkSession({
      memberIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      type: 'group',
    });
    state.clients = state.clients.filter((c) => c.id !== clients[1].id);
    expect(sessionMemberClients(state, sess).map((c) => c.id)).toEqual([clients[0].id, clients[2].id]);
  });
});

describe('unlockedSessionTypes', () => {
  it('is individual-only until a certification is owned', () => {
    const s = freshState(4);
    expect(unlockedSessionTypes(s)).toEqual(['individual']);
    s.upgrades.push('up_couples_certification', 'up_group_room');
    expect(unlockedSessionTypes(s).sort()).toEqual(['couples', 'group', 'individual']);
  });

  it('every kind of room is reachable, and every tuning table covers every one', () => {
    const unlockable = new Set(
      UPGRADES.map((u) => u.mods?.unlockSessionType).filter((x): x is SessionType => !!x),
    );
    // A session type nothing unlocks is dead content — the same class of silent
    // hole as an engine-raised event id with no definition behind it.
    for (const ty of ALL_SESSION_TYPES) {
      if (ty === 'individual') continue;
      expect(unlockable.has(ty), `${ty} has no upgrade that unlocks it`).toBe(true);
    }
    for (const table of [
      SESSION_TYPE_PROGRESS_MULT,
      SESSION_TYPE_RATE_MULT,
      SESSION_TYPE_REVENUE_MULT,
      SESSION_TYPE_ENERGY_MULT,
      SESSION_TYPE_RAPPORT_MULT,
    ]) {
      for (const ty of ALL_SESSION_TYPES) expect(typeof table[ty]).toBe('number');
    }
  });
});

describe('a group session resolves once per member', () => {
  it('every member gets their own result, and the room is described on each one', () => {
    const { state, therapist, clients } = practiceWithGroupRoom(5, 5);
    const sess = mkSession({
      memberIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      type: 'group',
    });
    state.schedule.push(sess);

    const paced = resolveSession(state, sess, Rng.fromSeed(11));
    expect(paced).toBeDefined();
    expect(sess.results).toHaveLength(5);
    expect(sess.results!.map((r) => r.clientId).sort()).toEqual(clients.map((c) => c.id).sort());
    for (const r of sess.results!) {
      expect(r.group).toBeDefined();
      expect(r.group!.size).toBe(5);
      expect(r.group!.handles).toHaveLength(5);
      expect(r.sessionId).toBe(sess.id);
    }
    // The stored result is the member the hour was paced by.
    expect(paced!.clientId).toBe(sess.results!.find((r) => r.clientId === paced!.clientId)!.clientId);
    expect(paced!.clientId).toBe(sess.results![0].group!.pacedByClientId);
  });

  it('charges the therapist for the room exactly once, and the shares add up to it', () => {
    const { state, therapist, clients } = practiceWithGroupRoom(6, 4);
    const before = therapist.energy;
    const sess = mkSession({
      memberIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      type: 'group',
    });
    resolveSession(state, sess, Rng.fromSeed(12));

    const total = sess.results![0].group!.totalEnergyCost;
    expect(before - therapist.energy).toBe(total);
    expect(sess.results!.reduce((a, r) => a + r.energyCost, 0)).toBe(total);
    // One hour worked, not four.
    expect(therapist.stats.sessions).toBe(1);
  });

  it('costs more than one hour and far less than seeing everyone separately', () => {
    const { state, therapist } = practiceWithGroupRoom(7, 1);
    const one = sessionEnergyCost(therapist, 'build_skills', 'group', 1);
    const six = sessionEnergyCost(therapist, 'build_skills', 'group', 6);
    expect(six).toBeGreaterThan(one);
    expect(six).toBeLessThan(one * 6);
    expect(state.upgrades).toContain('up_group_room');
  });

  it('a crowded room costs everyone quality, and the penalty has a floor', () => {
    // Same seed, same people, same therapist — only the size of the room differs.
    const qualityAt = (size: number): number => {
      const { state, therapist, clients } = practiceWithGroupRoom(8, GROUP_MAX_MEMBERS);
      for (const c of clients) {
        c.rapport = 0.5;
        c.stability = 0.6;
        c.resilience = 0.4;
      }
      const members = clients.slice(0, size);
      const sess = mkSession({
        memberIds: members.map((c) => c.id),
        therapistId: therapist.id,
        type: 'group',
      });
      resolveSession(state, sess, Rng.fromSeed(99));
      return sess.results?.[0].quality ?? sess.result!.quality;
    };
    const small = qualityAt(2);
    const large = qualityAt(GROUP_MAX_MEMBERS);
    expect(large).toBeLessThan(small);
    // The aggregate is clamped: a growing list of heads cannot grow without end.
    expect(small - large).toBeLessThanOrEqual(Math.abs(GROUP_QUALITY_FLOOR) + 1e-9);
  });
});

describe('the numbers the player sees are the numbers applied', () => {
  it('every member of the room is reported, and each result explains its own type', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(9, 4);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    game.dispatch({ type: 'START_DAY' });
    game.dispatch({ type: 'TOGGLE_PAUSE', paused: false });
    let guard = 0;
    while (state.dayPhase === 'running' && guard++ < 400) {
      const p = state.pendingEvents[0];
      if (p?.techniqueCards?.length) {
        game.dispatch({
          type: 'CHOOSE_TECHNIQUE',
          instanceId: p.instanceId,
          techniqueId: p.techniqueCards[0].techniqueId,
        });
      } else if (p) {
        game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      } else {
        game.dispatch({ type: 'TICK', dtMinutes: 10 });
      }
    }

    const results = state.lastDayResults.filter((r) => r.group);
    expect(results).toHaveLength(4);
    expect(new Set(results.map((r) => r.clientId)).size).toBe(4);
    for (const r of results) {
      expect(r.reasons.some((x) => /group work moves slower/i.test(x.label))).toBe(true);
    }
    // One hour worked, however many people it moved.
    expect(state.stats.sessionsRun).toBe(1);
  });

  it('the decision beat is about the person the cards were built for', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(71, 4);
    clients.forEach((c, i) => {
      c.stability = 0.8 - i * 0.13;
    });
    const leastSteady = clients[clients.length - 1];
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    game.dispatch({ type: 'START_DAY' });
    game.dispatch({ type: 'TOGGLE_PAUSE', paused: false });

    let decision = state.pendingEvents.find((p) => p.techniqueCards?.length);
    let guard = 0;
    while (!decision && guard++ < 200) {
      const p = state.pendingEvents[0];
      if (p) game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      else game.dispatch({ type: 'TICK', dtMinutes: 5 });
      decision = state.pendingEvents.find((x) => x.techniqueCards?.length);
    }
    expect(decision).toBeDefined();

    const sess = state.schedule.find((x) => x.id === decision!.sessionId)!;
    // The overlay draws the portrait, the stability meter and the sentence "you
    // are choosing for X, the least steady person here" from `pending.clientId`,
    // while every regressionChance on the cards comes from the pacer. If those
    // are two different people the screen contradicts itself.
    expect(decision!.clientId).toBe(sessionPacer(state, sess)!.id);
    expect(decision!.clientId).toBe(leastSteady.id);
    for (const card of decision!.techniqueCards!) {
      const named = card.preview.notes.find((n) => /least steady in the room/.test(n));
      if (named) expect(named).toContain(leastSteady.handle);
    }
  });

  it('bills a group seat at the group rate and moves the case at the group pace', () => {
    const s = freshState(10);
    const rng = Rng.fromSeed(10);
    const t = generateTherapist(s, rng, {});
    s.therapists.push(t);

    const takeOne = (type: SessionType): { revenue: number; progress: number } => {
      const c = generateClient(s, rng, { sessionType: type });
      c.status = 'active';
      c.rate = 100;
      c.rapport = 0.9; // past the trust gate, so only the type multiplier is left
      c.progress = 50;
      c.chapter = 'work';
      c.payment = 'sliding_scale'; // collection rate 1, so the arithmetic is visible
      s.clients.push(c);
      const sess = mkSession({ clientId: c.id, therapistId: t.id, type });
      const r = resolveSession(s, sess, Rng.fromSeed(4242))!;
      return { revenue: r.revenue, progress: r.progressDelta };
    };

    const individual = takeOne('individual');
    const group = takeOne('group');
    expect(group.revenue).toBeLessThan(individual.revenue);
    expect(SESSION_TYPE_REVENUE_MULT.group).toBeLessThan(1);
    expect(SESSION_TYPE_PROGRESS_MULT.group).toBeLessThan(1);
  });
});

describe('the night after a room ran', () => {
  /** Run one full day to its end, resolving whatever blocks the clock. */
  function playOneDay(game: Game): void {
    const state = game.state;
    game.dispatch({ type: 'START_DAY' });
    game.dispatch({ type: 'TOGGLE_PAUSE', paused: false });
    let guard = 0;
    while (state.dayPhase === 'running' && guard++ < 400) {
      const p = state.pendingEvents[0];
      if (p?.techniqueCards?.length) {
        game.dispatch({
          type: 'CHOOSE_TECHNIQUE',
          instanceId: p.instanceId,
          techniqueId: p.techniqueCards[0].techniqueId,
        });
      } else if (p) {
        game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      } else {
        game.dispatch({ type: 'TICK', dtMinutes: 10 });
      }
    }
    const startedOn = state.day;
    guard = 0;
    while (state.day === startedOn && guard++ < 20) {
      for (const p of [...state.pendingEvents]) {
        game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      }
      game.dispatch({ type: 'END_DAY' });
    }
  }

  it('counts every chair as seen, not just the one the session is filed under', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(70, 4);
    for (const c of clients) c.patience = 60;
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    const sessionId = state.schedule[0].id;
    playOneDay(game);

    const ran = state.schedule.find((x) => x.id === sessionId);
    expect(ran?.status ?? 'done').toBe('done');
    for (const seat of clients) {
      const c = state.clients.find((x) => x.id === seat.id)!;
      expect(c.sessionsAttended).toBeGreaterThan(0);
      // The seam question — "was this person in a room today?" — has to answer
      // yes for every chair. Reading `session.clientId` answers it for seat 0
      // only, and silently bills the rest for a day they were not idle.
      expect(c.daysSinceSession, `${c.handle} was counted as unseen`).toBe(0);
      // Attendance recovers patience; an idle day spends it. Nobody in the room
      // may come out of the night below where they went in.
      expect(c.patience, `${c.handle} lost patience on a day they attended`).toBeGreaterThanOrEqual(60);
    }
  });
});

describe('booking a room', () => {
  it('refuses to open a room with nobody else in it', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(13, 1);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: [clients[0].id],
      therapistId: therapist.id,
      slot: 1,
    });
    expect(state.schedule).toHaveLength(0);
    expect(GROUP_MIN_MEMBERS).toBeGreaterThan(1);
  });

  // The rule has to hold on the way *out* of a room as well as into one. A
  // circle of one bills the group rate for an individual hour and moves at the
  // group's slower pace — the player pays for it without being told, which is
  // the one thing this game's session reporting exists to prevent.
  it('dissolves the room rather than leaving one person in it', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(15, 2);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 1,
    });
    const sessionId = state.schedule[0].id;

    game.dispatch({ type: 'LEAVE_GROUP_SESSION', sessionId, clientId: clients[0].id });

    expect(state.schedule.find((x) => x.id === sessionId)).toBeUndefined();
    // …and the person left behind gets their hour back, not a silent downgrade.
    expect(clientBooked(state, clients[1].id)).toBe(false);
    expect(state.log.some((l) => /circle came apart/i.test(l.text))).toBe(true);
  });

  it('drops a pair-turned-single when one of them is cured or leaves', () => {
    const { state, therapist, clients } = practiceWithGroupRoom(16, 3);
    const game = new Game(state, new EventBus());
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.slice(0, 2).map((c) => c.id),
      therapistId: therapist.id,
      slot: 2,
    });
    expect(sessionMembers(state.schedule[0]).length).toBe(2);

    detachClientFromSchedule(state, clients[0].id);

    expect(state.schedule).toHaveLength(0);
    expect(clientBooked(state, clients[1].id)).toBe(false);
  });

  it('BOOK_SESSION on a group client opens the room and fills the other chairs', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(14, 4);
    game.dispatch({
      type: 'BOOK_SESSION',
      clientId: clients[0].id,
      therapistId: therapist.id,
      slot: 1,
    });
    expect(state.schedule).toHaveLength(1);
    expect(state.schedule[0].type).toBe('group');
    expect(sessionMembers(state.schedule[0]).length).toBe(4);
    for (const c of clients) expect(clientBooked(state, c.id)).toBe(true);
  });

  it('booking into a slot that already holds a room joins it rather than failing', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(15, 4);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: [clients[0].id, clients[1].id],
      therapistId: therapist.id,
      slot: 3,
    });
    expect(sessionMembers(state.schedule[0])).toHaveLength(2);

    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: [clients[2].id],
      therapistId: therapist.id,
      slot: 3,
    });
    expect(state.schedule).toHaveLength(1);
    expect(sessionMembers(state.schedule[0])).toHaveLength(3);
    expect(groupSessionAt(state, therapist.id, 3)).toBeDefined();
  });

  it('never seats more than the room holds, and never seats anyone twice', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(16, GROUP_MAX_MEMBERS + 3);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    const seated = sessionMembers(state.schedule[0]);
    expect(seated.length).toBe(GROUP_MAX_MEMBERS);
    expect(new Set(seated).size).toBe(seated.length);

    // Somebody already in the room cannot also be booked elsewhere.
    game.dispatch({
      type: 'BOOK_SESSION',
      clientId: seated[0],
      therapistId: therapist.id,
      slot: 5,
    });
    expect(state.schedule.filter((x) => sessionIncludes(x, seated[0]))).toHaveLength(1);
  });

  it('LEAVE_GROUP_SESSION takes one chair back, and the last one cancels the hour', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(17, 3);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    const sessionId = state.schedule[0].id;

    game.dispatch({ type: 'LEAVE_GROUP_SESSION', sessionId, clientId: clients[0].id });
    expect(sessionMembers(state.schedule[0])).toHaveLength(2);
    expect(clientBooked(state, clients[0].id)).toBe(false);

    game.dispatch({ type: 'LEAVE_GROUP_SESSION', sessionId, clientId: clients[1].id });
    game.dispatch({ type: 'LEAVE_GROUP_SESSION', sessionId, clientId: clients[2].id });
    expect(state.schedule).toHaveLength(0);
  });

  it('somebody leaving the caseload empties their chair, not the room', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(18, 4);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    detachClientFromSchedule(state, clients[1].id);
    expect(state.schedule).toHaveLength(1);
    expect(sessionMembers(state.schedule[0])).toHaveLength(3);
    expect(sessionIncludes(state.schedule[0], clients[1].id)).toBe(false);
    // The session is still filed under somebody who is actually in it.
    expect(sessionMembers(state.schedule[0])[0]).toBe(state.schedule[0].clientId);
  });

  it('a referred-out member leaves the room and the rest of the hour survives', () => {
    const { game, state, therapist, clients } = practiceWithGroupRoom(19, 3);
    game.dispatch({
      type: 'BOOK_GROUP_SESSION',
      clientIds: clients.map((c) => c.id),
      therapistId: therapist.id,
      slot: 0,
    });
    game.dispatch({ type: 'REFER_OUT', clientId: clients[2].id });
    expect(state.schedule).toHaveLength(1);
    expect(sessionMembers(state.schedule[0])).toHaveLength(2);
  });
});

describe('the auto-scheduler forms groups', () => {
  it('batches waiting group clients into rooms and leaves nobody sitting alone in one', () => {
    for (let seed = 20; seed < 26; seed++) {
      const { state, game } = practiceWithGroupRoom(seed, 7);
      autofillSchedule(state, game.rng);
      const rooms = state.schedule.filter((x) => x.type === 'group');
      expect(rooms.length).toBeGreaterThan(0);
      for (const room of rooms) {
        const n = sessionMembers(room).length;
        expect(n).toBeGreaterThanOrEqual(GROUP_MIN_MEMBERS);
        expect(n).toBeLessThanOrEqual(GROUP_MAX_MEMBERS);
      }
      // Nobody is in two rooms at once.
      const seen = new Set<string>();
      for (const room of state.schedule) {
        for (const id of sessionMembers(room)) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    }
  });

  it('leaves a lone group client unbooked rather than running a group of one', () => {
    const { state, game } = practiceWithGroupRoom(27, 1);
    autofillSchedule(state, game.rng);
    expect(state.schedule.filter((x) => x.type === 'group')).toHaveLength(0);
  });
});

describe('couples and family are one case with several people in it', () => {
  it('carry the companions and the higher fee on a single client record', () => {
    const s = freshState(30);
    const rng = Rng.fromSeed(30);
    const couple = generateClient(s, rng, { sessionType: 'couples' });
    const family = generateClient(s, rng, { sessionType: 'family' });

    expect(couple.partnerHandles).toHaveLength(1);
    expect(family.partnerHandles).toHaveLength(2);
    expect(SESSION_TYPE_RATE_MULT.couples).toBeGreaterThan(1);
    expect(SESSION_TYPE_RATE_MULT.family).toBeGreaterThan(SESSION_TYPE_RATE_MULT.couples);
    // One record, one arc — never a multi-member session.
    const sess = mkSession({ clientId: couple.id, therapistId: s.therapists[0].id, type: 'couples' });
    expect(sessionMembers(sess)).toHaveLength(1);
  });

  it('a family referral is filed under a young person, and one who could plausibly present that way', () => {
    const s = freshState(31);
    const rng = Rng.fromSeed(31);
    for (let i = 0; i < 60; i++) {
      const c = generateClient(s, rng, { sessionType: 'family' });
      expect(c.age).toBeLessThanOrEqual(17);
      expect(c.condition).not.toBe('burnout');
      expect(c.condition).not.toBe('substance');
    }
  });

  it('couples referrals lean hard toward what couples actually come in for', () => {
    const s = freshState(32);
    s.reputation = 60;
    const rng = Rng.fromSeed(32);
    let relationship = 0;
    for (let i = 0; i < 200; i++) {
      if (generateClient(s, rng, { sessionType: 'couples' }).condition === 'relationship') relationship++;
    }
    expect(relationship / 200).toBeGreaterThan(0.4);
  });
});

describe('the referral path', () => {
  it('never sends a specialty case to a practice that cannot hold one', () => {
    const game = Game.create({ seed: 40, skipTutorial: true });
    const s = game.state;
    for (let day = 0; day < 90; day++) {
      game.dispatch({ type: 'START_DAY' });
      game.dispatch({ type: 'END_DAY' });
      game.dispatch({ type: 'END_DAY' });
      for (const p of [...s.pendingEvents]) {
        game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      }
    }
    expect(s.upgrades).toHaveLength(0);
    expect(s.clients.every((c) => c.sessionType === 'individual')).toBe(true);
  });

  it('buying a certification changes who arrives, the same week', () => {
    const game = Game.create({ seed: 41, skipTutorial: true });
    const s = game.state;
    s.practiceLevel = 4;
    s.cash = 40_000;

    game.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'up_couples_certification' });
    expect(s.clients.some((c) => c.sessionType === 'couples')).toBe(true);

    game.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'up_group_room' });
    const cohort = s.clients.filter((c) => c.sessionType === 'group');
    expect(cohort.length).toBeGreaterThanOrEqual(GROUP_MIN_MEMBERS);
  });

  it('gives specialty work a real share of referrals without taking the practice over', () => {
    const mix: Record<string, number> = {};
    for (let seed = 60; seed < 64; seed++) {
      const bus = new EventBus();
      const game = Game.create({ seed, skipTutorial: true }, bus);
      const s = game.state;
      s.practiceLevel = 6;
      s.cash = 200_000;
      game.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'up_couples_certification' });
      game.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'up_family_certification' });
      game.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'up_group_room' });

      // Everyone who comes through the door from here on, counted as they arrive
      // — the caseload itself is a poor proxy, because who stays is a different
      // question from who is referred.
      bus.on('CLIENT_ARRIVED', ({ clientId }) => {
        const c = s.clients.find((x) => x.id === clientId);
        if (c) mix[c.sessionType] = (mix[c.sessionType] ?? 0) + 1;
      });

      for (let day = 0; day < 150; day++) {
        game.dispatch({ type: 'START_DAY' });
        game.dispatch({ type: 'END_DAY' });
        game.dispatch({ type: 'END_DAY' });
        for (const p of [...s.pendingEvents]) {
          game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
        }
        // Keep the waitlist moving so referrals keep coming.
        for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
          game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
        }
      }
    }

    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    // Every kind of room is reachable…
    for (const ty of ['couples', 'family', 'group'] as const) {
      expect(mix[ty] ?? 0).toBeGreaterThan(0);
    }
    // …and individual work is still what the practice mostly does.
    expect((mix.individual ?? 0) / total).toBeGreaterThan(0.6);
    expect((mix.couples ?? 0) / total).toBeLessThan(0.2);
  });
});

describe('saves', () => {
  it('migrates a v7 schedule into rooms of one', () => {
    const s = freshState(50);
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.version = 7;
    raw.schedule = [{ id: 'old_1', clientId: 'c_9', therapistId: 't_1', slot: 0, focus: 'build_skills', type: 'individual', status: 'scheduled', t: 0 }];

    const migrated = migrate(raw);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.schedule[0].memberIds).toEqual(['c_9']);
    expect(sessionMembers(migrated.schedule[0])).toEqual(['c_9']);
  });
});
