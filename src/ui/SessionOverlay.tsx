import { useCallback, useEffect, useRef, useState } from 'react';
import { CONDITION_LABELS, FOCUSES, SEVERITY_LABELS } from '../sim/balance';
import { rapportLabel, stabilityLabel } from '../sim/scheduler';
import { CHAPTER_LABEL, sessionMemberClients } from '../sim/session';
import { modalityById } from '../content';
import type { GameState, PortraitSeed, SessionFocus, SessionType, TechniqueCard } from '../sim/types';
import { useDispatch, useSim, useSimShallow } from '../store';
import { Chip, Modal } from './primitives';
import { Portrait } from './Portrait';
import { SESSION_TYPE_COLOR, SessionTypeChip, andList, countWord, roomTitle } from './rooms';

/**
 * The decision beat — fired mid-session, roughly 55% of the way through the
 * hour. Everything the player needs is on the table: how steady this person is,
 * how much trust there is to spend, what today's focus asks of them, and for
 * each card the honest preview the sim already computed.
 *
 * No numbers are invented here. Every hint comes from `pending.techniqueCards`,
 * which the sim built with the same functions that will resolve the session.
 */

const EMPTY_CARDS: TechniqueCard[] = [];

const QUALITY_HINT: Record<
  TechniqueCard['preview']['qualityHint'],
  { word: string; steps: number; color: string }
> = {
  strong: { word: 'Strong fit', steps: 4, color: 'var(--color-sage-deep)' },
  solid: { word: 'Solid', steps: 3, color: 'var(--color-ink-soft)' },
  risky: { word: 'Risky', steps: 2, color: 'var(--color-amber-deep)' },
  poor: { word: 'Poor fit', steps: 1, color: 'var(--color-brick)' },
};

/** The card lifts and lights up before the room moves on. */
const CHOOSE_BEAT_MS = 190;

/** Openings for a client who brought nothing new in today. Stable per client/day. */
const NEUTRAL_OPENINGS = [
  'They took the same chair as always and let the room settle.',
  'Nothing new to report, they said — and then said more.',
  'They arrived with the whole week still on them.',
  'A little weather talk, then a longer pause than usual.',
  'They came in already halfway through a sentence.',
  'They sat down, looked at the lamp, and waited for you to start.',
];

function openingFor(clientId: string, day: number): string {
  let h = (day * 2654435761) >>> 0;
  for (let i = 0; i < clientId.length; i++) h = (Math.imul(h, 33) + clientId.charCodeAt(i)) >>> 0;
  return NEUTRAL_OPENINGS[h % NEUTRAL_OPENINGS.length];
}

/** Presentation tint for the sim's authored preview notes. */
function noteTone(note: string): 'good' | 'bad' | 'neutral' {
  const n = note.toLowerCase();
  if (n.includes('poor fit') || n.includes('wrong moment') || n.includes('needs more stability')) return 'bad';
  if (
    n.includes('well suited') ||
    n.startsWith('builds') ||
    n.includes('steadying') ||
    n.includes('open something')
  )
    return 'good';
  return 'neutral';
}

interface RoomContext {
  instanceId: string;
  cards: TechniqueCard[];
  focus: SessionFocus;
  day: number;
  sessionType: SessionType;
  /** Cases in the room. 1 for everything but a group. */
  roomSize: number;
  /** Everyone else in the room, `|`-joined so the shallow compare holds. */
  roomOthers: string;
  /** Companions on this case record — the other half of a couple, the family. */
  partners: string;
  hasClient: boolean;
  clientPortrait?: PortraitSeed;
  clientHandle: string;
  clientAge: number;
  clientCondition: string;
  clientSeverity: string;
  clientChapter: string;
  clientStability: number;
  clientRapport: number;
  broughtIn: string;
  broughtInIsToday: boolean;
  therapistPortrait?: PortraitSeed;
  therapistName: string;
  therapistModality: string;
  therapistEnergyPct: number;
}

/**
 * The cards are the part that must never fail to render — a pending decision
 * with no way to answer it would stop the clock for good — so a missing client
 * or therapist degrades the header rather than blanking the screen.
 */
