/**
 * Therapy Tycoon II — headless simulation type contract.
 *
 * NOTHING in src/sim may import from React, Pixi, or the DOM. The whole
 * simulation is a pure function of (state, action, rng) so that the balance
 * harness in tools/ can run thousands of headless days and so replays are
 * deterministic.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations & content ids
// ─────────────────────────────────────────────────────────────────────────────

export type ModalityId =
  | 'cbt'
  | 'dbt'
  | 'emdr'
  | 'somatic'
  | 'psychodynamic'
  | 'act'
  | 'play'
  | 'family';

export type ConditionId =
  | 'anxiety'
  | 'depression'
  | 'trauma'
  | 'grief'
  | 'ocd'
  | 'adhd'
  | 'substance'
  | 'relationship'
  | 'eating'
  | 'bipolar'
  | 'identity'
  | 'burnout'
  | 'psychosis'
  | 'behavioral';

export type SessionFocus = 'stabilize' | 'process' | 'build_skills';

export type SessionType = 'individual' | 'couples' | 'family' | 'group';

export type ArcChapter = 'trust' | 'work' | 'consolidation';

export type Difficulty = 'cozy' | 'standard' | 'challenge';

export type PhilosophyId = 'trauma_informed' | 'family_community' | 'integrative_wellness';

export type ProgramId =
  | 'group_therapy'
  | 'workshops'
  | 'school_partnership'
  | 'crisis_line'
  | 'research_study'
  | 'training_institute';

export type OutcomeGrade = 'poor' | 'mixed' | 'good' | 'excellent' | 'breakthrough';

export type Act = 1 | 2 | 3;

/** Career stage shapes pay expectations, mentoring and ambitions. */
export type CareerStage = 'junior' | 'mid' | 'veteran';

export type PaymentSource = 'insurance' | 'self_pay' | 'sliding_scale' | 'grant';

// ─────────────────────────────────────────────────────────────────────────────
// Content definitions (authored data, never mutated at runtime)
// ─────────────────────────────────────────────────────────────────────────────

export interface Modality {
  id: ModalityId;
  name: string;
  /** One-line pitch shown in training & hiring UI. */
  blurb: string;
  /** Conditions this modality is naturally strong with. */
  strongWith: ConditionId[];
  /** Visual tell used by the portrait / office scene. */
  prop: string;
  color: string;
}

export interface TechniqueEffects {
  /** Multiplier applied to the session's progress delta. 1 = neutral. */
  progress?: number;
  /** Flat rapport delta applied to the client (−1..+1 scale on 0..1 rapport). */
  rapport?: number;
  /** Flat stability delta on the client (0..1 scale). */
  stability?: number;
  /** Flat resilience delta on the client (0..1 scale). */
  resilience?: number;
  /** Extra therapist energy cost (added to base session cost). */
  energy?: number;
  /** Additive quality bonus before caps (0..1 scale). */
  quality?: number;
  /** Multiplier on regression chance. <1 protects. */
  regression?: number;
  /** Additive chance of a breakthrough beat this session (0..1). */
  breakthrough?: number;
}

export interface Technique {
  id: string;
  name: string;
  modality: ModalityId;
  /** 1 = starter, 2 = trained, 3 = advanced/certification-gated. */
  tier: 1 | 2 | 3;
  /** Shown on the card face. */
  blurb: string;
  /** Flavor line shown in the reflect card when it lands well. */
  flavor: string;
  /** Which focuses this technique is appropriate for. Empty = all. */
  focuses?: SessionFocus[];
  /** Conditions where the technique is especially apt. */
  goodFor?: ConditionId[];
  /** Conditions where the technique misfires. */
  poorFor?: ConditionId[];
  /** Chapters where the technique is apt. Empty = all. */
  chapters?: ArcChapter[];
  /** Requires the client to be at/above this stability to be safe. */
  minStability?: number;
  effects: TechniqueEffects;
  /** Philosophy that unlocks this technique, if exclusive. */
  philosophy?: PhilosophyId;
}

