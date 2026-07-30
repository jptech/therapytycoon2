import { describe, expect, it } from 'vitest';
import { EVENT_COOLDOWN_DAYS, EVENT_MAX_DEFERRALS } from './balance';
import { EventBus } from './bus';
import { Game, capacity } from './engine';
import { eventSubject, raiseEvent, raiseEventById } from './eventsys';
import { pendingChoice, pendingDecision } from './pending';
import { autofillSchedule } from './scheduler';
import type { GameEventDef, GameState } from './types';

/**
 * The repeat contract for scripted event raises.
 *
 * `pickEvent` has always refused to draw an event inside its cooldown, but
 * `raiseEvent` only ever *set* the window, so every scripted raise walked
 * through one: the same client could be asked whether she wanted to stop
 * therapy twice in six days, and two clients' insurance running out on the same
 * Tuesday produced two identical letters that morning.
 *
 * The fix has two halves and both are load-bearing, so both are tested here:
 *
 *   1. the same conversation about the same person does not come round again
 *      inside `EVENT_COOLDOWN_DAYS[scope]`, and
 *   2. nothing an arc beat promised is ever silently thrown away for it. A
 *      beat that cannot land today is re-queued for the day the window lifts,
 *      and after `EVENT_MAX_DEFERRALS` push-backs it lands anyway.
 *
 * Half 2 is the reason this file exists at all. The obvious fix — return
 * `undefined` when the window is live — passes every assertion in half 1 and
 * quietly deletes `ev_client_brings_partner` for the whole build, because no
 * caller on the `queuedEvents` path reads the return value.
 */

function testDef(over: Partial<GameEventDef> = {}): GameEventDef {
  return {
    id: 'ev_client_asks_to_end',
    scope: 'client',
    title: 'A conversation',
    body: 'Something about {client}.',
    weight: 1,
    choices: [{ id: 'ok', label: 'Sit with it', effects: {} }],
    ...over,
  };
}

/** A practice with people in it — day one starts with everybody still on the waitlist. */
function newGame(seed = 31): Game {
  const game = Game.create({ seed, difficulty: 'standard', skipTutorial: true }, new EventBus());
  for (const c of game.state.clients.filter((x) => x.status === 'waitlist').slice(0, 3)) {
    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
  }
  return game;
}

/** Ids of the clients the practice is actually seeing. */
function activeIds(s: GameState): string[] {
  return s.clients.filter((c) => c.status === 'active').map((c) => c.id);
}

/** Close the books and wake up tomorrow — the morning the queue is drained. */
function sleep(game: Game): void {
  game.dispatch({ type: 'END_DAY' }); // → day_end
  game.dispatch({ type: 'END_DAY' }); // → tomorrow morning
}

