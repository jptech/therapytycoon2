import { useState } from 'react';
import { PROGRAMS, programById, upgradeById } from '../../content';
import { activeTherapists, meetsRequirement } from '../../sim/eventsys';
import { sessionsForTherapist } from '../../sim/scheduler';
import { modalityName } from '../../sim/session';
import type {
  EventEffect,
  EventRequirement,
  GameState,
  PortraitSeed,
  ProgramDef,
  TherapistStatus,
} from '../../sim/types';
import { formatMoney, titleize } from '../../sim/util';
import { useDispatch, useSim, useSimShallow, useStore } from '../../store';
import { Portrait } from '../Portrait';
import { Button, Chip, Divider, Meter, PanelShell, SectionHeading } from '../primitives';

/**
 * Programs — the "tall or wide" panel.
 *
 * Everything here is a proposal until you staff it. The panel is deliberately
 * written like a folder of pitches sitting on the desk: what it costs, who it
 * takes, what it gives back, and what is stopping you today.
 */

const STATUS_WORD: Record<TherapistStatus, string> = {
  available: 'on the floor',
  in_session: 'in session',
  training: 'away training',
  sabbatical: 'on sabbatical',
  conference: 'at a conference',
  program: 'running a program',
  departed: 'gone',
};

// ── Requirement explanations ────────────────────────────────────────────────
// Every line is checked by the sim's own meetsRequirement(), one key at a time,
// so the UI never re-implements the rule — it only names it.

interface ReqLine {
  label: string;
  detail: string;
  ok: boolean;
}

function requirementLines(s: GameState, req: EventRequirement | undefined): ReqLine[] {
  if (!req) return [];
  const out: ReqLine[] = [];
  const push = (label: string, detail: string, partial: EventRequirement) =>
    out.push({ label, detail, ok: meetsRequirement(s, partial) });

  if (req.minPracticeLevel !== undefined)
    push(
      `Practice at level ${req.minPracticeLevel}`,
      `you are level ${s.practiceLevel}`,
      { minPracticeLevel: req.minPracticeLevel },
    );
  if (req.minReputation !== undefined)
    push(
      `Reputation ${req.minReputation}`,
      `yours is ${Math.round(s.reputation)}`,
      { minReputation: req.minReputation },
    );
  if (req.minCommunityTrust !== undefined)
    push(
      `Community trust ${req.minCommunityTrust}`,
      `yours is ${Math.round(s.communityTrust)}`,
      { minCommunityTrust: req.minCommunityTrust },
    );
  if (req.minTherapists !== undefined)
    push(
      `${req.minTherapists} clinicians on staff`,
      `you have ${activeTherapists(s).length}`,
      { minTherapists: req.minTherapists },
    );
  if (req.minCash !== undefined)
    push(`${formatMoney(req.minCash)} in the account`, `you hold ${formatMoney(s.cash)}`, {
      minCash: req.minCash,
    });
  for (const u of req.hasUpgrade ?? [])
    push(upgradeById[u]?.name ?? titleize(u), upgradeById[u]?.blurb ?? 'Not yet installed.', {
      hasUpgrade: [u],
    });
  for (const p of req.hasProgram ?? [])
    push(`${programById[p]?.name ?? titleize(p)} running`, 'It has to be live first.', {
      hasProgram: [p],
    });
  if (req.act)
    push(
      `Act ${req.act.join(' or ')}`,
      `the practice is in act ${s.act}`,
      { act: req.act },
    );
  if (req.philosophy)
    push('A particular philosophy', 'Your practice committed elsewhere.', { philosophy: req.philosophy });
  return out;
}

// ── Payoff, in plain language ───────────────────────────────────────────────

