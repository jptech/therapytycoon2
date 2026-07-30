import { Fragment, useState } from 'react';
import {
  CONDITION_LABELS,
  DAY_START_MINUTE,
  FOCUSES,
  SESSION_MINUTES,
  SEVERITY_LABELS,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
} from '../../sim/balance';
import { slotStartMinute } from '../../sim/engine';
import { regressionChance, specializationFit } from '../../sim/quality';
import {
  activeClients,
  bookableTherapists,
  clientBooked,
  clientPriority,
  dailyRevenueForecast,
  energyForecast,
  focusOptions,
  focusSafety,
  riskBadge,
  sessionsForTherapist,
  suggestFocus,
} from '../../sim/scheduler';
import type {
  Client,
  GameState,
  ScheduledSession,
  SessionFocus,
  Therapist,
  TherapistStatus,
} from '../../sim/types';
import { formatClock, formatMoney } from '../../sim/util';
import { Portrait } from '../Portrait';
import {
  Button,
  Chip,
  EmptyState,
  Meter,
  Modal,
  PanelShell,
  ProgressRing,
  RiskDot,
  SectionHeading,
  Tooltip,
} from '../primitives';
import { useDispatch, useSim, useStore } from '../../store';

/**
 * The Day Book — the core verb of Acts 1 and 2.
 *
 * Rows are therapists, columns are the ten hours of the working day. Every
 * number on this screen is read straight out of src/sim helpers: energy
 * forecasts, regression odds, specialization fit and who most needs an hour.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Reading the sim
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A compact digest of everything the grid draws. Subscribing to this string
 * means the panel re-renders when the board actually changes, not on every
 * clock tick — the live session rings subscribe to their own `t` instead.
 */
function scheduleDigest(s: GameState): string {
  let d = `${s.day}|${s.dayPhase}|${Math.floor(s.minute / SLOT_MINUTES)}|${s.difficulty}|${s.upgrades.length}`;
  for (const t of s.therapists) {
    if (t.status === 'departed') continue;
    d += `~${t.id}:${t.status}:${t.statusDays}:${Math.round(t.energy)}:${t.maxEnergy}`;
  }
  for (const x of s.schedule) {
    d += `#${x.id}:${x.therapistId}:${x.clientId}:${x.slot}:${x.focus}:${x.status}`;
  }
  for (const c of s.clients) {
    if (c.status !== 'active') continue;
    d += `@${c.id}:${Math.round(c.patience)}:${Math.round(c.stability * 100)}:${Math.round(
      c.resilience * 100,
    )}:${c.daysSinceSession}:${c.chapter[0]}`;
  }
  return d;
}