describe('scripted raises and the subject cooldown', () => {
  it('will not hand the same client the same conversation twice inside the window', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef();

    expect(raiseEvent(s, def, { clientId: a }, game.rng)).toBeDefined();
    s.pendingEvents = []; // the player answered it
    s.day += 6;

    expect(raiseEvent(s, def, { clientId: a }, game.rng)).toBeUndefined();
    expect(s.pendingEvents).toHaveLength(0);
  });

  it('re-queues the beat it declined, for the day the window lifts', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef();

    raiseEvent(s, def, { clientId: a }, game.rng);
    s.pendingEvents = [];
    const raisedOn = s.day;
    s.day += 6;
    raiseEvent(s, def, { clientId: a }, game.rng);

    expect(s.queuedEvents).toHaveLength(1);
    expect(s.queuedEvents[0]).toMatchObject({
      eventId: def.id,
      clientId: a,
      day: raisedOn + EVENT_COOLDOWN_DAYS.client,
      deferrals: 1,
    });
  });

  it('lets the deferred beat land once the window has lifted', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef();

    raiseEvent(s, def, { clientId: a }, game.rng);
    s.pendingEvents = [];
    raiseEvent(s, def, { clientId: a }, game.rng);
    const [queued] = s.queuedEvents;

    s.day = queued.day;
    expect(
      raiseEvent(s, def, { clientId: a, deferrals: queued.deferrals }, game.rng),
      'the beat was deferred and then never allowed to arrive',
    ).toBeDefined();
  });

  it('delivers a beat that has run out of push-backs rather than losing it', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef();

    raiseEvent(s, def, { clientId: a }, game.rng);
    s.pendingEvents = [];
    s.day += 1;

    // Still deep inside the window, and already pushed back its limit.
    const landed = raiseEvent(s, def, { clientId: a, deferrals: EVENT_MAX_DEFERRALS }, game.rng);
    expect(landed, 'a beat delayed forever is a beat deleted').toBeDefined();
    expect(s.queuedEvents).toHaveLength(0);
  });

  it('drops an ambient raise instead of saving it for later', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef();

    raiseEvent(s, def, { clientId: a }, game.rng);
    s.pendingEvents = [];
    s.day += 3;

    expect(raiseEvent(s, def, { clientId: a, onRepeat: 'skip' }, game.rng)).toBeUndefined();
    expect(s.queuedEvents, 'an ambient nudge promised nothing, so nothing is owed').toHaveLength(0);
  });

  it('never stacks a second copy of a modal already on screen', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef();

    raiseEvent(s, def, { clientId: a }, game.rng);
    expect(raiseEvent(s, def, { clientId: a }, game.rng)).toBeUndefined();
    expect(s.pendingEvents).toHaveLength(1);
    expect(s.queuedEvents, 'a duplicate of an unanswered modal is not a beat worth keeping').toHaveLength(0);
  });

  it('still lets the same template reach a different person the same week', () => {
    const game = newGame();
    const s = game.state;
    const [a, b] = activeIds(s);
    const def = testDef();

    expect(raiseEvent(s, def, { clientId: a }, game.rng)).toBeDefined();
    s.pendingEvents = [];
    s.day += 2;
    // Two clients reaching the same chapter in the same fortnight is what a
    // per-client arc *is*. Suppressing this would hollow out the content.
    expect(raiseEvent(s, def, { clientId: b }, game.rng)).toBeDefined();
  });

  it('does not put two of the same conversation on screen in one morning', () => {
    const game = newGame();
    const s = game.state;
    const [a, b] = activeIds(s);
    const def = testDef();

    expect(raiseEvent(s, def, { clientId: a }, game.rng)).toBeDefined();
    // Different person, same template, same drain of the queue: "I think I'm
    // done" twice before breakfast reads as a bug however true it is.
    expect(raiseEvent(s, def, { clientId: b }, game.rng)).toBeUndefined();
    expect(s.queuedEvents[0]).toMatchObject({ eventId: def.id, clientId: b, day: s.day + 1, deferrals: 1 });
  });

  it('lets an urgent event through, because a late crisis call is a broken promise', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    const def = testDef({ id: 'ev_client_crisis_call', urgent: true });

    raiseEvent(s, def, { clientId: a }, game.rng);
    s.pendingEvents = [];
    s.day += 1;
    expect(raiseEvent(s, def, { clientId: a }, game.rng)).toBeDefined();
  });

  it('scopes the subject by the event, not by whoever rode along on the raise', () => {
    const game = newGame();
    const s = game.state;
    const [a, b] = activeIds(s);
    // A practice-wide letter triggered by one client's authorisation running
    // out is still about the practice: the second client does not buy a second
    // copy of it.
    const def = testDef({ id: 'ev_practice_insurance_renegotiation', scope: 'practice' });
    expect(eventSubject('practice', { clientId: a })).toBe('practice');

    expect(raiseEvent(s, def, { clientId: a, onRepeat: 'skip' }, game.rng)).toBeDefined();
    s.pendingEvents = [];
    expect(raiseEvent(s, def, { clientId: b, onRepeat: 'skip' }, game.rng)).toBeUndefined();
  });

  it('sweeps windows that have lifted so the map cannot grow with the client list', () => {
    const game = newGame();
    const s = game.state;
    const ids = activeIds(s);
    for (const id of ids) {
      raiseEvent(s, testDef(), { clientId: id }, game.rng);
      s.pendingEvents = []; // answered, so the next one is not a same-morning repeat
    }
    const held = ids.map((id) => `${testDef().id}@${id}`);
    expect(held.every((k) => k in s.subjectCooldowns)).toBe(true);

    s.day += EVENT_COOLDOWN_DAYS.client + 1;
    sleep(game);
    expect(held.some((k) => k in s.subjectCooldowns)).toBe(false);
  });
});

