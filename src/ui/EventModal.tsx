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

type MoodKey = 'warm' | 'tense' | 'sad' | 'proud' | 'curious' | 'default';

const MOOD: Record<string, { color: string; icon: string; key: MoodKey }> = {
  warm: { color: 'var(--color-amber)', icon: '🕯️', key: 'warm' },
  tense: { color: 'var(--color-brick)', icon: '🌩️', key: 'tense' },
  sad: { color: 'var(--color-plum)', icon: '🌧️', key: 'sad' },
  proud: { color: 'var(--color-sage)', icon: '🌿', key: 'proud' },
  curious: { color: 'var(--color-ink)', icon: '🧭', key: 'curious' },
};
const DEFAULT_MOOD = { color: 'var(--color-ink)', icon: '✉️', key: 'default' as MoodKey };

/**
 * A drawn motif behind the header — the weather of the beat, in one line
 * weight. Static: no animation, so it survives calm mode and reduced motion
 * intact, because it is design rather than juice.
 */
function MoodMotif({ mood, color }: { mood: MoodKey; color: string }) {
  const stroke = `color-mix(in oklab, ${color} 62%, transparent)`;
  const faint = `color-mix(in oklab, ${color} 26%, transparent)`;
  const common = {
    fill: 'none',
    stroke,
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      viewBox="0 0 560 92"
      preserveAspectRatio="xMaxYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
      style={{
        opacity: 0.72,
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 58%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 58%, transparent 100%)',
      }}
    >
      {mood === 'warm' && (
        <g {...common}>
          {/* a shade, and the light falling out of it */}
          <path d="M452 6 L472 6 M462 6 L462 20" />
          <path d="M441 42 L462 20 L483 42 Z" fill={faint} />
          <path d="M436 52 Q462 62 488 52" strokeWidth={1.1} />
          <path d="M424 66 Q462 82 500 66" strokeWidth={0.9} opacity={0.7} />
          <path d="M412 80 Q462 100 512 80" strokeWidth={0.8} opacity={0.45} />
          <circle cx="462" cy="46" r="2.2" fill={stroke} stroke="none" />
        </g>
      )}
      {mood === 'tense' && (
        <g {...common}>
          <path d="M398 12 L418 12 M392 22 L432 22 M400 32 L442 32" opacity={0.55} />
          <path d="M470 8 L455 40 L472 40 L452 84" strokeWidth={1.7} />
          <path d="M508 20 L496 46 L508 46 L494 76" strokeWidth={1.1} opacity={0.6} />
          <path d="M432 14 Q460 4 492 14" strokeWidth={1.2} opacity={0.5} />
        </g>
      )}
      {mood === 'sad' && (
        <g {...common}>
          <path d="M420 30 Q424 14 442 16 Q452 4 468 12 Q490 8 492 28 Q510 30 506 42 L424 42 Q412 40 420 30 Z" fill={faint} />
          <path d="M430 52 L424 74 M448 50 L442 78 M466 54 L460 76 M484 50 L478 80 M500 56 L495 72" strokeWidth={1.1} opacity={0.72} />
        </g>
      )}
      {mood === 'proud' && (
        <g {...common}>
          <path d="M470 88 L470 34" strokeWidth={1.6} />
          <path d="M470 66 Q446 62 442 42 Q466 42 470 62" fill={faint} />
          <path d="M470 52 Q494 48 498 28 Q474 28 470 48" fill={faint} />
          <circle cx="470" cy="28" r="4.5" fill={faint} />
          <circle cx="430" cy="22" r="1.8" fill={stroke} stroke="none" opacity={0.6} />
          <circle cx="512" cy="34" r="1.5" fill={stroke} stroke="none" opacity={0.5} />
          <circle cx="446" cy="10" r="1.2" fill={stroke} stroke="none" opacity={0.4} />
        </g>
      )}
      {mood === 'curious' && (
        <g {...common}>
          <circle cx="470" cy="44" r="24" />
          <circle cx="470" cy="44" r="16" opacity={0.4} />
          <path d="M462 52 L470 30 L478 52 L470 46 Z" fill={faint} />
          <path d="M404 74 Q430 70 442 54" strokeDasharray="3 5" opacity={0.7} />
          <path d="M498 34 Q522 26 540 32" strokeDasharray="3 5" opacity={0.5} />
        </g>
      )}
      {mood === 'default' && (
        <g {...common}>
          <rect x="436" y="20" width="68" height="46" rx="4" fill={faint} />
          <path d="M436 24 L470 46 L504 24" />
          <path d="M400 80 Q430 76 438 62" strokeDasharray="3 5" opacity={0.6} />
        </g>
      )}
    </svg>
  );
}

