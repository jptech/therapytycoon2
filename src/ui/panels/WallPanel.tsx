import { CONDITION_LABELS } from '../../sim/balance';
import type { AlumniRecord, ConditionId } from '../../sim/types';
import { useSim, useSimShallow, useStore } from '../../store';
import { Portrait } from '../Portrait';
import { Chip, Divider, EmptyState, PanelShell, StatTile } from '../primitives';

/**
 * The photo wall — a physical corkboard that fills up over a run.
 *
 * This is the only screen in the game with no numbers to optimise. Frames go up
 * slightly crooked, held by amber pins, and stay up. Cards are tilted from a
 * hash of the alumnus id so the wall looks hand-pinned but never jitters on a
 * re-render, and calm mode straightens every frame.
 */

/** FNV-1a. Stable, cheap, and gives each frame its own permanent slouch. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tiltFor(id: string): number {
  return ((hashId(id) % 1000) / 1000 - 0.5) * 4.6;
}

function pinOffsetFor(id: string): number {
  return ((hashId(`${id}pin`) % 100) / 100 - 0.5) * 26;
}

function Pin({ shift }: { shift: number }) {
  return (
    <span
      aria-hidden
      className="absolute -top-2 left-1/2 w-3.5 h-3.5 rounded-full"
      style={{
        transform: `translateX(calc(-50% + ${shift}px))`,
        background:
          'radial-gradient(60% 60% at 34% 30%, var(--color-amber-glow) 0%, var(--color-amber) 55%, var(--color-amber-deep) 100%)',
        boxShadow: '0 3px 6px -2px rgba(30,58,58,0.55), inset 0 -1px 2px rgba(0,0,0,0.18)',
      }}
    />
  );
}

function AlumniCard({ a, calm, animate }: { a: AlumniRecord; calm: boolean; animate: boolean }) {
  const tilt = calm ? 0 : tiltFor(a.id);
  return (
    <li
      className={`relative ${animate ? 'rise-in' : ''}`}
      style={{ transform: `rotate(${tilt.toFixed(2)}deg)` }}
    >
      <Pin shift={calm ? 0 : pinOffsetFor(a.id)} />
      <article
        className="paper-flat px-3 pt-4 pb-3 h-full"
        style={{
          boxShadow: '0 10px 22px -14px rgba(30,58,58,0.65)',
          borderColor: 'color-mix(in oklab, var(--color-ink) 18%, transparent)',
        }}
      >
        <div className="flex items-start gap-2.5">
          <Portrait seed={a.portrait} size={46} mood="happy" glow title={`${a.handle}, discharged`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="display text-[0.98rem] text-ink">{a.handle}</span>
              {a.complex ? <Chip color="var(--color-plum)">complex</Chip> : null}
            </div>
            <div className="text-[0.7rem] text-ink-soft leading-snug">
              {CONDITION_LABELS[a.condition] ?? a.condition}
            </div>
            <div className="tabular text-[0.66rem] text-ink-faint leading-snug mt-0.5">
              {a.sessions} session{a.sessions === 1 ? '' : 's'} · finished on day {a.curedDay}
            </div>
          </div>
        </div>

        <blockquote
          className="display text-[0.86rem] leading-[1.55] text-ink-soft italic mt-2.5 pl-2.5"
          style={{ borderLeft: '2px solid color-mix(in oklab, var(--color-amber) 55%, transparent)' }}
        >
          “{a.testimonial}”
        </blockquote>

        <div className="text-[0.68rem] text-ink-faint mt-2 pt-2 border-t hairline">
          seen by <span className="text-ink-soft font-bold">{a.therapistName}</span>
        </div>
      </article>
    </li>
  );
}

interface WallStats {
  total: number;
  complex: number;
  topCondition: string;
  topConditionCount: number;
  topTherapist: string;
  topTherapistCount: number;
  totalSessions: number;
}

export function WallPanel() {
  const openPanel = useStore((st) => st.openPanel);
  const calm = useSim((s) => s.settings.calmMode);
  const reduced = useSim((s) => s.settings.reducedMotion);
  const practiceName = useSim((s) => s.practiceName);
  const alumni = useSimShallow<AlumniRecord[]>((s) =>
    [...s.alumni].sort((a, b) => b.curedDay - a.curedDay),
  );
  const stats = useSimShallow<WallStats>((s) => {
    const byCondition: Partial<Record<ConditionId, number>> = {};
    const byTherapist: Record<string, number> = {};
    let complex = 0;
    let totalSessions = 0;
    for (const a of s.alumni) {
      byCondition[a.condition] = (byCondition[a.condition] ?? 0) + 1;
      byTherapist[a.therapistName] = (byTherapist[a.therapistName] ?? 0) + 1;
      if (a.complex) complex++;
      totalSessions += a.sessions;
    }
    let topCondition = '';
    let topConditionCount = 0;
    for (const [k, v] of Object.entries(byCondition)) {
      if ((v ?? 0) > topConditionCount) {
        topConditionCount = v ?? 0;
        topCondition = CONDITION_LABELS[k as ConditionId] ?? k;
      }
    }
    let topTherapist = '';
    let topTherapistCount = 0;
    for (const [k, v] of Object.entries(byTherapist)) {
      if (v > topTherapistCount) {
        topTherapistCount = v;
        topTherapist = k;
      }
    }
    return {
      total: s.alumni.length,
      complex,
      topCondition,
      topConditionCount,
      topTherapist,
      topTherapistCount,
      totalSessions,
    };
  });

  const animate = !calm && !reduced;

  return (
    <PanelShell
      title="The Wall"
      icon="🖼️"
      wide
      subtitle="Everyone who finished here. New clients slow down to read it."
      onClose={() => openPanel(null)}
      footer={
        <div className="flex items-center justify-between gap-3 text-[0.72rem] text-ink-faint">
          <span>
            {stats.total === 0
              ? 'Nothing pinned up yet.'
              : `${stats.total} frame${stats.total === 1 ? '' : 's'} · newest nearest the door`}
          </span>
          {stats.totalSessions ? (
            <span className="tabular">{stats.totalSessions} hours of somebody’s life</span>
          ) : null}
        </div>
      }
    >
      {stats.total > 0 ? (
        <div
          className="grid gap-2 mb-3.5"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
        >
          <StatTile label="Goodbyes" value={stats.total} sub="courses of care completed" tone="good" />
          <StatTile
            label="Complex cases"
            value={stats.complex}
            sub={stats.complex ? 'the ones nobody else would take' : 'none yet'}
            tone={stats.complex ? 'amber' : 'neutral'}
          />
          <StatTile
            label="Most often"
            value={<span className="text-[0.95rem]">{stats.topCondition || '—'}</span>}
            sub={stats.topConditionCount ? `${stats.topConditionCount} of them` : undefined}
          />
          <StatTile
            label="Most goodbyes"
            value={<span className="text-[0.95rem]">{stats.topTherapist || '—'}</span>}
            sub={stats.topTherapistCount ? `${stats.topTherapistCount} discharged` : undefined}
          />
        </div>
      ) : null}

      {/* the corkboard itself */}
      <div
        className="rounded-[14px] p-4"
        style={{
          backgroundColor: 'var(--color-paper-deep)',
          backgroundImage:
            'radial-gradient(circle at 15% 25%, color-mix(in oklab, var(--color-ink) 9%, transparent) 0 1.1px, transparent 1.3px), radial-gradient(circle at 68% 62%, color-mix(in oklab, var(--color-ink) 7%, transparent) 0 1.4px, transparent 1.6px), radial-gradient(circle at 40% 85%, color-mix(in oklab, var(--color-brick) 10%, transparent) 0 1px, transparent 1.2px)',
          backgroundSize: '23px 23px, 37px 37px, 51px 51px',
          border: '1px solid color-mix(in oklab, var(--color-ink) 18%, transparent)',
          boxShadow: 'inset 0 2px 14px -6px rgba(30,58,58,0.4)',
        }}
      >
        {alumni.length === 0 ? (
          <EmptyState
            icon="📌"
            title="The wall is bare. It won’t be."
            body="The first frame goes up the day somebody finishes — which will feel, at the time, like an ordinary Tuesday."
          />
        ) : (
          <ul
            className="list-none p-0 m-0 grid gap-x-4 gap-y-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))' }}
          >
            {alumni.map((a) => (
              <AlumniCard key={a.id} a={a} calm={calm} animate={animate} />
            ))}
          </ul>
        )}
      </div>

      {alumni.length > 0 ? (
        <>
          <Divider />
          <p className="text-[0.74rem] text-ink-faint leading-relaxed">
            Every quote on this wall was said out loud in a room at {practiceName}, on the way out, usually
            while putting a coat on.
          </p>
        </>
      ) : null}
    </PanelShell>
  );
}
