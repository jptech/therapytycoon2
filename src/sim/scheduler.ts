import {
  AT_RISK_PATIENCE_THRESHOLD,
  FOCUSES,
  GROUP_MAX_MEMBERS,
  GROUP_MIN_MEMBERS,
  SESSION_TYPE_REVENUE_MULT,
  SLOTS_PER_DAY,
} from './balance';
import { specializationFit } from './quality';
import { makeId, type Rng } from './rng';
import {
  plannedSessionEnergy,
  sessionEnergyCost,
  sessionIncludes,
  sessionMembers,
} from './session';
import type {
  Client,
  GameState,
  Policy,
  ScheduledSession,
  SessionFocus,
  Therapist,
} from './types';
import { clamp01 } from './util';

export const DEFAULT_POLICIES: Policy[] = [
  {
    id: 'pol_max_sessions',
    label: 'Cap each therapist at N sessions a day',
    kind: 'max_sessions_per_therapist',
    value: 5,
    enabled: true,
  },
  {
    id: 'pol_energy_reserve',
    label: 'Never book below N% energy',
    kind: 'min_energy_reserve',
    value: 25,
    enabled: true,
  },
  {
    id: 'pol_at_risk',
    label: 'Prioritise clients at risk of dropping out',
    kind: 'prioritize_at_risk',
    value: 1,
    enabled: true,
  },
  {
    id: 'pol_match',
    label: 'Match clients to the right specialisation',
    kind: 'match_specialization',
    value: 1,
    enabled: true,
  },
  {
    id: 'pol_severity',
    label: 'Prioritise high-severity clients',
    kind: 'prioritize_severity',
    value: 0.6,
    enabled: true,
  },
  {
    id: 'pol_protect',
    label: 'Never Process a destabilised client',
    kind: 'protect_low_stability',
    value: 0.5,
    enabled: true,
  },
  {
    id: 'pol_default_focus',
    label: 'Default focus when nothing else applies',
    kind: 'default_focus',
    value: 0,
    targetFocus: 'build_skills',
    enabled: true,
  },
  {
    id: 'pol_balance',
    label: 'Balance workload across the team',
    kind: 'balance_workload',
    value: 1,
    enabled: true,
  },
  {
    id: 'pol_supervision',
    label: 'Hold the last N slots on Friday for supervision',
    kind: 'reserve_slot_for_supervision',
    value: 0,
    enabled: false,
  },
];

function policy(state: GameState, kind: Policy['kind']): Policy | undefined {
  return state.policies.find((p) => p.kind === kind && p.enabled);
}

export function sessionsForTherapist(state: GameState, therapistId: string): ScheduledSession[] {
  return state.schedule.filter((s) => s.therapistId === therapistId && s.status !== 'cancelled');
}

export function slotTaken(state: GameState, therapistId: string, slot: number): boolean {
  return state.schedule.some(
    (s) => s.therapistId === therapistId && s.slot === slot && s.status !== 'cancelled',
  );
}

export function clientBooked(state: GameState, clientId: string): boolean {
  return state.schedule.some((s) => s.status !== 'cancelled' && sessionIncludes(s, clientId));
}

/** The group this therapist is already holding in this slot, if any. */
export function groupSessionAt(
  state: GameState,
  therapistId: string,
  slot: number,
): ScheduledSession | undefined {
  return state.schedule.find(
    (s) =>
      s.therapistId === therapistId &&
      s.slot === slot &&
      s.type === 'group' &&
      s.status === 'scheduled',
  );
}

/**
 * Take one person out of every session they are still due to attend.
 *
 * Called whenever somebody leaves the caseload mid-day — cured, dropped, or
 * referred on. For an ordinary session that means dropping the session; for a
 * group it means one empty chair and an hour that still runs for everybody else.
 * Sessions already resolved are left alone: they happened.
 */
export function detachClientFromSchedule(state: GameState, clientId: string): void {
  const keep: ScheduledSession[] = [];
  for (const s of state.schedule) {
    if (s.status === 'done' || !sessionIncludes(s, clientId)) {
      keep.push(s);
      continue;
    }
    const rest = sessionMembers(s).filter((id) => id !== clientId);
    if (!rest.length) continue; // nobody left in the room
    // Someone graduating out of a pair leaves a circle of one, which would bill
    // a group rate for an individual hour. An hour already under way plays out;
    // one still to come is dropped, and the person left over can be re-booked.
    if (rest.length < GROUP_MIN_MEMBERS && s.type === 'group' && s.status === 'scheduled') continue;
    s.memberIds = rest;
    s.clientId = rest[0];
    keep.push(s);
  }
  state.schedule = keep;
}

