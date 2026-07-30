import { useEffect, useMemo } from 'react';
import { capacity, clockMinutes, dailyExpenses, therapistSlots } from '../sim/engine';
import { computeExceptions, type Exception } from '../sim/scheduler';
import { formatClock, formatDay, formatMoney } from '../sim/util';
import { getSim, useDispatch, useSim, useStore, useUi, type PanelId } from '../store';
import { Meter, RollingNumber, Tooltip } from './primitives';

/**
 * The persistent furniture: a glassy paper strip across the top and a rail of
 * doors down the left. Everything else in the game slides in over the office
 * scene; this is the part that never leaves.
 */

const ACT_LABEL: Record<number, string> = {
  1: 'Act I · The Therapist',
  2: 'Act II · The Practice Owner',
  3: 'Act III · The Director',
};

interface RailItem {
  id: PanelId;
  icon: string;
  label: string;
  hint: string;
}

const RAIL: RailItem[] = [
  { id: 'schedule', icon: '📅', label: 'Today', hint: 'Who is booked, and when' },
  { id: 'clients', icon: '🪴', label: 'Caseload', hint: 'Everyone you are seeing' },
  { id: 'staff', icon: '👥', label: 'The team', hint: 'Energy, morale, training, mentorship' },
  { id: 'finances', icon: '💵', label: 'The books', hint: 'What comes in and what goes out' },
  { id: 'programs', icon: '🌱', label: 'Programs', hint: 'Groups, workshops, partnerships' },
  { id: 'policies', icon: '⚙️', label: 'Policies', hint: 'The rules the scheduler follows for you' },
  { id: 'campaign', icon: '🏛️', label: 'Accreditation', hint: 'The long road to a Center of Excellence' },
  { id: 'upgrades', icon: '🛋️', label: 'The office', hint: 'Rooms, equipment, certifications' },
  { id: 'wall', icon: '🖼️', label: 'The wall', hint: 'People who finished, and what they said' },
  { id: 'log', icon: '📜', label: 'Day book', hint: 'Everything that happened, in order' },
  { id: 'settings', icon: '⚙︎', label: 'Comfort', hint: 'Calm mode, motion, sound' },
];

/** Which door a given exception wants you to walk through. */
const EXCEPTION_PANEL: Record<Exception['kind'], PanelId> = {
  client_at_risk: 'clients',
  unbooked: 'schedule',
  therapist_strain: 'staff',
  low_morale: 'staff',
  poach: 'staff',
  cash: 'finances',
};

const EXCEPTION_ICON: Record<Exception['kind'], string> = {
  client_at_risk: '🪴',
  unbooked: '📅',
  therapist_strain: '🕯️',
  low_morale: '☁️',
  poach: '📮',
  cash: '💵',
};

