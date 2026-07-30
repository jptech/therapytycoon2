import { useEffect, useMemo } from 'react';
import { FOCUSES } from '../sim/balance';
import { MENTOR_LINES } from '../content';
import type { GameState } from '../sim/types';
import { useDispatch, useSim, useUi } from '../store';

/**
 * The shortened spotlight tour.
 *
 * Eight coach-marks in Dr. Wren Halloway's voice, anchored by corner rather
 * than by measuring anybody else's DOM. Two hard rules:
 *
 *  1. It never blocks input — the wrapper is pointer-events-none and only the
 *     card itself takes clicks. There is no scrim.
 *  2. Every step also completes on its own the moment the player does the
 *     thing, so a player who ignores the tour is never nagged twice.
 *
 * `tutorialStep` is −1 when the tour is over. Steps dispatch an explicit index
 * rather than an increment, because other panels use ADVANCE_TUTORIAL as a
 * no-op revision bump and we must not be shoved forward by one.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Anchors
// ─────────────────────────────────────────────────────────────────────────────

type Anchor =
  | 'clock'
  | 'rail-schedule'
  | 'rail-clients'
  | 'rail-staff'
  | 'bottom-center'
  | 'bottom-right';

/**
 * The left rail sits at left:12px / top:74px with 6px padding, 40px doors and
 * 6px gaps, so door *i* starts at 80 + 46i. These offsets are eyeballed against
 * that geometry rather than measured — a coach-mark two pixels off is fine, a
 * coach-mark that reads another component's layout is a coupling we would pay
 * for later.
 */
const ANCHOR_CLASS: Record<Anchor, string> = {
  clock: 'top-[76px] left-1/2 -translate-x-1/2',
  'rail-schedule': 'left-[72px] top-[74px]',
  'rail-clients': 'left-[72px] top-[118px]',
  'rail-staff': 'left-[72px] top-[164px]',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
};

