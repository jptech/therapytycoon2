import {
  COMMUNITY_TRUST_GAIN_FALLOFF,
  EVENT_COOLDOWN_DAYS,
  EVENT_MAX_DEFERRALS,
  REPUTATION_GAIN_FALLOFF,
} from './balance';
import { eventById, EVENTS, techniqueById, upgradeById } from '../content';
import { makeId, type Rng } from './rng';
import { chapterFor } from './session';
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

/**
 * What a scripted raise should do when this subject is still inside the event's
 * window — the question `raiseEvent` used to duck by never checking.
 *
 * `'defer'` re-queues the beat for the day the window lifts. It is the default
 * because it is the safe one: arc beats and `followUp` chains reach this
 * function through `state.queuedEvents`, nobody reads the return value, and a
 * silent `return undefined` on that path *deletes* a promised conversation.
 *
 * `'skip'` drops it. Only for raises that promise nothing — an ambient nudge
 * the engine throws when a meter crosses a line. Nothing told the player this
 * was coming, so nothing is broken by its not arriving.
 */
export type RepeatPolicy = 'defer' | 'skip';

export interface RaiseOptions {
  clientId?: string;
  therapistId?: string;
  sessionId?: string;
  /** See `RepeatPolicy`. Defaults to `'defer'` — losing a beat is the worse failure. */
  onRepeat?: RepeatPolicy;
  /** Carried by a deferred beat coming round again; see `EVENT_MAX_DEFERRALS`. */
  deferrals?: number;
}

/** Practice- and day-scope events are about the practice, not about a person. */
export const PRACTICE_SUBJECT = 'practice';

/**
 * Who an event is *about*, decided by its scope rather than by whatever context
 * happened to ride along on the raise. `ev_practice_insurance_renegotiation`
 * used to carry the clientId whose authorisation ran out, but it is a
 * practice-wide letter about a panel contract: the subject is the practice, and
 * two of them the same morning is one repeat, not two unrelated events.
 *
 * This mirrors exactly what the balance harness reconstructs when it decides
 * whether a repeat is `cooldown_same_subject` or `cooldown_global`.
 */
export function eventSubject(
  scope: EventScope,
  who: { clientId?: string; therapistId?: string },
): string {
  if (scope === 'client' && who.clientId) return who.clientId;
  if (scope === 'staff' && who.therapistId) return who.therapistId;
  return PRACTICE_SUBJECT;
}

export function subjectCooldownKey(eventId: string, subject: string): string {
  return `${eventId}@${subject}`;
}

/** Drops windows that have already lifted, so the map cannot grow with the client list. */
export function sweepSubjectCooldowns(state: GameState): void {
  const cds = state.subjectCooldowns;
  if (!cds) return;
  for (const key of Object.keys(cds)) {
    if (cds[key] <= state.day) delete cds[key];
  }
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

  // ── The same conversation, too soon ─────────────────────────────────────────
  // `pickEvent` has always refused to draw inside a window; scripted raises
  // walked straight through one, which is how the same client came to be asked
  // whether she wanted to stop therapy twice in six days.
  state.subjectCooldowns ??= {};
  const subject = eventSubject(def.scope, opts);
  const key = subjectCooldownKey(def.id, subject);

  // Already on screen for this person: a second copy is a duplicate, not a
  // beat. Re-queueing it would only guarantee the player answers it twice.
  if (state.pendingEvents.some((p) => p.def.id === def.id && eventSubject(p.def.scope, p) === subject)) {
    return undefined;
  }

  // Wait for the window to lift for *this* subject — or, failing that, for
  // tomorrow, because two of the same conversation in one morning reads as a
  // bug even when it is honestly two different people. The morning queue drains
  // before the player answers anything, so both would go up together.
  const holdUntil =
    (state.subjectCooldowns[key] ?? 0) > state.day
      ? Math.max(state.subjectCooldowns[key], state.day + 1)
      : state.pendingEvents.some((p) => p.def.id === def.id)
        ? state.day + 1
        : 0;

  if (holdUntil && !def.urgent) {
    if (opts.onRepeat === 'skip') return undefined;
    const pushedBack = opts.deferrals ?? 0;
    if (pushedBack < EVENT_MAX_DEFERRALS) {
      state.queuedEvents.push({
        eventId: def.id,
        day: holdUntil,
        clientId: opts.clientId,
        therapistId: opts.therapistId,
        deferrals: pushedBack + 1,
      });
      return undefined;
    }
    // Out of push-backs. It lands late rather than never.
  }

  if (def.once) state.firedOnce.push(def.id);
  // Scripted raises still set the cooldown, so a follow-up cannot be immediately
  // echoed by the random draw.
  state.eventCooldowns ??= {};
  state.eventCooldowns[def.id] = state.day + EVENT_COOLDOWN_DAYS[def.scope];
  state.subjectCooldowns[key] = state.day + EVENT_COOLDOWN_DAYS[def.scope];

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
    if ((state.eventCooldowns?.[e.id] ?? 0) > state.day) return false;
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
    if (effect.clientProgress) {
      client.progress = clamp(client.progress + effect.clientProgress, 0, 100);
      // Progress and chapter are one fact stored twice, and an event that moved
      // one without the other left a client sitting in the Work chapter at 78%
      // — wrong beats, wrong techniques offered, wrong label on the card.
      client.chapter = chapterFor(client.progress);
    }
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