export function Hud() {
  const dispatch = useDispatch();

  // Space pauses, 1/2/3 set the speed. Typing and open decisions win.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el ? el.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (el instanceof HTMLElement && el.isContentEditable) return;

      const s = getSim();
      if (s.pendingEvents.length) return;

      if (e.key === ' ' || e.code === 'Space') {
        // A focused button owns the spacebar; don't double-fire.
        if (tag === 'BUTTON' || tag === 'A') return;
        if (s.dayPhase !== 'running') return;
        e.preventDefault();
        dispatch({ type: 'TOGGLE_PAUSE' });
        return;
      }
      if (e.key === '1') dispatch({ type: 'SET_SPEED', speed: 1 });
      else if (e.key === '2') dispatch({ type: 'SET_SPEED', speed: 2 });
      else if (e.key === '3') dispatch({ type: 'SET_SPEED', speed: 4 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <>
      <TopBar />
      <LeftRail />
      <ExceptionStrip />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top bar
// ─────────────────────────────────────────────────────────────────────────────

function TopBar() {
  const practiceName = useSim((s) => s.practiceName);
  const practiceLevel = useSim((s) => s.practiceLevel);
  const act = useSim((s) => s.act);

  const clock = useSim((s) => formatClock(clockMinutes(s)));
  const dayLabel = useSim((s) => formatDay(s.day));
  const quarter = useSim((s) => s.quarter);
  const year = useSim((s) => s.year);
  const dayPhase = useSim((s) => s.dayPhase);

  const cash = useSim((s) => s.cash);
  const earnedToday = useSim((s) => s.lastDayResults.reduce((a, r) => a + r.revenue, 0));
  const expensesDue = useSim((s) => dailyExpenses(s));

  const reputation = useSim((s) => s.reputation);
  const trust = useSim((s) => s.communityTrust);

  const activeClients = useSim((s) => s.clients.filter((c) => c.status === 'active').length);
  const cap = useSim((s) => capacity(s));
  const staffCount = useSim((s) => s.therapists.filter((t) => t.status !== 'departed').length);
  const slots = useSim((s) => therapistSlots(s));

  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);

  const net = earnedToday - expensesDue;
  const phaseWord =
    dayPhase === 'morning_brief' ? 'Before the doors open' : dayPhase === 'day_end' ? 'After hours' : null;

  return (
    <header
      className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 lg:gap-4 px-3.5 py-2 flex-nowrap overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--color-paper) 93%, transparent) 0%, color-mix(in oklab, var(--color-paper-warm) 88%, transparent) 100%)',
        backdropFilter: 'blur(12px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.15)',
        borderBottom: '1px solid color-mix(in oklab, var(--color-ink) 15%, transparent)',
        boxShadow: '0 10px 30px -24px rgba(30,58,58,0.7)',
      }}
    >
      {/* Identity */}
      <div className="min-w-0 shrink">
        <h1 className="display text-[1.02rem] leading-tight text-ink truncate">{practiceName}</h1>
        <div className="flex items-center gap-1.5 text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint whitespace-nowrap">
          <span className="truncate">{ACT_LABEL[act] ?? ACT_LABEL[1]}</span>
          <span aria-hidden>·</span>
          <span className="tabular">Lv {practiceLevel}</span>
        </div>
      </div>

      <div
        className="h-8 w-px shrink-0 hidden sm:block"
        style={{ background: 'color-mix(in oklab, var(--color-ink) 13%, transparent)' }}
      />

      {/* Clock */}
      <div className="shrink-0 whitespace-nowrap">
        <div className="display tabular text-[1.12rem] leading-tight text-ink">{clock}</div>
        <div className="text-[0.63rem] uppercase tracking-[0.08em] text-ink-faint">
          {dayLabel} · Q{quarter} Y{year}
        </div>
      </div>

      <SpeedControls />

      {phaseWord ? (
        <span className="chip shrink-0 hidden xl:inline-flex" title="The clock is holding for you.">
          🕯️ {phaseWord}
        </span>
      ) : null}

      <div className="flex-1 min-w-2" />

      {/* Money */}
      <div className="shrink-0">
        <Tooltip
          side="bottom"
          content={
            dayPhase === 'day_end' ? (
              <>
                Today brought in <b>{formatMoney(earnedToday)}</b> and cost <b>{formatMoney(expensesDue)}</b> in
                salaries, rent and overhead. Both are already settled.
              </>
            ) : (
              <>
                <b>{formatMoney(earnedToday)}</b> earned so far today. <b>{formatMoney(expensesDue)}</b> in salaries,
                rent and overhead comes out when you close up.
              </>
            )
          }
        >
          <div className="text-right">
            <div className="display tabular text-[1.12rem] leading-tight text-ink">
              {calm ? formatMoney(cash) : <RollingNumber value={cash} format={(v) => formatMoney(v)} />}
            </div>
            <div
              className="tabular text-[0.66rem] leading-tight whitespace-nowrap"
              style={{ color: net >= 0 ? 'var(--color-sage-deep)' : 'var(--color-brick)' }}
            >
              {formatMoney(net, true)} today
            </div>
          </div>
        </Tooltip>
      </div>

      {/* Standing in the world */}
      <div className="shrink-0 hidden lg:block">
        <Tooltip
          side="bottom"
          content={
            <>
              Reputation brings more, and more complex, referrals. It rises when people finish well and drifts down a
              little every day you coast.
            </>
          }
        >
          <div className="w-[96px]">
            <Meter
              value={reputation}
              max={100}
              height={6}
              color="var(--color-amber)"
              label="Reputation"
              right={Math.round(reputation)}
            />
          </div>
        </Tooltip>
      </div>

      <div className="shrink-0 hidden lg:block">
        <Tooltip
          side="bottom"
          content={
            <>
              Community Trust is whether the neighbourhood believes you&rsquo;re for them. Sliding-scale work raises
              it; turning people away lowers it.
            </>
          }
        >
          <div className="w-[96px]">
            <Meter
              value={trust}
              max={100}
              height={6}
              color="var(--color-sage)"
              label="Community"
              right={Math.round(trust)}
            />
          </div>
        </Tooltip>
      </div>

      {/* Room in the practice */}
      <div className="shrink-0 hidden md:block">
        <Tooltip
          side="bottom"
          content={
            <>
              Practice level {practiceLevel} has room for <b>{cap}</b> active clients and <b>{slots}</b> therapists.
              Level up by helping people finish.
            </>
          }
        >
          <div className="flex items-center gap-2.5 pl-1">
            <div className="text-center">
              <div className="tabular text-[0.9rem] leading-none text-ink">
                {activeClients}
                <span className="text-ink-faint">/{cap}</span>
              </div>
              <div className="text-[0.58rem] uppercase tracking-[0.09em] text-ink-faint mt-0.5">Clients</div>
            </div>
            <div className="text-center">
              <div className="tabular text-[0.9rem] leading-none text-ink">
                {staffCount}
                <span className="text-ink-faint">/{slots}</span>
              </div>
              <div className="text-[0.58rem] uppercase tracking-[0.09em] text-ink-faint mt-0.5">Team</div>
            </div>
          </div>
        </Tooltip>
      </div>
    </header>
  );
}

