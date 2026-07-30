import { useMemo, type ReactNode } from 'react';
import { milestoneById, programById } from '../content';
import { activeTherapists } from '../sim/eventsys';
import { capacity } from '../sim/engine';
import { activeClients } from '../sim/scheduler';
import type { Therapist } from '../sim/types';
import { avg, formatMoney } from '../sim/util';
import { useSim, useSimShallow, useStore } from '../store';
import { Button, Chip, Divider, Modal, SectionHeading, Sparkline } from './primitives';

/**
 * The Practice Review — a quarterly pause that is half scrapbook, half
 * orientation. It exists so a player who has been clicking through days can see
 * the shape of what they built, and leave with exactly one thing to try next.
 */

const WINDOW = 28;

/**
 * `flags.showQuarterReview` is set by the sim during its overnight pass and
 * cleared here. It is presentation state that happens to live in the sim's flag
 * bag, so it goes back through SET_FLAG like everything else — a dismissal that
 * bypassed the action stream would be missing from a recorded replay.
 */
function dismissQuarterReview(): void {
  useStore.getState().dispatch({ type: 'SET_FLAG', key: 'showQuarterReview', value: false });
}

/** One honest line per clinician, chosen by whatever is most true right now. */
function staffNote(t: Therapist): string {
  const first = t.name.split(' ')[0];
  const energyPct = Math.round((t.energy / Math.max(1, t.maxEnergy)) * 100);
  const days = (n: number) => `${n} more day${n === 1 ? '' : 's'}`;

  if (t.status === 'sabbatical')
    return `${first} is on sabbatical for ${days(t.statusDays)}. The practice absorbed it without dropping anyone.`;
  if (t.status === 'training')
    return `${first} is away training for ${days(t.statusDays)}, and comes back with something new.`;
  if (t.status === 'conference')
    return `${first} is at a conference for ${days(t.statusDays)}, presumably taking notes on napkins.`;
  if (t.status === 'program')
    return `${first} is running a program this quarter rather than a full caseload.`;
  if (t.poachOffer)
    return `${first} has an offer from ${t.poachOffer.rival} and ${t.poachOffer.daysLeft} day${
      t.poachOffer.daysLeft === 1 ? '' : 's'
    } to answer it.`;
  if (t.strain > 62)
    return `${first} has been carrying too much and it shows — strain is at ${Math.round(t.strain)}%.`;
  if (t.morale < 42)
    return `${first}'s morale is at ${Math.round(t.morale)}%. Something about the week is not landing.`;
  if (energyPct < 35)
    return `${first} is running on ${energyPct}% energy. One lighter day would buy back a lot.`;
  if (t.bonds.length >= 2)
    return `${first} has ${t.bonds.length} clients who ask for them by name.`;
  if (t.stats.breakthroughs > 0 && t.morale >= 70)
    return `${first} is having a good quarter — ${t.stats.breakthroughs} breakthrough${
      t.stats.breakthroughs === 1 ? '' : 's'
    } and morale at ${Math.round(t.morale)}%.`;
  if (t.stats.cures > 0)
    return `${first} has seen ${t.stats.cures} ${
      t.stats.cures === 1 ? 'person' : 'people'
    } all the way through. Unhurried, reliable work.`;
  return `${first} is steady — morale ${Math.round(t.morale)}%, energy ${energyPct}%, ${t.stats.sessions} hours held.`;
}

interface Suggestion {
  icon: string;
  title: string;
  body: string;
}

