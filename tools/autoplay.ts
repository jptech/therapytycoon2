/**
 * A headless "reasonable player" that drives the sim without any UI.
 *
 * This is the backbone of the balance harness: if a competent-but-not-optimal
 * player can't keep a practice healthy for 200 days, the curves are wrong.
 */
import { EventBus } from '../src/sim/bus';
import { DIFFICULTIES, SLOTS_PER_DAY } from '../src/sim/balance';
import { Game, capacity, dailyExpenses, therapistSlots } from '../src/sim/engine';
import { activeTherapists, meetsRequirement } from '../src/sim/eventsys';
import { buildTechniqueCards } from '../src/sim/session';
import { autofillSchedule } from '../src/sim/scheduler';
import { PROGRAMS, UPGRADES, TRAININGS, upgradeById } from '../src/content';
import type { Difficulty, GameState, ProgramId } from '../src/sim/types';

export interface AutoplayOptions {
  seed: number;
  days: number;
  difficulty: Difficulty;
  /** 0 = plays badly, 1 = plays well. Used to model a range of players. */
  skill?: number;
  /** Collect a per-day trace. */
  trace?: boolean;
}

export interface RunReport {
  seed: number;
  difficulty: Difficulty;
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

  const grades: Record<string, number> = {};
  const qualityHistogram = new Array(10).fill(0);
  const daily: RunReport['daily'] = [];
  const notes: string[] = [];

  bus.on('SESSION_COMPLETED', ({ result }) => {
    grades[result.grade] = (grades[result.grade] ?? 0) + 1;
    const b = Math.min(9, Math.floor(result.quality * 10));
    qualityHistogram[b] += 1;
  });

  let guard = 0;
  while (s.day <= opts.days && !s.ended && guard < opts.days * 5000) {
    guard++;

    // ── Morning ────────────────────────────────────────────────────────────
    if (s.dayPhase === 'morning_brief') {
      resolveAllEvents(game, skill);
      acceptClients(game, skill);
      maybeHire(game, skill);
      maybeBuy(game, skill);
      maybeTrain(game, skill);
      maybeProgram(game, skill);
      maybePhilosophy(game);
      maybeMentor(game);
      autofillSchedule(s, game.rng);
      game.dispatch({ type: 'START_DAY' });
      continue;
    }

    // ── During the day ─────────────────────────────────────────────────────
    if (s.dayPhase === 'running') {
      if (s.pendingEvents.length) {
        resolveAllEvents(game, skill);
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
      resolveAllEvents(game, skill);
      continue;
    }

    break;
  }

  if (guard >= opts.days * 5000) notes.push('Guard limit hit — possible stall in the day loop.');

  const staff = activeTherapists(s);
  return {
    seed: opts.seed,
    difficulty: opts.difficulty,
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
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy: how the simulated player decides
// ─────────────────────────────────────────────────────────────────────────────

function resolveAllEvents(game: Game, skill: number): void {
  const s = game.state;
  let guard = 0;
  while (s.pendingEvents.length && guard++ < 40) {
    const p = s.pendingEvents[0];
    if (p.techniqueCards?.length) {
      const sess = s.schedule.find((x) => x.id === p.sessionId);
      const cards = p.techniqueCards;
      let pick = cards[0];
      if (game.rng.next() < skill) {
        // Competent play: best hint, penalised by regression risk.
        const score = (c: (typeof cards)[number]) => {
          const base =
            c.preview.qualityHint === 'strong'
              ? 3
              : c.preview.qualityHint === 'solid'
                ? 2
                : c.preview.qualityHint === 'risky'
                  ? 1
                  : 0;
          return base - c.preview.regressionChance * 3;
        };
        pick = [...cards].sort((a, b) => score(b) - score(a))[0];
      } else {
        pick = game.rng.pick(cards);
      }
      game.dispatch({ type: 'CHOOSE_TECHNIQUE', instanceId: p.instanceId, techniqueId: pick.techniqueId });
      continue;
    }
    // Ordinary event: prefer the choice with the best net effect, weighted by skill.
    const choices = p.choices;
    let choice = choices[0];
    if (game.rng.next() < skill) {
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

  const activeClients = s.clients.filter((c) => c.status === 'active').length;
  const capacityPerTherapist = 6;
  const stretched = activeClients > staff.length * capacityPerTherapist * 0.8;
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
