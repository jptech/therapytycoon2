import { useMemo, useState } from 'react';
import {
  AT_RISK_PATIENCE_THRESHOLD,
  CONDITION_LABELS,
  DROPOUT_PATIENCE_THRESHOLD,
  PATIENCE_DECAY_PER_IDLE_DAY,
  SEVERITY_LABELS,
} from '../../sim/balance';
import { capacity } from '../../sim/engine';
import {
  clientBooked,
  clientPriority,
  rapportLabel,
  riskBadge,
  stabilityLabel,
} from '../../sim/scheduler';
import { CHAPTER_BLURB, CHAPTER_LABEL } from '../../sim/session';
import type { ArcChapter, ConditionId, PaymentSource, SessionType } from '../../sim/types';
import {
  useDispatch,
  usePanelPrefs,
  useSim,
  useSimShallow,
  useStore,
  useUi,
  type ClientSortKey,
} from '../../store';
import { Plant, Portrait } from '../Portrait';
import { Button, Chip, EmptyState, Meter, PanelShell, RiskDot, Tooltip } from '../primitives';

/**
 * The caseload. Everything here is a person before it is a number, so every row
 * leads with a face, a plant and the words for how they are doing — and every
 * risk is stated out loud rather than sprung later.
 */

// ── Small shared vocabulary ──────────────────────────────────────────────────

const CHAPTER_COLOR: Record<ArcChapter, string> = {
  trust: 'var(--color-amber-deep)',
  work: 'var(--color-plum)',
  consolidation: 'var(--color-sage-deep)',
};

const MOOD_COLOR: Record<string, string> = {
  warm: 'var(--color-amber-deep)',
  tense: 'var(--color-brick)',
  sad: 'var(--color-plum)',
  proud: 'var(--color-sage-deep)',
  curious: 'var(--color-ink-soft)',
  neutral: 'var(--color-ink-faint)',
};

const PAYMENT: Record<PaymentSource, { label: string; color?: string; note: string }> = {
  insurance: {
    label: 'Insurance',
    note: 'Billed to insurance. Re-authorisation comes due eventually, and someone always asks for notes.',
  },
  self_pay: {
    label: 'Private pay',
    note: 'Paying out of pocket. Steadier money, and they feel every hour of it.',
  },
  sliding_scale: {
    label: 'Sliding scale',
    color: 'var(--color-sage-deep)',
    note: 'A reduced fee, because they asked and you said yes. Quietly, this is the best thing the practice does.',
  },
  grant: {
    label: 'Grant-funded',
    color: 'var(--color-plum)',
    note: 'Covered by a grant. Paperwork now, goodwill later.',
  },
};

const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  individual: 'Individual',
  couples: 'Couples',
  family: 'Family',
  group: 'Group',
};

/** The order lives in UiState so it survives closing the panel — see store.ts. */
type SortKey = ClientSortKey;

const SORT_LABEL: Record<SortKey, string> = {
  priority: 'Who needs you most',
  progress: 'Furthest along',
  unseen: 'Longest unseen',
  severity: 'Most severe',
};

function portraitMood(stability: number, progress: number): 'sad' | 'happy' | 'neutral' {
  if (stability < 0.3) return 'sad';
  if (progress > 85) return 'happy';
  return 'neutral';
}

function conditionList(ids: string): ConditionId[] {
  return ids ? (ids.split(',') as ConditionId[]) : [];
}

// ── Tiny styled controls ─────────────────────────────────────────────────────