const SCOPE_LABEL: Record<EventScope, string> = {
  session: 'In session',
  day: 'The day',
  staff: 'The team',
  practice: 'The practice',
  client: 'A client',
  program: 'A programme',
};

const AFTERMATH_MS = 2500;

const SOFT_RULE =
  'linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 15%, transparent) 0%, color-mix(in oklab, var(--color-ink) 15%, transparent) 76%, transparent 100%)';

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
      {/* mood strip — lit along its top edge like everything else here */}
      <div
        className="h-[6px] w-full"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${mood.color} 62%, white) 0%, ${mood.color} 45%, color-mix(in oklab, ${mood.color} 84%, black) 100%)`,
        }}
        aria-hidden
      />

      <div
        className="relative overflow-hidden px-5 pt-3.5 pb-3"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${mood.color} 15%, transparent) 0%, color-mix(in oklab, ${mood.color} 3%, transparent) 62%, transparent 100%)`,
        }}
      >
        <MoodMotif mood={mood.key} color={mood.color} />

        <div ref={anchor} tabIndex={-1} className="relative outline-none flex items-start gap-2.5">
          <span
            className="grid place-items-center shrink-0 w-8 h-8 rounded-full text-[1.05rem] leading-none mt-0.5"
            style={{
              background: `color-mix(in oklab, ${mood.color} 18%, var(--color-paper))`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${mood.color} 38%, transparent), inset 0 1px 0 rgba(255,253,246,0.7), 0 1px 3px -1px rgba(24,46,46,0.3)`,
            }}
            aria-hidden
          >
            {mood.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint">
              {SCOPE_LABEL[ev.scope]}
            </div>
            <h2 id="event-modal-title" className="display text-[1.34rem] leading-tight text-ink mt-0.5 max-w-[26ch]">
              {ev.title}
            </h2>
          </div>
        </div>

        {(ev.clientLine || ev.therapistLine) && (
          <div className="relative mt-3 flex flex-col gap-1.5">
            {ev.clientLine && ev.clientPortrait ? (
              <IdentityStrip seed={ev.clientPortrait} line={ev.clientLine} accent="var(--color-sage)" />
            ) : null}
            {ev.therapistLine && ev.therapistPortrait ? (
              <IdentityStrip seed={ev.therapistPortrait} line={ev.therapistLine} accent="var(--color-amber-deep)" />
            ) : null}
          </div>
        )}
      </div>

      <div className="px-5 pt-1">
        <p className="text-[0.905rem] leading-[1.72] text-ink-soft whitespace-pre-line max-w-[62ch] [text-wrap:pretty]">
          {ev.body}
        </p>
      </div>

      {/* ── The choice ─────────────────────────────────────────────────────── */}
      {showing ? (
        <div className="px-5 pt-4 pb-5">
          <div className="relative pt-3">
            <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: SOFT_RULE }} />
            <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-ink-faint">You chose</div>
            <div className="display text-[1.02rem] text-ink leading-snug mt-0.5">{showing.label}</div>
            <p className="text-[0.89rem] italic leading-[1.7] text-ink-soft mt-2 max-w-[62ch]" role="status">
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
          {ev.choices.map((choice, i) => {
            const chips = describeEffect(choice.effects);
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => pick(choice)}
                className="card-warm tt-hand tt-card tt-card-lift relative w-full text-left pl-3.5 pr-9 py-2.5 focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
                style={{ ['--tt-tilt' as string]: i % 2 === 0 ? '-0.35deg' : '0.35deg' }}
              >
                <div className="text-[0.94rem] font-extrabold text-ink leading-snug max-w-[52ch]">{choice.label}</div>
                {choice.hint ? (
                  <div className="text-[0.775rem] text-ink-soft leading-[1.45] mt-[3px] max-w-[56ch] opacity-95">
                    {choice.hint}
                  </div>
                ) : null}
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {chips.map((chip, k) => (
                      <Chip key={`${chip.text}-${k}`} color={CHIP_COLOR[chip.tone]}>
                        <span aria-hidden>{chip.icon}</span>
                        {chip.text}
                      </Chip>
                    ))}
                  </div>
                )}
                <span
                  aria-hidden
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint text-[0.95rem] leading-none"
                >
                  ›
                </span>
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
        background: 'color-mix(in oklab, var(--color-paper) 82%, transparent)',
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 30%, transparent), inset 0 1px 0 rgba(255,253,246,0.7), 0 1px 2px -1px rgba(24,46,46,0.28)`,
      }}
    >
      <Portrait seed={seed} size={26} title={line} />
      <span className="text-[0.74rem] text-ink-soft leading-tight truncate">{line}</span>
    </div>
  );
}
