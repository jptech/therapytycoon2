import {
  ACT2_DAY,
  ACT3_DAY,
  ACT3_THERAPISTS,
  AT_RISK_PATIENCE_THRESHOLD,
  BASE_REFERRALS_PER_DAY,
  BASE_RENT_PER_DAY,
  COMFORTABLE_SESSIONS_PER_DAY,
  COMMUNITY_TRUST_DRIFT_PER_DAY,
  COMMUNITY_TRUST_GAIN_FALLOFF,
  COMMUNITY_TRUST_PER_SLIDING_CLIENT,
  DAY_LENGTH_MINUTES,
  DAY_START_MINUTE,
  DECISION_AT,
  CLIENT_EVENT_CHANCE,
  DIFFICULTIES,
  DROPOUT_PATIENCE_THRESHOLD,
  ENERGY_REGEN_OVERNIGHT,
  FOCUSES,
  MORALE_BASELINE,
  MORALE_REVERSION,
  RELATIONSHIP_MORALE_CAP,
  UPGRADE_MORALE_ASYMPTOTE,
  MAX_CLIENT_EVENTS_PER_DAY,
  MORALE_TARGETS,
  OVERHEAD_PER_CLIENT,
  PATIENCE_DECAY_PER_IDLE_DAY,
  POACH_CHANCE_PER_DAY,
  POACH_MORALE_THRESHOLD,
  PRACTICE_LEVEL_CAPACITY,
  REFERRAL_REP_SCALE,
  RENT_PER_THERAPIST,
  REPUTATION_DECAY_PER_DAY,
  REPUTATION_DECAY_SCALE,
  REPUTATION_GAIN_FALLOFF,
  REPUTATION_PER_COMPLEX_CURE,
  REPUTATION_PER_CURE,
  REPUTATION_PER_DROPOUT,
  SABBATICAL_DAYS,
  SABBATICAL_MAX_ENERGY_BONUS,
  SAVE_VERSION,
  SESSION_VARIANCE,
  PATIENCE_DECAY_ACCEL,
  STRAIN_PER_EXTRA_SESSION,
  SESSION_MINUTES,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  STARTING_CASH,
  STRAIN_PER_LOW_ENERGY_DAY,
  STRAIN_RECOVERY_PER_GOOD_DAY,
  THERAPIST_SLOTS_BY_LEVEL,
  WEEK_ONE_REFERRAL_MULT,
  XP_PER_LEVEL,
} from './balance';
import {
  AMBIENT_LOG_LINES,
  CAMPAIGN_STAGES,
  MENTOR_LINES,
  MILESTONES,
  PRACTICE_NAME_PARTS,
  RIVAL_PRACTICES,
  TRAININGS,
  philosophyById,
  programById,
  techniqueById,
  trainingById,
  upgradeById,
} from '../content';
import { EventBus } from './bus';
import {
  applyEffect,
  activeTherapists,
  pickEvent,
  raiseEvent,
  raiseEventById,
  resolvePendingEvent,
  meetsRequirement,
  sweepSubjectCooldowns,
} from './eventsys';
import { generateCandidate, generateClient, generateTherapist, makePortrait, seedRelationships, testimonialFor } from './generators';
import { traitMult, traitMod } from './quality';
import { makeId, Rng } from './rng';
import {
  DEFAULT_POLICIES,
  activeClients,
  autofillSchedule,
  bookableTherapists,
  clientBooked,
  slotTaken,
  suggestFocus,
} from './scheduler';
import { buildTechniqueCards, chapterFor, resolveSession } from './session';
import type {
  AlumniRecord,
  Act,
  CampaignStageDef,
  Client,
  Difficulty,
  GameAction,
  GameState,
  LogEntry,
  PendingEvent,
  ProgramId,
  ScheduledSession,
  SessionResult,
  SnapshotForMilestones,
  Therapist,
  Toast,
} from './types';
import { clamp, clamp01, avg, softGain } from './util';

// ─────────────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────────────

export interface NewGameOptions {
  seed?: number;
  difficulty?: Difficulty;
  practiceName?: string;
  therapistName?: string;
  modality?: GameState['therapists'][number]['modality'];
  legacy?: GameState['legacy'];
  skipTutorial?: boolean;
}

export function createInitialState(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = Rng.fromSeed(seed);

  const practiceName =
    opts.practiceName ||
    `${rng.pick(PRACTICE_NAME_PARTS.first)} ${rng.pick(PRACTICE_NAME_PARTS.second)}`;

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: rng.state,
    idSeq: 0,
    day: 1,
    minute: 0,
    dayPhase: 'morning_brief',
    paused: true,
    speed: 1,
    act: 1,
    difficulty: opts.difficulty ?? 'standard',
    practiceName,
    practiceLevel: 1,
    xp: 0,
    cash: STARTING_CASH[opts.difficulty ?? 'standard'],
    reputation: 12,
    communityTrust: 50,
    therapists: [],
    clients: [],
    alumni: [],
    schedule: [],
    lastDayResults: [],
    candidates: [],
    programs: [],
    policies: DEFAULT_POLICIES.map((p) => ({ ...p })),
    upgrades: [],
    campaign: { stageIndex: 0, completed: [], accredited: false },
    quarter: 1,
    year: 1,
    pendingEvents: [],
    queuedEvents: [],
    firedOnce: [],
    eventCooldowns: {},
    subjectCooldowns: {},
    flags: {},
    milestonesEarned: [],
    log: [],
    toasts: [],
    stats: {
      sessionsRun: 0,
      cures: 0,
      complexCures: 0,
      dropouts: 0,
      breakthroughs: 0,
      regressions: 0,
      burnouts: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      bestDayRevenue: 0,
      qualitySum: 0,
      qualityCount: 0,
      currentStreak: 0,
      maxStreak: 0,
      hires: 0,
      departures: 0,
      daysPlayed: 0,
      history: [],
    },
    legacy: opts.legacy ?? { points: 0, spent: [], runsCompleted: 0 },
    tutorialStep: opts.skipTutorial ? -1 : 0,
    settings: {
      calmMode: false,
      reducedMotion: false,
      sound: true,
      music: true,
      volume: 0.6,
      autoPauseOnEvent: true,
      showAdvancedNumbers: false,
    },
  };

  // The player's own therapist.
  const player = generateTherapist(state, rng, {
    stage: 'mid',
    modality: opts.modality,
    isPlayer: true,
    skillBias: -6,
  });
  player.name = opts.therapistName || player.name;
  player.initials = player.name
    .split(' ')
    .map((p) => p[0])
    .join('.') + '.';
  player.salary = 0;
  state.therapists.push(player);

  // Legacy perks.
  applyLegacy(state, rng);

  // Act 1 opens with three people already waiting.
  for (let i = 0; i < 3; i++) {
    const c = generateClient(state, rng, { severityBias: -0.5 });
    state.clients.push(c);
  }

  state.rng = rng.state;
  pushLog(state, `${practiceName} opens its doors.`, 'system', 'good');
  pushLog(state, MENTOR_LINES.length ? MENTOR_LINES[0] : 'Dr. Wren Halloway: "Start small. Stay curious."', 'system');
  return state;
}

