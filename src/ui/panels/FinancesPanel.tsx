import { useMemo, type ReactNode } from 'react';
import { programById } from '../../content';
import {
  BASE_RENT_PER_DAY,
  DIFFICULTIES,
  OVERHEAD_PER_CLIENT,
  RENT_PER_THERAPIST,
} from '../../sim/balance';
import { dailyExpenses } from '../../sim/engine';
import { activeTherapists } from '../../sim/eventsys';
import { activeClients, dailyRevenueForecast } from '../../sim/scheduler';
import type { PaymentSource } from '../../sim/types';
import { formatMoney } from '../../sim/util';
import { useSim, useSimShallow, useStore } from '../../store';
import {
  Chip,
  Divider,
  EmptyState,
  PanelShell,
  RollingNumber,
  SectionHeading,
  Sparkline,
  StatTile,
  Tooltip,
} from '../primitives';

/**
 * The money story, told plainly.
 *
 * Every figure on this panel is either read straight off the sim or produced by
 * a sim helper (`dailyRevenueForecast`, `dailyExpenses`). The expense table
 * itemises exactly the terms `dailyExpenses` sums, and then shows that
 * function's own total underneath — so the breakdown can never quietly drift
 * away from what the practice is actually charged.
 */

const HISTORY_WINDOW = 60;

const PAYMENT_META: { id: PaymentSource; label: string; color: string; note: string }[] = [
  {
    id: 'insurance',
    label: 'Insurance',
    color: '#4d7d84',
    note: 'Steady money, paid late, with someone else counting the sessions.',
  },
  {
    id: 'self_pay',
    label: 'Self-pay',
    color: 'var(--color-amber)',
    note: 'The best rate on the board — and the first line a household cuts.',
  },
  {
    id: 'sliding_scale',
    label: 'Sliding scale',
    color: 'var(--color-sage)',
    note: 'Below rate on purpose. This is the practice being part of a neighbourhood.',
  },
  {
    id: 'grant',
    label: 'Grant-funded',
    color: 'var(--color-plum)',
    note: 'Someone else believed in the hour enough to pay for it.',
  },
];

interface ExpenseRow {
  label: string;
  detail: string;
  amount: number;
  emphasis?: boolean;
}

