import { describe, it, expect } from 'vitest';
import {
  compress,
  computeQuality,
  focusFit,
  gradeFor,
  regressionChance,
  skillCap,
  specializationFit,
  techniqueFit,
  upgradeQuality,
} from './quality';
import {
  DIMINISH_KNEE,
  FOCUSES,
  SESSION_VARIANCE,
  SKILL_CAP_BY_LEVEL,
} from './balance';
import { createInitialState } from './engine';
import { generateClient, generateTherapist } from './generators';
import { Rng } from './rng';
import { TECHNIQUES, UPGRADES, PHILOSOPHIES, modalityById } from '../content';
import type { Client, ConditionId, GameState, SessionFocus, Technique, Therapist } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures. Everything is built through the public generators from a seeded
// state, then nudged into the exact shape a given assertion needs.
// ─────────────────────────────────────────────────────────────────────────────

function freshState(seed = 1): GameState {
  return createInitialState({ seed, skipTutorial: true });
}

function makeTherapist(state: GameState, seed: number, over: Partial<Therapist> = {}): Therapist {
  const t = generateTherapist(state, Rng.fromSeed(seed), { stage: 'mid' });
  return Object.assign(t, over);
}

function makeClient(state: GameState, seed: number, over: Partial<Client> = {}): Client {
  const c = generateClient(state, Rng.fromSeed(seed), {});
  c.preferredModality = undefined;
  c.comorbidities = [];
  c.complex = false;
  return Object.assign(c, over);
}

/** A synthetic technique so a single term can be isolated from the rest. */
function tech(over: Partial<Technique> = {}): Technique {
  return {
    id: 'test_tech',
    name: 'Test Technique',
    modality: 'cbt',
    tier: 1,
    blurb: '',
    flavor: '',
    effects: {},
    ...over,
  };
}