function applyLegacy(state: GameState, rng: Rng): void {
  const spent = new Set(state.legacy.spent);
  if (spent.has('legacy_nest_egg')) state.cash += 1500;
  if (spent.has('legacy_reputation')) state.reputation += 8;
  if (spent.has('legacy_mentor')) {
    const mentor = generateTherapist(state, rng, { stage: 'veteran', guaranteedGood: true });
    mentor.salary = Math.round(mentor.salary * 0.5);
    state.therapists.push(mentor);
    pushLog(state, `${mentor.name} came out of semi-retirement to help you open.`, 'staff', 'good');
  }
  if (spent.has('legacy_technique')) {
    const t = state.therapists[0];
    const extra = Object.values(techniqueById).find((x) => x.tier === 2 && x.modality === t.modality);
    if (extra && !t.techniques.includes(extra.id)) t.techniques.push(extra.id);
  }
  if (spent.has('legacy_community')) state.communityTrust += 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log and toast ids come off `state.idSeq` rather than a module-level counter.
 * The counter version was invisible until you tried to diff two same-seed runs:
 * everything matched except the ids, because the second game inherited whatever
 * the first had counted to. Keeping it on the state makes a run reproducible
 * down to the last string — which is the whole premise of src/sim/replay.ts.
 */
export function pushLog(
  state: GameState,
  text: string,
  kind: LogEntry['kind'] = 'system',
  tone: LogEntry['tone'] = 'neutral',
): void {
  state.log.unshift({
    id: `log_${state.day}_${state.idSeq++}`,
    day: state.day,
    minute: state.minute,
    text,
    kind,
    tone,
  });
  if (state.log.length > 400) state.log.length = 400;
}

export function pushToast(
  state: GameState,
  bus: EventBus,
  toast: Omit<Toast, 'id' | 'createdAt'>,
): void {
  const t: Toast = { ...toast, id: `toast_${state.idSeq++}`, createdAt: state.day * 10000 + state.minute };
  state.toasts.push(t);
  if (state.toasts.length > 6) state.toasts.shift();
  bus.emit('TOAST', { toast: t });
}

export function capacity(state: GameState): number {
  const i = Math.max(0, Math.min(PRACTICE_LEVEL_CAPACITY.length - 1, state.practiceLevel - 1));
  const base = PRACTICE_LEVEL_CAPACITY[i];
  let bonus = 0;
  for (const u of state.upgrades) bonus += upgradeById[u]?.mods?.capacity ?? 0;
  return base + bonus;
}

export function therapistSlots(state: GameState): number {
  const i = Math.max(0, Math.min(THERAPIST_SLOTS_BY_LEVEL.length - 1, state.practiceLevel - 1));
  return THERAPIST_SLOTS_BY_LEVEL[i];
}

export function dailyExpenses(state: GameState): number {
  const diff = DIFFICULTIES[state.difficulty];
  const staff = activeTherapists(state).filter((t) => !t.isPlayer);
  const salaries = staff.reduce((a, t) => a + t.salary, 0);
  const rent = BASE_RENT_PER_DAY + staff.length * RENT_PER_THERAPIST;
  const overhead = activeClients(state).length * OVERHEAD_PER_CLIENT;
  const programUpkeep = state.programs
    .filter((p) => p.active)
    .reduce((a, p) => a + (programById[p.id]?.weeklyUpkeep ?? 0) / 7, 0);
  return Math.round((salaries + rent + overhead + programUpkeep) * diff.expenseMult);
}

export function snapshotForMilestones(state: GameState): SnapshotForMilestones {
  const staff = activeTherapists(state);
  return {
    day: state.day,
    cash: state.cash,
    reputation: state.reputation,
    communityTrust: state.communityTrust,
    practiceLevel: state.practiceLevel,
    therapists: staff.length,
    cures: state.stats.cures,
    complexCures: state.stats.complexCures,
    breakthroughs: state.stats.breakthroughs,
    programs: state.programs.filter((p) => p.active).length,
    avgMorale: avg(staff.map((t) => t.morale)),
    alumni: state.alumni.length,
    maxStreak: state.stats.maxStreak,
  };
}

export function slotStartMinute(slot: number): number {
  return slot * SLOT_MINUTES;
}

export function currentSlot(state: GameState): number {
  return Math.min(SLOTS_PER_DAY - 1, Math.floor(state.minute / SLOT_MINUTES));
}

export function clockMinutes(state: GameState): number {
  return DAY_START_MINUTE + state.minute;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Game object
// ─────────────────────────────────────────────────────────────────────────────

export class Game {
  state: GameState;
  rng: Rng;
  bus: EventBus;

  constructor(state: GameState, bus: EventBus = new EventBus()) {
    this.state = state;
    this.rng = new Rng(state.rng);
    this.bus = bus;
  }

  static create(opts: NewGameOptions = {}, bus?: EventBus): Game {
    return new Game(createInitialState(opts), bus);
  }

  private sync(): void {
    this.state.rng = this.rng.state;
  }

  private log = (text: string, kind = 'system', tone: 'good' | 'bad' | 'neutral' = 'neutral') =>
    pushLog(this.state, text, kind as LogEntry['kind'], tone);

  private toast = (title: string, body: string, kind: string) =>
    pushToast(this.state, this.bus, { title, body, kind: kind as Toast['kind'] });

  private effectCtx() {
    return {
      state: this.state,
      rng: this.rng,
      log: this.log,
      toast: this.toast,
      spawnReferral: (o: { severityBias?: number; complex?: boolean }) => {
        const c = generateClient(this.state, this.rng, {
          severityBias: o.severityBias,
          forceComplex: o.complex,
        });
        this.state.clients.push(c);
        this.bus.emit('CLIENT_ARRIVED', { clientId: c.id });
      },
    };
  }

  /**
   * Reputation and community trust both resist their own ceiling. Losses are
   * applied at full strength — being well regarded is easy to spend and hard to
   * accumulate, which keeps the late game from pinning every meter at 100.
   */
  private gainReputation(delta: number): void {
    const s = this.state;
    s.reputation = clamp(s.reputation + softGain(s.reputation, delta, 100, REPUTATION_GAIN_FALLOFF), 0, 100);
  }

  private gainTrust(delta: number): void {
    const s = this.state;
    s.communityTrust = clamp(
      s.communityTrust + softGain(s.communityTrust, delta, 100, COMMUNITY_TRUST_GAIN_FALLOFF),
      0,
      100,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────

  dispatch(action: GameAction): void {
    const s = this.state;
    switch (action.type) {
      case 'TICK':
        this.tick(action.dtMinutes);
        break;
      case 'SET_SPEED':
        s.speed = action.speed;
        break;
      case 'TOGGLE_PAUSE':
        s.paused = action.paused ?? !s.paused;
        break;
      case 'START_DAY':
        this.startDay();
        break;
      case 'END_DAY':
        this.endDay();
        break;
      case 'BOOK_SESSION':
        this.book(action.clientId, action.therapistId, action.slot, action.focus);
        break;
      case 'UNBOOK_SESSION': {
        const i = s.schedule.findIndex((x) => x.id === action.sessionId);
        if (i >= 0 && s.schedule[i].status === 'scheduled') s.schedule.splice(i, 1);
        break;
      }
      case 'SET_SESSION_FOCUS': {
        const sess = s.schedule.find((x) => x.id === action.sessionId);
        if (sess && sess.status === 'scheduled') sess.focus = action.focus;
        break;
      }
      case 'AUTOFILL_SCHEDULE': {
        const r = autofillSchedule(s, this.rng);
        this.log(
          r.booked ? `Auto-filled ${r.booked} session${r.booked === 1 ? '' : 's'}.` : 'Nothing left to book.',
          'system',
        );
        break;
      }
      case 'RUN_AUTOSCHEDULER': {
        const r = autofillSchedule(s, this.rng, { auto: true });
        this.log(`The scheduler booked ${r.booked} sessions from your policies.`, 'system');
        break;
      }
      case 'ACCEPT_CLIENT':
        this.acceptClient(action.clientId, action.therapistId);
        break;
      case 'DECLINE_CLIENT':
      case 'REFER_OUT':
        this.referOut(action.clientId);
        break;
      case 'REASSIGN_CLIENT': {
        const c = s.clients.find((x) => x.id === action.clientId);
        if (c) {
          c.therapistId = action.therapistId;
          const t = s.therapists.find((x) => x.id === action.therapistId);
          this.log(`${c.handle} reassigned to ${t?.name ?? 'a colleague'}.`, 'client');
          // Handovers cost a little trust.
          c.rapport = clamp01(c.rapport - 0.08);
        }
        break;
      }
      case 'RESOLVE_EVENT':
        this.resolveEvent(action.instanceId, action.choiceId);
        break;
      case 'CHOOSE_TECHNIQUE':
        this.chooseTechnique(action.instanceId, action.techniqueId);
        break;
      case 'HIRE':
        this.hire(action.candidateId, action.negotiate);
        break;
      case 'DISMISS_CANDIDATE':
        s.candidates = s.candidates.filter((c) => c.therapist.id !== action.candidateId);
        break;
      case 'FIRE_THERAPIST':
        this.departTherapist(action.therapistId, 'let go');
        break;
      case 'COUNTER_POACH':
        this.counterPoach(action.therapistId, action.raise);
        break;
      case 'START_TRAINING':
        this.startTraining(action.therapistId, action.trainingId);
        break;
      case 'SET_MENTORSHIP':
        this.setMentorship(action.mentorId, action.menteeId);
        break;
      case 'BUY_UPGRADE':
        this.buyUpgrade(action.upgradeId);
        break;
      case 'LAUNCH_PROGRAM':
        this.launchProgram(action.programId, action.therapistIds);
        break;
      case 'STAFF_PROGRAM': {
        const p = s.programs.find((x) => x.id === action.programId);
        if (p) p.therapistIds = action.therapistIds;
        break;
      }
      case 'CLOSE_PROGRAM': {
        const p = s.programs.find((x) => x.id === action.programId);
        if (p) {
          p.active = false;
          this.log(`${programById[p.id]?.name ?? p.id} wound down.`, 'system');
        }
        break;
      }
      case 'CHOOSE_PHILOSOPHY':
        this.choosePhilosophy(action.philosophy);
        break;
      case 'SET_POLICY': {
        const i = s.policies.findIndex((p) => p.id === action.policy.id);
        if (i >= 0) s.policies[i] = action.policy;
        else s.policies.push(action.policy);
        break;
      }
      case 'REMOVE_POLICY':
        s.policies = s.policies.filter((p) => p.id !== action.policyId);
        break;
      case 'DISMISS_TOAST':
        s.toasts = s.toasts.filter((t) => t.id !== action.toastId);
        break;
      case 'SET_SETTING':
        (s.settings as unknown as Record<string, unknown>)[action.key] = action.value;
        break;
      case 'SET_FLAG':
        if (action.value === null) delete s.flags[action.key];
        else s.flags[action.key] = action.value;
        break;
      case 'ADVANCE_TUTORIAL': {
        const wasRunning = s.tutorialStep >= 0;
        s.tutorialStep = action.step ?? s.tutorialStep + 1;
        // Finishing or skipping the tour hands the clock back, so nobody is left
        // staring at a paused day wondering what they broke.
        if (wasRunning && s.tutorialStep < 0 && s.dayPhase === 'running' && !s.pendingEvents.length) {
          s.paused = false;
        }
        break;
      }
      case 'SET_PRACTICE_NAME':
        s.practiceName = action.name;
        break;
      case 'RETIRE_RUN':
        this.retire();
        break;
    }
    this.sync();
  }

  // ── Clock ──────────────────────────────────────────────────────────────────

  private tick(dt: number): void {
    const s = this.state;
    if (s.paused || s.dayPhase !== 'running' || s.pendingEvents.length) return;

    s.minute = Math.min(DAY_LENGTH_MINUTES, s.minute + dt);

    for (const sess of s.schedule) {
      if (sess.status === 'cancelled' || sess.status === 'done' || sess.status === 'missed') continue;
      const start = slotStartMinute(sess.slot);
      const end = start + SESSION_MINUTES;

      if (sess.status === 'scheduled' && s.minute >= start) {
        sess.status = 'active';
        // One draw per session, stored so the reflect card can explain it.
        sess.variance = this.rng.normal(0, SESSION_VARIANCE);
        const t = s.therapists.find((x) => x.id === sess.therapistId);
        if (t && t.status === 'available') t.status = 'in_session';
        this.bus.emit('SESSION_STARTED', { session: sess });
      }

      if (sess.status === 'active') {
        sess.t = clamp01((s.minute - start) / SESSION_MINUTES);

        // The decision beat.
        if (!sess.techniqueUsed && sess.t >= DECISION_AT) {
          if (this.shouldAutoResolveTechnique()) {
            const cards = buildTechniqueCards(s, sess, this.rng);
            if (cards.length) {
              // Pick the strongest previewed card, avoiding high regression risk.
              const best = [...cards].sort(
                (a, b) =>
                  scoreCard(b) - scoreCard(a),
              )[0];
              sess.techniqueUsed = best.techniqueId;
            } else {
              sess.techniqueUsed = '';
            }
          } else {
            const cards = buildTechniqueCards(s, sess, this.rng);
            if (cards.length) {
              const pending: PendingEvent = {
                instanceId: makeId(this.rng, 'sd'),
                def: {
                  id: 'session_decision',
                  scope: 'session',
                  title: 'In the room',
                  body: '',
                  weight: 1,
                  choices: [],
                },
                title: 'In the room',
                body: '',
                choices: [],
                sessionId: sess.id,
                clientId: sess.clientId,
                therapistId: sess.therapistId,
                techniqueCards: cards,
              };
              s.pendingEvents.push(pending);
              this.bus.emit('SESSION_DECISION', { instanceId: pending.instanceId, sessionId: sess.id });
              if (s.settings.autoPauseOnEvent) s.paused = true;
              return;
            }
            sess.techniqueUsed = '';
          }
        }

        if (s.minute >= end) this.completeSession(sess);
      }
    }

    if (s.minute >= DAY_LENGTH_MINUTES) {
      const anyLeft = s.schedule.some((x) => x.status === 'scheduled' || x.status === 'active');
      if (!anyLeft) this.finishDay();
    }
  }

  private shouldAutoResolveTechnique(): boolean {
    return !!this.state.flags.autoTechnique && this.state.upgrades.includes('up_auto_scheduler');
  }

  private completeSession(sess: ScheduledSession): void {
    const s = this.state;
    const result = resolveSession(s, sess, this.rng);
    if (!result) {
      sess.status = 'done';
      return;
    }
    const t = s.therapists.find((x) => x.id === sess.therapistId);
    const c = s.clients.find((x) => x.id === sess.clientId);
    if (t && t.status === 'in_session') t.status = 'available';

    s.cash += result.revenue;
    s.stats.totalRevenue += result.revenue;
    s.stats.sessionsRun += 1;
    s.stats.qualitySum += result.quality;
    s.stats.qualityCount += 1;
    s.xp += Math.round(result.xp * 0.22);
    if (result.breakthrough) s.stats.breakthroughs += 1;
    if (result.regression) s.stats.regressions += 1;

    if (result.quality >= 0.8) {
      s.stats.currentStreak += 1;
      s.stats.maxStreak = Math.max(s.stats.maxStreak, s.stats.currentStreak);
    } else {
      s.stats.currentStreak = 0;
    }

    s.lastDayResults.push(result);
    this.bus.emit('SESSION_COMPLETED', { result });
    this.bus.emit('MONEY_CHANGED', { delta: result.revenue, reason: 'session' });

    if (c) {
      if (result.breakthrough) {
        c.story.unshift({ day: s.day, text: result.narrative, mood: 'proud' });
        this.toast('Breakthrough', `${c.handle} · ${result.narrative}`, 'milestone');
      }
      if (result.cured) this.cureClient(c, t);
      else if (t) {
        const moraleShift =
          result.grade === 'breakthrough'
            ? MORALE_TARGETS.breakthroughBoost
            : result.quality > 0.7
              ? 0.6
              : result.quality < 0.4
                ? -0.8
                : 0;
        t.morale = clamp(t.morale + softGain(t.morale, moraleShift, 100, 1.2), 0, 100);
      }
    }

    this.checkTherapistLevel(t);
    this.checkPracticeLevel();

    // Client-scope events sometimes follow a session.
    const firedToday = Number(s.flags.clientEventsToday ?? 0);
    if (c && c.status === 'active' && firedToday < MAX_CLIENT_EVENTS_PER_DAY && this.rng.chance(CLIENT_EVENT_CHANCE)) {
      const def = pickEvent(s, 'client', this.rng, { client: c, therapist: t });
      if (def) {
        s.flags.clientEventsToday = firedToday + 1;
        raiseEvent(s, def, { clientId: c.id, therapistId: t?.id }, this.rng);
        if (s.settings.autoPauseOnEvent) s.paused = true;
        this.bus.emit('EVENT_RAISED', { instanceId: s.pendingEvents[s.pendingEvents.length - 1]?.instanceId ?? '' });
      }
    }
  }

  private cureClient(c: Client, t?: Therapist): void {
    const s = this.state;
    c.status = 'cured';
    const alum: AlumniRecord = {
      id: c.id,
      handle: c.handle,
      firstName: c.firstName,
      portrait: c.portrait,
      condition: c.condition,
      curedDay: s.day,
      sessions: c.sessionsAttended,
      therapistId: t?.id ?? '',
      therapistName: t?.name ?? 'the practice',
      testimonial: testimonialFor(this.rng, c.condition),
      complex: c.complex,
    };
    s.alumni.unshift(alum);
    s.stats.cures += 1;
    if (c.complex) s.stats.complexCures += 1;
    this.gainReputation(c.complex ? REPUTATION_PER_COMPLEX_CURE : REPUTATION_PER_CURE);
    if (c.payment === 'sliding_scale') this.gainTrust(COMMUNITY_TRUST_PER_SLIDING_CLIENT * 2);
    s.xp += 35 + c.severity * 8;
    if (t) {
      t.stats.cures += 1;
      t.morale = clamp(t.morale + softGain(t.morale, MORALE_TARGETS.cureBoost, 100, 1.2), 0, 100);
      t.xp += 60;
      t.bonds = t.bonds.filter((id) => id !== c.id);
    }
    s.schedule = s.schedule.filter((x) => x.clientId !== c.id || x.status === 'done');
    this.bus.emit('CLIENT_CURED', { clientId: c.id, alumni: alum });
    this.toast('A good goodbye', `${c.handle} finished treatment after ${c.sessionsAttended} sessions.`, 'cure');
    this.log(`${c.handle} completed treatment. "${alum.testimonial}"`, 'client', 'good');
  }

  private dropClient(c: Client, reason: string): void {
    const s = this.state;
    c.status = 'dropped';
    s.stats.dropouts += 1;
    s.reputation = clamp(s.reputation + REPUTATION_PER_DROPOUT, 0, 100);
    s.schedule = s.schedule.filter((x) => x.clientId !== c.id || x.status === 'done');
    const t = s.therapists.find((x) => x.id === c.therapistId);
    if (t) t.morale = clamp(t.morale + MORALE_TARGETS.dropoutPenalty, 0, 100);
    this.bus.emit('CLIENT_DROPPED', { clientId: c.id });
    this.log(`${c.handle} stopped coming. ${reason}`, 'client', 'bad');
  }

  // ── Day boundaries ─────────────────────────────────────────────────────────

  private startDay(): void {
    const s = this.state;
    s.dayPhase = 'running';
    // The doors open, but the clock waits while the tour is still running —
    // nobody should be reading a coach-mark against a moving schedule. Space or
    // the play button starts it, which is what the first tutorial step teaches.
    s.paused = s.tutorialStep >= 0;
    s.minute = 0;
    s.lastDayResults = [];
    s.flags.clientEventsToday = 0;
    this.bus.emit('DAY_STARTED', { day: s.day });
  }

  /** Force the day to end even with unrun sessions (player pressed "wrap up"). */
  private endDay(): void {
    const s = this.state;
    if (s.dayPhase === 'day_end') {
      this.nextDay();
      return;
    }
    this.finishDay();
  }

  private finishDay(): void {
    const s = this.state;
    const diff = DIFFICULTIES[s.difficulty];

    // Sessions that never happened.
    for (const sess of s.schedule) {
      if (sess.status === 'scheduled' || sess.status === 'active') {
        sess.status = 'missed';
        const c = s.clients.find((x) => x.id === sess.clientId);
        if (c) {
          c.patience = clamp(c.patience - 12, 0, 100);
          this.log(`${c.handle}'s session didn't happen.`, 'client', 'bad');
        }
      }
    }

    const revenue = s.lastDayResults.reduce((a, r) => a + r.revenue, 0);
    const expenses = dailyExpenses(s);
    s.cash -= expenses;
    s.stats.totalExpenses += expenses;
    s.stats.bestDayRevenue = Math.max(s.stats.bestDayRevenue, revenue);
    s.stats.daysPlayed = s.day;

    s.dayPhase = 'day_end';
    s.paused = true;
    this.bus.emit('DAY_ENDED', { day: s.day, revenue, expenses, results: s.lastDayResults });

    s.stats.history.push({
      day: s.day,
      cash: s.cash,
      reputation: s.reputation,
      communityTrust: s.communityTrust,
      clients: activeClients(s).length,
      therapists: activeTherapists(s).length,
      avgQuality: s.lastDayResults.length ? avg(s.lastDayResults.map((r) => r.quality)) : 0,
      avgMorale: avg(activeTherapists(s).map((t) => t.morale)),
      avgEnergy: avg(activeTherapists(s).map((t) => t.energy / Math.max(1, t.maxEnergy))),
      cures: s.stats.cures,
      revenue,
      expenses,
      practiceLevel: s.practiceLevel,
    });
    if (s.stats.history.length > 400) s.stats.history.shift();
  }

  /** Advance to tomorrow: overnight processing lives here. */
  private nextDay(): void {
    const s = this.state;
    const rng = this.rng;
    const diff = DIFFICULTIES[s.difficulty];

    // ── Therapists overnight ────────────────────────────────────────────────
    for (const t of s.therapists) {
      if (t.status === 'departed') continue;
      t.tenure += 1;

      const worked = s.schedule.filter((x) => x.therapistId === t.id && x.status === 'done').length;
      const load = worked / Math.max(1, s.policies.find((p) => p.kind === 'max_sessions_per_therapist')?.value ?? 6);

      if (t.status === 'training' || t.status === 'sabbatical' || t.status === 'conference') {
        t.statusDays -= 1;
        if (t.statusDays <= 0) {
          if (t.status === 'sabbatical') {
            t.maxEnergy += SABBATICAL_MAX_ENERGY_BONUS;
            t.strain = 12;
            t.morale = Math.max(t.morale, 62);
            const newTrait = rng.pick(
              ['trait_unflappable', 'trait_boundaried', 'trait_warm'].filter((x) => !t.traits.includes(x)),
            );
            if (newTrait) t.traits.push(newTrait);
            this.log(`${t.name} is back, steadier than before.`, 'staff', 'good');
            this.toast('Back from sabbatical', `${t.name} returned with more capacity than they left with.`, 'info');
          } else if (t.status === 'training') {
            const trainingId = String(s.flags[`training_${t.id}`] ?? '');
            const tr = trainingById[trainingId];
            if (tr) {
              t.skill = clamp(t.skill + tr.skill, 0, 100);
              for (const g of tr.grants) if (!t.techniques.includes(g)) t.techniques.push(g);
              if (!t.certifications.includes(tr.id)) t.certifications.push(tr.id);
              if (tr.tier >= 2 && !t.secondaryModality && tr.modality !== t.modality)
                t.secondaryModality = tr.modality;
              this.log(`${t.name} completed ${tr.name}.`, 'staff', 'good');
              this.toast('Training complete', `${t.name} came back with ${tr.grants.length} new technique${tr.grants.length === 1 ? '' : 's'}.`, 'info');
            }
            delete s.flags[`training_${t.id}`];
          } else {
            this.log(`${t.name} is back from the conference, full of ideas.`, 'staff', 'good');
            t.morale = clamp(t.morale + 8, 0, 100);
          }
          t.status = 'available';
          t.statusDays = 0;
        }
        continue;
      }

      // Energy & strain.
      const regen = ENERGY_REGEN_OVERNIGHT * traitMult(t, 'energyRegenMult');
      t.energy = clamp(t.energy + regen, 0, t.maxEnergy);
      // Strain comes from *carrying too many hours*, not merely from a tired
      // evening — so the player feels it building and can head it off.
      const overload = worked - COMFORTABLE_SESSIONS_PER_DAY;
      const lowEnergy = t.energy < t.maxEnergy * 0.28;
      let strainDelta =
        overload > 0
          ? overload * STRAIN_PER_EXTRA_SESSION
          : -STRAIN_RECOVERY_PER_GOOD_DAY * (worked === 0 ? 1.5 : 1);
      if (lowEnergy) strainDelta += STRAIN_PER_LOW_ENERGY_DAY;
      if (t.morale < 40) strainDelta += 2.5;
      strainDelta *= strainDelta > 0 ? traitMult(t, 'burnoutMult') * diff.strainMult : 1;
      t.strain = clamp(t.strain + strainDelta, 0, 100);

      // Morale drift.
      let moraleDelta = traitMod(t, 'moraleDrift');
      if (worked === 0) moraleDelta += MORALE_TARGETS.idlePenalty;
      else if (load > 1.05) moraleDelta += MORALE_TARGETS.overworkedPenalty * (load - 1);
      else moraleDelta += MORALE_TARGETS.fairWorkload * 0.18;
      // Aggregate office morale, like office quality, has diminishing returns —
      // a nicer building cannot substitute for a fair workload.
      let officeMorale = 0;
      for (const u of s.upgrades) officeMorale += (upgradeById[u]?.mods?.moraleDrift ?? 0) * 0.2;
      moraleDelta += UPGRADE_MORALE_ASYMPTOTE * (1 - Math.exp(-Math.max(0, officeMorale) / UPGRADE_MORALE_ASYMPTOTE));
      if (s.philosophy) moraleDelta += (philosophyById[s.philosophy]?.mods.communityTrustDrift ?? 0) * 0.1;
      // Relationships — capped so a big team isn't automatically a happy one.
      let relMorale = 0;
      for (const [otherId, v] of Object.entries(t.relationships)) {
        const other = s.therapists.find((x) => x.id === otherId && x.status !== 'departed');
        if (!other) continue;
        if (v > 40) relMorale += 0.25;
        if (v < -40) relMorale -= 0.3;
      }
      moraleDelta += clamp(relMorale, -RELATIONSHIP_MORALE_CAP * 1.5, RELATIONSHIP_MORALE_CAP);
      if (t.mentorId) moraleDelta += 0.25;
      // A bigger practice is a harder place to feel seen.
      moraleDelta -= Math.max(0, activeTherapists(s).length - 2) * 0.05;
      if (t.strain > 65) moraleDelta -= (t.strain - 65) * 0.06;
      // Reversion to a baseline: without it, small positive drifts compound into
      // a permanently ecstatic team and the whole retention game disappears.
      moraleDelta -= (t.morale - MORALE_BASELINE) * MORALE_REVERSION;
      t.morale = clamp(t.morale + moraleDelta, 0, 100);

      // Mentorship XP.
      for (const menteeId of t.menteeIds) {
        const m = s.therapists.find((x) => x.id === menteeId && x.status !== 'departed');
        if (m) {
          m.xp += Math.round(12 * (1 + traitMod(t, 'mentorBonus')));
          this.checkTherapistLevel(m);
        }
      }

      // Burnout → sabbatical (fail-forward).
      if (t.strain >= 100 && t.status === 'available') {
        t.status = 'sabbatical';
        t.statusDays = rng.int(SABBATICAL_DAYS[0], SABBATICAL_DAYS[1]);
        t.strain = 60;
        t.stats.sabbaticals += 1;
        s.stats.burnouts += 1;
        s.schedule = s.schedule.filter((x) => x.therapistId !== t.id);
        this.bus.emit('THERAPIST_BURNOUT', { therapistId: t.id });
        this.toast('Sabbatical', `${t.name} is taking ${t.statusDays} days. The practice will absorb it.`, 'warning');
        this.log(`${t.name} hit the wall and is taking ${t.statusDays} days off.`, 'staff', 'bad');
        // 'skip', not 'defer': this is the phone call the morning after, and it
        // only means anything next to the sabbatical that prompted it. A second
        // one for the same person a week later is the same conversation twice —
        // and one saved for a fortnight is a call about a crisis they have
        // already come back from.
        raiseEventById(s, 'ev_staff_burnout_aftermath', { therapistId: t.id, onRepeat: 'skip' }, rng);
      }

      // Poaching.
      if (
        !t.isPlayer &&
        !t.poachOffer &&
        s.day > 25 &&
        t.morale < POACH_MORALE_THRESHOLD &&
        rng.chance(POACH_CHANCE_PER_DAY)
      ) {
        t.poachOffer = {
          salary: Math.round(t.salary * rng.range(1.15, 1.4)),
          daysLeft: 4,
          rival: rng.pick(RIVAL_PRACTICES),
        };
        this.toast('Someone is calling', `${t.name} has an offer from ${t.poachOffer.rival}.`, 'warning');
        this.log(`${t.poachOffer.rival} is courting ${t.name}.`, 'staff', 'bad');
      }
      if (t.poachOffer) {
        t.poachOffer.daysLeft -= 1;
        if (t.poachOffer.daysLeft <= 0) {
          const stay = t.morale > 62 || rng.chance(clamp01(t.morale / 140));
          if (stay) {
            this.log(`${t.name} turned ${t.poachOffer.rival} down.`, 'staff', 'good');
            t.morale = clamp(t.morale + 6, 0, 100);
            t.poachOffer = undefined;
          } else {
            this.departTherapist(t.id, `left for ${t.poachOffer.rival}`);
          }
        }
      }
    }

    // ── Clients overnight ───────────────────────────────────────────────────
    for (const c of s.clients) {
      if (c.status !== 'active') continue;
      const sawToday = s.schedule.some((x) => x.clientId === c.id && x.status === 'done');
      if (!sawToday) {
        c.daysSinceSession += 1;
        // Neglect compounds: each further idle day costs more than the last.
        c.patience = clamp(
          c.patience -
            (PATIENCE_DECAY_PER_IDLE_DAY / diff.patienceMult) *
              (1 + (c.severity - 3) * 0.08) *
              (1 + (c.daysSinceSession - 1) * PATIENCE_DECAY_ACCEL),
          0,
          100,
        );
        // Untended clients drift.
        c.stability = clamp01(c.stability - 0.012 * c.daysSinceSession);
      }
      const wasAtRisk = c.atRisk;
      c.atRisk = c.patience < AT_RISK_PATIENCE_THRESHOLD || c.stability < 0.22;
      if (c.atRisk && !wasAtRisk) {
        this.bus.emit('CLIENT_AT_RISK', { clientId: c.id });
        this.log(`${c.handle} is at risk of dropping out.`, 'client', 'bad');
      }
      if (c.patience <= DROPOUT_PATIENCE_THRESHOLD && rng.chance(0.35)) {
        this.dropClient(c, 'They stopped answering.');
      }
      // Insurance re-authorisation.
      if (c.authorizedSessions !== undefined && c.sessionsAttended >= c.authorizedSessions) {
        c.authorizedSessions += 10;
        // The trigger is one client's authorisation running out, but the letter
        // is practice-wide and never names them — so no clientId rides along,
        // and the practice's own window is what governs it. Two clients
        // exhausting on the same Tuesday used to produce two identical modals
        // that morning; now the second is simply not a second letter.
        if (rng.chance(0.5)) raiseEventById(s, 'ev_practice_insurance_renegotiation', { onRepeat: 'skip' }, rng);
      }
    }

    // ── Waitlist attrition ──────────────────────────────────────────────────
    for (const c of s.clients) {
      if (c.status !== 'waitlist') continue;
      c.daysSinceSession += 1;
      if (c.daysSinceSession > 6 && rng.chance(0.3)) {
        c.status = 'referred_out';
        s.communityTrust = clamp(s.communityTrust - 0.6, 0, 100);
        this.log(`${c.handle} found care elsewhere while on the waitlist.`, 'client', 'bad');
      }
    }
    s.clients = s.clients.filter(
      (c) => c.status === 'active' || c.status === 'waitlist' || (c.status !== 'referred_out' && s.day - c.joinedDay < 3),
    );

    // ── Referrals ───────────────────────────────────────────────────────────
    let referralRate = BASE_REFERRALS_PER_DAY * (1 + s.reputation * REFERRAL_REP_SCALE) * diff.referralMult;
    if (s.day <= 7) referralRate *= WEEK_ONE_REFERRAL_MULT;
    for (const u of s.upgrades) referralRate *= upgradeById[u]?.mods?.referralMult ?? 1;
    referralRate *= 0.75 + (s.communityTrust / 100) * 0.5;
    for (const p of s.programs.filter((x) => x.active)) {
      referralRate += (programById[p.id]?.payoff.weeklyReferrals ?? 0) / 7;
    }
    // Alumni send people your way.
    referralRate += Math.min(1.2, s.alumni.length * 0.02);

    const waitlistCount = s.clients.filter((c) => c.status === 'waitlist').length;
    if (waitlistCount < 9) {
      let n = Math.floor(referralRate);
      if (rng.chance(referralRate - n)) n += 1;
      for (let i = 0; i < n; i++) {
        const alum = s.alumni.length && rng.chance(0.18) ? rng.pick(s.alumni) : undefined;
        const c = generateClient(s, rng, { referredBy: alum?.handle });
        s.clients.push(c);
        this.bus.emit('CLIENT_ARRIVED', { clientId: c.id });
      }
      if (n > 0) this.log(`${n} new referral${n === 1 ? '' : 's'} came in.`, 'client');
    }

    // ── Programs ────────────────────────────────────────────────────────────
    this.tickPrograms();

    // ── Practice drift ──────────────────────────────────────────────────────
    s.reputation = clamp(
      s.reputation - (REPUTATION_DECAY_PER_DAY + s.reputation * REPUTATION_DECAY_SCALE),
      0,
      100,
    );
    const slidingShare =
      activeClients(s).filter((c) => c.payment === 'sliding_scale').length / Math.max(1, activeClients(s).length);
    const trustGain =
      slidingShare * 0.9 + (s.philosophy ? philosophyById[s.philosophy]?.mods.communityTrustDrift ?? 0 : 0);
    s.communityTrust = clamp(
      s.communityTrust +
        COMMUNITY_TRUST_DRIFT_PER_DAY +
        softGain(s.communityTrust, trustGain, 100, COMMUNITY_TRUST_GAIN_FALLOFF),
      0,
      100,
    );

    // ── Candidates ──────────────────────────────────────────────────────────
    this.tickCandidates();

    // ── Money trouble ───────────────────────────────────────────────────────
    this.checkSolvency();

    // ── Progression ─────────────────────────────────────────────────────────
    this.checkPracticeLevel();
    this.checkAct();
    this.checkMilestones();
    this.checkCampaign();

    // ── Queued & random events ──────────────────────────────────────────────
    s.day += 1;
    s.minute = 0;
    s.dayPhase = 'morning_brief';
    s.paused = true;
    s.schedule = [];
    s.lastDayResults = [];

    // Quarter boundary every 28 days.
    if ((s.day - 1) % 28 === 0 && s.day > 1) {
      s.quarter += 1;
      if (s.quarter > 4) {
        s.quarter = 1;
        s.year += 1;
      }
      this.bus.emit('QUARTER_ENDED', { quarter: s.quarter, year: s.year });
      s.flags.showQuarterReview = true;
    }

    // Promises coming due: arc beats, `followUp` chains, and beats pushed back
    // off a live window. Every one of these was announced to the player days
    // ago, so they default to `'defer'` — never dropped for being early.
    sweepSubjectCooldowns(s);
    const due = s.queuedEvents.filter((q) => q.day <= s.day);
    s.queuedEvents = s.queuedEvents.filter((q) => q.day > s.day);
    for (const q of due) {
      // ...with one exception: a conversation about somebody who has left. A
      // cure or a dropout removes the client from `s.clients`, and raising it
      // anyway substitutes "your client" into text written about a person.
      // Silence is kinder than a beat addressed to nobody.
      if (q.clientId && !s.clients.some((c) => c.id === q.clientId && c.status === 'active')) continue;
      if (q.therapistId && !s.therapists.some((t) => t.id === q.therapistId && t.status !== 'departed')) continue;
      raiseEventById(
        s,
        q.eventId,
        { clientId: q.clientId, therapistId: q.therapistId, deferrals: q.deferrals },
        rng,
      );
    }

    // A daily texture event.
    if (rng.chance(s.day < 5 ? 0.12 : 0.3)) {
      const scope = rng.weighted(
        [
          { k: 'day' as const, w: 40 },
          { k: 'staff' as const, w: activeTherapists(s).length > 1 ? 34 : 0 },
          { k: 'practice' as const, w: s.day > 10 ? 26 : 8 },
        ],
        (x) => x.w,
      )?.k;
      if (scope) {
        const therapist = scope === 'staff' ? rng.pick(activeTherapists(s)) : undefined;
        const def = pickEvent(s, scope, rng, { therapist });
        if (def) raiseEvent(s, def, { therapistId: therapist?.id }, rng);
      }
    }
    // Program events.
    for (const p of s.programs.filter((x) => x.active)) {
      if (rng.chance(0.07)) {
        const def = pickEvent(s, 'program', rng, {});
        if (def) raiseEvent(s, def, {}, rng);
      }
    }

    if (rng.chance(0.5) && AMBIENT_LOG_LINES.length) {
      this.log(rng.pick(AMBIENT_LOG_LINES), 'system');
    }

    // Auto-schedule for Act 3 directors.
    if (s.upgrades.includes('up_auto_scheduler') && s.flags.autoSchedule) {
      autofillSchedule(s, rng, { auto: true });
    }
  }

  // ── Systems ────────────────────────────────────────────────────────────────

  private tickPrograms(): void {
    const s = this.state;
    const weekly = (s.day % 7) === 0;
    for (const p of s.programs) {
      if (!p.active) continue;
      const def = programById[p.id];
      if (!def) continue;
      p.progressDays += 1;

      for (const tid of p.therapistIds) {
        const t = s.therapists.find((x) => x.id === tid && x.status !== 'departed');
        if (t) t.energy = clamp(t.energy - def.energyPerDay, 0, t.maxEnergy);
      }

      if (weekly) {
        const cash = def.payoff.weeklyCash ?? 0;
        if (cash) {
          s.cash += cash;
          p.lifetimeCash += cash;
          s.stats.totalRevenue += cash;
        }
        // Routed through the same falloff as every other gain, so a stack of
        // programs cannot pin reputation at 100.
        if (def.payoff.weeklyReputation) this.gainReputation(def.payoff.weeklyReputation);
        if (def.payoff.weeklyCommunityTrust) this.gainTrust(def.payoff.weeklyCommunityTrust);
        if (def.payoff.weeklyCandidateChance && this.rng.chance(def.payoff.weeklyCandidateChance)) {
          s.candidates.push(
            generateCandidate(s, this.rng, { guaranteedGood: true, vetted: true, stage: 'junior' }),
          );
          this.log('A promising extern finished with us and would like to stay.', 'staff', 'good');
        }
      }

      if (def.payoff.completionDays && !p.completed && p.progressDays >= def.payoff.completionDays) {
        p.completed = true;
        applyEffect(def.payoff.completionReward, { ...this.effectCtx() });
        this.toast('Published', `${def.name} produced something the field will read.`, 'milestone');
        this.log(`${def.name} completed. The paper is out.`, 'milestone', 'good');
      }
    }
  }

  private tickCandidates(): void {
    const s = this.state;
    const rng = this.rng;
    for (const c of s.candidates) c.expiresInDays -= 1;
    const expired = s.candidates.filter((c) => c.expiresInDays <= 0);
    for (const c of expired) this.log(`${c.therapist.name} took another job.`, 'staff');
    s.candidates = s.candidates.filter((c) => c.expiresInDays > 0);

    const slots = therapistSlots(s);
    const staff = activeTherapists(s).length;
    if (staff >= slots) return;

    // The pivotal first hire is guaranteed to be good.
    const isFirstHire = staff === 1;
    const wantCandidates = isFirstHire && s.day >= ACT2_DAY - 3 ? 2 : 3;
    if (s.candidates.length >= wantCandidates) return;
    const chance = isFirstHire && s.day >= ACT2_DAY - 3 ? 0.85 : 0.22 + s.reputation / 300;
    if (!rng.chance(chance)) return;

    s.candidates.push(
      generateCandidate(s, rng, {
        guaranteedGood: isFirstHire,
        stage: isFirstHire ? 'mid' : undefined,
      }),
    );
  }

  private checkSolvency(): void {
    const s = this.state;
    const diff = DIFFICULTIES[s.difficulty];
    if (s.cash >= 0) {
      if (s.flags.cashWarning && s.cash > 1500) delete s.flags.cashWarning;
      if (s.cash < 900 && !s.flags.cashWarning) {
        s.flags.cashWarning = true;
        // A meter crossing a line, not a promise: if the balance has already
        // sounded this alarm recently, saying it again teaches nothing.
        raiseEventById(s, 'ev_practice_cash_warning', { onRepeat: 'skip' }, this.rng);
      }
      return;
    }
    if (!diff.bankruptcy) {
      // Cozy: the mentor steps in with a story, never a game over.
      if (!s.flags.hardshipArc) {
        s.flags.hardshipArc = true;
        s.cash += 2500;
        raiseEventById(s, 'ev_practice_mentor_loan', {}, this.rng);
        this.log('Dr. Halloway wired you enough to keep the lights on. You will talk about it.', 'money', 'neutral');
      } else {
        s.cash = Math.max(s.cash, -200);
      }
      return;
    }
    const stage = Number(s.flags.bankruptcyStage ?? 0);
    if (stage === 0) {
      s.flags.bankruptcyStage = 1;
      raiseEventById(s, 'ev_practice_line_of_credit', {}, this.rng);
      this.toast('In the red', 'You have some room, but not much. Cut costs or raise revenue.', 'warning');
    } else if (stage === 1 && s.cash < -3000) {
      s.flags.bankruptcyStage = 2;
      this.toast('Serious trouble', 'One more bad week and the practice closes.', 'warning');
      this.log('The bank called. They were polite about it.', 'money', 'bad');
    } else if (stage === 2 && s.cash < -6000) {
      s.ended = { kind: 'collapsed', day: s.day };
      this.bus.emit('RUN_ENDED', { kind: 'collapsed' });
      this.log('The practice closed. The people you helped are still helped.', 'system', 'bad');
    }
  }

  private checkTherapistLevel(t?: Therapist): void {
    if (!t) return;
    const need = 120 + t.level * 110;
    while (t.xp >= need && t.level < 20) {
      t.xp -= need;
      t.level += 1;
      t.skill = clamp(t.skill + 1.5, 0, 100);
      t.maxEnergy += 1;
      this.bus.emit('THERAPIST_LEVELED', { therapistId: t.id, level: t.level });
      this.log(`${t.name} reached level ${t.level}.`, 'staff', 'good');
      if (t.level === 5 && t.stage === 'junior') t.stage = 'mid';
      if (t.level === 11 && t.stage === 'mid') t.stage = 'veteran';
    }
  }

  private checkPracticeLevel(): void {
    const s = this.state;
    while (
      s.practiceLevel < XP_PER_LEVEL.length - 1 &&
      s.xp >= XP_PER_LEVEL[s.practiceLevel]
    ) {
      s.practiceLevel += 1;
      this.bus.emit('PRACTICE_LEVELED', { level: s.practiceLevel });
      this.toast('Practice Level ' + s.practiceLevel, `Capacity is now ${capacity(s)} clients · ${therapistSlots(s)} therapists.`, 'levelup');
      this.log(`${s.practiceName} reached practice level ${s.practiceLevel}.`, 'milestone', 'good');
      if (s.practiceLevel === 3 && !s.philosophy) s.flags.philosophyAvailable = true;
    }
  }

  private checkAct(): void {
    const s = this.state;
    const staff = activeTherapists(s).length;
    let act: Act = 1;
    if (s.day >= ACT3_DAY && staff >= ACT3_THERAPISTS) act = 3;
    else if (staff >= 2 || s.day >= ACT2_DAY) act = 2;
    if (act !== s.act) {
      s.act = act;
      this.bus.emit('ACT_CHANGED', { act });
      if (act === 2) {
        this.toast('You are running a practice', 'Your job just changed. Hiring, scheduling, and cash flow are yours now.', 'levelup');
      } else if (act === 3) {
        this.toast('You are the Director', 'Write policies, launch programs, and let the practice run itself.', 'levelup');
        s.flags.autoSchedule = s.upgrades.includes('up_auto_scheduler') ? true : s.flags.autoSchedule;
      }
    }
    // Act 1 → 2 nudge.
    if (s.act === 1 && s.clients.filter((c) => c.status === 'waitlist').length >= 4 && !s.firedOnce.includes('ev_practice_first_hire_nudge')) {
      raiseEventById(s, 'ev_practice_first_hire_nudge', {}, this.rng);
    }
  }

  private checkMilestones(): void {
    const s = this.state;
    const snap = snapshotForMilestones(s);
    for (const m of MILESTONES) {
      if (s.milestonesEarned.includes(m.id)) continue;
      let ok = false;
      try {
        ok = m.check(snap);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      s.milestonesEarned.push(m.id);
      applyEffect(m.reward, this.effectCtx());
      this.bus.emit('MILESTONE_EARNED', { milestoneId: m.id });
      this.toast(m.name, m.blurb, 'milestone');
      this.log(`Milestone: ${m.name}`, 'milestone', 'good');
    }
  }

  private checkCampaign(): void {
    const s = this.state;
    if (s.campaign.accredited) return;
    const stage: CampaignStageDef | undefined = CAMPAIGN_STAGES[s.campaign.stageIndex];
    if (!stage) return;
    const snap = snapshotForMilestones(s);
    const done = stage.requirements.every((r) => {
      try {
        const { value, target } = r.measure(snap);
        return value >= target;
      } catch {
        return false;
      }
    });
    if (!done) return;
    s.campaign.completed.push(stage.id);
    s.campaign.stageIndex += 1;
    applyEffect(stage.reward, this.effectCtx());
    this.bus.emit('CAMPAIGN_STAGE', { stageId: stage.id });
    this.toast(stage.name, stage.blurb, 'milestone');
    this.log(`Accreditation: ${stage.name} achieved.`, 'milestone', 'good');
    if (s.campaign.stageIndex >= CAMPAIGN_STAGES.length) {
      s.campaign.accredited = true;
      s.flags.accredited = true;
      this.toast('Center of Excellence', `${s.practiceName} is accredited. Look what you built.`, 'milestone');
      this.bus.emit('RUN_ENDED', { kind: 'accredited' });
    }
  }

  // ── Player actions ─────────────────────────────────────────────────────────

  private book(clientId: string, therapistId: string, slot: number, focus?: import('./types').SessionFocus): void {
    const s = this.state;
    const c = s.clients.find((x) => x.id === clientId);
    const t = s.therapists.find((x) => x.id === therapistId);
    if (!c || !t || c.status !== 'active') return;
    if (t.status !== 'available' && t.status !== 'in_session') return;
    if (slotTaken(s, therapistId, slot)) return;
    if (clientBooked(s, clientId)) return;
    if (s.dayPhase === 'running' && slot * SLOT_MINUTES < s.minute) return;

    s.schedule.push({
      id: makeId(this.rng, 's'),
      clientId,
      therapistId,
      slot,
      focus: focus ?? suggestFocus(s, c),
      type: c.sessionType,
      status: 'scheduled',
      t: 0,
    });
    c.therapistId = therapistId;
  }

  private acceptClient(clientId: string, therapistId?: string): void {
    const s = this.state;
    const c = s.clients.find((x) => x.id === clientId);
    if (!c || c.status !== 'waitlist') return;
    if (activeClients(s).length >= capacity(s)) {
      this.toast('At capacity', `Level ${s.practiceLevel} supports ${capacity(s)} active clients.`, 'warning');
      return;
    }
    c.status = 'active';
    c.daysSinceSession = 0;
    c.therapistId = therapistId ?? c.therapistId ?? s.therapists.find((t) => t.status !== 'departed')?.id;
    if (c.payment === 'sliding_scale')
      s.communityTrust = clamp(s.communityTrust + COMMUNITY_TRUST_PER_SLIDING_CLIENT, 0, 100);
    c.story.unshift({ day: s.day, text: 'First appointment booked. They said yes on the phone.', mood: 'warm' });
    this.log(`${c.handle} joined the caseload.`, 'client', 'good');
  }

  private referOut(clientId: string): void {
    const s = this.state;
    const c = s.clients.find((x) => x.id === clientId);
    if (!c) return;
    c.status = 'referred_out';
    s.communityTrust = clamp(s.communityTrust - (c.payment === 'sliding_scale' ? 2.5 : 0.8), 0, 100);
    s.schedule = s.schedule.filter((x) => x.clientId !== c.id);
    this.log(`${c.handle} was referred to another practice.`, 'client');
  }

  private resolveEvent(instanceId: string, choiceId: string): void {
    const s = this.state;
    const res = resolvePendingEvent(s, instanceId, choiceId, this.effectCtx());
    if (!res) return;
    if (res.choice.outcome) this.log(res.choice.outcome, 'event');
    if (!s.pendingEvents.length && s.dayPhase === 'running') s.paused = false;
  }

  private chooseTechnique(instanceId: string, techniqueId: string): void {
    const s = this.state;
    const idx = s.pendingEvents.findIndex((p) => p.instanceId === instanceId);
    if (idx < 0) return;
    const pending = s.pendingEvents[idx];
    s.pendingEvents.splice(idx, 1);
    const sess = s.schedule.find((x) => x.id === pending.sessionId);
    if (sess) sess.techniqueUsed = techniqueId;
    if (!s.pendingEvents.length && s.dayPhase === 'running') s.paused = false;
  }

  private hire(candidateId: string, negotiate?: boolean): void {
    const s = this.state;
    const idx = s.candidates.findIndex((c) => c.therapist.id === candidateId);
    if (idx < 0) return;
    const cand = s.candidates[idx];
    if (activeTherapists(s).length >= therapistSlots(s)) {
      this.toast('No room yet', `Practice level ${s.practiceLevel} supports ${therapistSlots(s)} therapists.`, 'warning');
      return;
    }
    let salary = cand.askingSalary;
    if (negotiate) {
      // Negotiating saves money but costs a little goodwill.
      if (this.rng.chance(0.62)) {
        salary = Math.round(salary * 0.88);
        cand.therapist.morale = clamp(cand.therapist.morale - 5, 0, 100);
      } else {
        cand.therapist.morale = clamp(cand.therapist.morale - 10, 0, 100);
        this.log(`${cand.therapist.name} was not thrilled by the offer.`, 'staff', 'bad');
      }
    }
    const signOn = Math.round(salary * 3);
    if (s.cash < signOn) {
      this.toast('Not enough cash', `You need about ${signOn} on hand to bring someone on.`, 'warning');
      return;
    }
    s.cash -= signOn;
    s.stats.totalExpenses += signOn;
    const t = cand.therapist;
    t.salary = salary;
    t.hiredDay = s.day;
    s.therapists.push(t);
    seedRelationships(s, t, this.rng);
    s.candidates.splice(idx, 1);
    s.stats.hires += 1;
    this.bus.emit('THERAPIST_HIRED', { therapistId: t.id });
    this.toast('Welcome aboard', `${t.name} starts today.`, 'info');
    this.log(`${t.name} joined ${s.practiceName}.`, 'staff', 'good');
    this.checkAct();
  }

  private departTherapist(therapistId: string, reason: string): void {
    const s = this.state;
    const t = s.therapists.find((x) => x.id === therapistId);
    if (!t || t.isPlayer) return;
    t.status = 'departed';
    t.poachOffer = undefined;
    s.stats.departures += 1;
    s.schedule = s.schedule.filter((x) => x.therapistId !== t.id);
    // Their clients need somewhere to go.
    const remaining = activeTherapists(s);
    for (const c of s.clients) {
      if (c.therapistId === t.id && c.status === 'active') {
        c.therapistId = remaining.length ? remaining[0].id : undefined;
        c.rapport = clamp01(c.rapport - 0.12);
        c.patience = clamp(c.patience - 8, 0, 100);
      }
    }
    for (const other of remaining) {
      other.morale = clamp(other.morale - 4, 0, 100);
      delete other.relationships[t.id];
      other.menteeIds = other.menteeIds.filter((id) => id !== t.id);
      if (other.mentorId === t.id) other.mentorId = undefined;
    }
    this.bus.emit('THERAPIST_DEPARTED', { therapistId: t.id });
    this.toast('A goodbye', `${t.name} ${reason}.`, 'warning');
    this.log(`${t.name} ${reason}.`, 'staff', 'bad');
  }

  private counterPoach(therapistId: string, raise: number): void {
    const s = this.state;
    const t = s.therapists.find((x) => x.id === therapistId);
    if (!t || !t.poachOffer) return;
    const newSalary = t.salary + raise;
    const gap = t.poachOffer.salary - newSalary;
    const accept = gap <= 0 || this.rng.chance(clamp01(0.5 + (t.morale - 50) / 100 - gap / 200));
    if (accept) {
      t.salary = newSalary;
      t.morale = clamp(t.morale + 12, 0, 100);
      t.poachOffer = undefined;
      this.log(`${t.name} is staying.`, 'staff', 'good');
      this.toast('They stayed', `${t.name} is staying at ${s.practiceName}.`, 'info');
    } else {
      this.log(`${t.name} thanked you for the offer but is still thinking.`, 'staff');
      t.poachOffer.daysLeft = Math.max(1, t.poachOffer.daysLeft);
    }
  }

  private startTraining(therapistId: string, trainingId: string): void {
    const s = this.state;
    const t = s.therapists.find((x) => x.id === therapistId);
    const tr = trainingById[trainingId];
    if (!t || !tr || t.status !== 'available') return;
    if (!meetsRequirement(s, tr.requires, t)) return;
    const discount = s.philosophy ? philosophyById[s.philosophy]?.trainingDiscount ?? 1 : 1;
    const cost = Math.round(tr.cost * discount);
    if (s.cash < cost) {
      this.toast('Not enough cash', `${tr.name} costs ${cost}.`, 'warning');
      return;
    }
    s.cash -= cost;
    s.stats.totalExpenses += cost;
    t.status = 'training';
    t.statusDays = tr.days;
    s.flags[`training_${t.id}`] = tr.id;
    s.schedule = s.schedule.filter((x) => x.therapistId !== t.id);
    this.log(`${t.name} started ${tr.name}.`, 'staff');
  }

  private setMentorship(mentorId: string, menteeId: string): void {
    const s = this.state;
    const mentor = s.therapists.find((x) => x.id === mentorId);
    const mentee = s.therapists.find((x) => x.id === menteeId);
    if (!mentor || !mentee || mentor.id === mentee.id) return;
    // Clear previous pairing.
    for (const t of s.therapists) t.menteeIds = t.menteeIds.filter((id) => id !== menteeId);
    mentee.mentorId = mentorId;
    if (!mentor.menteeIds.includes(menteeId)) mentor.menteeIds.push(menteeId);
    mentor.relationships[menteeId] = (mentor.relationships[menteeId] ?? 0) + 12;
    mentee.relationships[mentorId] = (mentee.relationships[mentorId] ?? 0) + 12;
    this.log(`${mentor.name} is now supervising ${mentee.name}.`, 'staff', 'good');
  }

  private buyUpgrade(upgradeId: string): void {
    const s = this.state;
    const u = upgradeById[upgradeId];
    if (!u || s.upgrades.includes(upgradeId)) return;
    if (!meetsRequirement(s, u.requires)) return;
    if (s.cash < u.cost) {
      this.toast('Not enough cash', `${u.name} costs ${u.cost}.`, 'warning');
      return;
    }
    s.cash -= u.cost;
    s.stats.totalExpenses += u.cost;
    s.upgrades.push(upgradeId);
    if (u.mods?.unlockFeature) s.flags[u.mods.unlockFeature] = true;
    if (upgradeId === 'up_auto_scheduler') {
      s.flags.autoSchedule = true;
      s.flags.autoTechnique = true;
    }
    this.toast(u.name, u.blurb, 'info');
    this.log(`Bought ${u.name}.`, 'money', 'good');
  }

  private launchProgram(programId: ProgramId, therapistIds: string[]): void {
    const s = this.state;
    const def = programById[programId];
    if (!def || s.programs.some((p) => p.id === programId && p.active)) return;
    if (!meetsRequirement(s, def.requires)) return;
    if (s.cash < def.setupCost) {
      this.toast('Not enough cash', `${def.name} needs ${def.setupCost} to start.`, 'warning');
      return;
    }
    s.cash -= def.setupCost;
    s.stats.totalExpenses += def.setupCost;
    const existing = s.programs.find((p) => p.id === programId);
    if (existing) {
      existing.active = true;
      existing.therapistIds = therapistIds;
    } else {
      s.programs.push({
        id: programId,
        startedDay: s.day,
        therapistIds,
        progressDays: 0,
        active: true,
        lifetimeCash: 0,
      });
    }
    this.bus.emit('PROGRAM_LAUNCHED', { programId });
    this.toast(def.name, 'Launched. Watch it find its feet over the next few weeks.', 'levelup');
    this.log(`${def.name} launched.`, 'milestone', 'good');
  }

  private choosePhilosophy(id: import('./types').PhilosophyId): void {
    const s = this.state;
    if (s.philosophy) return;
    const ph = philosophyById[id];
    if (!ph) return;
    s.philosophy = id;
    delete s.flags.philosophyAvailable;
    // Grant the philosophy's exclusive techniques to everyone.
    for (const tech of Object.values(techniqueById)) {
      if (tech.philosophy === id) {
        for (const t of activeTherapists(s)) if (!t.techniques.includes(tech.id)) t.techniques.push(tech.id);
      }
    }
    this.toast(ph.name, ph.tagline, 'levelup');
    this.log(`${s.practiceName} committed to being a ${ph.name}.`, 'milestone', 'good');
  }

  private retire(): void {
    const s = this.state;
    const points =
      Math.floor(s.stats.cures / 3) +
      Math.floor(s.reputation / 12) +
      s.campaign.completed.length * 3 +
      (s.campaign.accredited ? 10 : 0) +
      Math.floor(s.alumni.length / 6);
    s.legacy.points += points;
    s.legacy.runsCompleted += 1;
    s.ended = { kind: s.campaign.accredited ? 'accredited' : 'retired', day: s.day };
    this.bus.emit('RUN_ENDED', { kind: 'retired' });
    this.log(`Run complete. ${points} legacy points banked.`, 'milestone', 'good');
  }
}

function scoreCard(card: import('./types').TechniqueCard): number {
  const hint = card.preview.qualityHint;
  const base = hint === 'strong' ? 3 : hint === 'solid' ? 2 : hint === 'risky' ? 1 : 0;
  return base - card.preview.regressionChance * 3;
}
