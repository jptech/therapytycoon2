import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PHILOSOPHIES, TECHNIQUES, programById } from '../content';
import { CONDITION_LABELS } from '../sim/balance';
import type { ConditionId, PhilosophyDef, PhilosophyId } from '../sim/types';
import { useDispatch, useSim } from '../store';
import { Button, Chip, Modal } from './primitives';

/**
 * The philosophy choice — the one decision in the run that cannot be walked back.
 *
 * It is raised by the sim (`flags.philosophyAvailable`, set the moment the
 * practice reaches level 3) and cleared by the sim when CHOOSE_PHILOSOPHY lands.
 * Nothing here computes an effect: every number on these cards is read straight
 * off the PhilosophyDef in content, rendered in plain language, and shown before
 * the player commits rather than discovered forty days later.
 */

// ── Reading the def into plain language ─────────────────────────────────────

interface BiasEntry {
  id: ConditionId;
  mult: number;
}

function splitBias(bias: PhilosophyDef['referralBias']): { up: BiasEntry[]; down: BiasEntry[] } {
  const up: BiasEntry[] = [];
  const down: BiasEntry[] = [];
  for (const [key, mult] of Object.entries(bias)) {
    if (mult === undefined) continue;
    const entry: BiasEntry = { id: key as ConditionId, mult };
    if (mult > 1.001) up.push(entry);
    else if (mult < 0.999) down.push(entry);
  }
  up.sort((a, b) => b.mult - a.mult);
  down.sort((a, b) => a.mult - b.mult);
  return { up, down };
}

function conditionName(id: ConditionId): string {
  return CONDITION_LABELS[id] ?? id;
}