describe('compress', () => {
  it('is the identity below the knee', () => {
    for (let raw = 0; raw <= DIMINISH_KNEE; raw += 0.01) {
      expect(compress(raw, 0.9)).toBeCloseTo(raw, 10);
    }
    expect(compress(DIMINISH_KNEE, 0.9)).toBeCloseTo(DIMINISH_KNEE, 10);
  });

  it('is monotonically non-decreasing in raw', () => {
    for (const cap of SKILL_CAP_BY_LEVEL) {
      let prev = -Infinity;
      for (let raw = 0; raw <= 1.5; raw += 0.005) {
        const v = compress(raw, cap);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });

  it('never exceeds the cap for any practice cap above the knee', () => {
    for (const cap of SKILL_CAP_BY_LEVEL.filter((c) => c > DIMINISH_KNEE)) {
      for (let raw = 0; raw <= 3; raw += 0.005) {
        expect(compress(raw, cap)).toBeLessThanOrEqual(cap + 1e-12);
      }
    }
  });

  it('approaches the cap asymptotically instead of clamping to it', () => {
    const cap = 0.9;
    // A raw score cannot exceed 1 in practice; across that whole range the
    // result must stay strictly under the ceiling and keep moving.
    expect(compress(1, cap)).toBeLessThan(cap);
    expect(compress(1.5, cap)).toBeLessThan(cap);
    expect(compress(1.5, cap)).toBeGreaterThan(compress(1, cap));
    expect(compress(1, cap)).toBeGreaterThan(cap - 0.1);
  });

  /**
   * BUG (reported, not fixed here): `span = Math.max(0.01, cap - DIMINISH_KNEE)`
   * means that when the cap equals the knee — which is exactly the level-1 cap,
   * 0.72 — compress can return up to cap + 0.01. The cap is documented as an
   * asymptote, so nothing should ever cross it.
   */
  it.fails('never exceeds the cap when the cap equals the knee (level 1)', () => {
    const cap = skillCap(1);
    expect(cap).toBe(DIMINISH_KNEE);
    for (let raw = 0; raw <= 1.5; raw += 0.01) {
      expect(compress(raw, cap)).toBeLessThanOrEqual(cap + 1e-12);
    }
  });
});

describe('diminishing returns', () => {
  it('quality never reaches 1.0 even with a maxed-out therapist and client', () => {
    const state = freshState(2);
    state.practiceLevel = SKILL_CAP_BY_LEVEL.length; // best possible cap
    state.upgrades = UPGRADES.map((u) => u.id);
    state.philosophy = PHILOSOPHIES[0].id;

    const condition: ConditionId = modalityById.cbt.strongWith[0];
    const t = makeTherapist(state, 3, {
      modality: 'cbt',
      skill: 100,
      morale: 100,
      maxEnergy: 100,
      energy: 100,
    });
    const c = makeClient(state, 4, {
      condition,
      comorbidities: [],
      severity: 1,
      rapport: 1,
      stability: 1,
      resilience: 1,
      chapter: 'work',
      progress: 50,
      complex: false,
      preferredModality: 'cbt',
    });

    const best = TECHNIQUES.filter(
      (x) => x.modality === 'cbt' && x.goodFor?.includes(condition) && !x.poorFor?.includes(condition),
    );
    expect(best.length).toBeGreaterThan(0);

    for (const technique of best) {
      for (const focus of Object.keys(FOCUSES) as SessionFocus[]) {
        const q = computeQuality({
          state,
          therapist: t,
          client: c,
          focus,
          techniqueId: technique.id,
          slot: 2,
        }).quality;
        expect(q).toBeLessThan(1);
        expect(q).toBeLessThan(0.95);
      }
    }
  });

  it('upgradeQuality asymptotes however many upgrades are owned', () => {
    const state = freshState(5);
    state.upgrades = UPGRADES.map((u) => u.id);
    const all = upgradeQuality(state);
    expect(all).toBeGreaterThan(0);
    expect(all).toBeLessThan(0.12);

    state.upgrades = UPGRADES.slice(0, 2).map((u) => u.id);
    expect(upgradeQuality(state)).toBeLessThanOrEqual(all);
  });
});

describe('skillCap', () => {
  it('rises monotonically with practice level', () => {
    for (let level = 1; level < SKILL_CAP_BY_LEVEL.length; level++) {
      expect(skillCap(level + 1)).toBeGreaterThan(skillCap(level));
    }
  });

  it('is clamped at both ends rather than reading out of bounds', () => {
    expect(skillCap(0)).toBe(SKILL_CAP_BY_LEVEL[0]);
    expect(skillCap(-3)).toBe(SKILL_CAP_BY_LEVEL[0]);
    expect(skillCap(999)).toBe(SKILL_CAP_BY_LEVEL[SKILL_CAP_BY_LEVEL.length - 1]);
    for (let level = 1; level <= 40; level++) expect(Number.isFinite(skillCap(level))).toBe(true);
  });
});

describe('specializationFit', () => {
  const state = freshState(6);

  it('scores a matched modality far higher than a mismatched one', () => {
    const condition: ConditionId = modalityById.cbt.strongWith[0];
    const c = makeClient(state, 7, { condition, comorbidities: [] });

    const matched = makeTherapist(state, 8, { modality: 'cbt', secondaryModality: undefined });
    const mismatchedModality = Object.values(modalityById).find(
      (m) => !m.strongWith.includes(condition),
    )!;
    const mismatched = makeTherapist(state, 9, {
      modality: mismatchedModality.id,
      secondaryModality: undefined,
    });

    const good = specializationFit(matched, c);
    const bad = specializationFit(mismatched, c);
    expect(good).toBeGreaterThan(0.9);
    expect(bad).toBeLessThan(0.4);
    expect(good - bad).toBeGreaterThan(0.4);
  });

  it('comorbidities dilute the fit', () => {
    const condition: ConditionId = modalityById.cbt.strongWith[0];
    const t = makeTherapist(state, 10, { modality: 'cbt', secondaryModality: undefined });

    const clean = makeClient(state, 11, { condition, comorbidities: [] });
    const outside = (['grief', 'adhd'] as ConditionId[]).filter(
      (x) => !modalityById.cbt.strongWith.includes(x),
    );
    expect(outside).toHaveLength(2);
    const comorbid = makeClient(state, 11, { condition, comorbidities: outside });

    expect(specializationFit(t, comorbid)).toBeLessThan(specializationFit(t, clean));
  });

  it('a secondary modality partially covers a case the primary misses', () => {
    const condition: ConditionId = modalityById.dbt.strongWith[0];
    const c = makeClient(state, 12, { condition, comorbidities: [] });
    const primaryOnly = makeTherapist(state, 13, { modality: 'cbt', secondaryModality: undefined });
    const crossTrained = makeTherapist(state, 13, { modality: 'cbt', secondaryModality: 'dbt' });
    expect(specializationFit(crossTrained, c)).toBeGreaterThan(specializationFit(primaryOnly, c));
  });

  it('always returns a value in [0, 1]', () => {
    for (let seed = 0; seed < 60; seed++) {
      const t = generateTherapist(state, Rng.fromSeed(seed), {});
      const c = generateClient(state, Rng.fromSeed(seed + 500), {});
      const fit = specializationFit(t, c);
      expect(fit).toBeGreaterThanOrEqual(0);
      expect(fit).toBeLessThanOrEqual(1);
    }
  });
});

describe('focusFit', () => {
  const state = freshState(14);

  it('Process on a destabilised client scores far below Stabilize', () => {
    const c = makeClient(state, 15, { stability: 0.2, chapter: 'work', rapport: 0.6 });
    const process = focusFit('process', c);
    const stabilize = focusFit('stabilize', c);
    expect(process).toBeLessThan(0.4);
    expect(stabilize).toBeGreaterThan(0.75);
    expect(stabilize - process).toBeGreaterThan(0.4);
  });

  it('Process on a steady client in the Work chapter scores well', () => {
    const c = makeClient(state, 16, { stability: 0.8, chapter: 'work', rapport: 0.7, resilience: 0.6 });
    expect(focusFit('process', c)).toBeGreaterThan(0.75);
  });

  it('Process in the Trust chapter is worse than in the Work chapter', () => {
    const base = { stability: 0.8, rapport: 0.7, resilience: 0.6 };
    const trust = makeClient(state, 17, { ...base, chapter: 'trust' });
    const work = makeClient(state, 17, { ...base, chapter: 'work' });
    expect(focusFit('process', trust)).toBeLessThan(focusFit('process', work));
  });

  it('Stabilize is worth less on a steady client than a shaky one', () => {
    const shaky = makeClient(state, 18, { stability: 0.15 });
    const steady = makeClient(state, 18, { stability: 0.95 });
    expect(focusFit('stabilize', steady)).toBeLessThan(focusFit('stabilize', shaky));
  });

  it('always returns a value in [0, 1] across the whole stability range', () => {
    for (const focus of Object.keys(FOCUSES) as SessionFocus[]) {
      for (let stability = 0; stability <= 1.0001; stability += 0.05) {
        for (const chapter of ['trust', 'work', 'consolidation'] as const) {
          const c = makeClient(state, 19, { stability, chapter, rapport: 0.5, resilience: 0.5 });
          const fit = focusFit(focus, c);
          expect(fit).toBeGreaterThanOrEqual(0);
          expect(fit).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('techniqueFit', () => {
  const state = freshState(20);

  it('a technique listing the condition in goodFor beats one listing it in poorFor', () => {
    const c = makeClient(state, 21, {
      condition: 'anxiety',
      comorbidities: [],
      chapter: 'work',
      stability: 0.9,
    });
    const good = techniqueFit(tech({ goodFor: ['anxiety'] }), c, 'build_skills');
    const poor = techniqueFit(tech({ poorFor: ['anxiety'] }), c, 'build_skills');
    expect(good).toBeGreaterThan(poor);
    expect(good - poor).toBeGreaterThan(0.4);
  });

  it('holds for every authored technique that names both a good and a poor condition', () => {
    let checked = 0;
    for (const t of TECHNIQUES) {
      const goodFor = t.goodFor ?? [];
      const poorFor = t.poorFor ?? [];
      if (!goodFor.length || !poorFor.length) continue;
      const goodCond = goodFor.find((x) => !poorFor.includes(x));
      const poorCond = poorFor.find((x) => !goodFor.includes(x));
      if (!goodCond || !poorCond) continue;

      // Same technique, same client shape, only the presenting condition differs.
      const base = { comorbidities: [] as ConditionId[], chapter: t.chapters?.[0] ?? 'work', stability: 1 };
      const focus: SessionFocus = t.focuses?.[0] ?? 'build_skills';
      const suited = makeClient(state, 22, { ...base, condition: goodCond });
      const unsuited = makeClient(state, 22, { ...base, condition: poorCond });
      expect(techniqueFit(t, suited, focus)).toBeGreaterThan(techniqueFit(t, unsuited, focus));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('returns the neutral 0.5 when no technique has been chosen yet', () => {
    const c = makeClient(state, 23, {});
    expect(techniqueFit(undefined, c, 'process')).toBe(0.5);
  });

  it('penalises a technique used below its stability gate', () => {
    const gated = tech({ minStability: 0.7, goodFor: ['anxiety'] });
    const ready = makeClient(state, 24, { condition: 'anxiety', comorbidities: [], stability: 0.9 });
    const notReady = makeClient(state, 24, { condition: 'anxiety', comorbidities: [], stability: 0.1 });
    expect(techniqueFit(gated, notReady, 'process')).toBeLessThan(techniqueFit(gated, ready, 'process'));
  });

  it('penalises a technique used in the wrong chapter or for the wrong focus', () => {
    const c = makeClient(state, 25, { condition: 'anxiety', comorbidities: [], chapter: 'work', stability: 0.9 });
    const rightChapter = techniqueFit(tech({ chapters: ['work'] }), c, 'process');
    const wrongChapter = techniqueFit(tech({ chapters: ['consolidation'] }), c, 'process');
    expect(wrongChapter).toBeLessThan(rightChapter);

    const rightFocus = techniqueFit(tech({ focuses: ['process'] }), c, 'process');
    const wrongFocus = techniqueFit(tech({ focuses: ['stabilize'] }), c, 'process');
    expect(wrongFocus).toBeLessThan(rightFocus);
  });

  it('always returns a value in [0, 1] for every authored technique', () => {
    for (const t of TECHNIQUES) {
      for (let seed = 0; seed < 6; seed++) {
        const c = generateClient(state, Rng.fromSeed(seed * 31 + 3), {});
        for (const focus of Object.keys(FOCUSES) as SessionFocus[]) {
          const fit = techniqueFit(t, c, focus);
          expect(fit).toBeGreaterThanOrEqual(0);
          expect(fit).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('aggregate modifier clamping', () => {
  it('every upgrade owned cannot push quality above the practice cap by more than the session variance', () => {
    for (let level = 1; level <= SKILL_CAP_BY_LEVEL.length; level++) {
      const state = freshState(26);
      state.practiceLevel = level;
      state.upgrades = UPGRADES.map((u) => u.id);
      state.philosophy = PHILOSOPHIES[0].id;

      const condition: ConditionId = modalityById.cbt.strongWith[0];
      const t = makeTherapist(state, 27, {
        modality: 'cbt',
        skill: 100,
        morale: 100,
        maxEnergy: 100,
        energy: 100,
      });
      const c = makeClient(state, 28, {
        condition,
        comorbidities: [],
        severity: 1,
        rapport: 1,
        stability: 0.9,
        resilience: 1,
        chapter: 'work',
        progress: 50,
        preferredModality: 'cbt',
      });

      const cap = skillCap(level);
      for (const technique of TECHNIQUES.filter((x) => x.goodFor?.includes(condition))) {
        const q = computeQuality({
          state,
          therapist: t,
          client: c,
          focus: 'process',
          techniqueId: technique.id,
          slot: 2,
        }).quality;
        expect(q).toBeLessThanOrEqual(cap + SESSION_VARIANCE);
      }
    }
  });

  it('a fully-kitted practice still cannot match a bad pairing to a good one', () => {
    const state = freshState(29);
    state.practiceLevel = 6;
    state.upgrades = UPGRADES.map((u) => u.id);

    const condition: ConditionId = modalityById.cbt.strongWith[0];
    const rested = makeTherapist(state, 30, { modality: 'cbt', skill: 90, energy: 100, maxEnergy: 100, morale: 90 });
    const exhausted = makeTherapist(state, 30, { modality: 'cbt', skill: 90, energy: 2, maxEnergy: 100, morale: 20 });
    const c = makeClient(state, 31, { condition, comorbidities: [], rapport: 0.8, stability: 0.8, chapter: 'work' });

    const good = computeQuality({ state, therapist: rested, client: c, focus: 'process', slot: 2 }).quality;
    const bad = computeQuality({ state, therapist: exhausted, client: c, focus: 'process', slot: 2 }).quality;
    expect(bad).toBeLessThan(good);
  });
});

describe('regressionChance', () => {
  const state = freshState(32);

  it('rises as stability falls', () => {
    let prev = -1;
    for (let stability = 1; stability >= 0; stability -= 0.05) {
      const c = makeClient(state, 33, { stability, resilience: 0.3, severity: 3, chapter: 'work' });
      const chance = regressionChance(state, c, 'process');
      expect(chance).toBeGreaterThanOrEqual(prev);
      prev = chance;
    }
    const shaky = makeClient(state, 33, { stability: 0.05, resilience: 0.3, severity: 3, chapter: 'work' });
    const steady = makeClient(state, 33, { stability: 0.95, resilience: 0.3, severity: 3, chapter: 'work' });
    expect(regressionChance(state, shaky, 'process')).toBeGreaterThan(
      regressionChance(state, steady, 'process'),
    );
  });

  it('falls as resilience rises', () => {
    let prev = Infinity;
    for (let resilience = 0; resilience <= 1.0001; resilience += 0.05) {
      const c = makeClient(state, 34, { stability: 0.2, resilience, severity: 3, chapter: 'work' });
      const chance = regressionChance(state, c, 'process');
      expect(chance).toBeLessThanOrEqual(prev + 1e-12);
      prev = chance;
    }
  });

  it('is always within [0, 0.62] across the whole parameter space', () => {
    for (const difficulty of ['cozy', 'standard', 'challenge'] as const) {
      const s = freshState(35);
      s.difficulty = difficulty;
      for (const focus of Object.keys(FOCUSES) as SessionFocus[]) {
        for (let stability = 0; stability <= 1.0001; stability += 0.1) {
          for (let resilience = 0; resilience <= 1.0001; resilience += 0.25) {
            for (let severity = 1; severity <= 5; severity++) {
              for (const chapter of ['trust', 'work', 'consolidation'] as const) {
                const c = makeClient(s, 36, { stability, resilience, severity, chapter });
                for (const techniqueId of [undefined, ...TECHNIQUES.slice(0, 4).map((t) => t.id)]) {
                  const chance = regressionChance(s, c, focus, techniqueId);
                  expect(chance).toBeGreaterThanOrEqual(0);
                  expect(chance).toBeLessThanOrEqual(0.62);
                }
              }
            }
          }
        }
      }
    }
  });

  it('Stabilize is always safer than Process for the same client', () => {
    for (let stability = 0; stability <= 1.0001; stability += 0.1) {
      const c = makeClient(state, 37, { stability, resilience: 0.2, severity: 3, chapter: 'work' });
      expect(regressionChance(state, c, 'stabilize')).toBeLessThanOrEqual(
        regressionChance(state, c, 'process'),
      );
    }
  });
});

describe('computeQuality', () => {
  const state = freshState(38);

  it('reasons is never empty and every delta is finite', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = Rng.fromSeed(seed + 900);
      const t = generateTherapist(state, rng, {});
      const c = generateClient(state, rng, {});
      for (const focus of Object.keys(FOCUSES) as SessionFocus[]) {
        const techniqueId = t.techniques[seed % Math.max(1, t.techniques.length)];
        const qb = computeQuality({
          state,
          therapist: t,
          client: c,
          focus,
          techniqueId,
          slot: seed % 10,
          variance: (seed % 5) * 0.02 - 0.04,
        });
        expect(qb.reasons.length).toBeGreaterThan(0);
        for (const r of qb.reasons) {
          expect(Number.isFinite(r.delta)).toBe(true);
          expect(typeof r.label).toBe('string');
          expect(r.label.length).toBeGreaterThan(0);
          expect(['good', 'bad', 'neutral']).toContain(r.kind);
        }
        expect(Number.isFinite(qb.quality)).toBe(true);
        expect(Number.isFinite(qb.raw)).toBe(true);
        expect(qb.quality).toBeGreaterThanOrEqual(0.05);
        expect(qb.quality).toBeLessThanOrEqual(1);
      }
    }
  });

  it('names the technique in the reasons when one was used', () => {
    const t = makeTherapist(state, 39, { modality: 'cbt' });
    const c = makeClient(state, 40, { condition: 'anxiety', comorbidities: [] });
    const technique = TECHNIQUES.find((x) => x.modality === 'cbt')!;
    const qb = computeQuality({
      state,
      therapist: t,
      client: c,
      focus: 'build_skills',
      techniqueId: technique.id,
      slot: 2,
    });
    expect(qb.reasons.some((r) => r.label.includes(technique.name))).toBe(true);
  });

  it('grades follow the quality thresholds and never fall off the end', () => {
    expect(gradeFor(1)).toBe('breakthrough');
    expect(gradeFor(0.9)).toBe('breakthrough');
    expect(gradeFor(0.8)).toBe('excellent');
    expect(gradeFor(0.7)).toBe('good');
    expect(gradeFor(0.5)).toBe('mixed');
    expect(gradeFor(0)).toBe('poor');
    expect(gradeFor(-1)).toBe('poor');
  });
});
