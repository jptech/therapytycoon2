/**
 * Headless players that drive the sim without any UI.
 *
 * Two policies live here. `reasonable` is the backbone of the balance harness:
 * a competent-but-not-optimal player, and if they can't keep a practice healthy
 * for 200 days the curves are wrong. `adversarial` is the other end of the same
 * measurement — an overwhelmed beginner who says yes to everyone and asks the
 * team how they're doing never. Without it the harness only ever measures the
 * good half of the difficulty curve.
 *
 * Every run also collects a pacing trace, because the two event bugs found
 * during the build were both invisible in the statistics and obvious in the
 * first minute of a narrated run.
 */
import { EventBus } from '../src/sim/bus';
import {
  EVENT_COOLDOWN_DAYS,
  FOCUSES,
  MAX_CLIENT_EVENTS_PER_DAY,
  SLOTS_PER_DAY,
} from '../src/sim/balance';
import { Game, capacity, dailyExpenses, therapistSlots } from '../src/sim/engine';
import { activeTherapists, meetsRequirement } from '../src/sim/eventsys';
import { specializationFit } from '../src/sim/quality';
import { activeClients, autofillSchedule, bookableTherapists, clientBooked, slotTaken } from '../src/sim/scheduler';
import { PROGRAMS, UPGRADES, TRAININGS, upgradeById } from '../src/content';
import type {
  Client,
  Difficulty,
  GameState,
  PendingEvent,
  ProgramId,
  SessionFocus,
} from '../src/sim/types';

/**
 * `reasonable` plays competently at the given `--skill`. `adversarial` ignores
 * skill entirely: it is a fixed set of plausible mistakes, not a dice roll.
 */
export type AutoplayPolicy = 'reasonable' | 'adversarial';

export interface AutoplayOptions {
  seed: number;
  days: number;
  difficulty: Difficulty;
  /** 0 = plays badly, 1 = plays well. Used to model a range of players. */
  skill?: number;
  /** Collect a per-day trace. */
  trace?: boolean;
  /** Which player to simulate. Defaults to the reasonable one. */
  policy?: AutoplayPolicy;
}

/**
 * What a pacing violation is *about*.
 *
 * `cooldown_same_subject` is the one a player can actually feel: the same
 * dilemma landing on the same person (or on the practice) twice inside the
 * window. `cooldown_global` is the same event *template* reused for somebody
 * else inside the window — which is what a per-client arc necessarily does when
 * two clients reach the same chapter in the same fortnight, and is not
 * self-evidently a defect. They are counted apart because triaging them
 * together is useless: the interesting set is small and the other one is not.
 */
export type PacingKind =
  | 'cooldown_same_subject'
  | 'cooldown_global'
  | 'modal_cap'
  | 'beat_repeat'
  | 'once_repeat';

/** A per-run pacing rule the sim is supposed to hold, and didn't. */
export interface PacingViolation {
  kind: PacingKind;
  /** The event or arc-beat id at fault, so the sweep can name repeat offenders. */
  id: string;
  /**
   * Who the event was about — a client id, a therapist id, or `practice` for
   * the scopes that have no individual subject. Without this a cooldown report
   * cannot distinguish "A.M. was asked the same question twice this week" from
   * "two different clients reached the same chapter", and those are different
   * bugs (one of which may be no bug at all).
   */
  subject: string;
  /** Human-readable, and specific enough to reproduce. */
  detail: string;
  /** The days involved, so the reader knows where to look. */
  days: number[];
}

/** Practice- and day-scope events have no individual subject; the practice is the subject. */
export const PACING_NO_SUBJECT = 'practice';

export interface PacingReport {
  violations: PacingViolation[];
  /** Blocking modals raised, excluding the in-session technique card. */
  modals: number;
  /** Days on which the player was interrupted at all. */
  interruptedDays: number;
  maxModalsInADay: number;
  busiestDay: number;
}