/** Therapists who can take sessions today. */
export function bookableTherapists(state: GameState): Therapist[] {
  return state.therapists.filter((t) => t.status === 'available' || t.status === 'in_session');
}

export function activeClients(state: GameState): Client[] {
  return state.clients.filter((c) => c.status === 'active');
}

/** Priority score for who most needs to be seen today. */
export function clientPriority(state: GameState, c: Client): number {
  let p = 0;
  if (policy(state, 'prioritize_at_risk') && (c.atRisk || c.patience < AT_RISK_PATIENCE_THRESHOLD)) p += 60;
  const sev = policy(state, 'prioritize_severity');
  if (sev) p += c.severity * 8 * sev.value;
  p += c.daysSinceSession * 5;
  p += (100 - c.patience) * 0.35;
  if (c.chapter === 'consolidation' && c.progress > 92) p += 18; // so close
  if (c.stability < 0.3) p += 12;
  return p;
}

/** Best available focus for a client, honouring policies. */
export function suggestFocus(state: GameState, c: Client): SessionFocus {
  const protect = policy(state, 'protect_low_stability');
  const threshold = protect?.value ?? 0.5;

  if (c.stability < threshold) return 'stabilize';
  if (c.chapter === 'trust' && c.rapport < 0.45) return 'stabilize';
  if (c.chapter === 'consolidation') return 'build_skills';
  if (c.chapter === 'work' && c.stability > FOCUSES.process.safeStability + 0.08 && c.resilience > 0.25)
    return 'process';
  const dflt = policy(state, 'default_focus');
  return (dflt?.targetFocus as SessionFocus) ?? 'build_skills';
}

interface MatchScore {
  therapist: Therapist;
  slot: number;
  score: number;
}

/** Running tally of what the day has already committed each therapist to. */
interface Load {
  /** Sessions booked — one per hour, however many people are in the room. */
  sessions: Record<string, number>;
  /** Estimated energy already spoken for. */
  energy: Record<string, number>;
}

function emptyLoad(state: GameState): Load {
  const load: Load = { sessions: {}, energy: {} };
  for (const s of state.schedule) {
    if (s.status === 'cancelled') continue;
    load.sessions[s.therapistId] = (load.sessions[s.therapistId] ?? 0) + 1;
    // Only hours still to come: a finished session has already been paid for out
    // of `t.energy`, and counting it twice would stop the afternoon booking.
    if (s.status === 'done' || s.status === 'missed') continue;
    load.energy[s.therapistId] =
      (load.energy[s.therapistId] ?? 0) + plannedSessionEnergy(s.type, sessionMembers(s).length);
  }
  return load;
}

/**
 * Where does this hour go? `group` is one or more cases sharing a room, so the
 * fit that matters is the average across everybody in it, and continuity counts
 * once per member who already knows this therapist.
 */
function bestMatch(
  state: GameState,
  group: Client[],
  focus: SessionFocus,
  load: Load,
): MatchScore | undefined {
  if (!group.length) return undefined;
  const maxSessions = policy(state, 'max_sessions_per_therapist')?.value ?? SLOTS_PER_DAY;
  const energyReserve = (policy(state, 'min_energy_reserve')?.value ?? 0) / 100;
  const wantMatch = !!policy(state, 'match_specialization');
  const balance = !!policy(state, 'balance_workload');
  const supervision = policy(state, 'reserve_slot_for_supervision');
  const type = group[0].sessionType;

  let best: MatchScore | undefined;
  for (const t of bookableTherapists(state)) {
    const booked = load.sessions[t.id] ?? 0;
    if (booked >= maxSessions) continue;
    // Energy forecast: don't book past the reserve.
    //
    // Note this measures what is *already* committed and not the hour being
    // considered, so the reserve is breached by one session rather than defended
    // exactly. That is the long-standing behaviour and it is left alone
    // deliberately: closing the gap books roughly one fewer session a day per
    // therapist across the board, which halves burnouts and takes Challenge from
    // 17/40 collapses to 10/40 in a 40×200 sweep. A real retune, and not this
    // change's to make. See docs/BALANCE.md → Known softness.
    const projected = t.energy - (load.energy[t.id] ?? 0);
    if (projected < t.maxEnergy * energyReserve) continue;

    // Route-condition policies force an assignment. A mixed group cannot be
    // routed by condition, so the rule only bites when everyone agrees.
    const route = state.policies.find(
      (p) =>
        p.enabled &&
        p.kind === 'route_condition_to_therapist' &&
        group.every((c) => c.condition === p.targetCondition),
    );
    if (route && route.targetTherapistId && route.targetTherapistId !== t.id) continue;

    const fit = group.reduce((a, c) => a + specializationFit(t, c), 0) / group.length;
    const bonds = group.filter((c) => t.bonds.includes(c.id)).length;
    const continuity = group.filter((c) => c.therapistId === t.id).length;

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      if (slotTaken(state, t.id, slot)) continue;
      if (supervision && supervision.value > 0 && (state.day - 1) % 7 === 4) {
        if (slot >= SLOTS_PER_DAY - supervision.value) continue;
      }
      if (t.preferredSlots?.length && !t.preferredSlots.includes(slot)) continue;

      let score = 0;
      if (wantMatch) score += fit * 100;
      else score += 30;
      if (route?.targetTherapistId === t.id) score += 60;
      score += (bonds / group.length) * 25;
      score += (continuity / group.length) * 45; // continuity of care matters
      if (balance) score -= booked * 7;
      score += (t.energy / Math.max(1, t.maxEnergy)) * 20;
      score += (t.morale / 100) * 10;
      // Prefer earlier slots so the day fills front-to-back and looks natural.
      score -= slot * 1.2;

      if (!best || score > best.score) best = { therapist: t, slot, score };
    }
  }
  return best;
}