export interface TraitDef {
  id: string;
  name: string;
  /** Short description shown on the therapist card. */
  blurb: string;
  /** 'boon' traits read positive, 'quirk' traits are trade-offs. */
  tone: 'boon' | 'quirk';
  /** Numeric hooks read by the sim. All optional and additive. */
  mods?: {
    quality?: number;
    energyCostMult?: number;
    energyRegenMult?: number;
    moraleDrift?: number;
    rapportGain?: number;
    salaryMult?: number;
    xpMult?: number;
    /** Bonus quality when working these conditions. */
    conditionAffinity?: Partial<Record<ConditionId, number>>;
    /** Quality shift for morning (before slot 4) / evening (slot >= 7) work. */
    morningShift?: number;
    eveningShift?: number;
    /** Mentorship XP granted to mentees. */
    mentorBonus?: number;
    /** Multiplier on burnout accumulation. */
    burnoutMult?: number;
  };
  /** Trait-specific event ids this therapist can trigger. */
  events?: string[];
}

export type EventScope = 'session' | 'day' | 'staff' | 'practice' | 'client' | 'program';

export interface EventChoice {
  id: string;
  label: string;
  /** Short consequence hint shown under the label — no hidden punishments. */
  hint?: string;
  /** Requirements to show this choice at all. */
  requires?: EventRequirement;
  effects: EventEffect;
  /** Optional narrative shown after choosing. */
  outcome?: string;
}

export interface EventRequirement {
  minCash?: number;
  minReputation?: number;
  minCommunityTrust?: number;
  minPracticeLevel?: number;
  act?: Act[];
  philosophy?: PhilosophyId[];
  hasProgram?: ProgramId[];
  hasUpgrade?: string[];
  therapistTrait?: string[];
  minTherapists?: number;
  flag?: string;
  notFlag?: string;
}

export interface EventEffect {
  cash?: number;
  reputation?: number;
  communityTrust?: number;
  xp?: number;
  /** Applied to the therapist involved, if any. */
  therapistMorale?: number;
  therapistEnergy?: number;
  therapistXp?: number;
  /** Applied to the client involved, if any. */
  clientRapport?: number;
  clientStability?: number;
  clientProgress?: number;
  clientPatience?: number;
  /** Applied practice-wide. */
  allMorale?: number;
  allEnergy?: number;
  /** Set a persistent flag. */
  setFlag?: string;
  clearFlag?: string;
  /** Queue a follow-up event N days later. */
  followUp?: { eventId: string; inDays: number };
  /** Free-text log line. */
  log?: string;
  /** Grant a technique / upgrade / trait. */
  grantTechnique?: string;
  grantUpgrade?: string;
  grantTherapistTrait?: string;
  /** Add a client to the waitlist immediately. */
  spawnReferral?: { severityBias?: number; complex?: boolean };
}

export interface GameEventDef {
  id: string;
  scope: EventScope;
  title: string;
  /** Body text. Supports {client}, {therapist}, {practice} tokens. */
  body: string;
  /** Weight for random selection. */
  weight: number;
  /** Only fires when these hold. */
  requires?: EventRequirement;
  /** Only fires for these conditions (client-scope events). */
  conditions?: ConditionId[];
  /** Only fires in these chapters (client-scope events). */
  chapters?: ArcChapter[];
  /** Fires at most once per run. */
  once?: boolean;
  /**
   * This conversation cannot be saved for later. A repeat inside the subject's
   * cooldown window is normally deferred until the window lifts; an `urgent`
   * event lands anyway, because a crisis call that arrives a fortnight late is
   * a worse lie than one that arrives twice.
   */
  urgent?: boolean;
  /** Minimum day before this can fire. */
  minDay?: number;
  choices: EventChoice[];
  /** Optional mood tag driving the presentation (icon/colour). */
  mood?: 'warm' | 'tense' | 'sad' | 'proud' | 'curious';
}

/** A beat in a client's treatment arc — the scripted-ish narrative spine. */
export interface ArcBeatDef {
  id: string;
  /** Which chapter this beat belongs to. */
  chapter: ArcChapter;
  /** Restrict to these conditions. Empty = any. */
  conditions?: ConditionId[];
  /** Restrict to severity band. */
  minSeverity?: number;
  maxSeverity?: number;
  /** Narrative line shown on the reflect card / client story feed. */
  text: string;
  weight: number;
  /** Mechanical nudge applied when the beat lands. */
  effects?: {
    stability?: number;
    rapport?: number;
    resilience?: number;
    progress?: number;
    patience?: number;
    /** Client now prefers this modality. */
    prefersModality?: ModalityId;
    /** Adds a comorbid condition mid-treatment. */
    addComorbidity?: ConditionId;
  };
  /** If set, fires the given event instead of a silent effect. */
  event?: string;
  mood?: 'warm' | 'tense' | 'sad' | 'proud' | 'curious';
}

