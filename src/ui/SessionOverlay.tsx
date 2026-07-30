import { useCallback, useEffect, useRef, useState } from 'react';
import { CONDITION_LABELS, FOCUSES, SEVERITY_LABELS } from '../sim/balance';
import { rapportLabel, stabilityLabel } from '../sim/scheduler';
import { CHAPTER_LABEL } from '../sim/session';
import { modalityById } from '../content';
import type { GameState, PortraitSeed, SessionFocus, TechniqueCard } from '../sim/types';
import { useDispatch, useSim, useSimShallow } from '../store';
import { Chip, Modal } from './primitives';
import { Portrait } from './Portrait';

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
  clientPortrait: PortraitSeed;
  clientHandle: string;
  clientAge: number;
  clientCondition: string;
  clientSeverity: string;
  clientChapter: string;
  clientStability: number;
  clientRapport: number;
  broughtIn: string;
  broughtInIsToday: boolean;
  therapistPortrait: PortraitSeed;
  therapistName: string;
  therapistModality: string;
  therapistEnergyPct: number;
}

function selectRoom(s: GameState): RoomContext | null {
  const pending = s.pendingEvents.find((p) => p.techniqueCards && p.techniqueCards.length > 0);
  if (!pending || !pending.techniqueCards) return null;
  const c = s.clients.find((x) => x.id === pending.clientId);
  const t = s.therapists.find((x) => x.id === pending.therapistId);
  if (!c || !t) return null;
  const session = s.schedule.find((x) => x.id === pending.sessionId);
  const latest = c.story[0];
  const isToday = !!latest && latest.day === s.day;
  return {
    instanceId: pending.instanceId,
    cards: pending.techniqueCards,
    focus: session?.focus ?? 'build_skills',
    day: s.day,
    clientPortrait: c.portrait,
    clientHandle: c.handle,
    clientAge: c.age,
    clientCondition: CONDITION_LABELS[c.condition],
    clientSeverity: SEVERITY_LABELS[c.severity] ?? '',
    clientChapter: CHAPTER_LABEL[c.chapter],
    clientStability: c.stability,
    clientRapport: c.rapport,
    broughtIn: isToday && latest ? latest.text : openingFor(c.id, s.day),
    broughtInIsToday: isToday,
    therapistPortrait: t.portrait,
    therapistName: t.name,
    therapistModality: modalityById[t.modality]?.name ?? t.modality,
    therapistEnergyPct: t.energy / Math.max(1, t.maxEnergy),
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
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = useRef('');

  // Fresh deck, fresh focus.
  useEffect(() => {
    if (!instanceId) return;
    chosen.current = '';
    setFocusIndex(0);
    setActiveIndex(0);
    const id = window.setTimeout(() => buttons.current[0]?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [instanceId]);

  const choose = useCallback(
    (techniqueId: string) => {
      if (!instanceId || chosen.current) return;
      chosen.current = techniqueId;
      dispatch({ type: 'CHOOSE_TECHNIQUE', instanceId, techniqueId });
    },
    [dispatch, instanceId],
  );

  const move = useCallback(
    (delta: number) => {
      setFocusIndex((prev) => {
        const next = (prev + delta + cards.length) % Math.max(1, cards.length);
        buttons.current[next]?.focus();
        setActiveIndex(next);
        return next;
      });
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

  return (
    <Modal width={720} dismissable={false} labelledBy="session-overlay-title">
      {/* ── Who is in the room ─────────────────────────────────────────────── */}
      <header className="px-5 pt-4 pb-3.5">
        <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint">
          Day {ctx.day} · the middle of the hour
        </div>
        <h2 id="session-overlay-title" className="display text-[1.5rem] leading-tight text-ink mt-0.5">
          In the room
        </h2>

        <div className="mt-3.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Portrait
              seed={ctx.clientPortrait}
              size={46}
              glow
              mood={ctx.clientStability < 0.35 ? 'sad' : 'neutral'}
              title={`${ctx.clientHandle}, age ${ctx.clientAge}`}
            />
            <div className="min-w-0">
              <div className="display text-[0.98rem] leading-tight text-ink truncate">
                {ctx.clientHandle} <span className="text-ink-faint font-normal">· {ctx.clientAge}</span>
              </div>
              <div className="text-[0.72rem] text-ink-soft leading-tight truncate">
                {ctx.clientSeverity} {ctx.clientCondition}
              </div>
              <div className="mt-1">
                <Chip color="var(--color-amber-deep)">Chapter · {ctx.clientChapter}</Chip>
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-center gap-2 px-1 min-w-[2rem]" aria-hidden>
            <div
              className="h-px flex-1"
              style={{
                background:
                  'repeating-linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 22%, transparent) 0 4px, transparent 4px 8px)',
              }}
            />
            <span className={`text-[0.9rem] leading-none ${calm ? '' : 'animate-flicker'}`}>🕯️</span>
            <div
              className="h-px flex-1"
              style={{
                background:
                  'repeating-linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 22%, transparent) 0 4px, transparent 4px 8px)',
              }}
            />
          </div>

          <div className="flex items-center gap-2.5 min-w-0 text-right">
            <div className="min-w-0">
              <div className="display text-[0.98rem] leading-tight text-ink truncate">{ctx.therapistName}</div>
              <div className="text-[0.72rem] text-ink-soft leading-tight truncate">{ctx.therapistModality}</div>
            </div>
            <Portrait
              seed={ctx.therapistPortrait}
              size={46}
              mood={ctx.therapistEnergyPct < 0.3 ? 'tired' : 'neutral'}
              title={ctx.therapistName}
            />
          </div>
        </div>
      </header>

      {/* ── What the hour is asking for ────────────────────────────────────── */}
      <div className="px-5 pb-3.5">
        <div className="paper-flat px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
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
            <Chip color={focusProfile.color}>
              {focusProfile.icon} {focusProfile.name}
            </Chip>
          </div>
          <p className="text-[0.76rem] text-ink-faint leading-snug mt-1.5">{focusProfile.blurb}</p>
          <p className="text-[0.85rem] text-ink-soft leading-relaxed mt-2 italic">
            <span className="not-italic text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-ink-faint mr-1.5">
              {ctx.broughtInIsToday ? 'Today' : 'The room'}
            </span>
            {ctx.broughtIn}
          </p>
        </div>
      </div>

      {/* ── The deck ───────────────────────────────────────────────────────── */}
      <div className="px-5 pb-2">
        <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-ink-faint mb-2">
          What do you reach for? <span className="text-ink-faint/70">Press 1–{cards.length}, or use the arrow keys.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Technique choices">
          {cards.map((card, i) => (
            <TechniqueCardFace
              key={card.techniqueId}
              card={card}
              index={i}
              focused={focusIndex === i}
              calm={calm}
              onChoose={() => choose(card.techniqueId)}
              onActivate={() => setActiveIndex(i)}
              onFocus={() => {
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
      <footer className="px-5 pt-2 pb-4">
        <div className="border-t hairline pt-2.5 min-h-[2.4rem] flex items-center justify-center">
          <p className="display italic text-[0.82rem] text-ink-faint text-center leading-snug max-w-[62ch]">
            {whisper ? `“${whisper}”` : 'Whatever you choose, the hour is already half gone.'}
          </p>
        </div>
      </footer>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TechniqueCardFace({
  card,
  index,
  focused,
  calm,
  onChoose,
  onActivate,
  onFocus,
  buttonRef,
}: {
  card: TechniqueCard;
  index: number;
  focused: boolean;
  calm: boolean;
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
      className={`card-warm relative text-left overflow-hidden p-0 transition-[transform,box-shadow,filter] duration-200 focus:outline-none ${
        calm ? '' : 'hover:-translate-y-[3px]'
      }`}
      style={{
        boxShadow: focused
          ? `0 0 0 2px var(--color-amber), var(--shadow-lamp)`
          : undefined,
      }}
    >
      {/* modality colour bar */}
      <div className="h-[5px] w-full" style={{ background: color }} aria-hidden />

      <div className="px-3.5 pt-2.5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className="text-[0.58rem] font-extrabold uppercase tracking-[0.11em] truncate"
              style={{ color: `color-mix(in oklab, ${color} 72%, var(--color-ink))` }}
            >
              {modality?.name ?? card.modality}
            </div>
            <h3 className="display text-[1.04rem] leading-tight text-ink mt-0.5">{card.name}</h3>
          </div>
          <span
            className="tabular shrink-0 w-5 h-5 grid place-items-center rounded-md text-[0.68rem] font-bold"
            style={{
              background: 'color-mix(in oklab, var(--color-ink) 8%, transparent)',
              color: 'var(--color-ink-faint)',
              border: '1px solid color-mix(in oklab, var(--color-ink) 14%, transparent)',
            }}
            aria-hidden
          >
            {index + 1}
          </span>
        </div>

        <p className="text-[0.75rem] text-ink-soft leading-snug mt-1.5">{card.blurb}</p>

        {/* ── Preview ─────────────────────────────────────────────────────── */}
        <div
          className="mt-2.5 rounded-[10px] px-2.5 py-2"
          style={{
            background: 'color-mix(in oklab, var(--color-paper-deep) 45%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-ink) 10%, transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.58rem] font-extrabold uppercase tracking-[0.11em] text-ink-faint">Fit</span>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-[3px]" aria-hidden>
                {[0, 1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className="block w-3 h-[5px] rounded-full"
                    style={{
                      background:
                        s < hint.steps ? hint.color : 'color-mix(in oklab, var(--color-ink) 13%, transparent)',
                    }}
                  />
                ))}
              </span>
              <span className="text-[0.72rem] font-bold" style={{ color: hint.color }}>
                {hint.word}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-2">
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
            <ul className="mt-2 space-y-0.5">
              {card.preview.notes.map((note) => {
                const tone = noteTone(note);
                const dot =
                  tone === 'bad'
                    ? 'var(--color-brick)'
                    : tone === 'good'
                      ? 'var(--color-sage-deep)'
                      : 'var(--color-ink-faint)';
                return (
                  <li key={note} className="flex items-start gap-1.5 text-[0.7rem] leading-snug">
                    <span
                      className="mt-[6px] w-[5px] h-[5px] rounded-full shrink-0"
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
      className="rounded-lg px-1.5 py-1"
      style={
        warn
          ? {
              background: 'color-mix(in oklab, var(--color-brick) 12%, transparent)',
              border: '1px solid color-mix(in oklab, var(--color-brick) 26%, transparent)',
            }
          : { background: 'color-mix(in oklab, var(--color-paper) 70%, transparent)' }
      }
    >
      <div className="text-[0.53rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint leading-none">
        {label}
      </div>
      <div className="tabular text-[0.76rem] font-bold leading-tight mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
