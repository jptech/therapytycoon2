import { describe, it, expect } from 'vitest';
import { buildTechniqueCards, chapterFor, availableTechniques, resolveSession } from './session';
import { CHAPTER_BOUNDS, SESSION_VARIANCE } from './balance';
import { createInitialState } from './engine';
import { generateClient, generateTherapist } from './generators';
import { regressionChance, techniqueFit } from './quality';
import { Rng } from './rng';
import { techniqueById } from '../content';
import type { Client, GameState, ScheduledSession, SessionFocus } from './types';

// ─────────────────────────────────────────────────────────────────────────────

function freshState(seed = 1): GameState {
  return createInitialState({ seed, skipTutorial: true });
}

let sessionCounter = 0;
function mkSession(
  clientId: string,
  therapistId: string,
  focus: SessionFocus,
  over: Partial<ScheduledSession> = {},
): ScheduledSession {
  return {
    id: `test_sess_${sessionCounter++}`,
    clientId,
    therapistId,
    slot: 2,
    focus,
    type: 'individual',
    status: 'scheduled',
    t: 0,
    variance: 0,
    ...over,
  };
}

/** An active client on the caseload, built through the generator then tuned. */
function activeClient(state: GameState, rng: Rng, over: Partial<Client> = {}): Client {
  const c = generateClient(state, rng, {});
  c.status = 'active';
  Object.assign(c, over);
  state.clients.push(c);
  return c;
}

describe('chapterFor', () => {
  it('maps progress to the right chapter at the boundaries', () => {
    expect(chapterFor(0)).toBe('trust');
    expect(chapterFor(CHAPTER_BOUNDS.work[0] - 0.001)).toBe('trust');
    expect(chapterFor(CHAPTER_BOUNDS.work[0])).toBe('work');
    expect(chapterFor(CHAPTER_BOUNDS.consolidation[0] - 0.001)).toBe('work');
    expect(chapterFor(CHAPTER_BOUNDS.consolidation[0])).toBe('consolidation');
    expect(chapterFor(100)).toBe('consolidation');
  });

  it('never returns anything else across the whole 0..100 range', () => {
    for (let p = 0; p <= 100; p += 0.5) {
      expect(['trust', 'work', 'consolidation']).toContain(chapterFor(p));
    }
  });
});

