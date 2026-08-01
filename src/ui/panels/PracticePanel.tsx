import { useMemo, useRef, useState } from 'react';
import { milestoneById } from '../../content';
import { PRACTICE_LEVEL_CAPACITY, THERAPIST_SLOTS_BY_LEVEL, XP_PER_LEVEL } from '../../sim/balance';
import { capacity, therapistSlots } from '../../sim/engine';
import type { DaySnapshot } from '../../sim/types';
import { formatMoney } from '../../sim/util';
import { usePanelPrefs, useSim, useSimShallow, useStore, type PracticeRange } from '../../store';
import { Chip, Divider, EmptyState, Meter, PanelShell, SectionHeading, StatTile } from '../primitives';

/**
 * The long view — the practice itself, read back over the whole run.
 *
 * Every other panel answers "what is true right now". This one answers "what
 * has been happening", which is a different and quieter question: reputation
 * and community trust move a fraction of a point a day, and a number that only
 * ever appears as today's value hides the one thing worth knowing about it,
 * which is the direction.
 *
 * It invents nothing. `stats.history` has recorded a `DaySnapshot` every
 * evening since day one — this is the first screen that reads all of it rather
 * than a 28-day slice, and it is deliberately a door on the rail rather than a
 * modal, because `tick()` refuses to advance time while a modal is pending and
 * a thing you browse must never be a thing that stops the clock.
 */

const RANGES: { id: PracticeRange; label: string; days: number }[] = [
  { id: 'run', label: 'The whole run', days: Infinity },
  { id: 'quarter', label: 'This quarter', days: 28 },
  { id: 'fortnight', label: 'A fortnight', days: 14 },
];

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  /** Pull the number out of one evening's snapshot. */
  pick: (h: DaySnapshot) => number;
  format: (v: number) => string;
  /** Hard bounds the drawn range may never exceed — a 0..100 meter, usually. */
  bounds?: [number, number];
  /** Days with no sessions record 0, which reads as a collapse rather than a quiet day. */
  skipZero?: boolean;
  note: string;
}

const SERIES: SeriesDef[] = [
  {
    key: 'reputation',
    label: 'Reputation',
    color: 'var(--color-amber-deep)',
    pick: (h) => h.reputation,
    format: (v) => `${Math.round(v)}`,
    bounds: [0, 100],
    note: 'What the profession thinks. Earned a fraction at a time by finished work, spent quickly by somebody drifting away.',
  },
  {
    key: 'trust',
    label: 'Community trust',
    color: 'var(--color-plum)',
    pick: (h) => h.communityTrust,
    format: (v) => `${Math.round(v)}`,
    bounds: [0, 100],
    note: 'What the neighbourhood thinks. It drifts down on its own — sliding-scale work is the cheapest way to hold it up.',
  },
  {
    key: 'level',
    label: 'Practice level',
    color: 'var(--color-sage-deep)',
    pick: (h) => h.practiceLevel,
    format: (v) => `${Math.round(v)}`,
    note: 'The staircase the whole practice climbs. Each step is more room and one more pair of hands.',
  },
  {
    key: 'clients',
    label: 'People in care',
    color: 'var(--color-sage-deep)',
    pick: (h) => h.clients,
    format: (v) => `${Math.round(v)}`,
    note: 'Everyone on the active caseload that evening. Flat is not stagnation — it is usually people finishing at the rate people arrive.',
  },
  {
    key: 'quality',
    label: 'Session quality',
    color: 'var(--color-amber-deep)',
    pick: (h) => h.avgQuality * 100,
    format: (v) => `${Math.round(v)}%`,
    bounds: [0, 100],
    skipZero: true,
    note: 'Averaged over the hours actually held. Days with nobody booked are left out rather than drawn as a floor.',
  },
  {
    key: 'morale',
    label: 'Team morale',
    color: 'var(--color-plum)',
    pick: (h) => h.avgMorale,
    format: (v) => `${Math.round(v)}%`,
    bounds: [0, 100],
    note: 'Reverts toward the baseline every night, so a climb here is something you are doing, not something that accumulated.',
  },
  {
    key: 'cash',
    label: 'Cash',
    color: 'var(--color-sage-deep)',
    pick: (h) => h.cash,
    format: (v) => formatMoney(v),
    note: 'The books in one line. The finances panel breaks the same run down into what came in and what went out.',
  },
];

/**
 * What the next step up the staircase actually buys.
 *
 * The two ladders do not rise together — `THERAPIST_SLOTS_BY_LEVEL` holds at 2
 * across levels 2 and 3 — so a sentence that always names both ends up
 * promising a desk that is already there. Name only what moves.
 */
