import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FOCUSES } from '../sim/balance';
import { bus } from '../sim/bus';
import { CHAPTER_LABEL } from '../sim/session';
import { formatMoney } from '../sim/util';
import type { ArcChapter, GameState, OutcomeGrade, PortraitSeed, SessionResult } from '../sim/types';
import { useSim, useSimShallow, useUi } from '../store';
import { Plant, Portrait } from './Portrait';

/**
 * The end-of-session card. Fifty minutes of somebody's life, accounted for.
 *
 * Every line is read back from the SessionResult the sim produced — the reasons
 * list in particular is rendered in full, including the regression and
 * breakthrough lines, because the game promises never to move a number behind
 * the player's back.
 */

const DURATION_MS = 6000;
const MAX_QUEUE = 8;

/**
 * `tint`/`edge` are how loudly the pill speaks. A breakthrough genuinely glows;
 * a hard hour is quiet brick — it is information, not an alarm.
 */
const GRADE_STYLE: Record<
  OutcomeGrade,
  { label: string; color: string; glow: boolean; tint: number; edge: number }
> = {
  breakthrough: { label: 'Breakthrough', color: 'var(--color-amber-deep)', glow: true, tint: 22, edge: 52 },
  excellent: { label: 'Excellent hour', color: 'var(--color-sage-deep)', glow: false, tint: 15, edge: 38 },
  good: { label: 'Good hour', color: 'var(--color-ink)', glow: false, tint: 9, edge: 24 },
  mixed: { label: 'Mixed hour', color: 'var(--color-plum-deep)', glow: false, tint: 11, edge: 28 },
  poor: { label: 'Hard hour', color: 'var(--color-brick)', glow: false, tint: 8, edge: 22 },
};

/** Half-width of the diverging reason bars, in px. */
const HALF = 30;

const REASON_COLOR: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'var(--color-sage-deep)',
  bad: 'var(--color-brick)',
  neutral: 'var(--color-ink-faint)',
};

interface ClientBits {
  handle: string;
  age: number;
  portrait: PortraitSeed;
  progress: number;
  plant: number;
  chapter: ArcChapter;
}

