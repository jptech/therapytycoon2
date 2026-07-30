import { useMemo } from 'react';
import { DAY_START_MINUTE } from '../../sim/balance';
import type { LogEntry } from '../../sim/types';
import { formatClock, formatDay } from '../../sim/util';
import { usePanelPrefs, useSim, useSimShallow, useStore } from '../../store';
import { EmptyState, PanelShell } from '../primitives';

/**
 * The day book.
 *
 * Everything the practice noticed, newest first, grouped under the day it
 * happened on. The sim already writes these in reverse-chronological order, so
 * this panel only groups, filters and colours — it never re-derives an event.
 */

type Kind = LogEntry['kind'];

const KINDS: { id: Kind; label: string; icon: string; color: string }[] = [
  { id: 'session', label: 'Sessions', icon: '🕰️', color: 'var(--color-amber)' },
  { id: 'client', label: 'Clients', icon: '🪴', color: 'var(--color-sage)' },
  { id: 'staff', label: 'Team', icon: '👥', color: 'var(--color-plum)' },
  { id: 'money', label: 'Money', icon: '💵', color: 'var(--color-sage-deep)' },
  { id: 'event', label: 'Events', icon: '📮', color: 'var(--color-brick)' },
  { id: 'milestone', label: 'Milestones', icon: '🏅', color: 'var(--color-amber-deep)' },
  { id: 'system', label: 'The building', icon: '🕯️', color: 'var(--color-ink-faint)' },
];

const KIND_META: Record<Kind, { icon: string; color: string; label: string }> = KINDS.reduce(
  (acc, k) => {
    acc[k.id] = { icon: k.icon, color: k.color, label: k.label };
    return acc;
  },
  {} as Record<Kind, { icon: string; color: string; label: string }>,
);

const TONE_COLOR: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'var(--color-sage-deep)',
  bad: 'var(--color-brick)',
  neutral: 'var(--color-ink-soft)',
};

interface DayGroup {
  day: number;
  entries: LogEntry[];
}