function selectRoom(s: GameState): RoomContext | null {
  const pending = s.pendingEvents.find((p) => p.techniqueCards && p.techniqueCards.length > 0);
  if (!pending || !pending.techniqueCards) return null;
  const c = s.clients.find((x) => x.id === pending.clientId);
  const t = s.therapists.find((x) => x.id === pending.therapistId);
  const session = s.schedule.find((x) => x.id === pending.sessionId);
  const latest = c?.story[0];
  const isToday = !!latest && latest.day === s.day;
  // A group's decision beat belongs to the pacer, so `pending.clientId` is one
  // chair of several. The rest of the room is named rather than left implied.
  const members = session ? sessionMemberClients(s, session) : [];
  return {
    instanceId: pending.instanceId,
    cards: pending.techniqueCards,
    focus: session?.focus ?? 'build_skills',
    day: s.day,
    sessionType: session?.type ?? c?.sessionType ?? 'individual',
    roomSize: Math.max(1, members.length),
    roomOthers: members
      .filter((m) => m.id !== pending.clientId)
      .map((m) => m.handle)
      .join('|'),
    partners: (c?.partnerHandles ?? []).join('|'),
    hasClient: !!c,
    clientPortrait: c?.portrait,
    clientHandle: c?.handle ?? 'Your client',
    clientAge: c?.age ?? 0,
    clientCondition: c ? CONDITION_LABELS[c.condition] : '',
    clientSeverity: c ? SEVERITY_LABELS[c.severity] ?? '' : '',
    clientChapter: c ? CHAPTER_LABEL[c.chapter] : '',
    clientStability: c?.stability ?? 0,
    clientRapport: c?.rapport ?? 0,
    broughtIn: isToday && latest ? latest.text : openingFor(c?.id ?? pending.instanceId, s.day),
    broughtInIsToday: isToday,
    therapistPortrait: t?.portrait,
    therapistName: t?.name ?? 'The therapist',
    therapistModality: t ? modalityById[t.modality]?.name ?? t.modality : '',
    therapistEnergyPct: t ? t.energy / Math.max(1, t.maxEnergy) : 1,
  };
}