function payoffPhrases(def: ProgramDef): string[] {
  const p = def.payoff;
  const out: string[] = [];
  if (p.weeklyCash) out.push(`about ${formatMoney(p.weeklyCash)} a week`);
  if (p.weeklyReferrals)
    out.push(`roughly ${p.weeklyReferrals} extra referral${p.weeklyReferrals === 1 ? '' : 's'} a week`);
  if (p.weeklyReputation) out.push(`+${p.weeklyReputation} reputation a week`);
  if (p.weeklyCommunityTrust) out.push(`+${p.weeklyCommunityTrust} community trust a week`);
  if (p.weeklyCandidateChance)
    out.push(
      `a ${Math.round(p.weeklyCandidateChance * 100)}% chance each week that a trained extern asks to stay`,
    );
  return out;
}

function effectChips(effect: EventEffect | undefined): string[] {
  if (!effect) return [];
  const out: string[] = [];
  if (effect.cash) out.push(formatMoney(effect.cash));
  if (effect.reputation) out.push(`+${effect.reputation} reputation`);
  if (effect.communityTrust) out.push(`+${effect.communityTrust} community trust`);
  if (effect.xp) out.push(`+${effect.xp} XP`);
  if (effect.allMorale) out.push(`+${effect.allMorale} morale, everyone`);
  return out;
}

// ── Staff picker ────────────────────────────────────────────────────────────

interface StaffRow {
  id: string;
  name: string;
  portrait: PortraitSeed;
  modality: string;
  status: TherapistStatus;
  energy: number;
  maxEnergy: number;
  morale: number;
  load: number;
  elsewhere: string;
}

