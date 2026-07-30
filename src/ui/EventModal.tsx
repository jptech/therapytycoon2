import { useEffect, useRef, useState } from 'react';
import { CONDITION_LABELS, SEVERITY_LABELS } from '../sim/balance';
import { CHAPTER_LABEL } from '../sim/session';
import { formatMoney } from '../sim/util';
import { modalityById, techniqueById, traitById, upgradeById } from '../content';
import type { EventChoice, EventEffect, EventScope, GameState, PortraitSeed } from '../sim/types';
import { useDispatch, useSimShallow } from '../store';
import { Chip, Modal } from './primitives';
import { Portrait } from './Portrait';

/**
 * Everything that interrupts the day and asks you a question.
 *
 * The rule this screen exists to keep: a choice never hides its mechanics. The
 * authored `hint` says what it means; the chips underneath say what it does,
 * derived straight from `choice.effects`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// describeEffect — pure, and the only place effect shapes become English
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectChip {
  icon: string;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

function signed(v: number): string {
  const abs = Math.abs(v);
  const n = abs % 1 === 0 ? String(abs) : abs.toFixed(1);
  return `${v > 0 ? '+' : '−'}${n}`;
}

/** 0..1 deltas read better as points than as decimals. */
function pts(v: number): string {
  return signed(Math.round(v * 100));
}

function toneOf(v: number): 'good' | 'bad' {
  return v > 0 ? 'good' : 'bad';
}

/** Turn an authored effect into the small signed chips shown under a choice. */
export function describeEffect(effects: EventEffect): EffectChip[] {
  const out: EffectChip[] = [];
  const e = effects;

  if (e.cash) out.push({ icon: '💵', text: formatMoney(e.cash, true), tone: toneOf(e.cash) });
  if (e.reputation) out.push({ icon: '📣', text: `${signed(e.reputation)} reputation`, tone: toneOf(e.reputation) });
  if (e.communityTrust)
    out.push({ icon: '🏘️', text: `${signed(e.communityTrust)} community trust`, tone: toneOf(e.communityTrust) });
  if (e.xp) out.push({ icon: '✨', text: `${signed(e.xp)} practice XP`, tone: toneOf(e.xp) });

  if (e.therapistMorale)
    out.push({ icon: '☀️', text: `${signed(e.therapistMorale)} their morale`, tone: toneOf(e.therapistMorale) });
  if (e.therapistEnergy)
    out.push({ icon: '🔋', text: `${signed(e.therapistEnergy)} their energy`, tone: toneOf(e.therapistEnergy) });
  if (e.therapistXp)
    out.push({ icon: '📚', text: `${signed(e.therapistXp)} their experience`, tone: toneOf(e.therapistXp) });
  if (e.allMorale)
    out.push({ icon: '☀️', text: `${signed(e.allMorale)} morale, everyone`, tone: toneOf(e.allMorale) });
  if (e.allEnergy)
    out.push({ icon: '🔋', text: `${signed(e.allEnergy)} energy, everyone`, tone: toneOf(e.allEnergy) });

  if (e.clientRapport) out.push({ icon: '🤝', text: `${pts(e.clientRapport)} rapport`, tone: toneOf(e.clientRapport) });
  if (e.clientStability)
    out.push({ icon: '🫀', text: `${pts(e.clientStability)} stability`, tone: toneOf(e.clientStability) });
  if (e.clientProgress)
    out.push({ icon: '🌱', text: `${signed(e.clientProgress)} progress`, tone: toneOf(e.clientProgress) });
  if (e.clientPatience)
    out.push({ icon: '⏳', text: `${signed(e.clientPatience)} patience`, tone: toneOf(e.clientPatience) });

  if (e.grantTechnique) {
    const name = techniqueById[e.grantTechnique]?.name;
    out.push({ icon: '🃏', text: name ? `Learn ${name}` : 'A new technique', tone: 'good' });
  }
  if (e.grantUpgrade) {
    const name = upgradeById[e.grantUpgrade]?.name;
    out.push({ icon: '🛋️', text: name ? `Gain ${name}` : 'A new upgrade', tone: 'good' });
  }
  if (e.grantTherapistTrait) {
    const name = traitById[e.grantTherapistTrait]?.name;
    out.push({ icon: '🎗️', text: name ? `They become ${name}` : 'A new trait', tone: 'good' });
  }
  if (e.spawnReferral)
    out.push({
      icon: '🚪',
      text: e.spawnReferral.complex ? 'A complex referral arrives' : 'A referral arrives',
      tone: 'neutral',
    });
  if (e.followUp)
    out.push({
      icon: '📬',
      text: e.followUp.inDays <= 1 ? 'Something follows tomorrow' : `Something follows in ${e.followUp.inDays} days`,
      tone: 'neutral',
    });

  return out;
}