export function SessionOverlay() {
  const dispatch = useDispatch();
  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const ctx = useSimShallow(selectRoom);

  const cards = ctx?.cards ?? EMPTY_CARDS;
  const instanceId = ctx?.instanceId ?? '';

  const [focusIndex, setFocusIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [chosenId, setChosenId] = useState('');
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusRef = useRef(0);
  const chosen = useRef('');

  // Fresh deck, fresh focus.
  useEffect(() => {
    if (!instanceId) return;
    chosen.current = '';
    focusRef.current = 0;
    setFocusIndex(0);
    setActiveIndex(0);
    setChosenId('');
    const id = window.setTimeout(() => buttons.current[0]?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [instanceId]);

  const choose = useCallback(
    (techniqueId: string) => {
      if (!instanceId || chosen.current) return;
      chosen.current = techniqueId;
      setChosenId(techniqueId);
      // Deliberately not cleaned up on unmount: this dispatch is the only thing
      // that restarts the clock, so it must land even if the tree changes.
      window.setTimeout(
        () => dispatch({ type: 'CHOOSE_TECHNIQUE', instanceId, techniqueId }),
        calm ? 0 : CHOOSE_BEAT_MS,
      );
    },
    [calm, dispatch, instanceId],
  );

  const move = useCallback(
    (delta: number) => {
      const len = cards.length;
      if (!len) return;
      const next = (focusRef.current + delta + len) % len;
      focusRef.current = next;
      setFocusIndex(next);
      setActiveIndex(next);
      buttons.current[next]?.focus();
    },
    [cards.length],
  );

  useEffect(() => {
    if (!instanceId || !cards.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= cards.length) {
        e.preventDefault();
        choose(cards[n - 1].techniqueId);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [instanceId, cards, choose, move]);

  if (!ctx || !cards.length) return null;

  const focusProfile = FOCUSES[ctx.focus];
  const whisper = cards[activeIndex]?.flavor ?? cards[focusIndex]?.flavor ?? '';
  const others = ctx.roomOthers ? ctx.roomOthers.split('|') : [];
  const partners = ctx.partners ? ctx.partners.split('|') : [];

  return (
    <Modal width={764} dismissable={false} labelledBy="session-overlay-title">
      {/* ── Who is in the room ─────────────────────────────────────────────── */}
      <header className="tt-session-head px-5 pt-2.5 pb-2.5">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 id="session-overlay-title" className="display text-[1.32rem] leading-none text-ink">
            In the room
          </h2>
          <span className="text-[0.6rem] font-extrabold uppercase tracking-[0.15em] text-ink-faint">
            Day {ctx.day} · the middle of the hour
          </span>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {ctx.clientPortrait ? (
              <Portrait
                seed={ctx.clientPortrait}
                size={44}
                glow
                mood={ctx.clientStability < 0.35 ? 'sad' : 'neutral'}
                title={`${ctx.clientHandle}, age ${ctx.clientAge}`}
              />
            ) : null}
            <div className="min-w-0">
              <div className="display text-[0.96rem] leading-tight text-ink truncate">
                {ctx.clientHandle}
                {ctx.hasClient ? <span className="text-ink-faint font-normal"> · {ctx.clientAge}</span> : null}
              </div>
              {ctx.hasClient ? (
                <div className="text-[0.71rem] text-ink-soft leading-tight truncate">
                  {ctx.clientSeverity} {ctx.clientCondition}
                  <span className="text-ink-faint"> · {ctx.clientChapter}</span>
                </div>
              ) : null}
              {others.length || partners.length ? (
                <div
                  className="text-[0.68rem] leading-tight truncate"
                  style={{
                    color: `color-mix(in oklab, ${SESSION_TYPE_COLOR[ctx.sessionType]} 78%, var(--color-ink))`,
                  }}
                  title={andList(others.length ? others : partners)}
                >
                  <span aria-hidden>{others.length ? '◎' : '🤝'}</span> with{' '}
                  {andList(others.length ? others : partners)}
                </div>
              ) : null}
            </div>
          </div>

          {/* the candle between them */}
          <div className="flex items-center gap-2 px-1 shrink-0 w-[132px]" aria-hidden>
            <div className="h-px flex-1" style={{ background: STITCH }} />
            <span className={`text-[0.92rem] leading-none ${calm ? '' : 'animate-flicker'}`}>🕯️</span>
            <div className="h-px flex-1" style={{ background: STITCH }} />
          </div>

          <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end text-right">
            <div className="min-w-0">
              <div className="display text-[0.96rem] leading-tight text-ink truncate">{ctx.therapistName}</div>
              <div className="text-[0.71rem] text-ink-soft leading-tight truncate">{ctx.therapistModality}</div>
            </div>
            {ctx.therapistPortrait ? (
              <Portrait
                seed={ctx.therapistPortrait}
                size={44}
                mood={ctx.therapistEnergyPct < 0.3 ? 'tired' : 'neutral'}
                title={ctx.therapistName}
              />
            ) : null}
          </div>
        </div>
      </header>

      {/* ── What the hour is asking for ────────────────────────────────────── */}
      <div className="px-5 pb-2.5">
        <div className="paper-flat px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {ctx.hasClient ? (
              <>
                <Chip
                  color={ctx.clientStability > 0.55 ? 'var(--color-sage)' : 'var(--color-brick)'}
                  title={`Stability ${Math.round(ctx.clientStability * 100)}%`}
                >
                  🫀 {stabilityLabel(ctx.clientStability)}
                </Chip>
                <Chip
                  color={ctx.clientRapport > 0.5 ? 'var(--color-sage)' : 'var(--color-amber-deep)'}
                  title={`Rapport ${Math.round(ctx.clientRapport * 100)}%`}
                >
                  🤝 {rapportLabel(ctx.clientRapport)}
                </Chip>
              </>
            ) : null}
            <Chip color={focusProfile.color}>
              {focusProfile.icon} {focusProfile.name}
            </Chip>
            {ctx.roomSize > 1 ? (
              <Chip
                color={SESSION_TYPE_COLOR.group}
                title={`${ctx.clientHandle} and ${andList(others)} share this hour.`}
              >
                ◎ {roomTitle('group', ctx.roomSize)}
              </Chip>
            ) : (
              <SessionTypeChip type={ctx.sessionType} partners={partners} />
            )}
            <span className="text-[0.73rem] text-ink-faint leading-snug min-w-0">{focusProfile.blurb}</span>
          </div>
          <p className="text-[0.85rem] text-ink-soft leading-[1.5] mt-1.5 italic">
            <span className="not-italic text-[0.58rem] font-extrabold uppercase tracking-[0.13em] text-ink-faint mr-1.5 align-[0.1em]">
              {ctx.broughtInIsToday ? 'Today' : 'The room'}
            </span>
            {ctx.broughtIn}
          </p>
          {/* In a circle the cards were built for one person — the sim says so on
              every card, and this says why, before the player reads them. */}
          {ctx.roomSize > 1 ? (
            <p
              className="text-[0.75rem] leading-snug mt-1"
              style={{
                color: `color-mix(in oklab, ${SESSION_TYPE_COLOR.group} 76%, var(--color-ink))`,
              }}
            >
              You are choosing for <strong>{ctx.clientHandle}</strong>, the least steady person here —
              a room does not go anywhere the shakiest person in it cannot follow. The hour lands on
              all {countWord(ctx.roomSize)} of them.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── The deck ───────────────────────────────────────────────────────── */}
      <div className="px-5 pb-1.5">
        <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-ink-faint mb-1.5">
          What do you reach for?{' '}
          <span className="normal-case tracking-normal font-bold text-ink-faint/75">
            Press 1–{cards.length}, or move with the arrow keys.
          </span>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 auto-rows-fr"
          role="group"
          aria-label="Technique choices"
        >
          {cards.map((card, i) => (
            <TechniqueCardFace
              key={card.techniqueId}
              card={card}
              index={i}
              focused={focusIndex === i}
              calm={calm}
              chosen={chosenId === card.techniqueId}
              dimmed={!!chosenId && chosenId !== card.techniqueId}
              wide={cards.length % 2 === 1 && i === cards.length - 1}
              onChoose={() => choose(card.techniqueId)}
              onActivate={() => setActiveIndex(i)}
              onFocus={() => {
                focusRef.current = i;
                setFocusIndex(i);
                setActiveIndex(i);
              }}
              buttonRef={(el) => {
                buttons.current[i] = el;
              }}
            />
          ))}
        </div>
      </div>

      {/* ── The whisper ────────────────────────────────────────────────────── */}
      <footer className="px-5 pt-1.5 pb-3">
        <div
          className="pt-2 min-h-[1.75rem] flex items-center justify-center"
          style={{
            backgroundImage: WHISPER_RULE,
            backgroundRepeat: 'no-repeat',
            backgroundSize: '100% 1px',
          }}
        >
          <p className="display italic text-[0.82rem] text-ink-faint text-center leading-snug max-w-[62ch]">
            {whisper ? `“${whisper}”` : 'Whatever you choose, the hour is already half gone.'}
          </p>
        </div>
      </footer>
    </Modal>
  );
}

const STITCH =
  'repeating-linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 24%, transparent) 0 4px, transparent 4px 8px)';

const WHISPER_RULE =
  'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-ink) 14%, transparent) 22%, color-mix(in oklab, var(--color-ink) 14%, transparent) 78%, transparent 100%)';

// ─────────────────────────────────────────────────────────────────────────────

function TechniqueCardFace({
  card,
  index,
  focused,
  calm,
  chosen,
  dimmed,
  wide,
  onChoose,
  onActivate,
  onFocus,
  buttonRef,
}: {
  card: TechniqueCard;
  index: number;
  focused: boolean;
  calm: boolean;
  chosen: boolean;
  dimmed: boolean;
  wide: boolean;
  onChoose: () => void;
  onActivate: () => void;
  onFocus: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const modality = modalityById[card.modality];
  const color = modality?.color ?? 'var(--color-ink-soft)';
  const hint = QUALITY_HINT[card.preview.qualityHint];
  const regPct = Math.round(card.preview.regressionChance * 100);
  const risky = card.preview.regressionChance > 0.2;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onChoose}
      onMouseEnter={onActivate}
      onFocus={onFocus}
      tabIndex={0}
      aria-keyshortcuts={String(index + 1)}
      className={[
        'card-warm tt-hand tt-card relative text-left overflow-hidden p-0 focus:outline-none',
        wide ? 'sm:col-span-2' : '',
        calm ? '' : 'tt-card-lift tt-deal',
        chosen ? 'tt-card-chosen' : '',
        dimmed ? 'tt-card-faded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        // Alternating tilt so the deck reads as hand-laid rather than snapped
        // to a grid. Purely a hover transform — nothing animates at rest.
        ['--tt-tilt' as string]: index % 2 === 0 ? '-0.55deg' : '0.55deg',
        animationDelay: calm ? undefined : `${index * 55}ms`,
        boxShadow: focused && !chosen ? `0 0 0 2px var(--color-amber), var(--tt-shadow-2)` : undefined,
      }}
    >
      {/* the modality spine, lit from the top */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[5px]"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${color} 62%, white) 0%, ${color} 34%, color-mix(in oklab, ${color} 82%, black) 100%)`,
          boxShadow: `1px 0 0 color-mix(in oklab, ${color} 34%, transparent), 2px 0 6px -2px color-mix(in oklab, ${color} 40%, transparent)`,
        }}
      />

      <div className="pl-[0.95rem] pr-3 pt-2 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className="text-[0.56rem] font-extrabold uppercase tracking-[0.12em] truncate"
              style={{ color: `color-mix(in oklab, ${color} 72%, var(--color-ink))` }}
            >
              {modality?.name ?? card.modality}
            </div>
            <h3 className="display text-[1.02rem] leading-[1.15] text-ink mt-[1px]">{card.name}</h3>
          </div>
          <span
            className="tabular shrink-0 w-[18px] h-[18px] grid place-items-center rounded-[5px] text-[0.64rem] font-bold"
            style={{
              background: 'color-mix(in oklab, var(--color-ink) 7%, transparent)',
              color: 'var(--color-ink-faint)',
              boxShadow:
                'inset 0 0 0 1px color-mix(in oklab, var(--color-ink) 15%, transparent), inset 0 1px 0 rgba(255,253,246,0.7)',
            }}
            aria-hidden
          >
            {index + 1}
          </span>
        </div>

        <p className="text-[0.73rem] text-ink-soft leading-[1.35] mt-1 line-clamp-2">{card.blurb}</p>

        {/* ── Fit: the loudest thing on the card ──────────────────────────── */}
        <div
          className="mt-1.5 inline-flex w-fit items-center gap-2 rounded-[8px] px-2 py-[4px]"
          style={{
            background: `color-mix(in oklab, ${hint.color} 12%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${hint.color} 32%, transparent), inset 0 1px 0 rgba(255,253,246,0.55)`,
          }}
        >
          <span className="flex items-center gap-[3px] shrink-0" aria-hidden>
            {[0, 1, 2, 3].map((s) => (
              <span
                key={s}
                className="block w-[11px] h-[6px] rounded-full"
                style={
                  s < hint.steps
                    ? {
                        background: `linear-gradient(180deg, color-mix(in oklab, ${hint.color} 55%, white) 0%, ${hint.color} 100%)`,
                        boxShadow: `0 1px 1px -1px ${hint.color}`,
                      }
                    : {
                        background: 'color-mix(in oklab, var(--color-ink) 11%, transparent)',
                        boxShadow: 'inset 0 1px 1px color-mix(in oklab, var(--color-ink) 16%, transparent)',
                      }
                }
              />
            ))}
          </span>
          <span
            className="text-[0.82rem] font-extrabold leading-none tracking-[-0.005em]"
            style={{ color: hint.color, textShadow: '0 1px 0 rgba(255,253,246,0.7)' }}
          >
            {hint.word}
          </span>
        </div>

        {/* ── Preview — every figure exactly as the sim gave it ───────────── */}
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <PreviewCell label="Progress" value={card.preview.progressHint} color="var(--color-sage-deep)" />
          <PreviewCell label="Energy" value={`−${card.preview.energyCost}`} color="var(--color-plum-deep)" />
          <PreviewCell
            label="Regression"
            value={`${regPct}%`}
            color={risky ? 'var(--color-brick)' : 'var(--color-ink-soft)'}
            warn={risky}
          />
        </div>

        {card.preview.notes.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-[2px]">
            {card.preview.notes.map((note) => {
              const tone = noteTone(note);
              const dot =
                tone === 'bad'
                  ? 'var(--color-brick)'
                  : tone === 'good'
                    ? 'var(--color-sage-deep)'
                    : 'var(--color-ink-faint)';
              return (
                <li key={note} className="flex items-baseline gap-1 text-[0.67rem] leading-[1.3]">
                  <span
                    className="translate-y-[-1px] w-[5px] h-[5px] rounded-full shrink-0"
                    style={{ background: dot }}
                    aria-hidden
                  />
                  <span style={{ color: tone === 'bad' ? 'var(--color-brick)' : 'var(--color-ink-soft)' }}>
                    {note}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </button>
  );
}

function PreviewCell({
  label,
  value,
  color,
  warn,
}: {
  label: string;
  value: string;
  color: string;
  warn?: boolean;
}) {
  return (
    <div
      className="rounded-[7px] px-1.5 py-[3px]"
      style={
        warn
          ? {
              background: 'color-mix(in oklab, var(--color-brick) 11%, transparent)',
              boxShadow:
                'inset 0 0 0 1px color-mix(in oklab, var(--color-brick) 28%, transparent), inset 0 1px 0 rgba(255,253,246,0.5)',
            }
          : {
              background: 'color-mix(in oklab, var(--color-paper-deep) 42%, transparent)',
              boxShadow:
                'inset 0 0 0 1px color-mix(in oklab, var(--color-ink) 9%, transparent), inset 0 1px 0 rgba(255,253,246,0.6)',
            }
      }
    >
      <div className="text-[0.52rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint leading-none">
        {label}
      </div>
      <div className="tabular text-[0.76rem] font-bold leading-tight mt-[2px]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
