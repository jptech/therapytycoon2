import { describe, expect, it } from 'vitest';
import { EventBus } from './bus';
import { Game, capacity } from './engine';
import { autofillSchedule } from './scheduler';
import { pendingChoice, pendingDecision } from './pending';
import type { GameState } from './types';

/**
 * Liveness tests for the day loop.
 *
 * `tick()` deliberately refuses to advance time while any event is pending, so
 * a decision can never be skipped. The cost of that design is that a pending
 * event nobody can resolve freezes the game outright — and silently, because
 * pause/play has no effect on it. These tests drive the sim exactly the way the
 * browser clock does and assert that time can always move again.
 */

/** Resolve whichever modal the UI would actually be showing. */
function resolveVisible(game: Game): boolean {
  const s = game.state;
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
}

function describeStuck(s: GameState): string {
  return JSON.stringify({
    day: s.day,
    minute: s.minute,
    phase: s.dayPhase,
    paused: s.paused,
    pending: s.pendingEvents.map((p) => ({ id: p.def.id, cards: p.techniqueCards?.length })),
    unfinished: s.schedule
      .filter((x) => x.status === 'scheduled' || x.status === 'active')
      .map((x) => ({ slot: x.slot, status: x.status, tech: x.techniqueUsed })),
  });
}

/** Plays `days` days at a fixed tick size, failing loudly on any stall. */
function playDays(seed: number, days: number, dt: number, autoPause: boolean): void {
  const game = Game.create({ seed, difficulty: 'standard', skipTutorial: true }, new EventBus());
  const s = game.state;
  game.dispatch({ type: 'SET_SETTING', key: 'autoPauseOnEvent', value: autoPause });

  for (let d = 0; d < days && !s.ended; d++) {
    let guard = 0;
    while (s.pendingEvents.length && guard++ < 60) {
      expect(resolveVisible(game), `morning: no modal would render — ${describeStuck(s)}`).toBe(true);
    }

    for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
      if (s.clients.filter((x) => x.status === 'active').length >= capacity(s)) break;
      game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
    }
    if (s.candidates.length && s.cash > s.candidates[0].askingSalary * 3 + 2000) {
      game.dispatch({ type: 'HIRE', candidateId: s.candidates[0].therapist.id });
    }
    autofillSchedule(s, game.rng);
    game.dispatch({ type: 'START_DAY' });

    // The browser clock: fixed ticks, and modals resolved only when one would
    // actually be on screen.
    let ticks = 0;
    const maxTicks = Math.ceil(600 / dt) + 120;
    while (s.dayPhase === 'running') {
      if (s.pendingEvents.length) {
        expect(
          resolveVisible(game),
          `the clock is blocked but no modal would render — ${describeStuck(s)}`,
        ).toBe(true);
        continue;
      }
      game.dispatch({ type: 'TICK', dtMinutes: dt });
      expect(++ticks, `the day never ended — ${describeStuck(s)}`).toBeLessThan(maxTicks);
    }

    game.dispatch({ type: 'END_DAY' });
  }
}

describe('day loop liveness', () => {
  it('never blocks the clock with an event no modal would render (4x speed)', () => {
    for (let seed = 1; seed <= 25; seed++) playDays(seed, 20, 10, true);
  });

  it('never blocks the clock at 1x tick granularity', () => {
    for (let seed = 40; seed <= 52; seed++) playDays(seed, 14, 1, true);
  });

  it('never blocks the clock with auto-pause disabled', () => {
    for (let seed = 90; seed <= 100; seed++) playDays(seed, 14, 3, false);
  });

  it('always reaches day end even when every session is booked', () => {
    const game = Game.create({ seed: 777, difficulty: 'standard', skipTutorial: true }, new EventBus());
    const s = game.state;
    for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
      game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
    }
    autofillSchedule(s, game.rng);
    game.dispatch({ type: 'START_DAY' });

    let guard = 0;
    while (s.dayPhase === 'running' && guard++ < 900) {
      if (s.pendingEvents.length) resolveVisible(game);
      else game.dispatch({ type: 'TICK', dtMinutes: 10 });
    }
    expect(s.dayPhase, describeStuck(s)).toBe('day_end');
    expect(s.schedule.every((x) => x.status !== 'scheduled' && x.status !== 'active')).toBe(true);
  });

  it('a resolved decision always hands the clock back', () => {
    const game = Game.create({ seed: 4242, difficulty: 'standard', skipTutorial: true }, new EventBus());
    const s = game.state;
    for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
      game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
    }
    autofillSchedule(s, game.rng);
    game.dispatch({ type: 'START_DAY' });

    let sawDecision = false;
    for (let i = 0; i < 400 && s.dayPhase === 'running'; i++) {
      const decision = pendingDecision(s);
      if (decision) {
        sawDecision = true;
        const before = s.minute;
        game.dispatch({
          type: 'CHOOSE_TECHNIQUE',
          instanceId: decision.instanceId,
          techniqueId: decision.techniqueCards![0].techniqueId,
        });
        // Either the clock is free again, or another modal is now showing.
        const blocked = s.pendingEvents.length > 0;
        expect(blocked || !s.paused, `stuck after choosing — ${describeStuck(s)}`).toBe(true);
        if (!blocked) {
          game.dispatch({ type: 'TICK', dtMinutes: 10 });
          expect(s.minute, 'time did not advance after resolving a decision').toBeGreaterThan(before);
        }
        continue;
      }
      if (s.pendingEvents.length) resolveVisible(game);
      else game.dispatch({ type: 'TICK', dtMinutes: 10 });
    }
    expect(sawDecision, 'no session decision fired — the test covered nothing').toBe(true);
  });
});