export function LogPanel() {
  const openPanel = useStore((s) => s.openPanel);
  const today = useSim((s) => s.day);
  const calm = useSim((s) => s.settings.calmMode);

  // `state.log` is unshifted in place, so slice() gives the shallow comparator
  // a fresh array to look at rather than the same reference every revision.
  const log = useSimShallow<LogEntry[]>((s) => s.log.slice());

  // Which headings are switched off outlives the panel — reading the book is a
  // thing you do in several sittings.
  const [prefs, setPrefs] = usePanelPrefs('log');
  const hidden = useMemo(() => new Set(prefs.hiddenKinds), [prefs.hiddenKinds]);

  const counts = useMemo(() => {
    const out = {} as Record<Kind, number>;
    for (const k of KINDS) out[k.id] = 0;
    for (const e of log) out[e.kind] = (out[e.kind] ?? 0) + 1;
    return out;
  }, [log]);

  const filterKey = useMemo(() => [...hidden].sort().join(','), [hidden]);

  const groups = useMemo(() => {
    const skip = new Set(filterKey.split(',').filter(Boolean) as Kind[]);
    const out: DayGroup[] = [];
    let current: DayGroup | undefined;
    for (const e of log) {
      if (skip.has(e.kind)) continue;
      if (!current || current.day !== e.day) {
        current = { day: e.day, entries: [] };
        out.push(current);
      }
      current.entries.push(e);
    }
    return out;
  }, [log, filterKey]);

  const shown = groups.reduce((a, g) => a + g.entries.length, 0);
  const allOn = hidden.size === 0;

  const toggle = (k: Kind) =>
    setPrefs({ hiddenKinds: hidden.has(k) ? prefs.hiddenKinds.filter((x) => x !== k) : [...prefs.hiddenKinds, k] });

  return (
    <PanelShell
      title="The day book"
      icon="📜"
      subtitle="Everything that happened, in the order it happened."
      onClose={() => openPanel(null)}
      footer={
        <div className="flex items-center justify-between gap-3 text-[0.7rem] text-ink-faint">
          <span>
            {shown} line{shown === 1 ? '' : 's'}
            {log.length !== shown ? ` of ${log.length}` : ''}
          </span>
          <span className="tabular">the last {Math.max(1, groups.length)} day{groups.length === 1 ? '' : 's'}</span>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button
          onClick={() => setPrefs({ hiddenKinds: [] })}
          aria-pressed={allOn}
          className="chip transition focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: allOn ? 'color-mix(in oklab, var(--color-ink) 80%, transparent)' : undefined,
            color: allOn ? 'var(--color-paper)' : undefined,
            borderColor: allOn ? 'transparent' : undefined,
            opacity: allOn ? 1 : 0.75,
          }}
        >
          Everything
        </button>
        {KINDS.map((k) => {
          const on = !hidden.has(k.id);
          const n = counts[k.id] ?? 0;
          return (
            <button
              key={k.id}
              onClick={() => toggle(k.id)}
              aria-pressed={on}
              aria-label={`${k.label} — ${n} line${n === 1 ? '' : 's'}`}
              className="chip transition focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: on ? `color-mix(in oklab, ${k.color} 20%, transparent)` : 'transparent',
                borderColor: on
                  ? `color-mix(in oklab, ${k.color} 46%, transparent)`
                  : 'color-mix(in oklab, var(--color-ink) 12%, transparent)',
                color: on ? `color-mix(in oklab, ${k.color} 78%, #1E3A3A)` : 'var(--color-ink-faint)',
                opacity: on ? 1 : 0.55,
              }}
            >
              <span aria-hidden>{k.icon}</span>
              {k.label}
              <span className="tabular opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {log.length === 0 ? (
        <EmptyState
          icon="🕯️"
          title="Nothing written down yet."
          body="The book fills itself — arrivals, hours, money, the fern by the stairs. Open the doors and it will start."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nothing under those headings."
          body="Turn a filter back on, or take the whole book at once."
        />
      ) : (
        <ol className="list-none p-0 m-0">
          {groups.map((g) => (
            <li key={g.day} className="mb-3.5 last:mb-0">
              <div className="flex items-baseline gap-2 mb-1.5 sticky top-0 z-10 py-1 -mx-1 px-1 bg-paper">
                <span className="display text-[0.9rem] text-ink">
                  Day {g.day}
                  {g.day === today ? ' · today' : ''}
                </span>
                <span className="h-px flex-1" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />
                <span className="text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint">
                  {formatDay(g.day)}
                </span>
              </div>

              <ol className="list-none p-0 m-0 grid gap-0.5">
                {g.entries.map((e, i) => {
                  const meta = KIND_META[e.kind] ?? KIND_META.system;
                  const tone = e.tone ?? 'neutral';
                  return (
                    <li
                      key={`${e.id}_${i}`}
                      className={`flex items-baseline gap-2 px-1.5 py-1 rounded-[8px] ${
                        calm ? '' : 'transition hover:bg-[color-mix(in_oklab,var(--color-ink)_5%,transparent)]'
                      }`}
                    >
                      <span
                        className="tabular text-[0.66rem] text-ink-faint shrink-0 w-[62px] text-right"
                        title={`Day ${e.day}`}
                      >
                        {formatClock(DAY_START_MINUTE + e.minute)}
                      </span>
                      <span
                        aria-hidden
                        className="shrink-0 w-[1.05rem] text-[0.78rem] leading-none text-center"
                        title={meta.label}
                      >
                        {meta.icon}
                      </span>
                      <span
                        className="text-[0.78rem] leading-snug min-w-0"
                        style={{
                          color: TONE_COLOR[tone],
                          fontWeight: tone === 'neutral' ? 400 : 600,
                        }}
                      >
                        {e.text}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {log.length >= 400 ? (
        <p className="text-[0.68rem] text-ink-faint leading-snug mt-3">
          The book keeps the last 400 lines. Older days are remembered on the wall and in the books, not here.
        </p>
      ) : null}
    </PanelShell>
  );
}
