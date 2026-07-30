import { COMMUNITY_TRUST_GAIN_FALLOFF, REPUTATION_GAIN_FALLOFF } from './balance';
import { eventById, EVENTS, techniqueById, upgradeById } from '../content';
import { makeId, type Rng } from './rng';
import type {
  Client,
  EventChoice,
  EventEffect,
  EventRequirement,
  EventScope,
  GameEventDef,
  GameState,
  PendingEvent,
  Therapist,
} from './types';
import { clamp, clamp01, softGain } from './util';

// ─────────────────────────────────────────────────────────────────────────────
// Requirements
// ─────────────────────────────────────────────────────────────────────────────

export function meetsRequirement(
  state: GameState,
  req: EventRequirement | undefined,
  therapist?: Therapist,
): boolean {
  if (!req) return true;
  if (req.minCash !== undefined && state.cash < req.minCash) return false;
  if (req.minReputation !== undefined && state.reputation < req.minReputation) return false;
  if (req.minCommunityTrust !== undefined && state.communityTrust < req.minCommunityTrust) return false;
  if (req.minPracticeLevel !== undefined && state.practiceLevel < req.minPracticeLevel) return false;
  if (req.act && !req.act.includes(state.act)) return false;
  if (req.philosophy && (!state.philosophy || !req.philosophy.includes(state.philosophy))) return false;
  if (req.hasProgram && !req.hasProgram.every((p) => state.programs.some((x) => x.id === p && x.active)))
    return false;
  if (req.hasUpgrade && !req.hasUpgrade.every((u) => state.upgrades.includes(u))) return false;
  if (req.minTherapists !== undefined && activeTherapists(state).length < req.minTherapists) return false;
  if (req.therapistTrait) {
    const pool = therapist ? [therapist] : activeTherapists(state);
    if (!pool.some((t) => req.therapistTrait!.some((tr) => t.traits.includes(tr)))) return false;
  }
  if (req.flag && !state.flags[req.flag]) return false;
  if (req.notFlag && state.flags[req.notFlag]) return false;
  return true;
}

export function activeTherapists(state: GameState): Therapist[] {
  return state.therapists.filter((t) => t.status !== 'departed');
}

export function workingTherapists(state: GameState): Therapist[] {
  return state.therapists.filter((t) => t.status === 'available' || t.status === 'in_session');
}

// ─────────────────────────────────────────────────────────────────────────────
// Raising events
// ─────────────────────────────────────────────────────────────────────────────

function substitute(text: string, state: GameState, client?: Client, therapist?: Therapist): string {
  return text
    .replace(/\{client\}/g, client ? `${client.handle} (${client.age})` : 'your client')
    .replace(/\{clientFirst\}/g, client?.firstName ?? 'they')
    .replace(/\{therapist\}/g, therapist?.name ?? 'your therapist')
    .replace(/\{therapistFirst\}/g, therapist?.name.split(' ')[0] ?? 'they')
    .replace(/\{practice\}/g, state.practiceName);
}

export interface RaiseOptions {
  clientId?: string;
  therapistId?: string;
  sessionId?: string;
}

export function raiseEvent(
  state: GameState,
  def: GameEventDef,
  opts: RaiseOptions,
  rng: Rng,
): PendingEvent | undefined {
  if (def.once && state.firedOnce.includes(def.id)) return undefined;
  const client = opts.clientId ? state.clients.find((c) => c.id === opts.clientId) : undefined;
  const therapist = opts.therapistId ? state.therapists.find((t) => t.id === opts.therapistId) : undefined;

  const choices = def.choices.filter((ch) => meetsRequirement(state, ch.requires, therapist));
  if (!choices.length) return undefined;

  if (def.once) state.firedOnce.push(def.id);

  const pending: PendingEvent = {
    instanceId: makeId(rng, 'ev'),
    def,
    title: substitute(def.title, state, client, therapist),
    body: substitute(def.body, state, client, therapist),
    choices: choices.map((ch) => ({ ...ch, label: substitute(ch.label, state, client, therapist) })),
    clientId: opts.clientId,
    therapistId: opts.therapistId,
    sessionId: opts.sessionId,
  };
  state.pendingEvents.push(pending);
  return pending;
}

export function raiseEventById(
  state: GameState,
  id: string,
  opts: RaiseOptions,
  rng: Rng,
): PendingEvent | undefined {
  const def = eventById[id];
  if (!def) return undefined;
  return raiseEvent(state, def, opts, rng);
}

/** Pick a random eligible event of a scope, weighted. */
export function pickEvent(
  state: GameState,
  scope: EventScope,
  rng: Rng,
  ctx: { client?: Client; therapist?: Therapist } = {},
): GameEventDef | undefined {
  const pool = EVENTS.filter((e) => {
    if (e.scope !== scope) return false;
    if (e.once && state.firedOnce.includes(e.id)) return false;
    if (e.minDay !== undefined && state.day < e.minDay) return false;
    if (!meetsRequirement(state, e.requires, ctx.therapist)) return false;
    if (e.conditions?.length) {
      const c = ctx.client;
      if (!c) return false;
      if (!e.conditions.includes(c.condition) && !c.comorbidities.some((x) => e.conditions!.includes(x)))
        return false;
    }
    if (e.chapters?.length) {
      const c = ctx.client;
      if (!c || !e.chapters.includes(c.chapter)) return false;
    }
    // At least one choice must be available.
    if (!e.choices.some((ch) => meetsRequirement(state, ch.requires, ctx.therapist))) return false;
    return true;
  });
  if (!pool.length) return undefined;
  return rng.weighted(pool, (e) => e.weight);
}

