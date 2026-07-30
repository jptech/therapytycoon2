import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CONDITION_LABELS, FOCUSES, SEVERITY_LABELS } from '../sim/balance';
import { capacity, dailyExpenses } from '../sim/engine';
import { computeExceptions, dailyRevenueForecast, type Exception } from '../sim/scheduler';
import { formatDay, formatMoney } from '../sim/util';
import { useDispatch, useSim, useSimShallow, useStore } from '../store';
import type { GameState, OutcomeGrade, SessionResult } from '../sim/types';
import { Button, Chip, Divider, EdgeRule, EmptyState, Meter, SectionHeading, Tooltip } from './primitives';
import { Plant, Portrait } from './Portrait';
import { dayCardDock, getPanelWidth, subscribePanelWidth, type DayCardDock } from './dock';

/**
 * The two ends of a day. Both are pages in a notebook rather than dialogs — the
 * office is still there behind them, and panels dock alongside them.
 */

const GRADE_STYLE: Record<OutcomeGrade, { label: string; color: string }> = {
  breakthrough: { label: 'Breakthrough', color: 'var(--color-amber-deep)' },
  excellent: { label: 'Excellent', color: 'var(--color-sage-deep)' },
  good: { label: 'Good', color: 'var(--color-sage-deep)' },
  mixed: { label: 'Mixed', color: 'var(--color-ink-faint)' },
  poor: { label: 'Hard hour', color: 'var(--color-brick)' },
};