export interface ProgramDef {
  id: ProgramId;
  name: string;
  blurb: string;
  /** Longer description for the launch dialog. */
  detail: string;
  setupCost: number;
  weeklyUpkeep: number;
  /** Therapists assigned; each consumes this much of a day's capacity. */
  staffSlots: number;
  /** Energy drained per assigned therapist per day. */
  energyPerDay: number;
  requires?: EventRequirement;
  /** Daily/weekly payoffs. */
  payoff: {
    weeklyCash?: number;
    /** Per-week reputation gain. */
    weeklyReputation?: number;
    weeklyCommunityTrust?: number;
    /** Extra referrals per week. */
    weeklyReferrals?: number;
    /** Chance per week of a pre-vetted hire candidate. */
    weeklyCandidateChance?: number;
    /** Progress toward a one-off completion payoff (research study). */
    completionDays?: number;
    completionReward?: EventEffect;
  };
  /** Event ids this program can fire. */
  events?: string[];
  icon: string;
  color: string;
}

export interface PhilosophyDef {
  id: PhilosophyId;
  name: string;
  tagline: string;
  detail: string;
  /** Referral weights multiplied per condition. */
  referralBias: Partial<Record<ConditionId, number>>;
  /** Discount multiplier on trainings (0.8 = 20% off). */
  trainingDiscount: number;
  /** Programs discounted / unlocked early. */
  favoredPrograms: ProgramId[];
  /** Practice-wide modifiers. */
  mods: {
    quality?: number;
    communityTrustDrift?: number;
    reputationMult?: number;
    complexCaseAffinity?: number;
  };
  accentColor: string;
  icon: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  category: 'office' | 'tech' | 'certification' | 'automation';
  requires?: EventRequirement;
  mods?: {
    quality?: number;
    energyRegenMult?: number;
    moraleDrift?: number;
    referralMult?: number;
    capacity?: number;
    /** Unlocks a session type. */
    unlockSessionType?: SessionType;
    /** Unlocks a feature flag the UI reads. */
    unlockFeature?: string;
  };
  icon: string;
}

export interface TrainingDef {
  id: string;
  name: string;
  modality: ModalityId;
  tier: 1 | 2 | 3;
  cost: number;
  /** Days the therapist is unavailable. */
  days: number;
  blurb: string;
  /** Techniques granted on completion. */
  grants: string[];
  /** Skill points granted. */
  skill: number;
  requires?: EventRequirement;
}

export interface MilestoneDef {
  id: string;
  name: string;
  blurb: string;
  /** Evaluated against RunStats + state. */
  check: (s: SnapshotForMilestones) => boolean;
  reward?: EventEffect;
  icon: string;
  tier: 1 | 2 | 3;
}

export interface SnapshotForMilestones {
  day: number;
  cash: number;
  reputation: number;
  communityTrust: number;
  practiceLevel: number;
  therapists: number;
  cures: number;
  complexCures: number;
  breakthroughs: number;
  programs: number;
  avgMorale: number;
  alumni: number;
  maxStreak: number;
}

export interface CampaignStageDef {
  id: string;
  name: string;
  blurb: string;
  requirements: CampaignRequirement[];
  reward: EventEffect;
}