export interface AutofillResult {
  booked: number;
  skipped: number;
}

/** The room moves at the pace of whoever is least steady in it. */
export function roomFocus(state: GameState, members: Client[]): SessionFocus {
  const pacer = members.reduce((a, b) => (b.stability < a.stability ? b : a));
  return suggestFocus(state, pacer);
}

function commit(
  state: GameState,
  rng: Rng,
  members: Client[],
  focus: SessionFocus,
  match: MatchScore,
  load: Load,
  auto?: boolean,
): void {
  const isRoom = members.length > 1;
  state.schedule.push({
    id: makeId(rng, 's'),
    clientId: members[0].id,
    memberIds: isRoom ? members.map((m) => m.id) : undefined,
    therapistId: match.therapist.id,
    slot: match.slot,
    focus,
    type: members[0].sessionType,
    status: 'scheduled',
    t: 0,
    auto,
  });
  for (const m of members) m.therapistId = match.therapist.id;
  load.sessions[match.therapist.id] = (load.sessions[match.therapist.id] ?? 0) + 1;
  load.energy[match.therapist.id] =
    (load.energy[match.therapist.id] ?? 0) +
    plannedSessionEnergy(members[0].sessionType, members.length);
}

/**
 * Fill today's schedule. Used by the Act-1/2 "autofill" button and by the Act-3
 * policy auto-scheduler (which simply runs the same code with the player's rules).
 *
 * Groups are formed first, because a group is the highest-throughput hour on the
 * board and because a group client left over is a person nobody can see — the
 * remainder below `GROUP_MIN_MEMBERS` waits for the cohort to fill out.
 */
export function autofillSchedule(state: GameState, rng: Rng, opts: { auto?: boolean } = {}): AutofillResult {
  const load = emptyLoad(state);

  const unbooked = activeClients(state)
    .filter((c) => !clientBooked(state, c.id))
    .sort((a, b) => clientPriority(state, b) - clientPriority(state, a));

  let booked = 0;
  let skipped = 0;

  const waitingForARoom = unbooked.filter((c) => c.sessionType === 'group');
  for (let i = 0; i < waitingForARoom.length; ) {
    const chunk = waitingForARoom.slice(i, i + GROUP_MAX_MEMBERS);
    if (chunk.length < GROUP_MIN_MEMBERS) {
      skipped += chunk.length;
      break;
    }
    const focus = roomFocus(state, chunk);
    const match = bestMatch(state, chunk, focus, load);
    if (!match) {
      skipped += waitingForARoom.length - i;
      break;
    }
    commit(state, rng, chunk, focus, match, load, opts.auto);
    booked++;
    i += chunk.length;
  }

  for (const c of unbooked) {
    if (c.sessionType === 'group') continue;
    const focus = suggestFocus(state, c);
    const match = bestMatch(state, [c], focus, load);
    if (!match) {
      skipped++;
      continue;
    }
    commit(state, rng, [c], focus, match, load, opts.auto);
    booked++;
  }
  return { booked, skipped };
}

/** Do the policies leave anything the player should look at? Act-3 exception feed. */
export interface Exception {
  id: string;
  kind: 'client_at_risk' | 'therapist_strain' | 'unbooked' | 'low_morale' | 'poach' | 'cash';
  label: string;
  detail: string;
  clientId?: string;
  therapistId?: string;
  severity: 1 | 2 | 3;
}