export function QuarterReview() {
  const open = useSim((s) => !!s.flags.showQuarterReview);
  const quarter = useSim((s) => s.quarter);
  const year = useSim((s) => s.year);
  const practiceName = useSim((s) => s.practiceName);
  const cash = useSim((s) => s.cash);
  const breakthroughsAllTime = useSim((s) => s.stats.breakthroughs);
  const dropoutsAllTime = useSim((s) => s.stats.dropouts);

  const cashSeries = useSimShallow((s) => s.stats.history.slice(-WINDOW).map((h) => h.cash));
  // A day with no sessions records avgQuality 0; keeping those in would read as
  // a collapse rather than a quiet day, so the line follows session days only.
  const qualitySeries = useSimShallow((s) =>
    s.stats.history
      .slice(-WINDOW)
      .filter((h) => h.avgQuality > 0)
      .map((h) => h.avgQuality),
  );
  const moraleSeries = useSimShallow((s) => s.stats.history.slice(-WINDOW).map((h) => h.avgMorale));
  const clientSeries = useSimShallow((s) => s.stats.history.slice(-WINDOW).map((h) => h.clients));
  const repSeries = useSimShallow((s) => s.stats.history.slice(-WINDOW).map((h) => h.reputation));
  const trustSeries = useSimShallow((s) => s.stats.history.slice(-WINDOW).map((h) => h.communityTrust));
  const netSeries = useSimShallow((s) =>
    s.stats.history.slice(-WINDOW).map((h) => h.revenue - h.expenses),
  );
  const span = useSimShallow((s) => {
    const h = s.stats.history.slice(-WINDOW);
    return h.length ? [h[0].day, h[h.length - 1].day] : [];
  });
  const curesInWindow = useSimShallow((s) => {
    const h = s.stats.history;
    if (!h.length) return [0, 0];
    const start = Math.max(0, h.length - WINDOW);
    const baseline = start > 0 ? h[start - 1].cures : 0;
    return [baseline, h[h.length - 1].cures];
  });

  const recentMilestones = useSimShallow((s) => s.milestonesEarned.slice(-3));
  const newProgramIds = useSimShallow((s) =>
    s.programs.filter((p) => p.startedDay > s.day - WINDOW).map((p) => p.id),
  );
  const notes = useSimShallow((s) => activeTherapists(s).map((t) => staffNote(t)));

  const signals = useSimShallow((s) => {
    const staff = activeTherapists(s);
    const clients = activeClients(s);
    return {
      practiceLevel: s.practiceLevel,
      activePrograms: s.programs.filter((p) => p.active).length,
      avgEnergy: avg(staff.map((t) => t.energy / Math.max(1, t.maxEnergy))),
      maxStrain: staff.reduce((a, t) => Math.max(a, t.strain), 0),
      communityTrust: s.communityTrust,
      slidingCount: clients.filter((c) => c.payment === 'sliding_scale').length,
      atRisk: clients.filter((c) => c.atRisk).length,
      clientCount: clients.length,
      capacityLeft: capacity(s) - clients.length,
      waitlist: s.clients.filter((c) => c.status === 'waitlist').length,
    };
  });

  const curesThisQuarter = curesInWindow[1] - curesInWindow[0];
  const recentNet = netSeries.length
    ? netSeries.slice(-7).reduce((a, v) => a + v, 0) / Math.min(7, netSeries.length)
    : 0;
  const runwayDays = recentNet < 0 ? Math.max(0, Math.floor(cash / -recentNet)) : null;
  const trustDelta = trustSeries.length > 1 ? trustSeries[trustSeries.length - 1] - trustSeries[0] : 0;

  const suggestion = useMemo<Suggestion>(() => {
    if (cash < 0) {
      return {
        icon: '🕯️',
        title: 'The cash comes first this quarter',
        body: `You are ${formatMoney(
          Math.abs(cash),
        )} in the red. The quickest lever is empty slots — every booked hour is money you already have the staff for. After that: a program winding down, or a salary you cannot cover.`,
      };
    }
    if (runwayDays !== null && runwayDays < 14) {
      return {
        icon: '🕯️',
        title: 'Watch the cash before anything else',
        body: `At ${formatMoney(recentNet)} a day, what you have on hand lasts about ${runwayDays} day${
          runwayDays === 1 ? '' : 's'
        }. The quickest lever is empty slots — every booked hour is money you already have the staff for.`,
      };
    }
    if (signals.avgEnergy < 0.45 || signals.maxStrain > 70) {
      return {
        icon: '🫖',
        title: 'Consider capping sessions per therapist',
        body: `The team is averaging ${Math.round(
          signals.avgEnergy * 100,
        )}% energy and someone is at ${Math.round(
          signals.maxStrain,
        )}% strain. A cap in your policies costs you a few hours a week and prevents a sabbatical that would cost you days.`,
      };
    }
    if (trustDelta < 0 || signals.slidingCount === 0) {
      return {
        icon: '🏘️',
        title: 'Take on a sliding-scale client or two',
        body: `Community trust is at ${Math.round(signals.communityTrust)} and ${
          trustDelta < 0 ? `has slipped ${Math.abs(Math.round(trustDelta))} this quarter` : 'drifts down on its own'
        }. A low-fee case costs you a little per hour and is the cheapest way to keep the neighbourhood sending you the people who need you most.`,
      };
    }
    if (signals.atRisk >= 3) {
      return {
        icon: '🍂',
        title: 'Some people are drifting',
        body: `${signals.atRisk} clients are at risk of stopping. Booking them first — even a Stabilize hour — costs less than losing them and takes the pressure off your reputation.`,
      };
    }
    if (cash > 6000 && signals.practiceLevel >= 3 && signals.activePrograms === 0) {
      return {
        icon: '🌾',
        title: 'You could afford a program',
        body: `${formatMoney(
          cash,
        )} on hand and a level ${signals.practiceLevel} practice. A program turns money into reach — groups, workshops, a school partnership — and it keeps paying while you sleep.`,
      };
    }
    if (signals.waitlist >= 3 && signals.capacityLeft >= 2) {
      return {
        icon: '🚪',
        title: 'There is room for more people than you are seeing',
        body: `${signals.waitlist} on the waitlist and space for ${signals.capacityLeft} more on the caseload. Waitlists do not wait forever — people find care elsewhere and community trust quietly follows them.`,
      };
    }
    return {
      icon: '🌿',
      title: 'Nothing is on fire',
      body: `${signals.clientCount} people in care, the team steady, the books holding. That is not an absence of a problem — it is the thing you have been building. Take the next quarter to go deeper rather than wider.`,
    };
  }, [runwayDays, recentNet, signals, trustDelta, cash]);

  if (!open) return null;

  const spanLabel = span.length === 2 ? `Days ${span[0]}–${span[1]}` : 'The first days';

  return (
    <Modal width={640} onClose={dismissQuarterReview} labelledBy="quarter-review-title">
      <div className="px-5 pt-4 pb-3 border-b hairline">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 id="quarter-review-title" className="display text-[1.4rem] leading-tight text-ink">
            Quarter {quarter} · Year {year}
          </h2>
          <Chip color="var(--color-amber-deep)">Practice Review</Chip>
        </div>
        <p className="text-[0.78rem] text-ink-faint leading-snug mt-0.5">
          {spanLabel} at {practiceName}. Here is the shape of it.
        </p>
      </div>

      <div className="px-5 py-4">
        {/* ── Trends ─────────────────────────────────────────────────────── */}
        <SectionHeading sub="Up to twenty-eight evenings, drawn end to end. Quality is averaged over the days you actually saw people.">
          How it moved
        </SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Trend label="Cash" data={cashSeries} color="var(--color-sage-deep)" format={(v) => formatMoney(v)} />
          <Trend
            label="Session quality"
            data={qualitySeries}
            color="var(--color-amber-deep)"
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Trend
            label="Team morale"
            data={moraleSeries}
            color="var(--color-plum)"
            format={(v) => `${Math.round(v)}%`}
          />
          <Trend label="People in care" data={clientSeries} color="var(--color-sage-deep)" format={(v) => `${Math.round(v)}`} />
          <Trend label="Reputation" data={repSeries} color="var(--color-amber-deep)" format={(v) => `${Math.round(v)}`} />
          <Trend label="Community trust" data={trustSeries} color="var(--color-plum)" format={(v) => `${Math.round(v)}`} />
        </div>

        <Divider label="Worth keeping" />

        {/* ── Wins ───────────────────────────────────────────────────────── */}
        <ul className="flex flex-wrap gap-1.5">
          <li>
            <Chip color="var(--color-sage-deep)">
              🌱 {curesThisQuarter} good goodbye{curesThisQuarter === 1 ? '' : 's'} this quarter
            </Chip>
          </li>
          <li>
            <Chip color="var(--color-amber-deep)">
              ✨ {breakthroughsAllTime} breakthrough{breakthroughsAllTime === 1 ? '' : 's'} all told
            </Chip>
          </li>
          {newProgramIds.map((id) => (
            <li key={id}>
              <Chip color="var(--color-plum)">🌾 {programById[id]?.name ?? id} launched</Chip>
            </li>
          ))}
          {dropoutsAllTime > 0 ? (
            <li>
              <Chip>
                🍂 {dropoutsAllTime} {dropoutsAllTime === 1 ? 'person has' : 'people have'} drifted away
                since you opened
              </Chip>
            </li>
          ) : null}
        </ul>

        {recentMilestones.length ? (
          <div className="mt-2.5 space-y-1">
            <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
              Latest on the fridge door
            </div>
            {recentMilestones
              .slice()
              .reverse()
              .map((id) => {
                const m = milestoneById[id];
                if (!m) return null;
                return (
                  <div key={id} className="flex items-start gap-2">
                    <span aria-hidden className="text-base leading-tight">
                      {m.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[0.8rem] font-bold text-ink leading-tight">{m.name}</div>
                      <div className="text-[0.72rem] text-ink-faint leading-snug">{m.blurb}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}

        <Divider label="The people who do the hours" />

        {/* ── Staff notes ────────────────────────────────────────────────── */}
        <ul className="space-y-1.5">
          {notes.map((n, i) => (
            <li key={`${i}-${n}`} className="text-[0.79rem] text-ink-soft leading-snug flex gap-2">
              <span aria-hidden className="text-ink-faint select-none">
                —
              </span>
              <span>{n}</span>
            </li>
          ))}
        </ul>

        {/* ── One suggestion ─────────────────────────────────────────────── */}
        <div
          className="mt-4 px-3.5 py-3 rounded-[var(--radius-card)]"
          style={{
            background: 'color-mix(in oklab, var(--color-amber) 14%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-amber-deep) 38%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">
              {suggestion.icon}
            </span>
            <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
              One thing to consider
            </div>
          </div>
          <h3 className="display text-[1rem] text-ink leading-tight mt-1">{suggestion.title}</h3>
          <p className="text-[0.79rem] text-ink-soft leading-snug mt-0.5">{suggestion.body}</p>
        </div>
      </div>

      <div className="px-5 py-3 border-t hairline flex items-center justify-between gap-3">
        <span className="text-[0.72rem] text-ink-faint leading-snug">
          Nothing here is a grade. It is just what happened.
        </span>
        <Button variant="primary" size="lg" onClick={dismissQuarterReview} autoFocus>
          Back to work
        </Button>
      </div>
    </Modal>
  );
}

function Trend({
  label,
  data,
  color,
  format,
}: {
  label: string;
  data: number[];
  color: string;
  format: (v: number) => string;
}): ReactNode {
  const last = data.length ? data[data.length - 1] : 0;
  const first = data.length ? data[0] : 0;
  const delta = last - first;
  return (
    <div className="card-warm px-2.5 py-2">
      <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint leading-tight">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="display tabular text-[1rem] text-ink">{format(last)}</span>
        {data.length > 1 && Math.abs(delta) > 0.0001 ? (
          <span
            className="tabular text-[0.66rem]"
            style={{ color: delta >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)' }}
          >
            {delta >= 0 ? '▲' : '▼'} {format(Math.abs(delta))}
          </span>
        ) : null}
      </div>
      {data.length > 1 ? (
        <Sparkline data={data} width={170} height={26} color={color} />
      ) : (
        <div className="text-[0.66rem] text-ink-faint leading-snug py-1">Not enough evenings yet.</div>
      )}
    </div>
  );
}
