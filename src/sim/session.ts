import {
  ALLIANCE_SOFTNESS,
  BASE_PROGRESS,
  BREAKTHROUGH_BONUS,
  CHAPTER_BOUNDS,
  COLLECTION_RATE,
  DIFFICULTIES,
  ENERGY_PER_SESSION,
  FOCUSES,
  GROUP_ENERGY_PER_EXTRA_MEMBER,
  GROUP_QUALITY_FLOOR,
  GROUP_QUALITY_PER_EXTRA_MEMBER,
  PATIENCE_RECOVER_PER_SESSION,
  REGRESSION_LOSS,
  SESSION_OVERHEAD,
  SESSION_TYPE_ENERGY_MULT,
  SESSION_TYPE_PROGRESS_MULT,
  SESSION_TYPE_RAPPORT_MULT,
  SESSION_TYPE_REVENUE_MULT,
  SCHEDULER_ENERGY_ESTIMATE,
  SEVERITY_DRAG,
  TRUST_RAPPORT_GATE,
} from './balance';
import { arcBeatById, ARC_BEATS, modalityById, techniqueById, upgradeById } from '../content';
import {
  breakthroughChance,
  computeQuality,
  gradeFor,
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
  GroupContext,
  ScheduledSession,
  SessionFocus,
  SessionResult,
  SessionType,
  TechniqueCard,
  Therapist,
} from './types';
import { clamp, clamp01, softGain } from './util';

export function chapterFor(progress: number): ArcChapter {
  if (progress >= CHAPTER_BOUNDS.consolidation[0]) return 'consolidation';
  if (progress >= CHAPTER_BOUNDS.work[0]) return 'work';
  return 'trust';
}

// ─────────────────────────────────────────────────────────────────────────────
// The room
//
// A session used to be a therapist and one chair. A group is several cases
// sharing an hour, which is the only shape in which group therapy is worth
// anything: at 0.55× the fee and 0.78× the progress, one person in a group room
// is strictly worse than the same person seen alone. These helpers are the seam
// — everything that used to reach for `session.clientId` goes through them, so
// the single-client path stays exactly what it was.
// ─────────────────────────────────────────────────────────────────────────────

/** Everyone booked into this session, by id. Never empty. */
export function sessionMembers(session: Pick<ScheduledSession, 'clientId' | 'memberIds'>): string[] {
  return session.memberIds?.length ? session.memberIds : [session.clientId];
}

export function sessionIncludes(
  session: Pick<ScheduledSession, 'clientId' | 'memberIds'>,
  clientId: string,
): boolean {
  return session.memberIds?.length
    ? session.memberIds.includes(clientId)
    : session.clientId === clientId;
}

/** The member records, in seating order. Silently drops anyone who has left. */
export function sessionMemberClients(
  state: GameState,
  session: Pick<ScheduledSession, 'clientId' | 'memberIds'>,
): Client[] {
  const out: Client[] = [];
  for (const id of sessionMembers(session)) {
    const c = state.clients.find((x) => x.id === id);
    if (c) out.push(c);
  }
  return out;
}

/**
 * Whoever is least steady sets the pace: the technique is chosen for them and
 * the focus is picked with them in mind. That is how a group actually runs — you
 * do not take a room somewhere the shakiest person in it cannot follow — and it
 * gives the player a legible reason for a choice that would otherwise feel
 * arbitrary in a circle of six.
 */
export function sessionPacer(
  state: GameState,
  session: Pick<ScheduledSession, 'clientId' | 'memberIds'>,
): Client | undefined {
  const members = sessionMemberClients(state, session);
  if (members.length <= 1) return members[0];
  return members.reduce((a, b) => (b.stability < a.stability ? b : a));
}

/**
 * What this hour will cost the therapist. One number, shared by the preview on
 * the technique card, the day's energy forecast and the session itself, so those
 * three can never disagree.
 */
export function sessionEnergyCost(
  t: Therapist,
  focus: SessionFocus,
  type: SessionType,
  memberCount = 1,
  techniqueId?: string,
): number {
  const tech = techniqueId ? techniqueById[techniqueId] : undefined;
  return Math.round(
    ENERGY_PER_SESSION *
      FOCUSES[focus].energyMult *
      traitMult(t, 'energyCostMult') *
      (SESSION_TYPE_ENERGY_MULT[type] ?? 1) *
      crowdFactor(memberCount) +
      (tech?.effects.energy ?? 0),
  );
}

/** Sublinear cost of extra heads — 1 for one person, 2.5 for six. */
function crowdFactor(memberCount: number): number {
  return memberCount > 1 ? 1 + GROUP_ENERGY_PER_EXTRA_MEMBER * (memberCount - 1) : 1;
}

