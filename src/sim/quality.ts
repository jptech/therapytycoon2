import {
  DIFFICULTIES,
  DIMINISH_SCALE,
  DIMINISH_KNEE,
  ADULT_MODALITIES,
  AGE_MISMATCH_PENALTY,
  CHILD_MODALITIES,
  MINOR_AGE,
  MOD_CEILING,
  MOD_FLOOR,
  TRAIT_QUALITY_CLAMP,
  UPGRADE_QUALITY_ASYMPTOTE,
  FOCUSES,
  GRADE_THRESHOLDS,
  QUALITY_WEIGHTS,
  SKILL_CAP_BY_LEVEL,
} from './balance';
import { modalityById, philosophyById, techniqueById, traitById, upgradeById } from '../content';
import type {
  Client,
  ConditionId,
  GameState,
  OutcomeGrade,
  SessionFocus,
  Technique,
  Therapist,
} from './types';
import { clamp01, clamp } from './util';

export interface QualityReason {
  label: string;
  delta: number;
  kind: 'good' | 'bad' | 'neutral';
}

export interface QualityBreakdown {
  quality: number;
  raw: number;
  cap: number;
  grade: OutcomeGrade;
  reasons: QualityReason[];
}

/**
 * Is this school built for the person actually in the chair? A sand tray is a
 * fine instrument and a poor one for a fifty-seven-year-old.
 */
export function ageFit(modality: string, age: number): number {
  const minor = age < MINOR_AGE;
  if (CHILD_MODALITIES.includes(modality)) return minor ? 1 : 1 - AGE_MISMATCH_PENALTY;
  if (ADULT_MODALITIES.includes(modality) && age < 13) return 1 - AGE_MISMATCH_PENALTY;
  return 1;
}

/** How well this therapist's school fits this client, 0..1. */
export function specializationFit(t: Therapist, c: Client): number {
  const primary = modalityById[t.modality];
  const sec = t.secondaryModality ? modalityById[t.secondaryModality] : undefined;

  // Fit is measured against every condition the client presents with and then
  // weighted-averaged, so a comorbid case genuinely stretches a specialist.
  const fitFor = (cond: ConditionId): number => {
    let f = 0.3;
    if (primary?.strongWith.includes(cond)) f = 0.96;
    if (sec?.strongWith.includes(cond)) f = Math.max(f, 0.76);
    return f;
  };

  let best = fitFor(c.condition) * 0.68;
  let weight = 0.68;
  for (const co of c.comorbidities) {
    best += fitFor(co) * 0.32;
    weight += 0.32;
  }
  best /= weight;
  best *= ageFit(t.modality, c.age);
  if (c.preferredModality) {
    if (c.preferredModality === t.modality) best = Math.min(1, best + 0.14);
    else if (c.preferredModality === t.secondaryModality) best = Math.min(1, best + 0.08);
    else best = Math.max(0.2, best - 0.1);
  }
  return clamp01(best);
}

/** How apt this focus is for the client's current state, 0..1. */
export function focusFit(focus: SessionFocus, c: Client): number {
  const f = FOCUSES[focus];
  const stab = c.stability;
  switch (focus) {
    case 'stabilize':
      // Most valuable when they are shaky; slightly wasteful when they are steady.
      return clamp01(0.92 - stab * 0.52);
    case 'process': {
      if (stab < f.safeStability) return clamp01(0.15 + (stab / f.safeStability) * 0.4);
      // Best in the Work chapter with an established alliance.
      const chapterBonus = c.chapter === 'work' ? 0.16 : c.chapter === 'trust' ? -0.12 : 0.04;
      return clamp01(0.52 + (stab - f.safeStability) * 0.62 + chapterBonus + c.rapport * 0.18);
    }
    case 'build_skills': {
      if (stab < f.safeStability) return clamp01(0.4 + stab);
      const chapterBonus = c.chapter === 'consolidation' ? 0.12 : 0.04;
      return clamp01(0.58 + c.resilience * 0.2 + chapterBonus);
    }
  }
}