function SoftSelect({
  value,
  onChange,
  label,
  children,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-[0.72rem] font-bold rounded-full pl-2.5 pr-2 py-1 text-ink-soft cursor-pointer ${className}`}
      style={{
        background: 'color-mix(in oklab, var(--color-ink) 7%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-ink) 15%, transparent)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </select>
  );
}

function FilterChip({
  on,
  onClick,
  children,
  color,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
  title?: string;
}) {
  const accent = color ?? 'var(--color-ink)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className="chip transition"
      style={
        on
          ? {
              background: `color-mix(in oklab, ${accent} 20%, transparent)`,
              borderColor: `color-mix(in oklab, ${accent} 48%, transparent)`,
              color: `color-mix(in oklab, ${accent} 82%, var(--color-ink))`,
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function ClientsPanel() {
  const openPanel = useStore((s) => s.openPanel);
  const [prefs, setPrefs] = usePanelPrefs('clients');
  const tab = prefs.tab;

  const activeCount = useSim((s) => s.clients.filter((c) => c.status === 'active').length);
  const waitCount = useSim((s) => s.clients.filter((c) => c.status === 'waitlist').length);
  const cap = useSim((s) => capacity(s));

  const subtitle =
    `${activeCount} of ${cap} chairs filled` +
    (waitCount > 0
      ? ` · ${waitCount} ${waitCount === 1 ? 'person' : 'people'} still waiting on you`
      : ' · nobody waiting');

  return (
    <PanelShell
      title="The Caseload"
      subtitle={subtitle}
      icon="🪑"
      wide
      onClose={() => openPanel(null)}
    >
      <div
        className="flex items-center gap-1 mb-3 p-1 rounded-full w-fit"
        style={{ background: 'color-mix(in oklab, var(--color-ink) 7%, transparent)' }}
        role="tablist"
        aria-label="Client views"
      >
        <TabButton
          id="tab-caseload"
          panelId="panel-caseload"
          on={tab === 'caseload'}
          onClick={() => setPrefs({ tab: 'caseload' })}
        >
          Caseload <span className="tabular opacity-70">{activeCount}</span>
        </TabButton>
        <TabButton
          id="tab-waiting"
          panelId="panel-waiting"
          on={tab === 'waiting'}
          onClick={() => setPrefs({ tab: 'waiting' })}
        >
          Waiting <span className="tabular opacity-70">{waitCount}</span>
        </TabButton>
      </div>

      {tab === 'caseload' ? (
        <div role="tabpanel" id="panel-caseload" aria-labelledby="tab-caseload">
          <Caseload total={activeCount} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-waiting" aria-labelledby="tab-waiting">
          <Waiting activeCount={activeCount} cap={cap} />
        </div>
      )}
    </PanelShell>
  );
}

function TabButton({
  on,
  onClick,
  children,
  id,
  panelId,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  id: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId}
      aria-selected={on}
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-[0.8rem] font-bold transition ${
        on ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
      }`}
      style={
        on
          ? { background: 'var(--color-paper)', boxShadow: 'var(--shadow-soft)' }
          : undefined
      }
    >
      {children}
    </button>
  );
}

// ── Caseload ─────────────────────────────────────────────────────────────────