const CHIP_COLOR: Record<EffectChip['tone'], string> = {
  good: 'var(--color-sage-deep)',
  bad: 'var(--color-brick)',
  neutral: 'var(--color-ink-faint)',
};

// ─────────────────────────────────────────────────────────────────────────────

const MOOD: Record<string, { color: string; icon: string }> = {
  warm: { color: 'var(--color-amber)', icon: '🕯️' },
  tense: { color: 'var(--color-brick)', icon: '🌩️' },
  sad: { color: 'var(--color-plum)', icon: '🌧️' },
  proud: { color: 'var(--color-sage)', icon: '🌿' },
  curious: { color: 'var(--color-ink)', icon: '🧭' },
};
const DEFAULT_MOOD = { color: 'var(--color-ink)', icon: '✉️' };

const SCOPE_LABEL: Record<EventScope, string> = {
  session: 'In session',
  day: 'The day',
  staff: 'The team',
  practice: 'The practice',
  client: 'A client',
  program: 'A programme',
};

const AFTERMATH_MS = 2500;

interface EventView {
  instanceId: string;
  title: string;
  body: string;
  mood?: 'warm' | 'tense' | 'sad' | 'proud' | 'curious';
  scope: EventScope;
  choices: EventChoice[];
  clientPortrait?: PortraitSeed;
  clientLine?: string;
  therapistPortrait?: PortraitSeed;
  therapistLine?: string;
}

function selectEvent(s: GameState): EventView | null {
  // A live session decision owns the screen; SessionOverlay handles that one.
  if (s.pendingEvents.some((p) => p.techniqueCards && p.techniqueCards.length > 0)) return null;
  const pending = s.pendingEvents.find((p) => !p.techniqueCards || p.techniqueCards.length === 0);
  if (!pending) return null;

  const c = pending.clientId ? s.clients.find((x) => x.id === pending.clientId) : undefined;
  const t = pending.therapistId ? s.therapists.find((x) => x.id === pending.therapistId) : undefined;

  return {
    instanceId: pending.instanceId,
    title: pending.title,
    body: pending.body,
    mood: pending.def.mood,
    scope: pending.def.scope,
    choices: pending.choices,
    clientPortrait: c?.portrait,
    clientLine: c
      ? `${c.handle} · ${c.age} · ${SEVERITY_LABELS[c.severity] ?? ''} ${CONDITION_LABELS[c.condition]} · ${CHAPTER_LABEL[c.chapter]}`
      : undefined,
    therapistPortrait: t?.portrait,
    therapistLine: t ? `${t.name} · ${t.pronouns} · ${modalityById[t.modality]?.name ?? t.modality}` : undefined,
  };
}

interface Aftermath {
  instanceId: string;
  choiceId: string;
  label: string;
  text: string;
}