/** How apt this technique is here, 0..1. Returns 0.5 for "no technique yet". */
export function techniqueFit(tech: Technique | undefined, c: Client, focus: SessionFocus): number {
  if (!tech) return 0.5;
  let fit = 0.55;
  const conditions = [c.condition, ...c.comorbidities];
  const age = ageFit(tech.modality, c.age);
  if (age < 1) fit -= AGE_MISMATCH_PENALTY;
  if (tech.goodFor?.some((x) => x === c.condition)) fit += 0.24;
  else if (tech.goodFor?.some((x) => conditions.includes(x))) fit += 0.13;
  if (tech.poorFor?.some((x) => x === c.condition)) fit -= 0.32;
  else if (tech.poorFor?.some((x) => conditions.includes(x))) fit -= 0.16;
  if (tech.focuses?.length) fit += tech.focuses.includes(focus) ? 0.09 : -0.18;
  if (tech.chapters?.length) fit += tech.chapters.includes(c.chapter) ? 0.07 : -0.16;
  if (tech.minStability !== undefined && c.stability < tech.minStability) {
    fit -= 0.22 + (tech.minStability - c.stability) * 0.5;
  }
  return clamp01(fit);
}

/** Sum of trait modifiers of a given numeric key. */
export function traitMod(t: Therapist, key: string): number {
  let total = 0;
  for (const id of t.traits) {
    const def = traitById[id];
    const v = def?.mods ? (def.mods as Record<string, unknown>)[key] : undefined;
    if (typeof v === 'number') total += v;
  }
  return total;
}

/** Product of trait multipliers of a given key (defaults to 1). */
export function traitMult(t: Therapist, key: string): number {
  let total = 1;
  for (const id of t.traits) {
    const def = traitById[id];
    const v = def?.mods ? (def.mods as Record<string, unknown>)[key] : undefined;
    if (typeof v === 'number') total *= v;
  }
  return total;
}

export function conditionAffinity(t: Therapist, c: Client): number {
  let total = 0;
  for (const id of t.traits) {
    const aff = traitById[id]?.mods?.conditionAffinity;
    if (!aff) continue;
    if (aff[c.condition]) total += aff[c.condition]!;
    for (const co of c.comorbidities) if (aff[co]) total += aff[co]! * 0.5;
  }
  return total;
}

/**
 * Practice-wide quality modifier from purchased upgrades, with diminishing
 * returns on the aggregate. A beautiful office helps; it never substitutes for
 * a skilled therapist who is rested and knows this client.
 */
export function upgradeQuality(state: GameState): number {
  let raw = 0;
  for (const id of state.upgrades) raw += upgradeById[id]?.mods?.quality ?? 0;
  if (raw <= 0) return raw;
  return UPGRADE_QUALITY_ASYMPTOTE * (1 - Math.exp(-raw / UPGRADE_QUALITY_ASYMPTOTE));
}

export function skillCap(practiceLevel: number): number {
  return SKILL_CAP_BY_LEVEL[Math.min(SKILL_CAP_BY_LEVEL.length - 1, Math.max(0, practiceLevel - 1))];
}

/**
 * Compresses everything above the knee asymptotically toward the practice's
 * current ceiling. Using the cap as the *asymptote* rather than a hard clamp is
 * what keeps late-game sessions varied: a clamp made every mature session score
 * the identical number, which is the flatline that killed v1's late game.
 */
export function compress(raw: number, cap: number): number {
  if (raw <= DIMINISH_KNEE) return Math.min(raw, cap);
  // The 0.01 floor keeps the curve well-formed when the cap sits on the knee
  // (exactly the level-1 case), but the cap is an asymptote nothing may cross,
  // so the result is clamped to it regardless.
  const span = Math.max(0.01, cap - DIMINISH_KNEE);
  const compressed = DIMINISH_KNEE + span * (1 - Math.exp(-(raw - DIMINISH_KNEE) / DIMINISH_SCALE));
  return Math.min(compressed, cap);
}