function Caseload({ total }: { total: number }) {
  // Sort and filters are remembered for the session: you close this panel to
  // book someone and come back to the arrangement you were working in.
  const [prefs, setPrefs] = usePanelPrefs('clients');
  const { sort, atRisk: fRisk, unbooked: fUnbooked, complex: fComplex, chapter: fChapter } = prefs;

  const orderKey = useSim((s) => {
    const rows = s.clients.filter((c) => {
      if (c.status !== 'active') return false;
      if (fRisk && riskBadge(s, c) === 'none') return false;
      if (fUnbooked && clientBooked(s, c.id)) return false;
      if (fComplex && !c.complex) return false;
      if (fChapter !== 'all' && c.chapter !== fChapter) return false;
      return true;
    });
    const scored = rows.map((c) => {
      let score: number;
      switch (sort) {
        case 'progress':
          score = c.progress;
          break;
        case 'unseen':
          score = c.daysSinceSession;
          break;
        case 'severity':
          score = c.severity * 100 - c.progress * 0.01;
          break;
        case 'priority':
        default:
          score = clientPriority(s, c);
          break;
      }
      return { id: c.id, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.id).join(' ');
  });

  const ids = useMemo(() => (orderKey ? orderKey.split(' ') : []), [orderKey]);
  const filtered = fRisk || fUnbooked || fComplex || fChapter !== 'all';

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint mr-0.5">
          Sort
        </span>
        <SoftSelect value={sort} onChange={(v) => setPrefs({ sort: v as SortKey })} label="Sort the caseload">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </SoftSelect>
        <span className="w-px h-4 mx-1" style={{ background: 'color-mix(in oklab, var(--color-ink) 14%, transparent)' }} />
        <FilterChip
          on={fRisk}
          onClick={() => setPrefs({ atRisk: !fRisk })}
          color="var(--color-brick)"
          title="Patience or stability slipping"
        >
          At risk
        </FilterChip>
        <FilterChip
          on={fUnbooked}
          onClick={() => setPrefs({ unbooked: !fUnbooked })}
          color="var(--color-amber-deep)"
          title="No hour on today's schedule"
        >
          Unbooked today
        </FilterChip>
        <FilterChip on={fComplex} onClick={() => setPrefs({ complex: !fComplex })} color="var(--color-plum)">
          Complex
        </FilterChip>
        {(['trust', 'work', 'consolidation'] as ArcChapter[]).map((ch) => (
          <FilterChip
            key={ch}
            on={fChapter === ch}
            onClick={() => setPrefs({ chapter: fChapter === ch ? 'all' : ch })}
            color={CHAPTER_COLOR[ch]}
            title={CHAPTER_BLURB[ch]}
          >
            {CHAPTER_LABEL[ch]}
          </FilterChip>
        ))}
      </div>

      {ids.length === 0 ? (
        total === 0 ? (
          <EmptyState
            icon="🕯️"
            title="No one on the books yet."
            body="Referrals find their way here on their own. Until then, the lamp is on and the kettle is warm."
          />
        ) : (
          <EmptyState
            icon="🔎"
            title="Nobody matches that combination."
            body="Loosen a filter and they'll all come back — they haven't gone anywhere."
          />
        )
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ids.map((id) => (
            <li key={id}>
              <CaseCard clientId={id} />
            </li>
          ))}
        </ul>
      )}

      {ids.length > 0 && filtered ? (
        <p className="text-[0.7rem] text-ink-faint mt-3 text-center">
          Showing {ids.length} of {total}.
        </p>
      ) : null}
    </>
  );
}

// ── One person ───────────────────────────────────────────────────────────────

