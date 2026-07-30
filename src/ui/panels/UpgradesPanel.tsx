import { useMemo } from 'react';
import { UPGRADES, programById, upgradeById } from '../../content';
import { meetsRequirement } from '../../sim/eventsys';
import type { EventRequirement, GameState, UpgradeDef } from '../../sim/types';
import { formatMoney } from '../../sim/util';
import { useDispatch, useSim, useSimShallow, useStore } from '../../store';
import { Button, Chip, Divider, PanelShell, SectionHeading } from '../primitives';

/**
 * The slow, tangible improvement of a place.
 *
 * Gating is decided by the sim's own `meetsRequirement`; everything here only
 * *explains* that verdict in plain language, so a locked card always says why
 * it is locked and what it would take.
 */

const CATEGORIES: { id: UpgradeDef['category']; label: string; blurb: string; icon: string }[] = [
  {
    id: 'office',
    label: 'The Office',
    blurb: 'The room itself — light, comfort, and a door that closes properly.',
    icon: '🛋️',
  },
  {
    id: 'tech',
    label: 'Infrastructure',
    blurb: 'Quiet machinery that buys back your evenings.',
    icon: '🎚️',
  },
  {
    id: 'certification',
    label: 'Certification',
    blurb: 'What the team is permitted — and equipped — to do.',
    icon: '🧭',
  },
  {
    id: 'automation',
    label: 'Automation',
    blurb: 'Labour saved, arriving just before the tedium does.',
    icon: '⚙️',
  },
];

/** upgradeId → names of the upgrades it is a prerequisite for. Content-derived. */
const LEADS_TO: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const u of UPGRADES) {
    for (const dep of u.requires?.hasUpgrade ?? []) (out[dep] ||= []).push(u.name);
  }
  return out;
})();

const FEATURE_LABELS: Record<string, string> = {
  batch_booking: 'Unlocks batch booking — a week of slots in one drag',
  auto_scheduler: 'Unlocks the policy auto-scheduler',
  minors: 'Unlocks work with under-18s',
};

/** Renders an upgrade's mods as sentences a person would say out loud. */
function describeMods(u: UpgradeDef): string[] {
  const m = u.mods;
  if (!m) return ['No numbers attached. It just makes the place better to be in.'];
  const out: string[] = [];
  if (m.quality) out.push(`${m.quality > 0 ? '+' : ''}${Math.round(m.quality * 100)}% session quality`);
  if (m.capacity) out.push(`Room for ${m.capacity} more client${m.capacity === 1 ? '' : 's'}`);
  if (m.referralMult && m.referralMult !== 1)
    out.push(`${m.referralMult > 1 ? '+' : ''}${Math.round((m.referralMult - 1) * 100)}% referrals coming in`);
  if (m.energyRegenMult && m.energyRegenMult !== 1)
    out.push(
      `${m.energyRegenMult > 1 ? '+' : ''}${Math.round((m.energyRegenMult - 1) * 100)}% energy back overnight`,
    );
  if (m.moraleDrift)
    out.push(
      m.moraleDrift >= 0.6
        ? 'Morale climbs noticeably every night'
        : m.moraleDrift >= 0.3
          ? 'Morale drifts up every night'
          : 'Morale drifts up a touch every night',
    );
  if (m.unlockSessionType) out.push(`Unlocks ${m.unlockSessionType} sessions`);
  if (m.unlockFeature) out.push(FEATURE_LABELS[m.unlockFeature] ?? `Unlocks ${m.unlockFeature}`);
  return out;
}

/**
 * Lists the requirement lines that are currently unmet. `meetsRequirement`
 * remains the authority on whether the button is enabled — this only names the
 * same conditions so the player is never guessing.
 */