export function gradeFor(q: number): OutcomeGrade {
  for (const g of GRADE_THRESHOLDS) if (q >= g.min) return g.grade as OutcomeGrade;
  return 'poor';
}

export interface QualityInput {
  state: GameState;
  therapist: Therapist;
  client: Client;
  focus: SessionFocus;
  techniqueId?: string;
  /** 0..9 — used by morning/evening trait shifts. */
  slot: number;
  /** Per-session normal sample; omitted for previews so hints stay honest. */
  variance?: number;
}

/**
 * The session quality formula. Every term is reported in `reasons` so the reflect
 * card can explain exactly why a session went the way it did.
 */
export function computeQuality(input: QualityInput): QualityBreakdown {
  const { state, therapist: t, client: c, focus, techniqueId, slot, variance = 0 } = input;
  const tech = techniqueId ? techniqueById[techniqueId] : undefined;
  const reasons: QualityReason[] = [];

  const skillTerm = clamp01(t.skill / 100);
  const specTerm = specializationFit(t, c);
  const energyTerm = clamp01(Math.sqrt(clamp01(t.energy / Math.max(1, t.maxEnergy))));
  const rapportTerm = clamp01(c.rapport);
  const fFit = focusFit(focus, c);
  const tFit = techniqueFit(tech, c, focus);

  const W = QUALITY_WEIGHTS;
  let raw =
    W.skill * skillTerm +
    W.specialization * specTerm +
    W.energy * energyTerm +
    W.rapport * rapportTerm +
    W.focusFit * fFit +
    W.technique * tFit;

  reasons.push({ label: `Skill ${Math.round(t.skill)}`, delta: W.skill * skillTerm, kind: 'neutral' });
  reasons.push({
    label:
      specTerm > 0.85
        ? `${modalityById[t.modality]?.name ?? t.modality} fits this case`
        : specTerm < 0.4
          ? `${modalityById[t.modality]?.name ?? t.modality} is a stretch here`
          : 'Partial specialty match',
    delta: W.specialization * specTerm,
    kind: specTerm > 0.7 ? 'good' : specTerm < 0.4 ? 'bad' : 'neutral',
  });
  reasons.push({
    label: energyTerm > 0.8 ? 'Well rested' : energyTerm < 0.5 ? 'Running on fumes' : 'Steady energy',
    delta: W.energy * energyTerm,
    kind: energyTerm > 0.8 ? 'good' : energyTerm < 0.5 ? 'bad' : 'neutral',
  });
  reasons.push({
    label: rapportTerm > 0.7 ? 'Strong alliance' : rapportTerm < 0.35 ? 'Still strangers' : 'Building trust',
    delta: W.rapport * rapportTerm,
    kind: rapportTerm > 0.7 ? 'good' : rapportTerm < 0.35 ? 'bad' : 'neutral',
  });
  reasons.push({
    label:
      fFit > 0.75
        ? `${FOCUSES[focus].name} was the right call`
        : fFit < 0.4
          ? `${FOCUSES[focus].name} was mistimed`
          : `${FOCUSES[focus].name}`,
    delta: W.focusFit * fFit,
    kind: fFit > 0.75 ? 'good' : fFit < 0.4 ? 'bad' : 'neutral',
  });
  if (tech) {
    reasons.push({
      label: tFit > 0.75 ? `${tech.name} landed` : tFit < 0.4 ? `${tech.name} misfired` : tech.name,
      delta: W.technique * tFit,
      kind: tFit > 0.75 ? 'good' : tFit < 0.4 ? 'bad' : 'neutral',
    });
  }

  // ── Additive modifiers ────────────────────────────────────────────────────
  // Collected separately, then clamped as a group. Letting these accumulate
  // freely is what let a fully-upgraded office pin every session at the ceiling.
  let mods = 0;
  const push = (label: string, delta: number) => {
    if (Math.abs(delta) < 0.002) return;
    mods += delta;
    reasons.push({ label, delta, kind: delta > 0 ? 'good' : 'bad' });
  };

  push('Traits', clamp(traitMod(t, 'quality'), -TRAIT_QUALITY_CLAMP, TRAIT_QUALITY_CLAMP));
  const aff = conditionAffinity(t, c);
  if (aff) push('Personal affinity for this case', aff);

  const timeShift =
    slot <= 3 ? traitMod(t, 'morningShift') : slot >= 7 ? traitMod(t, 'eveningShift') : 0;
  if (timeShift) push(slot <= 3 ? 'Morning person' : 'Evening person', timeShift);

  const moraleMod = ((t.morale - 55) / 100) * 0.06;
  push(t.morale >= 70 ? 'High morale' : t.morale < 40 ? 'Low morale' : 'Morale', moraleMod);

  push('Office & equipment', upgradeQuality(state));

  if (tech?.effects.quality) push(`${tech.name} bonus`, tech.effects.quality);

  if (state.philosophy) {
    const ph = philosophyById[state.philosophy];
    if (ph?.mods.quality) push(ph.name, ph.mods.quality);
  }

  if (c.complex) push('Complex case', -0.05);
  if (c.severity >= 4) push('High severity', -0.03 * (c.severity - 3));

  // Mentorship: a mentee working near their mentor gets a small lift.
  if (t.mentorId && state.therapists.some((x) => x.id === t.mentorId && x.status !== 'departed')) {
    push('Supervision support', 0.02);
  }

  const clampedMods = clamp(mods, MOD_FLOOR, MOD_CEILING);
  if (clampedMods < mods) {
    reasons.push({ label: 'Diminishing returns on advantages', delta: clampedMods - mods, kind: 'neutral' });
  }
  raw = clamp01(raw + clampedMods);

  const cap = skillCap(state.practiceLevel);
  let quality = compress(raw, cap);
  if (raw > cap) {
    reasons.push({
      label: `Held by the practice ceiling (Level ${state.practiceLevel})`,
      delta: cap - raw,
      kind: 'neutral',
    });
  }
  if (variance) {
    quality += variance;
    if (Math.abs(variance) > 0.025) {
      reasons.push({
        label: variance > 0 ? 'The hour simply went well' : 'One of those hours',
        delta: variance,
        kind: variance > 0 ? 'good' : 'bad',
      });
    }
  }
  quality = clamp(quality, 0.05, 1);

  return { quality, raw, cap, grade: gradeFor(quality), reasons };
}