describe('buildTechniqueCards', () => {
  it('returns 1–4 unique cards drawn only from the therapist’s own technique list', () => {
    const state = freshState(2);
    const rng = Rng.fromSeed(1001);

    for (let seed = 0; seed < 30; seed++) {
      const t = generateTherapist(state, Rng.fromSeed(seed + 40), {});
      state.therapists.push(t);
      const c = activeClient(state, Rng.fromSeed(seed + 700));
      const own = new Set(availableTechniques(t));
      expect(own.size).toBeGreaterThan(0);

      for (const focus of ['stabilize', 'process', 'build_skills'] as SessionFocus[]) {
        const cards = buildTechniqueCards(state, mkSession(c.id, t.id, focus), rng);
        expect(cards.length).toBeGreaterThanOrEqual(1);
        expect(cards.length).toBeLessThanOrEqual(4);
        expect(new Set(cards.map((x) => x.techniqueId)).size).toBe(cards.length);
        for (const card of cards) {
          expect(own.has(card.techniqueId)).toBe(true);
          expect(card.name).toBe(techniqueById[card.techniqueId].name);
          expect(card.preview.regressionChance).toBeGreaterThanOrEqual(0);
          expect(card.preview.regressionChance).toBeLessThanOrEqual(1);
          expect(Number.isFinite(card.preview.energyCost)).toBe(true);
          expect(['strong', 'solid', 'risky', 'poor']).toContain(card.preview.qualityHint);
        }
      }
    }
  });

  it('is deterministic for a given rng state', () => {
    const state = freshState(3);
    const t = state.therapists[0];
    const c = activeClient(state, Rng.fromSeed(11));
    const session = mkSession(c.id, t.id, 'build_skills');
    const a = buildTechniqueCards(state, session, Rng.fromSeed(555)).map((x) => x.techniqueId);
    const b = buildTechniqueCards(state, session, Rng.fromSeed(555)).map((x) => x.techniqueId);
    expect(a).toEqual(b);
  });

  it('returns nothing when the session points at a missing therapist or client', () => {
    const state = freshState(4);
    const rng = Rng.fromSeed(12);
    const t = state.therapists[0];
    const c = activeClient(state, rng);
    expect(buildTechniqueCards(state, mkSession(c.id, 'nope', 'process'), rng)).toEqual([]);
    expect(buildTechniqueCards(state, mkSession('nope', t.id, 'process'), rng)).toEqual([]);
  });

  it('always offers the best-fitting technique the therapist knows', () => {
    const state = freshState(50);
    const rng = Rng.fromSeed(4242);

    for (let seed = 0; seed < 40; seed++) {
      const t = generateTherapist(state, Rng.fromSeed(seed + 900), {});
      state.therapists.push(t);
      const c = activeClient(state, Rng.fromSeed(seed + 1300));

      for (const focus of ['stabilize', 'process', 'build_skills'] as SessionFocus[]) {
        const cards = buildTechniqueCards(state, mkSession(c.id, t.id, focus), rng);
        const bestFit = Math.max(
          ...availableTechniques(t).map((id) => techniqueFit(techniqueById[id], c, focus)),
        );
        const offered = Math.max(
          ...cards.map((card) => techniqueFit(techniqueById[card.techniqueId], c, focus)),
        );
        expect(offered).toBeCloseTo(bestFit, 10);
      }
    }
  });

  it('leans the hand toward the good end of a large library', () => {
    // The regression this guards: the old best/median/worst pick made a bigger
    // library *dilute* the hand. More training must read as better options.
    const state = freshState(51);
    const t = state.therapists[0];
    t.techniques = Object.values(techniqueById).map((x) => x.id);
    expect(t.techniques.length).toBeGreaterThan(8);
    const c = activeClient(state, Rng.fromSeed(77));
    const session = mkSession(c.id, t.id, 'process');

    const pool = t.techniques
      .map((id) => techniqueFit(techniqueById[id], c, 'process'))
      .sort((a, b) => b - a);
    const poolMean = pool.reduce((a, b) => a + b, 0) / pool.length;

    const rng = Rng.fromSeed(2024);
    let handTotal = 0;
    let cardCount = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
      const cards = buildTechniqueCards(state, session, rng);
      expect(cards.length).toBe(4);
      for (const card of cards) {
        handTotal += techniqueFit(techniqueById[card.techniqueId], c, 'process');
        cardCount += 1;
      }
    }

    // Averaged over the whole hand — not just the guaranteed slot — the cards
    // dealt beat a uniform draw from the same library by a clear margin.
    expect(handTotal / cardCount).toBeGreaterThan(poolMean + 0.05);
  });

  it('still deals a spread, so the pick has teeth', () => {
    const state = freshState(52);
    const t = state.therapists[0];
    t.techniques = Object.values(techniqueById).map((x) => x.id);
    const c = activeClient(state, Rng.fromSeed(78));
    const session = mkSession(c.id, t.id, 'process');

    const rng = Rng.fromSeed(2025);
    let spreadRuns = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const fits = buildTechniqueCards(state, session, rng).map((card) =>
        techniqueFit(techniqueById[card.techniqueId], c, 'process'),
      );
      if (Math.max(...fits) - Math.min(...fits) > 0.15) spreadRuns += 1;
    }
    // The wildcard is not forced to be bad, so this is a strong majority
    // rather than an invariant — a hand of four workable cards is allowed.
    expect(spreadRuns).toBeGreaterThan(runs * 0.6);
  });

  it('flags a stability gate in the card notes', () => {
    const state = freshState(5);
    const rng = Rng.fromSeed(13);
    const t = state.therapists[0];
    // Give the therapist every technique so a gated one is guaranteed present.
    const gated = Object.values(techniqueById).filter((x) => (x.minStability ?? 0) > 0.4);
    expect(gated.length).toBeGreaterThan(0);
    t.techniques = gated.map((x) => x.id);
    const c = activeClient(state, rng, { stability: 0.02 });

    const cards = buildTechniqueCards(state, mkSession(c.id, t.id, 'process'), rng);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((card) => card.preview.notes.some((n) => n.includes('stability')))).toBe(true);
  });
});