function unmetReasons(s: GameState, req: EventRequirement | undefined): string[] {
  if (!req) return [];
  const out: string[] = [];
  if (req.minPracticeLevel !== undefined && s.practiceLevel < req.minPracticeLevel)
    out.push(`Practice level ${req.minPracticeLevel} (you are ${s.practiceLevel})`);
  if (req.minTherapists !== undefined) {
    const staff = s.therapists.filter((t) => t.status !== 'departed').length;
    if (staff < req.minTherapists) out.push(`${req.minTherapists} clinicians on staff (you have ${staff})`);
  }
  if (req.minReputation !== undefined && s.reputation < req.minReputation)
    out.push(`Reputation ${req.minReputation} (you are at ${Math.round(s.reputation)})`);
  if (req.minCommunityTrust !== undefined && s.communityTrust < req.minCommunityTrust)
    out.push(`Community trust ${req.minCommunityTrust} (you are at ${Math.round(s.communityTrust)})`);
  if (req.minCash !== undefined && s.cash < req.minCash)
    out.push(`${formatMoney(req.minCash)} in reserve, on top of the price`);
  for (const id of req.hasUpgrade ?? []) {
    if (!s.upgrades.includes(id)) out.push(`${upgradeById[id]?.name ?? id} first`);
  }
  for (const id of req.hasProgram ?? []) {
    if (!s.programs.some((p) => p.id === id && p.active))
      out.push(`${programById[id]?.name ?? id} running`);
  }
  if (req.act && !req.act.includes(s.act)) out.push(`Act ${req.act.join(' or ')}`);
  if (req.flag && !s.flags[req.flag]) out.push('Something that has not happened yet');
  return out;
}

export function UpgradesPanel() {
  const dispatch = useDispatch();
  const setUi = useStore((s) => s.setUi);
  const close = () => setUi({ panel: null });

  const cash = useSim((s) => s.cash);
  const practiceLevel = useSim((s) => s.practiceLevel);
  const owned = useSimShallow((s) => s.upgrades.map((id) => id));
  const eligible = useSimShallow((s) => UPGRADES.map((u) => meetsRequirement(s, u.requires)));
  const reasons = useSimShallow((s) => UPGRADES.map((u) => unmetReasons(s, u.requires).join(' · ')));

  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const spent = useMemo(
    () => owned.reduce((a, id) => a + (upgradeById[id]?.cost ?? 0), 0),
    [owned],
  );

  const indexOf = useMemo(() => {
    const m: Record<string, number> = {};
    UPGRADES.forEach((u, i) => {
      m[u.id] = i;
    });
    return m;
  }, []);

  return (
    <PanelShell
      icon="🔨"
      title="Improvements"
      subtitle="Nothing here is a stat spike. Each one is the building exhaling a little."
      onClose={close}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.72rem] text-ink-faint">
            <span className="tabular font-bold text-ink">
              {owned.length}/{UPGRADES.length}
            </span>{' '}
            installed · <span className="tabular">{formatMoney(spent)}</span> put back into the place
          </span>
          <span className="tabular text-[0.78rem] text-ink">{formatMoney(cash)} on hand</span>
        </div>
      }
    >
      {CATEGORIES.map((cat) => {
        const items = UPGRADES.filter((u) => u.category === cat.id).slice().sort((a, b) => {
          const aOwned = ownedSet.has(a.id) ? 1 : 0;
          const bOwned = ownedSet.has(b.id) ? 1 : 0;
          if (aOwned !== bOwned) return aOwned - bOwned; // installed sink to the bottom
          return a.cost - b.cost;
        });
        const installedHere = items.filter((u) => ownedSet.has(u.id)).length;

        return (
          <section key={cat.id} className="mb-4 last:mb-0">
            <SectionHeading
              sub={cat.blurb}
              right={
                <span className="tabular text-[0.68rem] text-ink-faint whitespace-nowrap">
                  {installedHere}/{items.length}
                </span>
              }
            >
              <span aria-hidden className="mr-1.5">
                {cat.icon}
              </span>
              {cat.label}
            </SectionHeading>

            <div className="space-y-2">
              {items.map((u) => {
                const i = indexOf[u.id];
                return (
                  <UpgradeCard
                    key={u.id}
                    upgrade={u}
                    installed={ownedSet.has(u.id)}
                    eligible={eligible[i]}
                    lockReason={reasons[i]}
                    cash={cash}
                    onBuy={() => dispatch({ type: 'BUY_UPGRADE', upgradeId: u.id })}
                  />
                );
              })}
            </div>
            {cat.id !== 'automation' ? <Divider /> : null}
          </section>
        );
      })}

      <p className="text-[0.72rem] text-ink-faint leading-snug">
        Locked cards say exactly what they want. Most of it arrives on its own as the practice grows —
        you are level <span className="tabular font-bold">{practiceLevel}</span> tonight.
      </p>
    </PanelShell>
  );
}