export function computeExceptions(state: GameState): Exception[] {
  const out: Exception[] = [];
  for (const c of activeClients(state)) {
    if (c.patience < AT_RISK_PATIENCE_THRESHOLD) {
      out.push({
        id: `exc_risk_${c.id}`,
        kind: 'client_at_risk',
        label: `${c.handle} is drifting`,
        detail: `Patience ${Math.round(c.patience)}% · ${c.daysSinceSession} days since their last session.`,
        clientId: c.id,
        severity: c.patience < 28 ? 3 : 2,
      });
    }
    if (!clientBooked(state, c.id) && c.daysSinceSession >= 4) {
      out.push({
        id: `exc_unbooked_${c.id}`,
        kind: 'unbooked',
        label: `${c.handle} has no session booked`,
        detail: `${c.daysSinceSession} days without an hour.`,
        clientId: c.id,
        severity: 2,
      });
    }
  }
  for (const t of state.therapists) {
    if (t.status === 'departed') continue;
    if (t.strain > 62) {
      out.push({
        id: `exc_strain_${t.id}`,
        kind: 'therapist_strain',
        label: `${t.name} is trending toward burnout`,
        detail: `Strain ${Math.round(t.strain)}%. Lighten the load or give them a slower day.`,
        therapistId: t.id,
        severity: t.strain > 82 ? 3 : 2,
      });
    }
    if (t.morale < 42) {
      out.push({
        id: `exc_morale_${t.id}`,
        kind: 'low_morale',
        label: `${t.name}'s morale is low`,
        detail: `Morale ${Math.round(t.morale)}%. Fair workload, wins, and good pairings all help.`,
        therapistId: t.id,
        severity: t.morale < 30 ? 3 : 2,
      });
    }
    if (t.poachOffer) {
      out.push({
        id: `exc_poach_${t.id}`,
        kind: 'poach',
        label: `${t.name} has an offer from ${t.poachOffer.rival}`,
        detail: `They have ${t.poachOffer.daysLeft} days to answer. Their offer is $${t.poachOffer.salary}/day.`,
        therapistId: t.id,
        severity: 3,
      });
    }
  }
  if (state.cash < 1200) {
    out.push({
      id: 'exc_cash',
      kind: 'cash',
      label: 'Cash is running low',
      detail: `$${Math.round(state.cash)} on hand.`,
      severity: state.cash < 400 ? 3 : 2,
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** Energy the therapist will have left after today's booked sessions. */
export function energyForecast(state: GameState, t: Therapist): number {
  const booked = sessionsForTherapist(state, t.id).filter((s) => s.status === 'scheduled');
  let e = t.energy;
  for (const s of booked) e -= sessionEnergyCost(t, s.focus, s.type, sessionMembers(s).length);
  return Math.max(0, Math.round(e));
}

export function dailyRevenueForecast(state: GameState): number {
  let total = 0;
  for (const s of state.schedule) {
    if (s.status === 'cancelled' || s.status === 'done') continue;
    for (const id of sessionMembers(s)) {
      const c = state.clients.find((x) => x.id === id);
      if (c) total += c.rate * (SESSION_TYPE_REVENUE_MULT[c.sessionType] ?? 1);
    }
  }
  return Math.round(total);
}

export function clampFocusForClient(c: Client, focus: SessionFocus): SessionFocus {
  return focus;
}

export function riskBadge(state: GameState, c: Client): 'none' | 'watch' | 'risk' {
  if (c.patience < 28) return 'risk';
  if (c.patience < AT_RISK_PATIENCE_THRESHOLD || c.stability < 0.25) return 'watch';
  return 'none';
}

export const focusOptions: SessionFocus[] = ['stabilize', 'process', 'build_skills'];

export function focusSafety(c: Client, focus: SessionFocus): 'safe' | 'caution' | 'danger' {
  const f = FOCUSES[focus];
  const gap = f.safeStability - c.stability;
  if (gap <= 0) return 'safe';
  if (gap < 0.15) return 'caution';
  return 'danger';
}

export function stabilityLabel(v: number): string {
  if (v > 0.75) return 'Steady';
  if (v > 0.55) return 'Holding';
  if (v > 0.35) return 'Shaky';
  return 'Destabilised';
}

export function rapportLabel(v: number): string {
  if (v > 0.8) return 'Deep trust';
  if (v > 0.6) return 'Strong alliance';
  if (v > 0.4) return 'Warming up';
  if (v > 0.2) return 'Cautious';
  return 'Guarded';
}

export function normalizedProgress(c: Client): number {
  return clamp01(c.progress / 100);
}