function StaffPicker({
  slots,
  energyPerDay,
  selected,
  onChange,
  legend,
}: {
  slots: number;
  energyPerDay: number;
  selected: string[];
  onChange: (ids: string[]) => void;
  legend: string;
}) {
  const staff = useSimShallow<StaffRow[]>((s) =>
    activeTherapists(s).map((t) => ({
      id: t.id,
      name: t.name,
      portrait: t.portrait,
      modality: modalityName(t.modality),
      status: t.status,
      energy: Math.round(t.energy),
      maxEnergy: t.maxEnergy,
      morale: Math.round(t.morale),
      load: sessionsForTherapist(s, t.id).length,
      elsewhere: s.programs
        .filter((p) => p.active && p.therapistIds.includes(t.id))
        .map((p) => programById[p.id]?.name ?? p.id)
        .join(', '),
    })),
  );

  const full = selected.length >= slots;

  return (
    <fieldset className="mt-2 border-0 p-0 m-0">
      <legend className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint mb-1.5">
        {legend} — {selected.length} of {slots} chosen
      </legend>
      <div className="flex flex-col gap-1.5">
        {staff.map((t) => {
          const on = selected.includes(t.id);
          const blocked = !on && full;
          return (
            <label
              key={t.id}
              className={`flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 border hairline transition ${
                on ? 'bg-[color-mix(in_oklab,var(--color-amber)_16%,transparent)]' : 'bg-[color-mix(in_oklab,var(--color-ink)_3%,transparent)]'
              } ${blocked ? 'opacity-45' : 'cursor-pointer hover:brightness-[1.02]'}`}
              title={blocked ? 'Every seat is taken. Unpick someone first.' : undefined}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={blocked}
                onChange={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
                className="w-4 h-4 accent-[var(--color-amber-deep)] shrink-0"
              />
              <Portrait seed={t.portrait} size={30} mood={t.energy < 30 ? 'tired' : 'neutral'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[0.82rem] font-bold text-ink truncate">{t.name}</span>
                  <span className="text-[0.66rem] text-ink-faint truncate">{t.modality}</span>
                </div>
                <div className="text-[0.66rem] text-ink-faint">
                  {t.load === 0 ? 'nothing booked today' : `${t.load} on today's board`} · {STATUS_WORD[t.status]}
                  {t.elsewhere ? ` · also on ${t.elsewhere}` : ''}
                </div>
              </div>
              <div className="w-20 shrink-0">
                <Meter
                  value={t.energy}
                  max={t.maxEnergy}
                  height={5}
                  color={t.energy < t.maxEnergy * 0.3 ? 'var(--color-brick)' : 'var(--color-plum)'}
                />
                <div className="tabular text-[0.62rem] text-ink-faint mt-0.5 text-right">
                  {t.energy}/{t.maxEnergy} · −{energyPerDay}/day
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ── One program ─────────────────────────────────────────────────────────────

interface RunningInfo {
  startedDay: number;
  progressDays: number;
  lifetimeCash: number;
  completed: boolean;
  therapistIds: string[];
}

function ProgramCard({ def }: { def: ProgramDef }) {
  const dispatch = useDispatch();
  const day = useSim((s) => s.day);
  const cash = useSim((s) => s.cash);
  const running = useSimShallow<RunningInfo | null>((s) => {
    const p = s.programs.find((x) => x.id === def.id && x.active);
    return p
      ? {
          startedDay: p.startedDay,
          progressDays: p.progressDays,
          lifetimeCash: p.lifetimeCash,
          completed: !!p.completed,
          therapistIds: p.therapistIds,
        }
      : null;
  });
  const assigned = useSimShallow((s) => {
    const p = s.programs.find((x) => x.id === def.id && x.active);
    if (!p) return [] as { id: string; name: string; portrait: PortraitSeed; energy: number }[];
    return p.therapistIds
      .map((id) => s.therapists.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, name: t.name, portrait: t.portrait, energy: Math.round(t.energy) }));
  });
  const reqs = useSimShallow((s) => requirementLines(s, def.requires));

  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const unmet = reqs.filter((r) => !r.ok);
  const affordable = cash >= def.setupCost;
  const rightCrew = picks.length === def.staffSlots;
  const canLaunch = unmet.length === 0 && affordable && rightCrew;
  const payoff = payoffPhrases(def);
  const completionDays = def.payoff.completionDays;

  return (
    <article
      className="card-warm p-3.5"
      style={{ borderLeft: `3px solid ${running ? def.color : 'transparent'}` }}
    >
      <header className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-[12px] grid place-items-center text-[1.35rem] shrink-0"
          style={{ background: `color-mix(in oklab, ${def.color} 22%, transparent)` }}
          aria-hidden
        >
          {def.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="display text-[1.02rem] text-ink">{def.name}</h3>
            {running ? (
              <Chip color={def.color}>running</Chip>
            ) : unmet.length ? (
              <Chip color="var(--color-ink-faint)">not yet</Chip>
            ) : (
              <Chip color="var(--color-amber)">available</Chip>
            )}
          </div>
          <p className="text-[0.76rem] text-ink-soft leading-snug mt-0.5">{def.blurb}</p>
        </div>
      </header>

      {/* ── The ledger line: what it costs, in every currency ── */}
      <dl className="grid grid-cols-4 gap-2 mt-3">
        <div>
          <dt className="text-[0.6rem] font-extrabold uppercase tracking-[0.08em] text-ink-faint">To start</dt>
          <dd className="tabular text-[0.86rem] text-ink">{formatMoney(def.setupCost)}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] font-extrabold uppercase tracking-[0.08em] text-ink-faint">Upkeep</dt>
          <dd className="tabular text-[0.86rem] text-ink">{formatMoney(def.weeklyUpkeep)}/wk</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] font-extrabold uppercase tracking-[0.08em] text-ink-faint">Staff</dt>
          <dd className="tabular text-[0.86rem] text-ink">
            {def.staffSlots} seat{def.staffSlots === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt className="text-[0.6rem] font-extrabold uppercase tracking-[0.08em] text-ink-faint">Energy</dt>
          <dd className="tabular text-[0.86rem] text-ink">−{def.energyPerDay}/day each</dd>
        </div>
      </dl>

      {payoff.length ? (
        <p className="text-[0.78rem] text-ink-soft leading-relaxed mt-2.5">
          <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
            Pays back{' '}
          </span>
          {payoff.join(', ')}.
        </p>
      ) : null}

      {completionDays ? (
        <p className="text-[0.78rem] text-ink-soft leading-relaxed mt-1">
          After {completionDays} days of clean data it finishes and pays out once:{' '}
          {effectChips(def.payoff.completionReward).join(' · ')}.
        </p>
      ) : null}

      {/* ── Running ── */}
      {running ? (
        <div className="mt-3 pt-3 border-t hairline">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.74rem] text-ink-soft">
            <span>
              <span className="tabular text-ink">{day - running.startedDay}</span> days running
            </span>
            <span>
              <span className="tabular text-ink">{formatMoney(running.lifetimeCash)}</span> brought in so far
            </span>
            <span>
              costing <span className="tabular text-ink">{formatMoney(def.weeklyUpkeep)}</span> a week
            </span>
          </div>

          {completionDays ? (
            <div className="mt-2.5">
              <Meter
                value={Math.min(running.progressDays, completionDays)}
                max={completionDays}
                color={running.completed ? 'var(--color-sage-deep)' : def.color}
                label={running.completed ? 'Published' : 'Toward publication'}
                right={`${running.progressDays} / ${completionDays} days`}
              />
              {running.completed ? (
                <p className="text-[0.72rem] text-sage mt-1">
                  Done. The paper is out and the fridge has a copy of page one.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
              Assigned
            </span>
            {assigned.length ? (
              assigned.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5">
                  <Portrait seed={t.portrait} size={22} title={t.name} />
                  <span className="text-[0.74rem] text-ink">{t.name}</span>
                  <span className="tabular text-[0.66rem] text-ink-faint">{t.energy}⚡</span>
                </span>
              ))
            ) : (
              <span className="text-[0.74rem] text-brick">nobody — it is running on goodwill</span>
            )}
            <Button size="sm" onClick={() => {
              setEditing((v) => !v);
              setPicks(running.therapistIds);
            }}>
              {editing ? 'Never mind' : 'Change staff'}
            </Button>
          </div>

          {editing ? (
            <div className="mt-1">
              <StaffPicker
                slots={def.staffSlots}
                energyPerDay={def.energyPerDay}
                selected={picks}
                onChange={setPicks}
                legend="Who carries it"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={picks.length !== def.staffSlots}
                  onClick={() => {
                    dispatch({ type: 'STAFF_PROGRAM', programId: def.id, therapistIds: picks });
                    setEditing(false);
                  }}
                >
                  Save the rota
                </Button>
                {picks.length !== def.staffSlots ? (
                  <span className="text-[0.72rem] text-ink-faint self-center">
                    Pick exactly {def.staffSlots}.
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            {confirmClose ? (
              <div className="paper-flat p-2.5">
                <p className="text-[0.78rem] text-ink leading-snug">
                  Wind down {def.name}? The people in it will be told, the setup cost does not come back, and
                  restarting means paying {formatMoney(def.setupCost)} again.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="brick"
                    size="sm"
                    onClick={() => {
                      dispatch({ type: 'CLOSE_PROGRAM', programId: def.id });
                      setConfirmClose(false);
                      setEditing(false);
                    }}
                  >
                    Yes, wind it down
                  </Button>
                  <Button size="sm" onClick={() => setConfirmClose(false)}>
                    Keep it going
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" onClick={() => setConfirmClose(true)}>
                Close this program
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* ── Proposal ── */
        <div className="mt-3 pt-3 border-t hairline">
          {unmet.length ? (
            <div>
              <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint mb-1">
                Before you can
              </div>
              <ul className="flex flex-col gap-1">
                {reqs.map((r) => (
                  <li key={r.label} className="flex items-baseline gap-2 text-[0.76rem]">
                    <span aria-hidden className={r.ok ? 'text-sage' : 'text-brick'}>
                      {r.ok ? '✓' : '○'}
                    </span>
                    <span className={r.ok ? 'text-ink-faint line-through decoration-1' : 'text-ink'}>
                      {r.label}
                    </span>
                    <span className="text-ink-faint">— {r.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-2.5 flex items-center gap-2">
            <Button
              size="sm"
              variant={open ? 'ghost' : 'primary'}
              disabled={unmet.length > 0}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Put the folder down' : 'Read the proposal'}
            </Button>
            {unmet.length ? (
              <span className="text-[0.72rem] text-ink-faint">
                {unmet.length} thing{unmet.length === 1 ? '' : 's'} in the way.
              </span>
            ) : null}
          </div>

          {open ? (
            <div className="mt-2.5 fade-in">
              <p
                className="text-[0.82rem] leading-[1.65] text-ink-soft pl-3"
                style={{ borderLeft: `2px solid color-mix(in oklab, ${def.color} 45%, transparent)` }}
              >
                {def.detail}
              </p>

              <StaffPicker
                slots={def.staffSlots}
                energyPerDay={def.energyPerDay}
                selected={picks}
                onChange={setPicks}
                legend="Who runs it"
              />

              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <Button
                  variant="primary"
                  disabled={!canLaunch}
                  onClick={() => {
                    dispatch({ type: 'LAUNCH_PROGRAM', programId: def.id, therapistIds: picks });
                    setOpen(false);
                    setPicks([]);
                  }}
                >
                  Launch for {formatMoney(def.setupCost)}
                </Button>
                <span className="text-[0.72rem] text-ink-faint">
                  {!affordable
                    ? `You hold ${formatMoney(cash)}. It needs ${formatMoney(def.setupCost)}.`
                    : !rightCrew
                      ? `Choose exactly ${def.staffSlots} clinician${def.staffSlots === 1 ? '' : 's'}.`
                      : `Leaves you ${formatMoney(cash - def.setupCost)}.`}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function ProgramsPanel() {
  const openPanel = useStore((st) => st.openPanel);
  const runningIds = useSimShallow((s) => s.programs.filter((p) => p.active).map((p) => p.id));
  const weeklyUpkeep = useSim((s) =>
    s.programs
      .filter((p) => p.active)
      .reduce((a, p) => a + (programById[p.id]?.weeklyUpkeep ?? 0), 0),
  );
  const seatsUsed = useSim((s) =>
    s.programs.filter((p) => p.active).reduce((a, p) => a + p.therapistIds.length, 0),
  );
  const staffCount = useSim((s) => activeTherapists(s).length);

  const running = runningIds.length;

  return (
    <PanelShell
      title="Programs"
      icon="🪧"
      wide
      subtitle="What the practice does when it is not doing therapy."
      onClose={() => openPanel(null)}
      footer={
        <div className="flex items-center justify-between gap-3 text-[0.72rem] text-ink-faint">
          <span>
            {running === 0
              ? 'Nothing running. Every hour belongs to the room.'
              : `${running} running · ${formatMoney(weeklyUpkeep)} a week · ${seatsUsed} of ${staffCount} clinicians spoken for`}
          </span>
          <span className="tabular">{PROGRAMS.length - running} on the shelf</span>
        </div>
      }
    >
      <div
        className="paper-flat px-3.5 py-3 mb-3.5"
        style={{ background: 'color-mix(in oklab, var(--color-amber) 9%, var(--color-paper))' }}
      >
        <SectionHeading sub="A practice grows tall or it grows wide, and almost never both at once.">
          Tall or wide
        </SectionHeading>
        <p className="text-[0.78rem] text-ink-soft leading-relaxed">
          {running === 0
            ? 'You are running none of the six. That is a real answer: a small practice that does one thing beautifully beats a busy one that does six things adequately.'
            : `You are running ${running} of ${PROGRAMS.length}. Each takes ${
                seatsUsed === 1 ? 'a clinician' : 'clinicians'
              } off the board and energy out of them every single day — before a client has been seen. Add the next one only if you can name who loses time for it.`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {PROGRAMS.map((def) => (
          <ProgramCard key={def.id} def={def} />
        ))}
      </div>

      <Divider label="a note" />
      <p className="text-[0.74rem] text-ink-faint leading-relaxed">
        Programs pay out weekly, on the seventh day. Setup costs are spent the moment you launch and do not
        come back if you wind one down.
      </p>
    </PanelShell>
  );
}
