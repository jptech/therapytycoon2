import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONDITION_LABELS } from '../sim/balance';
import { bus } from '../sim/bus';
import { capacity, therapistSlots } from '../sim/engine';
import { milestoneById, programById } from '../content';
import type { AlumniRecord, Toast } from '../sim/types';
import { getSim, useDispatch, useSim, useSimShallow } from '../store';
import { Plant, Portrait } from './Portrait';

/**
 * The juice layer.
 *
 * Everything in here is *additive* over something the sim already said out loud
 * in a toast or a log line. That is the whole calm-mode contract: turn the
 * ceremonies off and you lose the petals, never the information.
 *
 * Particles are plain divs driven by two shared CSS keyframes — no canvas loop,
 * no library, and the whole layer unmounts itself on a timer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Comfort
// ─────────────────────────────────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefers(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return prefers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toasts
// ─────────────────────────────────────────────────────────────────────────────

const TOAST_LIFE_MS = 5000;

const TOAST_ICON: Record<Toast['kind'], string> = {
  milestone: '🏅',
  cure: '🌸',
  levelup: '✨',
  warning: '⚠️',
  info: '💡',
  money: '💵',
};

const TOAST_ACCENT: Record<Toast['kind'], string> = {
  milestone: 'var(--color-amber)',
  cure: 'var(--color-sage)',
  levelup: 'var(--color-amber-deep)',
  warning: 'var(--color-brick)',
  info: 'var(--color-ink-faint)',
  money: 'var(--color-sage-deep)',
};

function ToastCard({ toast, animate }: { toast: Toast; animate: boolean }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const id = window.setTimeout(() => dispatch({ type: 'DISMISS_TOAST', toastId: toast.id }), TOAST_LIFE_MS);
    return () => window.clearTimeout(id);
  }, [dispatch, toast.id]);

  const accent = TOAST_ACCENT[toast.kind] ?? 'var(--color-ink-faint)';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`card-warm pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 text-left ${
        animate ? 'rise-in' : ''
      }`}
      style={{ borderLeft: `3px solid ${accent}`, boxShadow: 'var(--shadow-lamp)' }}
    >
      <span aria-hidden className="text-[1.05rem] leading-none mt-0.5 shrink-0">
        {toast.icon || TOAST_ICON[toast.kind] || '•'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="display text-[0.9rem] leading-tight text-ink">{toast.title}</div>
        {toast.body ? (
          <div className="text-[0.73rem] text-ink-soft leading-snug mt-0.5">{toast.body}</div>
        ) : null}
      </div>
      <button
        onClick={() => dispatch({ type: 'DISMISS_TOAST', toastId: toast.id })}
        aria-label={`Dismiss: ${toast.title}`}
        className="shrink-0 w-5 h-5 grid place-items-center rounded-full text-[0.65rem] text-ink-faint hover:bg-[color-mix(in_oklab,var(--color-ink)_10%,transparent)] transition focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}

function ToastStack({ animate }: { animate: boolean }) {
  // `state.toasts` is pushed in place, so slice() to give the shallow
  // comparator a fresh array to look at.
  const toasts = useSimShallow<Toast[]>((s) => s.toasts.slice());
  if (!toasts.length) return null;
  return (
    <section
      aria-label="Recent notices"
      className="absolute right-3 top-[74px] z-[46] w-[min(300px,calc(100%-1.5rem))] flex flex-col gap-1.5 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} animate={animate} />
      ))}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Petals
// ─────────────────────────────────────────────────────────────────────────────

interface Petal {
  left: number;
  delay: number;
  fall: number;
  flutter: number;
  size: number;
  color: string;
  opacity: number;
}

const PETAL_COLORS = ['#8FAF8B', '#E8A94C', '#8B6B8F', '#F6D79B', '#A9C6A4', '#B58AA5'];

function makePetals(count: number): Petal[] {
  const out: Petal[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      left: Math.random() * 100,
      delay: Math.random() * 900,
      fall: 1900 + Math.random() * 1400,
      flutter: 900 + Math.random() * 800,
      size: 7 + Math.random() * 7,
      color: PETAL_COLORS[i % PETAL_COLORS.length],
      opacity: 0.62 + Math.random() * 0.34,
    });
  }
  return out;
}

function PetalFall({ seed }: { seed: string }) {
  const petals = useMemo(() => makePetals(60), [seed]);
  return (
    <div aria-hidden className="juice-only absolute inset-0 overflow-hidden pointer-events-none">
      {petals.map((p, i) => (
        <div
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            animation: `tt-petal-fall ${p.fall}ms linear ${p.delay}ms forwards`,
            willChange: 'transform',
          }}
        >
          <div
            style={{
              width: p.size,
              height: p.size * 1.35,
              background: p.color,
              opacity: p.opacity,
              borderRadius: '58% 4% 58% 58%',
              animation: `tt-petal-flutter ${p.flutter}ms ease-in-out infinite alternate`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The cure ceremony
// ─────────────────────────────────────────────────────────────────────────────

const CEREMONY_MS = 4400;

function CureCeremony({ alumni, onDone }: { alumni: AlumniRecord; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, CEREMONY_MS);
    return () => window.clearTimeout(id);
  }, [onDone, alumni.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  return (
    <div
      role="presentation"
      onClick={onDone}
      className="fixed inset-0 z-[60] grid place-items-center p-4 fade-in cursor-pointer"
      style={{
        background: 'color-mix(in oklab, var(--color-night) 70%, transparent)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <PetalFall seed={alumni.id} />

      <div
        role="status"
        aria-live="polite"
        className="paper pop-in relative w-full max-w-[420px] px-6 pt-6 pb-4 text-center"
      >
        <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.24em] text-ink-faint">
          Discharged · day {alumni.curedDay}
        </div>
        <h2 className="display text-[1.75rem] leading-tight text-ink mt-1">A good goodbye</h2>

        <div className="flex items-end justify-center gap-3 mt-4">
          <Portrait
            seed={alumni.portrait}
            size={92}
            glow
            mood="happy"
            title={`${alumni.handle}, discharged`}
          />
          <Plant progress={100} size={68} species={alumni.portrait.hue % 6} className="juice-only" />
        </div>

        <div className="display text-[1.05rem] text-ink mt-3">{alumni.handle}</div>
        <div className="text-[0.74rem] text-ink-faint leading-snug">
          {CONDITION_LABELS[alumni.condition] ?? alumni.condition}
          {alumni.complex ? ' · a complex case' : ''} ·{' '}
          <span className="tabular">{alumni.sessions}</span> session
          {alumni.sessions === 1 ? '' : 's'}
        </div>

        <blockquote
          className="display italic text-[0.95rem] leading-[1.6] text-ink-soft text-left mt-4 pl-3"
          style={{ borderLeft: '2px solid color-mix(in oklab, var(--color-amber) 60%, transparent)' }}
        >
          “{alumni.testimonial}”
        </blockquote>

        <div className="text-[0.7rem] text-ink-faint mt-3">
          seen through by <span className="text-ink-soft font-bold">{alumni.therapistName}</span>
        </div>

        <button
          onClick={onDone}
          className="btn btn-ghost text-[0.72rem] px-2.5 py-1 mt-4"
          aria-label="Close the goodbye and return to the practice"
        >
          Take the win
        </button>
        <div className="text-[0.62rem] text-ink-faint mt-1.5">Click anywhere to carry on.</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Practice level-up
// ─────────────────────────────────────────────────────────────────────────────

interface LevelUpMoment {
  key: number;
  level: number;
  clients: number;
  therapists: number;
}

const LEVEL_UP_MS = 2900;

function LevelUpGlow({ moment, onDone }: { moment: LevelUpMoment; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, LEVEL_UP_MS);
    return () => window.clearTimeout(id);
  }, [onDone, moment.key]);

  return (
    <div
      aria-hidden
      className="juice-only fixed inset-0 z-[55] pointer-events-none grid place-items-center overflow-hidden"
    >
      {[0, 220, 440].map((delay) => (
        <span
          key={delay}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: '38vmin',
            height: '38vmin',
            border: '2px solid var(--color-amber)',
            boxShadow: '0 0 60px 10px color-mix(in oklab, var(--color-amber) 34%, transparent)',
            animation: `tt-ring-out 1500ms var(--ease-warm) ${delay}ms both`,
          }}
        />
      ))}
      <div className="paper pop-in px-6 py-4 text-center relative">
        <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.22em] text-ink-faint">
          The practice grew
        </div>
        <div className="display text-[1.6rem] leading-tight text-ink mt-0.5">
          Level <span className="tabular">{moment.level}</span>
        </div>
        <div className="text-[0.78rem] text-ink-soft leading-snug mt-1">
          Room for <b className="tabular">{moment.clients}</b> active clients and{' '}
          <b className="tabular">{moment.therapists}</b> therapist
          {moment.therapists === 1 ? '' : 's'}.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Smaller flourishes
// ─────────────────────────────────────────────────────────────────────────────

interface Flourish {
  key: number;
  icon: string;
  title: string;
  sub: string;
  color: string;
}

const FLOURISH_MS = 1900;

function FlourishStack({ items, onExpire }: { items: Flourish[]; onExpire: () => void }) {
  useEffect(() => {
    if (!items.length) return;
    const id = window.setTimeout(onExpire, FLOURISH_MS);
    return () => window.clearTimeout(id);
  }, [items, onExpire]);

  if (!items.length) return null;

  return (
    <div
      aria-hidden
      className="juice-only fixed inset-x-0 bottom-[78px] z-[54] pointer-events-none flex flex-col items-center gap-1.5"
    >
      {items.map((f) => (
        <div
          key={f.key}
          className="card-warm pop-in flex items-center gap-2.5 px-3.5 py-2"
          style={{ borderColor: `color-mix(in oklab, ${f.color} 44%, transparent)` }}
        >
          <span
            className="grid place-items-center w-8 h-8 rounded-full text-[1rem] shrink-0"
            style={{
              background: `color-mix(in oklab, ${f.color} 22%, transparent)`,
              boxShadow: `0 0 22px -6px ${f.color}`,
            }}
          >
            {f.icon}
          </span>
          <span className="text-left">
            <span className="block display text-[0.92rem] leading-tight text-ink">{f.title}</span>
            <span className="block text-[0.7rem] text-ink-faint leading-snug">{f.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export function Celebrations() {
  const calm = useSim((s) => s.settings.calmMode);
  const reducedSetting = useSim((s) => s.settings.reducedMotion);
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedSetting || prefersReduced;
  const animate = !calm && !reduced;

  // The juice layer owns the global comfort flags: `.juice-only` and the motion
  // damper in theme.css both key off these two attributes. Idempotent, so the
  // settings panel writing the same values is harmless.
  useEffect(() => {
    document.documentElement.dataset.calm = String(calm);
  }, [calm]);
  useEffect(() => {
    document.documentElement.dataset.reduced = String(reduced);
  }, [reduced]);

  const [cures, setCures] = useState<AlumniRecord[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUpMoment | null>(null);
  const [flourishes, setFlourishes] = useState<Flourish[]>([]);

  // Bus handlers are registered once; read the live comfort flag from a ref so
  // toggling calm mode mid-run takes effect without re-subscribing.
  const animateRef = useRef(animate);
  useEffect(() => {
    animateRef.current = animate;
    if (!animate) {
      setCures([]);
      setLevelUp(null);
      setFlourishes([]);
    }
  }, [animate]);

  const keyRef = useRef(0);
  const nextKey = useCallback(() => {
    keyRef.current += 1;
    return keyRef.current;
  }, []);

  const pushFlourish = useCallback(
    (f: Omit<Flourish, 'key'>) => {
      if (!animateRef.current) return;
      setFlourishes((list) => [...list.slice(-1), { ...f, key: nextKey() }]);
    },
    [nextKey],
  );

  useEffect(() => {
    const offCure = bus.on('CLIENT_CURED', ({ alumni }) => {
      if (!animateRef.current) return;
      setCures((q) => (q.length >= 2 ? q : [...q, alumni]));
    });

    const offLevel = bus.on('PRACTICE_LEVELED', ({ level }) => {
      if (!animateRef.current) return;
      const s = getSim();
      setLevelUp({ key: nextKey(), level, clients: capacity(s), therapists: therapistSlots(s) });
    });

    const offTherapist = bus.on('THERAPIST_LEVELED', ({ therapistId, level }) => {
      const t = getSim().therapists.find((x) => x.id === therapistId);
      pushFlourish({
        icon: '✨',
        title: `${t?.name ?? 'Someone'} · level ${level}`,
        sub: 'A little more skill, a little more room in the tank.',
        color: 'var(--color-amber)',
      });
    });

    const offMilestone = bus.on('MILESTONE_EARNED', ({ milestoneId }) => {
      const m = milestoneById[milestoneId];
      pushFlourish({
        icon: m?.icon ?? '🏅',
        title: m?.name ?? 'Milestone',
        sub: m?.blurb ?? 'Written down, so you remember it on Thursday.',
        color: 'var(--color-amber-deep)',
      });
    });

    const offProgram = bus.on('PROGRAM_LAUNCHED', ({ programId }) => {
      const p = programById[programId];
      pushFlourish({
        icon: p?.icon ?? '🌱',
        title: `${p?.name ?? 'A new program'} is open`,
        sub: p?.blurb ?? 'Give it a few weeks to find its feet.',
        color: p?.color ?? 'var(--color-sage)',
      });
    });

    return () => {
      offCure();
      offLevel();
      offTherapist();
      offMilestone();
      offProgram();
    };
  }, [nextKey, pushFlourish]);

  const dropCure = useCallback(() => setCures((q) => q.slice(1)), []);
  const dropLevelUp = useCallback(() => setLevelUp(null), []);
  const dropFlourish = useCallback(() => setFlourishes((f) => f.slice(1)), []);

  return (
    <>
      {animate ? <style>{KEYFRAMES}</style> : null}
      <ToastStack animate={animate} />
      {animate && cures.length ? <CureCeremony alumni={cures[0]} onDone={dropCure} /> : null}
      {animate && levelUp ? <LevelUpGlow moment={levelUp} onDone={dropLevelUp} /> : null}
      {animate ? <FlourishStack items={flourishes} onExpire={dropFlourish} /> : null}
    </>
  );
}

/** Two petal keyframes and one ring. Mounted only when the juice is on. */
const KEYFRAMES = `
@keyframes tt-petal-fall {
  0%   { transform: translate3d(0, -14vh, 0); opacity: 0; }
  8%   { opacity: 1; }
  84%  { opacity: 1; }
  100% { transform: translate3d(0, 112vh, 0); opacity: 0; }
}
@keyframes tt-petal-flutter {
  from { transform: translateX(-14px) rotate(-38deg); }
  to   { transform: translateX(14px) rotate(44deg); }
}
@keyframes tt-ring-out {
  from { transform: translate(-50%, -50%) scale(0.12); opacity: 0.8; }
  to   { transform: translate(-50%, -50%) scale(3.4); opacity: 0; }
}
`;