export function ReflectCard() {
  const [queue, setQueue] = useState<SessionResult[]>([]);
  const [hovered, setHovered] = useState(false);
  const [barSpent, setBarSpent] = useState(false);

  const screen = useUi((u) => u.screen);
  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const advanced = useSim((s) => s.settings.showAdvancedNumbers);
  const modalUp = useSim((s) => s.pendingEvents.length > 0);

  useEffect(
    () =>
      bus.on('SESSION_COMPLETED', ({ result }) => {
        setQueue((q) => (q.length >= MAX_QUEUE ? [...q.slice(1), result] : [...q, result]));
      }),
    [],
  );

  // A new run or the title screen — neither wants a card floating over it.
  useEffect(() => {
    if (screen !== 'playing') setQueue([]);
  }, [screen]);

  const current: SessionResult | undefined = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  // ── The six-second life of a card, held on hover or behind a modal ────────
  const remaining = useRef(DURATION_MS);
  const startedAt = useRef(0);
  const sessionId = current?.sessionId ?? '';
  const held = hovered || modalUp;

  useEffect(() => {
    remaining.current = DURATION_MS;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || held) return;
    startedAt.current = Date.now();
    const id = window.setTimeout(dismiss, remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(700, remaining.current - (Date.now() - startedAt.current));
    };
  }, [sessionId, held, dismiss]);

  // The countdown rule, driven by a transition rather than an animation so it
  // always agrees with the timer above.
  useEffect(() => {
    setBarSpent(false);
    if (!sessionId || held || calm) return;
    const id = window.setTimeout(() => setBarSpent(true), 30);
    return () => window.clearTimeout(id);
  }, [sessionId, held, calm]);

  const clientId = current?.clientId ?? '';
  const therapistId = current?.therapistId ?? '';

  const client = useSimShallow<ClientBits | null>((s: GameState) => {
    const c = s.clients.find((x) => x.id === clientId);
    if (!c) return null;
    return {
      handle: c.handle,
      age: c.age,
      portrait: c.portrait,
      progress: c.progress,
      plant: c.plant,
      chapter: c.chapter,
    };
  });
  const therapistName = useSim((s) => s.therapists.find((t) => t.id === therapistId)?.name ?? 'the practice');

  if (screen !== 'playing' || !current || !client) return null;

  const grade = GRADE_STYLE[current.grade];
  const focus = FOCUSES[current.focus];
  const delta = current.progressDelta;
  const queued = queue.length - 1;
  const celebratory = !calm && (current.breakthrough || current.cured);

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(464px,calc(100vw-1.75rem))] ${
        calm ? '' : 'tt-rise-settle'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-live="polite"
    >
      <div className="paper relative overflow-hidden">
        {celebratory && <Sparkles amber={current.breakthrough} />}

        {/* the grade, as a lit edge */}
        <div
          className="absolute inset-y-0 left-0 w-[4px]"
          style={{
            background: `linear-gradient(180deg, color-mix(in oklab, ${grade.color} 55%, white) 0%, ${grade.color} 40%, color-mix(in oklab, ${grade.color} 82%, black) 100%)`,
            boxShadow: grade.glow
              ? `1px 0 0 color-mix(in oklab, ${grade.color} 40%, transparent), 0 0 18px 1px color-mix(in oklab, ${grade.color} 62%, transparent)`
              : `1px 0 0 color-mix(in oklab, ${grade.color} 28%, transparent)`,
          }}
          aria-hidden
        />

        {/* the lamp, above and to the left */}
        <div
          className="absolute inset-x-0 top-0 h-20 pointer-events-none"
          style={{
            background:
              'radial-gradient(70% 150% at 18% -30%, color-mix(in oklab, var(--color-amber-glow) 34%, transparent) 0%, transparent 70%)',
          }}
          aria-hidden
        />

        {/* ── Who, and how it went ───────────────────────────────────────── */}
        <div className="relative pl-4 pr-2.5 pt-3 pb-2 flex items-start gap-2.5">
          <Portrait
            seed={client.portrait}
            size={40}
            glow={current.breakthrough}
            mood={current.grade === 'poor' ? 'sad' : current.quality > 0.79 ? 'happy' : 'neutral'}
            title={`${client.handle}, age ${client.age}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="display text-[0.98rem] leading-tight text-ink">{client.handle}</span>
              <span
                className={`text-[0.64rem] font-extrabold uppercase tracking-[0.08em] px-2 py-[2px] rounded-full ${
                  grade.glow && !calm ? 'tt-pill-glow' : ''
                }`}
                style={{
                  color: `color-mix(in oklab, ${grade.color} 84%, var(--color-ink))`,
                  background: `linear-gradient(180deg, color-mix(in oklab, ${grade.color} ${grade.tint * 0.7}%, transparent) 0%, color-mix(in oklab, ${grade.color} ${grade.tint}%, transparent) 100%)`,
                  boxShadow: grade.glow
                    ? `inset 0 0 0 1px color-mix(in oklab, ${grade.color} ${grade.edge}%, transparent), inset 0 1px 0 rgba(255,253,246,0.6), 0 0 16px -3px color-mix(in oklab, ${grade.color} 78%, transparent)`
                    : `inset 0 0 0 1px color-mix(in oklab, ${grade.color} ${grade.edge}%, transparent), inset 0 1px 0 rgba(255,253,246,0.55)`,
                  textShadow: '0 1px 0 rgba(255,253,246,0.6)',
                }}
              >
                {grade.label}
              </span>
            </div>
            <div className="text-[0.7rem] text-ink-faint leading-tight truncate">
              {therapistName} · <span aria-hidden>{focus.icon}</span> {focus.name}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {queued > 0 && (
              <button
                onClick={dismiss}
                className="text-[0.66rem] font-bold text-ink-faint hover:text-ink px-1.5 py-1 rounded-full transition"
                aria-label={`Show the next of ${queued} reflections waiting`}
              >
                Next · {queued}
              </button>
            )}
            <button
              onClick={dismiss}
              aria-label="Dismiss this reflection"
              className="w-6 h-6 grid place-items-center rounded-full text-ink-faint hover:bg-[color-mix(in_oklab,var(--color-ink)_10%,transparent)] transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── The hour in a sentence, beside the plant it grew ───────────── */}
        <div className="pl-4 pr-3.5 pb-2.5 flex items-start gap-3">
          <p className="display text-[0.95rem] leading-relaxed text-ink flex-1">{current.narrative}</p>
          <div className="shrink-0 flex flex-col items-center pt-0.5">
            <Plant progress={client.progress} species={client.plant} size={44} />
            <span
              className="tabular text-[0.74rem] font-bold leading-none mt-0.5"
              style={{ color: delta >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)' }}
              title={`Progress is now ${Math.round(client.progress)} of 100 · ${CHAPTER_LABEL[client.chapter]}`}
            >
              {delta >= 0 ? '+' : '−'}
              {Math.abs(delta).toFixed(1)}
            </span>
          </div>
        </div>

        {current.beat && (
          <p
            className="mx-4 mb-2.5 pl-3 pr-2 py-1.5 text-[0.8rem] italic leading-relaxed text-ink-soft rounded-r-[8px]"
            style={{
              borderLeft: '2px solid color-mix(in oklab, var(--color-amber) 60%, transparent)',
              background:
                'linear-gradient(90deg, color-mix(in oklab, var(--color-amber-glow) 22%, transparent) 0%, transparent 78%)',
            }}
          >
            {current.beat.text}
          </p>
        )}

        {/* ── Why ────────────────────────────────────────────────────────── */}
        {current.reasons.length > 0 && (
          <div className="mx-4 mb-2.5 pt-2 relative">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 15%, transparent) 0%, color-mix(in oklab, var(--color-ink) 15%, transparent) 72%, transparent 100%)',
              }}
            />
            <div className="text-[0.55rem] font-extrabold uppercase tracking-[0.13em] text-ink-faint mb-1">
              Why the hour went this way
            </div>
            <ul className="space-y-[3px]">
              {current.reasons.map((r, i) => {
                const color = REASON_COLOR[r.kind];
                // A diverging bar off a centre line: helped to the right, cost
                // to the left. Same scale for every row, so lengths compare.
                const mag = Math.max(2, Math.min(1, Math.abs(r.delta) / 0.22) * (HALF - 2));
                const positive = r.delta >= 0;
                return (
                  <li key={`${r.label}-${i}`} className="flex items-center gap-2 text-[0.7rem] leading-tight">
                    <span
                      className="flex-1 truncate"
                      style={{ color: r.kind === 'neutral' ? 'var(--color-ink-soft)' : color }}
                      title={r.label}
                    >
                      {r.label}
                    </span>
                    {advanced && (
                      <span className="tabular text-[0.62rem] text-ink-faint shrink-0">
                        {r.delta >= 0 ? '+' : '−'}
                        {Math.abs(r.delta).toFixed(3)}
                      </span>
                    )}
                    <span
                      className="shrink-0 relative rounded-full"
                      style={{
                        width: HALF * 2,
                        height: 7,
                        background: 'color-mix(in oklab, var(--color-ink) 7%, transparent)',
                        boxShadow: 'inset 0 1px 1px color-mix(in oklab, var(--color-ink) 13%, transparent)',
                      }}
                      aria-hidden
                    >
                      {/* the centre line the bars grow from */}
                      <span
                        className="absolute inset-y-[1px] w-px"
                        style={{
                          left: HALF,
                          background: 'color-mix(in oklab, var(--color-ink) 26%, transparent)',
                        }}
                      />
                      <span
                        className="absolute top-[1px] bottom-[1px] rounded-full"
                        style={{
                          width: mag,
                          left: positive ? HALF : HALF - mag,
                          background:
                            r.kind === 'neutral'
                              ? `color-mix(in oklab, ${color} 55%, transparent)`
                              : `linear-gradient(180deg, color-mix(in oklab, ${color} 62%, white) 0%, ${color} 100%)`,
                          boxShadow: r.kind === 'neutral' ? undefined : `0 1px 1px -1px ${color}`,
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── What it changed ────────────────────────────────────────────── */}
        {(current.cured || current.chapterAdvanced || current.revenue > 0) && (
          <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
            {current.cured && (
              <Callout icon="🌼" color="var(--color-sage-deep)">
                Treatment complete — a good goodbye
              </Callout>
            )}
            {current.chapterAdvanced && !current.cured && (
              <Callout icon="📖" color="var(--color-amber-deep)">
                Now in {CHAPTER_LABEL[current.chapterAdvanced]}
              </Callout>
            )}
            {current.revenue > 0 && (
              <Callout icon="💵" color="var(--color-ink-soft)">
                {formatMoney(current.revenue)} billed
              </Callout>
            )}
          </div>
        )}

        {/* the quiet countdown */}
        {!calm && !held && (
          <div
            className="absolute bottom-0 left-0 h-[2px] juice-only"
            style={{
              width: barSpent ? '0%' : '100%',
              background: `color-mix(in oklab, ${grade.color} 55%, transparent)`,
              transition: `width ${remaining.current}ms linear`,
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

function Callout({ icon, color, children }: { icon: string; color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.68rem] font-bold px-2 py-[3px] rounded-full"
      style={{
        color: `color-mix(in oklab, ${color} 84%, var(--color-ink))`,
        background: `linear-gradient(180deg, color-mix(in oklab, ${color} 9%, transparent) 0%, color-mix(in oklab, ${color} 15%, transparent) 100%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent), inset 0 1px 0 rgba(255,253,246,0.55)`,
      }}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </span>
  );
}

/** A small, quiet celebration. Hidden entirely in calm mode. */
function Sparkles({ amber }: { amber: boolean }) {
  const color = amber ? 'var(--color-amber)' : 'var(--color-sage)';
  return (
    <div className="juice-only pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden" aria-hidden>
      {[8, 24, 41, 58, 72, 88].map((left, i) => (
        <span
          key={left}
          className="absolute block rounded-full"
          style={{
            left: `${left}%`,
            top: `${6 + (i % 3) * 7}px`,
            width: i % 2 ? 4 : 6,
            height: i % 2 ? 4 : 6,
            background: color,
            opacity: 0.55,
            animation: `gentle-float ${3 + (i % 3) * 0.6}s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
