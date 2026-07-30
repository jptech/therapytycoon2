import { useEffect, useRef, type ReactNode } from 'react';
import { milestoneById, philosophyById, programById } from '../content';
import { CONDITION_LABELS, DIFFICULTIES } from '../sim/balance';
import { modalityName } from '../sim/session';
import { saveLegacy } from '../sim/save';
import type { AlumniRecord, LogEntry, ProgramInstance, Therapist } from '../sim/types';
import { formatMoney } from '../sim/util';
import { useSim, useSimShallow, useStore } from '../store';
import { Portrait } from './Portrait';
import { Button, Chip, Divider, SectionHeading, StatTile } from './primitives';

/**
 * The closing ceremony.
 *
 * Three endings share one screen because they deserve the same care: the run
 * that got the brass plate, the run that stopped on its own terms, and the run
 * whose books gave out. The last of those is the one this screen exists for —
 * a collapse should read as an ending, not a failure state, and the alumni
 * count is the argument.
 */

// ── Legacy perks ────────────────────────────────────────────────────────────
// Ids must match the `spent` checks in `applyLegacy()` in sim/engine.ts, which
// is the only place these actually do anything.

interface LegacyPerk {
  id: string;
  name: string;
  cost: number;
  icon: string;
  blurb: string;
}

const LEGACY_PERKS: readonly LegacyPerk[] = [
  {
    id: 'legacy_nest_egg',
    name: 'Nest Egg',
    cost: 6,
    icon: '🪙',
    blurb: 'Open the next practice with $1,500 already in the account — a fortnight of not flinching at the rent.',
  },
  {
    id: 'legacy_reputation',
    name: 'A Name That Travels',
    cost: 5,
    icon: '📣',
    blurb: 'Start at +8 reputation. Somebody two towns over has already been recommending you.',
  },
  {
    id: 'legacy_mentor',
    name: 'The Mentor',
    cost: 12,
    icon: '🫖',
    blurb: 'A veteran clinician comes out of semi-retirement on day one, at half salary, because you asked.',
  },
  {
    id: 'legacy_technique',
    name: 'Something You Kept',
    cost: 8,
    icon: '📓',
    blurb: 'Carry one tier-2 technique in your own modality into the next run. Your hands already know it.',
  },
  {
    id: 'legacy_community',
    name: 'The Neighbourhood Remembers',
    cost: 5,
    icon: '🏘️',
    blurb: 'Start at +12 community trust. The pharmacy on the corner still has your card by the till.',
  },
];

/**
 * Legacy is meta-progression: it lives outside the run, so there is no
 * GameAction that spends it and the reducer would have nowhere to put one.
 * This is the one sanctioned direct write — mutate the live state object,
 * persist it to localStorage, then dispatch a no-op ADVANCE_TUTORIAL that
 * re-sets `tutorialStep` to the value it already holds. That dispatch changes
 * nothing about the run; it exists purely to bump the store's revision counter
 * so every useSim selector re-runs and this screen redraws with the new total.
 */
function spendLegacy(perk: LegacyPerk): void {
  const st = useStore.getState();
  const s = st.game.state;
  if (s.legacy.spent.includes(perk.id)) return;
  if (s.legacy.points < perk.cost) return;
  s.legacy.spent = [...s.legacy.spent, perk.id];
  s.legacy.points -= perk.cost;
  saveLegacy(s.legacy);
  st.dispatch({ type: 'ADVANCE_TUTORIAL', step: s.tutorialStep });
}

/**
 * The sim banks legacy points inside `retire()` and states the figure in the
 * run log. There is no exported helper for the formula and the UI will not
 * re-derive it, so we read back the sim's own sentence. A collapsed run never
 * reaches `retire()` — nothing was banked, and the screen says so out loud
 * rather than showing a silent zero.
 */
function bankedThisRun(log: LogEntry[]): number | null {
  for (const entry of log) {
    const m = /(\d+)\s+legacy points banked/.exec(entry.text);
    if (m) return Number(m[1]);
  }
  return null;
}

// ── The seal ────────────────────────────────────────────────────────────────