describe('queued beats whose subject has left', () => {
  it('does not raise a conversation about a client who is no longer in the practice', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    s.queuedEvents.push({ eventId: 'ev_client_asks_to_end', day: s.day, clientId: a });
    // She graduated between the beat and the morning it was due.
    s.clients = s.clients.filter((c) => c.id !== a);

    sleep(game);
    expect(
      s.pendingEvents.some((p) => p.def.id === 'ev_client_asks_to_end'),
      'a beat addressed to nobody renders "your client" and reads as a bug',
    ).toBe(false);
  });

  it('still raises it for a client who is still in the room', () => {
    const game = newGame();
    const s = game.state;
    const [a] = activeIds(s);
    s.queuedEvents.push({ eventId: 'ev_client_asks_to_end', day: s.day, clientId: a });

    sleep(game);
    expect(s.pendingEvents.some((p) => p.def.id === 'ev_client_asks_to_end' && p.clientId === a)).toBe(true);
  });

  it('raises an unknown id nowhere, and says so by leaving no trace', () => {
    // The oldest failure in this file's family: `raiseEventById` no-ops on an
    // unknown id. Kept as a tripwire — `content.test.ts` is what prevents it.
    const game = newGame();
    const s = game.state;
    expect(raiseEventById(s, 'ev_does_not_exist', {}, game.rng)).toBeUndefined();
  });
});

/**
 * The end-to-end version of the same assertion the balance harness makes, small
 * enough to run on every commit: play real days, watch every modal that goes up,
 * and fail if one person is handed the same dilemma twice inside its window.
 */
describe('a played run never repeats a conversation with the same person', () => {
  it('holds across 40 days and a dozen seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const game = newGame(seed);
      const s = game.state;
      const lastSeen = new Map<string, number>();
      const seen = new Set<string>();
      const offences: string[] = [];

      const watch = () => {
        for (const p of s.pendingEvents) {
          if (p.def.scope === 'session' || p.def.once) continue;
          if (seen.has(p.instanceId)) continue;
          seen.add(p.instanceId);
          const subject = eventSubject(p.def.scope, p);
          const key = `${p.def.id}@${subject}`;
          const cooldown = EVENT_COOLDOWN_DAYS[p.def.scope] ?? 0;
          const prev = lastSeen.get(key);
          if (prev !== undefined && s.day - prev < cooldown && !p.def.urgent) {
            offences.push(`seed ${seed}: "${p.def.id}" for ${subject} again after ${s.day - prev}d`);
          }
          lastSeen.set(key, s.day);
        }
      };

      const resolveVisible = (): boolean => {
        watch();
        const decision = pendingDecision(s);
        if (decision) {
          game.dispatch({
            type: 'CHOOSE_TECHNIQUE',
            instanceId: decision.instanceId,
            techniqueId: decision.techniqueCards![0].techniqueId,
          });
          return true;
        }
        const choice = pendingChoice(s);
        if (choice) {
          game.dispatch({ type: 'RESOLVE_EVENT', instanceId: choice.instanceId, choiceId: choice.choices[0].id });
          return true;
        }
        return false;
      };

      for (let d = 0; d < 40 && !s.ended; d++) {
        let guard = 0;
        while (s.pendingEvents.length && guard++ < 60) resolveVisible();

        for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
          if (s.clients.filter((x) => x.status === 'active').length >= capacity(s)) break;
          game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
        }
        if (s.candidates.length && s.cash > s.candidates[0].askingSalary * 3 + 2000) {
          game.dispatch({ type: 'HIRE', candidateId: s.candidates[0].therapist.id });
        }
        autofillSchedule(s, game.rng);
        game.dispatch({ type: 'START_DAY' });

        let ticks = 0;
        while (s.dayPhase === 'running' && ticks++ < 400) {
          if (s.pendingEvents.length) resolveVisible();
          else game.dispatch({ type: 'TICK', dtMinutes: 10 });
        }
        game.dispatch({ type: 'END_DAY' });
      }

      expect(offences, offences.join('\n')).toHaveLength(0);
      expect(seen.size, `seed ${seed} raised no events at all — the test covered nothing`).toBeGreaterThan(0);
    }
  });
});