const EXCEPTION_ICON: Record<Exception['kind'], string> = {
  client_at_risk: '🪴',
  unbooked: '📅',
  therapist_strain: '🕯️',
  low_morale: '☁️',
  poach: '📮',
  cash: '💵',
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where this page should sit given whatever panel is open. See src/ui/dock.ts —
 * the panel measures itself, this reads the measurement, and the arithmetic in
 * between is pure and tested.
 */
function useDayCardDock(): DayCardDock {
  const panelWidth = useSyncExternalStore(subscribePanelWidth, getPanelWidth, () => 0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return useMemo(() => dayCardDock(viewportWidth, panelWidth), [viewportWidth, panelWidth]);
}

function NotebookPage({
  eyebrow,
  title,
  sub,
  children,
  footer,
  maxWidth = 660,
}: {
  eyebrow: string;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: number;
}) {
  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const dock = useDayCardDock();
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center px-4 pt-[68px] pb-4"
      style={{
        background: 'color-mix(in oklab, var(--color-night) 46%, transparent)',
        backdropFilter: 'blur(2.5px)',
        WebkitBackdropFilter: 'blur(2.5px)',
        paddingLeft: `calc(1rem + ${dock.leftInset}px)`,
        paddingRight: `calc(1rem + ${dock.rightInset}px)`,
        transition: calm ? undefined : 'padding 0.38s var(--ease-warm)',
      }}
    >
      {/* Too narrow to dock: the page steps back rather than being shredded into
          a column of orphaned words. Nothing is dismissed — close the panel and
          it is exactly where you left it. */}
      <div
        className={`paper relative w-full max-h-full flex flex-col overflow-hidden ${calm ? '' : 'tt-rise-settle'}`}
        style={{
          maxWidth,
          opacity: dock.yielded ? 0.14 : 1,
          // The entrance keyframes are `both`, so their final frame keeps
          // winning over an inline opacity. Standing the animation down is what
          // lets the page actually fade — and re-arming it means the page rises
          // back into place when the panel closes, rather than blinking on.
          animation: dock.yielded ? 'none' : undefined,
          transition: calm ? undefined : 'opacity 0.3s var(--ease-warm)',
        }}
        aria-hidden={dock.yielded || undefined}
        inert={dock.yielded}
      >
        {/* The lamp, hanging over the top-left of the page. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-32 pointer-events-none"
          style={{
            background:
              'radial-gradient(58% 130% at 24% -34%, color-mix(in oklab, var(--color-amber-glow) 40%, transparent) 0%, transparent 72%)',
          }}
        />
        {/* The margin rule of a well-used notebook, and its punch marks. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-10 w-px pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-brick) 34%, transparent) 5%, color-mix(in oklab, var(--color-brick) 34%, transparent) 95%, transparent 100%)',
          }}
        />
        <div aria-hidden className="absolute left-[1.05rem] inset-y-0 pointer-events-none flex flex-col justify-evenly">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-[9px] h-[9px] rounded-full"
              style={{
                background: 'color-mix(in oklab, var(--color-ink) 8%, transparent)',
                boxShadow:
                  'inset 0 1px 2px color-mix(in oklab, var(--color-ink) 26%, transparent), 0 1px 0 rgba(255,253,246,0.8)',
              }}
            />
          ))}
        </div>

        <header className="relative shrink-0 pl-[3.6rem] pr-5 pt-4 pb-3">
          <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-ink-faint">{eyebrow}</div>
          <h2 className="display text-[1.62rem] leading-[1.1] text-ink mt-0.5 tracking-[-0.02em]">{title}</h2>
          {sub ? (
            <p className="text-[0.815rem] text-ink-soft leading-[1.6] mt-1.5 max-w-[58ch] [text-wrap:pretty]">{sub}</p>
          ) : null}
        </header>
        <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain pl-[3.6rem] pr-5 pb-4">
          {children}
        </div>
        <footer className="relative shrink-0 pl-[3.6rem] pr-5 py-3 flex items-center gap-2.5 flex-wrap">
          <EdgeRule top />
          {footer}
        </footer>
      </div>
    </div>
  );
}

/** Small ledger figure: label above, number below. */
function Figure({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: ReactNode;
}) {
  const body = (
    <div className="card-warm px-3 py-2 min-w-[118px]">
      <div className="text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-ink-faint whitespace-nowrap">
        {label}
      </div>
      <div
        className="tabular text-[1.18rem] font-bold leading-tight mt-0.5 tracking-[-0.03em]"
        style={{ color: color ?? 'var(--color-ink)', textShadow: '0 1px 0 rgba(255,253,246,0.85)' }}
      >
        {value}
      </div>
    </div>
  );
  return hint ? (
    <Tooltip side="top" content={hint}>
      {body}
    </Tooltip>
  ) : (
    body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Morning
// ─────────────────────────────────────────────────────────────────────────────

/** One honest line about how the practice is doing, assembled from state. */
function weatherLine(s: GameState): string {
  const parts: string[] = [];

  const waiting = s.clients.filter((c) => c.status === 'waitlist').length;
  if (waiting === 0) parts.push('Nobody on the waitlist — enjoy the quiet');
  else if (waiting === 1) parts.push('one person is waiting on a first appointment');
  else parts.push(`${waiting} people are waiting on a first appointment`);

  const drifting = s.clients.filter((c) => c.status === 'active' && c.atRisk).length;
  if (drifting === 1) parts.push('one client is drifting');
  else if (drifting > 1) parts.push(`${drifting} clients are drifting`);

  const last = s.stats.history[s.stats.history.length - 1];
  if (last) {
    const net = last.revenue - last.expenses;
    parts.push(`yesterday closed ${formatMoney(net, true)}`);
  }

  for (const t of s.therapists) {
    if (t.status === 'training') parts.push(`${t.name} is away training for ${t.statusDays} more days`);
    else if (t.status === 'sabbatical') parts.push(`${t.name} is on sabbatical for ${t.statusDays} more days`);
    else if (t.status === 'conference') parts.push(`${t.name} is at a conference for ${t.statusDays} more days`);
  }

  return `${parts.join(' · ')}.`;
}

export function MorningBrief() {
  const dispatch = useDispatch();
  const openPanel = useStore((s) => s.openPanel);
  const setUi = useStore((s) => s.setUi);

  const phase = useSim((s) => s.dayPhase);
  const day = useSim((s) => s.day);
  const dayLabel = useSim((s) => formatDay(s.day));
  const weather = useSim((s) => weatherLine(s));

  const booked = useSim((s) => s.schedule.filter((x) => x.status !== 'cancelled').length);
  const autoBooked = useSim((s) => s.schedule.filter((x) => x.status !== 'cancelled' && x.auto).length);
  const unbooked = useSim(
    (s) =>
      s.clients.filter(
        (c) => c.status === 'active' && !s.schedule.some((x) => x.clientId === c.id && x.status !== 'cancelled'),
      ).length,
  );
  const forecastRevenue = useSim((s) => dailyRevenueForecast(s));
  const forecastExpenses = useSim((s) => dailyExpenses(s));

  const activeCount = useSim((s) => s.clients.filter((c) => c.status === 'active').length);
  const cap = useSim((s) => capacity(s));
  const autoScheduler = useSim((s) => s.act >= 3 && s.upgrades.includes('up_auto_scheduler'));
  const autoSchedulerOn = useSim((s) => !!s.flags.autoSchedule);

  const waitlist = useSimShallow((s) => s.clients.filter((c) => c.status === 'waitlist'));

  if (phase !== 'morning_brief') return null;

  const week = Math.floor((day - 1) / 7) + 1;
  const atCapacity = activeCount >= cap;
  const net = forecastRevenue - forecastExpenses;

  return (
    <NotebookPage
      eyebrow={dayLabel}
      title={`Day ${day} · Week ${week}`}
      sub={weather}
      footer={
        <>
          <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'START_DAY' })}>
            Open the doors
          </Button>
          <Button onClick={() => dispatch({ type: 'AUTOFILL_SCHEDULE' })} disabled={unbooked === 0}>
            Auto-fill the day
          </Button>
          <Button onClick={() => openPanel('schedule')}>Open the schedule</Button>
          {autoScheduler ? <Button onClick={() => setUi({ panel: 'policies' })}>Review policies</Button> : null}
        </>
      }
    >
      {autoScheduler ? (
        <div
          className="tt-hand px-3 py-2 mb-3 text-[0.79rem] leading-[1.5] text-ink"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--color-sage) 9%, transparent) 0%, color-mix(in oklab, var(--color-sage) 17%, transparent) 100%)',
            boxShadow:
              'inset 0 0 0 1px color-mix(in oklab, var(--color-sage) 30%, transparent), inset 0 1px 0 rgba(255,253,246,0.6)',
          }}
        >
          <span aria-hidden className="mr-1.5">
            ⚙️
          </span>
          {!autoSchedulerOn ? (
            <>
              The auto-scheduler is installed but switched off. Today is yours to book by hand.
            </>
          ) : autoBooked > 0 ? (
            <>
              The scheduler laid out <b>{autoBooked}</b> session{autoBooked === 1 ? '' : 's'} overnight from your
              policies.{' '}
              {unbooked === 0
                ? 'Nobody was left over.'
                : unbooked === 1
                  ? 'One client it could not place is still open.'
                  : `${unbooked} clients it could not place are still open.`}
            </>
          ) : (
            <>
              The scheduler ran overnight and booked nothing — your policies left it no legal pairing. Worth a look
              before you open.
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Figure
          label="Booked today"
          value={`${booked}`}
          hint={
            unbooked > 0 ? (
              <>
                {unbooked} active client{unbooked === 1 ? '' : 's'} still {unbooked === 1 ? 'has' : 'have'} no hour
                today.
              </>
            ) : (
              <>Everyone on the caseload has an hour today.</>
            )
          }
        />
        <Figure
          label="Fees expected"
          value={formatMoney(forecastRevenue)}
          color="var(--color-sage-deep)"
          hint={<>The sum of today&rsquo;s booked session fees, if everybody shows up.</>}
        />
        <Figure
          label="Running costs"
          value={formatMoney(forecastExpenses)}
          color="var(--color-brick)"
          hint={<>Salaries, rent, per-client overhead and program upkeep, taken when you close up tonight.</>}
        />
        <Figure
          label="If today holds"
          value={formatMoney(net, true)}
          color={net >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)'}
          hint={<>Fees expected minus running costs. Sessions that don&rsquo;t happen don&rsquo;t pay.</>}
        />
      </div>

      {waitlist.length > 0 ? (
        <>
          <Divider label="At the door" />
          <SectionHeading
            sub={
              atCapacity
                ? `You are at capacity — practice level supports ${cap} active clients. Someone has to finish before someone else can start.`
                : `Room for ${cap - activeCount} more on the caseload.`
            }
          >
            Waiting to be seen
          </SectionHeading>
          <div className="flex flex-col gap-1.5">
            {waitlist.map((c) => (
              <div key={c.id} className="card-warm px-2.5 py-2 flex items-center gap-2.5">
                <Portrait seed={c.portrait} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[0.84rem] font-bold text-ink">{c.handle}</span>
                    <span className="tabular text-[0.7rem] text-ink-faint">{c.age}</span>
                    {c.complex ? <Chip color="var(--color-plum)">Complex</Chip> : null}
                    {c.payment === 'sliding_scale' ? <Chip color="var(--color-sage)">Sliding scale</Chip> : null}
                  </div>
                  <div className="text-[0.7rem] text-ink-faint leading-snug truncate">
                    {CONDITION_LABELS[c.condition]} · {SEVERITY_LABELS[c.severity]} · {formatMoney(c.rate)} an hour
                  </div>
                </div>
                <Button
                  variant="sage"
                  size="sm"
                  onClick={() => dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id })}
                  disabled={atCapacity}
                  title={atCapacity ? 'No room on the caseload yet.' : `Take ${c.handle} on.`}
                >
                  Accept
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Divider label="At the door" />
          <EmptyState
            icon="🚪"
            title="Nobody on the waitlist."
            body="Enjoy the quiet. Referrals arrive overnight — reputation and community trust decide how many."
          />
        </>
      )}
    </NotebookPage>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Evening
// ─────────────────────────────────────────────────────────────────────────────

function GradePill({ result }: { result: SessionResult }) {
  const g = GRADE_STYLE[result.grade];
  return (
    <Tooltip
      side="left"
      content={
        <span className="block">
          <b className="block mb-1">Why this hour went the way it did</b>
          {result.reasons.map((r, i) => (
            <span key={i} className="flex items-baseline justify-between gap-3">
              <span
                style={{
                  color:
                    r.kind === 'good'
                      ? 'var(--color-sage-deep)'
                      : r.kind === 'bad'
                        ? 'var(--color-brick)'
                        : 'var(--color-ink-soft)',
                }}
              >
                {r.label}
              </span>
              <span className="tabular text-ink-faint">
                {r.delta >= 0 ? '+' : '−'}
                {Math.abs(Math.round(r.delta * 100))}
              </span>
            </span>
          ))}
        </span>
      }
    >
      <span
        className="chip shrink-0"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${g.color} 11%, transparent) 0%, color-mix(in oklab, ${g.color} 18%, transparent) 100%)`,
          borderColor: `color-mix(in oklab, ${g.color} 38%, transparent)`,
          color: g.color,
        }}
      >
        {g.label}
      </span>
    </Tooltip>
  );
}

/** The ledger columns, declared once so the header and the rows agree. */
const COL_GRADE = 106;
const COL_DELTA = 54;
const COL_FEES = 66;

function ResultHeader() {
  return (
    <div className="flex items-center gap-2.5 pb-1 text-[0.55rem] font-extrabold uppercase tracking-[0.12em] text-ink-faint">
      <span className="w-[28px] shrink-0" aria-hidden />
      <span className="flex-1 min-w-0">Who, and with whom</span>
      <span className="shrink-0 text-right" style={{ width: COL_GRADE }}>
        How it went
      </span>
      <span className="shrink-0 text-right" style={{ width: COL_DELTA }}>
        Progress
      </span>
      <span className="shrink-0 text-right" style={{ width: COL_FEES }}>
        Fees
      </span>
    </div>
  );
}

function ResultRow({ result }: { result: SessionResult }) {
  const handle = useSim((s) => s.clients.find((c) => c.id === result.clientId)?.handle ?? '—');
  const age = useSim((s) => s.clients.find((c) => c.id === result.clientId)?.age ?? 0);
  const seed = useSimShallow((s) => s.clients.find((c) => c.id === result.clientId)?.portrait);
  const therapistName = useSim((s) => s.therapists.find((t) => t.id === result.therapistId)?.name ?? 'the practice');
  const focus = FOCUSES[result.focus];

  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b hairline last:border-b-0">
      <span className="w-[28px] shrink-0">{seed ? <Portrait seed={seed} size={28} /> : null}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[0.82rem] font-bold text-ink truncate">{handle}</span>
          <span className="tabular text-[0.68rem] text-ink-faint">{age}</span>
          <span title={`${focus.name} — ${focus.blurb}`} aria-label={focus.name}>
            {focus.icon}
          </span>
          {result.breakthrough ? <span title="Breakthrough">✨</span> : null}
          {result.regression ? <span title="Lost ground">↘</span> : null}
        </div>
        <div className="text-[0.67rem] text-ink-faint leading-snug truncate">with {therapistName}</div>
      </div>
      <span className="shrink-0 flex justify-end" style={{ width: COL_GRADE }}>
        <GradePill result={result} />
      </span>
      <span
        className="tabular text-[0.76rem] font-bold text-right shrink-0"
        style={{
          width: COL_DELTA,
          color: result.progressDelta >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)',
        }}
        title="Treatment progress moved this much, out of 100."
      >
        {result.progressDelta >= 0 ? '+' : '−'}
        {Math.abs(result.progressDelta).toFixed(1)}
      </span>
      <span
        className="tabular text-[0.76rem] text-right text-ink-soft shrink-0"
        style={{ width: COL_FEES }}
      >
        {formatMoney(result.revenue)}
      </span>
    </div>
  );
}

function StaffRow({ therapistId, sessions }: { therapistId: string; sessions: number }) {
  const name = useSim((s) => s.therapists.find((t) => t.id === therapistId)?.name ?? '');
  const energy = useSim((s) => s.therapists.find((t) => t.id === therapistId)?.energy ?? 0);
  const maxEnergy = useSim((s) => s.therapists.find((t) => t.id === therapistId)?.maxEnergy ?? 100);
  const morale = useSim((s) => s.therapists.find((t) => t.id === therapistId)?.morale ?? 0);
  const strain = useSim((s) => s.therapists.find((t) => t.id === therapistId)?.strain ?? 0);
  const seed = useSimShallow((s) => s.therapists.find((t) => t.id === therapistId)?.portrait);
  const low = energy < maxEnergy * 0.3;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {seed ? <Portrait seed={seed} size={30} mood={low ? 'tired' : 'neutral'} /> : null}
      <div className="min-w-0 w-[120px]">
        <div className="text-[0.78rem] font-bold text-ink truncate">{name}</div>
        <div className="text-[0.66rem] text-ink-faint">
          {sessions} hour{sessions === 1 ? '' : 's'} today
        </div>
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2.5">
        <Meter
          value={energy}
          max={maxEnergy}
          height={6}
          color="var(--color-plum)"
          label="Energy"
          right={`${Math.round(energy)}/${maxEnergy}`}
        />
        <Meter
          value={morale}
          max={100}
          height={6}
          color="var(--color-amber)"
          label="Morale"
          right={Math.round(morale)}
        />
      </div>
      {strain > 60 ? (
        <Chip color="var(--color-brick)" title={`Strain ${Math.round(strain)}%. At 100 they take a sabbatical.`}>
          Strain {Math.round(strain)}
        </Chip>
      ) : null}
    </div>
  );
}

export function DayEndScreen() {
  const dispatch = useDispatch();

  const phase = useSim((s) => s.dayPhase);
  const day = useSim((s) => s.day);
  const dayLabel = useSim((s) => formatDay(s.day));
  const results = useSimShallow((s) => s.lastDayResults);
  const staff = useSimShallow((s) => s.therapists.filter((t) => t.status !== 'departed' && !t.isPlayer));
  const player = useSimShallow((s) => s.therapists.filter((t) => t.isPlayer && t.status !== 'departed'));
  const expenses = useSim((s) => dailyExpenses(s));
  const warnJson = useSim((s) => JSON.stringify(computeExceptions(s).slice(0, 4)));
  const warnings = useMemo(() => JSON.parse(warnJson) as Exception[], [warnJson]);
  const cash = useSim((s) => s.cash);

  if (phase !== 'day_end') return null;

  const revenue = results.reduce((a, r) => a + r.revenue, 0);
  const net = revenue - expenses;
  const cures = results.filter((r) => r.cured);
  const breakthroughs = results.filter((r) => r.breakthrough && !r.cured);
  const regressions = results.filter((r) => r.regression);
  const everyone = [...player, ...staff];

  return (
    <NotebookPage
      eyebrow={`${dayLabel} · the lamps are still on`}
      title={`Day ${day}, closed`}
      sub={
        results.length === 0
          ? 'No hours ran today. The rent came due anyway — book someone in before you open tomorrow.'
          : `${results.length} hour${results.length === 1 ? '' : 's'} in the room. Here is what they came to.`
      }
      footer={
        <>
          <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'END_DAY' })}>
            Close up for the night
          </Button>
          <span className="text-[0.72rem] text-ink-faint">
            Cash on hand after tonight:{' '}
            <span className="tabular font-bold text-ink-soft">{formatMoney(cash)}</span>
          </span>
        </>
      }
    >
      {/* The ledger */}
      <div className="flex flex-wrap gap-2">
        <Figure
          label="Fees taken"
          value={formatMoney(revenue)}
          color="var(--color-sage-deep)"
          hint={<>Every session that actually ran, at the client&rsquo;s rate.</>}
        />
        <Figure
          label="Running costs"
          value={formatMoney(expenses)}
          color="var(--color-brick)"
          hint={<>Salaries, rent, per-client overhead and program upkeep.</>}
        />
        <Figure
          label="Net"
          value={formatMoney(net, true)}
          color={net >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)'}
        />
      </div>

      {/* The hours */}
      <Divider label="The hours" />
      {results.length === 0 ? (
        <EmptyState
          icon="🕯️"
          title="A day with no hours in it."
          body="Nobody sat in that chair. Tomorrow, auto-fill the day from the morning brief and it will find people for you."
        />
      ) : (
        <div className="flex flex-col">
          <ResultHeader />
          {results.map((r) => (
            <ResultRow key={r.sessionId} result={r} />
          ))}
        </div>
      )}

      {/* What is worth saying out loud */}
      {cures.length + breakthroughs.length + regressions.length > 0 ? (
        <>
          <Divider label="Worth saying out loud" />
          <div className="flex flex-col gap-1.5">
            {cures.map((r) => (
              <Callout key={`cure-${r.sessionId}`} tone="sage" icon={<Plant progress={100} size={30} />}>
                <CureLine result={r} />
              </Callout>
            ))}
            {breakthroughs.map((r) => (
              <Callout key={`bt-${r.sessionId}`} tone="amber" icon={<span className="text-lg">✨</span>}>
                <BreakthroughLine result={r} />
              </Callout>
            ))}
            {regressions.map((r) => (
              <Callout key={`reg-${r.sessionId}`} tone="brick" icon={<span className="text-lg">↘</span>}>
                <RegressionLine result={r} />
              </Callout>
            ))}
          </div>
        </>
      ) : null}

      {/* Who is still standing */}
      <Divider label="How everyone is holding up" />
      <div className="flex flex-col">
        {everyone.map((t) => (
          <StaffRow
            key={t.id}
            therapistId={t.id}
            sessions={results.filter((r) => r.therapistId === t.id).length}
          />
        ))}
      </div>

      {/* Tomorrow */}
      <Divider label="Tomorrow, probably" />
      {warnings.length === 0 ? (
        <p className="text-[0.78rem] text-ink-soft leading-relaxed">
          Nothing is flashing. Everybody has patience left, everybody has energy left, and the books are fine. Sleep
          well.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {warnings.map((w) => (
            <li
              key={w.id}
              className="card-warm relative overflow-hidden px-2.5 py-1.5 pl-3.5 flex items-start gap-2"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{
                  background: w.severity >= 3 ? 'var(--color-brick)' : 'var(--color-amber-deep)',
                  boxShadow: `1px 0 0 color-mix(in oklab, ${w.severity >= 3 ? 'var(--color-brick)' : 'var(--color-amber-deep)'} 30%, transparent)`,
                }}
              />
              <span aria-hidden className="text-[0.95rem] leading-none mt-0.5">
                {EXCEPTION_ICON[w.kind]}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.77rem] font-bold text-ink leading-snug">{w.label}</span>
                <span className="block text-[0.7rem] text-ink-faint leading-[1.45]">{w.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </NotebookPage>
  );
}

function Callout({
  tone,
  icon,
  children,
}: {
  tone: 'sage' | 'amber' | 'brick';
  icon: ReactNode;
  children: ReactNode;
}) {
  const color =
    tone === 'sage' ? 'var(--color-sage)' : tone === 'amber' ? 'var(--color-amber)' : 'var(--color-brick)';
  return (
    <div
      className="tt-hand px-2.5 py-2 flex items-center gap-2.5"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, ${color} 9%, transparent) 0%, color-mix(in oklab, ${color} 17%, transparent) 100%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent), inset 0 1px 0 rgba(255,253,246,0.6), 0 1px 2px -1px rgba(24,46,46,0.22)`,
      }}
    >
      <span className="shrink-0 grid place-items-center">{icon}</span>
      <span className="text-[0.79rem] text-ink leading-[1.5]">{children}</span>
    </div>
  );
}

function CureLine({ result }: { result: SessionResult }) {
  const handle = useSim((s) => s.clients.find((c) => c.id === result.clientId)?.handle ?? 'They');
  const sessions = useSim((s) => s.clients.find((c) => c.id === result.clientId)?.sessionsAttended ?? 0);
  const testimonial = useSim((s) => s.alumni.find((a) => a.id === result.clientId)?.testimonial ?? '');
  return (
    <>
      <b>{handle}</b> finished treatment today, after {sessions} session{sessions === 1 ? '' : 's'}.
      {testimonial ? <span className="text-ink-soft"> &ldquo;{testimonial}&rdquo;</span> : null}
    </>
  );
}

function BreakthroughLine({ result }: { result: SessionResult }) {
  const handle = useSim((s) => s.clients.find((c) => c.id === result.clientId)?.handle ?? 'Someone');
  return (
    <>
      <b>{handle}</b> — {result.narrative}
    </>
  );
}

function RegressionLine({ result }: { result: SessionResult }) {
  const handle = useSim((s) => s.clients.find((c) => c.id === result.clientId)?.handle ?? 'Someone');
  const why = result.reasons.find((r) => r.label.startsWith('Regression'));
  return (
    <>
      <b>{handle}</b> lost ground this hour.{' '}
      <span className="text-ink-soft">
        {why ? why.label.replace('Regression — ', 'The ') : 'It was a risk the hour was carrying.'}
        {why ? ' before you began.' : ''}
      </span>{' '}
      Stabilize work rebuilds it.
    </>
  );
}