type EndKind = 'accredited' | 'collapsed' | 'retired';

const SEAL: Record<EndKind, { color: string; glyph: string; ring: string }> = {
  accredited: { color: '#E8A94C', glyph: '🕯️', ring: 'CENTER OF EXCELLENCE · CENTER OF EXCELLENCE · ' },
  retired: { color: '#8B6B8F', glyph: '🌙', ring: 'A GOOD PLACE TO STOP · A GOOD PLACE TO STOP · ' },
  collapsed: { color: '#8FAF8B', glyph: '🌿', ring: 'THE DOOR CLOSED · THE WORK DID NOT · ' },
};

function Seal({ kind, spin }: { kind: EndKind; spin: boolean }) {
  const { color, glyph, ring } = SEAL[kind];
  const scallops = 26;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`${kind} seal`}>
      <defs>
        <radialGradient id="seal-face" cx="36%" cy="28%">
          <stop offset="0%" stopColor="#FAF5EC" />
          <stop offset="100%" stopColor={`color-mix(in oklab, ${color} 34%, #FAF5EC)`} />
        </radialGradient>
        <path
          id="seal-ring-path"
          d="M75 75 m -47 0 a 47 47 0 1 1 94 0 a 47 47 0 1 1 -94 0"
          fill="none"
        />
      </defs>

      {/* ribbon tails */}
      <path d="M60 112 L52 146 L67 137 L75 148 L75 112 Z" fill={color} opacity="0.9" />
      <path d="M90 112 L98 146 L83 137 L75 148 L75 112 Z" fill={color} opacity="0.68" />

      {/* scalloped medal edge */}
      <g fill={color} opacity="0.85">
        {Array.from({ length: scallops }).map((_, i) => {
          const a = (i / scallops) * Math.PI * 2;
          return <circle key={i} cx={75 + Math.cos(a) * 58} cy={75 + Math.sin(a) * 58} r="6.4" />;
        })}
      </g>
      <circle cx="75" cy="75" r="58" fill={color} />
      <circle cx="75" cy="75" r="52" fill="url(#seal-face)" stroke="rgba(30,58,58,0.28)" strokeWidth="1.2" />

      {/* ring text */}
      <g className={spin ? 'seal-ring-spin' : ''} style={{ transformOrigin: '75px 75px' }}>
        <text
          fill="var(--color-ink-soft)"
          fontSize="8.4"
          fontFamily="var(--font-mono)"
          letterSpacing="1.6"
          fontWeight="700"
        >
          <textPath href="#seal-ring-path" startOffset="0">
            {ring}
          </textPath>
        </text>
      </g>

      {/* laurel */}
      <g stroke="var(--color-sage-deep)" strokeWidth="1.6" fill="none" opacity="0.7">
        <path d="M46 92 q -8 -18 2 -32" />
        <path d="M104 92 q 8 -18 -2 -32" />
      </g>
      <circle cx="75" cy="75" r="34" fill="none" stroke="rgba(30,58,58,0.16)" strokeWidth="1" />
      <text x="75" y="86" textAnchor="middle" fontSize="30" aria-hidden>
        {glyph}
      </text>
    </svg>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function AlumniFrame({ a }: { a: AlumniRecord }) {
  return (
    <li className="flex flex-col items-center text-center w-[74px]">
      <Portrait
        seed={a.portrait}
        size={54}
        mood="happy"
        glow
        title={`${a.handle} · finished on day ${a.curedDay}`}
      />
      <span className="display text-[0.76rem] text-ink leading-tight mt-1">{a.firstName}</span>
      <span className="tabular text-[0.6rem] text-ink-faint leading-tight">{a.handle}</span>
      <span className="text-[0.58rem] text-ink-faint leading-tight">
        {CONDITION_LABELS[a.condition] ?? a.condition}
      </span>
    </li>
  );
}

