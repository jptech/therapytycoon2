import { useEffect, useState, type ReactNode } from 'react';
import { upgradeById } from '../../content';
import { CONDITION_LABELS, FOCUSES, SLOTS_PER_DAY } from '../../sim/balance';
import { activeTherapists } from '../../sim/eventsys';
import { DEFAULT_POLICIES, computeExceptions } from '../../sim/scheduler';
import type { ConditionId, Policy, PolicyKind, SessionFocus } from '../../sim/types';
import { useDispatch, useSim, useSimShallow, useStore } from '../../store';
import { Button, Chip, Divider, EmptyState, PanelShell, SectionHeading } from '../primitives';

/**
 * Policies — the Act-3 auto-scheduler, written as sentences.
 *
 * Every rule reads as something you would actually say out loud to a practice
 * manager, with the number sitting inside the sentence where you can change it.
 * Nothing here computes anything: the sim owns the scheduler, this panel owns
 * the wording.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The one sanctioned direct write to sim state in the whole UI.
//
// `flags.autoSchedule` and `flags.autoTechnique` are plain booleans on
// GameState.flags and there is no GameAction that sets them — the engine only
// ever writes them itself when up_auto_scheduler is bought. So we set the flag
// on the live state object and then dispatch a no-op ADVANCE_TUTORIAL with the
// *current* step purely to bump the store revision so selectors re-run.
// If a dedicated action is ever added, delete this and dispatch that instead.
// ─────────────────────────────────────────────────────────────────────────────
function setAutomationFlag(key: 'autoSchedule' | 'autoTechnique', value: boolean): void {
  const st = useStore.getState();
  st.game.state.flags[key] = value;
  st.dispatch({ type: 'ADVANCE_TUTORIAL', step: st.game.state.tutorialStep });
}

const KIND_ORDER: PolicyKind[] = [
  'max_sessions_per_therapist',
  'min_energy_reserve',
  'prioritize_at_risk',
  'prioritize_severity',
  'match_specialization',
  'balance_workload',
  'protect_low_stability',
  'default_focus',
  'reserve_slot_for_supervision',
  'route_condition_to_therapist',
];

const KIND_TITLE: Record<PolicyKind, string> = {
  max_sessions_per_therapist: 'A ceiling on the day',
  min_energy_reserve: 'An energy floor',
  prioritize_at_risk: 'Whoever is drifting, first',
  prioritize_severity: 'Severity in the queue',
  match_specialization: 'Right clinician, right client',
  balance_workload: 'An even day',
  protect_low_stability: 'Do no harm',
  default_focus: 'The house default',
  reserve_slot_for_supervision: 'Friday supervision',
  route_condition_to_therapist: 'A standing referral',
};

// ── Inline controls ─────────────────────────────────────────────────────────

function NumberInline({
  value,
  min,
  max,
  step,
  ariaLabel,
  onCommit,
  width = '3.6rem',
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  onCommit: (v: number) => void;
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)));
      }}
      onBlur={() => setText(String(value))}
      className="tabular text-[0.82rem] font-bold text-ink text-center align-baseline mx-0.5 px-1 py-0.5 rounded-md focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]"
      style={{
        width,
        background: 'color-mix(in oklab, var(--color-amber) 18%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-amber-deep) 40%, transparent)',
      }}
    />
  );
}

function SelectInline<T extends string>({
  value,
  options,
  ariaLabel,
  onCommit,
}: {
  value: T;
  options: { value: T; label: string }[];
  ariaLabel: string;
  onCommit: (v: T) => void;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onCommit(e.target.value as T)}
      className="text-[0.8rem] font-bold text-ink mx-0.5 px-1.5 py-0.5 rounded-md focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-amber)]"
      style={{
        background: 'color-mix(in oklab, var(--color-amber) 18%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-amber-deep) 40%, transparent)',
        maxWidth: '13rem',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="shrink-0 relative w-10 h-[22px] rounded-full transition"
      style={{
        background: on
          ? 'linear-gradient(180deg, var(--color-sage) 0%, var(--color-sage-deep) 100%)'
          : 'color-mix(in oklab, var(--color-ink) 14%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-ink) 16%, transparent)',
      }}
    >
      <span
        className="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-paper transition-[left]"
        style={{ left: on ? 21 : 3, boxShadow: '0 1px 3px rgba(30,58,58,0.35)' }}
      />
    </button>
  );
}

// ── One rule, as a sentence ─────────────────────────────────────────────────

interface TherapistOption {
  id: string;
  name: string;
}

function PolicySentence({
  policy,
  therapists,
  onEdit,
}: {
  policy: Policy;
  therapists: TherapistOption[];
  onEdit: (next: Policy) => void;
}) {
  const num = (min: number, max: number, step: number, ariaLabel: string, scale = 1) => (
    <NumberInline
      value={Math.round(policy.value * scale * 100) / 100}
      min={min}
      max={max}
      step={step}
      ariaLabel={ariaLabel}
      onCommit={(v) => onEdit({ ...policy, value: v / scale })}
    />
  );

  switch (policy.kind) {
    case 'max_sessions_per_therapist':
      return (
        <>
          Cap each therapist at {num(1, SLOTS_PER_DAY, 1, 'Maximum sessions per therapist per day')} sessions a
          day.
        </>
      );
    case 'min_energy_reserve':
      return <>Never book anyone below {num(0, 90, 5, 'Minimum energy reserve, percent')}% energy.</>;
    case 'prioritize_severity':
      return (
        <>
          Push the most severe cases up the queue, weighted{' '}
          {num(0, 2, 0.1, 'Severity priority weight')} against everything else.
        </>
      );
    case 'prioritize_at_risk':
      return <>Whoever is closest to drifting away gets booked first.</>;
    case 'match_specialization':
      return <>Match each client to the clinician whose training actually fits them.</>;
    case 'balance_workload':
      return <>Spread the day across the team instead of loading one person up.</>;
    case 'protect_low_stability':
      return (
        <>
          Below {num(0, 100, 5, 'Stability floor for Process sessions, percent', 100)}% stability, stabilize
          instead of processing — whatever the arc says.
        </>
      );
    case 'default_focus':
      return (
        <>
          When nothing else applies, default to{' '}
          <SelectInline<SessionFocus>
            value={policy.targetFocus ?? 'build_skills'}
            ariaLabel="Default session focus"
            options={Object.values(FOCUSES).map((f) => ({ value: f.id, label: `${f.icon} ${f.name}` }))}
            onCommit={(v) => onEdit({ ...policy, targetFocus: v })}
          />
          .
        </>
      );
    case 'reserve_slot_for_supervision':
      return (
        <>
          Hold the last {num(1, 4, 1, 'Slots reserved for supervision on Friday')} slots on Friday for
          supervision.
        </>
      );
    case 'route_condition_to_therapist':
      return (
        <>
          Route{' '}
          <SelectInline<ConditionId>
            value={policy.targetCondition ?? 'anxiety'}
            ariaLabel="Condition to route"
            options={(Object.keys(CONDITION_LABELS) as ConditionId[]).map((c) => ({
              value: c,
              label: CONDITION_LABELS[c],
            }))}
            onCommit={(v) =>
              onEdit({
                ...policy,
                targetCondition: v,
                label: `Route ${CONDITION_LABELS[v]} clients to one clinician`,
              })
            }
          />{' '}
          clients to{' '}
          <SelectInline<string>
            value={policy.targetTherapistId ?? (therapists[0]?.id ?? '')}
            ariaLabel="Therapist to route to"
            options={therapists.map((t) => ({ value: t.id, label: t.name }))}
            onCommit={(v) => onEdit({ ...policy, targetTherapistId: v })}
          />
          .
        </>
      );
  }
}

function PolicyRow({ id, therapists }: { id: string; therapists: TherapistOption[] }) {
  const dispatch = useDispatch();
  const policy = useSimShallow<Policy | undefined>((s) => s.policies.find((p) => p.id === id));
  if (!policy) return null;

  const edit = (next: Policy) => dispatch({ type: 'SET_POLICY', policy: next });

  return (
    <li
      className={`card-warm px-3 py-2.5 flex items-start gap-3 transition ${
        policy.enabled ? '' : 'opacity-55'
      }`}
    >
      <Switch
        on={policy.enabled}
        label={`${policy.enabled ? 'Disable' : 'Enable'} rule: ${KIND_TITLE[policy.kind]}`}
        onChange={(v) =>
          edit({
            ...policy,
            enabled: v,
            // Switching on a rule whose number is still zero would do nothing at
            // all, which is exactly the kind of silent no-op this game refuses.
            value:
              v && policy.kind === 'reserve_slot_for_supervision' && policy.value < 1 ? 1 : policy.value,
          })
        }
      />
      <div className="flex-1 min-w-0">
        <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
          {KIND_TITLE[policy.kind]}
        </div>
        <p className="text-[0.86rem] leading-[1.9] text-ink">
          <PolicySentence policy={policy} therapists={therapists} onEdit={edit} />
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove rule: ${KIND_TITLE[policy.kind]}`}
        title="Remove this rule"
        onClick={() => dispatch({ type: 'REMOVE_POLICY', policyId: policy.id })}
        className="shrink-0 w-6 h-6 grid place-items-center rounded-full text-ink-faint hover:bg-[color-mix(in_oklab,var(--color-brick)_16%,transparent)] transition"
      >
        ✕
      </button>
    </li>
  );
}

// ── Adding rules ────────────────────────────────────────────────────────────

function freshId(existing: string[], base: string): string {
  let id = `pol_${base}`;
  let n = 2;
  while (existing.includes(id)) id = `pol_${base}_${n++}`;
  return id;
}

function makePolicy(
  kind: PolicyKind,
  existingIds: string[],
  routedConditions: ConditionId[],
  firstTherapist?: string,
): Policy {
  if (kind === 'route_condition_to_therapist') {
    const condition =
      (Object.keys(CONDITION_LABELS) as ConditionId[]).find((c) => !routedConditions.includes(c)) ?? 'anxiety';
    return {
      id: freshId(existingIds, `route_${condition}`),
      label: `Route ${CONDITION_LABELS[condition]} clients to one clinician`,
      kind,
      value: 1,
      enabled: true,
      targetCondition: condition,
      targetTherapistId: firstTherapist,
    };
  }
  // Start from the sim's own defaults so a re-added rule comes back the way the
  // designers tuned it, never with a number invented by the UI.
  const template = DEFAULT_POLICIES.find((p) => p.kind === kind);
  const base = template ?? { label: KIND_TITLE[kind], kind, value: 1 };
  return {
    ...base,
    id: freshId(existingIds, kind),
    kind,
    enabled: true,
    value: kind === 'reserve_slot_for_supervision' && base.value < 1 ? 1 : base.value,
  };
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function PoliciesPanel() {
  const openPanel = useStore((st) => st.openPanel);
  const dispatch = useDispatch();
  const owned = useSim((s) => s.upgrades.includes('up_auto_scheduler'));
  const autoSchedule = useSim((s) => !!s.flags.autoSchedule);
  const autoTechnique = useSim((s) => !!s.flags.autoTechnique);
  const policyIds = useSimShallow((s) => s.policies.map((p) => p.id));
  const enabledCount = useSim((s) => s.policies.filter((p) => p.enabled).length);
  const presentKinds = useSimShallow((s) => s.policies.map((p) => p.kind));
  const routedConditions = useSimShallow((s) =>
    s.policies
      .filter((p) => p.kind === 'route_condition_to_therapist' && p.targetCondition)
      .map((p) => p.targetCondition as ConditionId),
  );
  const therapists = useSimShallow<TherapistOption[]>((s) =>
    activeTherapists(s).map((t) => ({ id: t.id, name: t.name })),
  );
  const exceptions = useSimShallow((s) =>
    computeExceptions(s).map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      detail: e.detail,
      severity: e.severity,
    })),
  );
  const [adding, setAdding] = useState(false);

  const close = () => openPanel(null);

  if (!owned) {
    const def = upgradeById.up_auto_scheduler;
    return (
      <PanelShell
        title="Policies"
        icon="⚙️"
        subtitle="The rules that would run the place while you look elsewhere."
        onClose={close}
      >
        <EmptyState
          icon="🗝️"
          title="No rulebook yet"
          body="Right now every hour on the board is one you placed there yourself. That is the right way to learn a practice — and the wrong way to run six clinicians."
        />
        <div className="card-warm p-3.5">
          <SectionHeading sub={def ? `${def.category} · $${def.cost.toLocaleString('en-US')}` : undefined}>
            {def?.name ?? 'Policy Auto-Scheduler'}
          </SectionHeading>
          <p className="text-[0.8rem] text-ink-soft leading-relaxed">
            {def?.blurb ??
              'You write the rules — energy floors, who sees whom — and the week assembles itself overnight.'}
          </p>
          <ul className="mt-2.5 flex flex-col gap-1 text-[0.78rem] text-ink-soft">
            <li>· Sentences you edit, not a settings screen: “cap each therapist at six sessions a day”.</li>
            <li>· The board fills itself overnight, honouring every rule you left switched on.</li>
            <li>· What the rules cannot decide gets handed back to you as a short list, every morning.</li>
          </ul>
          <div className="mt-3">
            <Button variant="primary" onClick={() => openPanel('upgrades')}>
              Find it in Upgrades
            </Button>
          </div>
        </div>
      </PanelShell>
    );
  }

  const bySeverity = [...exceptions].sort((a, b) => b.severity - a.severity);
  const shown = bySeverity.slice(0, 5);
  const addable = KIND_ORDER.filter(
    (k) =>
      k === 'route_condition_to_therapist'
        ? routedConditions.length < Object.keys(CONDITION_LABELS).length
        : !presentKinds.includes(k),
  );

  return (
    <PanelShell
      title="Policies"
      icon="⚙️"
      subtitle="Say it once, and the building keeps saying it after you have gone home."
      onClose={close}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.72rem] text-ink-faint">
            {enabledCount} of {policyIds.length} rules switched on
          </span>
          <Button size="sm" onClick={() => dispatch({ type: 'RUN_AUTOSCHEDULER' })}>
            Run the rules on today’s board
          </Button>
        </div>
      }
    >
      {/* ── Master switches ── */}
      <div className="card-warm p-3 mb-3.5">
        <div className="flex items-start gap-3">
          <Switch
            on={autoSchedule}
            label="Fill tomorrow's board automatically"
            onChange={(v) => setAutomationFlag('autoSchedule', v)}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[0.86rem] font-bold text-ink">Fill the board overnight</div>
            <p className="text-[0.74rem] text-ink-faint leading-snug">
              {autoSchedule
                ? 'Tomorrow arrives already booked, by your rules. You can still move anything.'
                : 'You are booking every hour by hand. Slower, and you will notice more.'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 mt-2.5 pt-2.5 border-t hairline">
          <Switch
            on={autoTechnique}
            label="Let clinicians choose their own technique"
            onChange={(v) => setAutomationFlag('autoTechnique', v)}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[0.86rem] font-bold text-ink">Let them choose in the room</div>
            <p className="text-[0.74rem] text-ink-faint leading-snug">
              {autoTechnique
                ? 'Nobody interrupts you mid-session; your clinicians pick the strongest safe technique themselves.'
                : 'Every session still stops and asks you which way to go.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── The rules ── */}
      <SectionHeading sub="Change any number by clicking it. Switch off anything you would rather decide yourself.">
        The rulebook
      </SectionHeading>
      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {policyIds.map((id) => (
          <PolicyRow key={id} id={id} therapists={therapists} />
        ))}
      </ul>

      <div className="mt-2.5">
        {adding ? (
          <div className="paper-flat p-2.5 fade-in">
            <div className="text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint mb-1.5">
              What else should the building know?
            </div>
            {addable.length ? (
              <div className="flex flex-wrap gap-1.5">
                {addable.map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    onClick={() => {
                      dispatch({
                        type: 'SET_POLICY',
                        policy: makePolicy(k, policyIds, routedConditions, therapists[0]?.id),
                      });
                      setAdding(false);
                    }}
                  >
                    {KIND_TITLE[k]}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-[0.78rem] text-ink-faint">
                Every rule the scheduler understands is already written down. That is a tidy rulebook.
              </p>
            )}
            <div className="mt-2">
              <Button size="sm" onClick={() => setAdding(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setAdding(true)} disabled={addable.length === 0}>
            + Add a rule
          </Button>
        )}
      </div>

      <Divider label="what would be left for you" />

      {/* ── Live preview ── */}
      <div className="card-warm p-3">
        <p className="text-[0.8rem] text-ink-soft leading-relaxed">
          {exceptions.length === 0 ? (
            <>
              With these rules on, the scheduler would fill the board and leave you{' '}
              <span className="text-sage font-bold">nothing at all</span>. Everyone is booked, nobody is
              fraying, the account is fine. Enjoy the quiet — it does not last.
            </>
          ) : (
            <>
              With these rules on, the scheduler handles the booking and hands you back{' '}
              <span className="tabular text-ink font-bold">{exceptions.length}</span>{' '}
              {exceptions.length === 1 ? 'thing' : 'things'} it will not decide for you:
            </>
          )}
        </p>
        {exceptions.length ? (
          <ul className="mt-2 flex flex-col gap-1.5 list-none p-0 m-0">
            {shown.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{
                    background:
                      e.severity === 3
                        ? 'var(--color-brick)'
                        : e.severity === 2
                          ? 'var(--color-amber-deep)'
                          : 'var(--color-ink-faint)',
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[0.8rem] text-ink leading-snug">{e.label}</div>
                  <div className="text-[0.72rem] text-ink-faint leading-snug">{e.detail}</div>
                </div>
              </li>
            ))}
            {bySeverity.length > shown.length ? (
              <li className="text-[0.74rem] text-ink-faint pl-4">
                …and {bySeverity.length - shown.length} more, quieter than these.
              </li>
            ) : null}
          </ul>
        ) : null}
        {exceptions.length ? (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <Chip color="var(--color-brick)">
              {exceptions.filter((e) => e.severity === 3).length} urgent
            </Chip>
            <Chip color="var(--color-amber)">
              {exceptions.filter((e) => e.severity === 2).length} worth a look
            </Chip>
          </div>
        ) : null}
      </div>

      <p className="text-[0.72rem] text-ink-faint leading-relaxed mt-3">
        A rule that is switched off still keeps its number, so you can put it back exactly as it was. The
        scheduler only ever books; it never cancels an hour you placed by hand.
      </p>
    </PanelShell>
  );
}