// ─────────────────────────────────────────────────────────────────────────────
// Applying effects
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectContext {
  state: GameState;
  rng: Rng;
  client?: Client;
  therapist?: Therapist;
  log: (text: string, kind: string, tone?: 'good' | 'bad' | 'neutral') => void;
  spawnReferral?: (opts: { severityBias?: number; complex?: boolean }) => void;
  toast?: (title: string, body: string, kind: string) => void;
}

export function applyEffect(effect: EventEffect | undefined, ctx: EffectContext): void {
  if (!effect) return;
  const { state, client, therapist } = ctx;

  if (effect.cash) {
    state.cash += effect.cash;
    if (effect.cash > 0) state.stats.totalRevenue += effect.cash;
    else state.stats.totalExpenses += -effect.cash;
  }
  // Gains soften as the meter fills; losses land at full strength.
  if (effect.reputation)
    state.reputation = clamp(
      state.reputation + softGain(state.reputation, effect.reputation, 100, REPUTATION_GAIN_FALLOFF),
      0,
      100,
    );
  if (effect.communityTrust)
    state.communityTrust = clamp(
      state.communityTrust + softGain(state.communityTrust, effect.communityTrust, 100, COMMUNITY_TRUST_GAIN_FALLOFF),
      0,
      100,
    );
  if (effect.xp) state.xp += effect.xp;

  if (therapist) {
    if (effect.therapistMorale) therapist.morale = clamp(therapist.morale + effect.therapistMorale, 0, 100);
    if (effect.therapistEnergy)
      therapist.energy = clamp(therapist.energy + effect.therapistEnergy, 0, therapist.maxEnergy);
    if (effect.therapistXp) therapist.xp += effect.therapistXp;
    if (effect.grantTherapistTrait && !therapist.traits.includes(effect.grantTherapistTrait))
      therapist.traits.push(effect.grantTherapistTrait);
    if (effect.grantTechnique && techniqueById[effect.grantTechnique] && !therapist.techniques.includes(effect.grantTechnique))
      therapist.techniques.push(effect.grantTechnique);
  }

  if (client) {
    if (effect.clientRapport) client.rapport = clamp01(client.rapport + effect.clientRapport);
    if (effect.clientStability) client.stability = clamp01(client.stability + effect.clientStability);
    if (effect.clientProgress) client.progress = clamp(client.progress + effect.clientProgress, 0, 100);
    if (effect.clientPatience) client.patience = clamp(client.patience + effect.clientPatience, 0, 100);
  }

  if (effect.allMorale) {
    for (const t of activeTherapists(state)) t.morale = clamp(t.morale + effect.allMorale, 0, 100);
  }
  if (effect.allEnergy) {
    for (const t of activeTherapists(state)) t.energy = clamp(t.energy + effect.allEnergy, 0, t.maxEnergy);
  }

  if (effect.setFlag) state.flags[effect.setFlag] = true;
  if (effect.clearFlag) delete state.flags[effect.clearFlag];

  if (effect.grantUpgrade && upgradeById[effect.grantUpgrade] && !state.upgrades.includes(effect.grantUpgrade)) {
    state.upgrades.push(effect.grantUpgrade);
  }
  if (effect.grantTechnique && !therapist) {
    // Practice-wide technique grant: everybody learns it.
    for (const t of activeTherapists(state)) {
      if (techniqueById[effect.grantTechnique] && !t.techniques.includes(effect.grantTechnique))
        t.techniques.push(effect.grantTechnique);
    }
  }

  if (effect.followUp) {
    state.queuedEvents.push({
      eventId: effect.followUp.eventId,
      day: state.day + effect.followUp.inDays,
      clientId: client?.id,
      therapistId: therapist?.id,
    });
  }

  if (effect.spawnReferral && ctx.spawnReferral) ctx.spawnReferral(effect.spawnReferral);

  if (effect.log) ctx.log(effect.log, 'event');
}

export function resolvePendingEvent(
  state: GameState,
  instanceId: string,
  choiceId: string,
  ctx: Omit<EffectContext, 'client' | 'therapist'>,
): { choice: EventChoice; pending: PendingEvent } | undefined {
  const idx = state.pendingEvents.findIndex((p) => p.instanceId === instanceId);
  if (idx < 0) return undefined;
  const pending = state.pendingEvents[idx];
  const choice = pending.choices.find((c) => c.id === choiceId) ?? pending.choices[0];
  state.pendingEvents.splice(idx, 1);

  const client = pending.clientId ? state.clients.find((c) => c.id === pending.clientId) : undefined;
  const therapist = pending.therapistId ? state.therapists.find((t) => t.id === pending.therapistId) : undefined;

  applyEffect(choice.effects, { ...ctx, state, client, therapist });
  return { choice, pending };
}