function nextLevelBuys(level: number): string {
  const at = <T,>(arr: readonly T[], i: number): T => arr[Math.min(Math.max(i, 0), arr.length - 1)];
  const clients = at(PRACTICE_LEVEL_CAPACITY, level) - at(PRACTICE_LEVEL_CAPACITY, level - 1);
  const desks = at(THERAPIST_SLOTS_BY_LEVEL, level) - at(THERAPIST_SLOTS_BY_LEVEL, level - 1);
  const parts: string[] = [];
  if (clients > 0) parts.push(`room for ${clients} more client${clients === 1 ? '' : 's'}`);
  if (desks > 0) parts.push(`${desks} more desk${desks === 1 ? '' : 's'}`);
  if (!parts.length) return `Level ${level + 1} is a step toward the ones after it, not more room.`;
  return `Level ${level + 1} brings ${parts.join(' and ')}.`;
}

export function PracticePanel() {
  const openPanel = useStore((s) => s.openPanel);
  const [prefs, setPrefs] = usePanelPrefs('practice');

  const practiceName = useSim((s) => s.practiceName);
  const day = useSim((s) => s.day);
  const quarter = useSim((s) => s.quarter);
  const year = useSim((s) => s.year);
  const level = useSim((s) => s.practiceLevel);
  const xp = useSim((s) => s.xp);
  const reputation = useSim((s) => s.reputation);
  const trust = useSim((s) => s.communityTrust);
  const cap = useSim((s) => capacity(s));
  const slots = useSim((s) => therapistSlots(s));
  const inCare = useSim((s) => s.clients.filter((c) => c.status === 'active').length);
  const waitlist = useSim((s) => s.clients.filter((c) => c.status === 'waitlist').length);
  const therapists = useSim((s) => s.therapists.length);
  const cures = useSim((s) => s.stats.cures);
  const dropouts = useSim((s) => s.stats.dropouts);

  // One flat copy of the history per revision. `slice()` gives the shallow
  // comparator a fresh array rather than the same reference it saw last time,
  // the way LogPanel does with the day book.
  const history = useSimShallow<DaySnapshot[]>((s) => s.stats.history.slice());
  const milestones = useSimShallow((s) => s.milestonesEarned.slice());

  const range = RANGES.find((r) => r.id === prefs.range) ?? RANGES[0];
  const windowed = useMemo(
    () => (range.days === Infinity ? history : history.slice(-range.days)),
    [history, range.days],
  );

  // Where the practice stepped up, in days. Read straight off the history
  // rather than kept as new state — the snapshot already carries the level, so
  // the ladder cannot drift from the line drawn above it.
  const levelUps = useMemo(() => {
    const out: { day: number; level: number }[] = [];
    for (let i = 1; i < history.length; i++) {
      if (history[i].practiceLevel > history[i - 1].practiceLevel) {
        out.push({ day: history[i].day, level: history[i].practiceLevel });
      }
    }
    return out;
  }, [history]);

  const nextLevelXp = level < XP_PER_LEVEL.length ? XP_PER_LEVEL[level] : undefined;
  const prevLevelXp = XP_PER_LEVEL[level - 1] ?? 0;
  const trimmed = history.length > 0 && history[0].day > 1;

  return (
    <PanelShell
      title="The long view"
      icon="🕰️"
      wide
      subtitle={`${practiceName} — day ${day}, quarter ${quarter} of year ${year}.`}
      onClose={() => openPanel(null)}
      footer={
        <div className="flex items-center justify-between gap-3 text-[0.7rem] text-ink-faint">
          <span>
            {history.length
              ? `${history.length} evening${history.length === 1 ? '' : 's'} on record`
              : 'The record starts tomorrow evening'}
          </span>
          {trimmed ? (
            <span className="tabular" title="Only the most recent 400 evenings are kept.">
              from day {history[0].day}
            </span>
          ) : null}
        </div>
      }
    >
      {/* ── Where it stands ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          label="Practice level"
          value={level}
          sub={`${cap} client${cap === 1 ? '' : 's'} · ${slots} therapist${slots === 1 ? '' : 's'}`}
          tone="good"
        />
        <StatTile
          label="Reputation"
          value={Math.round(reputation)}
          sub="out of 100, among clinicians"
          tone="amber"
        />
        <StatTile
          label="Community trust"
          value={Math.round(trust)}
          sub="out of 100, in the neighbourhood"
          tone={trust < 35 ? 'bad' : 'neutral'}
        />
        <StatTile
          label="People in care"
          value={inCare}
          sub={waitlist ? `${waitlist} waiting` : 'nobody waiting'}
          tone="neutral"
        />
      </div>

      {/* ── The staircase ────────────────────────────────────────────────── */}
      <div className="card-warm px-3 py-2.5 mt-2">
        {nextLevelXp !== undefined ? (
          <>
            <Meter
              value={Math.max(0, xp - prevLevelXp)}
              max={Math.max(1, nextLevelXp - prevLevelXp)}
              color="var(--color-sage-deep)"
              label={
                <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
                  Toward level {level + 1}
                </span>
              }
              right={
                <span className="tabular text-[0.7rem] text-ink-faint">
                  {Math.round(xp).toLocaleString()} / {nextLevelXp.toLocaleString()} xp
                </span>
              }
            />
            <p className="text-[0.72rem] text-ink-soft leading-snug mt-1.5">
              {nextLevelBuys(level)}
            </p>
          </>
        ) : (
          <p className="text-[0.75rem] text-ink-soft leading-snug">
            Level {level} — the top of the staircase. Whatever happens next is not about getting bigger.
          </p>
        )}
        {levelUps.length ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {levelUps.map((l) => (
              <Chip key={l.day} color="var(--color-sage-deep)">
                Level {l.level} on day {l.day}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <Divider label="How it moved" />

      {/* ── Range ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        {RANGES.map((r) => {
          const on = r.id === range.id;
          return (
            <button
              key={r.id}
              onClick={() => setPrefs({ range: r.id })}
              aria-pressed={on}
              className={`chip tt-pressable ${on ? 'font-bold text-ink' : 'text-ink-faint'}`}
              style={
                on
                  ? {
                      background: 'color-mix(in oklab, var(--color-amber) 26%, transparent)',
                      borderColor: 'color-mix(in oklab, var(--color-amber-deep) 45%, transparent)',
                    }
                  : undefined
              }
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {windowed.length < 2 ? (
        <EmptyState
          icon="🕰️"
          title="Not enough evenings yet"
          body="The lines start after your second full day. Nothing is missing — there simply is not a shape to draw."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {SERIES.map((def) => (
            <SeriesCard key={def.key} def={def} rows={windowed} levelUps={levelUps} />
          ))}
        </div>
      )}

      {/* ── Worth keeping ────────────────────────────────────────────────── */}
      <Divider label="Worth keeping" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Good goodbyes" value={cures} sub="people who finished" tone="good" />
        <StatTile label="Drifted away" value={dropouts} sub="people who stopped coming" tone="neutral" />
        <StatTile label="On the team" value={therapists} sub={`${slots} desk${slots === 1 ? '' : 's'}`} tone="neutral" />
        <StatTile label="Milestones" value={milestones.length} sub="on the fridge door" tone="amber" />
      </div>

      {milestones.length ? (
        <>
          <SectionHeading sub="Everything the practice has been marked for, oldest first.">
            The fridge door
          </SectionHeading>
          <ul className="space-y-1.5">
            {milestones.map((id) => {
              const m = milestoneById[id];
              if (!m) return null;
              return (
                <li key={id} className="flex items-start gap-2">
                  <span aria-hidden className="text-base leading-tight">
                    {m.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[0.8rem] font-bold text-ink leading-tight">{m.name}</div>
                    <div className="text-[0.72rem] text-ink-faint leading-snug">{m.blurb}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </PanelShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One series
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The drawing box. Wide enough that a two-hundred-day run has a point per pixel
 * or better, and scaled down by the svg rather than remeasured, so the card does
 * not need a ResizeObserver to sit in a panel that changes width.
 */
const VW = 640;
const VH = 104;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

function SeriesCard({
  def,
  rows,
  levelUps,
}: {
  def: SeriesDef;
  rows: DaySnapshot[];
  levelUps: { day: number; level: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement | null>(null);

  const points = useMemo(() => {
    const kept = def.skipZero ? rows.filter((h) => def.pick(h) > 0) : rows;
    return kept.map((h) => ({ day: h.day, v: def.pick(h) }));
  }, [rows, def]);

  if (points.length < 2) {
    return (
      <div className="card-warm px-3 py-2">
        <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
          {def.label}
        </div>
        <p className="text-[0.7rem] text-ink-faint leading-snug py-1.5">
          {def.skipZero
            ? 'No sessions in this stretch, so there is nothing to average.'
            : 'One evening in this stretch. The shape needs a few more days.'}
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.v);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // The box is drawn to what actually happened, padded, and never outside the
  // metric's own bounds. Pinning reputation to a fixed 0–100 was the honest
  // instinct and the wrong picture: a run that climbed 12 to 19 came out as a
  // dead flat line along the floor, which is the one reading that is definitely
  // false. The drawn range is printed under the chart instead, so the shape and
  // the scale arrive together.
  const pad = (rawMax - rawMin || Math.max(1, Math.abs(rawMax) * 0.1)) * 0.18;
  const lo = def.bounds ? Math.max(def.bounds[0], rawMin - pad) : rawMin - pad;
  const hi = def.bounds ? Math.min(def.bounds[1], rawMax + pad) : rawMax + pad;
  const span = hi - lo || 1;

  const x = (i: number) => (i / (points.length - 1)) * VW;
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / span) * (VH - PAD_TOP - PAD_BOTTOM);

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${VW} ${VH} L0 ${VH} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.v - first.v;
  const shown = hover !== null ? points[hover] : last;

  // Level-ups inside this window, as vertical hairlines. Placed at the nearest
  // recorded evening rather than by day arithmetic, because `skipZero` can have
  // taken evenings out from under the index — and filtered on the day itself
  // rather than on the resulting index, so a step-up that lands exactly on the
  // first evening shown is drawn instead of silently swallowed.
  const marks = levelUps
    .filter((l) => l.day > first.day && l.day <= last.day)
    .map((l) => ({ l, i: Math.max(0, points.findIndex((p) => p.day >= l.day)) }));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHover(Math.round(frac * (points.length - 1)));
  };

  return (
    <div className="card-warm px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
          {def.label}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="display tabular text-[0.95rem] text-ink">{def.format(shown.v)}</span>
          <span className="tabular text-[0.66rem] text-ink-faint">
            {hover !== null ? `day ${shown.day}` : `day ${last.day}`}
          </span>
          {hover === null && Math.abs(delta) > 0.0001 ? (
            <span
              className="tabular text-[0.66rem]"
              style={{ color: delta >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)' }}
            >
              {delta >= 0 ? '▲' : '▼'} {def.format(Math.abs(delta))}
            </span>
          ) : null}
        </span>
      </div>

      <div className="relative mt-1">
      <svg
        ref={ref}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="w-full block touch-none"
        style={{ height: VH }}
        role="img"
        aria-label={`${def.label}: ${def.format(first.v)} on day ${first.day}, ${def.format(
          last.v,
        )} on day ${last.day}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`lv-${def.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={def.color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={def.color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* The floor of the box, so a line near the bottom still has something
            to be near. Non-scaling so the horizontal squash of preserveAspect
            "none" cannot thicken it. */}
        <path
          d={`M0 ${VH - 0.5}H${VW}`}
          stroke={def.color}
          strokeWidth="1"
          opacity="0.26"
          vectorEffect="non-scaling-stroke"
        />
        {marks.map((m) => (
          <path
            key={m.l.day}
            d={`M${x(m.i).toFixed(1)} 0V${VH}`}
            stroke="var(--color-amber-deep)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`Practice level ${m.l.level}, day ${m.l.day}`}</title>
          </path>
        ))}
        <path d={area} fill={`url(#lv-${def.key})`} />
        <path
          d={d}
          stroke={def.color}
          strokeWidth="1.8"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null ? (
          <path
            d={`M${x(hover).toFixed(1)} 0V${VH}`}
            stroke="var(--color-ink)"
            strokeWidth="1"
            opacity="0.3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      {/* The head of the line rides above the svg rather than inside it. The
          box is stretched horizontally to whatever width the panel has —
          `preserveAspectRatio="none"` is what lets a two-hundred-day run fill
          it — and a circle drawn in that space comes out an ellipse. Lines
          survive the squash with a non-scaling stroke; a dot does not. */}
      <span
        aria-hidden
        className="absolute pointer-events-none rounded-full"
        style={{
          left: `${((hover ?? points.length - 1) / (points.length - 1)) * 100}%`,
          top: y(shown.v),
          width: 8,
          height: 8,
          marginLeft: -4,
          marginTop: -4,
          background: def.color,
          boxShadow: '0 0 0 2.5px color-mix(in oklab, var(--color-paper) 90%, transparent)',
        }}
      />
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-1">
        <p className="text-[0.7rem] text-ink-faint leading-snug">{def.note}</p>
        {/* The low and high that actually happened — not the drawing box, which
            is padded and would quote a figure the run never reached. "to"
            rather than a dash, because two negative numbers either side of a
            dash are unreadable. */}
        <span
          className="tabular text-[0.66rem] text-ink-faint shrink-0"
          title="The lowest and highest this reached in the stretch shown."
        >
          {rawMin === rawMax
            ? `flat at ${def.format(rawMin)}`
            : `${def.format(rawMin)} to ${def.format(rawMax)}`}
          {def.bounds ? ` of ${def.format(def.bounds[1])}` : ''}
        </span>
      </div>
    </div>
  );
}
