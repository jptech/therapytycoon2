import type { Difficulty, SessionFocus, ConditionId, PaymentSource } from './types';

/**
 * Every tuning number the sim reads lives here so the balance harness can
 * sweep them and so designers never have to hunt through system code.
 */

/** The working day runs 8:00 → 18:00. */
export const DAY_START_MINUTE = 8 * 60;
export const DAY_LENGTH_MINUTES = 600;
export const SLOT_MINUTES = 60;
export const SESSION_MINUTES = 50;
export const SLOTS_PER_DAY = 10;

/** Real milliseconds per in-game minute at 1× speed → ~60s per full day. */
export const MS_PER_GAME_MINUTE = 100;

/** Fraction through a session at which the decision beat fires. */
export const DECISION_AT = 0.55;

export const SAVE_VERSION = 5;

/**
 * How long before a non-unique event may be drawn again. Without this the same
 * dilemma lands three days running and the texture reads as a slot machine —
 * which is exactly the complaint v1's decision events earned.
 */
export const EVENT_COOLDOWN_DAYS: Record<string, number> = {
  client: 14,
  staff: 16,
  practice: 20,
  day: 12,
  program: 18,
  session: 0,
};

/**
 * A hard cap on modals per day. Late game runs 40 sessions, and a flat per-session
 * chance would produce five interruptions a day — the opposite of cozy.
 */
export const MAX_CLIENT_EVENTS_PER_DAY = 2;
export const CLIENT_EVENT_CHANCE = 0.14;

// ── Quality formula ─────────────────────────────────────────────────────────
// quality = softCap( Σ weighted terms + modifiers ), each term in 0..1.

/**
 * Additive modifiers (traits, morale, office, philosophy) are summed and then
 * clamped. Without this the upgrade tree alone was worth +0.5 quality, which
 * pinned every session at the ceiling — the exact "solved spreadsheet" failure.
 */
export const MOD_CEILING = 0.12;
export const MOD_FLOOR = -0.3;
/** Aggregate office/equipment bonus asymptotes here no matter how much you buy. */
export const UPGRADE_QUALITY_ASYMPTOTE = 0.11;
/** Aggregate trait quality contribution is clamped to ±this. */
export const TRAIT_QUALITY_CLAMP = 0.05;

export const QUALITY_WEIGHTS = {
  skill: 0.3,
  specialization: 0.17,
  energy: 0.13,
  rapport: 0.16,
  focusFit: 0.13,
  technique: 0.11,
} as const;

/**
 * Above the knee, extra quality is compressed asymptotically toward 1.0 — so a
 * perfect session is always *approachable* and never *achievable*. A linear
 * clamp here was the original sin of v1: it made 1.0 both reachable and common.
 */
export const DIMINISH_KNEE = 0.72;
export const DIMINISH_SCALE = 0.2;

/**
 * The hard ceiling on any session, rising with practice level (index = level-1).
 * This is the structural answer to "the flywheel saturated": mastery is
 * something the whole practice grows into over a hundred days, not a plateau
 * one good therapist hits in hour four.
 */
export const SKILL_CAP_BY_LEVEL = [0.72, 0.75, 0.78, 0.8, 0.82, 0.84, 0.855, 0.87, 0.885, 0.9];

export const GRADE_THRESHOLDS: { grade: string; min: number }[] = [
  { grade: 'breakthrough', min: 0.86 },
  { grade: 'excellent', min: 0.79 },
  { grade: 'good', min: 0.63 },
  { grade: 'mixed', min: 0.44 },
  { grade: 'poor', min: 0 },
];

/**
 * Hours vary for reasons no formula captures — traffic, sleep, what happened at
 * breakfast. Each session draws one normal sample, stored on the session so the
 * preview and the result agree.
 */
export const SESSION_VARIANCE = 0.05;

// ── Focus behaviour ─────────────────────────────────────────────────────────