function SpeedControls() {
  const dispatch = useDispatch();
  const paused = useSim((s) => s.paused);
  const speed = useSim((s) => s.speed);
  const running = useSim((s) => s.dayPhase === 'running');
  const speeds: (1 | 2 | 4)[] = [1, 2, 4];

  return (
    <div
      className="flex items-center gap-0.5 rounded-full p-0.5 shrink-0"
      style={{
        background: 'color-mix(in oklab, var(--color-ink) 7%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-ink) 13%, transparent)',
      }}
      role="group"
      aria-label="Clock controls"
    >
      <button
        onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}
        disabled={!running}
        aria-label={paused ? 'Resume the day (space)' : 'Hold the day (space)'}
        title={paused ? 'Resume — space' : 'Hold everything — space'}
        className="w-7 h-7 grid place-items-center rounded-full text-[0.7rem] transition disabled:opacity-40"
        style={{
          background: paused && running ? 'var(--color-amber)' : 'transparent',
          color: paused && running ? '#2a1a06' : 'var(--color-ink-soft)',
        }}
      >
        <span aria-hidden>{paused ? '▶' : '❚❚'}</span>
      </button>
      <div className="w-px h-4" style={{ background: 'color-mix(in oklab, var(--color-ink) 13%, transparent)' }} />
      {speeds.map((sp, i) => {
        const active = speed === sp;
        return (
          <button
            key={sp}
            onClick={() => dispatch({ type: 'SET_SPEED', speed: sp })}
            aria-pressed={active}
            aria-label={`Speed ${sp} times (key ${i + 1})`}
            title={`${sp}× — key ${i + 1}`}
            className="tabular px-1.5 h-7 min-w-[26px] grid place-items-center rounded-full text-[0.7rem] font-bold transition"
            style={{
              background: active ? 'color-mix(in oklab, var(--color-ink) 82%, transparent)' : 'transparent',
              color: active ? 'var(--color-paper)' : 'var(--color-ink-faint)',
            }}
          >
            {sp}×
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Left rail
// ─────────────────────────────────────────────────────────────────────────────

function LeftRail() {
  const act = useSim((s) => s.act);
  const practiceLevel = useSim((s) => s.practiceLevel);
  const hasAutoScheduler = useSim((s) => s.upgrades.includes('up_auto_scheduler'));
  const panel = useUi((u) => u.panel);
  const openPanel = useStore((s) => s.openPanel);

  // Encoded as a primitive so the rail only re-renders when a badge changes.
  const badgeSig = useSim((s) => {
    const counts: Partial<Record<PanelId, number>> = {};
    for (const e of computeExceptions(s)) {
      const p = EXCEPTION_PANEL[e.kind];
      counts[p] = (counts[p] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  });

  const badges = useMemo(() => {
    const out: Partial<Record<PanelId, number>> = {};
    for (const part of badgeSig.split(',')) {
      if (!part) continue;
      const [k, v] = part.split('=');
      out[k as PanelId] = Number(v);
    }
    return out;
  }, [badgeSig]);

  const visible = RAIL.filter((item) => {
    if (item.id === 'policies' || item.id === 'campaign') return act >= 3 || hasAutoScheduler;
    if (item.id === 'programs') return practiceLevel >= 3;
    return true;
  });

  return (
    <nav
      aria-label="Practice panels"
      className="absolute left-3 top-[var(--hud-h)] z-40 flex flex-col gap-1.5 p-1.5 rounded-[18px]"
      style={{
        background: 'color-mix(in oklab, var(--color-paper) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid color-mix(in oklab, var(--color-ink) 13%, transparent)',
        boxShadow: 'var(--shadow-lamp)',
      }}
    >
      {visible.map((item) => {
        const count = badges[item.id] ?? 0;
        const active = panel === item.id;
        return (
          <Tooltip
            key={item.id}
            side="right"
            content={
              <span className="block">
                <b>{item.label}</b>
                <span className="block text-ink-faint">{item.hint}</span>
                {count > 0 ? (
                  <span className="block mt-0.5" style={{ color: 'var(--color-amber-deep)' }}>
                    {count} thing{count === 1 ? '' : 's'} here want{count === 1 ? 's' : ''} you.
                  </span>
                ) : null}
              </span>
            }
          >
            <button
              onClick={() => openPanel(item.id)}
              aria-label={`${item.label} — ${item.hint}`}
              aria-current={active ? 'true' : undefined}
              className="relative w-10 h-10 grid place-items-center rounded-[13px] text-[1.05rem] transition"
              style={{
                background: active
                  ? 'linear-gradient(180deg, var(--color-amber) 0%, var(--color-amber-deep) 100%)'
                  : 'color-mix(in oklab, var(--color-ink) 5%, transparent)',
                border: `1px solid color-mix(in oklab, var(--color-ink) ${active ? 24 : 11}%, transparent)`,
                boxShadow: active ? '0 6px 16px -9px rgba(201,135,58,0.95)' : 'none',
              }}
            >
              <span aria-hidden>{item.icon}</span>
              {count > 0 && !active ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                  style={{
                    background: 'var(--color-amber)',
                    boxShadow: '0 0 0 2.5px color-mix(in oklab, var(--color-paper) 88%, transparent)',
                  }}
                />
              ) : null}
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Act 3 exception feed
// ─────────────────────────────────────────────────────────────────────────────

function ExceptionStrip() {
  const act = useSim((s) => s.act);
  // Stringified so the strip is stable across ticks that change nothing here.
  const json = useSim((s) => JSON.stringify(computeExceptions(s).slice(0, 3)));
  const setUi = useStore((s) => s.setUi);
  const list = useMemo(() => JSON.parse(json) as Exception[], [json]);

  if (act < 3 || list.length === 0) return null;

  return (
    <section
      aria-label="Things the policies could not settle"
      className="absolute left-[70px] top-[var(--hud-h)] z-30 w-[min(330px,calc(100%-6rem))] flex flex-col gap-1"
    >
      <div
        className="text-[0.58rem] font-extrabold uppercase tracking-[0.13em] text-paper pl-1"
        style={{ textShadow: '0 1px 6px rgba(22,41,44,0.85)' }}
      >
        Needs a human
      </div>
      {list.map((e) => {
        const color = e.severity >= 3 ? 'var(--color-brick)' : 'var(--color-amber-deep)';
        return (
          <button
            key={e.id}
            onClick={() =>
              setUi({
                panel: EXCEPTION_PANEL[e.kind],
                selectedClientId: e.clientId,
                selectedTherapistId: e.therapistId,
              })
            }
            className="card-warm text-left px-2.5 py-1.5 flex items-start gap-2 hover:brightness-[1.04] transition"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <span aria-hidden className="text-[0.9rem] leading-none mt-0.5">
              {EXCEPTION_ICON[e.kind]}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.76rem] font-bold text-ink leading-snug">{e.label}</span>
              <span className="block text-[0.68rem] text-ink-faint leading-snug">{e.detail}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