/** Which edge of the card the little pointer sticks out of. */
const ANCHOR_CARET: Record<Anchor, string | null> = {
  clock: null,
  'rail-schedule': 'left',
  'rail-clients': 'left',
  'rail-staff': 'left',
  'bottom-center': null,
  'bottom-right': null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

interface Step {
  id: string;
  title: string;
  /** Wren's line. Pulled from MENTOR_LINES where one fits. */
  voice?: string;
  body: string;
  anchor: Anchor;
  /** Watched in the sim: when this goes true the step retires itself. */
  done: (s: GameState) => boolean;
}

/**
 * MENTOR_LINES is authored content and may be re-ordered, so match on a phrase
 * rather than an index and fall back to the step's own words.
 */
function mentorLine(fragment: string): string | undefined {
  return MENTOR_LINES.find((l) => l.toLowerCase().includes(fragment.toLowerCase()));
}

const STEPS: Step[] = [
  {
    id: 'clock',
    title: 'The clock is the whole game',
    voice: mentorLine('holding their breath since Tuesday'),
    body:
      'Eight in the morning to six in the evening, ten hours, one screen. Space holds everything. 1, 2 and 3 set the speed. Nothing bad happens while you are thinking.',
    anchor: 'clock',
    // Touching the speed control *is* the thing. The clock fallback is
    // deliberately generous so the card is never yanked away mid-sentence.
    done: (s) => s.speed !== 1 || s.minute >= 240,
  },
  {
    id: 'waitlist',
    title: 'Somebody is waiting',
    voice: mentorLine('waitlist will still be there tomorrow'),
    body:
      'The caseload door (🪴) has people who called and have not been seen. Say yes to one and they join your week. Say no kindly and the neighbourhood notices that too.',
    anchor: 'rail-clients',
    done: (s) => s.clients.some((c) => c.status === 'active'),
  },
  {
    id: 'book',
    title: 'Give them an hour',
    voice: undefined,
    body:
      'Open Today (📅) and drop a client into a slot. That booking is the only promise this game asks you to keep — an unseen client loses patience a little faster every day.',
    anchor: 'rail-schedule',
    done: (s) => s.schedule.length > 0,
  },
  {
    id: 'focus',
    title: 'Three ways to spend the hour',
    voice: mentorLine('process a fire'),
    body: `${FOCUSES.stabilize.icon} ${FOCUSES.stabilize.name} — ${FOCUSES.stabilize.blurb} ${FOCUSES.process.icon} ${FOCUSES.process.name} — ${FOCUSES.process.blurb} ${FOCUSES.build_skills.icon} ${FOCUSES.build_skills.name} — ${FOCUSES.build_skills.blurb}`,
    anchor: 'bottom-center',
    done: (s) => s.schedule.some((x) => x.status === 'active' || x.status === 'done'),
  },
  {
    id: 'technique',
    title: 'Halfway through, a decision',
    voice: mentorLine('warm room over a clever technique'),
    body:
      'A little over halfway into every session the room asks you something, and you pick a technique card. Each card shows its own odds before you choose it — likely quality, energy cost, and the chance of a setback. No card hides anything.',
    anchor: 'bottom-center',
    done: (s) => s.schedule.some((x) => !!x.techniqueUsed),
  },
  {
    id: 'reflect',
    title: 'And afterwards, the reasons',
    voice: mentorLine('Take the win'),
    body:
      'When a session ends you get a reflect card: what moved, what did not, and the plain-language reason for each. If an hour went badly, that card will tell you exactly why. Read the bad ones.',
    anchor: 'bottom-center',
    done: (s) => s.lastDayResults.length > 0,
  },
  {
    id: 'energy',
    title: 'You are a resource too',
    voice: mentorLine('Burnout'),
    body:
      'Every session costs energy, and Process costs more. Energy comes back overnight; strain does not. The team door (👥) shows both, plus a forecast of where today leaves everyone.',
    anchor: 'rail-staff',
    done: (s) => s.therapists.some((t) => t.energy < t.maxEnergy * 0.62),
  },
  {
    id: 'hire',
    title: 'Eventually, not alone',
    voice: mentorLine('Hire someone who disagrees'),
    body:
      'When the waitlist grows past what one person can hold, candidates start turning up behind the team door. Hiring is the moment this stops being a job and starts being a practice.',
    anchor: 'rail-staff',
    done: (s) => s.therapists.filter((t) => t.status !== 'departed').length >= 2,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export function Onboarding() {
  const dispatch = useDispatch();
  const step = useSim((s) => s.tutorialStep);
  const screen = useUi((u) => u.screen);

  // Never compete with something modal, and never talk over the morning brief.
  const busyUi = useUi((u) => u.hireOpen || u.philosophyOpen || u.quarterReviewOpen || !!u.reflectResult);
  const busySim = useSim((s) => s.pendingEvents.length > 0 || s.dayPhase !== 'running' || !!s.ended);

  const active = step >= 0 && step < STEPS.length ? STEPS[step] : undefined;
  const satisfied = useSim((s) => (active ? active.done(s) : false));

  // Retire a step the moment the player does the thing, tour visible or not.
  useEffect(() => {
    if (!active || !satisfied) return;
    const next = step + 1 >= STEPS.length ? -1 : step + 1;
    dispatch({ type: 'ADVANCE_TUTORIAL', step: next });
  }, [active, satisfied, step, dispatch]);

  const caret = useMemo(() => (active ? ANCHOR_CARET[active.anchor] : null), [active]);

  if (!active || screen !== 'playing' || busyUi || busySim || satisfied) return null;

  const advance = () => dispatch({ type: 'ADVANCE_TUTORIAL', step: step + 1 >= STEPS.length ? -1 : step + 1 });
  const skip = () => dispatch({ type: 'ADVANCE_TUTORIAL', step: -1 });

  return (
    <div className="absolute inset-0 z-[44] pointer-events-none" aria-live="polite">
      <div className={`absolute ${ANCHOR_CLASS[active.anchor]} w-[min(300px,calc(100vw-2rem))]`}>
        <div className="relative paper pop-in pointer-events-auto px-3.5 py-3">
          {caret === 'left' ? (
            <span
              aria-hidden
              className="juice-only absolute top-5 -left-[6px] w-3 h-3 rotate-45"
              style={{
                background: 'var(--color-paper)',
                borderLeft: '1px solid color-mix(in oklab, var(--color-ink) 14%, transparent)',
                borderBottom: '1px solid color-mix(in oklab, var(--color-ink) 14%, transparent)',
              }}
            />
          ) : null}

          <header className="flex items-center gap-2 mb-1.5">
            <span
              aria-hidden
              className="grid place-items-center w-7 h-7 rounded-full shrink-0 display text-[0.66rem] text-ink"
              style={{
                background: 'radial-gradient(70% 70% at 34% 28%, var(--color-amber-glow), var(--color-amber))',
                boxShadow: '0 0 16px -4px var(--color-amber)',
              }}
            >
              WH
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.11em] text-ink-faint leading-none">
                Dr. Wren Halloway
              </div>
              <div className="text-[0.6rem] text-ink-faint leading-tight mt-0.5 tabular">
                {step + 1} of {STEPS.length}
              </div>
            </div>
          </header>

          <h3 className="display text-[0.98rem] leading-tight text-ink">{active.title}</h3>

          {active.voice ? (
            <blockquote
              className="display italic text-[0.79rem] leading-[1.5] text-ink-soft mt-1.5 mb-1.5 pl-2.5"
              style={{ borderLeft: '2px solid color-mix(in oklab, var(--color-amber) 55%, transparent)' }}
            >
              “{active.voice}”
            </blockquote>
          ) : null}

          <p className="text-[0.76rem] leading-relaxed text-ink-soft mt-1">{active.body}</p>

          <div className="flex items-center justify-between gap-2 mt-2.5">
            <button className="btn btn-primary text-[0.72rem] px-2.5 py-1" onClick={advance}>
              Got it
            </button>
            <button
              className="text-[0.68rem] text-ink-faint underline underline-offset-2 hover:text-ink-soft transition focus-visible:outline-2 focus-visible:outline-offset-2 bg-transparent border-0 p-0"
              onClick={skip}
            >
              Skip the tour
            </button>
          </div>

          <div
            className="mt-2.5 h-[3px] rounded-full overflow-hidden"
            style={{ background: 'color-mix(in oklab, var(--color-ink) 10%, transparent)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                background: 'linear-gradient(90deg, var(--color-amber-glow), var(--color-amber))',
                transition: 'width 0.4s var(--ease-warm)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