export interface FocusProfile {
  id: SessionFocus;
  name: string;
  blurb: string;
  /** Multiplier on progress delta. */
  progressMult: number;
  /** Client stability change per session. */
  stabilityDelta: number;
  /** Client rapport change per session. */
  rapportDelta: number;
  /** Resilience change per session. */
  resilienceDelta: number;
  /** Therapist energy cost multiplier. */
  energyMult: number;
  /** Base regression chance before stability/resilience modifiers. */
  regressionBase: number;
  /** Stability below which this focus is risky. */
  safeStability: number;
  icon: string;
  color: string;
}

export const FOCUSES: Record<SessionFocus, FocusProfile> = {
  stabilize: {
    id: 'stabilize',
    name: 'Stabilize',
    blurb: 'Slow the water down. Small progress, restores safety and trust.',
    progressMult: 0.62,
    stabilityDelta: 0.16,
    rapportDelta: 0.07,
    resilienceDelta: 0.02,
    energyMult: 0.78,
    regressionBase: 0.01,
    safeStability: 0,
    icon: '🫖',
    color: '#8FAF8B',
  },
  process: {
    id: 'process',
    name: 'Process',
    blurb: 'Go toward the hard thing. Big progress — costly, and risky if they are not ready.',
    progressMult: 1.55,
    stabilityDelta: -0.14,
    rapportDelta: 0.02,
    resilienceDelta: 0.01,
    energyMult: 1.35,
    regressionBase: 0.09,
    safeStability: 0.55,
    icon: '🌊',
    color: '#8B6B8F',
  },
  build_skills: {
    id: 'build_skills',
    name: 'Build Skills',
    blurb: 'Practical tools between sessions. Steady progress, raises resilience.',
    progressMult: 1.0,
    stabilityDelta: 0.03,
    rapportDelta: 0.03,
    resilienceDelta: 0.075,
    energyMult: 1.0,
    regressionBase: 0.03,
    safeStability: 0.3,
    icon: '🧰',
    color: '#E8A94C',
  },
};

// ── Progress & arcs ─────────────────────────────────────────────────────────

/**
 * Base progress points per session at quality 1.0, severity 3. Tuned so a
 * moderate case takes roughly 14–18 sessions — long enough that a caseload is a
 * commitment, short enough that goodbyes keep arriving.
 */
export const BASE_PROGRESS = 4.6;
/** Progress scales down with severity: mult = 1 - (severity-1) * SEVERITY_DRAG. */
export const SEVERITY_DRAG = 0.11;
export const CHAPTER_BOUNDS: Record<string, [number, number]> = {
  trust: [0, 34],
  work: [34, 76],
  consolidation: [76, 100],
};
/** Rapport gates progress in the Trust chapter — you cannot rush the alliance. */
export const TRUST_RAPPORT_GATE = 0.45;
export const REGRESSION_LOSS = 5.5;
export const BREAKTHROUGH_BONUS = 6;
export const BREAKTHROUGH_BASE_CHANCE = 0.05;

/** Rapport, stability and resilience all approach their ceiling asymptotically. */
export const ALLIANCE_SOFTNESS = 0.85;

// ── Client flow ─────────────────────────────────────────────────────────────

export const PATIENCE_DECAY_PER_IDLE_DAY = 7;
/** Each further idle day hurts more than the last — neglect compounds. */
export const PATIENCE_DECAY_ACCEL = 0.22;
export const PATIENCE_RECOVER_PER_SESSION = 10;
export const DROPOUT_PATIENCE_THRESHOLD = 22;
export const AT_RISK_PATIENCE_THRESHOLD = 42;
/** Weekly referral base, scaled by reputation and upgrades. */
export const BASE_REFERRALS_PER_DAY = 0.9;
export const REFERRAL_REP_SCALE = 0.035;
/** Share of referrals that are complex, as a function of reputation. */
export const COMPLEX_SHARE = (rep: number) => Math.min(0.55, Math.max(0, (rep - 25) / 130));

export const RATE_BY_PAYMENT: Record<PaymentSource, [number, number]> = {
  insurance: [76, 104],
  self_pay: [104, 146],
  sliding_scale: [31, 57],
  grant: [85, 116],
};

export const COMPLEX_RATE_MULT = 1.35;

