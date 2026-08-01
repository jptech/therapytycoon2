import { describe, it, expect } from 'vitest';
import { TRAININGS, trainingById } from '../content';
import { SAVE_VERSION } from './balance';
import { Game, createInitialState } from './engine';
import { certificationsFor, generateTherapist } from './generators';
import { meetsRequirement } from './eventsys';
import { Rng } from './rng';
import { migrate } from './save';
import type { CareerStage, GameState, Therapist } from './types';

/**
 * Continuing education must never sell a Saturday somebody has already spent.
 *
 * A therapist is generated holding the cards their modality and seniority say
 * they should have — which are, card for card, what the tier-1 course grants.
 * Training eligibility filters on `certifications`, so if those two facts are
 * allowed to disagree the list offers a course that costs a fee and a day of
 * cleared caseload and grants nothing. That is the no-hidden-punishments
 * commitment in the small, and it is the thing these tests hold in place.
 */

const STAGES: CareerStage[] = ['junior', 'mid', 'veteran'];

function freshState(seed = 7): GameState {
  return createInitialState({ seed, skipTutorial: true });
}

/** The courses the training list would offer this therapist right now. */
function offered(s: GameState, t: Therapist) {
  return TRAININGS.filter((tr) => !t.certifications.includes(tr.id) && meetsRequirement(s, tr.requires, t));
}

/** One whole day and out the far side of the overnight pass, via dispatch only. */
function advanceDay(game: Game): void {
  const s = game.state;
  if (s.dayPhase !== 'day_end') {
    game.dispatch({ type: 'START_DAY' });
    let guard = 0;
    while (s.dayPhase === 'running' && guard++ < 500) {
      const p = s.pendingEvents[0];
      if (p?.techniqueCards?.length) {
        game.dispatch({
          type: 'CHOOSE_TECHNIQUE',
          instanceId: p.instanceId,
          techniqueId: p.techniqueCards[0].techniqueId,
        });
      } else if (p) {
        game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: p.choices[0].id });
      } else {
        game.dispatch({ type: 'TICK', dtMinutes: 30 });
      }
    }
  }
  game.dispatch({ type: 'END_DAY' });
}

describe('a therapist arrives certified in what they can already do', () => {
  it('never offers a course whose every card they already hold', () => {
    const s = freshState();
    // A wide sweep rather than one roll: the trap only appears for the modality
    // and seniority the dice happen to pick.
    for (const stage of STAGES) {
      for (let seed = 0; seed < 60; seed++) {
        const t = generateTherapist(s, Rng.fromSeed(seed), { stage });
        for (const tr of offered(s, t)) {
          const dead = tr.grants.every((g) => t.techniques.includes(g));
          expect(dead, `${stage} ${t.modality}: ${tr.name} grants nothing`).toBe(false);
        }
      }
    }
  });

  it('certifies the tier-1 course of their own modality', () => {
    const s = freshState();
    for (let seed = 0; seed < 40; seed++) {
      const t = generateTherapist(s, Rng.fromSeed(seed), { stage: 'junior' });
      const tier1 = TRAININGS.find((tr) => tr.modality === t.modality && tr.tier === 1);
      expect(tier1).toBeTruthy();
      expect(t.certifications).toContain(tier1!.id);
    }
  });

  it('leaves a part-finished tier genuinely worth sending them on', () => {
    const s = freshState();
    // A mid-career hire gets one of the two tier-2 cards, so the tier-2 course
    // still has something to teach them and must stay on the list.
    let sawPartial = false;
    for (let seed = 0; seed < 40; seed++) {
      const t = generateTherapist(s, Rng.fromSeed(seed), { stage: 'mid' });
      const tier2 = TRAININGS.find((tr) => tr.modality === t.modality && tr.tier === 2);
      if (!tier2 || tier2.grants.every((g) => t.techniques.includes(g))) continue;
      sawPartial = true;
      expect(t.certifications).not.toContain(tier2.id);
      expect(tier2.grants.some((g) => t.techniques.includes(g))).toBe(true);
    }
    expect(sawPartial).toBe(true);
  });

  it('certifies nothing a therapist cannot actually do', () => {
    const s = freshState();
    for (const stage of STAGES) {
      for (let seed = 0; seed < 30; seed++) {
        const t = generateTherapist(s, Rng.fromSeed(seed), { stage });
        for (const id of t.certifications) {
          const tr = trainingById[id];
          expect(tr, `unknown certification ${id}`).toBeTruthy();
          for (const g of tr.grants) expect(t.techniques).toContain(g);
        }
      }
    }
  });
});

describe('certificationsFor', () => {
  it('is all-or-nothing per course', () => {
    const cbt1 = trainingById['train_cbt_1'];
    expect(certificationsFor(cbt1.grants)).toContain('train_cbt_1');
    expect(certificationsFor(cbt1.grants.slice(0, 1))).not.toContain('train_cbt_1');
    expect(certificationsFor([])).toEqual([]);
  });
});

describe('completing a course', () => {
  it('records the certification and grants only the missing cards', () => {
    const game = new Game(freshState(3));
    const s = game.state;
    const t = s.therapists[0];
    const tr = TRAININGS.find((x) => x.modality === t.modality && x.tier === 1)!;

    // Force the case the old code got wrong: sent on a course they finished.
    t.certifications = t.certifications.filter((id) => id !== tr.id);
    t.status = 'available';
    s.cash = 99_999;
    const before = [...t.techniques];

    game.dispatch({ type: 'START_TRAINING', therapistId: t.id, trainingId: tr.id });
    expect(t.status).toBe('training');
    // Walk it out the far side.
    for (let i = 0; i < tr.days + 3 && t.status !== 'available'; i++) advanceDay(game);

    expect(t.certifications).toContain(tr.id);
    // No duplicates: the cards they already had stay single.
    expect(new Set(t.techniques).size).toBe(t.techniques.length);
    for (const g of before) expect(t.techniques).toContain(g);
  });
});

describe('save migration', () => {
  it('back-fills certifications on an old save', () => {
    const s = freshState();
    const t = s.therapists[0];
    const tier1 = TRAININGS.find((tr) => tr.modality === t.modality && tr.tier === 1)!;

    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    old.version = SAVE_VERSION - 1;
    (old.therapists as Therapist[])[0].certifications = [];

    const migrated = migrate(old);
    expect(migrated.therapists[0].certifications).toContain(tier1.id);
  });

  it('back-fills candidates on the hire board too', () => {
    const s = freshState();
    const cand = s.candidates[0];
    if (!cand) return; // a fresh state may open with an empty board
    const tier1 = TRAININGS.find(
      (tr) => tr.modality === cand.therapist.modality && tr.tier === 1,
    )!;

    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    old.version = SAVE_VERSION - 1;
    (old.candidates as { therapist: Therapist }[])[0].therapist.certifications = [];

    const migrated = migrate(old);
    expect(migrated.candidates[0].therapist.certifications).toContain(tier1.id);
  });
});