export interface RunReport {
  seed: number;
  difficulty: Difficulty;
  policy: AutoplayPolicy;
  /**
   * The skill actually used, defaults resolved. Part of the run's identity: two
   * runs with the same seed and different skill are different games, so the
   * report cannot name a reproducible run without it.
   */
  skill: number;
  days: number;
  ended?: string;
  final: {
    cash: number;
    reputation: number;
    communityTrust: number;
    practiceLevel: number;
    therapists: number;
    clients: number;
    alumni: number;
    avgMorale: number;
    avgQuality: number;
    act: number;
    accreditedStages: number;
  };
  totals: {
    cures: number;
    complexCures: number;
    dropouts: number;
    breakthroughs: number;
    regressions: number;
    burnouts: number;
    sessions: number;
    revenue: number;
    expenses: number;
    hires: number;
    departures: number;
    milestones: number;
    programs: number;
    upgrades: number;
  };
  /** Distribution of session grades over the whole run. */
  grades: Record<string, number>;
  /** Quality histogram in 10 buckets. */
  qualityHistogram: number[];
  daily: {
    day: number;
    cash: number;
    rep: number;
    trust: number;
    clients: number;
    therapists: number;
    avgQuality: number;
    avgMorale: number;
    avgEnergy: number;
    cures: number;
    level: number;
    act: number;
  }[];
  pacing: PacingReport;
  /** Interesting flags for the report. */
  notes: string[];
}

const PROGRAM_ORDER: ProgramId[] = [
  'group_therapy',
  'workshops',
  'school_partnership',
  'training_institute',
  'crisis_line',
  'research_study',
];