/** Subscribe to the digest, then read the live state for this render only. */
function useScheduleState(): GameState {
  useSim(scheduleDigest);
  return useStore((st) => st.game.state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared bits
// ─────────────────────────────────────────────────────────────────────────────

const AWAY_LABEL: Partial<Record<TherapistStatus, string>> = {
  training: 'Away at training',
  sabbatical: 'On sabbatical',
  conference: 'At a conference',
  program: 'Running a program',
};

const SAFETY_COLOR: Record<'safe' | 'caution' | 'danger', string> = {
  safe: 'var(--color-sage-deep)',
  caution: 'var(--color-amber-deep)',
  danger: 'var(--color-brick)',
};

const SAFETY_WORD: Record<'safe' | 'caution' | 'danger', string> = {
  safe: 'Steady enough',
  caution: 'Pushing it',
  danger: 'Too soon',
};

const GRADE_COLOR: Record<string, string> = {
  breakthrough: 'var(--color-amber-deep)',
  excellent: 'var(--color-sage-deep)',
  good: 'var(--color-sage-deep)',
  mixed: 'var(--color-ink-faint)',
  poor: 'var(--color-brick)',
};

const GRADE_WORD: Record<string, string> = {
  breakthrough: 'Breakthrough',
  excellent: 'Excellent',
  good: 'Good',
  mixed: 'Mixed',
  poor: 'Hard hour',
};

function firstName(t: Therapist): string {
  return t.name.split(' ')[0];
}

function fitColor(fit: number): string {
  if (fit >= 0.75) return 'var(--color-sage-deep)';
  if (fit >= 0.5) return 'var(--color-amber-deep)';
  return 'var(--color-ink-faint)';
}

function joinHandles(handles: string[]): string {
  if (handles.length === 1) return handles[0];
  if (handles.length === 2) return `${handles[0]} and ${handles[1]}`;
  return `${handles.slice(0, 2).join(', ')} and ${handles.length - 2} more`;
}

function slotClock(slot: number): string {
  return formatClock(DAY_START_MINUTE + slotStartMinute(slot));
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

export function SchedulePanel() {
  const state = useScheduleState();
  const dispatch = useDispatch();
  const openPanel = useStore((st) => st.openPanel);
  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);

  const [picker, setPicker] = useState<{ therapistId: string; slot: number } | null>(null);

  const bookable = bookableTherapists(state);
  const away = state.therapists.filter((t) => AWAY_LABEL[t.status]);
  const active = activeClients(state);
  const unbooked = active.filter((c) => !clientBooked(state, c.id));
  const drifting = unbooked.filter((c) => riskBadge(state, c) !== 'none');
  const bookedCount = state.schedule.filter((s) => s.status !== 'cancelled').length;
  const revenue = dailyRevenueForecast(state);
  const hasAutoScheduler = state.upgrades.includes('up_auto_scheduler');
  const slots = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);
  const nowSlot = state.dayPhase === 'running' ? Math.floor(state.minute / SLOT_MINUTES) : -1;

  const clearUnbooked = () => {
    for (const s of state.schedule) {
      if (s.status === 'scheduled') dispatch({ type: 'UNBOOK_SESSION', sessionId: s.id });
    }
  };

  return (
    <PanelShell
      wide
      icon="📖"
      title="The Day Book"
      subtitle={
        <>
          Day {state.day} · {bookedCount} hour{bookedCount === 1 ? '' : 's'} on the board ·{' '}
          {formatMoney(revenue)} still to come
        </>
      }
      onClose={() => openPanel(null)}
      footer={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-ink-faint">
          {focusOptions.map((f) => (
            <span key={f} className="inline-flex items-center gap-1">
              <span aria-hidden>{FOCUSES[f].icon}</span>
              <span className="font-bold" style={{ color: FOCUSES[f].color }}>
                {FOCUSES[f].name}
              </span>
              <span className="hidden sm:inline">— {FOCUSES[f].blurb}</span>
            </span>
          ))}
        </div>
      }
    >
      {bookable.length === 0 ? (
        <EmptyState
          icon="🕯️"
          title="Nobody is in the building today."
          body="Everyone is training, resting, or elsewhere. Tomorrow the lamps come back on."
        />
      ) : (
        <>
          {/* ── Energy forecasts ─────────────────────────────────────────── */}
          <SectionHeading sub="What today's bookings will cost them. The faded bar is where they stand right now.">
            Energy after today
          </SectionHeading>
          <div className="grid gap-2.5 sm:grid-cols-2 mb-4">
            {bookable.map((t) => (
              <EnergyForecast key={t.id} state={state} therapist={t} />
            ))}
          </div>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => dispatch({ type: 'AUTOFILL_SCHEDULE' })}
              disabled={unbooked.length === 0}
              title="Books whoever needs an hour most, with the focus your policies suggest."
            >
              ✨ Auto-fill
            </Button>
            <Button
              size="sm"
              onClick={clearUnbooked}
              disabled={!state.schedule.some((s) => s.status === 'scheduled')}
              title="Removes every session that hasn't started yet. Finished hours stay on the record."
            >
              Clear unbooked
            </Button>
            {hasAutoScheduler && (
              <Button
                variant="plum"
                size="sm"
                onClick={() => dispatch({ type: 'RUN_AUTOSCHEDULER' })}
                title="Runs your written policies over the whole board."
              >
                ⚙️ Run scheduler
              </Button>
            )}
          </div>

          <p className="text-[0.76rem] text-ink-soft leading-snug mb-2">
            {unbooked.length === 0
              ? active.length === 0
                ? 'No active clients yet. The waitlist is where today starts.'
                : 'Everyone on the caseload has an hour. That is a rare and good feeling.'
              : `${unbooked.length} ${
                  unbooked.length === 1 ? 'person is' : 'people are'
                } still without an hour today.`}
          </p>

          {drifting.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-[var(--radius-card)] px-3 py-2 mb-3 text-[0.76rem] leading-snug"
              style={{
                background: 'color-mix(in oklab, var(--color-brick) 12%, transparent)',
                border: '1px solid color-mix(in oklab, var(--color-brick) 32%, transparent)',
                color: 'var(--color-ink)',
              }}
            >
              <span aria-hidden className="mt-[1px]">
                🍂
              </span>
              <span>
                <strong>{joinHandles(drifting.map((c) => c.handle))}</strong>{' '}
                {drifting.length === 1 ? 'is' : 'are'} drifting and unbooked. An hour today buys back
                their patience.
              </span>
            </div>
          )}

          {/* ── The grid ─────────────────────────────────────────────────── */}
          <div className="overflow-x-auto overscroll-x-contain pb-1">
            <div
              className="grid min-w-max"
              style={{ gridTemplateColumns: `9.5rem repeat(${SLOTS_PER_DAY}, 8.5rem)` }}
              role="group"
              aria-label="Today's schedule grid"
            >
              {/* header */}
              <div
                className="sticky left-0 z-30 bg-paper border-b hairline px-2 py-1.5 text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint"
                style={{ borderRight: '1px solid color-mix(in oklab, var(--color-ink) 12%, transparent)' }}
              >
                Who
              </div>
              {slots.map((slot) => {
                const past = nowSlot >= 0 && slot < nowSlot;
                return (
                  <div
                    key={slot}
                    className={`border-b hairline px-2 py-1.5 tabular text-[0.68rem] text-center ${
                      past ? 'text-ink-faint/70 line-through' : slot === nowSlot ? 'text-amber' : 'text-ink-soft'
                    }`}
                  >
                    {slotClock(slot)}
                  </div>
                );
              })}

              {/* therapist rows */}
              {bookable.map((t) => {
                const booked = sessionsForTherapist(state, t.id).filter((s) => s.status !== 'cancelled');
                return (
                  <Fragment key={t.id}>
                    <div
                      className="sticky left-0 z-20 bg-paper px-2 py-2 border-b hairline flex flex-col justify-center gap-0.5"
                      style={{ borderRight: '1px solid color-mix(in oklab, var(--color-ink) 12%, transparent)' }}
                    >
                      <div className="display text-[0.86rem] leading-tight text-ink truncate" title={t.name}>
                        {t.name}
                      </div>
                      <div className="tabular text-[0.63rem] text-ink-faint">
                        {booked.length}/{SLOTS_PER_DAY} hrs · {Math.round(t.energy)}⚡
                      </div>
                    </div>
                    {slots.map((slot) => (
                      <Cell
                        key={slot}
                        state={state}
                        therapist={t}
                        slot={slot}
                        locked={nowSlot >= 0 && slot < nowSlot}
                        calm={calm}
                        onPick={() => setPicker({ therapistId: t.id, slot })}
                      />
                    ))}
                  </Fragment>
                );
              })}

              {/* away rows */}
              {away.map((t) => (
                <Fragment key={t.id}>
                  <div
                    className="sticky left-0 z-20 bg-paper px-2 py-2 border-b hairline opacity-55"
                    style={{ borderRight: '1px solid color-mix(in oklab, var(--color-ink) 12%, transparent)' }}
                  >
                    <div className="display text-[0.86rem] leading-tight text-ink truncate" title={t.name}>
                      {t.name}
                    </div>
                  </div>
                  <div
                    className="border-b hairline px-3 py-3 text-[0.74rem] text-ink-faint italic flex items-center"
                    style={{ gridColumn: `span ${SLOTS_PER_DAY}` }}
                  >
                    {AWAY_LABEL[t.status]}
                    {t.statusDays > 0
                      ? ` — back in ${t.statusDays} day${t.statusDays === 1 ? '' : 's'}.`
                      : '.'}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </>
      )}

      {picker && (
        <ClientPicker
          state={state}
          therapistId={picker.therapistId}
          slot={picker.slot}
          onClose={() => setPicker(null)}
          onChoose={(clientId, focus) => {
            dispatch({
              type: 'BOOK_SESSION',
              clientId,
              therapistId: picker.therapistId,
              slot: picker.slot,
              focus,
            });
            setPicker(null);
          }}
        />
      )}
    </PanelShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Energy forecast
// ─────────────────────────────────────────────────────────────────────────────

function EnergyForecast({ state, therapist }: { state: GameState; therapist: Therapist }) {
  const after = energyForecast(state, therapist);
  const max = Math.max(1, therapist.maxEnergy);
  const pct = Math.round((after / max) * 100);
  const low = pct < 25;
  const booked = sessionsForTherapist(state, therapist.id).filter((s) => s.status === 'scheduled').length;

  return (
    <div className="card-warm px-3 py-2">
      <Meter
        value={after}
        max={max}
        ghost={therapist.energy}
        color={low ? 'var(--color-brick)' : 'var(--color-plum)'}
        label={firstName(therapist)}
        right={`${Math.round(therapist.energy)} → ${after}`}
      />
      <div className={`text-[0.68rem] leading-snug mt-1 ${low ? 'text-brick font-bold' : 'text-ink-faint'}`}>
        {booked === 0
          ? `Nothing booked yet — they finish the day on ${after} of ${max}.`
          : low
            ? `${booked} booked leaves them on ${pct}% — under a quarter tank, quality slips and strain builds.`
            : `${booked} booked leaves them on ${pct}% after today.`}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid cell
// ─────────────────────────────────────────────────────────────────────────────

function Cell({
  state,
  therapist,
  slot,
  locked,
  calm,
  onPick,
}: {
  state: GameState;
  therapist: Therapist;
  slot: number;
  locked: boolean;
  calm: boolean;
  onPick: () => void;
}) {
  const session = state.schedule.find(
    (s) => s.therapistId === therapist.id && s.slot === slot && s.status !== 'cancelled',
  );
  const client = session ? state.clients.find((c) => c.id === session.clientId) : undefined;

  const frame = 'border-b hairline p-1';

  if (!session || !client) {
    return (
      <div className={frame}>
        <button
          type="button"
          onClick={onPick}
          disabled={locked}
          aria-label={`Book ${therapist.name} at ${slotClock(slot)}`}
          className={`w-full h-[5.2rem] rounded-[10px] grid place-items-center text-[0.75rem] transition ${
            locked
              ? 'text-ink-faint/40 cursor-not-allowed'
              : 'text-ink-faint hover:text-ink hover:bg-[color-mix(in_oklab,var(--color-amber)_16%,transparent)]'
          }`}
          style={{
            border: `1px dashed color-mix(in oklab, var(--color-ink) ${locked ? 10 : 24}%, transparent)`,
          }}
        >
          {locked ? <span className="text-[0.68rem]">passed</span> : <span aria-hidden>＋</span>}
        </button>
      </div>
    );
  }

  if (session.status === 'active') {
    return (
      <div className={frame}>
        <LiveCell sessionId={session.id} handle={client.handle} focus={session.focus} />
      </div>
    );
  }

  if (session.status === 'done' || session.status === 'missed') {
    const grade = session.result?.grade;
    return (
      <div className={frame}>
        <div className="w-full h-[5.2rem] rounded-[10px] paper-flat px-2 py-1.5 flex flex-col justify-between opacity-70">
          <div className="text-[0.78rem] font-bold text-ink truncate">{client.handle}</div>
          <div className="text-[0.66rem] text-ink-faint">
            {session.status === 'missed' ? 'Never happened' : `${FOCUSES[session.focus].icon} ${FOCUSES[session.focus].name}`}
          </div>
          <div
            className="text-[0.7rem] font-extrabold uppercase tracking-[0.06em]"
            style={{ color: grade ? GRADE_COLOR[grade] : 'var(--color-ink-faint)' }}
          >
            {grade ? GRADE_WORD[grade] : session.status === 'missed' ? '—' : 'Done'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={frame}>
      <BookedCell state={state} session={session} client={client} calm={calm} />
    </div>
  );
}

/** Subscribes to its own session progress so the ring moves without redrawing the grid. */
function LiveCell({ sessionId, handle, focus }: { sessionId: string; handle: string; focus: SessionFocus }) {
  const t = useSim((s) => s.schedule.find((x) => x.id === sessionId)?.t ?? 0);
  const minutesLeft = Math.max(0, Math.ceil((1 - t) * SESSION_MINUTES));
  return (
    <div
      className="w-full h-[5.2rem] rounded-[10px] px-2 py-1.5 flex items-center gap-2"
      style={{
        background: 'color-mix(in oklab, var(--color-amber) 15%, var(--color-paper))',
        border: '1px solid color-mix(in oklab, var(--color-amber-deep) 45%, transparent)',
      }}
    >
      <ProgressRing value={t} size={34} color={FOCUSES[focus].color}>
        <span aria-hidden className="text-[0.7rem]">
          {FOCUSES[focus].icon}
        </span>
      </ProgressRing>
      <div className="min-w-0">
        <div className="text-[0.78rem] font-bold text-ink truncate">{handle}</div>
        <div className="text-[0.64rem] text-ink-soft leading-tight">In the room</div>
        <div className="tabular text-[0.64rem] text-ink-faint">{minutesLeft} min left</div>
      </div>
    </div>
  );
}

function BookedCell({
  state,
  session,
  client,
  calm,
}: {
  state: GameState;
  session: ScheduledSession;
  client: Client;
  calm: boolean;
}) {
  const dispatch = useDispatch();
  const safety = focusSafety(client, session.focus);
  const risk = regressionChance(state, client, session.focus);
  const riskPct = Math.round(risk * 100);

  return (
    <div
      className={`w-full h-[5.2rem] rounded-[10px] card-warm px-2 py-1.5 flex flex-col justify-between ${
        calm ? '' : 'pop-in'
      }`}
    >
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <div className="text-[0.78rem] font-bold text-ink truncate" title={`${client.handle}, ${client.age}`}>
            {client.handle}
          </div>
          <div className="text-[0.62rem] text-ink-faint truncate">{CONDITION_LABELS[client.condition]}</div>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'UNBOOK_SESSION', sessionId: session.id })}
          aria-label={`Unbook ${client.handle} from ${slotClock(session.slot)}`}
          title="Take this hour back"
          className="shrink-0 w-4 h-4 grid place-items-center rounded-full text-[0.6rem] text-ink-faint hover:text-brick hover:bg-[color-mix(in_oklab,var(--color-brick)_14%,transparent)] transition"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex gap-0.5" role="group" aria-label={`Focus for ${client.handle}`}>
          {focusOptions.map((f) => {
            const on = session.focus === f;
            const fRisk = Math.round(regressionChance(state, client, f) * 100);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                aria-label={`${FOCUSES[f].name} — ${fRisk}% chance of losing ground`}
                title={`${FOCUSES[f].name} · ${fRisk}% regression risk — ${FOCUSES[f].blurb}`}
                onClick={() => dispatch({ type: 'SET_SESSION_FOCUS', sessionId: session.id, focus: f })}
                className="w-[1.35rem] h-[1.35rem] rounded-full grid place-items-center text-[0.7rem] transition"
                style={{
                  background: on ? `color-mix(in oklab, ${FOCUSES[f].color} 34%, transparent)` : 'transparent',
                  border: `1px solid color-mix(in oklab, ${FOCUSES[f].color} ${on ? 70 : 22}%, transparent)`,
                  opacity: on ? 1 : 0.6,
                }}
              >
                <span aria-hidden>{FOCUSES[f].icon}</span>
              </button>
            );
          })}
        </div>

        <Tooltip
          side="top"
          content={
            <>
              <strong>{SAFETY_WORD[safety]}.</strong> {FOCUSES[session.focus].name} carries a{' '}
              <strong>{riskPct}%</strong> chance {client.handle} loses ground this hour. They are at{' '}
              {Math.round(client.stability * 100)}% stability; {FOCUSES[session.focus].name} wants{' '}
              {Math.round(FOCUSES[session.focus].safeStability * 100)}%.
            </>
          }
        >
          <span
            className="tabular text-[0.62rem] font-bold px-1 rounded-full cursor-help"
            style={{
              color: SAFETY_COLOR[safety],
              background: `color-mix(in oklab, ${SAFETY_COLOR[safety]} 15%, transparent)`,
            }}
          >
            {riskPct}%
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client picker
// ─────────────────────────────────────────────────────────────────────────────

function ClientPicker({
  state,
  therapistId,
  slot,
  onClose,
  onChoose,
}: {
  state: GameState;
  therapistId: string;
  slot: number;
  onClose: () => void;
  onChoose: (clientId: string, focus: SessionFocus) => void;
}) {
  const therapist = state.therapists.find((t) => t.id === therapistId);
  const queue = activeClients(state)
    .filter((c) => !clientBooked(state, c.id))
    .sort((a, b) => clientPriority(state, b) - clientPriority(state, a));

  return (
    <Modal onClose={onClose} width={520} labelledBy="picker-title">
      <div className="px-4 pt-3.5 pb-2.5 border-b hairline">
        <h3 id="picker-title" className="display text-[1.05rem] text-ink">
          Who takes {slotClock(slot)}?
        </h3>
        <p className="text-[0.74rem] text-ink-faint leading-snug mt-0.5">
          {therapist ? `${therapist.name}'s hour. ` : ''}Sorted by who needs it most — patience, days
          waiting, and how steady they are.
        </p>
      </div>

      <div className="px-3 py-2.5 max-h-[58vh] overflow-y-auto">
        {queue.length === 0 ? (
          <EmptyState
            icon="🫖"
            title="Everyone already has an hour."
            body="Nothing left to book into this slot. Put the kettle on."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {queue.map((c) => {
              const fit = therapist ? specializationFit(therapist, c) : 0;
              const focus = suggestFocus(state, c);
              const risk = Math.round(regressionChance(state, c, focus) * 100);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(c.id, focus)}
                    className="w-full text-left paper-flat px-2.5 py-2 flex items-start gap-2.5 hover:brightness-[1.03] transition focus-visible:outline-2 focus-visible:outline-amber"
                  >
                    <Portrait seed={c.portrait} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.86rem] font-bold text-ink">{c.handle}</span>
                        <span className="tabular text-[0.7rem] text-ink-faint">{c.age}</span>
                        <RiskDot level={riskBadge(state, c)} />
                      </div>
                      <div className="text-[0.72rem] text-ink-soft leading-snug">
                        {CONDITION_LABELS[c.condition]} · {SEVERITY_LABELS[c.severity]}
                        {c.complex ? ' · complex' : ''}
                      </div>
                      <div className="text-[0.68rem] text-ink-faint leading-snug">
                        {c.daysSinceSession === 0
                          ? 'Seen today'
                          : `${c.daysSinceSession} day${c.daysSinceSession === 1 ? '' : 's'} since their last hour`}{' '}
                        · patience {Math.round(c.patience)}%
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {therapist && (
                        <Chip
                          color={fitColor(fit)}
                          title={`How well ${therapist.name}'s school fits this case`}
                        >
                          {Math.round(fit * 100)}% match
                        </Chip>
                      )}
                      <span className="text-[0.64rem] text-ink-faint whitespace-nowrap">
                        <span aria-hidden>{FOCUSES[focus].icon}</span> {FOCUSES[focus].name} · {risk}% risk
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-4 py-2.5 border-t hairline flex justify-end">
        <Button size="sm" onClick={onClose}>
          Never mind
        </Button>
      </div>
    </Modal>
  );
}