/**
 * The auto-scheduler's planning figure for an hour, used only to decide whether
 * one more booking would breach the energy reserve. It is not `sessionEnergyCost`
 * — see `SCHEDULER_ENERGY_ESTIMATE` for why the baseline is deliberately flat —
 * but it does scale with the shape of the room, because six people in a circle
 * genuinely is two and a half hours of work.
 */
export function plannedSessionEnergy(type: SessionType, memberCount = 1): number {
  return SCHEDULER_ENERGY_ESTIMATE * (SESSION_TYPE_ENERGY_MULT[type] ?? 1) * crowdFactor(memberCount);
}

/** Which kinds of room this practice is certified and equipped to run. */
export function unlockedSessionTypes(state: GameState): SessionType[] {
  const out: SessionType[] = ['individual'];
  for (const id of state.upgrades) {
    const ty = upgradeById[id]?.mods?.unlockSessionType;
    if (ty && !out.includes(ty)) out.push(ty);
  }
  return out;
}

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  individual: 'Individual',
  couples: 'Couples',
  family: 'Family',
  group: 'Group',
};

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
  // In a group the cards are built for whoever is least steady — see sessionPacer.
  const c = sessionPacer(state, session);
  if (!t || !c) return [];
  const memberCount = sessionMemberClients(state, session).length || 1;

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
    const energy = sessionEnergyCost(t, session.focus, session.type, memberCount, tech.id);
    const progMult =
      (tech.effects.progress ?? 1) *
      FOCUSES[session.focus].progressMult *
      (SESSION_TYPE_PROGRESS_MULT[session.type] ?? 1);

    const notes: string[] = [];
    if (memberCount > 1) notes.push(`Chosen for ${c.handle}, the least steady in the room`);
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

/** Same beats, told as a room rather than a pair of chairs. */
const GROUP_NARRATIVE: Record<string, string[]> = {
  breakthrough: [
    'Somebody said the true thing out loud and the circle held it.',
    '{who} heard their own week described by a stranger and stopped pretending.',
    'The room went quiet in the good way.',
  ],
  excellent: [
    'Good hour. Six people, and nobody had to be the only one.',
    '{who} spoke up for the first time and it cost them less than they expected.',
    'The talking spread out evenly, which almost never happens.',
  ],
  good: [
    'A steady circle. Two useful sentences, both from people who are not you.',
    '{who} listened more than they said, and that was the work.',
    'Chairs put back, kettle on. Progress, quietly.',
  ],
  mixed: [
    'One voice took most of the hour and the rest let it.',
    '{who} checked the clock twice.',
    'Polite. Careful. Nothing anybody would call honest.',
  ],
  poor: [
    'The room stayed on the surface and knew it.',
    '{who} arrived late and left early, which said the rest.',
    'Two empty chairs did more talking than anyone in the room.',
  ],
};

interface MemberContext {
  /** This member's share of the room's energy cost. */
  energyCost: number;
  /** Quality shaved off by the number of people in the room. */
  crowdQuality: number;
  /** Multiplier on experience earned, so a room pays like the work it is. */
  xpMult: number;
  group?: GroupContext;
}

/**
 * Resolve a session end-to-end.
 *
 * For every session but a group one this is exactly what it always was: one
 * client, one result. A group resolves once per member — five separate arcs that
 * happen to share an hour — and stores all of them on `session.results`, because
 * five people moved and the no-hidden-punishments contract owes each of them a
 * number. `session.result` (and the return value) is the member the room's pace
 * was set by.
 *
 * Pure apart from rng draws; mutates clients and the therapist in place.
 */
export function resolveSession(
  state: GameState,
  session: ScheduledSession,
  rng: Rng,
): SessionResult | undefined {
  const t = state.therapists.find((x) => x.id === session.therapistId);
  if (!t) return undefined;
  const members = sessionMemberClients(state, session);
  if (!members.length) return undefined;

  const isRoom = members.length > 1;
  const pacer = sessionPacer(state, session) ?? members[0];

  const totalEnergyCost = sessionEnergyCost(
    t,
    session.focus,
    session.type,
    members.length,
    session.techniqueUsed,
  );

  const group: GroupContext | undefined = isRoom
    ? {
        size: members.length,
        handles: members.map((m) => m.handle),
        pacedByClientId: pacer.id,
        totalEnergyCost,
      }
    : undefined;

  // Attention divides, and the floor is written here rather than left to grow
  // with the guest list — the aggregate-bonus bug in reverse.
  const crowdQuality = isRoom
    ? Math.max(GROUP_QUALITY_FLOOR, GROUP_QUALITY_PER_EXTRA_MEMBER * (members.length - 1))
    : 0;

  // The room is paid for once. Each member's result carries a share of the cost
  // (remainder on the first seat) so that summing a day's results still gives
  // the therapist's real spend rather than a multiple of it.
  const share = Math.floor(totalEnergyCost / members.length);
  const remainder = totalEnergyCost - share * members.length;
  // Experience follows the same sublinear curve as energy, because it is the
  // same claim: a room of six is two and a half sessions of work, not six.
  const xpMult = isRoom ? crowdFactor(members.length) / members.length : 1;

  const results = members.map((c, i) =>
    resolveForMember(state, session, t, c, rng, {
      energyCost: share + (i === 0 ? remainder : 0),
      crowdQuality,
      xpMult,
      group,
    }),
  );

  t.energy = Math.max(0, t.energy - totalEnergyCost);
  t.stats.sessions += 1;

  session.results = isRoom ? results : undefined;
  session.result = results.find((r) => r.clientId === pacer.id) ?? results[0];
  session.status = 'done';
  return session.result;
}

