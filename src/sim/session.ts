import {
  ALLIANCE_SOFTNESS,
  BASE_PROGRESS,
  BREAKTHROUGH_BONUS,
  CHAPTER_BOUNDS,
  COLLECTION_RATE,
  DIFFICULTIES,
  ENERGY_PER_SESSION,
  FOCUSES,
  PATIENCE_RECOVER_PER_SESSION,
  REGRESSION_LOSS,
  SESSION_OVERHEAD,
  SEVERITY_DRAG,
  TRUST_RAPPORT_GATE,
} from './balance';
import { arcBeatById, ARC_BEATS, modalityById, techniqueById } from '../content';
import {
  breakthroughChance,
  computeQuality,
  regressionChance,
  techniqueFit,
  traitMult,
  traitMod,
} from './quality';
import type { Rng } from './rng';
import type {
  ArcBeatDef,
  ArcChapter,
  Client,
  GameState,
  ScheduledSession,
  SessionFocus,
  SessionResult,
  TechniqueCard,
  Therapist,
} from './types';
import { clamp, clamp01, softGain } from './util';

export function chapterFor(progress: number): ArcChapter {
  if (progress >= CHAPTER_BOUNDS.consolidation[0]) return 'consolidation';
  if (progress >= CHAPTER_BOUNDS.work[0]) return 'work';
  return 'trust';
}

/** Techniques this therapist can actually offer right now. */
export function availableTechniques(t: Therapist): string[] {
  return t.techniques.filter((id) => !!techniqueById[id]);
}

/**
 * Build the three-to-four technique cards offered at the session's decision beat.
 * Selection is deterministic given the rng, and always includes at least one
 * strong option and one that is situationally wrong — the choice must matter.
 */
export function buildTechniqueCards(
  state: GameState,
  session: ScheduledSession,
  rng: Rng,
): TechniqueCard[] {
  const t = state.therapists.find((x) => x.id === session.therapistId);
  const c = state.clients.find((x) => x.id === session.clientId);
  if (!t || !c) return [];

  const pool = availableTechniques(t)
    .map((id) => techniqueById[id])
    .filter(Boolean);
  if (!pool.length) return [];

  const scored = pool.map((tech) => ({
    tech,
    fit: techniqueFit(tech, c, session.focus),
  }));
  scored.sort((a, b) => b.fit - a.fit);

  const chosen: typeof scored = [];
  // Best available.
  chosen.push(scored[0]);
  // A mid option.
  const mid = scored[Math.min(scored.length - 1, Math.floor(scored.length / 2))];
  if (mid && !chosen.includes(mid)) chosen.push(mid);
  // A weak/wrong option so the pick has teeth.
  const weak = scored[scored.length - 1];
  if (weak && !chosen.includes(weak)) chosen.push(weak);
  // One wildcard for variety.
  const rest = scored.filter((s) => !chosen.includes(s));
  if (rest.length) chosen.push(rng.pick(rest));

  const cards = rng.shuffle(chosen.slice(0, 4));

  return cards.map(({ tech, fit }) => {
    const reg = regressionChance(state, c, session.focus, tech.id);
    const energy = Math.round(
      ENERGY_PER_SESSION * FOCUSES[session.focus].energyMult * traitMult(t, 'energyCostMult') +
        (tech.effects.energy ?? 0),
    );
    const progMult = (tech.effects.progress ?? 1) * FOCUSES[session.focus].progressMult;

    const notes: string[] = [];
    if (tech.goodFor?.includes(c.condition)) notes.push('Well suited to this case');
    if (tech.poorFor?.includes(c.condition)) notes.push('A poor fit for this case');
    if (tech.chapters?.length && !tech.chapters.includes(c.chapter)) notes.push('Wrong moment in the arc');
    if (tech.minStability !== undefined && c.stability < tech.minStability) {
      notes.push(`Needs more stability (${Math.round(tech.minStability * 100)}% · they are at ${Math.round(c.stability * 100)}%)`);
    }
    if ((tech.effects.rapport ?? 0) > 0.03) notes.push('Builds the alliance');
    if ((tech.effects.stability ?? 0) > 0.03) notes.push('Steadying');
    if ((tech.effects.stability ?? 0) < -0.03) notes.push('Activating');
    if ((tech.effects.resilience ?? 0) > 0.03) notes.push('Builds resilience');
    if ((tech.effects.breakthrough ?? 0) > 0.02) notes.push('Can open something up');

    return {
      techniqueId: tech.id,
      name: tech.name,
      blurb: tech.blurb,
      flavor: tech.flavor,
      modality: tech.modality,
      preview: {
        qualityHint: fit > 0.78 ? 'strong' : fit > 0.58 ? 'solid' : fit > 0.38 ? 'risky' : 'poor',
        progressHint:
          progMult > 1.25 ? 'Big step' : progMult > 0.95 ? 'Solid step' : progMult > 0.7 ? 'Small step' : 'Slow going',
        energyCost: energy,
        regressionChance: reg,
        notes,
      },
    };
  });
}