function TeamRow({ t }: { t: Therapist }) {
  const departed = t.status === 'departed';
  const stay = t.tenure === 1 ? '1 day' : `${t.tenure} days`;
  return (
    <li className="card-warm px-3 py-2.5 flex items-start gap-2.5">
      <Portrait seed={t.portrait} size={40} mood={departed ? 'neutral' : 'happy'} title={t.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="display text-[0.92rem] text-ink leading-tight">{t.name}</span>
          {t.isPlayer ? <Chip color="var(--color-amber-deep)">you</Chip> : null}
          {departed ? <Chip color="var(--color-brick)">left</Chip> : null}
        </div>
        <div className="text-[0.68rem] text-ink-faint leading-snug">{modalityName(t.modality)}</div>
        <div className="tabular text-[0.68rem] text-ink-soft leading-snug mt-0.5">
          {t.isPlayer
            ? `here from the first morning · ${stay}`
            : departed
              ? `joined day ${t.hiredDay} · stayed ${stay}`
              : `joined day ${t.hiredDay} · ${stay} and never handed in a notice`}
        </div>
        <div className="tabular text-[0.66rem] text-ink-faint leading-snug">
          {t.stats.sessions} session{t.stats.sessions === 1 ? '' : 's'} held · {t.stats.cures} seen
          all the way through
        </div>
      </div>
    </li>
  );
}

function PerkCard({
  perk,
  owned,
  affordable,
}: {
  perk: LegacyPerk;
  owned: boolean;
  affordable: boolean;
}) {
  return (
    <li className="card-warm px-3 py-2.5 flex flex-col gap-2" style={{ opacity: owned ? 0.72 : 1 }}>
      <div className="flex items-start gap-2">
        <span className="text-[1.15rem] leading-none mt-0.5" aria-hidden>
          {perk.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="display text-[0.92rem] text-ink leading-tight">{perk.name}</div>
          <p className="text-[0.72rem] text-ink-soft leading-snug mt-0.5">{perk.blurb}</p>
        </div>
      </div>
      {owned ? (
        <Chip color="var(--color-sage-deep)">Kept · carries into every run</Chip>
      ) : (
        <Button
          variant={affordable ? 'sage' : 'ghost'}
          size="sm"
          disabled={!affordable}
          onClick={() => spendLegacy(perk)}
          aria-label={`Spend ${perk.cost} legacy points on ${perk.name}`}
        >
          Keep it · {perk.cost} pts
        </Button>
      )}
    </li>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-t hairline">
      <div className="w-[104px] shrink-0 text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint pt-[0.15rem]">
        {label}
      </div>
      <div className="flex-1 min-w-0 text-[0.79rem] text-ink-soft leading-relaxed">{children}</div>
    </div>
  );
}

// ── The screen ──────────────────────────────────────────────────────────────

export function EndScreen() {
  const kind = useSim((s) => s.ended?.kind);
  const endedDay = useSim((s) => s.ended?.day ?? s.day);
  const practiceName = useSim((s) => s.practiceName);
  const difficulty = useSim((s) => s.difficulty);
  const philosophy = useSim((s) => s.philosophy);
  const calm = useSim((s) => s.settings.calmMode);
  const reduced = useSim((s) => s.settings.reducedMotion);
  const alumniCount = useSim((s) => s.alumni.length);
  const banked = useSim((s) => bankedThisRun(s.log));

  const stats = useSimShallow((s) => ({
    daysPlayed: s.stats.daysPlayed || s.day,
    sessions: s.stats.sessionsRun,
    cures: s.stats.cures,
    complexCures: s.stats.complexCures,
    breakthroughs: s.stats.breakthroughs,
    dropouts: s.stats.dropouts,
    revenue: s.stats.totalRevenue,
    expenses: s.stats.totalExpenses,
    avgQuality: s.stats.qualityCount ? s.stats.qualitySum / s.stats.qualityCount : 0,
    maxStreak: s.stats.maxStreak,
    practiceLevel: s.practiceLevel,
  }));

  const peak = useSimShallow((s) => {
    let rep = s.reputation;
    let day = s.day;
    for (const h of s.stats.history) {
      if (h.reputation > rep) {
        rep = h.reputation;
        day = h.day;
      }
    }
    return { rep, day };
  });

  /**
   * These selectors return the sim's own object references (only the containing
   * array is new), so `useShallow` settles after one pass. Building fresh
   * objects inside a shallow selector would never compare equal and would spin
   * the render loop forever.
   */
  const team = useSimShallow<Therapist[]>((s) =>
    [...s.therapists].sort(
      (a, b) => Number(!!b.isPlayer) - Number(!!a.isPlayer) || a.hiredDay - b.hiredDay,
    ),
  );
  const programs = useSimShallow<ProgramInstance[]>((s) => s.programs);
  const milestones = useSimShallow<string[]>((s) => s.milestonesEarned);
  const wall = useSimShallow<AlumniRecord[]>((s) =>
    [...s.alumni].sort((a, b) => b.curedDay - a.curedDay).slice(0, 12),
  );
  const legacy = useSimShallow((s) => ({
    points: s.legacy.points,
    // `spendLegacy` replaces this array rather than mutating it, so the
    // reference changing is exactly the signal we want.
    spent: s.legacy.spent,
    runsCompleted: s.legacy.runsCompleted,
  }));

  /** Move focus into the ceremony so the keyboard lands somewhere sensible. */
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (kind) headingRef.current?.focus();
  }, [kind]);

  if (!kind) return null;

  const animate = !calm && !reduced;
  const q = Math.round(stats.avgQuality * 100);
  const ph = philosophy ? philosophyById[philosophy] : undefined;
  const diff = DIFFICULTIES[difficulty];
  const staffCount = team.filter((t) => !t.isPlayer).length;

  const eyebrow =
    kind === 'accredited'
      ? 'The commission voted'
      : kind === 'retired'
        ? 'You closed the book yourself'
        : 'The practice closed';

  const title =
    kind === 'accredited'
      ? 'Center of Excellence'
      : kind === 'retired'
        ? 'A Good Place to Stop'
        : 'The Lamps Go Out';

  // Every figure below is read from state; nothing here is decorative arithmetic.
  const citation =
    kind === 'accredited' ? (
      <>
        Let the record show that <span className="text-ink font-bold">{practiceName}</span>, in{' '}
        {stats.daysPlayed} days of ordinary evenings, held{' '}
        <span className="tabular">{stats.sessions}</span> sessions at an average quality of{' '}
        <span className="tabular">{q}%</span>, and brought{' '}
        <span className="tabular">{stats.cures}</span> course
        {stats.cures === 1 ? '' : 's'} of care to a good ending —{' '}
        <span className="tabular">{stats.complexCures}</span> of them the complex kind that other
        clinics decline. The commission notes {milestones.length} milestone
        {milestones.length === 1 ? '' : 's'} on file, a peak standing of{' '}
        <span className="tabular">{Math.round(peak.rep)}</span> reached on day {peak.day}, and{' '}
        {alumniCount} frame{alumniCount === 1 ? '' : 's'} on the wall beside the door. The brass
        plate is to be hung low, at exactly the height a child can read.
      </>
    ) : kind === 'retired' ? (
      <>
        You stopped on day {endedDay}, which is a different thing from being stopped.{' '}
        <span className="text-ink font-bold">{practiceName}</span> ran for {stats.daysPlayed} days
        and {stats.sessions} sessions. {stats.cures} {stats.cures === 1 ? 'person' : 'people'}{' '}
        finished here, {stats.breakthroughs} of those hours turned all the way over mid-sentence, and{' '}
        {staffCount === 0
          ? 'you carried the whole caseload yourself'
          : `${staffCount} clinician${staffCount === 1 ? '' : 's'} came through as staff and left as somebody's favourite therapist`}
        . The chairs stay where they are. Somebody else will want this room, and it is a good room.
      </>
    ) : (
      <>
        The books gave out on day {endedDay}, and{' '}
        <span className="text-ink font-bold">{practiceName}</span> closed. That part is true and
        there is no softening it.{' '}
        <span className="text-ink font-bold">
          {alumniCount} {alumniCount === 1 ? 'person' : 'people'} finished treatment here, and they
          are still finished.
        </span>{' '}
        Nothing that happened to a bank balance reaches back into their week. {stats.sessions}{' '}
        session{stats.sessions === 1 ? '' : 's'} happened. They happened. Take the lamp with you.
      </>
    );

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-title"
      style={{
        background:
          'radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--color-amber) 26%, transparent), transparent 58%), linear-gradient(180deg, var(--color-night-soft) 0%, var(--color-night) 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[880px] px-4 py-8 sm:py-12">
        {/* ── Ceremony ─────────────────────────────────────────────────── */}
        <header className={`flex flex-col items-center text-center ${animate ? 'pop-in' : ''}`}>
          <div className={animate ? 'animate-float juice-only' : ''}>
            <Seal kind={kind} spin={animate} />
          </div>
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-amber mt-3">
            {eyebrow}
          </span>
          <h1
            id="end-title"
            ref={headingRef}
            tabIndex={-1}
            className="display text-[2.1rem] sm:text-[2.6rem] leading-tight text-paper mt-1 outline-none"
          >
            {title}
          </h1>
          <p className="display text-[1.05rem] italic text-amber-glow mt-0.5">{practiceName}</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
            <Chip color="var(--color-amber)">{diff.name}</Chip>
            <Chip color="var(--color-amber)">Day {endedDay}</Chip>
            <Chip color="var(--color-amber)">Practice level {stats.practiceLevel}</Chip>
            {ph ? (
              <Chip color="var(--color-amber)">
                <span aria-hidden>{ph.icon}</span>
                {ph.name}
              </Chip>
            ) : null}
          </div>
        </header>

        <article className={`paper px-5 py-4 mt-6 ${animate ? 'rise-in' : ''}`}>
          <p className="display text-[0.98rem] leading-[1.75] text-ink-soft">{citation}</p>
        </article>

        {/* ── Run summary ──────────────────────────────────────────────── */}
        <section className="paper px-5 py-4 mt-4">
          <SectionHeading sub="Everything the ledger kept, in one place, for the last time.">
            The run, end to end
          </SectionHeading>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(238px, 1fr))' }}
          >
            <StatTile label="Days open" value={stats.daysPlayed} sub={`closed on day ${endedDay}`} />
            <StatTile
              label="Good endings"
              value={stats.cures}
              sub={`${stats.complexCures} of them complex`}
              tone="good"
            />
            <StatTile
              label="Sessions held"
              value={stats.sessions}
              sub={`${stats.breakthroughs} broke something open`}
            />
            <StatTile
              label="Average quality"
              value={`${q}%`}
              sub={stats.sessions ? 'across every hour worked' : 'no sessions ran'}
              tone="amber"
            />
            <StatTile
              label="Peak reputation"
              value={Math.round(peak.rep)}
              sub={`highest on day ${peak.day}`}
              tone="amber"
            />
            <StatTile
              label="Total revenue"
              value={formatMoney(stats.revenue)}
              sub={`${formatMoney(stats.expenses)} went back out`}
              tone={stats.revenue >= stats.expenses ? 'good' : 'bad'}
            />
          </div>

          <div className="mt-3">
            <Line label="Programs">
              {programs.length === 0 ? (
                <span className="text-ink-faint">
                  You never ran one. The whole practice fit in the fifty-minute hour.
                </span>
              ) : (
                <ul className="list-none p-0 m-0 flex flex-wrap gap-1.5">
                  {programs.map((p) => {
                    const def = programById[p.id];
                    return (
                      <li key={p.id}>
                        <Chip
                          color={def?.color ?? 'var(--color-sage-deep)'}
                          title={`Started day ${p.startedDay} · brought in ${formatMoney(p.lifetimeCash)}`}
                        >
                          <span aria-hidden>{def?.icon ?? '•'}</span>
                          {def?.name ?? p.id}
                          {p.active ? '' : ' (wound down)'}
                        </Chip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Line>
            <Line label="Milestones">
              {milestones.length === 0 ? (
                <span className="text-ink-faint">
                  Nothing taped to the fridge. It was a working practice, not a decorated one.
                </span>
              ) : (
                <ul className="list-none p-0 m-0 flex flex-wrap gap-1.5">
                  {milestones.map((id) => {
                    const m = milestoneById[id];
                    return (
                      <li key={id}>
                        <Chip color="var(--color-amber-deep)" title={m?.blurb}>
                          <span aria-hidden>{m?.icon ?? '★'}</span>
                          {m?.name ?? id}
                        </Chip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Line>
            <Line label="Held on">
              Longest run of good sessions: {stats.maxStreak}. People who stopped coming:{' '}
              {stats.dropouts}. Both of those are part of the record.
            </Line>
          </div>
        </section>

        {/* ── The team ─────────────────────────────────────────────────── */}
        <section className="paper px-5 py-4 mt-4">
          <SectionHeading sub="Who worked here, and for how long.">Everyone on the payroll</SectionHeading>
          <ul
            className="list-none p-0 m-0 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))' }}
          >
            {team.map((t) => (
              <TeamRow key={t.id} t={t} />
            ))}
          </ul>
        </section>

        {/* ── The wall ─────────────────────────────────────────────────── */}
        <section className="paper px-5 py-4 mt-4">
          <SectionHeading
            sub={
              alumniCount > wall.length
                ? `The last ${wall.length} of ${alumniCount}. The rest are still on the wall by the door.`
                : 'Everyone who finished here.'
            }
          >
            The wall
          </SectionHeading>
          {wall.length === 0 ? (
            <p className="text-[0.8rem] text-ink-faint leading-relaxed">
              Nobody made it all the way through this time. The hours still happened — somebody sat
              in that chair and was listened to properly, which is not nothing, even when it does
              not finish.
            </p>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-wrap gap-x-3 gap-y-4 justify-center">
              {wall.map((a) => (
                <AlumniFrame key={a.id} a={a} />
              ))}
            </ul>
          )}
        </section>

        {/* ── Legacy ───────────────────────────────────────────────────── */}
        <section className="paper px-5 py-4 mt-4">
          <SectionHeading
            sub="What this run leaves to the next one. Spend it now or bank it — points keep."
            right={
              <div className="text-right">
                <div className="display text-[1.6rem] leading-none text-amber-deep tabular">
                  {legacy.points}
                </div>
                <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint">
                  points to spend
                </div>
              </div>
            }
          >
            Legacy
          </SectionHeading>

          <p className="text-[0.79rem] text-ink-soft leading-relaxed">
            {banked === null ? (
              <>
                A practice that closes banks nothing new — points are counted when you finish a run
                on your own terms, and this one did not get the chance. Everything you had already
                put away is untouched, and run {legacy.runsCompleted + 1} starts whenever you do.
              </>
            ) : (
              <>
                <span className="text-ink font-bold tabular">{banked}</span> point
                {banked === 1 ? '' : 's'} banked from this run, on top of what was already there.
                That is {legacy.runsCompleted} run{legacy.runsCompleted === 1 ? '' : 's'} completed
                and carried forward.
              </>
            )}
          </p>

          <Divider label="Carry into the next practice" />

          <ul
            className="list-none p-0 m-0 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(238px, 1fr))' }}
          >
            {LEGACY_PERKS.map((perk) => (
              <PerkCard
                key={perk.id}
                perk={perk}
                owned={legacy.spent.includes(perk.id)}
                affordable={legacy.points >= perk.cost}
              />
            ))}
          </ul>
        </section>

        {/* ── Out the door ─────────────────────────────────────────────── */}
        <footer className="flex flex-col items-center gap-2.5 mt-7 pb-4">
          <Button
            variant="primary"
            size="lg"
            onClick={() => useStore.getState().setUi({ screen: 'title' })}
          >
            Start a new run
          </Button>
          <p className="text-[0.72rem] text-center max-w-[46ch] leading-relaxed" style={{ color: 'var(--color-paper-deep)' }}>
            A new practice, a new town, the same lamp. Anything you kept above will already be
            waiting on the first morning.
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes seal-ring-turn { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .seal-ring-spin { animation: seal-ring-turn 44s linear infinite; }
      `}</style>
    </div>
  );
}
