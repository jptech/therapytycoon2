import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CONDITION_LABELS,
  DAY_START_MINUTE,
  FOCUSES,
  GROUP_MAX_MEMBERS,
  GROUP_MIN_MEMBERS,
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
  stabilityLabel,
  suggestFocus,
} from '../../sim/scheduler';
import { sessionMemberClients, sessionPacer } from '../../sim/session';
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
import { placeAnchored } from '../anchor';
import {
  SESSION_TYPE_COLOR,
  SessionTypeChip,
  andList,
  countWord,
  joinHandles,
  roomTitle,
} from '../rooms';
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
    // memberIds is part of the digest: seating one more person into a room
    // changes nothing else about the session, and the cell has to redraw.
    d += `#${x.id}:${x.therapistId}:${(x.memberIds ?? [x.clientId]).join('+')}:${x.slot}:${x.focus}:${x.status}`;
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

/** One height for every state of a cell, so the grid never jumps. */
const CELL_H = 'h-[5.9rem]';

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
  // Never `session.clientId`: a group hour holds several people and a cure or a
  // dropout can empty one of the chairs mid-day. `sessionMemberClients` is the
  // sim's own seam and it silently drops anyone who has left.
  const members = session ? sessionMemberClients(state, session) : [];

  const frame = 'border-b hairline p-1';

  if (!session || members.length === 0) {
    return (
      <div className={frame}>
        <button
          type="button"
          onClick={onPick}
          disabled={locked}
          aria-label={`Book ${therapist.name} at ${slotClock(slot)}`}
          className={`w-full ${CELL_H} rounded-[10px] grid place-items-center text-[0.75rem] transition ${
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

  const room = describeRoom(state, session, members);

  if (session.status === 'active') {
    return (
      <div className={frame}>
        <LiveCell sessionId={session.id} room={room} focus={session.focus} />
      </div>
    );
  }

  if (session.status === 'done' || session.status === 'missed') {
    return (
      <div className={frame}>
        <DoneCell session={session} room={room} />
      </div>
    );
  }

  return (
    <div className={frame}>
      <BookedCell state={state} session={session} room={room} calm={calm} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// What kind of hour is this?
//
// Every cell state needs the same four facts, and working them out twice is how
// the grid and the roster end up disagreeing about who is in the room.
// ─────────────────────────────────────────────────────────────────────────────

interface Room {
  members: Client[];
  /** More than one case in the room — a group, not a couple. */
  isRoom: boolean;
  /** Whoever the hour will move at the pace of. Never undefined: rooms aren't empty. */
  pacer: Client;
  /** The cell's first line. */
  title: string;
  /** The cell's second line: who else is in the room, or the presenting problem. */
  sub: string;
  /** Partners named on the case record — a couples or family case's other people. */
  partners: string[];
}

function describeRoom(state: GameState, session: ScheduledSession, members: Client[]): Room {
  const pacer = sessionPacer(state, session) ?? members[0];
  const isRoom = members.length > 1;
  const first = members[0];
  const partners = first.partnerHandles ?? [];

  if (isRoom) {
    return {
      members,
      isRoom,
      pacer,
      title: roomTitle('group', members.length),
      sub: joinHandles(members.map((m) => m.handle)),
      partners: [],
    };
  }
  return {
    members,
    isRoom,
    pacer,
    title: first.handle,
    sub: partners.length
      ? `with ${andList(partners)}`
      : CONDITION_LABELS[first.condition],
    partners,
  };
}

/** Subscribes to its own session progress so the ring moves without redrawing the grid. */
function LiveCell({ sessionId, room, focus }: { sessionId: string; room: Room; focus: SessionFocus }) {
  const t = useSim((s) => s.schedule.find((x) => x.id === sessionId)?.t ?? 0);
  const minutesLeft = Math.max(0, Math.ceil((1 - t) * SESSION_MINUTES));
  return (
    <div
      className={`w-full ${CELL_H} rounded-[10px] px-2 py-1.5 flex items-center gap-2`}
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
        <div className="text-[0.78rem] font-bold text-ink truncate">{room.title}</div>
        <div className="text-[0.62rem] text-ink-soft leading-tight truncate">
          {room.isRoom || room.partners.length ? room.sub : 'In the room'}
        </div>
        <div className="tabular text-[0.64rem] text-ink-faint">{minutesLeft} min left</div>
      </div>
    </div>
  );
}

/**
 * A finished hour. A room gets one dot per person rather than one grade word:
 * five people moved five different distances, and picking one of them to print
 * would be exactly the partial figure the game promises never to show.
 */
function DoneCell({ session, room }: { session: ScheduledSession; room: Room }) {
  const results = session.results ?? (session.result ? [session.result] : []);
  const missed = session.status === 'missed';

  return (
    <div className={`w-full ${CELL_H} rounded-[10px] paper-flat px-2 py-1.5 flex flex-col justify-between opacity-70`}>
      <div>
        <div className="text-[0.78rem] font-bold text-ink truncate">{room.title}</div>
        {room.isRoom || room.partners.length ? (
          <div className="text-[0.62rem] text-ink-faint truncate">{room.sub}</div>
        ) : null}
      </div>
      <div className="text-[0.66rem] text-ink-faint truncate">
        {missed ? 'Never happened' : `${FOCUSES[session.focus].icon} ${FOCUSES[session.focus].name}`}
      </div>
      {room.isRoom && results.length > 1 ? (
        <div className="flex items-center gap-1 flex-wrap">
          {results.map((r) => {
            const handle = room.members.find((m) => m.id === r.clientId)?.handle ?? '—';
            return (
              <span
                key={r.clientId}
                className="w-2 h-2 rounded-full shrink-0"
                title={`${handle} — ${GRADE_WORD[r.grade]}`}
                style={{
                  background: GRADE_COLOR[r.grade],
                  boxShadow: `0 0 0 2px color-mix(in oklab, ${GRADE_COLOR[r.grade]} 22%, transparent)`,
                }}
              />
            );
          })}
          <span className="text-[0.6rem] text-ink-faint ml-0.5">{results.length} seen</span>
        </div>
      ) : (
        <div
          className="text-[0.7rem] font-extrabold uppercase tracking-[0.06em]"
          style={{ color: session.result ? GRADE_COLOR[session.result.grade] : 'var(--color-ink-faint)' }}
        >
          {session.result ? GRADE_WORD[session.result.grade] : missed ? '—' : 'Done'}
        </div>
      )}
    </div>
  );
}

function BookedCell({
  state,
  session,
  room,
  calm,
}: {
  state: GameState;
  session: ScheduledSession;
  room: Room;
  calm: boolean;
}) {
  const dispatch = useDispatch();
  const [rosterOpen, setRosterOpen] = useState(false);
  const rosterAnchor = useRef<HTMLButtonElement | null>(null);

  // The pace-setter is who the sim will build the technique cards for and who
  // the regression roll is read from, so the risk shown is theirs.
  const pacer = room.pacer;
  const safety = focusSafety(pacer, session.focus);
  const riskPct = Math.round(regressionChance(state, pacer, session.focus) * 100);
  const typeColor = SESSION_TYPE_COLOR[session.type];

  return (
    <div
      className={`w-full ${CELL_H} rounded-[10px] card-warm px-2 py-1.5 flex flex-col justify-between ${
        calm ? '' : 'pop-in'
      }`}
      style={
        session.type === 'individual'
          ? undefined
          : { borderColor: `color-mix(in oklab, ${typeColor} 42%, transparent)` }
      }
    >
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          {room.isRoom ? (
            <button
              ref={rosterAnchor}
              type="button"
              onClick={() => setRosterOpen((v) => !v)}
              aria-expanded={rosterOpen}
              aria-label={`${room.title} at ${slotClock(session.slot)} — see who is in it`}
              // A shade smaller than a name: "Room of four" has to survive in a
              // column 8.5rem wide, and truncating away the count is worse than
              // truncating a name the line below already carries.
              className="text-[0.74rem] font-bold text-ink truncate w-full text-left rounded-[4px] hover:text-amber-deep transition focus-visible:outline-2 focus-visible:outline-amber"
            >
              <span aria-hidden style={{ color: typeColor }}>
                ◎{' '}
              </span>
              {room.title}
            </button>
          ) : (
            <div
              className="text-[0.78rem] font-bold text-ink truncate"
              title={`${room.members[0].handle}, ${room.members[0].age}`}
            >
              {session.type !== 'individual' ? (
                <span aria-hidden style={{ color: typeColor }}>
                  🤝{' '}
                </span>
              ) : null}
              {room.title}
            </div>
          )}
          <div
            className="text-[0.62rem] truncate"
            style={{
              color:
                room.isRoom || room.partners.length
                  ? `color-mix(in oklab, ${typeColor} 78%, var(--color-ink))`
                  : 'var(--color-ink-faint)',
            }}
            title={room.sub}
          >
            {room.sub}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'UNBOOK_SESSION', sessionId: session.id })}
          aria-label={
            room.isRoom
              ? `Clear the ${slotClock(session.slot)} room — all ${countWord(room.members.length)} of them`
              : `Unbook ${room.members[0].handle} from ${slotClock(session.slot)}`
          }
          title={room.isRoom ? 'Cancel the whole hour' : 'Take this hour back'}
          className="shrink-0 w-4 h-4 grid place-items-center rounded-full text-[0.6rem] text-ink-faint hover:text-brick hover:bg-[color-mix(in_oklab,var(--color-brick)_14%,transparent)] transition"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex gap-0.5" role="group" aria-label={`Focus for ${room.title}`}>
          {focusOptions.map((f) => {
            const on = session.focus === f;
            const fRisk = Math.round(regressionChance(state, pacer, f) * 100);
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
              <strong>{riskPct}%</strong> chance {pacer.handle} loses ground this hour. They are at{' '}
              {Math.round(pacer.stability * 100)}% stability; {FOCUSES[session.focus].name} wants{' '}
              {Math.round(FOCUSES[session.focus].safeStability * 100)}%.
              {room.isRoom ? (
                <>
                  {' '}
                  They are the least steady person in the room, so the room moves at their pace.
                </>
              ) : null}
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

      {rosterOpen && room.isRoom ? (
        <RosterPopover
          state={state}
          session={session}
          room={room}
          anchor={rosterAnchor.current}
          onClose={() => {
            setRosterOpen(false);
            rosterAnchor.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The roster — who is in this room, and who else could be
//
// Portalled to document.body: the grid scrolls horizontally and clips its
// overflow, so a popover rendered inside a cell is sliced off at the column
// edge. Positioned with placeAnchored, which flips and clamps to the viewport.
// ─────────────────────────────────────────────────────────────────────────────

function RosterPopover({
  state,
  session,
  room,
  anchor,
  onClose,
}: {
  state: GameState;
  session: ScheduledSession;
  room: Room;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setCoords(
      placeAnchored(
        { left: a.left, top: a.top, width: a.width, height: a.height },
        { width: box.width, height: box.height },
        'bottom',
        { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight },
      ),
    );
  }, [anchor]);

  useLayoutEffect(place, [place, room.members.length]);

  /**
   * Follows its cell rather than closing when the page moves. A tooltip can
   * afford to vanish on scroll; this one cannot — clicking a cell near the edge
   * of the grid scrolls it into view, and closing on that would mean the popover
   * shut itself the instant it was asked for. Escape and a click outside are the
   * ways out.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [onClose, place]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  if (typeof document === 'undefined') return null;

  const seats = GROUP_MAX_MEMBERS - room.members.length;
  const waiting = activeClients(state)
    .filter((c) => c.sessionType === 'group' && !clientBooked(state, c.id))
    .sort((a, b) => clientPriority(state, b) - clientPriority(state, a));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[89]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={`Who is in the ${slotClock(session.slot)} room`}
        className="paper fixed z-[90] w-[19rem] max-h-[60vh] overflow-y-auto outline-none"
        style={{
          left: coords ? coords.left : 0,
          top: coords ? coords.top : 0,
          visibility: coords ? 'visible' : 'hidden',
        }}
      >
        <div className="px-3 pt-2.5 pb-2">
          <div className="display text-[0.95rem] text-ink leading-tight">
            {roomTitle('group', room.members.length)}, {slotClock(session.slot)}
          </div>
          <p className="text-[0.7rem] text-ink-faint leading-snug mt-0.5">
            <strong className="text-ink-soft">{room.pacer.handle}</strong> is the least steady person
            here, so the hour moves at their pace and the technique is chosen for them.
          </p>
        </div>

        <ul className="px-2 pb-2 flex flex-col gap-1">
          {room.members.map((c) => (
            <li key={c.id} className="paper-flat px-2 py-1.5 flex items-center gap-2">
              <Portrait seed={c.portrait} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[0.8rem] font-bold text-ink truncate">{c.handle}</span>
                  <span className="tabular text-[0.66rem] text-ink-faint">{c.age}</span>
                  {c.id === room.pacer.id ? (
                    <span className="text-[0.58rem] font-extrabold uppercase tracking-[0.08em] text-amber-deep">
                      sets the pace
                    </span>
                  ) : null}
                </div>
                <div className="text-[0.66rem] text-ink-faint leading-snug truncate">
                  {CONDITION_LABELS[c.condition]} · {stabilityLabel(c.stability).toLowerCase()}
                </div>
              </div>
              <Button
                size="sm"
                aria-label={`Excuse ${c.handle} from the ${slotClock(session.slot)} room`}
                onClick={() =>
                  dispatch({ type: 'LEAVE_GROUP_SESSION', sessionId: session.id, clientId: c.id })
                }
                title={
                  room.members.length <= GROUP_MIN_MEMBERS
                    ? 'A circle needs two. Taking this chair back calls the whole hour off.'
                    : `${c.handle} keeps the day free; everyone else still meets.`
                }
              >
                Excuse
              </Button>
            </li>
          ))}
        </ul>

        <div className="px-3 pb-3 pt-1 border-t hairline">
          {seats <= 0 ? (
            <p className="text-[0.7rem] text-ink-faint leading-snug">
              Six is as many as one room holds. Any more and there is not enough of you to go round.
            </p>
          ) : waiting.length === 0 ? (
            <p className="text-[0.7rem] text-ink-faint leading-snug">
              Nobody else is waiting for a group hour — {countWord(seats)} chair
              {seats === 1 ? '' : 's'} still empty, and that is fine.
            </p>
          ) : (
            <>
              <div className="text-[0.58rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint mb-1.5">
                Room for {countWord(seats)} more
              </div>
              <ul className="flex flex-col gap-1">
                {waiting.slice(0, seats).map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <Portrait seed={c.portrait} size={24} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[0.76rem] font-bold text-ink">{c.handle}</span>{' '}
                      <span className="text-[0.66rem] text-ink-faint">
                        {CONDITION_LABELS[c.condition]}
                      </span>
                    </div>
                    <Button
                      variant="sage"
                      size="sm"
                      aria-label={`Seat ${c.handle} in the ${slotClock(session.slot)} room`}
                      onClick={() =>
                        dispatch({
                          type: 'BOOK_GROUP_SESSION',
                          clientIds: [c.id],
                          therapistId: session.therapistId,
                          slot: session.slot,
                        })
                      }
                    >
                      Seat them
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
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

  // A group case cannot be seen alone — the sim opens a room around them and
  // seats whoever else is waiting. Below the minimum there is no room to open
  // and the action would quietly do nothing, so the row says so instead.
  const groupWaiting = queue.filter((c) => c.sessionType === 'group').length;
  const roomOpens = Math.min(groupWaiting, GROUP_MAX_MEMBERS);
  const canOpenRoom = groupWaiting >= GROUP_MIN_MEMBERS;

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
              const isGroup = c.sessionType === 'group';
              const blocked = isGroup && !canOpenRoom;
              const partners = c.partnerHandles ?? [];
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => onChoose(c.id, focus)}
                    title={
                      blocked
                        ? `A group needs at least ${countWord(GROUP_MIN_MEMBERS)} people. Only ${c.handle} is waiting for one.`
                        : undefined
                    }
                    className={`w-full text-left paper-flat px-2.5 py-2 flex items-start gap-2.5 transition focus-visible:outline-2 focus-visible:outline-amber ${
                      blocked ? 'opacity-55 cursor-not-allowed' : 'hover:brightness-[1.03]'
                    }`}
                  >
                    <Portrait seed={c.portrait} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[0.86rem] font-bold text-ink">{c.handle}</span>
                        <span className="tabular text-[0.7rem] text-ink-faint">{c.age}</span>
                        <RiskDot level={riskBadge(state, c)} />
                        <SessionTypeChip type={c.sessionType} partners={partners} />
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
                      {/* What this click will actually do, when it is not simply
                          "book this person" — the sim opens a whole room for a
                          group case and seats everyone else who is waiting. */}
                      {isGroup ? (
                        <div
                          className="text-[0.68rem] leading-snug mt-0.5"
                          style={{
                            color: blocked
                              ? 'var(--color-brick)'
                              : `color-mix(in oklab, ${SESSION_TYPE_COLOR.group} 80%, var(--color-ink))`,
                          }}
                        >
                          {blocked
                            ? `Nobody else is waiting for a group. A room needs ${countWord(GROUP_MIN_MEMBERS)}.`
                            : `Opens a room and seats ${countWord(roomOpens)} — everyone waiting for a group hour.`}
                        </div>
                      ) : partners.length ? (
                        <div
                          className="text-[0.68rem] leading-snug mt-0.5"
                          style={{
                            color: `color-mix(in oklab, ${SESSION_TYPE_COLOR[c.sessionType]} 80%, var(--color-ink))`,
                          }}
                        >
                          Comes in with {andList(partners)} — one hour, {countWord(partners.length + 1)}{' '}
                          people in it.
                        </div>
                      ) : null}
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