function pickBeat(state: GameState, c: Client, rng: Rng): ArcBeatDef | undefined {
  const candidates = ARC_BEATS.filter((b) => {
    if (b.chapter !== c.chapter) return false;
    if (c.playedBeats.includes(b.id)) return false;
    if (b.conditions?.length && !b.conditions.includes(c.condition) && !c.comorbidities.some((x) => b.conditions!.includes(x)))
      return false;
    if (b.minSeverity !== undefined && c.severity < b.minSeverity) return false;
    if (b.maxSeverity !== undefined && c.severity > b.maxSeverity) return false;
    return true;
  });
  if (!candidates.length) return undefined;
  return rng.weighted(candidates, (b) => b.weight) ?? undefined;
}

/** Probability a beat fires this session — beats punctuate, they don't spam. */
function beatChance(c: Client): number {
  if (c.sessionsAttended < 2) return 0.18;
  return 0.3;
}

const GRADE_NARRATIVE: Record<string, string[]> = {
  breakthrough: [
    'Something shifted. {who} heard it in their own voice before you could name it.',
    'A door that had been painted shut came open.',
    'The room went quiet in the good way.',
  ],
  excellent: [
    'Good work today — steady, honest, unhurried.',
    '{who} did the harder thing and stayed with it.',
    'You both left knowing more than you came in with.',
  ],
  good: [
    'A solid hour. Nothing dramatic, which was the point.',
    '{who} tried the thing on. It mostly fit.',
    'Progress, quietly.',
  ],
  mixed: [
    'It didn’t quite land. Some hours are like that.',
    '{who} was somewhere else for most of it.',
    'You circled the thing without touching it.',
  ],
  poor: [
    'A hard hour. {who} left more guarded than they arrived.',
    'The timing was wrong and you both felt it.',
    'Nothing broke. Nothing moved either.',
  ],
};

/**
 * Resolve a session end-to-end. Pure apart from rng draws; mutates client and
 * therapist in place and returns the SessionResult for the reflect card.
 */
