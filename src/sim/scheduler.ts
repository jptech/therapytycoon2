import { AT_RISK_PATIENCE_THRESHOLD, FOCUSES, SLOTS_PER_DAY } from './balance';
import { specializationFit } from './quality';
import { makeId, type Rng } from './rng';
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
  return state.schedule.some((s) => s.clientId === clientId && s.status !== 'cancelled');
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

function bestMatch(state: GameState, c: Client, load: Record<string, number>): MatchScore | undefined {
  const maxSessions = policy(state, 'max_sessions_per_therapist')?.value ?? SLOTS_PER_DAY;
  const energyReserve = (policy(state, 'min_energy_reserve')?.value ?? 0) / 100;
  const wantMatch = !!policy(state, 'match_specialization');
  const balance = !!policy(state, 'balance_workload');
  const supervision = policy(state, 'reserve_slot_for_supervision');

  let best: MatchScore | undefined;
  for (const t of bookableTherapists(state)) {
    const booked = load[t.id] ?? 0;
    if (booked >= maxSessions) continue;
    // Energy forecast: don't book past the reserve.
    const projected = t.energy - booked * 13;
    if (projected < t.maxEnergy * energyReserve) continue;

    // Route-condition policies force an assignment.
    const route = state.policies.find(
      (p) => p.enabled && p.kind === 'route_condition_to_therapist' && p.targetCondition === c.condition,
    );
    if (route && route.targetTherapistId && route.targetTherapistId !== t.id) continue;

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      if (slotTaken(state, t.id, slot)) continue;
      if (supervision && supervision.value > 0 && (state.day - 1) % 7 === 4) {
        if (slot >= SLOTS_PER_DAY - supervision.value) continue;
      }
      if (t.preferredSlots?.length && !t.preferredSlots.includes(slot)) continue;

      let score = 0;
      if (wantMatch) score += specializationFit(t, c) * 100;
      else score += 30;
      if (route?.targetTherapistId === t.id) score += 60;
      if (t.bonds.includes(c.id)) score += 25;
      if (c.therapistId === t.id) score += 45; // continuity of care matters
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

/**
 * Fill today's schedule. Used by the Act-1/2 "autofill" button and by the Act-3
 * policy auto-scheduler (which simply runs the same code with the player's rules).
 */
export function autofillSchedule(state: GameState, rng: Rng, opts: { auto?: boolean } = {}): AutofillResult {
  const load: Record<string, number> = {};
  for (const s of state.schedule) {
    if (s.status === 'cancelled') continue;
    load[s.therapistId] = (load[s.therapistId] ?? 0) + 1;
  }

  const queue = activeClients(state)
    .filter((c) => !clientBooked(state, c.id))
    .sort((a, b) => clientPriority(state, b) - clientPriority(state, a));

  let booked = 0;
  let skipped = 0;
  for (const c of queue) {
    const match = bestMatch(state, c, load);
    if (!match) {
      skipped++;
      continue;
    }
    const focus = suggestFocus(state, c);
    state.schedule.push({
      id: makeId(rng, 's'),
      clientId: c.id,
      therapistId: match.therapist.id,
      slot: match.slot,
      focus,
      type: c.sessionType,
      status: 'scheduled',
      t: 0,
      auto: opts.auto,
    });
    c.therapistId = match.therapist.id;
    load[match.therapist.id] = (load[match.therapist.id] ?? 0) + 1;
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
  for (const s of booked) e -= 13 * FOCUSES[s.focus].energyMult;
  return Math.max(0, Math.round(e));
}

export function dailyRevenueForecast(state: GameState): number {
  let total = 0;
  for (const s of state.schedule) {
    if (s.status === 'cancelled' || s.status === 'done') continue;
    const c = state.clients.find((x) => x.id === s.clientId);
    if (c) total += c.rate * (c.sessionType === 'group' ? 0.55 : 1);
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