/**
 * Not every billed hour is a collected hour. Insurance claims get denied and
 * resubmitted; self-pay clients occasionally vanish. Surfaced in the finances
 * panel rather than hidden, because margin pressure is part of the fantasy.
 */
export const COLLECTION_RATE: Record<PaymentSource, number> = {
  insurance: 0.9,
  self_pay: 0.97,
  sliding_scale: 1,
  grant: 0.95,
};

// ── Therapist economy ───────────────────────────────────────────────────────

export const BASE_ENERGY = 100;
export const ENERGY_PER_SESSION = 14;
export const ENERGY_REGEN_OVERNIGHT = 70;
/** A comfortable day. Past this, strain accumulates and burnout becomes real. */
export const COMFORTABLE_SESSIONS_PER_DAY = 4.5;
export const STRAIN_PER_EXTRA_SESSION = 6.5;
export const STRAIN_PER_LOW_ENERGY_DAY = 9;
export const STRAIN_RECOVERY_PER_GOOD_DAY = 7;
export const SABBATICAL_DAYS: [number, number] = [2, 4];
export const SABBATICAL_MAX_ENERGY_BONUS = 8;

export const SALARY_BY_STAGE: Record<string, [number, number]> = {
  junior: [185, 255],
  mid: [286, 386],
  veteran: [417, 566],
};

export const MORALE_TARGETS = {
  fairWorkload: 5,
  overworkedPenalty: -9,
  idlePenalty: -2,
  cureBoost: 4,
  breakthroughBoost: 3,
  dropoutPenalty: -3,
  relationshipBoost: 2,
  officeQualityScale: 0.35,
};

/**
 * Morale is pulled back toward this baseline every night. Without it, small
 * positive drifts compound into a permanently ecstatic team, which removes the
 * whole retention game.
 */
export const MORALE_BASELINE = 55;
export const MORALE_REVERSION = 0.11;
/** Aggregate nightly morale lift from the office asymptotes here. */
export const UPGRADE_MORALE_ASYMPTOTE = 0.6;
/** Aggregate nightly morale lift from good relationships, however big the team. */
export const RELATIONSHIP_MORALE_CAP = 0.4;

/** Morale below this and poaching offers start appearing. */
export const POACH_MORALE_THRESHOLD = 58;
export const POACH_CHANCE_PER_DAY = 0.06;

// ── Practice economy ────────────────────────────────────────────────────────

export const BASE_RENT_PER_DAY = 88;
export const RENT_PER_THERAPIST = 52;
export const OVERHEAD_PER_CLIENT = 4.5;
/**
 * Notes, billing, and supervision cost per session actually delivered. Tying
 * most overhead to activity rather than headcount stops a large waitlist-heavy
 * caseload from quietly bankrupting a practice that is otherwise doing fine.
 */
export const SESSION_OVERHEAD = 9;
export const STARTING_CASH: Record<Difficulty, number> = {
  cozy: 4200,
  standard: 3000,
  challenge: 2400,
};

export const XP_PER_LEVEL = [0, 340, 900, 1900, 3600, 6400, 10800, 17600, 28000, 44000, 68000];
export const PRACTICE_LEVEL_CAPACITY = [5, 8, 12, 16, 21, 27, 33, 40, 48, 56];
export const THERAPIST_SLOTS_BY_LEVEL = [1, 2, 2, 3, 4, 5, 6, 7, 8, 9];

export const REPUTATION_PER_CURE = 2.4;
export const REPUTATION_PER_COMPLEX_CURE = 4.2;
export const REPUTATION_PER_DROPOUT = -1.9;
export const REPUTATION_DECAY_PER_DAY = 0.05;
/**
 * Reputation and trust both resist their own ceiling: gains are multiplied by
 * (1 - v/100)^n and decay grows with the value. Being *known* is easy; being
 * the best-regarded practice in the city should stay just out of reach.
 */
export const REPUTATION_GAIN_FALLOFF = 1.45;
export const REPUTATION_DECAY_SCALE = 0.0065;