export function EventModal() {
  const dispatch = useDispatch();
  const ev = useSimShallow(selectEvent);

  const [aftermath, setAftermath] = useState<Aftermath | null>(null);
  const [barSpent, setBarSpent] = useState(false);
  const anchor = useRef<HTMLDivElement | null>(null);

  const instanceId = ev?.instanceId ?? '';
  // Guard against a stale aftermath being applied to a different event.
  const showing = aftermath && aftermath.instanceId === instanceId ? aftermath : null;

  useEffect(() => {
    if (!instanceId) return;
    const id = window.setTimeout(() => anchor.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [instanceId]);

  // The aftermath line gets a beat of its own before the effects land.
  useEffect(() => {
    if (!showing) return;
    const resolveIn = window.setTimeout(() => {
      dispatch({ type: 'RESOLVE_EVENT', instanceId: showing.instanceId, choiceId: showing.choiceId });
      setAftermath(null);
    }, AFTERMATH_MS);
    const startBar = window.setTimeout(() => setBarSpent(true), 30);
    return () => {
      window.clearTimeout(resolveIn);
      window.clearTimeout(startBar);
    };
  }, [showing, dispatch]);

  if (!ev) return null;

  const mood = (ev.mood ? MOOD[ev.mood] : undefined) ?? DEFAULT_MOOD;

  const pick = (choice: EventChoice) => {
    if (showing) return;
    if (choice.outcome) {
      setBarSpent(false);
      setAftermath({
        instanceId: ev.instanceId,
        choiceId: choice.id,
        label: choice.label,
        text: choice.outcome,
      });
      return;
    }
    dispatch({ type: 'RESOLVE_EVENT', instanceId: ev.instanceId, choiceId: choice.id });
  };

  return (
    <Modal width={560} dismissable={false} labelledBy="event-modal-title">
      {/* mood strip */}
      <div className="h-[6px] w-full" style={{ background: mood.color }} aria-hidden />

      <div
        className="px-5 pt-3.5 pb-3"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${mood.color} 13%, transparent) 0%, transparent 100%)`,
        }}
      >
        <div ref={anchor} tabIndex={-1} className="outline-none flex items-start gap-2.5">
          <span className="text-[1.35rem] leading-none mt-0.5" aria-hidden>
            {mood.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint">
              {SCOPE_LABEL[ev.scope]}
            </div>
            <h2 id="event-modal-title" className="display text-[1.32rem] leading-tight text-ink mt-0.5">
              {ev.title}
            </h2>
          </div>
        </div>

        {(ev.clientLine || ev.therapistLine) && (
          <div className="mt-3 flex flex-col gap-1.5">
            {ev.clientLine && ev.clientPortrait ? (
              <IdentityStrip seed={ev.clientPortrait} line={ev.clientLine} accent="var(--color-sage)" />
            ) : null}
            {ev.therapistLine && ev.therapistPortrait ? (
              <IdentityStrip seed={ev.therapistPortrait} line={ev.therapistLine} accent="var(--color-amber-deep)" />
            ) : null}
          </div>
        )}
      </div>

      <div className="px-5">
        <p className="text-[0.9rem] leading-[1.65] text-ink-soft whitespace-pre-line">{ev.body}</p>
      </div>

      {/* ── The choice ─────────────────────────────────────────────────────── */}
      {showing ? (
        <div className="px-5 pt-4 pb-5">
          <div className="border-t hairline pt-3">
            <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-ink-faint">You chose</div>
            <div className="display text-[0.98rem] text-ink leading-snug mt-0.5">{showing.label}</div>
            <p className="text-[0.88rem] italic leading-relaxed text-ink-soft mt-2" role="status">
              {showing.text}
            </p>
            <div
              className="mt-3 h-[3px] rounded-full overflow-hidden"
              style={{ background: 'color-mix(in oklab, var(--color-ink) 10%, transparent)' }}
              aria-hidden
            >
              <div
                className="h-full rounded-full"
                style={{
                  background: mood.color,
                  width: barSpent ? '0%' : '100%',
                  transition: `width ${AFTERMATH_MS}ms linear`,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 pt-4 pb-5 flex flex-col gap-2">
          {ev.choices.map((choice) => {
            const chips = describeEffect(choice.effects);
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => pick(choice)}
                className="card-warm w-full text-left px-3.5 py-2.5 transition hover:brightness-[1.03] focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
              >
                <div className="text-[0.9rem] font-bold text-ink leading-snug">{choice.label}</div>
                {choice.hint ? (
                  <div className="text-[0.75rem] text-ink-faint leading-snug mt-0.5">{choice.hint}</div>
                ) : null}
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {chips.map((chip, i) => (
                      <Chip key={`${chip.text}-${i}`} color={CHIP_COLOR[chip.tone]}>
                        <span aria-hidden>{chip.icon}</span>
                        {chip.text}
                      </Chip>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          <p className="text-[0.68rem] text-ink-faint text-center mt-1">The clock is holding until you answer.</p>
        </div>
      )}
    </Modal>
  );
}

function IdentityStrip({ seed, line, accent }: { seed: PortraitSeed; line: string; accent: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 self-start max-w-full"
      style={{
        background: 'color-mix(in oklab, var(--color-paper) 72%, transparent)',
        border: `1px solid color-mix(in oklab, ${accent} 28%, transparent)`,
      }}
    >
      <Portrait seed={seed} size={26} title={line} />
      <span className="text-[0.74rem] text-ink-soft leading-tight truncate">{line}</span>
    </div>
  );
}