function UpgradeCard({
  upgrade,
  installed,
  eligible,
  lockReason,
  cash,
  onBuy,
}: {
  upgrade: UpgradeDef;
  installed: boolean;
  eligible: boolean;
  lockReason: string;
  cash: number;
  onBuy: () => void;
}) {
  const effects = useMemo(() => describeMods(upgrade), [upgrade]);
  const leadsTo = LEADS_TO[upgrade.id];
  const short = cash < upgrade.cost;
  const canBuy = eligible && !short;

  return (
    <article
      className={`px-3 py-2.5 rounded-[var(--radius-card)] ${installed ? '' : 'card-warm'}`}
      style={
        installed
          ? {
              background: 'color-mix(in oklab, var(--color-sage) 13%, transparent)',
              border: '1px solid color-mix(in oklab, var(--color-sage) 34%, transparent)',
            }
          : eligible
            ? undefined
            : { opacity: 0.82 }
      }
    >
      <div className="flex items-start gap-2.5">
        <div className="text-xl leading-none mt-0.5 shrink-0" aria-hidden>
          {upgrade.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="display text-[0.95rem] leading-tight text-ink">{upgrade.name}</h4>
            {installed ? (
              <Chip color="var(--color-sage-deep)" className="shrink-0">
                ✓ Installed
              </Chip>
            ) : (
              <span
                className="tabular text-[0.8rem] font-bold shrink-0"
                style={{ color: short ? 'var(--color-brick)' : 'var(--color-ink)' }}
              >
                {formatMoney(upgrade.cost)}
              </span>
            )}
          </div>
          <p className="text-[0.76rem] text-ink-soft leading-snug mt-0.5">{upgrade.blurb}</p>

          <ul className="flex flex-wrap gap-1 mt-1.5">
            {effects.map((e) => (
              <li key={e}>
                <Chip color={installed ? 'var(--color-sage-deep)' : 'var(--color-amber-deep)'}>{e}</Chip>
              </li>
            ))}
          </ul>

          {leadsTo?.length ? (
            <p className="text-[0.68rem] text-ink-faint leading-snug mt-1.5">
              <span className="font-bold uppercase tracking-[0.08em]">Opens the way to</span>{' '}
              {leadsTo.join(', ')}
            </p>
          ) : null}

          {!installed && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Button
                variant={canBuy ? 'primary' : 'ghost'}
                size="sm"
                disabled={!canBuy}
                onClick={onBuy}
                aria-label={`Buy ${upgrade.name} for ${formatMoney(upgrade.cost)}`}
              >
                {canBuy ? 'Have it fitted' : 'Not yet'}
              </Button>
              {!eligible ? (
                <span className="text-[0.71rem] text-ink-faint leading-snug">
                  Needs {lockReason || 'something the practice has not grown into yet'}
                </span>
              ) : short ? (
                <span className="text-[0.71rem] leading-snug" style={{ color: 'var(--color-brick)' }}>
                  {formatMoney(upgrade.cost - cash)} short
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
