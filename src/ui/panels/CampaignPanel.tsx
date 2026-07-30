import type { ReactNode } from 'react';
import { CAMPAIGN_STAGES, MILESTONES } from '../../content';
import { snapshotForMilestones } from '../../sim/engine';
import type { CampaignStageDef, EventEffect, MilestoneDef, SnapshotForMilestones } from '../../sim/types';
import { formatMoney } from '../../sim/util';
import { useSim, useSimShallow, useStore } from '../../store';
import { Chip, Divider, Meter, PanelShell, ProgressRing, SectionHeading } from '../primitives';

/**
 * The Center of Excellence campaign, drawn as a route you walk rather than a
 * checklist you tick: sealed stages behind you, the current stage open on the
 * desk with every requirement measured, and the rest of the road readable
 * ahead of you so nothing is ever a surprise.
 */

const TIER_TITLE: Record<1 | 2 | 3, string> = {
  1: 'First things',
  2: 'Finding its feet',
  3: 'The long haul',
};

const TIER_SUB: Record<1 | 2 | 3, string> = {
  1: 'The fortnight of firsts.',
  2: 'A practice that has stopped improvising.',
  3: 'Years, not weeks.',
};

function fmt(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function rewardPhrases(effect: EventEffect | undefined): string[] {
  if (!effect) return [];
  const out: string[] = [];
  if (effect.cash) out.push(formatMoney(effect.cash));
  if (effect.reputation) out.push(`+${effect.reputation} reputation`);
  if (effect.communityTrust) out.push(`+${effect.communityTrust} community trust`);
  if (effect.xp) out.push(`+${effect.xp} XP`);
  if (effect.allMorale) out.push(`+${effect.allMorale} morale for everyone`);
  return out;
}

function stageProgress(stage: CampaignStageDef, snap: SnapshotForMilestones): number {
  if (!stage.requirements.length) return 1;
  let total = 0;
  for (const r of stage.requirements) {
    const { value, target } = r.measure(snap);
    total += target > 0 ? Math.min(1, value / target) : 1;
  }
  return total / stage.requirements.length;
}

// ── Stages ──────────────────────────────────────────────────────────────────

function Seal({ children, tone }: { children: ReactNode; tone: 'sealed' | 'now' | 'later' }) {
  const bg =
    tone === 'sealed'
      ? 'radial-gradient(70% 70% at 35% 28%, var(--color-amber-glow) 0%, var(--color-amber) 45%, var(--color-amber-deep) 100%)'
      : tone === 'now'
        ? 'var(--color-paper)'
        : 'color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))';
  return (
    <div
      className="relative z-10 w-9 h-9 rounded-full grid place-items-center shrink-0"
      style={{
        background: bg,
        border:
          tone === 'later'
            ? '1px dashed color-mix(in oklab, var(--color-ink) 26%, transparent)'
            : '1px solid color-mix(in oklab, var(--color-ink) 20%, transparent)',
        boxShadow: tone === 'sealed' ? '0 3px 10px -4px rgba(201,135,58,0.9)' : 'none',
      }}
    >
      {children}
    </div>
  );
}

function StageRow({
  stage,
  index,
  state,
  snap,
}: {
  stage: CampaignStageDef;
  index: number;
  state: 'sealed' | 'now' | 'later';
  snap: SnapshotForMilestones;
}) {
  const met =
    state === 'now'
      ? stage.requirements.filter((r) => {
          const { value, target } = r.measure(snap);
          return value >= target;
        }).length
      : 0;
  const progress = state === 'now' ? stageProgress(stage, snap) : 0;
  const rewards = rewardPhrases(stage.reward);

  return (
    <li className="flex gap-3 pb-4 last:pb-0">
      <Seal tone={state}>
        {state === 'sealed' ? (
          <span aria-hidden className="text-[0.9rem] text-[#3a2405]">
            ✦
          </span>
        ) : state === 'now' ? (
          <ProgressRing value={progress} size={34} stroke={3}>
            <span className="tabular text-[0.58rem] text-ink-soft">{Math.round(progress * 100)}</span>
          </ProgressRing>
        ) : (
          <span aria-hidden className="tabular text-[0.7rem] text-ink-faint">
            {index + 1}
          </span>
        )}
      </Seal>

      <div className={`flex-1 min-w-0 ${state === 'later' ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`display text-[1rem] ${state === 'now' ? 'text-ink' : 'text-ink-soft'}`}>
            {stage.name}
          </h3>
          {state === 'sealed' ? (
            <Chip color="var(--color-amber)">sealed</Chip>
          ) : state === 'now' ? (
            <Chip color="var(--color-sage)">
              {met} of {stage.requirements.length} met
            </Chip>
          ) : (
            <Chip>ahead of you</Chip>
          )}
        </div>

        <p
          className={`text-[0.78rem] leading-relaxed mt-1 ${
            state === 'now' ? 'text-ink-soft' : 'text-ink-faint'
          }`}
        >
          {stage.blurb}
        </p>

        {state === 'now' ? (
          <div className="card-warm p-3 mt-2.5 flex flex-col gap-2.5">
            {stage.requirements.map((r) => {
              const { value, target } = r.measure(snap);
              const done = value >= target;
              return (
                <Meter
                  key={r.id}
                  value={Math.min(value, target)}
                  max={target}
                  color={done ? 'var(--color-sage-deep)' : 'var(--color-amber)'}
                  label={
                    <span className={done ? 'text-sage' : undefined}>
                      {done ? '✓ ' : ''}
                      {r.label}
                    </span>
                  }
                  right={`${fmt(value)} / ${fmt(target)}`}
                />
              );
            })}
            {rewards.length ? (
              <div className="pt-2 border-t hairline">
                <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint mb-1">
                  When it carries
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rewards.map((r) => (
                    <Chip key={r} color="var(--color-amber)">
                      {r}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : state === 'later' ? (
          <ul className="mt-1.5 flex flex-col gap-0.5 list-none p-0 m-0">
            {stage.requirements.map((r) => (
              <li key={r.id} className="text-[0.72rem] text-ink-faint">
                · {r.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

// ── Milestones ──────────────────────────────────────────────────────────────

function MilestoneCard({ def, earned }: { def: MilestoneDef; earned: boolean }) {
  if (!earned) {
    return (
      <li className="paper-flat px-2.5 py-2 flex items-center gap-2.5 opacity-45">
        <span
          aria-hidden
          className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[0.95rem] grayscale"
          style={{
            background: 'color-mix(in oklab, var(--color-ink) 9%, transparent)',
            filter: 'grayscale(1) opacity(0.35)',
          }}
        >
          {def.icon}
        </span>
        <div className="min-w-0">
          <div className="text-[0.8rem] font-bold text-ink-faint truncate">{def.name}</div>
          <div className="text-[0.66rem] text-ink-faint">Not yet · tier {def.tier}</div>
        </div>
      </li>
    );
  }
  return (
    <li className="card-warm px-2.5 py-2 flex items-start gap-2.5">
      <span
        aria-hidden
        className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[1.05rem]"
        style={{ background: 'color-mix(in oklab, var(--color-amber) 22%, transparent)' }}
      >
        {def.icon}
      </span>
      <div className="min-w-0">
        <div className="text-[0.82rem] font-bold text-ink">{def.name}</div>
        <div className="text-[0.7rem] text-ink-soft leading-snug">{def.blurb}</div>
      </div>
    </li>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function CampaignPanel() {
  const openPanel = useStore((st) => st.openPanel);
  const snap = useSimShallow<SnapshotForMilestones>((s) => snapshotForMilestones(s));
  const stageIndex = useSim((s) => s.campaign.stageIndex);
  const accredited = useSim((s) => s.campaign.accredited);
  const earned = useSimShallow((s) => [...s.milestonesEarned]);
  const practiceName = useSim((s) => s.practiceName);

  const current = CAMPAIGN_STAGES[stageIndex];
  const tiers: (1 | 2 | 3)[] = [1, 2, 3];

  return (
    <PanelShell
      title="Center of Excellence"
      icon="🏛️"
      subtitle={
        accredited
          ? 'Designated. The plate is by the door, at the height a child can read.'
          : current
            ? `Stage ${stageIndex + 1} of ${CAMPAIGN_STAGES.length} — ${current.name}`
            : 'Every stage answered. The commission is deliberating.'
      }
      onClose={() => openPanel(null)}
      footer={
        <div className="flex items-center justify-between gap-3 text-[0.72rem] text-ink-faint">
          <span>
            {stageIndex} of {CAMPAIGN_STAGES.length} stages sealed
          </span>
          <span className="tabular">
            {earned.length} / {MILESTONES.length} milestones
          </span>
        </div>
      }
    >
      {accredited ? (
        <div
          className="paper-flat p-3.5 mb-3.5 text-center"
          style={{ background: 'color-mix(in oklab, var(--color-amber) 16%, var(--color-paper))' }}
        >
          <div className="text-2xl" aria-hidden>
            ✦
          </div>
          <h3 className="display text-[1.1rem] text-ink mt-1">{practiceName} is a Center of Excellence</h3>
          <p className="text-[0.78rem] text-ink-soft leading-relaxed mt-1">
            The commission voted without you in the room, as they always do, and it carried.
          </p>
        </div>
      ) : (
        <p className="text-[0.78rem] text-ink-soft leading-relaxed mb-3.5">
          The regional board keeps a register, and getting onto it takes five stages and several years of
          telling the truth about yourselves in writing. Nothing here is hidden: every number below is
          measured off the practice as it stands tonight.
        </p>
      )}

      <div className="relative">
        {/* the road */}
        <div
          aria-hidden
          className="absolute left-[17px] top-3 bottom-6 w-px"
          style={{ background: 'color-mix(in oklab, var(--color-ink) 16%, transparent)' }}
        />
        <ol className="relative list-none p-0 m-0">
          {CAMPAIGN_STAGES.map((stage, i) => (
            <StageRow
              key={stage.id}
              stage={stage}
              index={i}
              state={i < stageIndex ? 'sealed' : i === stageIndex ? 'now' : 'later'}
              snap={snap}
            />
          ))}
        </ol>
      </div>

      <Divider label="the scrapbook" />

      <SectionHeading
        sub="Not an economy — a fridge door. Nobody should ever reroute a run to collect one."
        right={
          <span className="tabular text-[0.74rem] text-ink-faint">
            {earned.length}/{MILESTONES.length}
          </span>
        }
      >
        Milestones
      </SectionHeading>

      {tiers.map((tier) => {
        const list = MILESTONES.filter((m) => m.tier === tier);
        if (!list.length) return null;
        const got = list.filter((m) => earned.includes(m.id)).length;
        return (
          <section key={tier} className="mb-3.5">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <h4 className="text-[0.63rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint">
                {TIER_TITLE[tier]} · {TIER_SUB[tier]}
              </h4>
              <span className="tabular text-[0.7rem] text-ink-faint">
                {got}/{list.length}
              </span>
            </div>
            <ul
              className="list-none p-0 m-0 grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
            >
              {list.map((m) => (
                <MilestoneCard key={m.id} def={m} earned={earned.includes(m.id)} />
              ))}
            </ul>
          </section>
        );
      })}
    </PanelShell>
  );
}
