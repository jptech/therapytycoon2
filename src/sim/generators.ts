import {
  AGE_RANGE_BY_CONDITION,
  COMPLEX_RATE_MULT,
  COMPLEX_SHARE,
  DIFFICULTIES,
  FAMILY_CHILD_AGE_RANGE,
  RATE_BY_PAYMENT,
  SALARY_BY_STAGE,
  SESSION_TYPE_CONDITION_BIAS,
  SESSION_TYPE_RATE_MULT,
  WEEK_ONE_PATIENCE_BUFFER,
} from './balance';
import {
  CLIENT_BACKSTORIES,
  FIRST_NAMES,
  LAST_NAMES,
  MODALITIES,
  PRONOUN_SETS,
  TECHNIQUES,
  TESTIMONIALS,
  THERAPIST_BIOS,
  TRAITS,
  philosophyById,
  techniquesByModality,
} from '../content';
import { makeId, type Rng } from './rng';
import type {
  CareerStage,
  Client,
  ConditionId,
  GameState,
  HireCandidate,
  ModalityId,
  PaymentSource,
  PortraitSeed,
  SessionType,
  Therapist,
} from './types';
import { clamp, clamp01 } from './util';

// ─────────────────────────────────────────────────────────────────────────────

export function makePortrait(rng: Rng): PortraitSeed {
  return {
    skin: rng.int(0, 7),
    hair: rng.int(0, 11),
    hairColor: rng.int(0, 8),
    face: rng.int(0, 5),
    accessory: rng.int(0, 8),
    outfit: rng.int(0, 6),
    outfitColor: rng.int(0, 9),
    hue: rng.int(0, 359),
  };
}

const ALL_CONDITIONS: ConditionId[] = [
  'anxiety',
  'depression',
  'trauma',
  'grief',
  'ocd',
  'adhd',
  'substance',
  'relationship',
  'eating',
  'bipolar',
  'identity',
  'burnout',
  'psychosis',
  'behavioral',
];

/** Base referral weight per condition — the everyday mix of a community practice. */
const CONDITION_WEIGHTS: Record<ConditionId, number> = {
  anxiety: 20,
  depression: 18,
  trauma: 11,
  grief: 8,
  ocd: 6,
  adhd: 8,
  substance: 6,
  relationship: 9,
  eating: 4,
  bipolar: 4,
  identity: 6,
  burnout: 7,
  psychosis: 2,
  behavioral: 5,
};

/** Conditions that only appear once you're established enough to be trusted with them. */
const GATED_CONDITIONS: Partial<Record<ConditionId, number>> = {
  psychosis: 35,
  eating: 22,
  bipolar: 18,
  substance: 12,
};

function initials(first: string, last: string): string {
  return `${first[0]}.${last[0]}.`;
}