export function playRun(opts: AutoplayOptions): RunReport {
  const bus = new EventBus();
  const game = Game.create(
    { seed: opts.seed, difficulty: opts.difficulty, skipTutorial: true },
    bus,
  );
  const s = game.state;
  const skill = opts.skill ?? 0.8;
  const policy: AutoplayPolicy = opts.policy ?? 'reasonable';

  const grades: Record<string, number> = {};
  const qualityHistogram = new Array(10).fill(0);
  const daily: RunReport['daily'] = [];
  const notes: string[] = [];
  const pacing = new PacingWatch();

  bus.on('SESSION_COMPLETED', ({ result }) => {
    grades[result.grade] = (grades[result.grade] ?? 0) + 1;
    const b = Math.min(9, Math.floor(result.quality * 10));
    qualityHistogram[b] += 1;
    if (result.beat) pacing.sawBeat(s.day, result.clientId, result.beat.id);
  });

  const resolve = () => resolveAllEvents(game, skill, policy, pacing);

  let guard = 0;
  while (s.day <= opts.days && !s.ended && guard < opts.days * 5000) {
    guard++;

    // ── Morning ────────────────────────────────────────────────────────────
    if (s.dayPhase === 'morning_brief') {
      resolve();
      if (policy === 'adversarial') {
        acceptEverybody(game);
        panicHire(game);
        growthOnlyBuy(game);
        maybePhilosophy(game);
        overbook(game);
      } else {
        acceptClients(game, skill);
        maybeHire(game, skill);
        maybeBuy(game, skill);
        maybeTrain(game, skill);
        maybeProgram(game, skill);
        maybePhilosophy(game);
        maybeMentor(game);
        autofillSchedule(s, game.rng);
      }
      game.dispatch({ type: 'START_DAY' });
      continue;
    }

    // ── During the day ─────────────────────────────────────────────────────
    if (s.dayPhase === 'running') {
      if (s.pendingEvents.length) {
        resolve();
        continue;
      }
      game.dispatch({ type: 'TICK', dtMinutes: 10 });
      continue;
    }

    // ── Evening ────────────────────────────────────────────────────────────
    if (s.dayPhase === 'day_end') {
      const staff = activeTherapists(s);
      daily.push({
        day: s.day,
        cash: Math.round(s.cash),
        rep: Math.round(s.reputation * 10) / 10,
        trust: Math.round(s.communityTrust * 10) / 10,
        clients: s.clients.filter((c) => c.status === 'active').length,
        therapists: staff.length,
        avgQuality: s.lastDayResults.length
          ? s.lastDayResults.reduce((a, r) => a + r.quality, 0) / s.lastDayResults.length
          : 0,
        avgMorale: staff.length ? staff.reduce((a, t) => a + t.morale, 0) / staff.length : 0,
        avgEnergy: staff.length
          ? staff.reduce((a, t) => a + t.energy / Math.max(1, t.maxEnergy), 0) / staff.length
          : 0,
        cures: s.stats.cures,
        level: s.practiceLevel,
        act: s.act,
      });
      game.dispatch({ type: 'END_DAY' });
      resolve();
      continue;
    }

    break;
  }

  if (guard >= opts.days * 5000) notes.push('Guard limit hit — possible stall in the day loop.');

  const staff = activeTherapists(s);
  return {
    seed: opts.seed,
    difficulty: opts.difficulty,
    policy,
    skill,
    days: Math.min(s.day, opts.days),
    ended: s.ended?.kind,
    final: {
      cash: Math.round(s.cash),
      reputation: Math.round(s.reputation * 10) / 10,
      communityTrust: Math.round(s.communityTrust * 10) / 10,
      practiceLevel: s.practiceLevel,
      therapists: staff.length,
      clients: s.clients.filter((c) => c.status === 'active').length,
      alumni: s.alumni.length,
      avgMorale: staff.length ? staff.reduce((a, t) => a + t.morale, 0) / staff.length : 0,
      avgQuality: s.stats.qualityCount ? s.stats.qualitySum / s.stats.qualityCount : 0,
      act: s.act,
      accreditedStages: s.campaign.completed.length,
    },
    totals: {
      cures: s.stats.cures,
      complexCures: s.stats.complexCures,
      dropouts: s.stats.dropouts,
      breakthroughs: s.stats.breakthroughs,
      regressions: s.stats.regressions,
      burnouts: s.stats.burnouts,
      sessions: s.stats.sessionsRun,
      revenue: Math.round(s.stats.totalRevenue),
      expenses: Math.round(s.stats.totalExpenses),
      hires: s.stats.hires,
      departures: s.stats.departures,
      milestones: s.milestonesEarned.length,
      programs: s.programs.filter((p) => p.active).length,
      upgrades: s.upgrades.length,
    },
    grades,
    qualityHistogram,
    daily: opts.trace ? daily : daily.filter((d) => d.day % 5 === 0 || d.day === 1),
    pacing: pacing.report(),
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pacing — the assertions the statistical report cannot make
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Watches every blocking modal a run raises and checks it against what
 * `src/sim/eventsys.ts` actually promises:
 *
 *   · a non-`once` event may not come round again inside its scope's cooldown.
 *     `pickEvent` enforces this for random draws, and scripted `raiseEvent` /
 *     `raiseEventById` calls hold against a per-subject window — deferring the
 *     beat rather than dropping it, so nothing authored is lost. So every
 *     cooldown violation here is a scripted raise that was let through on
 *     purpose: an `urgent` def, or a different subject. The two are kept apart,
 *     because `cooldown_global` for a *different* subject is usually just an
 *     arc beat reaching two clients in the same fortnight, while
 *     `cooldown_same_subject` is a repeat the player sits through twice;
 *   · at most `MAX_CLIENT_EVENTS_PER_DAY` client-scope interruptions during the
 *     working day, the cap `Game.completeSession` counts against;
 *   · an arc beat is played at most once per client (`c.playedBeats`);
 *   · a `once` event is exactly that.
 *
 * The in-session technique card is not counted: it is the core loop, not an
 * interruption, and it is supposed to appear every single session.
 */
class PacingWatch {
  private readonly violations: PacingViolation[] = [];
  private readonly lastRaisedOn: Record<string, number> = {};
  /** Keyed `id subject` — the same event landing on the same person again. */
  private readonly lastRaisedOnSubject: Record<string, number> = {};
  private readonly onceCount: Record<string, number> = {};
  private readonly seenInstances = new Set<string>();
  private readonly modalsByDay = new Map<number, number>();
  private readonly clientEventsByDay = new Map<number, number>();
  private readonly beatsByClient = new Map<string, Set<string>>();

  sawEvent(p: PendingEvent, s: GameState): void {
    if (p.def.scope === 'session') return;
    if (this.seenInstances.has(p.instanceId)) return;
    this.seenInstances.add(p.instanceId);

    const { id, scope } = p.def;
    const day = s.day;
    const cooldown = EVENT_COOLDOWN_DAYS[scope] ?? 0;
    // Who the event is *about* is decided by its scope, not by whatever context
    // happened to be on the raise: `ev_practice_insurance_renegotiation` carries
    // the clientId whose authorisation ran out, but it is scoped `practice`, so
    // the practice is the subject — two renegotiations a fortnight apart are a
    // repeat the player sits through twice, whoever the incidental client was.
    const subject =
      scope === 'client'
        ? (p.clientId ?? PACING_NO_SUBJECT)
        : scope === 'staff'
          ? (p.therapistId ?? PACING_NO_SUBJECT)
          : PACING_NO_SUBJECT;
    const who = subject === PACING_NO_SUBJECT ? 'the practice' : subject;
    // The day the *sim* thinks this went up, not the day we happened to see it.
    // Half of `nextDay()` runs before the date rolls over, so an event raised
    // overnight is stamped a day earlier than the morning we resolve it — and an
    // off-by-one here invents violations that never happened.
    const raisedOn = s.eventCooldowns?.[id] !== undefined ? s.eventCooldowns[id] - cooldown : day;

    this.modalsByDay.set(day, (this.modalsByDay.get(day) ?? 0) + 1);

    const subjectKey = `${id} ${subject}`;

    if (p.def.once) {
      const n = (this.onceCount[id] = (this.onceCount[id] ?? 0) + 1);
      if (n > 1) {
        this.violations.push({
          kind: 'once_repeat',
          id,
          subject,
          detail: `"${id}" is marked once-per-run but has now fired ${n}×`,
          days: [this.lastRaisedOn[id] ?? raisedOn, raisedOn],
        });
      }
    } else {
      // Same subject first: it is the strictly worse case, and reporting a
      // same-subject repeat as merely "global" would hide the one that matters.
      const prevSubject = this.lastRaisedOnSubject[subjectKey];
      const prev = this.lastRaisedOn[id];
      if (prevSubject !== undefined && raisedOn - prevSubject < cooldown) {
        this.violations.push({
          kind: 'cooldown_same_subject',
          id,
          subject,
          detail:
            `"${id}" (${scope}, ${cooldown}d cooldown) came round again for ${who} ` +
            `after ${raisedOn - prevSubject}d`,
          days: [prevSubject, raisedOn],
        });
      } else if (prev !== undefined && raisedOn - prev < cooldown) {
        this.violations.push({
          kind: 'cooldown_global',
          id,
          subject,
          detail:
            `"${id}" (${scope}, ${cooldown}d cooldown) was reused after ${raisedOn - prev}d, ` +
            `for a different subject (${who})`,
          days: [prev, raisedOn],
        });
      }
    }
    this.lastRaisedOn[id] = raisedOn;
    this.lastRaisedOnSubject[subjectKey] = raisedOn;

    // The cap governs the client events drawn off the back of a session, so only
    // count the ones raised while the day is actually running.
    if (scope === 'client' && s.dayPhase === 'running') {
      const n = (this.clientEventsByDay.get(day) ?? 0) + 1;
      this.clientEventsByDay.set(day, n);
      if (n > MAX_CLIENT_EVENTS_PER_DAY) {
        this.violations.push({
          kind: 'modal_cap',
          id,
          subject,
          detail: `${n} client-scope modals during day ${day} — the cap is ${MAX_CLIENT_EVENTS_PER_DAY} ("${id}" was the ${n}th)`,
          days: [day],
        });
      }
    }
  }

  sawBeat(day: number, clientId: string, beatId: string): void {
    let seen = this.beatsByClient.get(clientId);
    if (!seen) this.beatsByClient.set(clientId, (seen = new Set()));
    if (seen.has(beatId)) {
      this.violations.push({
        kind: 'beat_repeat',
        id: beatId,
        subject: clientId,
        detail: `arc beat "${beatId}" played twice for the same client (${clientId})`,
        days: [day],
      });
    }
    seen.add(beatId);
  }

  report(): PacingReport {
    let busiestDay = 0;
    let maxModalsInADay = 0;
    let modals = 0;
    for (const [day, n] of this.modalsByDay) {
      modals += n;
      if (n > maxModalsInADay) {
        maxModalsInADay = n;
        busiestDay = day;
      }
    }
    return {
      violations: this.violations,
      modals,
      interruptedDays: this.modalsByDay.size,
      maxModalsInADay,
      busiestDay,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy: how the simulated player decides
// ─────────────────────────────────────────────────────────────────────────────

/** How appealing a technique card looks. The adversarial player reads it upside down. */
function cardScore(c: { preview: { qualityHint: string; regressionChance: number } }): number {
  const base =
    c.preview.qualityHint === 'strong'
      ? 3
      : c.preview.qualityHint === 'solid'
        ? 2
        : c.preview.qualityHint === 'risky'
          ? 1
          : 0;
  return base - c.preview.regressionChance * 3;
}

function resolveAllEvents(
  game: Game,
  skill: number,
  policy: AutoplayPolicy,
  pacing: PacingWatch,
): void {
  const s = game.state;
  let guard = 0;
  while (s.pendingEvents.length && guard++ < 40) {
    const p = s.pendingEvents[0];
    pacing.sawEvent(p, s);

    if (p.techniqueCards?.length) {
      const cards = p.techniqueCards;
      let pick = cards[0];
      if (policy === 'adversarial') {
        // Reach for the shiny one: the activating technique, the deep work, the
        // card with a warning on it. Nobody sets out to destabilise a client.
        pick = [...cards].sort((a, b) => cardScore(a) - cardScore(b))[0];
      } else if (game.rng.next() < skill) {
        pick = [...cards].sort((a, b) => cardScore(b) - cardScore(a))[0];
      } else {
        pick = game.rng.pick(cards);
      }
      game.dispatch({ type: 'CHOOSE_TECHNIQUE', instanceId: p.instanceId, techniqueId: pick.techniqueId });
      continue;
    }

    const choices = p.choices;
    let choice = choices[0];
    if (policy === 'adversarial') {
      // Cash today and one more referral. Morale, trust and the alliance are all
      // problems for a version of you who has more time.
      const shortTerm = (c: (typeof choices)[number]) =>
        (c.effects.cash ?? 0) / 300 + (c.effects.reputation ?? 0) * 0.25 + (c.effects.spawnReferral ? 0.4 : 0);
      choice = [...choices].sort((a, b) => shortTerm(b) - shortTerm(a))[0];
    } else if (game.rng.next() < skill) {
      // Ordinary event: prefer the choice with the best net effect.
      const score = (c: (typeof choices)[number]) => {
        const e = c.effects;
        return (
          (e.cash ?? 0) / 400 +
          (e.reputation ?? 0) * 1.2 +
          (e.communityTrust ?? 0) * 0.9 +
          (e.therapistMorale ?? 0) * 0.35 +
          (e.allMorale ?? 0) * 0.8 +
          (e.clientRapport ?? 0) * 8 +
          (e.clientStability ?? 0) * 8 +
          (e.clientPatience ?? 0) * 0.15 +
          (e.xp ?? 0) / 90
        );
      };
      choice = [...choices].sort((a, b) => score(b) - score(a))[0];
    } else {
      choice = game.rng.pick(choices);
    }
    game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: choice.id });
  }
}

function acceptClients(game: Game, skill: number): void {
  const s = game.state;
  const cap = capacity(s);
  // A competent player accepts what the team can actually see, not what the
  // licence allows — taking on more clients than you have hours for is the
  // classic way to bleed money and dropouts at the same time.
  const serveable = Math.round(activeTherapists(s).length * (7 + skill * 4));
  const ceiling = Math.min(cap, serveable);
  const waiting = s.clients.filter((c) => c.status === 'waitlist');
  for (const c of waiting) {
    const active = s.clients.filter((x) => x.status === 'active').length;
    if (active >= ceiling) break;
    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
  }
}

function maybeHire(game: Game, skill: number): void {
  const s = game.state;
  if (!s.candidates.length) return;
  const staff = activeTherapists(s);
  if (staff.length >= therapistSlots(s)) return;

  const activeClientCount = s.clients.filter((c) => c.status === 'active').length;
  const capacityPerTherapist = 6;
  const stretched = activeClientCount > staff.length * capacityPerTherapist * 0.8;
  const waitlist = s.clients.filter((c) => c.status === 'waitlist').length;
  if (!stretched && waitlist < 3 && staff.length > 1) return;

  const best = [...s.candidates].sort(
    (a, b) => b.therapist.skill / b.askingSalary - a.therapist.skill / a.askingSalary,
  )[0];
  const runway = s.cash / Math.max(1, dailyExpenses(s));
  const upfront = best.askingSalary * 3;
  if (s.cash < upfront + 800 || runway < 8) return;
  game.dispatch({ type: 'HIRE', candidateId: best.therapist.id, negotiate: game.rng.next() < skill * 0.6 });
}

function maybeBuy(game: Game, skill: number): void {
  const s = game.state;
  const runway = s.cash / Math.max(1, dailyExpenses(s));
  if (runway < 14) return;
  // Buy in a sensible order: cheap quality first, then unlocks, then automation.
  const priority = [
    'up_waiting_room',
    'up_batch_booking',
    'up_couples_certification',
    'up_group_room',
    'up_child_certification',
    'up_family_certification',
    'up_auto_scheduler',
  ];
  const owned = new Set(s.upgrades);
  const ordered = [
    ...priority.map((id) => upgradeById[id]).filter(Boolean),
    ...[...UPGRADES].sort((a, b) => a.cost - b.cost),
  ];
  for (const u of ordered) {
    if (!u || owned.has(u.id)) continue;
    if (!meetsRequirement(s, u.requires)) continue;
    if (s.cash - u.cost < dailyExpenses(s) * 8) continue;
    game.dispatch({ type: 'BUY_UPGRADE', upgradeId: u.id });
    return;
  }
}

function maybeTrain(game: Game, skill: number): void {
  const s = game.state;
  if (game.rng.next() > 0.28 * skill) return;
  const runway = s.cash / Math.max(1, dailyExpenses(s));
  if (runway < 16) return;
  const avail = activeTherapists(s).filter((t) => t.status === 'available' && !t.isPlayer);
  const who = avail.length ? game.rng.pick(avail) : activeTherapists(s).find((t) => t.status === 'available');
  if (!who) return;
  const options = TRAININGS.filter(
    (tr) => !who.certifications.includes(tr.id) && meetsRequirement(s, tr.requires, who) && s.cash > tr.cost * 3,
  );
  // Prefer trainings in their own modality first.
  const own = options.filter((tr) => tr.modality === who.modality);
  const pick = own.length ? own[0] : options[0];
  if (!pick) return;
  game.dispatch({ type: 'START_TRAINING', therapistId: who.id, trainingId: pick.id });
}

function maybeProgram(game: Game, skill: number): void {
  const s = game.state;
  if (s.practiceLevel < 3) return;
  const running = s.programs.filter((p) => p.active);
  const staff = activeTherapists(s).filter((t) => t.status === 'available');
  if (running.length >= Math.min(3, Math.floor(staff.length / 2))) return;
  const runway = s.cash / Math.max(1, dailyExpenses(s));
  if (runway < 12) return;

  for (const id of PROGRAM_ORDER) {
    if (running.some((p) => p.id === id)) continue;
    const def = PROGRAMS.find((p) => p.id === id);
    if (!def || !meetsRequirement(s, def.requires)) continue;
    if (s.cash < def.setupCost + dailyExpenses(s) * 8) continue;
    const assigned = staff.slice(0, def.staffSlots).map((t) => t.id);
    if (assigned.length < def.staffSlots) continue;
    game.dispatch({ type: 'LAUNCH_PROGRAM', programId: id, therapistIds: assigned });
    return;
  }
}

function maybePhilosophy(game: Game): void {
  const s = game.state;
  if (s.philosophy || !s.flags.philosophyAvailable) return;
  const choices = ['trauma_informed', 'family_community', 'integrative_wellness'] as const;
  game.dispatch({ type: 'CHOOSE_PHILOSOPHY', philosophy: game.rng.pick(choices) });
}

function maybeMentor(game: Game): void {
  const s = game.state;
  const staff = activeTherapists(s).filter((t) => t.status !== 'departed');
  if (staff.length < 2) return;
  const mentors = staff.filter((t) => t.level >= 4 && t.menteeIds.length < 2);
  const mentees = staff.filter((t) => !t.mentorId && t.level < 4);
  if (!mentors.length || !mentees.length) return;
  game.dispatch({ type: 'SET_MENTORSHIP', mentorId: mentors[0].id, menteeId: mentees[0].id });
}

// ─────────────────────────────────────────────────────────────────────────────
// The adversarial player
//
// Not a button-masher — a person in their first month with a full inbox. Every
// decision below is a mistake someone actually makes: saying yes to everyone,
// handing the case to whoever answers the phone, pushing a client who isn't
// steady enough to be pushed, and never once asking how the team is holding up.
// Deliberately absent: mentorship, training, the quiet quality upgrades, and
// programs. Not because they'd hurt — because nobody drowning launches a
// research study.
// ─────────────────────────────────────────────────────────────────────────────

function acceptEverybody(game: Game): void {
  const s = game.state;
  // Nobody gets turned away. The engine's own capacity check is the only brake,
  // and hitting it is the point — this is what forty clients you cannot see
  // costs you.
  for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
    game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
  }
}

function panicHire(game: Game): void {
  const s = game.state;
  if (!s.candidates.length) return;
  if (activeTherapists(s).length >= therapistSlots(s)) return;
  if (!s.clients.some((c) => c.status === 'waitlist')) return;
  // Cheapest body available, hired against the waitlist rather than the ledger.
  const cheapest = [...s.candidates].sort((a, b) => a.askingSalary - b.askingSalary)[0];
  if (s.cash < cheapest.askingSalary * 2) return;
  game.dispatch({ type: 'HIRE', candidateId: cheapest.therapist.id });
}

function growthOnlyBuy(game: Game): void {
  const s = game.state;
  // Only the upgrades that make the number go up. A better waiting room and a
  // room you can hold supervision in never look urgent enough to buy this week.
  const owned = new Set(s.upgrades);
  const growth = [...UPGRADES]
    .filter((u) => (u.mods?.capacity ?? 0) > 0 || (u.mods?.referralMult ?? 1) > 1)
    .sort((a, b) => a.cost - b.cost);
  for (const u of growth) {
    if (owned.has(u.id) || !meetsRequirement(s, u.requires)) continue;
    if (s.cash < u.cost) continue; // no runway check whatsoever
    game.dispatch({ type: 'BUY_UPGRADE', upgradeId: u.id });
    return;
  }
}

/**
 * The two beginner focus errors, each chosen in the situation where it costs the
 * most: going toward the hard thing with someone who isn't steady enough to be
 * taken there, and holding someone in a stabilising pattern for weeks after they
 * were ready to work.
 */
function worstFocus(c: Client): SessionFocus {
  return c.stability < FOCUSES.process.safeStability ? 'process' : 'stabilize';
}

function overbook(game: Game): void {
  const s = game.state;
  const staff = bookableTherapists(s);
  if (!staff.length) return;

  const load: Record<string, number> = {};
  for (const x of s.schedule) {
    if (x.status === 'cancelled') continue;
    load[x.therapistId] = (load[x.therapistId] ?? 0) + 1;
  }

  // No priority order: whoever came in first gets seen first, so the client
  // quietly running out of patience waits behind the easy one.
  for (const c of activeClients(s)) {
    if (clientBooked(s, c.id)) continue;

    // Worst specialisation match wins, and near-ties break toward whoever is
    // already carrying the most — the "she's so good with the hard ones" trap
    // that ends in a sabbatical.
    // Small enough that mismatch stays the dominant term; big enough that two
    // equally wrong therapists resolve toward the one already drowning.
    const appeal = (t: (typeof staff)[number]) => 1 - specializationFit(t, c) + (load[t.id] ?? 0) * 0.02;
    const ranked = [...staff].sort((a, b) => appeal(b) - appeal(a));
    for (const t of ranked) {
      let slot = -1;
      for (let i = 0; i < SLOTS_PER_DAY; i++) {
        if (!slotTaken(s, t.id, i)) {
          slot = i;
          break;
        }
      }
      if (slot < 0) continue; // this one is genuinely full; the next one isn't
      game.dispatch({
        type: 'BOOK_SESSION',
        clientId: c.id,
        therapistId: t.id,
        slot,
        focus: worstFocus(c),
      });
      load[t.id] = (load[t.id] ?? 0) + 1;
      break;
    }
  }
}