export function FinancesPanel() {
  const setUi = useStore((s) => s.setUi);
  const close = () => setUi({ panel: null });

  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const cash = useSim((s) => s.cash);
  const day = useSim((s) => s.day);
  const practiceName = useSim((s) => s.practiceName);
  const difficulty = useSim((s) => s.difficulty);
  const communityTrust = useSim((s) => s.communityTrust);
  const bankruptcyStage = useSim((s) => Number(s.flags.bankruptcyStage ?? 0));
  const hardshipArc = useSim((s) => !!s.flags.hardshipArc);

  // Today.
  const forecastRevenue = useSim((s) => dailyRevenueForecast(s));
  const expensesToday = useSim((s) => dailyExpenses(s));
  const bankedToday = useSim((s) => Math.round(s.lastDayResults.reduce((a, r) => a + r.revenue, 0)));
  const hoursOnBoard = useSim(
    (s) => s.schedule.filter((x) => x.status !== 'cancelled' && x.status !== 'done').length,
  );
  const hoursDone = useSim((s) => s.schedule.filter((x) => x.status === 'done').length);

  // Expense terms — the same terms `dailyExpenses` sums.
  const staffNames = useSimShallow((s) =>
    activeTherapists(s)
      .filter((t) => !t.isPlayer)
      .map((t) => t.name),
  );
  const staffSalaries = useSimShallow((s) =>
    activeTherapists(s)
      .filter((t) => !t.isPlayer)
      .map((t) => t.salary),
  );
  const activeClientCount = useSim((s) => activeClients(s).length);
  const runningProgramIds = useSimShallow((s) => s.programs.filter((p) => p.active).map((p) => p.id));

  // Revenue mix across the active caseload.
  const mixCounts = useSimShallow((s) =>
    PAYMENT_META.map((p) => activeClients(s).filter((c) => c.payment === p.id).length),
  );
  const mixRates = useSimShallow((s) =>
    PAYMENT_META.map((p) =>
      Math.round(
        activeClients(s)
          .filter((c) => c.payment === p.id)
          .reduce((a, c) => a + c.rate, 0),
      ),
    ),
  );

  // Trends.
  const cashSeries = useSimShallow((s) => s.stats.history.slice(-HISTORY_WINDOW).map((h) => h.cash));
  const revenueSeries = useSimShallow((s) => s.stats.history.slice(-HISTORY_WINDOW).map((h) => h.revenue));
  const expenseSeries = useSimShallow((s) => s.stats.history.slice(-HISTORY_WINDOW).map((h) => h.expenses));
  const repSeries = useSimShallow((s) => s.stats.history.slice(-HISTORY_WINDOW).map((h) => h.reputation));
  const historyDays = useSimShallow((s) => {
    const h = s.stats.history.slice(-HISTORY_WINDOW);
    return h.length ? [h[0].day, h[h.length - 1].day] : [];
  });

  const stats = useSimShallow((s) => ({
    totalRevenue: s.stats.totalRevenue,
    totalExpenses: s.stats.totalExpenses,
    bestDayRevenue: s.stats.bestDayRevenue,
    sessionsRun: s.stats.sessionsRun,
    qualitySum: s.stats.qualitySum,
    qualityCount: s.stats.qualityCount,
    cures: s.stats.cures,
    dropouts: s.stats.dropouts,
    breakthroughs: s.stats.breakthroughs,
    daysPlayed: s.stats.daysPlayed,
  }));

  const expenseRows = useMemo<ExpenseRow[]>(() => {
    const rows: ExpenseRow[] = [];
    for (let i = 0; i < staffNames.length; i++) {
      rows.push({
        label: staffNames[i],
        detail: 'Salary, paid daily',
        amount: staffSalaries[i],
      });
    }
    rows.push({
      label: 'Rent & utilities',
      detail: `${formatMoney(BASE_RENT_PER_DAY)} for the rooms, ${formatMoney(RENT_PER_THERAPIST)} for each desk you keep`,
      amount: BASE_RENT_PER_DAY + staffNames.length * RENT_PER_THERAPIST,
    });
    rows.push({
      label: 'Client overhead',
      detail: `${activeClientCount} active · $${OVERHEAD_PER_CLIENT.toFixed(2)} each in notes, tissues, and tea`,
      amount: activeClientCount * OVERHEAD_PER_CLIENT,
    });
    for (const id of runningProgramIds) {
      const def = programById[id];
      if (!def) continue;
      rows.push({
        label: def.name,
        detail: `${formatMoney(def.weeklyUpkeep)} a week, charged daily`,
        amount: def.weeklyUpkeep / 7,
      });
    }
    return rows;
  }, [staffNames, staffSalaries, activeClientCount, runningProgramIds]);

  const expenseSubtotal = expenseRows.reduce((a, r) => a + r.amount, 0);
  const diff = DIFFICULTIES[difficulty];
  const netToday = forecastRevenue + bankedToday - expensesToday;

  // Runway prefers what actually happened over what is merely booked.
  const recentNets = useMemo(() => {
    const n = Math.min(7, revenueSeries.length, expenseSeries.length);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = revenueSeries.length - n + i;
      out.push(revenueSeries[idx] - expenseSeries[idx]);
    }
    return out;
  }, [revenueSeries, expenseSeries]);

  const recentNet = recentNets.length
    ? recentNets.reduce((a, v) => a + v, 0) / recentNets.length
    : netToday;
  const usingRecent = recentNets.length >= 3;
  const basisNet = usingRecent ? recentNet : netToday;
  const inTheRed = cash < 0;
  /** Days the cash on hand lasts at the current daily net. */
  const runwayDays = !inTheRed && basisNet < 0 ? Math.max(0, Math.floor(cash / -basisNet)) : null;
  /** When already overdrawn, runway inverts: days until the balance is back at zero. */
  const climbOutDays = inTheRed && basisNet > 0 ? Math.ceil(-cash / basisNet) : null;
  const runwayTone: 'good' | 'bad' | 'amber' | 'neutral' = inTheRed
    ? 'bad'
    : runwayDays === null
      ? 'good'
      : runwayDays < 7
        ? 'bad'
        : runwayDays < 21
          ? 'amber'
          : 'neutral';

  const mixTotalRate = mixRates.reduce((a, v) => a + v, 0);
  const mixTotalClients = mixCounts.reduce((a, v) => a + v, 0);
  const slidingIdx = PAYMENT_META.findIndex((p) => p.id === 'sliding_scale');
  const avgQuality = stats.qualityCount ? stats.qualitySum / stats.qualityCount : 0;
  const lifetimeNet = stats.totalRevenue - stats.totalExpenses;

  return (
    <PanelShell
      wide
      icon="🕯️"
      title="The Ledger"
      subtitle={`${practiceName} · day ${day}. Every number here is the one the practice actually uses.`}
      onClose={close}
    >
      {bankruptcyStage > 0 || hardshipArc ? (
        <TroubleNotice stage={bankruptcyStage} hardship={hardshipArc} cash={cash} />
      ) : null}

      {/* ── Cash at a glance ─────────────────────────────────────────────── */}
      <div className="card-warm px-4 py-3.5 flex items-center gap-4 flex-wrap">
        <div className="min-w-[9rem]">
          <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
            Cash on hand
          </div>
          <div
            className="display tabular text-[2.15rem] leading-tight"
            style={{ color: cash < 0 ? 'var(--color-brick)' : 'var(--color-ink)' }}
          >
            {calm ? formatMoney(cash) : <RollingNumber value={cash} format={(v) => formatMoney(v)} />}
          </div>
          <div className="text-[0.7rem] text-ink-faint leading-snug">
            Projected net today{' '}
            <span
              className="tabular font-bold"
              style={{ color: netToday >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)' }}
            >
              {formatMoney(netToday, true)}
            </span>
            {hoursOnBoard === 0 && hoursDone === 0 ? (
              <span className="block">Nothing booked yet — that is the cost of opening the door.</span>
            ) : null}
          </div>
        </div>
        <div className="flex-1 min-w-[11rem]">
          {cashSeries.length > 1 ? (
            <>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
                  Cash, evening by evening
                </span>
                <span className="tabular text-[0.68rem] text-ink-faint">
                  days {historyDays[0]}–{historyDays[1]}
                </span>
              </div>
              <Sparkline
                data={cashSeries}
                width={300}
                height={54}
                color={cash < 0 ? 'var(--color-brick)' : 'var(--color-sage-deep)'}
              />
            </>
          ) : (
            <p className="text-[0.75rem] text-ink-faint leading-snug">
              The line starts after your first full day. Come back tomorrow evening and there will be
              something to look at.
            </p>
          )}
        </div>
      </div>

      {/* ── Today ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <StatTile
          label="Banked today"
          value={formatMoney(bankedToday)}
          sub={`${hoursDone} hour${hoursDone === 1 ? '' : 's'} finished`}
          tone={bankedToday > 0 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Still on the board"
          value={formatMoney(forecastRevenue)}
          sub={`${hoursOnBoard} booked hour${hoursOnBoard === 1 ? '' : 's'}`}
          tone="amber"
          title="Fees for every session booked today that has not run yet."
        />
        <StatTile
          label="Costs today"
          value={formatMoney(expensesToday)}
          sub="Charged at day's end"
          tone="bad"
        />
        <StatTile
          label={inTheRed ? 'Climb out' : 'Runway'}
          value={
            inTheRed
              ? climbOutDays === null
                ? '—'
                : `${climbOutDays}d`
              : runwayDays === null
                ? '—'
                : `${runwayDays}d`
          }
          sub={
            inTheRed
              ? climbOutDays === null
                ? 'still losing ground'
                : `back to zero at ${formatMoney(basisNet, true)} a day`
              : runwayDays === null
                ? 'Building a cushion'
                : `at ${formatMoney(basisNet)} a day`
          }
          tone={runwayTone}
        />
      </div>

      <p className="text-[0.73rem] text-ink-faint leading-snug mt-2">
        {inTheRed ? (
          <>
            You are {formatMoney(Math.abs(cash))} in the red.{' '}
            {climbOutDays === null
              ? 'The last few days lost ground too. Cut a cost or fill a slot.'
              : `At ${formatMoney(basisNet, true)} a day you are back at zero in ${climbOutDays} day${
                  climbOutDays === 1 ? '' : 's'
                }.`}{' '}
            {diff.bankruptcy
              ? 'Nothing closes without warning.'
              : 'On Cozy this becomes a story, never a game over.'}
          </>
        ) : runwayDays === null ? (
          <>
            Nothing is draining. At {formatMoney(basisNet, true)} a day the cushion is getting thicker.
          </>
        ) : (
          <>
            At {formatMoney(basisNet)} a day, {formatMoney(cash)} lasts{' '}
            <strong className="tabular">{runwayDays}</strong> more day{runwayDays === 1 ? '' : 's'}.
          </>
        )}{' '}
        {usingRecent
          ? `Based on the last ${recentNets.length} days actually worked, not on what is merely booked.`
          : 'Based on today only — there is not enough history yet to average.'}
      </p>

      <Divider label="Where it goes" />

      {/* ── Expense breakdown ────────────────────────────────────────────── */}
      <SectionHeading sub="Charged every evening, whether the rooms were full or not.">
        Daily costs
      </SectionHeading>
      <div className="paper-flat overflow-hidden">
        <table className="w-full text-[0.78rem]">
          <caption className="sr-only">Daily expense breakdown</caption>
          <tbody>
            {expenseRows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className="border-b hairline last:border-b-0">
                <td className="px-3 py-1.5 align-top">
                  <div className="font-bold text-ink leading-tight">{r.label}</div>
                  <div className="text-[0.68rem] text-ink-faint leading-snug">{r.detail}</div>
                </td>
                <td className="px-3 py-1.5 text-right align-top tabular text-ink-soft whitespace-nowrap">
                  {formatMoney(r.amount)}
                </td>
              </tr>
            ))}
            {diff.expenseMult !== 1 && (
              <tr className="border-b hairline">
                <td className="px-3 py-1.5 align-top">
                  <div className="font-bold text-ink leading-tight">{diff.name} margins</div>
                  <div className="text-[0.68rem] text-ink-faint leading-snug">
                    Every cost above is multiplied by {diff.expenseMult}×
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right align-top tabular text-ink-soft whitespace-nowrap">
                  {formatMoney(expenseSubtotal * diff.expenseMult - expenseSubtotal, true)}
                </td>
              </tr>
            )}
            <tr style={{ background: 'color-mix(in oklab, var(--color-ink) 5%, transparent)' }}>
              <td className="px-3 py-2 font-extrabold uppercase tracking-[0.08em] text-[0.66rem] text-ink-faint">
                Total per day
              </td>
              <td className="px-3 py-2 text-right tabular display text-[1rem] text-ink whitespace-nowrap">
                {formatMoney(expensesToday)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[0.7rem] text-ink-faint leading-snug mt-1.5">
        Your own hours are free — you do not pay yourself a salary, and the practice does not rent you
        a desk.
      </p>

      <Divider label="Where it comes from" />

      {/* ── Revenue mix ──────────────────────────────────────────────────── */}
      <SectionHeading
        sub={`How the ${mixTotalClients} people on the caseload pay for their hour.`}
        right={
          <span className="tabular text-[0.72rem] text-ink-faint">
            {formatMoney(mixTotalRate)} / full board
          </span>
        }
      >
        Revenue mix
      </SectionHeading>

      {mixTotalRate > 0 ? (
        <>
          <div
            className="flex w-full h-4 rounded-full overflow-hidden"
            role="img"
            aria-label={PAYMENT_META.map(
              (p, i) => `${p.label}: ${mixCounts[i]} clients, ${formatMoney(mixRates[i])} per full board`,
            ).join('. ')}
          >
            {PAYMENT_META.map((p, i) =>
              mixRates[i] > 0 ? (
                <div
                  key={p.id}
                  style={{ width: `${(mixRates[i] / mixTotalRate) * 100}%`, background: p.color }}
                  title={`${p.label} · ${formatMoney(mixRates[i])}`}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {PAYMENT_META.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                  style={{ background: p.color }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="text-[0.76rem] font-bold text-ink leading-tight">
                    {p.label}{' '}
                    <span className="tabular font-normal text-ink-faint">
                      {mixCounts[i]} · {formatMoney(mixRates[i])}
                    </span>
                  </div>
                  <div className="text-[0.68rem] text-ink-faint leading-snug">{p.note}</div>
                </div>
              </li>
            ))}
          </ul>
          {mixCounts[slidingIdx] > 0 ? (
            <div
              className="mt-2.5 px-3 py-2 rounded-[var(--radius-card)] text-[0.76rem] leading-snug text-ink-soft"
              style={{
                background: 'color-mix(in oklab, var(--color-sage) 14%, transparent)',
                border: '1px solid color-mix(in oklab, var(--color-sage) 34%, transparent)',
              }}
            >
              <strong className="text-ink">
                {mixCounts[slidingIdx]} of {mixTotalClients} clients are here on a sliding scale.
              </strong>{' '}
              That gap is not lost income — it is the reason the neighbourhood trusts you with the
              hard referrals. Community trust sits at{' '}
              <span className="tabular font-bold">{Math.round(communityTrust)}</span>.
            </div>
          ) : (
            <div className="mt-2.5 text-[0.74rem] text-ink-faint leading-snug">
              Nobody is on a sliding scale right now. Community trust is at{' '}
              <span className="tabular font-bold">{Math.round(communityTrust)}</span> and drifts down
              on its own — taking a low-fee case is the cheapest way to hold it up.
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon="🪑"
          title="No caseload yet"
          body="Accept someone from the waitlist and this becomes a chart instead of a sentence."
        />
      )}

      <Divider label="Trends" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <TrendCard
          label="Revenue per day"
          data={revenueSeries}
          color="var(--color-amber-deep)"
          right={revenueSeries.length ? formatMoney(revenueSeries[revenueSeries.length - 1]) : '—'}
        />
        <TrendCard
          label="Reputation"
          data={repSeries}
          color="var(--color-plum)"
          right={repSeries.length ? Math.round(repSeries[repSeries.length - 1]).toString() : '—'}
        />
      </div>

      <Divider label="Since the doors opened" />

      {/* ── Lifetime ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatTile label="Taken in" value={formatMoney(stats.totalRevenue)} tone="good" sub={`over ${stats.daysPlayed} days`} />
        <StatTile label="Paid out" value={formatMoney(stats.totalExpenses)} tone="bad" sub="salaries, rent, everything" />
        <StatTile
          label="Net"
          value={formatMoney(lifetimeNet, true)}
          tone={lifetimeNet >= 0 ? 'good' : 'bad'}
          sub={lifetimeNet >= 0 ? 'the practice pays for itself' : 'still climbing out'}
        />
        <StatTile label="Best day" value={formatMoney(stats.bestDayRevenue)} tone="amber" sub="most ever billed in one day" />
        <StatTile label="Hours held" value={stats.sessionsRun} sub="sessions run start to finish" />
        <StatTile
          label="Average quality"
          value={stats.qualityCount ? `${Math.round(avgQuality * 100)}%` : '—'}
          sub={stats.qualityCount ? `across ${stats.qualityCount} rated hours` : 'nothing rated yet'}
          tone={avgQuality >= 0.7 ? 'good' : avgQuality < 0.5 && stats.qualityCount > 0 ? 'bad' : 'neutral'}
        />
        <StatTile label="Good goodbyes" value={stats.cures} tone="good" sub="finished treatment" icon={<span aria-hidden>🌱</span>} />
        <StatTile
          label="Breakthroughs"
          value={stats.breakthroughs}
          tone="amber"
          sub="hours that changed something"
        />
        <StatTile
          label="Drifted away"
          value={stats.dropouts}
          tone={stats.dropouts > stats.cures ? 'bad' : 'neutral'}
          sub="stopped coming"
        />
      </div>

      <p className="text-[0.72rem] text-ink-faint leading-snug mt-3">
        <Tooltip content="Quality is the score every session is graded on: skill, specialisation, energy, rapport, focus and technique. The reflect card shows the full breakdown for each hour.">
          <span className="underline decoration-dotted underline-offset-2 cursor-help">
            What counts as quality?
          </span>
        </Tooltip>{' '}
        Money is only ever half of this ledger.
      </p>
    </PanelShell>
  );
}

function TrendCard({
  label,
  data,
  color,
  right,
}: {
  label: string;
  data: number[];
  color: string;
  right: ReactNode;
}) {
  return (
    <div className="card-warm px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
          {label}
        </span>
        <span className="tabular text-[0.78rem] text-ink">{right}</span>
      </div>
      {data.length > 1 ? (
        <Sparkline data={data} width={310} height={38} color={color} />
      ) : (
        <p className="text-[0.7rem] text-ink-faint leading-snug py-2">
          One evening of history so far. The shape needs a few more days.
        </p>
      )}
    </div>
  );
}

function TroubleNotice({
  stage,
  hardship,
  cash,
}: {
  stage: number;
  hardship: boolean;
  cash: number;
}) {
  const title =
    stage >= 2 ? 'Serious trouble' : stage === 1 ? 'You are in the red' : 'A rough patch, handled';

  const body =
    stage >= 2
      ? 'The bank has called once already. If the balance falls past −$6,000 the practice closes. It will not happen without you seeing this panel first.'
      : stage === 1
        ? 'You have a line of credit and some room in it. If the balance falls past −$3,000 this moves to the next stage — there is no hidden cliff before then.'
        : 'Dr. Halloway covered the shortfall once. There is no game over on Cozy; this is a chapter, not an ending.';

  const offRamps =
    stage >= 1
      ? [
          'Fill empty slots — every booked hour is revenue you already have the staff for.',
          'Let a program wind down; upkeep is charged daily whether it earns or not.',
          'Take self-pay or grant referrals for a while; sliding-scale cases can wait a week.',
          'A salary you cannot cover is worse for everyone than a hard conversation.',
        ]
      : ['Keep the rooms full for a week and this closes itself.'];

  return (
    <div
      className="mb-3 px-3.5 py-3 rounded-[var(--radius-card)]"
      style={{
        background: 'color-mix(in oklab, var(--color-brick) 12%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-brick) 40%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span aria-hidden className="text-lg">
          🩹
        </span>
        <h3 className="display text-[1rem] text-ink">{title}</h3>
        <Chip color="var(--color-brick)">{formatMoney(cash)}</Chip>
        {hardship && stage === 0 ? <Chip color="var(--color-plum)">Cozy</Chip> : null}
      </div>
      <p className="text-[0.78rem] text-ink-soft leading-snug">{body}</p>
      <ul className="mt-1.5 space-y-1">
        {offRamps.map((r) => (
          <li key={r} className="text-[0.76rem] text-ink-soft leading-snug flex gap-1.5">
            <span aria-hidden className="text-ink-faint">
              ·
            </span>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}