/** Chance the client loses ground this session. Always shown before the choice. */
export function regressionChance(
  state: GameState,
  c: Client,
  focus: SessionFocus,
  techniqueId?: string,
): number {
  const f = FOCUSES[focus];
  const tech = techniqueId ? techniqueById[techniqueId] : undefined;
  let chance = f.regressionBase;
  const gap = Math.max(0, f.safeStability - c.stability);
  chance += gap * 0.85;
  if (tech?.minStability !== undefined) {
    chance += Math.max(0, tech.minStability - c.stability) * 0.5;
  }
  chance *= 1 - clamp01(c.resilience) * 0.55;
  chance *= tech?.effects.regression ?? 1;
  chance *= 1 + (c.severity - 3) * 0.08;
  chance *= DIFFICULTIES[state.difficulty].regressionMult;
  if (c.chapter === 'consolidation') chance *= 0.7;
  return clamp(chance, 0, 0.62);
}

export function breakthroughChance(
  q: number,
  c: Client,
  focus: SessionFocus,
  techniqueId?: string,
): number {
  const tech = techniqueId ? techniqueById[techniqueId] : undefined;
  let chance = 0;
  if (q >= 0.78) chance += (q - 0.78) * 0.5;
  chance += (tech?.effects.breakthrough ?? 0) * (q >= 0.6 ? 1 : 0.4);
  if (focus === 'process') chance *= 1.35;
  chance *= 0.7 + c.rapport * 0.6;
  return clamp(chance, 0, 0.4);
}