function CaseCard({ clientId }: { clientId: string }) {
  const setUi = useStore((s) => s.setUi);
  const selectedId = useUi((u) => u.selectedClientId);
  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const expanded = selectedId === clientId;

  const d = useSimShallow((s) => {
    const c = s.clients.find((x) => x.id === clientId);
    if (!c) return null;
    const t = c.therapistId ? s.therapists.find((x) => x.id === c.therapistId) : undefined;
    return {
      handle: c.handle,
      age: c.age,
      condition: c.condition,
      severity: c.severity,
      comorbidities: c.comorbidities.join(','),
      complex: c.complex,
      payment: c.payment,
      rate: c.rate,
      progress: c.progress,
      chapter: c.chapter,
      stability: c.stability,
      rapport: c.rapport,
      resilience: c.resilience,
      patience: c.patience,
      daysSince: c.daysSinceSession,
      sessionType: c.sessionType,
      partners: (c.partnerHandles ?? []).join(', '),
      portrait: c.portrait,
      plant: c.plant,
      risk: riskBadge(s, c),
      booked: clientBooked(s, c.id),
      therapistId: t?.id ?? '',
      therapistName: t?.name ?? '',
      therapistPortrait: t?.portrait,
    };
  });

  if (!d) return null;

  const risky = d.risk === 'risk';
  const mood = portraitMood(d.stability, d.progress);
  const pay = PAYMENT[d.payment];
  const patienceColor =
    d.risk === 'risk'
      ? 'var(--color-brick)'
      : d.risk === 'watch'
        ? 'var(--color-amber-deep)'
        : 'var(--color-ink-faint)';

  return (
    <article
      className={`card-warm overflow-hidden ${calm ? '' : 'rise-in'}`}
      style={
        risky
          ? {
              background:
                'linear-gradient(180deg, color-mix(in oklab, var(--color-brick) 6%, var(--color-paper)) 0%, color-mix(in oklab, var(--color-brick) 11%, var(--color-paper-warm)) 100%)',
              borderColor: 'color-mix(in oklab, var(--color-brick) 32%, transparent)',
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => setUi({ selectedClientId: expanded ? undefined : clientId })}
        aria-expanded={expanded}
        className="w-full text-left flex items-start gap-3 px-3 pt-3 pb-2"
      >
        <Portrait seed={d.portrait} size={46} mood={mood} glow={d.progress > 85} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display text-[1rem] leading-none text-ink">
              {d.handle}, {d.age}
            </span>
            <RiskDot level={d.risk} />
            <span
              className="ml-auto text-[0.63rem] font-extrabold uppercase tracking-[0.09em]"
              style={{ color: CHAPTER_COLOR[d.chapter] }}
            >
              {CHAPTER_LABEL[d.chapter]}
            </span>
          </div>

          <div className="text-[0.76rem] text-ink-soft mt-1 leading-snug">
            {CONDITION_LABELS[d.condition]}
            <span className="text-ink-faint"> · {SEVERITY_LABELS[d.severity]}</span>
          </div>

          <div className="flex flex-wrap gap-1 mt-1.5">
            {conditionList(d.comorbidities).map((co) => (
              <Chip key={co} title="Alongside the presenting problem">
                + {CONDITION_LABELS[co]}
              </Chip>
            ))}
            {d.complex ? (
              <Chip color="var(--color-plum)" title="Layered case. Slower, heavier, and worth more when it lands.">
                Complex
              </Chip>
            ) : null}
            {d.sessionType !== 'individual' ? (
              <Chip color="var(--color-amber-deep)" title={d.partners ? `With ${d.partners}` : undefined}>
                {SESSION_TYPE_LABEL[d.sessionType]}
              </Chip>
            ) : null}
            <Chip color={pay.color} title={pay.note}>
              {d.payment === 'sliding_scale' ? '🌿 ' : ''}
              {pay.label}
            </Chip>
            {!d.booked ? (
              <Chip color="var(--color-amber-deep)" title="No hour set aside for them today.">
                Unbooked
              </Chip>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 self-end -mb-1" aria-hidden>
          <Plant progress={d.progress} size={28 + (d.progress / 100) * 22} species={d.plant} />
        </div>
      </button>

      <div className="px-3 pb-3">
        <Meter
          value={d.progress}
          max={100}
          color="var(--color-sage-deep)"
          height={8}
          label="Progress"
          right={`${Math.round(d.progress)} / 100`}
        />

        <div className="grid grid-cols-3 gap-x-3 gap-y-2 mt-2.5">
          <Meter
            value={d.stability}
            color="var(--color-plum)"
            height={5}
            label="Stability"
            right={stabilityLabel(d.stability)}
          />
          <Meter
            value={d.rapport}
            color="var(--color-amber-deep)"
            height={5}
            label="Rapport"
            right={rapportLabel(d.rapport)}
          />
          <Meter
            value={d.resilience}
            color="var(--color-sage)"
            height={5}
            label="Resilience"
            right={`${Math.round(d.resilience * 100)}%`}
          />
        </div>

        <div className="mt-2.5">
          <Meter
            value={d.patience}
            max={100}
            color={patienceColor}
            height={5}
            label={
              <Tooltip
                side="top"
                content={
                  <>
                    Patience falls about {PATIENCE_DECAY_PER_IDLE_DAY} a day when nobody sees them. Below{' '}
                    {AT_RISK_PATIENCE_THRESHOLD} they are flagged at risk; below {DROPOUT_PATIENCE_THRESHOLD} they may
                    simply stop answering. A session brings it back up.
                  </>
                }
              >
                <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
                  Patience
                </span>
              </Tooltip>
            }
            right={
              d.daysSince === 0
                ? `${Math.round(d.patience)}% · seen today`
                : `${Math.round(d.patience)}% · ${d.daysSince}d unseen`
            }
          />
        </div>

        {risky ? (
          <p className="text-[0.72rem] leading-snug mt-2" style={{ color: 'var(--color-brick)' }}>
            They are close to drifting away. An hour this week is worth more than a perfect hour next month.
          </p>
        ) : null}

        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t hairline">
          {d.therapistPortrait ? (
            <Portrait seed={d.therapistPortrait} size={22} />
          ) : (
            <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-[0.7rem]" aria-hidden>
              ❓
            </span>
          )}
          <span className="text-[0.75rem] text-ink-soft truncate">
            {d.therapistName || <span className="text-ink-faint">Nobody assigned yet</span>}
          </span>
          <span className="ml-auto">
            <ReassignControl clientId={clientId} currentId={d.therapistId} />
          </span>
        </div>

        {expanded ? <CaseDetail clientId={clientId} handle={d.handle} rate={d.rate} /> : null}
      </div>
    </article>
  );
}

function ReassignControl({ clientId, currentId }: { clientId: string; currentId: string }) {
  const dispatch = useDispatch();
  const staff = useSimShallow((s) =>
    s.therapists.filter((t) => t.status !== 'departed').map((t) => `${t.id}|${t.name}`),
  );

  return (
    <Tooltip
      side="left"
      content="Moving someone to a new therapist costs part of the alliance they have already built. Sometimes it is still the right call."
    >
      <SoftSelect
        label="Reassign this client to another therapist"
        value={currentId}
        onChange={(v) => {
          if (v && v !== currentId) dispatch({ type: 'REASSIGN_CLIENT', clientId, therapistId: v });
        }}
      >
        {currentId ? null : <option value="">Assign to…</option>}
        {staff.map((row) => {
          const [id, name] = row.split('|');
          return (
            <option key={id} value={id}>
              {id === currentId ? `${name} (current)` : `Move to ${name}`}
            </option>
          );
        })}
      </SoftSelect>
    </Tooltip>
  );
}

// ── Expanded detail ──────────────────────────────────────────────────────────

function CaseDetail({ clientId, handle, rate }: { clientId: string; handle: string; rate: number }) {
  const dispatch = useDispatch();
  const setUi = useStore((s) => s.setUi);
  const openPanel = useStore((s) => s.openPanel);
  const [confirming, setConfirming] = useState(false);

  const info = useSimShallow((s) => {
    const c = s.clients.find((x) => x.id === clientId);
    if (!c) return null;
    return {
      backstory: c.backstory,
      joinedDay: c.joinedDay,
      sessions: c.sessionsAttended,
      referredBy: c.referredBy ?? '',
      pronouns: c.pronouns,
      chapter: c.chapter,
      authorized: c.authorizedSessions ?? 0,
      payment: c.payment,
      today: s.day,
    };
  });
  const story = useSimShallow((s) => (s.clients.find((x) => x.id === clientId)?.story ?? []).slice(0, 24));

  if (!info) return null;

  return (
    <div className="mt-3 pt-3 border-t hairline fade-in">
      <p className="text-[0.82rem] leading-relaxed text-ink-soft italic">{info.backstory}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[0.7rem] text-ink-faint tabular">
        <span>Joined day {info.joinedDay}</span>
        <span>
          {info.sessions} {info.sessions === 1 ? 'session' : 'sessions'} attended
        </span>
        <span>${rate} an hour</span>
        <span>{info.pronouns}</span>
        {info.payment === 'insurance' && info.authorized > 0 ? (
          <span>{info.authorized} sessions authorised</span>
        ) : null}
      </div>

      {info.referredBy ? (
        <p className="text-[0.74rem] text-ink-soft mt-1.5">
          Referred by <strong className="text-ink">{info.referredBy}</strong> — someone who finished here and told a
          friend.
        </p>
      ) : null}

      <p className="text-[0.72rem] text-ink-faint mt-2 leading-snug">
        <span className="font-bold" style={{ color: CHAPTER_COLOR[info.chapter] }}>
          {CHAPTER_LABEL[info.chapter]}.
        </span>{' '}
        {CHAPTER_BLURB[info.chapter]}
      </p>

      <div className="mt-3">
        <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint mb-2">
          Their story so far
        </div>
        {story.length === 0 ? (
          <p className="text-[0.76rem] text-ink-faint">
            Nothing written down yet. The first hour usually leaves a line.
          </p>
        ) : (
          <ol className="relative pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] top-1.5 bottom-1.5 w-px"
              style={{ background: 'color-mix(in oklab, var(--color-ink) 15%, transparent)' }}
            />
            {story.map((e, i) => {
              const color = MOOD_COLOR[e.mood] ?? MOOD_COLOR.neutral;
              return (
                <li key={`${e.day}-${i}`} className="relative pb-2.5 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute -left-4 top-[0.34rem] w-[7px] h-[7px] rounded-full"
                    style={{ background: color, boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 20%, transparent)` }}
                  />
                  <div className="text-[0.6rem] tabular uppercase tracking-wide text-ink-faint">Day {e.day}</div>
                  <div className="text-[0.79rem] leading-relaxed text-ink-soft">{e.text}</div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {confirming ? (
        <div
          className="mt-3 rounded-[var(--radius-card)] p-3"
          style={{
            background: 'color-mix(in oklab, var(--color-brick) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-brick) 30%, transparent)',
          }}
        >
          <p className="text-[0.78rem] leading-relaxed text-ink-soft">
            Send {handle} to another practice? Their hours here end today, and the neighbourhood notices — community
            trust takes a knock, and a larger one when the client was on a sliding scale. Sometimes it is still the
            kindest thing: a case you cannot hold well is a case someone else should.
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button
              variant="brick"
              size="sm"
              onClick={() => {
                setConfirming(false);
                setUi({ selectedClientId: undefined });
                dispatch({ type: 'REFER_OUT', clientId });
              }}
            >
              Yes, refer {handle} out
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep them
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setUi({ selectedClientId: clientId });
              openPanel('schedule');
            }}
          >
            📅 Book next session
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Refer out…
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Waiting ──────────────────────────────────────────────────────────────────

function Waiting({ activeCount, cap }: { activeCount: number; cap: number }) {
  const idKey = useSim((s) =>
    s.clients
      .filter((c) => c.status === 'waitlist')
      .map((c) => c.id)
      .join(' '),
  );
  const ids = useMemo(() => (idKey ? idKey.split(' ') : []), [idKey]);
  const level = useSim((s) => s.practiceLevel);
  const room = cap - activeCount;

  return (
    <>
      <div className="card-warm px-3 py-2.5 mb-3">
        <Meter
          value={activeCount}
          max={cap}
          color={room > 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)'}
          height={7}
          label="Chairs"
          right={`${activeCount} / ${cap}`}
        />
        <p className="text-[0.72rem] text-ink-faint mt-1.5 leading-snug">
          {room > 0
            ? `Room for ${room} more ${room === 1 ? 'person' : 'people'} at practice level ${level}.`
            : `Every chair is taken. Level ${level} holds ${cap} active clients — grow the practice, or finish someone's work well, before saying yes again.`}
        </p>
      </div>

      {ids.length === 0 ? (
        <EmptyState
          icon="🫖"
          title="Nobody waiting. Enjoy the quiet — it never lasts."
          body="Referrals arrive with reputation. Keep the outcomes good and the hall fills on its own."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ids.map((id) => (
            <li key={id}>
              <WaitCard clientId={id} full={room <= 0} cap={cap} level={level} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function WaitCard({
  clientId,
  full,
  cap,
  level,
}: {
  clientId: string;
  full: boolean;
  cap: number;
  level: number;
}) {
  const dispatch = useDispatch();
  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const [confirming, setConfirming] = useState(false);

  const d = useSimShallow((s) => {
    const c = s.clients.find((x) => x.id === clientId);
    if (!c) return null;
    return {
      handle: c.handle,
      age: c.age,
      condition: c.condition,
      severity: c.severity,
      comorbidities: c.comorbidities.join(','),
      complex: c.complex,
      payment: c.payment,
      rate: c.rate,
      portrait: c.portrait,
      backstory: c.backstory,
      referredBy: c.referredBy ?? '',
      waiting: c.daysSinceSession,
      sessionType: c.sessionType,
      partners: (c.partnerHandles ?? []).join(', '),
      firstLine: c.story.length ? c.story[c.story.length - 1].text : '',
      stability: c.stability,
    };
  });

  if (!d) return null;
  const pay = PAYMENT[d.payment];

  return (
    <article className={`card-warm px-3 py-3 ${calm ? '' : 'rise-in'}`}>
      <div className="flex items-start gap-3">
        <Portrait seed={d.portrait} size={44} mood={portraitMood(d.stability, 0)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display text-[1rem] leading-none text-ink">
              {d.handle}, {d.age}
            </span>
            <span className="ml-auto text-[0.68rem] tabular text-ink-faint">
              {d.waiting === 0 ? 'came in today' : `waiting ${d.waiting}d`}
            </span>
          </div>
          <div className="text-[0.76rem] text-ink-soft mt-1 leading-snug">
            {CONDITION_LABELS[d.condition]}
            <span className="text-ink-faint"> · {SEVERITY_LABELS[d.severity]}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {conditionList(d.comorbidities).map((co) => (
              <Chip key={co} title="Alongside the presenting problem">
                + {CONDITION_LABELS[co]}
              </Chip>
            ))}
            {d.complex ? (
              <Chip color="var(--color-plum)" title="Layered case. Slower going, and it counts for more.">
                Complex
              </Chip>
            ) : null}
            {d.sessionType !== 'individual' ? (
              <Chip color="var(--color-amber-deep)" title={d.partners ? `With ${d.partners}` : undefined}>
                {SESSION_TYPE_LABEL[d.sessionType]}
              </Chip>
            ) : null}
            <Chip color={pay.color} title={pay.note}>
              {d.payment === 'sliding_scale' ? '🌿 ' : ''}
              {pay.label} · ${d.rate}
            </Chip>
          </div>
        </div>
      </div>

      <p className="text-[0.8rem] leading-relaxed text-ink-soft italic mt-2.5">{d.backstory}</p>

      <p className="text-[0.73rem] text-ink-faint mt-1.5 leading-snug">
        {d.referredBy ? (
          <>
            Referred by <strong className="text-ink-soft">{d.referredBy}</strong> — someone who finished here and passed
            your name along.
          </>
        ) : (
          d.firstLine
        )}
      </p>

      {confirming ? (
        <div
          className="mt-2.5 rounded-[var(--radius-card)] p-3"
          style={{
            background: 'color-mix(in oklab, var(--color-brick) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-brick) 30%, transparent)',
          }}
        >
          <p className="text-[0.78rem] leading-relaxed text-ink-soft">
            Pass {d.handle} on to another practice? Turning someone away costs a little community trust — more when they
            were asking for a sliding scale, because that is exactly the door people talk about.
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button
              variant="brick"
              size="sm"
              onClick={() => {
                setConfirming(false);
                dispatch({ type: 'REFER_OUT', clientId });
              }}
            >
              Refer them elsewhere
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Never mind
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <Button
            variant="sage"
            size="sm"
            disabled={full}
            onClick={() => dispatch({ type: 'ACCEPT_CLIENT', clientId })}
            title={full ? `Level ${level} supports ${cap} active clients.` : undefined}
          >
            Take them on
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Refer out…
          </Button>
          {full ? (
            <span className="text-[0.7rem] text-ink-faint leading-snug flex-1 min-w-[16ch]">
              All {cap} chairs are full at level {level}. Finish some work — or grow — before you promise anyone an
              hour.
            </span>
          ) : null}
        </div>
      )}
    </article>
  );
}