export function resolveSession(
  state: GameState,
  session: ScheduledSession,
  rng: Rng,
): SessionResult | undefined {
  const t = state.therapists.find((x) => x.id === session.therapistId);
  const c = state.clients.find((x) => x.id === session.clientId);
  if (!t || !c) return undefined;

  const diff = DIFFICULTIES[state.difficulty];
  const focus = FOCUSES[session.focus];
  const tech = session.techniqueUsed ? techniqueById[session.techniqueUsed] : undefined;

  const qb = computeQuality({
    state,
    therapist: t,
    client: c,
    focus: session.focus,
    techniqueId: session.techniqueUsed,
    slot: session.slot,
    variance: session.variance ?? 0,
  });

  // ── Progress ───────────────────────────────────────────────────────────────
  const severityMult = Math.max(0.45, 1 - (c.severity - 1) * SEVERITY_DRAG);
  // Poor sessions still nudge; great ones roughly double a baseline hour.
  const qualityCurve = 0.18 + qb.quality * 1.18;
  let progressDelta =
    BASE_PROGRESS * qualityCurve * focus.progressMult * severityMult * (tech?.effects.progress ?? 1);

  const reasons = [...qb.reasons];

  if (c.chapter === 'trust' && c.rapport < TRUST_RAPPORT_GATE) {
    progressDelta *= 0.55;
    reasons.push({ label: 'Trust still forming — progress is gated', delta: -0.05, kind: 'neutral' });
  }
  if (c.sessionType === 'group') progressDelta *= 0.78;
  if (c.sessionType === 'couples' || c.sessionType === 'family') progressDelta *= 1.12;

  // ── Risk beats ─────────────────────────────────────────────────────────────
  const regChance = regressionChance(state, c, session.focus, session.techniqueUsed);
  const regressed = rng.chance(regChance);
  const btChance = breakthroughChance(qb.quality, c, session.focus, session.techniqueUsed);
  const breakthrough = !regressed && rng.chance(btChance);

  if (regressed) {
    progressDelta -= REGRESSION_LOSS * (1 + (c.severity - 3) * 0.1);
    reasons.push({
      label: `Regression — ${Math.round(regChance * 100)}% risk was showing`,
      delta: -0.12,
      kind: 'bad',
    });
  }
  if (breakthrough) {
    progressDelta += BREAKTHROUGH_BONUS;
    reasons.push({ label: 'Breakthrough', delta: 0.12, kind: 'good' });
  }

  // ── Client state deltas ────────────────────────────────────────────────────
  let stabilityDelta = focus.stabilityDelta + (tech?.effects.stability ?? 0);
  if (regressed) stabilityDelta -= 0.12;
  if (breakthrough) stabilityDelta += 0.06;

  let rapportDelta =
    focus.rapportDelta + (tech?.effects.rapport ?? 0) + traitMod(t, 'rapportGain') + (qb.quality - 0.62) * 0.07;
  const resilienceDelta = focus.resilienceDelta + (tech?.effects.resilience ?? 0) + (breakthrough ? 0.03 : 0);

  if (qb.quality < 0.4) rapportDelta -= 0.05;

  // The alliance, a client's felt safety and their resilience all approach their
  // ceiling asymptotically. Deep trust should stay something you keep earning.
  c.progress = clamp(c.progress + progressDelta, 0, 100);
  c.stability = clamp01(c.stability + softGain(c.stability, stabilityDelta, 1, ALLIANCE_SOFTNESS));
  c.rapport = clamp01(c.rapport + softGain(c.rapport, rapportDelta, 1, ALLIANCE_SOFTNESS));
  c.resilience = clamp01(c.resilience + softGain(c.resilience, resilienceDelta, 1, ALLIANCE_SOFTNESS));
  c.patience = clamp(
    c.patience + PATIENCE_RECOVER_PER_SESSION * (qb.quality > 0.5 ? 1 : 0.4),
    0,
    100,
  );
  c.sessionsAttended += 1;
  c.daysSinceSession = 0;

  const prevChapter = c.chapter;
  c.chapter = chapterFor(c.progress);
  const chapterAdvanced = c.chapter !== prevChapter ? c.chapter : undefined;

  // ── Arc beat ───────────────────────────────────────────────────────────────
  let beat: SessionResult['beat'];
  if (rng.chance(beatChance(c))) {
    const b = pickBeat(state, c, rng);
    if (b) {
      c.playedBeats.push(b.id);
      const e = b.effects;
      if (e) {
        if (e.stability) c.stability = clamp01(c.stability + e.stability);
        if (e.rapport) c.rapport = clamp01(c.rapport + e.rapport);
        if (e.resilience) c.resilience = clamp01(c.resilience + e.resilience);
        if (e.progress) c.progress = clamp(c.progress + e.progress, 0, 100);
        if (e.patience) c.patience = clamp(c.patience + e.patience, 0, 100);
        if (e.prefersModality) c.preferredModality = e.prefersModality;
        if (e.addComorbidity && !c.comorbidities.includes(e.addComorbidity) && e.addComorbidity !== c.condition) {
          c.comorbidities.push(e.addComorbidity);
          c.complex = true;
        }
      }
      c.chapter = chapterFor(c.progress);
      beat = { id: b.id, text: b.text, mood: b.mood ?? 'neutral' };
      c.story.unshift({ day: state.day, text: b.text, mood: (b.mood as never) ?? 'neutral' });
      if (b.event) {
        state.queuedEvents.push({ eventId: b.event, day: state.day, clientId: c.id });
      }
    }
  }

  // ── Therapist cost & reward ────────────────────────────────────────────────
  const energyCost = Math.round(
    ENERGY_PER_SESSION * focus.energyMult * traitMult(t, 'energyCostMult') + (tech?.effects.energy ?? 0),
  );
  t.energy = Math.max(0, t.energy - energyCost);
  t.stats.sessions += 1;
  if (breakthrough) t.stats.breakthroughs += 1;

  const xp = Math.round((6 + qb.quality * 10 + c.severity * 1.5) * traitMult(t, 'xpMult'));
  t.xp += xp;

  if (qb.quality >= 0.8 && !t.bonds.includes(c.id) && c.rapport > 0.7) t.bonds.push(c.id);

  // ── Money ──────────────────────────────────────────────────────────────────
  const revenue = Math.max(
    0,
    Math.round(
      c.rate * diff.revenueMult * COLLECTION_RATE[c.payment] * (c.sessionType === 'group' ? 0.55 : 1) -
        SESSION_OVERHEAD * diff.expenseMult,
    ),
  );

  // ── Cure ───────────────────────────────────────────────────────────────────
  const cured = c.progress >= 100;

  const who = c.handle;
  const pool = GRADE_NARRATIVE[qb.grade] ?? GRADE_NARRATIVE.good;
  let narrative = rng.pick(pool).replace('{who}', who);
  if (breakthrough && tech) narrative = tech.flavor;
  if (cured) narrative = `${who} is ready to finish. You both knew it before either of you said it.`;

  const result: SessionResult = {
    sessionId: session.id,
    clientId: c.id,
    therapistId: t.id,
    quality: qb.quality,
    grade: qb.grade,
    progressDelta: Math.round(progressDelta * 10) / 10,
    rapportDelta,
    stabilityDelta,
    resilienceDelta,
    energyCost,
    revenue,
    xp,
    breakthrough,
    regression: regressed,
    cured,
    chapterAdvanced,
    reasons: reasons.filter((r) => Math.abs(r.delta) > 0.004).slice(0, 9),
    narrative,
    beat,
    techniqueUsed: session.techniqueUsed,
    focus: session.focus,
  };

  session.result = result;
  session.status = 'done';
  return result;
}

/** Human label for the chapter, used in several places. */
export const CHAPTER_LABEL: Record<ArcChapter, string> = {
  trust: 'Trust',
  work: 'Work',
  consolidation: 'Consolidation',
};

export const CHAPTER_BLURB: Record<ArcChapter, string> = {
  trust: 'Building the alliance. Nothing else works until this does.',
  work: 'The hard middle. This is where change actually happens.',
  consolidation: 'Making it stick, and preparing to say goodbye.',
};

export function focusLabel(f: SessionFocus): string {
  return FOCUSES[f].name;
}

export function modalityName(id: string): string {
  return modalityById[id]?.name ?? id;
}
