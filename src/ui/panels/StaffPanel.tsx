import { useMemo, useState, type ReactNode } from 'react';
import {
  ENERGY_PER_SESSION,
  ENERGY_REGEN_OVERNIGHT,
  FOCUSES,
  POACH_MORALE_THRESHOLD,
  SABBATICAL_DAYS,
  STRAIN_PER_LOW_ENERGY_DAY,
  STRAIN_RECOVERY_PER_GOOD_DAY,
} from '../../sim/balance';
import {
  TRAININGS,
  modalityById,
  philosophyById,
  programById,
  techniqueById,
  trainingById,
  traitById,
} from '../../content';
import { therapistSlots } from '../../sim/engine';
import { meetsRequirement } from '../../sim/eventsys';
import { skillCap } from '../../sim/quality';
import { energyForecast, sessionsForTherapist } from '../../sim/scheduler';
import type {
  CareerStage,
  GameState,
  ModalityId,
  PortraitSeed,
  TherapistStatus,
  TrainingDef,
} from '../../sim/types';
import { formatMoney } from '../../sim/util';
import {
  staffSectionKey,
  useDispatch,
  usePanelPrefs,
  useSim,
  useSimShallow,
  useStore,
  useUi,
} from '../../store';
import { Portrait } from '../Portrait';
import {
  Button,
  Chip,
  Divider,
  EmptyState,
  Meter,
  Modal,
  PanelShell,
  RollingNumber,
  SectionHeading,
  Tooltip,
} from '../primitives';

/**
 * The Staff panel — people, not stat sticks.
 *
 * Everything here is a read of the sim plus a dispatch. Nothing is simulated in
 * this file: energy forecasts come from the scheduler, the quality ceiling comes
 * from sim/quality, training eligibility from sim/eventsys. The only arithmetic
 * done locally is *display of odds the sim will later roll*, and those helpers
 * are marked with the engine function they mirror so they can never drift
 * silently — a hidden penalty is a design bug in this game.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Small shared bits
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<CareerStage, string> = {
  junior: 'Early career',
  mid: 'Established',
  veteran: 'Veteran',
};

/**
 * The object each school leaves in its room. The prose version lives in
 * content/modalities.ts as `prop`; this is only its little icon.
 */
const PROP_EMOJI: Record<ModalityId, string> = {
  cbt: '📋',
  dbt: '🃏',
  emdr: '💡',
  somatic: '🧘',
  psychodynamic: '🛋️',
  act: '🧭',
  play: '🧸',
  family: '🪑',
};

const TIER_LABEL = ['I', 'II', 'III'];
const TIER_MEANING = [
  'Tier I — a starter card. Everybody in this school has it.',
  'Tier II — earned in a two-day course.',
  'Tier III — advanced, and gated behind a certification.',
];

function daysPhrase(n: number): string {
  if (n <= 0) return 'back today';
  if (n === 1) return 'back tomorrow';
  return `back in ${n} days`;
}

function energyReading(pct: number): string {
  if (pct > 0.75) return 'Rested';
  if (pct > 0.52) return 'Steady';
  if (pct > 0.32) return 'Flagging';
  return 'Running on fumes';
}

function moraleReading(m: number): string {
  if (m >= 78) return 'Thriving';
  if (m >= 62) return 'Good spirits';
  if (m >= 45) return 'Getting by';
  if (m >= 30) return 'Unhappy';
  return 'One foot out the door';
}

function strainReading(v: number): string {
  if (v < 25) return 'Carrying it well';
  if (v < 50) return 'Feeling the weight';
  if (v < 70) return 'Fraying at the edges';
  if (v < 86) return 'Close to the wall';
  return 'About to break';
}

function warmthReading(v: number): string {
  if (v > 60) return 'Close';
  if (v > 25) return 'Warm';
  if (v > -10) return 'Cordial';
  if (v > -40) return 'Cool';
  return 'Friction';
}

function warmthColor(v: number): string {
  if (v > 25) return 'var(--color-sage-deep)';
  if (v > -10) return 'var(--color-amber-deep)';
  return 'var(--color-brick)';
}

/** Focusable "why is this number what it is" affordance. */
function Why({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={children}>
      <button
        type="button"
        aria-label={label}
        className="w-[15px] h-[15px] ml-1 rounded-full grid place-items-center text-[0.58rem] font-extrabold leading-none text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        style={{ background: 'color-mix(in oklab, var(--color-ink) 9%, transparent)' }}
      >
        ?
      </button>
    </Tooltip>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <Tooltip content={TIER_MEANING[tier - 1]}>
      <span
        className="tabular text-[0.56rem] font-bold px-1.5 py-[1px] rounded-full leading-none"
        style={{
          background: 'color-mix(in oklab, var(--color-ink) 9%, transparent)',
          color: 'var(--color-ink-faint)',
        }}
      >
        {TIER_LABEL[tier - 1]}
      </span>
    </Tooltip>
  );
}

/** The four foldable sections on a therapist's card. */
type StaffSection = 'techniques' | 'relationships' | 'training' | 'record';

/**
 * A foldable section, remembered per therapist.
 *
 * A `<details>` element forgets it was open the moment the panel unmounts, and
 * the team panel is exactly the one you close and reopen all day — so the open
 * set is lifted into UiState. Keyed by therapist, because "I had Maya's
 * training list open" is the thing you meant, not "I had training lists open".
 */