function resolveForMember(
  state: GameState,
  session: ScheduledSession,
  t: Therapist,
  c: Client,
  rng: Rng,
  ctx: MemberContext,
): SessionResult {
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

  /**
   * Two lists, joined at the end.
   *
   * `shape` is what happened to this hour — the kind of room it was, how many
   * people were in it, a regression, a breakthrough, the trust gate. `qb.reasons`
   * is the quality breakdown that explains how well it went. Only the first ten
   * survive onto the card, and the breakdown alone can run to a dozen entries, so
   * appending the shaping facts to the end of it silently dropped them — which is
   * precisely the hidden punishment this array exists to prevent. What happened
   * comes first; why it went that way follows.
   */
  const shape: typeof qb.reasons = [];
  const reasons = () => [...shape, ...qb.reasons];

  // A crowded room costs everyone in it a little of the therapist's attention.
  const quality = clamp(qb.quality + ctx.crowdQuality, 0.05, 1);
  const grade = ctx.crowdQuality ? gradeFor(quality) : qb.grade;
  if (ctx.group && ctx.crowdQuality) {
    shape.push({
      label: `${ctx.group.size} in the room — less of you for each of them`,
      delta: ctx.crowdQuality,
      kind: 'bad',
    });
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  const severityMult = Math.max(0.45, 1 - (c.severity - 1) * SEVERITY_DRAG);
  // Poor sessions still nudge; great ones roughly double a baseline hour.
  const qualityCurve = 0.18 + quality * 1.18;
  let progressDelta =
    BASE_PROGRESS * qualityCurve * focus.progressMult * severityMult * (tech?.effects.progress ?? 1);

  // The shape of the hour. Reported, not applied quietly: a 22% haircut on every
  // group session is exactly the sort of number that has to be on the card.
  const typeMult = SESSION_TYPE_PROGRESS_MULT[c.sessionType] ?? 1;
  if (typeMult !== 1) {
    progressDelta *= typeMult;
    shape.push(
      typeMult < 1
        ? { label: 'Group work moves slower for each person', delta: -0.06, kind: 'neutral' }
        : { label: 'Everyone it concerns is in the room', delta: 0.06, kind: 'good' },
    );
  }

  if (c.chapter === 'trust' && c.rapport < TRUST_RAPPORT_GATE) {
    progressDelta *= 0.55;
    shape.push({ label: 'Trust still forming — progress is gated', delta: -0.05, kind: 'neutral' });
  }

  // ── Risk beats ─────────────────────────────────────────────────────────────
  const regChance = regressionChance(state, c, session.focus, session.techniqueUsed);
  const regressed = rng.chance(regChance);
  const btChance = breakthroughChance(quality, c, session.focus, session.techniqueUsed);
  const breakthrough = !regressed && rng.chance(btChance);

  if (regressed) {
    progressDelta -= REGRESSION_LOSS * (1 + (c.severity - 3) * 0.1);
    shape.push({
      label: `Regression — ${Math.round(regChance * 100)}% risk was showing`,
      delta: -0.12,
      kind: 'bad',
    });
  }
  if (breakthrough) {
    progressDelta += BREAKTHROUGH_BONUS;
    shape.push({ label: 'Breakthrough', delta: 0.12, kind: 'good' });
  }

  // ── Client state deltas ────────────────────────────────────────────────────
  let stabilityDelta = focus.stabilityDelta + (tech?.effects.stability ?? 0);
  if (regressed) stabilityDelta -= 0.12;
  if (breakthrough) stabilityDelta += 0.06;

  let rapportDelta =
    focus.rapportDelta + (tech?.effects.rapport ?? 0) + traitMod(t, 'rapportGain') + (quality - 0.62) * 0.07;
  const resilienceDelta = focus.resilienceDelta + (tech?.effects.resilience ?? 0) + (breakthrough ? 0.03 : 0);

  if (quality < 0.4) rapportDelta -= 0.05;
  // More than one person to be trusted by. Reported, because rapport gates
  // progress through the whole Trust chapter and this is why a specialty case
  // feels slow to start.
  // Gains are slowed; a bad hour still lands at full strength, as everywhere else.
  const rapportMult = SESSION_TYPE_RAPPORT_MULT[c.sessionType] ?? 1;
  if (rapportMult !== 1 && rapportDelta > 0) {
    rapportDelta *= rapportMult;
    shape.push({
      label:
        c.sessionType === 'group'
          ? 'One of several — the alliance builds slowly in a circle'
          : c.sessionType === 'family'
            ? 'Everyone in the room has to trust you, not just one of them'
            : 'Two alliances to build, not one',
      delta: -0.03,
      kind: 'neutral',
    });
  }

  // The alliance, a client's felt safety and their resilience all approach their
  // ceiling asymptotically. Deep trust should stay something you keep earning.
  const progressBefore = c.progress;
  c.progress = clamp(c.progress + progressDelta, 0, 100);
  c.stability = clamp01(c.stability + softGain(c.stability, stabilityDelta, 1, ALLIANCE_SOFTNESS));
  c.rapport = clamp01(c.rapport + softGain(c.rapport, rapportDelta, 1, ALLIANCE_SOFTNESS));
  c.resilience = clamp01(c.resilience + softGain(c.resilience, resilienceDelta, 1, ALLIANCE_SOFTNESS));
  c.patience = clamp(
    c.patience + PATIENCE_RECOVER_PER_SESSION * (quality > 0.5 ? 1 : 0.4),
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
      if (e?.progress) {
        shape.push({
          label: e.progress > 0 ? 'Something happened this week' : 'A setback between sessions',
          delta: e.progress > 0 ? 0.06 : -0.06,
          kind: e.progress > 0 ? 'good' : 'bad',
        });
      }
      beat = { id: b.id, text: b.text, mood: b.mood ?? 'neutral' };
      c.story.unshift({ day: state.day, text: b.text, mood: (b.mood as never) ?? 'neutral' });
      if (b.event) {
        state.queuedEvents.push({ eventId: b.event, day: state.day, clientId: c.id });
      }
    }
  }

  // ── Therapist cost & reward ────────────────────────────────────────────────
  // The energy is spent once by the room, in resolveSession; this is this
  // member's share of it, so the day's results still sum to the real spend.
  const energyCost = ctx.energyCost;
  if (breakthrough) t.stats.breakthroughs += 1;

  const xp = Math.round((6 + quality * 10 + c.severity * 1.5) * traitMult(t, 'xpMult') * ctx.xpMult);
  t.xp += xp;

  if (quality >= 0.8 && !t.bonds.includes(c.id) && c.rapport > 0.7) t.bonds.push(c.id);

  // ── Money ──────────────────────────────────────────────────────────────────
  const revenue = Math.max(
    0,
    Math.round(
      c.rate *
        diff.revenueMult *
        COLLECTION_RATE[c.payment] *
        (SESSION_TYPE_REVENUE_MULT[c.sessionType] ?? 1) -
        SESSION_OVERHEAD * diff.expenseMult,
    ),
  );

  // ── Cure ───────────────────────────────────────────────────────────────────
  const cured = c.progress >= 100;

  const who = c.handle;
  const pools = ctx.group ? GROUP_NARRATIVE : GRADE_NARRATIVE;
  const pool = pools[grade] ?? pools.good;
  let narrative = rng.pick(pool).replace('{who}', who);
  if (breakthrough && tech) narrative = tech.flavor;
  if (cured) {
    narrative = ctx.group
      ? `${who} is ready to finish. They said their goodbye to the room, not to you.`
      : `${who} is ready to finish. You both knew it before either of you said it.`;
  }

  const result: SessionResult = {
    sessionId: session.id,
    clientId: c.id,
    therapistId: t.id,
    quality,
    grade,
    // Reported as the *total* change to the client this hour, including any arc
    // beat. Reporting only the session's own contribution meant the card could
    // show +4 while the client moved −2, which is exactly the kind of quiet
    // mismatch the no-hidden-punishments rule exists to prevent.
    progressDelta: Math.round((c.progress - progressBefore) * 10) / 10,
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
    reasons: reasons().filter((r) => Math.abs(r.delta) > 0.004).slice(0, 10),
    narrative,
    beat,
    techniqueUsed: session.techniqueUsed,
    focus: session.focus,
    group: ctx.group,
  };

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