/** "A, B and C" — the Oxford comma stays home, this is a therapist's newsletter. */
function joinNames(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** 1.8 → "+80%", 0.6 → "−40%". Signs are typographic minus, not hyphens. */
function pctShift(mult: number): string {
  const pct = Math.round((mult - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

function signed(v: number, digits = 2): string {
  const rounded = Number(v.toFixed(digits));
  return `${rounded >= 0 ? '+' : '−'}${Math.abs(rounded)}`;
}

interface ModLine {
  text: string;
  tone: 'good' | 'bad';
}

/** Each entry is present only when the def actually sets it. No invented mods. */
function modLines(ph: PhilosophyDef): ModLine[] {
  const out: ModLine[] = [];
  const m = ph.mods;
  if (m.quality !== undefined && m.quality !== 0) {
    out.push({
      text: `${signed(m.quality * 100, 0)} session quality on every hour, before the practice-level cap`,
      tone: m.quality > 0 ? 'good' : 'bad',
    });
  }
  if (m.communityTrustDrift !== undefined && m.communityTrustDrift !== 0) {
    out.push({
      text: `Community trust drifts ${signed(m.communityTrustDrift)} a day on its own`,
      tone: m.communityTrustDrift > 0 ? 'good' : 'bad',
    });
  }
  if (m.reputationMult !== undefined && m.reputationMult !== 1) {
    out.push({
      text: `Reputation gains run at ×${m.reputationMult} (${pctShift(m.reputationMult)})`,
      tone: m.reputationMult > 1 ? 'good' : 'bad',
    });
  }
  if (m.complexCaseAffinity !== undefined && m.complexCaseAffinity !== 0) {
    out.push({
      text: `${pctShift(1 + m.complexCaseAffinity)} of your referrals arrive as complex cases — harder hours, higher fees`,
      tone: m.complexCaseAffinity > 0 ? 'good' : 'bad',
    });
  }
  return out;
}

// ── Small pieces ────────────────────────────────────────────────────────────

function EffectRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-t hairline">
      <div className="w-[92px] shrink-0 pt-[0.15rem] text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint leading-snug">
        {label}
      </div>
      <div className="flex-1 min-w-0 text-[0.79rem] text-ink-soft leading-relaxed">{children}</div>
    </div>
  );
}

function PhilosophyCard({
  ph,
  pending,
  dimmed,
  animate,
  onPick,
  onConfirm,
  onCancel,
}: {
  ph: PhilosophyDef;
  pending: boolean;
  dimmed: boolean;
  animate: boolean;
  onPick: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { up, down } = splitBias(ph.referralBias);
  const discountPct = Math.round((1 - ph.trainingDiscount) * 100);
  const favored = ph.favoredPrograms.map((id) => programById[id]).filter((p) => !!p);
  const exclusive = TECHNIQUES.filter((t) => t.philosophy === ph.id);
  const mods = modLines(ph);

  const moreLine = up.length ? `more ${joinNames(up.slice(0, 3).map((b) => conditionName(b.id)))}` : '';
  const fewerLine = down.length
    ? `fewer ${joinNames(down.slice(0, 2).map((b) => conditionName(b.id)))}`
    : '';

  return (
    <li
      className={`${animate ? 'rise-in' : ''} transition-opacity duration-300`}
      style={{ opacity: dimmed ? 0.42 : 1 }}
    >
      <article
        className="card-warm overflow-hidden"
        style={{
          borderColor: pending
            ? `color-mix(in oklab, ${ph.accentColor} 62%, transparent)`
            : undefined,
          boxShadow: pending
            ? `0 0 0 2px color-mix(in oklab, ${ph.accentColor} 34%, transparent), var(--shadow-soft)`
            : undefined,
        }}
      >
        {/* header — the lamp above the door */}
        <div
          className="flex items-start gap-3 px-4 pt-3.5 pb-3"
          style={{
            background: `linear-gradient(180deg, color-mix(in oklab, ${ph.accentColor} 16%, transparent) 0%, transparent 100%)`,
          }}
        >
          <div className="text-[1.7rem] leading-none mt-0.5" aria-hidden>
            {ph.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="display text-[1.12rem] leading-tight text-ink">{ph.name}</h3>
            <p
              className="display italic text-[0.85rem] leading-snug mt-0.5"
              style={{ color: `color-mix(in oklab, ${ph.accentColor} 72%, var(--color-ink))` }}
            >
              {ph.tagline}
            </p>
          </div>
        </div>

        <div className="px-4 pb-3.5">
          <p className="text-[0.79rem] text-ink-soft leading-relaxed">{ph.detail}</p>

          <div className="mt-3">
            <EffectRow label="Who calls">
              <span>
                The phone starts bringing you{' '}
                {moreLine ? <span className="text-ink font-bold">{moreLine}</span> : 'much the same mix'}
                {fewerLine ? (
                  <>
                    , and <span className="text-ink font-bold">{fewerLine}</span>
                  </>
                ) : null}
                . Referral weights, exactly as the sim rolls them:
              </span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {up.map((b) => (
                  <Chip key={b.id} color="var(--color-sage-deep)" title={`Referral weight ×${b.mult}`}>
                    {conditionName(b.id)} {pctShift(b.mult)}
                  </Chip>
                ))}
                {down.map((b) => (
                  <Chip key={b.id} color="var(--color-brick)" title={`Referral weight ×${b.mult}`}>
                    {conditionName(b.id)} {pctShift(b.mult)}
                  </Chip>
                ))}
              </div>
            </EffectRow>

            <EffectRow label="Training">
              {discountPct > 0 ? (
                <>
                  <span className="text-ink font-bold">{discountPct}% off</span> every training course,
                  because your own supervisors already teach this.
                </>
              ) : (
                'Trainings cost what they cost.'
              )}
            </EffectRow>

            {favored.length ? (
              <EffectRow label="Favours">
                <span>The programs this practice is built to run well:</span>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {favored.map((p) => (
                    <Chip key={p.id} color={p.color} title={p.blurb}>
                      <span aria-hidden>{p.icon}</span>
                      {p.name}
                    </Chip>
                  ))}
                </div>
              </EffectRow>
            ) : null}

            {mods.length ? (
              <EffectRow label="Numbers">
                <ul className="list-none p-0 m-0 space-y-0.5">
                  {mods.map((line) => (
                    <li key={line.text} className="flex gap-1.5">
                      <span
                        aria-hidden
                        className="mt-[0.44rem] w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background:
                            line.tone === 'good' ? 'var(--color-sage-deep)' : 'var(--color-brick)',
                        }}
                      />
                      <span>{line.text}</span>
                    </li>
                  ))}
                </ul>
              </EffectRow>
            ) : null}

            {exclusive.length ? (
              <EffectRow label="Unlocks">
                {exclusive.length} technique{exclusive.length === 1 ? '' : 's'} handed to everyone on
                staff the day you commit: {joinNames(exclusive.map((t) => t.name))}.
              </EffectRow>
            ) : null}
          </div>

          {pending ? (
            <div
              className="mt-3.5 rounded-[12px] px-3 py-3"
              style={{
                background: `color-mix(in oklab, ${ph.accentColor} 12%, transparent)`,
                border: `1px solid color-mix(in oklab, ${ph.accentColor} 34%, transparent)`,
              }}
            >
              <p className="text-[0.79rem] text-ink leading-snug">
                Become the <span className="font-bold">{ph.name}</span>? There is no changing back,
                no second philosophy, no quiet reversal three quarters from now. This is the practice
                from here on.
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <Button variant="primary" onClick={onConfirm} autoFocus>
                  Yes — this is who we are
                </Button>
                <Button variant="ghost" onClick={onCancel}>
                  Let me read the others again
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3.5">
              <Button
                variant="ghost"
                onClick={onPick}
                aria-label={`Choose ${ph.name}`}
                className="w-full justify-center"
              >
                Choose {ph.name}
              </Button>
            </div>
          )}
        </div>
      </article>
    </li>
  );
}

// ── The modal ───────────────────────────────────────────────────────────────

export function PhilosophyModal() {
  const dispatch = useDispatch();
  const offered = useSim((s) => !!s.flags.philosophyAvailable && !s.philosophy);
  const day = useSim((s) => s.day);
  const practiceName = useSim((s) => s.practiceName);
  const practiceLevel = useSim((s) => s.practiceLevel);
  const calm = useSim((s) => s.settings.calmMode);
  const reduced = useSim((s) => s.settings.reducedMotion);
  const paused = useSim((s) => s.paused);

  const [pending, setPending] = useState<PhilosophyId | null>(null);
  /** Set by "Decide later" — the flag survives, the modal just steps back until tomorrow. */
  const [deferredOn, setDeferredOn] = useState<number | null>(null);

  const visible = offered && deferredOn !== day;

  /**
   * A permanent decision should not be taken while the clock is still moving.
   * We hold the pause with the sanctioned action and hand back whatever the
   * player had before we arrived, so this never steals a running day from them.
   */
  const wasPaused = useRef(paused);
  useEffect(() => {
    if (!visible) return;
    wasPaused.current = paused;
    if (!paused) dispatch({ type: 'TOGGLE_PAUSE', paused: true });
    return () => {
      if (!wasPaused.current) dispatch({ type: 'TOGGLE_PAUSE', paused: false });
    };
    // Deliberately keyed on visibility alone: re-running on `paused` would fight
    // the player if they unpause from the HUD behind the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dispatch]);

  if (!visible) return null;

  const animate = !calm && !reduced;
  const decideLater = () => {
    setPending(null);
    setDeferredOn(day);
  };

  return (
    <Modal width={720} onClose={decideLater} labelledBy="philosophy-title">
      <div className="px-5 pt-4 pb-3.5 border-b hairline">
        <div className="flex items-center gap-2 flex-wrap">
          <Chip color="var(--color-amber-deep)">Practice level {practiceLevel}</Chip>
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.11em] text-ink-faint">
            A decision that stays made
          </span>
        </div>
        <h2 id="philosophy-title" className="display text-[1.5rem] leading-tight text-ink mt-1.5">
          What kind of practice is this becoming?
        </h2>
        <p className="text-[0.82rem] text-ink-soft leading-relaxed mt-1.5">
          {practiceName} has been open {day} days, and referrals now arrive faster than you can shape
          them one at a time. Choosing a philosophy sets the lean: it changes{' '}
          <span className="text-ink font-bold">who gets sent to you</span>, what your clinicians get
          good at, which trainings come cheap, and which programs the practice is built to run.
        </p>
        <p
          className="text-[0.79rem] leading-relaxed mt-2 pl-2.5"
          style={{
            borderLeft: '2px solid color-mix(in oklab, var(--color-brick) 55%, transparent)',
            color: 'var(--color-ink-soft)',
          }}
        >
          <span className="font-bold text-ink">This is permanent for this run.</span> You pick once.
          There is no second philosophy, no refund, and no version of the practice where you quietly
          become something else in year two. Read all three.
        </p>
      </div>

      <div className="px-5 py-4">
        <ul className="list-none p-0 m-0 space-y-3">
          {PHILOSOPHIES.map((ph) => (
            <PhilosophyCard
              key={ph.id}
              ph={ph}
              pending={pending === ph.id}
              dimmed={pending !== null && pending !== ph.id}
              animate={animate}
              onPick={() => setPending(ph.id)}
              onConfirm={() => dispatch({ type: 'CHOOSE_PHILOSOPHY', philosophy: ph.id })}
              onCancel={() => setPending(null)}
            />
          ))}
        </ul>
      </div>

      <div className="px-5 py-3 border-t hairline flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[0.73rem] text-ink-faint leading-snug max-w-[46ch]">
          Not ready? Nothing expires. The letter stays on the desk and the question comes back
          tomorrow morning, in exactly this shape.
        </p>
        <Button variant="ghost" onClick={decideLater}>
          Decide later
        </Button>
      </div>
    </Modal>
  );
}