describe('resolveSession', () => {
  it('moves progress, spends therapist energy, explains itself and marks the session done', () => {
    const state = freshState(6);
    const t = state.therapists[0];
    const c = activeClient(state, Rng.fromSeed(21), {
      severity: 1,
      resilience: 1,
      stability: 0.85,
      rapport: 0.8,
      progress: 20,
      chapter: chapterFor(20),
    });

    const before = { progress: c.progress, energy: t.energy, sessions: c.sessionsAttended };
    const session = mkSession(c.id, t.id, 'stabilize');
    state.schedule.push(session);

    const result = resolveSession(state, session, new Rng(state.rng))!;
    expect(result).toBeDefined();
    expect(result.regression).toBe(false);

    // The reported delta must be the *total* change to the client, arc beat
    // included — the card is not allowed to disagree with the client sheet.
    expect(result.progressDelta).toBeCloseTo(c.progress - before.progress, 1);
    if (!result.beat) expect(c.progress).toBeGreaterThan(before.progress);
    expect(t.energy).toBeLessThan(before.energy);
    expect(result.energyCost).toBeGreaterThan(0);
    expect(before.energy - t.energy).toBe(result.energyCost);

    expect(c.sessionsAttended).toBe(before.sessions + 1);
    expect(c.daysSinceSession).toBe(0);

    expect(session.status).toBe('done');
    expect(session.result).toBe(result);

    expect(result.reasons.length).toBeGreaterThan(0);
    for (const r of result.reasons) expect(Number.isFinite(r.delta)).toBe(true);
    expect(result.reasons.some((r) => r.label.includes('Skill'))).toBe(true);
    expect(result.narrative.length).toBeGreaterThan(0);
    expect(result.focus).toBe('stabilize');
    expect(result.clientId).toBe(c.id);
    expect(result.therapistId).toBe(t.id);
  });

  it('returns undefined for a session whose people do not exist', () => {
    const state = freshState(7);
    const rng = new Rng(state.rng);
    expect(resolveSession(state, mkSession('gone', 'gone', 'process'), rng)).toBeUndefined();
  });

  it('records the chapter advance when progress crosses a boundary', () => {
    const state = freshState(8);
    const t = state.therapists[0];
    const c = activeClient(state, Rng.fromSeed(22), {
      progress: CHAPTER_BOUNDS.work[0] - 0.2,
      chapter: 'trust',
      rapport: 0.9,
      stability: 0.85,
      resilience: 1,
      severity: 1,
    });
    const session = mkSession(c.id, t.id, 'stabilize');
    state.schedule.push(session);
    const result = resolveSession(state, session, new Rng(state.rng))!;
    expect(result.regression).toBe(false);
    expect(c.chapter).toBe('work');
    expect(result.chapterAdvanced).toBe('work');
  });

  it('a hostile setup regresses often, and progress can go backwards', () => {
    const state = freshState(9);
    state.difficulty = 'challenge';
    const t = state.therapists[0];
    const rng = new Rng(state.rng);

    let regressions = 0;
    let wentBackwards = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const c = activeClient(state, Rng.fromSeed(3000 + i), {
        stability: 0.05,
        resilience: 0,
        severity: 5,
        chapter: 'work',
        progress: 50,
        rapport: 0.5,
      });
      // The player is told the risk before they commit — it must be substantial.
      expect(regressionChance(state, c, 'process')).toBeGreaterThan(0.4);

      const session = mkSession(c.id, t.id, 'process');
      state.schedule.push(session);
      const before = c.progress;
      const result = resolveSession(state, session, rng)!;
      if (result.regression) regressions++;
      if (c.progress < before) wentBackwards++;
      t.energy = t.maxEnergy;
    }

    expect(regressions).toBeGreaterThan(runs * 0.35);
    expect(regressions).toBeLessThan(runs);
    expect(wentBackwards).toBeGreaterThan(0);
  });

  it('a protected setup almost never regresses', () => {
    const state = freshState(10);
    state.difficulty = 'cozy';
    const t = state.therapists[0];
    const rng = new Rng(state.rng);

    let regressions = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const c = activeClient(state, Rng.fromSeed(4000 + i), {
        stability: 0.9,
        resilience: 1,
        severity: 1,
        chapter: 'consolidation',
        progress: 80,
        rapport: 0.8,
      });
      const session = mkSession(c.id, t.id, 'stabilize');
      state.schedule.push(session);
      if (resolveSession(state, session, rng)!.regression) regressions++;
      t.energy = t.maxEnergy;
    }
    expect(regressions).toBeLessThan(runs * 0.05);
  });

  it('a client reaching 100 progress produces cured: true', () => {
    const state = freshState(11);
    const t = state.therapists[0];
    const c = activeClient(state, Rng.fromSeed(23), {
      progress: 99.5,
      chapter: 'consolidation',
      stability: 0.9,
      resilience: 1,
      rapport: 0.9,
      severity: 1,
    });
    const session = mkSession(c.id, t.id, 'stabilize');
    state.schedule.push(session);
    const result = resolveSession(state, session, new Rng(state.rng))!;
    expect(result.cured).toBe(true);
    expect(c.progress).toBe(100);
    expect(result.narrative).toContain(c.handle);
  });

  it('a client short of 100 is not cured', () => {
    const state = freshState(12);
    const t = state.therapists[0];
    const c = activeClient(state, Rng.fromSeed(24), {
      progress: 10,
      chapter: 'trust',
      stability: 0.6,
      rapport: 0.6,
    });
    const session = mkSession(c.id, t.id, 'stabilize');
    state.schedule.push(session);
    expect(resolveSession(state, session, new Rng(state.rng))!.cured).toBe(false);
  });

  it('keeps rapport, stability and resilience inside [0, 1] over 200 resolved sessions', () => {
    const state = freshState(13);
    const rng = new Rng(state.rng);
    const t = state.therapists[0];

    const clients: Client[] = [];
    for (let i = 0; i < 10; i++) clients.push(activeClient(state, Rng.fromSeed(5000 + i)));

    const focuses: SessionFocus[] = ['stabilize', 'process', 'build_skills'];
    for (let i = 0; i < 200; i++) {
      const c = clients[i % clients.length];
      const session = mkSession(c.id, t.id, focuses[i % focuses.length], {
        variance: (i % 5) * SESSION_VARIANCE * 0.4 - SESSION_VARIANCE,
      });
      state.schedule.push(session);
      const result = resolveSession(state, session, rng)!;

      for (const [label, v] of [
        ['rapport', c.rapport],
        ['stability', c.stability],
        ['resilience', c.resilience],
      ] as const) {
        expect(Number.isFinite(v), label).toBe(true);
        expect(v, label).toBeGreaterThanOrEqual(0);
        expect(v, label).toBeLessThanOrEqual(1);
      }
      expect(c.progress).toBeGreaterThanOrEqual(0);
      expect(c.progress).toBeLessThanOrEqual(100);
      expect(c.patience).toBeGreaterThanOrEqual(0);
      expect(c.patience).toBeLessThanOrEqual(100);
      expect(t.energy).toBeGreaterThanOrEqual(0);

      expect(Number.isFinite(result.quality)).toBe(true);
      expect(Number.isFinite(result.revenue)).toBe(true);
      expect(result.revenue).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.xp)).toBe(true);

      t.energy = t.maxEnergy;
    }
  });

  it('never lets a beat push a client out of bounds either', () => {
    const state = freshState(14);
    const rng = new Rng(state.rng);
    const t = state.therapists[0];
    let beats = 0;
    for (let i = 0; i < 120; i++) {
      const c = activeClient(state, Rng.fromSeed(6000 + i), {
        progress: i % 3 === 0 ? 5 : i % 3 === 1 ? 45 : 90,
        chapter: chapterFor(i % 3 === 0 ? 5 : i % 3 === 1 ? 45 : 90),
        sessionsAttended: 4,
      });
      const session = mkSession(c.id, t.id, 'build_skills');
      state.schedule.push(session);
      const result = resolveSession(state, session, rng)!;
      if (result.beat) {
        beats++;
        expect(typeof result.beat.text).toBe('string');
        expect(c.playedBeats).toContain(result.beat.id);
      }
      expect(c.stability).toBeGreaterThanOrEqual(0);
      expect(c.stability).toBeLessThanOrEqual(1);
      expect(c.progress).toBeLessThanOrEqual(100);
      t.energy = t.maxEnergy;
    }
    // Beats punctuate rather than spam, but over 120 sessions some must land.
    expect(beats).toBeGreaterThan(5);
  });

  it('is deterministic — the same seed resolves the same session identically', () => {
    const run = () => {
      const state = freshState(15);
      const t = state.therapists[0];
      const c = activeClient(state, Rng.fromSeed(25), { progress: 30, chapter: 'trust', rapport: 0.5 });
      const session = mkSession(c.id, t.id, 'process');
      state.schedule.push(session);
      const result = resolveSession(state, session, Rng.fromSeed(9090))!;
      return { quality: result.quality, delta: result.progressDelta, regression: result.regression, narrative: result.narrative };
    };
    expect(run()).toEqual(run());
  });
});