export interface CampaignRequirement {
  id: string;
  label: string;
  /** Returns progress 0..1 and a display string. */
  measure: (s: SnapshotForMilestones) => { value: number; target: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime entities
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic seed material for a procedural portrait. */
export interface PortraitSeed {
  skin: number;
  hair: number;
  hairColor: number;
  face: number;
  accessory: number;
  outfit: number;
  outfitColor: number;
  hue: number;
}

export interface Therapist {
  id: string;
  name: string;
  initials: string;
  pronouns: string;
  portrait: PortraitSeed;
  modality: ModalityId;
  /** Secondary modality unlocked by cross-training, if any. */
  secondaryModality?: ModalityId;
  /** 0..100 */
  skill: number;
  /** 0..maxEnergy */
  energy: number;
  maxEnergy: number;
  /** 0..100 */
  morale: number;
  traits: string[];
  techniques: string[];
  certifications: string[];
  stage: CareerStage;
  salary: number;
  /** Days employed. */
  tenure: number;
  xp: number;
  level: number;
  /** Cumulative burnout pressure 0..100; sabbatical at 100. */
  strain: number;
  status: TherapistStatus;
  /** Days remaining in current non-working status. */
  statusDays: number;
  /** Client ids this therapist has a strong bond with. */
  bonds: string[];
  /** therapistId -> relationship score −100..100 */
  relationships: Record<string, number>;
  mentorId?: string;
  menteeIds: string[];
  /** Set when a rival practice is courting them. */
  poachOffer?: { salary: number; daysLeft: number; rival: string };
  /** Lifetime counters. */
  stats: { sessions: number; cures: number; breakthroughs: number; sabbaticals: number };
  /** True for the player's own avatar therapist. */
  isPlayer?: boolean;
  hiredDay: number;
  /** Preferred day slots (0..9); used by the auto-scheduler. */
  preferredSlots?: number[];
}

export type TherapistStatus =
  | 'available'
  | 'in_session'
  | 'training'
  | 'sabbatical'
  | 'conference'
  | 'program'
  | 'departed';

export interface Client {
  id: string;
  /** Anonymised handle, e.g. "A.M." */
  handle: string;
  /** Full first name used in warm narrative moments only. */
  firstName: string;
  age: number;
  pronouns: string;
  portrait: PortraitSeed;
  /** Two-line backstory. */
  backstory: string;
  condition: ConditionId;
  comorbidities: ConditionId[];
  /** 1 (mild) .. 5 (severe) */
  severity: number;
  /** 0..100 treatment progress. */
  progress: number;
  chapter: ArcChapter;
  /** 0..1 how safe/regulated they feel; low stability makes Process dangerous. */
  stability: number;
  /** 0..1 therapeutic alliance. */
  rapport: number;
  /** 0..1 protects against regression. */
  resilience: number;
  /** 0..100; drops when unseen, drives dropout. */
  patience: number;
  payment: PaymentSource;
  /** Per-session fee. */
  rate: number;
  preferredModality?: ModalityId;
  /** Therapist currently assigned. */
  therapistId?: string;
  sessionsAttended: number;
  daysSinceSession: number;
  /** Day they joined the caseload. */
  joinedDay: number;
  /** Beat ids already played. */
  playedBeats: string[];
  /** Narrative feed lines, newest first. */
  story: ClientStoryEntry[];
  /** True for high-complexity referrals. */
  complex: boolean;
  /** Set when a crisis or dropout risk is flagged. */
  atRisk: boolean;
  status: 'waitlist' | 'active' | 'cured' | 'dropped' | 'referred_out';
  /** Cosmetic: which plant species represents their growth. */
  plant: number;
  /** For couples/family/group cases. */
  sessionType: SessionType;
  /** Companions in couples/family sessions. */
  partnerHandles?: string[];
  /** Weeks of sessions before insurance re-auth is needed. */
  authorizedSessions?: number;
  /** Referred by an alumnus. */
  referredBy?: string;
  tags: string[];
}

export interface ClientStoryEntry {
  day: number;
  text: string;
  mood: 'warm' | 'tense' | 'sad' | 'proud' | 'curious' | 'neutral';
}

export interface AlumniRecord {
  id: string;
  handle: string;
  firstName: string;
  portrait: PortraitSeed;
  condition: ConditionId;
  curedDay: number;
  sessions: number;
  therapistId: string;
  therapistName: string;
  testimonial: string;
  complex: boolean;
}

export interface ScheduledSession {
  id: string;
  clientId: string;
  therapistId: string;
  /** 0..SLOTS_PER_DAY-1 */
  slot: number;
  focus: SessionFocus;
  type: SessionType;
  status: 'scheduled' | 'active' | 'done' | 'missed' | 'cancelled';
  /** 0..1 progress through the session, set while active. */
  t: number;
  /** Set once resolved. */
  result?: SessionResult;
  /** Technique chosen during the play beat. */
  techniqueUsed?: string;
  /** True when the auto-scheduler booked it. */
  auto?: boolean;
  /** Normal sample drawn when the session starts; keeps preview and result consistent. */
  variance?: number;
}

export interface SessionResult {
  sessionId: string;
  clientId: string;
  therapistId: string;
  quality: number;
  grade: OutcomeGrade;
  progressDelta: number;
  rapportDelta: number;
  stabilityDelta: number;
  resilienceDelta: number;
  energyCost: number;
  revenue: number;
  xp: number;
  breakthrough: boolean;
  regression: boolean;
  cured: boolean;
  /** Chapter advanced this session. */
  chapterAdvanced?: ArcChapter;
  /** Plain-language reasons — the "no hidden punishments" contract. */
  reasons: { label: string; delta: number; kind: 'good' | 'bad' | 'neutral' }[];
  narrative: string;
  beat?: { id: string; text: string; mood: string };
  techniqueUsed?: string;
  focus: SessionFocus;
}

export interface ProgramInstance {
  id: ProgramId;
  startedDay: number;
  therapistIds: string[];
  /** Days accumulated toward completionDays. */
  progressDays: number;
  active: boolean;
  /** Lifetime cash generated. */
  lifetimeCash: number;
  completed?: boolean;
}

/** Act-3 auto-scheduler policy rule. */
export interface Policy {
  id: string;
  label: string;
  enabled: boolean;
  kind: PolicyKind;
  /** Numeric parameter, meaning depends on kind. */
  value: number;
  /** Optional target therapist/condition. */
  targetTherapistId?: string;
  targetCondition?: ConditionId;
  targetFocus?: SessionFocus;
}

export type PolicyKind =
  | 'max_sessions_per_therapist'
  | 'min_energy_reserve'
  | 'prioritize_severity'
  | 'prioritize_at_risk'
  | 'route_condition_to_therapist'
  | 'reserve_slot_for_supervision'
  | 'match_specialization'
  | 'default_focus'
  | 'protect_low_stability'
  | 'balance_workload';

export interface HireCandidate {
  therapist: Therapist;
  askingSalary: number;
  /** Days before the candidate takes another job. */
  expiresInDays: number;
  /** Where they came from, for flavour. */
  source: string;
  /** Pre-vetted by the Training Institute. */
  vetted?: boolean;
}

export interface CampaignState {
  stageIndex: number;
  /** Stage ids completed. */
  completed: string[];
  /** True once the Center of Excellence is awarded. */
  accredited: boolean;
  /** Site-visit event scheduled for this day. */
  siteVisitDay?: number;
}

export interface RunStats {
  sessionsRun: number;
  cures: number;
  complexCures: number;
  dropouts: number;
  breakthroughs: number;
  regressions: number;
  burnouts: number;
  totalRevenue: number;
  totalExpenses: number;
  bestDayRevenue: number;
  qualitySum: number;
  qualityCount: number;
  currentStreak: number;
  maxStreak: number;
  hires: number;
  departures: number;
  daysPlayed: number;
  /** Per-day history for charts and the balance harness. */
  history: DaySnapshot[];
}

export interface DaySnapshot {
  day: number;
  cash: number;
  reputation: number;
  communityTrust: number;
  clients: number;
  therapists: number;
  avgQuality: number;
  avgMorale: number;
  avgEnergy: number;
  cures: number;
  revenue: number;
  expenses: number;
  practiceLevel: number;
}

export interface LogEntry {
  id: string;
  day: number;
  minute: number;
  text: string;
  kind: 'money' | 'session' | 'client' | 'staff' | 'event' | 'milestone' | 'system';
  tone?: 'good' | 'bad' | 'neutral';
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  kind: 'milestone' | 'cure' | 'levelup' | 'warning' | 'info' | 'money';
  icon?: string;
  createdAt: number;
}

/** A pending modal the UI must resolve before the clock resumes. */
export interface PendingEvent {
  instanceId: string;
  def: GameEventDef;
  /** Resolved token substitutions. */
  title: string;
  body: string;
  choices: EventChoice[];
  therapistId?: string;
  clientId?: string;
  sessionId?: string;
  /** Session decision events carry technique cards instead of plain choices. */
  techniqueCards?: TechniqueCard[];
}

export interface TechniqueCard {
  techniqueId: string;
  name: string;
  blurb: string;
  flavor: string;
  modality: ModalityId;
  /** Pre-computed, player-visible outcome preview. */
  preview: {
    qualityHint: 'strong' | 'solid' | 'risky' | 'poor';
    progressHint: string;
    energyCost: number;
    regressionChance: number;
    notes: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Root state
// ─────────────────────────────────────────────────────────────────────────────

export interface GameState {
  version: number;
  seed: number;
  rng: RngState;
  /**
   * Monotonic counter for ids the sim mints outside the rng stream — log lines
   * and toasts. It lives on the state rather than in a module so that two
   * same-seed games in one process are byte-identical, which is what lets a
   * replay be verified by diffing whole states.
   */
  idSeq: number;
  /** 1-based day counter. */
  day: number;
  /** Minutes elapsed within the working day (0 = 8:00 AM). */
  minute: number;
  dayPhase: 'morning_brief' | 'running' | 'day_end';
  paused: boolean;
  speed: 1 | 2 | 4;
  act: Act;
  difficulty: Difficulty;

  practiceName: string;
  practiceLevel: number;
  xp: number;
  cash: number;
  /** 0..100 */
  reputation: number;
  /** 0..100 */
  communityTrust: number;
  philosophy?: PhilosophyId;

  therapists: Therapist[];
  clients: Client[];
  alumni: AlumniRecord[];
  schedule: ScheduledSession[];
  /** Yesterday's results, shown on the day-end screen. */
  lastDayResults: SessionResult[];
  candidates: HireCandidate[];
  programs: ProgramInstance[];
  policies: Policy[];
  upgrades: string[];
  campaign: CampaignState;

  /** Quarter 1..4, year 1.. */
  quarter: number;
  year: number;

  pendingEvents: PendingEvent[];
  queuedEvents: {
    eventId: string;
    day: number;
    clientId?: string;
    therapistId?: string;
    /**
     * How many times this beat has already been pushed back off a live subject
     * window. Bounded by `EVENT_MAX_DEFERRALS`, after which it lands anyway —
     * a beat delayed forever is a beat deleted.
     */
    deferrals?: number;
  }[];
  firedOnce: string[];
  /** eventId → the first day it may be randomly drawn again. Keeps texture varied. */
  eventCooldowns: Record<string, number>;
  /**
   * `eventId@subject` → the first day that *person* may be handed this same
   * conversation again. `eventCooldowns` stops the same dilemma being drawn
   * twice in a fortnight; this stops it being drawn twice about the same client
   * — which is the repeat a player actually feels. Subject is decided by scope
   * (see `eventSubject`), and expired keys are swept nightly.
   */
  subjectCooldowns: Record<string, number>;
  flags: Record<string, number | string | boolean>;
  milestonesEarned: string[];

  log: LogEntry[];
  toasts: Toast[];
  stats: RunStats;

  /** Legacy points banked from previous runs (meta progression). */
  legacy: LegacyState;

  /** Onboarding spotlight step, −1 when complete. */
  tutorialStep: number;
  /** Accessibility / comfort. */
  settings: GameSettings;

  /** True once the run has ended (accredited or collapsed). */
  ended?: { kind: 'accredited' | 'collapsed' | 'retired'; day: number };
}

export interface GameSettings {
  calmMode: boolean;
  reducedMotion: boolean;
  sound: boolean;
  music: boolean;
  volume: number;
  autoPauseOnEvent: boolean;
  showAdvancedNumbers: boolean;
}

export interface LegacyState {
  points: number;
  spent: string[];
  runsCompleted: number;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions — the only way the outside world mutates the sim
// ─────────────────────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'TICK'; dtMinutes: number }
  | { type: 'SET_SPEED'; speed: 1 | 2 | 4 }
  | { type: 'TOGGLE_PAUSE'; paused?: boolean }
  | { type: 'START_DAY' }
  | { type: 'END_DAY' }
  | { type: 'BOOK_SESSION'; clientId: string; therapistId: string; slot: number; focus?: SessionFocus }
  | { type: 'UNBOOK_SESSION'; sessionId: string }
  | { type: 'SET_SESSION_FOCUS'; sessionId: string; focus: SessionFocus }
  | { type: 'AUTOFILL_SCHEDULE' }
  | { type: 'RUN_AUTOSCHEDULER' }
  | { type: 'ACCEPT_CLIENT'; clientId: string; therapistId?: string }
  | { type: 'DECLINE_CLIENT'; clientId: string }
  | { type: 'REFER_OUT'; clientId: string }
  | { type: 'REASSIGN_CLIENT'; clientId: string; therapistId: string }
  | { type: 'RESOLVE_EVENT'; instanceId: string; choiceId: string }
  | { type: 'CHOOSE_TECHNIQUE'; instanceId: string; techniqueId: string }
  | { type: 'HIRE'; candidateId: string; negotiate?: boolean }
  | { type: 'DISMISS_CANDIDATE'; candidateId: string }
  | { type: 'FIRE_THERAPIST'; therapistId: string }
  | { type: 'COUNTER_POACH'; therapistId: string; raise: number }
  | { type: 'START_TRAINING'; therapistId: string; trainingId: string }
  | { type: 'SET_MENTORSHIP'; mentorId: string; menteeId: string }
  | { type: 'BUY_UPGRADE'; upgradeId: string }
  | { type: 'LAUNCH_PROGRAM'; programId: ProgramId; therapistIds: string[] }
  | { type: 'STAFF_PROGRAM'; programId: ProgramId; therapistIds: string[] }
  | { type: 'CLOSE_PROGRAM'; programId: ProgramId }
  | { type: 'CHOOSE_PHILOSOPHY'; philosophy: PhilosophyId }
  | { type: 'SET_POLICY'; policy: Policy }
  | { type: 'REMOVE_POLICY'; policyId: string }
  | { type: 'DISMISS_TOAST'; toastId: string }
  | { type: 'SET_SETTING'; key: keyof GameSettings; value: boolean | number }
  /**
   * Sets a transient presentation flag (`showQuarterReview`, `autoSchedule`…).
   * These used to be written straight onto `state.flags` by the panels that own
   * them, which is invisible to a recorded action log — so a replay of a run
   * where someone closed the quarter review drifted from the run itself.
   * `null` clears the flag.
   */
  | { type: 'SET_FLAG'; key: string; value: number | string | boolean | null }
  | { type: 'ADVANCE_TUTORIAL'; step?: number }
  | { type: 'SET_PRACTICE_NAME'; name: string }
  | { type: 'RETIRE_RUN' };

// ─────────────────────────────────────────────────────────────────────────────
// Event bus payloads — the UI/audio/scene layers subscribe to these
// ─────────────────────────────────────────────────────────────────────────────

export interface SimEvents {
  DAY_STARTED: { day: number };
  DAY_ENDED: { day: number; revenue: number; expenses: number; results: SessionResult[] };
  SESSION_STARTED: { session: ScheduledSession };
  SESSION_COMPLETED: { result: SessionResult };
  SESSION_DECISION: { instanceId: string; sessionId: string };
  CLIENT_ARRIVED: { clientId: string };
  CLIENT_CURED: { clientId: string; alumni: AlumniRecord };
  CLIENT_DROPPED: { clientId: string };
  CLIENT_AT_RISK: { clientId: string };
  THERAPIST_HIRED: { therapistId: string };
  THERAPIST_LEVELED: { therapistId: string; level: number };
  THERAPIST_BURNOUT: { therapistId: string };
  THERAPIST_DEPARTED: { therapistId: string };
  PRACTICE_LEVELED: { level: number };
  ACT_CHANGED: { act: Act };
  MILESTONE_EARNED: { milestoneId: string };
  EVENT_RAISED: { instanceId: string };
  MONEY_CHANGED: { delta: number; reason: string };
  PROGRAM_LAUNCHED: { programId: ProgramId };
  QUARTER_ENDED: { quarter: number; year: number };
  CAMPAIGN_STAGE: { stageId: string };
  RUN_ENDED: { kind: string };
  TOAST: { toast: Toast };
}

export type SimEventName = keyof SimEvents;