export function pickName(rng: Rng): { first: string; last: string; pronouns: string } {
  return {
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
    pronouns: rng.pick(PRONOUN_SETS),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

/** The first line of a client's story feed. The room they asked for is the point. */
const INTAKE_LINE: Record<SessionType, (practice: string) => string> = {
  individual: (p) => `Referred to ${p}. First contact made.`,
  couples: (p) => `Referred to ${p} as a couple. One of them made the call.`,
  family: (p) => `Referred to ${p} as a family. The school suggested it.`,
  group: (p) => `Asked ${p} about the group. Wants to be in a room with people who get it.`,
};

export interface ClientGenOptions {
  forceComplex?: boolean;
  forceCondition?: ConditionId;
  severityBias?: number;
  sessionType?: SessionType;
  referredBy?: string;
}

export function generateClient(state: GameState, rng: Rng, opts: ClientGenOptions = {}): Client {
  const diff = DIFFICULTIES[state.difficulty];
  const rep = state.reputation;

  // Which conditions are plausibly referred to us right now?
  const philosophy = state.philosophy ? philosophyById[state.philosophy] : undefined;
  // Nobody is referred to family therapy for occupational burnout, and a couple
  // does not come in for early psychosis — the room changes who walks into it.
  const typeBias = opts.sessionType ? SESSION_TYPE_CONDITION_BIAS[opts.sessionType] : undefined;
  const weights = ALL_CONDITIONS.map((cond) => {
    const gate = GATED_CONDITIONS[cond];
    if (gate !== undefined && rep < gate) return 0;
    let w = CONDITION_WEIGHTS[cond];
    if (philosophy?.referralBias[cond]) w *= philosophy.referralBias[cond]!;
    if (typeBias?.[cond] !== undefined) w *= typeBias[cond]!;
    return w;
  });

  const condition =
    opts.forceCondition ??
    (rng.weighted(
      ALL_CONDITIONS.map((c, i) => ({ c, w: weights[i] })),
      (x) => x.w,
    )?.c ??
      'anxiety');

  const complexShare = COMPLEX_SHARE(rep) * diff.complexShareMult * (1 + (philosophy?.mods.complexCaseAffinity ?? 0));
  const complex = opts.forceComplex ?? rng.chance(clamp01(complexShare));

  const comorbidities: ConditionId[] = [];
  if (complex) {
    const n = rng.chance(0.25) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const co = rng.pick(ALL_CONDITIONS.filter((x) => x !== condition && !comorbidities.includes(x)));
      comorbidities.push(co);
    }
  } else if (rng.chance(0.18)) {
    comorbidities.push(rng.pick(ALL_CONDITIONS.filter((x) => x !== condition)));
  }

  let severity = clamp(Math.round(rng.normal(2.6 + (opts.severityBias ?? 0), 0.9)), 1, 5);
  if (complex) severity = clamp(severity + rng.int(0, 1), 2, 5);
  if (state.day <= 7) severity = Math.min(severity, 3);

  const payment = pickPayment(state, rng);
  const [lo, hi] = RATE_BY_PAYMENT[payment];
  const rate = Math.round(rng.range(lo, hi) * (complex ? COMPLEX_RATE_MULT : 1));

  const { first, last, pronouns } = pickName(rng);
  // Age follows the presenting condition, so a "Child Behavioral" referral is
  // never a sixty-year-old and the writing stays believable.
  const [ageLo, ageHi] = AGE_RANGE_BY_CONDITION[condition];
  // A family referral is filed under the young person everyone is worried about,
  // clamped back into the condition's own band so the case still reads true.
  const famLo = clamp(FAMILY_CHILD_AGE_RANGE[0], ageLo, ageHi);
  const famHi = clamp(FAMILY_CHILD_AGE_RANGE[1], ageLo, ageHi);
  const age =
    opts.sessionType === 'family'
      ? rng.int(Math.min(famLo, famHi), Math.max(famLo, famHi))
      : clamp(Math.round(rng.normal((ageLo + ageHi) / 2, (ageHi - ageLo) / 4.2)), ageLo, ageHi);

  const backstoryPool = CLIENT_BACKSTORIES.filter(
    (b) => !b.conditions || b.conditions.includes(condition),
  );
  const backstory = (backstoryPool.length ? rng.pick(backstoryPool) : rng.pick(CLIENT_BACKSTORIES)).text;

  const preferredModality = rng.chance(0.3) ? (rng.pick(MODALITIES).id as ModalityId) : undefined;

  const patienceBuffer = state.day <= 7 ? WEEK_ONE_PATIENCE_BUFFER : 0;

  const client: Client = {
    id: makeId(rng, 'c'),
    handle: initials(first, last),
    firstName: first,
    age,
    pronouns,
    portrait: makePortrait(rng),
    backstory,
    condition,
    comorbidities,
    severity,
    progress: 0,
    chapter: 'trust',
    stability: clamp01(rng.range(0.34, 0.72) - (severity - 3) * 0.07),
    rapport: clamp01(rng.range(0.12, 0.3)),
    resilience: clamp01(rng.range(0.1, 0.32) - (severity - 3) * 0.03),
    patience: clamp(rng.range(58, 84) * diff.patienceMult + patienceBuffer, 10, 100),
    payment,
    rate,
    preferredModality,
    sessionsAttended: 0,
    daysSinceSession: 0,
    joinedDay: state.day,
    playedBeats: [],
    story: [],
    complex,
    atRisk: false,
    status: 'waitlist',
    plant: rng.int(0, 5),
    sessionType: opts.sessionType ?? 'individual',
    tags: [],
    referredBy: opts.referredBy,
    authorizedSessions: payment === 'insurance' ? rng.int(8, 16) : undefined,
  };

  // Couples and family are one case with several people in it: a single record,
  // a single arc, one bill covering everyone who walks through the door.
  if (client.sessionType === 'couples') {
    const partner = pickName(rng);
    client.partnerHandles = [initials(partner.first, partner.last)];
  } else if (client.sessionType === 'family') {
    const a = pickName(rng);
    const b = pickName(rng);
    client.partnerHandles = [initials(a.first, a.last), initials(b.first, b.last)];
  }
  client.rate = Math.round(client.rate * (SESSION_TYPE_RATE_MULT[client.sessionType] ?? 1));

  client.story.push({
    day: state.day,
    text: INTAKE_LINE[client.sessionType](state.practiceName),
    mood: 'neutral',
  });

  return client;
}

function pickPayment(state: GameState, rng: Rng): PaymentSource {
  // Serving sliding-scale clients is the Community Trust lever.
  const trustPull = clamp01((60 - state.communityTrust) / 100);
  const r = rng.next();
  if (r < 0.14 + trustPull * 0.18) return 'sliding_scale';
  if (r < 0.62) return 'insurance';
  if (r < 0.94) return 'self_pay';
  return 'grant';
}

export function testimonialFor(rng: Rng, condition: ConditionId): string {
  const pool = TESTIMONIALS.filter((t) => !t.conditions || t.conditions.includes(condition));
  return (pool.length ? rng.pick(pool) : rng.pick(TESTIMONIALS)).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Therapists
// ─────────────────────────────────────────────────────────────────────────────

export interface TherapistGenOptions {
  stage?: CareerStage;
  modality?: ModalityId;
  isPlayer?: boolean;
  skillBias?: number;
  guaranteedGood?: boolean;
  vetted?: boolean;
}

export function generateTherapist(state: GameState, rng: Rng, opts: TherapistGenOptions = {}): Therapist {
  const stage: CareerStage =
    opts.stage ??
    (rng.weighted(
      [
        { s: 'junior' as CareerStage, w: 45 },
        { s: 'mid' as CareerStage, w: 38 },
        { s: 'veteran' as CareerStage, w: 17 },
      ],
      (x) => x.w,
    )?.s ??
      'junior');

  const modality = opts.modality ?? (rng.pick(MODALITIES).id as ModalityId);

  const skillBase = stage === 'junior' ? 34 : stage === 'mid' ? 55 : 72;
  let skill = clamp(rng.normal(skillBase, 8) + (opts.skillBias ?? 0), 15, 95);
  if (opts.guaranteedGood) skill = Math.max(skill, skillBase + 9);

  const traitCount = rng.chance(0.4) ? 3 : 2;
  const traitPool = [...TRAITS];
  const traits: string[] = [];
  if (opts.guaranteedGood) {
    const boons = traitPool.filter((t) => t.tone === 'boon');
    traits.push(rng.pick(boons).id);
  }
  while (traits.length < traitCount) {
    const t = rng.pick(traitPool);
    if (!traits.includes(t.id)) traits.push(t.id);
  }

  // Techniques: tier-1 of their modality always; more with seniority.
  const modTechs = techniquesByModality[modality] ?? [];
  const techniques = modTechs.filter((t) => t.tier === 1).map((t) => t.id);
  if (stage !== 'junior') {
    const t2 = modTechs.filter((t) => t.tier === 2);
    for (const t of t2.slice(0, stage === 'veteran' ? 2 : 1)) techniques.push(t.id);
  }
  if (stage === 'veteran' && rng.chance(0.5)) {
    const t3 = modTechs.find((t) => t.tier === 3 && !t.philosophy);
    if (t3) techniques.push(t3.id);
  }
  if (!techniques.length && TECHNIQUES.length) techniques.push(TECHNIQUES[0].id);

  const [slo, shi] = SALARY_BY_STAGE[stage];
  let salary = Math.round(rng.range(slo, shi) * (1 + (skill - skillBase) / 220));
  for (const id of traits) {
    const m = TRAITS.find((t) => t.id === id)?.mods?.salaryMult;
    if (m) salary = Math.round(salary * m);
  }

  const { first, last, pronouns } = pickName(rng);
  const maxEnergy = Math.round(clamp(rng.normal(100, 7), 84, 120));

  return {
    id: makeId(rng, 't'),
    name: `${first} ${last}`,
    initials: initials(first, last),
    pronouns,
    portrait: makePortrait(rng),
    modality,
    skill,
    energy: maxEnergy,
    maxEnergy,
    morale: opts.isPlayer ? 72 : clamp(rng.normal(66, 8), 40, 92),
    traits,
    techniques,
    certifications: [],
    stage,
    salary: opts.isPlayer ? 0 : salary,
    tenure: 0,
    xp: 0,
    level: 1,
    strain: 0,
    status: 'available',
    statusDays: 0,
    bonds: [],
    relationships: {},
    menteeIds: [],
    stats: { sessions: 0, cures: 0, breakthroughs: 0, sabbaticals: 0 },
    isPlayer: opts.isPlayer,
    hiredDay: state.day,
  };
}

export function generateCandidate(state: GameState, rng: Rng, opts: TherapistGenOptions = {}): HireCandidate {
  const therapist = generateTherapist(state, rng, opts);
  const bio = rng.pick(THERAPIST_BIOS);
  return {
    therapist,
    askingSalary: Math.round(therapist.salary * rng.range(1, 1.14)),
    expiresInDays: rng.int(3, 7),
    source: bio,
    vetted: opts.vetted,
  };
}

/** Relationship seeding when a new therapist joins an existing team. */
export function seedRelationships(state: GameState, newcomer: Therapist, rng: Rng): void {
  for (const other of state.therapists) {
    if (other.id === newcomer.id || other.status === 'departed') continue;
    const v = Math.round(rng.normal(8, 16));
    newcomer.relationships[other.id] = v;
    other.relationships[newcomer.id] = v;
  }
}