export const COMMUNITY_TRUST_PER_SLIDING_CLIENT = 1.5;
export const COMMUNITY_TRUST_DRIFT_PER_DAY = -0.3;
export const COMMUNITY_TRUST_GAIN_FALLOFF = 1.3;

// ── Difficulty ──────────────────────────────────────────────────────────────

export interface DifficultyProfile {
  id: Difficulty;
  name: string;
  blurb: string;
  revenueMult: number;
  expenseMult: number;
  patienceMult: number;
  strainMult: number;
  regressionMult: number;
  referralMult: number;
  /** Cozy can never go bankrupt. */
  bankruptcy: boolean;
  complexShareMult: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  cozy: {
    id: 'cozy',
    name: 'Cozy',
    blurb: 'No bankruptcy — a rough patch becomes a story, not a game over.',
    revenueMult: 1.15,
    expenseMult: 0.85,
    patienceMult: 1.35,
    strainMult: 0.72,
    regressionMult: 0.7,
    referralMult: 1.2,
    bankruptcy: false,
    complexShareMult: 0.8,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    blurb: 'Money matters. Bankruptcy is a three-stage arc with clear off-ramps.',
    revenueMult: 1,
    expenseMult: 1,
    patienceMult: 1,
    strainMult: 1,
    regressionMult: 1,
    referralMult: 1,
    bankruptcy: true,
    complexShareMult: 1,
  },
  challenge: {
    id: 'challenge',
    name: 'Challenge',
    blurb: 'Tight margins, impatient clients, and the hard cases come early.',
    revenueMult: 0.93,
    expenseMult: 1.1,
    patienceMult: 0.85,
    strainMult: 1.25,
    regressionMult: 1.3,
    referralMult: 0.92,
    bankruptcy: true,
    complexShareMult: 1.4,
  },
};

// ── Act pacing ──────────────────────────────────────────────────────────────

export const ACT2_DAY = 15;
export const ACT3_DAY = 55;
/** Act 3 also requires this many therapists. */
export const ACT3_THERAPISTS = 4;

// ── Week-one generosity ─────────────────────────────────────────────────────

export const WEEK_ONE_REFERRAL_MULT = 2;
export const WEEK_ONE_PATIENCE_BUFFER = 25;

/** Under this age a client is a minor, and the modality that fits changes. */
export const MINOR_AGE = 18;

/**
 * Plausible age bands per presenting condition. Without these the generator
 * produced sixty-year-olds referred for "Child Behavioral", which quietly
 * undermines every other piece of writing in the game.
 */
export const AGE_RANGE_BY_CONDITION: Record<ConditionId, [number, number]> = {
  anxiety: [15, 72],
  depression: [16, 78],
  trauma: [17, 74],
  grief: [16, 84],
  ocd: [13, 62],
  adhd: [7, 48],
  substance: [18, 66],
  relationship: [21, 72],
  eating: [13, 44],
  bipolar: [18, 58],
  identity: [14, 46],
  burnout: [24, 64],
  psychosis: [16, 38],
  behavioral: [5, 16],
};

/** Modalities built for children, and the ones that assume an adult in the chair. */
export const CHILD_MODALITIES: string[] = ['play'];
export const ADULT_MODALITIES: string[] = ['psychodynamic', 'act', 'emdr', 'dbt'];
/** Quality penalty when a modality and a client's age are working against each other. */
export const AGE_MISMATCH_PENALTY = 0.34;

export const CONDITION_LABELS: Record<ConditionId, string> = {
  anxiety: 'Anxiety',
  depression: 'Depression',
  trauma: 'Trauma / PTSD',
  grief: 'Grief',
  ocd: 'OCD',
  adhd: 'ADHD',
  substance: 'Substance Use',
  relationship: 'Relationship Distress',
  eating: 'Eating Disorder',
  bipolar: 'Bipolar II',
  identity: 'Identity & Belonging',
  burnout: 'Burnout',
  psychosis: 'Early Psychosis',
  behavioral: 'Child Behavioral',
};

export const SEVERITY_LABELS = ['', 'Mild', 'Moderate', 'Marked', 'Severe', 'Acute'];