function Disclosure({
  therapistId,
  section,
  summary,
  count,
  children,
}: {
  therapistId: string;
  section: StaffSection;
  summary: string;
  count?: ReactNode;
  children: ReactNode;
}) {
  const [prefs, setPrefs] = usePanelPrefs('staff');
  const key = staffSectionKey(therapistId, section);
  const open = prefs.openSections.includes(key);

  return (
    <details
      className="group mt-2.5"
      open={open}
      onToggle={(e) => {
        const nowOpen = e.currentTarget.open;
        if (nowOpen === open) return;
        setPrefs({
          openSections: nowOpen
            ? [...prefs.openSections, key]
            : prefs.openSections.filter((k) => k !== key),
        });
      }}
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none flex items-center gap-1.5 rounded px-1 py-1 -mx-1 text-[0.68rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber">
        <span className="transition-transform duration-200 group-open:rotate-90 inline-block">▸</span>
        {summary}
        {count !== undefined ? <span className="tabular font-bold normal-case tracking-normal">{count}</span> : null}
      </summary>
      <div className="pt-1.5 pl-3">{children}</div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roster (cheap string key → parsed list, so selectors stay primitive)
// ─────────────────────────────────────────────────────────────────────────────

interface RosterEntry {
  id: string;
  name: string;
  level: number;
  isPlayer: boolean;
  hiredDay: number;
}

const FIELD_SEP = '\u001f';
const ROW_SEP = '\u001e';

function rosterKeyOf(s: GameState): string {
  return s.therapists
    .filter((t) => t.status !== 'departed')
    .map((t) => [t.id, t.name, t.level, t.isPlayer ? 1 : 0, t.hiredDay].join(FIELD_SEP))
    .join(ROW_SEP);
}

function parseRoster(key: string): RosterEntry[] {
  if (!key) return [];
  const rows = key.split(ROW_SEP).map((row) => {
    const [id, name, level, isPlayer, hiredDay] = row.split(FIELD_SEP);
    return {
      id,
      name,
      level: Number(level),
      isPlayer: isPlayer === '1',
      hiredDay: Number(hiredDay),
    };
  });
  return rows.sort((a, b) => {
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    if (a.hiredDay !== b.hiredDay) return a.hiredDay - b.hiredDay;
    return a.name.localeCompare(b.name);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// StaffPanel
// ─────────────────────────────────────────────────────────────────────────────

export function StaffPanel() {
  const openPanel = useStore((s) => s.openPanel);
  const setUi = useStore((s) => s.setUi);

  const calm = useSim((s) => s.settings.calmMode || s.settings.reducedMotion);
  const slots = useSim((s) => therapistSlots(s));
  const payroll = useSim((s) =>
    s.therapists.filter((t) => t.status !== 'departed' && !t.isPlayer).reduce((a, t) => a + t.salary, 0),
  );
  const candidateCount = useSim((s) => s.candidates.length);
  const rosterKey = useSim(rosterKeyOf);
  const roster = useMemo(() => parseRoster(rosterKey), [rosterKey]);

  return (
    <PanelShell
      title="The Team"
      icon="🫂"
      subtitle={`${roster.length} of ${slots} chair${slots === 1 ? '' : 's'} filled · payroll ${formatMoney(payroll)} a day`}
      onClose={() => openPanel(null)}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.72rem] text-ink-faint leading-snug">
            {candidateCount > 0
              ? `${candidateCount} ${candidateCount === 1 ? 'person is' : 'people are'} waiting to hear from you.`
              : 'Nobody has applied lately. Reputation brings them to the door.'}
          </div>
          <Button variant="primary" onClick={() => setUi({ hireOpen: true })}>
            👋 Interview candidates{candidateCount ? ` (${candidateCount})` : ''}
          </Button>
        </div>
      }
    >
      {roster.length === 0 ? (
        <EmptyState
          icon="🪑"
          title="An empty staff room"
          body="Nobody on the roster — not even you. That should not be possible, but here we are."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {roster.map((r, i) => (
            <TherapistCard key={r.id} id={r.id} roster={roster} index={i} calm={calm} />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One therapist
// ─────────────────────────────────────────────────────────────────────────────

interface StaffView {
  id: string;
  name: string;
  pronouns: string;
  portrait: PortraitSeed;
  modality: ModalityId;
  secondary?: ModalityId;
  skill: number;
  energy: number;
  maxEnergy: number;
  morale: number;
  strain: number;
  stage: CareerStage;
  level: number;
  salary: number;
  tenure: number;
  status: TherapistStatus;
  statusDays: number;
  isPlayer: boolean;
  mentorId: string;
  /** Stable references, with a companion key so shallow compare notices edits. */
  traits: string[];
  traitsKey: string;
  techniques: string[];
  techKey: string;
  certifications: string[];
  certKey: string;
  menteeIds: string[];
  menteeKey: string;
  relationships: Record<string, number>;
  relKey: string;
  poachRival: string;
  poachSalary: number;
  poachDays: number;
  booked: number;
  done: number;
  forecast: number;
  withClient: string;
  withFocus: string;
  sessionT: number;
  trainingName: string;
  programName: string;
  lifetimeSessions: number;
  lifetimeCures: number;
  lifetimeBreakthroughs: number;
  sabbaticals: number;
}

function TherapistCard({
  id,
  roster,
  index,
  calm,
}: {
  id: string;
  roster: RosterEntry[];
  index: number;
  calm: boolean;
}) {
  const dispatch = useDispatch();
  const [confirmFire, setConfirmFire] = useState(false);

  const v = useSimShallow((s): StaffView | null => {
    const t = s.therapists.find((x) => x.id === id);
    if (!t) return null;
    const sessions = sessionsForTherapist(s, t.id);
    const live = sessions.find((x) => x.status === 'active');
    const liveClient = live ? s.clients.find((c) => c.id === live.clientId) : undefined;
    const program = s.programs.find((p) => p.active && p.therapistIds.includes(t.id));
    return {
      id: t.id,
      name: t.name,
      pronouns: t.pronouns,
      portrait: t.portrait,
      modality: t.modality,
      secondary: t.secondaryModality,
      skill: t.skill,
      energy: t.energy,
      maxEnergy: t.maxEnergy,
      morale: t.morale,
      strain: t.strain,
      stage: t.stage,
      level: t.level,
      salary: t.salary,
      tenure: t.tenure,
      status: t.status,
      statusDays: t.statusDays,
      isPlayer: !!t.isPlayer,
      mentorId: t.mentorId ?? '',
      traits: t.traits,
      traitsKey: t.traits.join('|'),
      techniques: t.techniques,
      techKey: t.techniques.join('|'),
      certifications: t.certifications,
      certKey: t.certifications.join('|'),
      menteeIds: t.menteeIds,
      menteeKey: t.menteeIds.join('|'),
      relationships: t.relationships,
      relKey: Object.entries(t.relationships)
        .map(([k, n]) => `${k}:${Math.round(n)}`)
        .join('|'),
      poachRival: t.poachOffer?.rival ?? '',
      poachSalary: t.poachOffer?.salary ?? 0,
      poachDays: t.poachOffer?.daysLeft ?? 0,
      booked: sessions.length,
      done: sessions.filter((x) => x.status === 'done').length,
      forecast: energyForecast(s, t),
      withClient: liveClient ? `${liveClient.handle} (${liveClient.age})` : '',
      withFocus: live ? FOCUSES[live.focus].name : '',
      sessionT: live ? Math.round(live.t * 20) / 20 : 0,
      trainingName: trainingById[String(s.flags[`training_${t.id}`] ?? '')]?.name ?? '',
      programName: program ? programById[program.id]?.name ?? '' : '',
      lifetimeSessions: t.stats.sessions,
      lifetimeCures: t.stats.cures,
      lifetimeBreakthroughs: t.stats.breakthroughs,
      sabbaticals: t.stats.sabbaticals,
    };
  });

  const practiceLevel = useSim((s) => s.practiceLevel);
  const cap = skillCap(practiceLevel);

  if (!v) return null;

  const mod = modalityById[v.modality];
  const secondary = v.secondary ? modalityById[v.secondary] : undefined;
  const energyPct = v.energy / Math.max(1, v.maxEnergy);
  const mood: 'tired' | 'happy' | 'neutral' =
    energyPct < 0.35 ? 'tired' : v.morale > 78 ? 'happy' : 'neutral';
  const away = v.status === 'training' || v.status === 'sabbatical' || v.status === 'conference';

  return (
    <article
      className={`card-warm px-4 py-3.5 ${calm ? '' : 'rise-in'}`}
      style={calm ? undefined : { animationDelay: `${Math.min(index, 6) * 45}ms` }}
      aria-label={`${v.name}, ${STAGE_LABEL[v.stage]}`}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 relative">
          <Portrait seed={v.portrait} size={56} mood={mood} glow={v.status === 'in_session'} title={v.name} />
          <span
            className="absolute -bottom-1 -right-1 tabular text-[0.58rem] font-bold px-1.5 py-[1px] rounded-full"
            style={{
              background: 'var(--color-paper)',
              border: '1px solid color-mix(in oklab, var(--color-ink) 18%, transparent)',
              color: 'var(--color-ink-soft)',
            }}
            title={`Level ${v.level}`}
          >
            L{v.level}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="display text-[1.02rem] text-ink leading-tight">{v.name}</h3>
            <span className="text-[0.7rem] text-ink-faint">{v.pronouns}</span>
            {v.isPlayer ? <Chip color="var(--color-amber)">This one is you</Chip> : null}
          </div>
          <p className="text-[0.76rem] text-ink-soft leading-snug mt-0.5">
            <Tooltip
              content={
                <span>
                  <strong className="font-bold">{mod?.name}</strong>
                  {mod?.blurb ? <> — {mod.blurb}</> : null}
                  {mod?.prop ? (
                    <span className="block mt-1 text-ink-faint">In their room: {mod.prop}.</span>
                  ) : null}
                </span>
              }
            >
              <span className="cursor-help">
                <span aria-hidden>{PROP_EMOJI[v.modality]}</span> {mod?.name ?? v.modality}
              </span>
            </Tooltip>
            {secondary ? (
              <span className="text-ink-faint">
                {' '}
                + <span aria-hidden>{PROP_EMOJI[secondary.id]}</span> {secondary.name}
              </span>
            ) : null}
            <span className="text-ink-faint"> · {STAGE_LABEL[v.stage]}</span>
          </p>
          <p className="text-[0.7rem] text-ink-faint leading-snug">
            {v.isPlayer
              ? `${v.tenure} day${v.tenure === 1 ? '' : 's'} since you opened the doors · no salary, only consequences`
              : `With you ${v.tenure} day${v.tenure === 1 ? '' : 's'} · ${formatMoney(v.salary)}/day`}
          </p>
        </div>

        {v.status === 'in_session' ? (
          <div className="shrink-0 text-right">
            <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">In session</div>
            <div className="tabular text-[0.72rem] text-ink-soft">{Math.round(v.sessionT * 100)}%</div>
          </div>
        ) : null}
      </div>

      {/* ── Traits ─────────────────────────────────────────────────────────── */}
      {v.traits.length ? (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {v.traits.map((tid) => {
            const def = traitById[tid];
            if (!def) return null;
            const color = def.tone === 'boon' ? 'var(--color-sage-deep)' : 'var(--color-plum)';
            return (
              <Tooltip key={tid} content={<span>{def.blurb}</span>}>
                <button
                  type="button"
                  className="chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                  aria-label={`${def.name}. ${def.blurb}`}
                  style={{
                    background: `color-mix(in oklab, ${color} 15%, transparent)`,
                    borderColor: `color-mix(in oklab, ${color} 38%, transparent)`,
                    color: `color-mix(in oklab, ${color} 82%, #1E3A3A)`,
                  }}
                >
                  {def.tone === 'boon' ? '✿' : '◇'} {def.name}
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : null}

      {/* ── Status ribbon ──────────────────────────────────────────────────── */}
      <StatusLine v={v} away={away} />

      {/* ── Meters ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <Meter
          value={Math.min(v.energy, v.forecast)}
          max={v.maxEnergy}
          ghost={v.energy}
          color="var(--color-plum)"
          label={
            <span className="inline-flex items-center">
              Energy
              <Why label="What moves energy?">
                Each session costs about {ENERGY_PER_SESSION}. Process costs {FOCUSES.process.energyMult}× that,
                Stabilize {FOCUSES.stabilize.energyMult}×. A night off returns roughly {ENERGY_REGEN_OVERNIGHT}. The
                solid bar is where today's booked sessions leave them; the faded bar is where they are now.
              </Why>
            </span>
          }
          right={
            <>
              {Math.round(v.energy)}
              {v.forecast < Math.round(v.energy) ? <span className="text-ink-faint"> → {v.forecast}</span> : null}
            </>
          }
        />
        <Meter
          value={v.morale}
          max={100}
          color="var(--color-amber)"
          label={
            <span className="inline-flex items-center">
              Morale
              <Why label="What moves morale?">
                A fair caseload lifts it; overwork, idle days, dropouts and departures pull it down. Friends in the
                building help. Below {POACH_MORALE_THRESHOLD} rival practices start calling.
              </Why>
            </span>
          }
          right={Math.round(v.morale)}
        />
        <Meter
          value={v.strain}
          max={100}
          color="var(--color-brick)"
          label={
            <span className="inline-flex items-center">
              Burnout risk
              <Why label="What moves burnout risk?">
                Climbs about {STRAIN_PER_LOW_ENERGY_DAY} on a day that ends under 30% energy and falls about{' '}
                {STRAIN_RECOVERY_PER_GOOD_DAY} on a kinder one. At 100 they take {SABBATICAL_DAYS[0]}–
                {SABBATICAL_DAYS[1]} days of sabbatical — and come back with more capacity than they left with.
              </Why>
            </span>
          }
          right={Math.round(v.strain)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1 text-[0.7rem] text-ink-faint leading-snug">
        <span>{energyReading(energyPct)}</span>
        <span>{moraleReading(v.morale)}</span>
        <span>{strainReading(v.strain)}</span>
      </div>

      {/* ── Skill & ceiling ────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">Skill</span>
          <span className="display tabular text-[1.1rem] text-ink">{Math.round(v.skill)}</span>
        </div>
        <div className="h-4 w-px" style={{ background: 'color-mix(in oklab, var(--color-ink) 14%, transparent)' }} />
        <div className="flex items-baseline gap-1.5">
          <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint inline-flex items-center">
            Practice ceiling
            <Why label="What is the practice ceiling?">
              However good the hour is, session quality is capped at {Math.round(cap * 100)}% while the practice is
              level {practiceLevel}. The ceiling rises with practice level — skill above it is stored up, not wasted.
            </Why>
          </span>
          <span className="tabular text-[0.85rem] text-ink-soft">{Math.round(cap * 100)}%</span>
        </div>
        <div className="flex-1 min-w-[100px]">
          <Meter value={v.skill} max={100} color="var(--color-sage-deep)" height={5} />
        </div>
      </div>

      {/* ── Today's load ───────────────────────────────────────────────────── */}
      <p className="mt-2.5 text-[0.74rem] text-ink-soft leading-snug">
        {away || v.status === 'departed' ? (
          <span className="text-ink-faint">No hours today — their calendar is elsewhere.</span>
        ) : v.booked === 0 ? (
          <span className="text-ink-faint">Nothing booked today. A quiet desk is not always a bad thing.</span>
        ) : (
          <>
            <span className="tabular">{v.booked}</span> session{v.booked === 1 ? '' : 's'} booked today
            {v.done ? (
              <span className="text-ink-faint">
                {' '}
                · <span className="tabular">{v.done}</span> already done
              </span>
            ) : null}
            <span className="text-ink-faint">
              {' '}
              · ends the day near <span className="tabular">{v.forecast}</span> energy
            </span>
          </>
        )}
      </p>

      {/* ── Poach offer ────────────────────────────────────────────────────── */}
      {v.poachRival ? <PoachBanner v={v} /> : null}

      {/* ── Disclosures ────────────────────────────────────────────────────── */}
      <TechniqueList v={v} />
      <RelationshipList v={v} roster={roster} />
      <TrainingList v={v} />

      <Disclosure therapistId={v.id} section="record" summary="Their record" count={`${v.lifetimeSessions} hours`}>
        <ul className="text-[0.74rem] text-ink-soft leading-relaxed">
          <li>
            <span className="tabular">{v.lifetimeSessions}</span> sessions held here.
          </li>
          <li>
            <span className="tabular">{v.lifetimeCures}</span> people finished treatment with them.
          </li>
          <li>
            <span className="tabular">{v.lifetimeBreakthroughs}</span> breakthrough{v.lifetimeBreakthroughs === 1 ? '' : 's'}{' '}
            in the room.
          </li>
          {v.sabbaticals ? (
            <li className="text-ink-faint">
              <span className="tabular">{v.sabbaticals}</span> sabbatical{v.sabbaticals === 1 ? '' : 's'} taken. Each one
              was a bill that came due.
            </li>
          ) : null}
        </ul>
      </Disclosure>

      {/* ── Let go ─────────────────────────────────────────────────────────── */}
      {!v.isPlayer ? (
        <div className="mt-3 pt-2.5 border-t hairline">
          {confirmFire ? (
            <div className="flex flex-col gap-2">
              <p className="text-[0.74rem] text-ink-soft leading-snug">
                Letting {v.name.split(' ')[0]} go costs more than a salary line: everyone left loses a little morale,
                and their clients keep their hours but lose some trust and patience in the handover. There is no
                undo.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="brick"
                  size="sm"
                  onClick={() => {
                    dispatch({ type: 'FIRE_THERAPIST', therapistId: v.id });
                    setConfirmFire(false);
                  }}
                >
                  Yes, let them go
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmFire(false)}>
                  Never mind
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmFire(true)}
              className="text-[0.7rem] font-bold text-ink-faint hover:text-brick transition rounded px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              Let {v.name.split(' ')[0]} go…
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status line
// ─────────────────────────────────────────────────────────────────────────────

function StatusLine({ v, away }: { v: StaffView; away: boolean }) {
  if (v.status === 'available' && !v.programName) return null;

  const tone =
    v.status === 'sabbatical'
      ? 'var(--color-brick)'
      : v.status === 'in_session'
        ? 'var(--color-amber-deep)'
        : 'var(--color-plum)';

  let icon = '🕰️';
  let text: ReactNode = null;

  if (v.status === 'in_session') {
    icon = '🚪';
    text = (
      <>
        In the room with <strong className="font-bold">{v.withClient || 'someone'}</strong>
        {v.withFocus ? <span className="text-ink-faint"> · {v.withFocus}</span> : null}. The door stays shut.
      </>
    );
  } else if (v.status === 'training') {
    icon = '📚';
    text = (
      <>
        At {v.trainingName || 'a course'} — {daysPhrase(v.statusDays)}. The fee was the easy part; their caseload is
        the rest of it.
      </>
    );
  } else if (v.status === 'sabbatical') {
    icon = '🌙';
    text = (
      <>
        On sabbatical — {daysPhrase(v.statusDays)}. They hit the wall, and they will come back with more room than
        they left with.
      </>
    );
  } else if (v.status === 'conference') {
    icon = '🎟️';
    text = (
      <>
        At a conference — {daysPhrase(v.statusDays)}. Expect strong opinions about a keynote and a lift in morale.
      </>
    );
  } else if (v.programName) {
    icon = '🌱';
    text = <>Running {v.programName}. That is where their hours are going.</>;
  }

  if (!text) return null;

  return (
    <div
      className="mt-2.5 flex items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-[0.74rem] leading-snug text-ink-soft"
      style={{ background: `color-mix(in oklab, ${tone} 11%, transparent)` }}
    >
      <span aria-hidden className="leading-none mt-[1px]">
        {icon}
      </span>
      <span>{text}</span>
      {away ? (
        <span className="tabular ml-auto shrink-0 text-[0.7rem] text-ink-faint">{v.statusDays}d</span>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Techniques
// ─────────────────────────────────────────────────────────────────────────────

function TechniqueList({ v }: { v: StaffView }) {
  const groups = useMemo(() => {
    const out = new Map<string, { tier: 1 | 2 | 3; name: string; blurb: string }[]>();
    for (const tid of v.techniques) {
      const tech = techniqueById[tid];
      if (!tech) continue;
      const arr = out.get(tech.modality) ?? [];
      arr.push({ tier: tech.tier, name: tech.name, blurb: tech.blurb });
      out.set(tech.modality, arr);
    }
    for (const arr of out.values()) arr.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    // Their own school first.
    return [...out.entries()].sort(([a], [b]) => (a === v.modality ? -1 : b === v.modality ? 1 : a.localeCompare(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.techKey, v.modality]);

  return (
    <Disclosure therapistId={v.id} section="techniques" summary="Cards in their hand" count={`${v.techniques.length}`}>
      {groups.length === 0 ? (
        <p className="text-[0.74rem] text-ink-faint">
          No techniques on file. Send them to a foundations course and they will come back with something to offer.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map(([modId, list]) => {
            const m = modalityById[modId];
            return (
              <div key={modId}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: m?.color ?? 'var(--color-ink-faint)' }}
                    aria-hidden
                  />
                  <span className="text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-ink-faint">
                    {m?.name ?? modId}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((tech) => (
                    <Tooltip key={tech.name} content={tech.blurb}>
                      <span className="chip">
                        {tech.name}
                        <TierBadge tier={tech.tier} />
                      </span>
                    </Tooltip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {v.certifications.length ? (
        <p className="text-[0.7rem] text-ink-faint mt-2 leading-snug">
          Certified in{' '}
          {v.certifications
            .map((cid) => trainingById[cid]?.name ?? cid)
            .join(', ')}
          .
        </p>
      ) : null}
    </Disclosure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationships & supervision
// ─────────────────────────────────────────────────────────────────────────────

function RelationshipList({ v, roster }: { v: StaffView; roster: RosterEntry[] }) {
  const dispatch = useDispatch();
  const others = roster.filter((r) => r.id !== v.id);

  return (
    <Disclosure therapistId={v.id} section="relationships" summary="In the building" count={others.length ? `${others.length}` : undefined}>
      {others.length === 0 ? (
        <p className="text-[0.74rem] text-ink-faint leading-snug">
          Nobody else on the roster yet. Hire someone and they will start having opinions about each other by Friday.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {others.map((other) => {
            const score = v.relationships[other.id];
            const known = typeof score === 'number';
            const isMentee = v.menteeIds.includes(other.id);
            const isMentor = v.mentorId === other.id;
            const canSupervise = v.level > other.level;
            const canBeSupervised = other.level > v.level;

            return (
              <div key={other.id} className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[0.76rem] font-bold text-ink truncate">{other.name}</span>
                    <span className="text-[0.66rem] text-ink-faint tabular">L{other.level}</span>
                    {isMentee ? <Chip color="var(--color-sage-deep)">Supervises them</Chip> : null}
                    {isMentor ? <Chip color="var(--color-sage-deep)">Supervised by them</Chip> : null}
                  </div>
                  {known ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Meter
                        value={(score + 100) / 200}
                        color={warmthColor(score)}
                        height={5}
                        className="flex-1"
                      />
                      <span className="text-[0.66rem] text-ink-faint w-[62px] shrink-0">{warmthReading(score)}</span>
                    </div>
                  ) : (
                    <p className="text-[0.68rem] text-ink-faint mt-0.5">They have not worked a day together yet.</p>
                  )}
                </div>

                <div className="shrink-0">
                  {isMentee || isMentor ? (
                    <Tooltip content="A supervisee picks up extra experience overnight, gets a small lift in the room, and both of them warm to each other.">
                      <span className="text-[0.68rem] text-ink-faint px-1">Paired</span>
                    </Tooltip>
                  ) : canSupervise ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dispatch({ type: 'SET_MENTORSHIP', mentorId: v.id, menteeId: other.id })}
                    >
                      Supervise
                    </Button>
                  ) : canBeSupervised ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dispatch({ type: 'SET_MENTORSHIP', mentorId: other.id, menteeId: v.id })}
                    >
                      Be supervised
                    </Button>
                  ) : (
                    <Tooltip
                      content={`Supervision needs a gap in seniority, and they are both level ${v.level}. Level one of them up first.`}
                    >
                      <span>
                        <Button size="sm" variant="ghost" disabled>
                          Supervise
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[0.68rem] text-ink-faint leading-snug">
            Supervision runs one way: the more senior clinician holds the hour. The supervisee earns extra experience
            each night and carries a little more confidence into the room.
          </p>
        </div>
      )}
    </Disclosure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────────────────────────────────────

function TrainingList({ v }: { v: StaffView }) {
  const dispatch = useDispatch();
  const cash = useSim((s) => s.cash);
  const discount = useSim((s) => (s.philosophy ? philosophyById[s.philosophy]?.trainingDiscount ?? 1 : 1));
  const philosophyName = useSim((s) => (s.philosophy ? philosophyById[s.philosophy]?.name ?? '' : ''));

  const eligibleKey = useSim((s) => {
    const t = s.therapists.find((x) => x.id === v.id);
    if (!t) return '';
    return TRAININGS.filter((tr) => !t.certifications.includes(tr.id) && meetsRequirement(s, tr.requires, t))
      .map((tr) => tr.id)
      .join('|');
  });

  const eligible = useMemo<TrainingDef[]>(() => {
    if (!eligibleKey) return [];
    const list = eligibleKey
      .split('|')
      .map((tid) => trainingById[tid])
      .filter((tr): tr is TrainingDef => !!tr);
    return list.sort((a, b) => {
      const rank = (tr: TrainingDef) => (tr.modality === v.modality ? 0 : tr.modality === v.secondary ? 1 : 2);
      return rank(a) - rank(b) || a.tier - b.tier || a.name.localeCompare(b.name);
    });
  }, [eligibleKey, v.modality, v.secondary]);

  const lockedCount = TRAININGS.length - v.certifications.length - eligible.length;
  const canSend = v.status === 'available';

  return (
    <Disclosure therapistId={v.id} section="training" summary="Send them to training" count={eligible.length ? `${eligible.length} open` : undefined}>
      <p className="text-[0.72rem] text-ink-faint leading-snug mb-2">
        The fee is only half the price. The other half is the empty Tuesday their caseload spends waiting.
        {discount < 1 && philosophyName ? (
          <>
            {' '}
            <span className="text-sage">
              {philosophyName} keeps tuition {Math.round((1 - discount) * 100)}% cheaper.
            </span>
          </>
        ) : null}
      </p>

      {!canSend ? (
        <p className="text-[0.72rem] text-brick leading-snug mb-2">
          Only an available therapist can be sent — right now they are {v.status.replace('_', ' ')}.
        </p>
      ) : null}

      {eligible.length === 0 ? (
        <p className="text-[0.74rem] text-ink-faint">
          Nothing on the calendar they qualify for. Level the practice up and the good courses open.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {eligible.map((tr) => {
            const cost = Math.round(tr.cost * discount);
            const short = cash < cost;
            const m = modalityById[tr.modality];
            const cross = tr.modality !== v.modality;
            return (
              <li key={tr.id} className="paper-flat px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                    style={{ background: m?.color ?? 'var(--color-ink-faint)' }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[0.8rem] font-bold text-ink">{tr.name}</span>
                      <TierBadge tier={tr.tier} />
                      {cross ? <span className="text-[0.64rem] text-ink-faint">cross-training</span> : null}
                    </div>
                    <p className="text-[0.72rem] text-ink-soft leading-snug mt-0.5">{tr.blurb}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {/* A course can overlap what they already do — a mid-career
                          hire arrives holding half of their own tier 2. Showing
                          the brochure's full list would promise cards the fee
                          does not actually buy. */}
                      {tr.grants.map((g) => {
                        const held = v.techniques.includes(g);
                        return (
                          <span
                            key={g}
                            className="chip"
                            style={held ? { opacity: 0.55 } : undefined}
                            title={held ? 'They already work this way — the course revisits it.' : undefined}
                          >
                            {held ? '✓ ' : '+ '}
                            {techniqueById[g]?.name ?? g}
                          </span>
                        );
                      })}
                      <span className="chip">+{tr.skill} skill</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular text-[0.82rem] text-ink">{formatMoney(cost)}</div>
                    {cost !== tr.cost ? (
                      <div className="tabular text-[0.64rem] text-ink-faint line-through">{formatMoney(tr.cost)}</div>
                    ) : null}
                    <div className="text-[0.66rem] text-ink-faint">
                      {tr.days} day{tr.days === 1 ? '' : 's'} away
                    </div>
                    <Button
                      size="sm"
                      variant={short || !canSend ? 'ghost' : 'sage'}
                      className="mt-1.5"
                      disabled={short || !canSend}
                      onClick={() => dispatch({ type: 'START_TRAINING', therapistId: v.id, trainingId: tr.id })}
                    >
                      Send
                    </Button>
                    {short ? (
                      <div className="text-[0.62rem] text-brick mt-0.5">short {formatMoney(cost - cash)}</div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lockedCount > 0 ? (
        <p className="text-[0.68rem] text-ink-faint mt-2">
          {lockedCount} more course{lockedCount === 1 ? '' : 's'} in the catalogue are locked behind practice level.
        </p>
      ) : null}
    </Disclosure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Poaching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Display-only mirror of Game.counterPoach in sim/engine.ts. The sim rolls the
 * real dice; this exists so the player is never asked to bet blind.
 */
function counterOdds(offer: number, salary: number, raise: number, morale: number): number {
  const gap = offer - (salary + raise);
  if (gap <= 0) return 1;
  return Math.max(0, Math.min(1, 0.5 + (morale - 50) / 100 - gap / 200));
}

/** Display-only mirror of the "do nothing" branch in Game.nextDay. */
function stayOddsIfIgnored(morale: number): number {
  if (morale > 62) return 1;
  return Math.max(0, Math.min(1, morale / 140));
}

function PoachBanner({ v }: { v: StaffView }) {
  const dispatch = useDispatch();
  const gap = Math.max(1, v.poachSalary - v.salary);
  const presets = useMemo(() => {
    const modest = Math.max(5, Math.round((gap * 0.4) / 5) * 5);
    return [
      { id: 'modest', label: 'A step up', raise: modest },
      { id: 'match', label: 'Match the offer', raise: gap },
      { id: 'beat', label: 'Beat it', raise: gap + 25 },
    ];
  }, [gap]);

  const ignore = stayOddsIfIgnored(v.morale);

  return (
    <div
      className="mt-3 rounded-[12px] px-3 py-2.5"
      style={{
        background: 'color-mix(in oklab, var(--color-brick) 12%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-brick) 32%, transparent)',
      }}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="leading-none mt-[2px]">
          📞
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[0.8rem] text-ink leading-snug">
            <strong className="font-bold">{v.poachRival}</strong> has offered {v.name.split(' ')[0]}{' '}
            <span className="tabular">{formatMoney(v.poachSalary)}</span>/day. They are on{' '}
            <span className="tabular">{formatMoney(v.salary)}</span> here.
          </p>
          <p className="text-[0.72rem] text-ink-soft leading-snug mt-0.5">
            <span className="tabular">{v.poachDays}</span> day{v.poachDays === 1 ? '' : 's'} to answer. Do nothing and
            it comes down to morale on the last day — at {Math.round(v.morale)} morale that is roughly{' '}
            <span className="tabular">{Math.round(ignore * 100)}%</span> in your favour.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-2.5">
        {presets.map((p) => {
          const odds = counterOdds(v.poachSalary, v.salary, p.raise, v.morale);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => dispatch({ type: 'COUNTER_POACH', therapistId: v.id, raise: p.raise })}
              className="paper-flat text-left px-2.5 py-1.5 hover:brightness-[1.03] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              <div className="text-[0.72rem] font-bold text-ink">{p.label}</div>
              <div className="tabular text-[0.7rem] text-ink-soft">
                +{formatMoney(p.raise)} → {formatMoney(v.salary + p.raise)}/day
              </div>
              <div className="text-[0.66rem]" style={{ color: odds >= 1 ? 'var(--color-sage-deep)' : 'var(--color-ink-faint)' }}>
                {odds >= 1 ? 'they will certainly stay' : `≈${Math.round(odds * 100)}% they stay`}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[0.68rem] text-ink-faint leading-snug mt-2">
        Meeting or beating the offer settles it outright. Anything under it is a judgement call weighed against their
        morale — and if they say no, the offer stays open one more day and you can try again.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HireModal
// ─────────────────────────────────────────────────────────────────────────────

/** Display-only mirror of Game.hire in sim/engine.ts. */
const NEGOTIATE_SUCCESS_CHANCE = 0.62;
const NEGOTIATE_DISCOUNT = 0.12;
const SIGN_ON_DAYS = 3;

export function HireModal() {
  const open = useUi((u) => u.hireOpen);
  const setUi = useStore((s) => s.setUi);

  const cash = useSim((s) => s.cash);
  const slots = useSim((s) => therapistSlots(s));
  const staff = useSim((s) => s.therapists.filter((t) => t.status !== 'departed').length);
  const practiceLevel = useSim((s) => s.practiceLevel);
  const candidateKey = useSim((s) => s.candidates.map((c) => c.therapist.id).join('|'));
  const ids = useMemo(() => (candidateKey ? candidateKey.split('|') : []), [candidateKey]);

  if (!open) return null;

  const full = staff >= slots;

  return (
    <Modal onClose={() => setUi({ hireOpen: false })} width={880} labelledBy="hire-modal-title">
      <div className="px-5 pt-4 pb-5">
        <SectionHeading
          sub="Everyone here was somebody's first hire once. Read the whole person, not the skill number."
          right={
            <button
              type="button"
              onClick={() => setUi({ hireOpen: false })}
              aria-label="Close hiring"
              className="w-7 h-7 grid place-items-center rounded-full text-ink-faint hover:bg-[color-mix(in_oklab,var(--color-ink)_10%,transparent)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              ✕
            </button>
          }
        >
          <span id="hire-modal-title">Who is available</span>
        </SectionHeading>

        <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
          <Chip color={full ? 'var(--color-brick)' : 'var(--color-sage-deep)'}>
            {staff} of {slots} chairs filled
          </Chip>
          <Chip>
            Cash on hand{' '}
            <span className="tabular">
              <RollingNumber value={cash} format={(n) => formatMoney(n)} />
            </span>
          </Chip>
          {full ? (
            <span className="text-[0.72rem] text-brick">
              No room at practice level {practiceLevel}. Level up before anyone else can start.
            </span>
          ) : (
            <span className="text-[0.72rem] text-ink-faint">
              Bringing someone on costs {SIGN_ON_DAYS}× their daily salary up front.
            </span>
          )}
        </div>

        <Divider />

        {ids.length === 0 ? (
          <EmptyState
            icon="📮"
            title="No applications this week"
            body="Word gets around when a practice is doing well. Cures, reputation and a Training Institute all bring people to the door."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ids.map((id) => (
              <CandidateCard key={id} id={id} cash={cash} full={full} practiceLevel={practiceLevel} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface CandidateView {
  id: string;
  name: string;
  pronouns: string;
  portrait: PortraitSeed;
  modality: ModalityId;
  stage: CareerStage;
  skill: number;
  morale: number;
  traits: string[];
  traitsKey: string;
  techniqueCount: number;
  askingSalary: number;
  expiresInDays: number;
  source: string;
  vetted: boolean;
}

function CandidateCard({
  id,
  cash,
  full,
  practiceLevel,
}: {
  id: string;
  cash: number;
  full: boolean;
  practiceLevel: number;
}) {
  const dispatch = useDispatch();

  const c = useSimShallow((s): CandidateView | null => {
    const cand = s.candidates.find((x) => x.therapist.id === id);
    if (!cand) return null;
    const t = cand.therapist;
    return {
      id: t.id,
      name: t.name,
      pronouns: t.pronouns,
      portrait: t.portrait,
      modality: t.modality,
      stage: t.stage,
      skill: t.skill,
      morale: t.morale,
      traits: t.traits,
      traitsKey: t.traits.join('|'),
      techniqueCount: t.techniques.length,
      askingSalary: cand.askingSalary,
      expiresInDays: cand.expiresInDays,
      source: cand.source,
      vetted: !!cand.vetted,
    };
  });

  if (!c) return null;

  const mod = modalityById[c.modality];
  const signOn = Math.round(c.askingSalary * SIGN_ON_DAYS);
  const negotiatedSalary = Math.round(c.askingSalary * (1 - NEGOTIATE_DISCOUNT));
  const shortBy = signOn - cash;
  const broke = cash < signOn;
  const blocked = broke || full;

  return (
    <article className="paper-flat px-3 py-3 flex flex-col relative overflow-hidden" aria-label={c.name}>
      {c.vetted ? (
        <span
          className="absolute top-2 right-[-30px] rotate-45 text-[0.58rem] font-extrabold uppercase tracking-[0.09em] px-8 py-[2px]"
          style={{ background: 'var(--color-sage)', color: '#f2f8f1' }}
        >
          Vetted
        </span>
      ) : null}

      <div className="flex items-start gap-2.5">
        <Portrait seed={c.portrait} size={48} title={c.name} />
        <div className="min-w-0 flex-1">
          <h4 className="display text-[0.95rem] text-ink leading-tight">{c.name}</h4>
          <p className="text-[0.68rem] text-ink-faint">{c.pronouns}</p>
          <p className="text-[0.72rem] text-ink-soft leading-snug mt-0.5" title={mod?.blurb}>
            <span aria-hidden>{PROP_EMOJI[c.modality]}</span> {mod?.name ?? c.modality}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        <Chip>{STAGE_LABEL[c.stage]}</Chip>
        <Tooltip
          content={`Skill feeds the largest single term in session quality. The practice ceiling at level ${practiceLevel} is ${Math.round(skillCap(practiceLevel) * 100)}%.`}
        >
          <span className="chip tabular">Skill {Math.round(c.skill)}</span>
        </Tooltip>
        <Chip>
          {c.techniqueCount} technique{c.techniqueCount === 1 ? '' : 's'}
        </Chip>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {c.traits.map((tid) => {
          const def = traitById[tid];
          if (!def) return null;
          const color = def.tone === 'boon' ? 'var(--color-sage-deep)' : 'var(--color-plum)';
          return (
            <Tooltip key={tid} content={def.blurb}>
              <button
                type="button"
                className="chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                aria-label={`${def.name}. ${def.blurb}`}
                style={{
                  background: `color-mix(in oklab, ${color} 15%, transparent)`,
                  borderColor: `color-mix(in oklab, ${color} 38%, transparent)`,
                  color: `color-mix(in oklab, ${color} 82%, #1E3A3A)`,
                }}
              >
                {def.tone === 'boon' ? '✿' : '◇'} {def.name}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <p className="text-[0.72rem] text-ink-soft leading-snug mt-2 italic">{c.source}</p>

      <div className="mt-2.5 pt-2 border-t hairline text-[0.74rem] text-ink-soft">
        <div className="flex items-baseline justify-between">
          <span>Asking</span>
          <span className="tabular text-ink">{formatMoney(c.askingSalary)}/day</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="inline-flex items-center">
            Up front
            <Why label="What is the up-front cost?">
              Hiring costs {SIGN_ON_DAYS}× their daily salary the day they start — the sign-on, the desk, the first
              week of onboarding before they bill an hour.
            </Why>
          </span>
          <span className={`tabular ${broke ? 'text-brick' : 'text-ink'}`}>{formatMoney(signOn)}</span>
        </div>
        <div className="flex items-baseline justify-between text-[0.7rem] text-ink-faint">
          <span className="inline-flex items-center">
            Starting morale
            <Why label="Why does starting morale matter?">
              {moraleReading(c.morale)}. Morale colours their quality in the room and decides whether a rival's phone
              call lands — below {POACH_MORALE_THRESHOLD} the calls start coming.
            </Why>
          </span>
          <span className="tabular">{Math.round(c.morale)}</span>
        </div>
        <div className="flex items-baseline justify-between text-[0.7rem] text-ink-faint">
          <span>Takes another job in</span>
          <span className="tabular">
            {c.expiresInDays} day{c.expiresInDays === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        <Button
          variant="primary"
          size="sm"
          disabled={blocked}
          onClick={() => dispatch({ type: 'HIRE', candidateId: c.id })}
        >
          Make an offer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={blocked}
          onClick={() => dispatch({ type: 'HIRE', candidateId: c.id, negotiate: true })}
        >
          Negotiate · {formatMoney(negotiatedSalary)}/day if it lands
        </Button>
        <p className="text-[0.66rem] text-ink-faint leading-snug">
          Negotiating works about {Math.round(NEGOTIATE_SUCCESS_CHANCE * 100)}% of the time and saves{' '}
          {Math.round(NEGOTIATE_DISCOUNT * 100)}%. Either way they start a little lower on morale — a small dent if it
          works, a larger one if it does not.
        </p>
        {blocked ? (
          <p className="text-[0.68rem] text-brick leading-snug">
            {full
              ? `No chair for them at practice level ${practiceLevel}.`
              : `Short ${formatMoney(shortBy)} of the up-front cost.`}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => dispatch({ type: 'DISMISS_CANDIDATE', candidateId: c.id })}
          className="text-[0.66rem] font-bold text-ink-faint hover:text-ink-soft transition self-start rounded px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          Pass — they'll find something else
        </button>
      </div>
    </article>
  );
}
