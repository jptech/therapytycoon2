import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeAnchored } from './anchor';
import { setPanelWidth } from './dock';

/** Shared building blocks. Every panel is assembled from these so the game
 *  reads as one designed object rather than a pile of screens. */

// ─────────────────────────────────────────────────────────────────────────────
// The craft sheet
//
// Depth work that has to be CSS rather than inline style: pseudo-free paper
// grain, layered shadows, hover/press choreography, keyframes. It lives here
// instead of theme.css so the token file stays a token file — and every rule
// that touches an existing class is written `html .x` so it wins on specificity
// regardless of stylesheet order (Vite injects CSS at different points in dev
// and prod).
//
// One shadow language, three depths. One rim light. One grain tile, rasterised
// once by the browser and tiled — no per-element filters, nothing per-frame.
// ─────────────────────────────────────────────────────────────────────────────

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.86' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)' opacity='0.085'/%3E%3C/svg%3E\")";

const CRAFT_CSS = `
:root {
  --tt-grain: ${GRAIN};

  /* Three depths, used everywhere. 1 = resting on the page, 2 = lifted,
     3 = floating over the room. Each is a contact shadow plus a soft cast. */
  --tt-shadow-1:
    0 1px 1px -1px rgba(24, 46, 46, 0.26),
    0 3px 8px -5px rgba(24, 46, 46, 0.22);
  --tt-shadow-2:
    0 2px 3px -2px rgba(24, 46, 46, 0.24),
    0 9px 20px -11px rgba(24, 46, 46, 0.36),
    0 20px 34px -24px rgba(24, 46, 46, 0.3);
  --tt-shadow-3:
    0 2px 4px -2px rgba(24, 46, 46, 0.22),
    0 14px 26px -14px rgba(24, 46, 46, 0.34),
    0 40px 70px -34px rgba(24, 46, 46, 0.46);

  /* Warm rim light along the top edge — the lamp is above and to the left. */
  --tt-rim: inset 0 1px 0 rgba(255, 252, 244, 0.82), inset 1px 0 0 rgba(255, 252, 244, 0.34);
  --tt-rim-soft: inset 0 1px 0 rgba(255, 252, 244, 0.6);

  --tt-radius-sub: 10px;
  --tt-radius-xs: 7px;
}

/* ── Materials ───────────────────────────────────────────────────────────── */

/* Paper with tooth: a fibre tile multiplied over the lamp wash, warmer at the
   bottom where the light falls away. */
html .paper {
  background-color: var(--color-paper);
  background-image:
    var(--tt-grain),
    radial-gradient(120% 100% at 22% -6%, color-mix(in oklab, var(--color-amber-glow) 30%, transparent), transparent 60%),
    linear-gradient(180deg, #fffdf8 0%, var(--color-paper) 44%, color-mix(in oklab, var(--color-paper-warm) 62%, var(--color-paper)) 100%);
  background-size: 160px 160px, auto, auto;
  background-blend-mode: multiply, normal, normal;
  border: 1px solid color-mix(in oklab, var(--color-ink) 14%, transparent);
  border-top-color: color-mix(in oklab, var(--color-ink) 8%, transparent);
  border-bottom-color: color-mix(in oklab, var(--color-ink) 20%, transparent);
  box-shadow: var(--tt-rim), var(--tt-shadow-3);
}

html .paper-flat {
  background-color: var(--color-paper);
  background-image: var(--tt-grain);
  background-size: 160px 160px;
  background-blend-mode: multiply;
  border: 1px solid color-mix(in oklab, var(--color-ink) 12%, transparent);
  box-shadow: var(--tt-rim-soft), inset 0 -1px 0 color-mix(in oklab, var(--color-ink) 7%, transparent);
}

html .card-warm {
  background-color: var(--color-paper);
  background-image:
    var(--tt-grain),
    linear-gradient(180deg, #fffdf8 0%, var(--color-paper) 50%, var(--color-paper-warm) 100%);
  background-size: 160px 160px, auto;
  background-blend-mode: multiply, normal;
  border: 1px solid color-mix(in oklab, var(--color-ink) 12%, transparent);
  border-top-color: color-mix(in oklab, var(--color-ink) 7%, transparent);
  border-bottom-color: color-mix(in oklab, var(--color-ink) 18%, transparent);
  box-shadow: var(--tt-rim-soft), var(--tt-shadow-1);
}

/* Card stock cut by hand — the radii are a hair uneven on purpose. */
html .tt-hand {
  border-radius: 13px 16px 13px 15px / 15px 13px 16px 13px;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

html .btn {
  position: relative;
  transition:
    transform 0.14s var(--ease-warm),
    box-shadow 0.18s var(--ease-warm),
    filter 0.18s var(--ease-warm),
    background-color 0.18s var(--ease-warm);
}
html .btn:active:not(:disabled) {
  transform: translateY(2px) scale(0.982);
  filter: brightness(0.965) saturate(1.03);
  transition-duration: 0.05s;
}
/* Disabled reads as inert paper, not as a faded live control. */
html .btn:disabled {
  opacity: 1;
  background: color-mix(in oklab, var(--color-ink) 5%, transparent);
  background-image: none;
  color: color-mix(in oklab, var(--color-ink) 46%, transparent);
  border-color: color-mix(in oklab, var(--color-ink) 11%, transparent);
  box-shadow: none;
  text-shadow: none;
  filter: none;
}

html .btn-primary {
  box-shadow:
    inset 0 1px 0 rgba(255, 246, 226, 0.55),
    0 1px 1px rgba(92, 56, 12, 0.22),
    0 8px 18px -10px rgba(178, 118, 44, 0.9);
  text-shadow: 0 1px 0 rgba(255, 240, 214, 0.28);
}
html .btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05) saturate(1.04);
  box-shadow:
    inset 0 1px 0 rgba(255, 246, 226, 0.62),
    0 2px 3px rgba(92, 56, 12, 0.2),
    0 14px 26px -11px rgba(178, 118, 44, 0.95);
}
html .btn-primary:active:not(:disabled) {
  box-shadow:
    inset 0 2px 4px rgba(92, 56, 12, 0.34),
    0 1px 2px rgba(92, 56, 12, 0.2);
}

html .btn-ghost {
  box-shadow: var(--tt-rim-soft), var(--tt-shadow-1);
}
html .btn-ghost:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--tt-rim-soft), var(--tt-shadow-2);
}
html .btn-ghost:active:not(:disabled) {
  box-shadow: inset 0 2px 4px color-mix(in oklab, var(--color-ink) 16%, transparent);
}

html .btn-sage,
html .btn-plum,
html .btn-brick {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), var(--tt-shadow-1);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
}
html .btn-sage:hover:not(:disabled),
html .btn-plum:hover:not(:disabled),
html .btn-brick:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32), var(--tt-shadow-2);
}

html .chip {
  box-shadow: inset 0 1px 0 rgba(255, 253, 246, 0.5);
}

/* ── Meters: the fill sits *in* the track ────────────────────────────────── */

.tt-track {
  box-shadow:
    inset 0 1px 2px color-mix(in oklab, var(--color-ink) 22%, transparent),
    inset 0 -1px 0 rgba(255, 253, 246, 0.55);
}
.tt-fill {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    inset 0 -1px 2px rgba(24, 46, 46, 0.14);
}

/* ── Elevation helpers ───────────────────────────────────────────────────── */

.tt-lift-1 { box-shadow: var(--tt-rim-soft), var(--tt-shadow-1); }
.tt-lift-2 { box-shadow: var(--tt-rim-soft), var(--tt-shadow-2); }
.tt-pressable { transition: transform 0.14s var(--ease-warm), box-shadow 0.18s var(--ease-warm); }
.tt-pressable:hover { transform: translateY(-1px); box-shadow: var(--tt-rim-soft), var(--tt-shadow-2); }
.tt-pressable:active { transform: translateY(1px) scale(0.99); box-shadow: inset 0 2px 4px color-mix(in oklab, var(--color-ink) 14%, transparent); transition-duration: 0.05s; }

/* ── The scrim: the room, dimmed and warmed, not merely blurred ──────────── */

.tt-scrim {
  background:
    radial-gradient(72% 58% at 50% 42%, color-mix(in oklab, var(--color-amber) 17%, transparent) 0%, transparent 70%),
    radial-gradient(128% 118% at 50% 46%,
      color-mix(in oklab, var(--color-night) 44%, transparent) 0%,
      color-mix(in oklab, var(--color-night) 84%, transparent) 100%);
  backdrop-filter: blur(5px) saturate(1.14) sepia(0.16) brightness(0.84);
  -webkit-backdrop-filter: blur(5px) saturate(1.14) sepia(0.16) brightness(0.84);
  animation: tt-scrim-in 0.32s var(--ease-warm) both;
}

/* ── Entrances ───────────────────────────────────────────────────────────── */

@keyframes tt-scrim-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes tt-modal-in {
  0%   { opacity: 0; transform: translateY(16px) scale(0.962); }
  58%  { opacity: 1; transform: translateY(-3px) scale(1.005); }
  100% { opacity: 1; transform: none; }
}
@keyframes tt-panel-in {
  0%   { opacity: 0; transform: translateX(26px) scale(0.994); }
  70%  { opacity: 1; transform: translateX(-3px) scale(1.001); }
  100% { opacity: 1; transform: none; }
}
/* Rise and settle — it comes up from below and takes a breath at the top. */
@keyframes tt-rise-settle {
  0%   { opacity: 0; transform: translateY(26px) scale(0.972); }
  56%  { opacity: 1; transform: translateY(-5px) scale(1.006); }
  78%  { transform: translateY(1px) scale(0.999); }
  100% { opacity: 1; transform: none; }
}
@keyframes tt-deal-in {
  0%   { opacity: 0; transform: translateY(14px) rotate(var(--tt-tilt, 0deg)) scale(0.965); }
  100% { opacity: 1; transform: none; }
}
@keyframes tt-tip-in {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: none; }
}

.tt-modal-in { animation: tt-modal-in 0.42s var(--ease-warm) both; }
.tt-panel-in { animation: tt-panel-in 0.38s var(--ease-warm) both; }
.tt-rise-settle { animation: tt-rise-settle 0.56s var(--ease-warm) both; }
.tt-deal { animation: tt-deal-in 0.4s var(--ease-warm) both; }

/* ── Technique cards: the deck in the session overlay ───────────────────── */

.tt-card {
  transition:
    transform 0.22s var(--ease-warm),
    box-shadow 0.22s var(--ease-warm),
    filter 0.24s var(--ease-warm),
    opacity 0.24s var(--ease-warm);
}
.tt-card-lift:hover {
  transform: translateY(-4px) rotate(var(--tt-tilt, -0.5deg));
  box-shadow: var(--tt-rim-soft), var(--tt-shadow-2), 0 28px 46px -28px rgba(24, 46, 46, 0.55);
}
.tt-card-lift:active {
  transform: translateY(-1px) scale(0.986) rotate(0deg);
  transition-duration: 0.06s;
  box-shadow:
    inset 0 2px 7px color-mix(in oklab, var(--color-ink) 14%, transparent),
    0 1px 1px rgba(24, 46, 46, 0.2);
}
/* The beat between choosing and the room moving on. */
.tt-card-chosen,
.tt-card-lift.tt-card-chosen:hover {
  transform: translateY(-7px) scale(1.028) rotate(0deg);
  box-shadow:
    0 0 0 2px var(--color-amber),
    0 0 34px -6px color-mix(in oklab, var(--color-amber) 80%, transparent),
    var(--tt-shadow-3);
  z-index: 3;
}
.tt-card-faded {
  opacity: 0.28;
  filter: saturate(0.45);
  transform: scale(0.978);
}

/* Calm mode and reduced motion keep the lighting change and drop the movement.
   Not a duration override — the transform itself is what has to go. */
html[data-calm='true'] .tt-card-lift:hover,
html[data-reduced='true'] .tt-card-lift:hover,
html[data-calm='true'] .btn:hover:not(:disabled),
html[data-reduced='true'] .btn:hover:not(:disabled),
html[data-calm='true'] .tt-pressable:hover,
html[data-reduced='true'] .tt-pressable:hover {
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  html .tt-card-lift:hover,
  html .btn:hover:not(:disabled),
  html .tt-pressable:hover {
    transform: none;
  }
}

/* A breakthrough should genuinely glow. Everything else stays quiet. */
@keyframes tt-pill-breathe {
  0%, 100% { filter: drop-shadow(0 0 4px color-mix(in oklab, var(--color-amber) 42%, transparent)); }
  50%      { filter: drop-shadow(0 0 12px color-mix(in oklab, var(--color-amber) 80%, transparent)) brightness(1.04); }
}
.tt-pill-glow { animation: tt-pill-breathe 3.4s ease-in-out infinite; }

/* The lamp hangs above the session card. */
.tt-session-head {
  background:
    radial-gradient(78% 130% at 50% -34%, color-mix(in oklab, var(--color-amber-glow) 46%, transparent) 0%, transparent 72%);
}

/* ── Tooltip ─────────────────────────────────────────────────────────────── */

.tt-tip {
  background-color: var(--color-paper);
  background-image: var(--tt-grain);
  background-size: 160px 160px;
  background-blend-mode: multiply;
  border: 1px solid color-mix(in oklab, var(--color-ink) 16%, transparent);
  border-radius: var(--tt-radius-sub);
  box-shadow: var(--tt-rim-soft), var(--tt-shadow-2);
  animation: tt-tip-in 0.14s var(--ease-warm) both;
}
`;

if (typeof document !== 'undefined' && !document.getElementById('tt-craft')) {
  const el = document.createElement('style');
  el.id = 'tt-craft';
  el.textContent = CRAFT_CSS;
  document.head.appendChild(el);
}

export function Button({
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'sage' | 'plum' | 'brick';
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = {
    sm: 'text-[0.72rem] px-2.5 py-1',
    md: '',
    lg: 'text-[0.95rem] px-5 py-2.5',
  };
  return (
    <button className={`btn btn-${variant} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  children,
  color,
  title,
  className = '',
}: {
  children: ReactNode;
  color?: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={`chip ${className}`}
      title={title}
      style={
        color
          ? {
              background: `color-mix(in oklab, ${color} 18%, transparent)`,
              borderColor: `color-mix(in oklab, ${color} 42%, transparent)`,
              color: `color-mix(in oklab, ${color} 78%, #1E3A3A)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function Meter({
  value,
  max = 1,
  color = 'var(--color-sage)',
  height = 7,
  label,
  right,
  className = '',
  ghost,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  label?: ReactNode;
  right?: ReactNode;
  className?: string;
  /** A faded second bar showing a forecast/target. */
  ghost?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const ghostPct = ghost !== undefined ? Math.max(0, Math.min(1, ghost / max)) * 100 : undefined;
  return (
    <div className={className}>
      {(label || right) && (
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[0.68rem] font-bold uppercase tracking-wide text-ink-faint">{label}</span>
          <span className="tabular text-[0.72rem] text-ink-soft">{right}</span>
        </div>
      )}
      <div
        className="tt-track w-full rounded-full overflow-hidden relative"
        style={{ height, background: 'color-mix(in oklab, var(--color-ink) 13%, transparent)' }}
      >
        {ghostPct !== undefined && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${ghostPct}%`, background: color, opacity: 0.26 }}
          />
        )}
        <div
          className="tt-fill absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} 72%, white) 0%, ${color} 62%, color-mix(in oklab, ${color} 84%, black) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  onClick,
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'amber';
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const toneColor = {
    neutral: 'var(--color-ink)',
    good: 'var(--color-sage-deep)',
    bad: 'var(--color-brick)',
    amber: 'var(--color-amber-deep)',
  }[tone];
  const Cmp = onClick ? 'button' : 'div';
  return (
    <Cmp
      onClick={onClick}
      title={title}
      className={`card-warm px-3 py-2 text-left ${onClick ? 'tt-pressable' : ''}`}
    >
      <div className="flex items-center gap-1.5 text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
        {icon}
        {label}
      </div>
      <div
        className="display text-[1.35rem] leading-tight tabular"
        style={{ color: toneColor, textShadow: '0 1px 0 rgba(255,253,246,0.8)' }}
      >
        {value}
      </div>
      {sub ? <div className="text-[0.68rem] text-ink-faint leading-tight">{sub}</div> : null}
    </Cmp>
  );
}

export function SectionHeading({
  children,
  right,
  sub,
}: {
  children: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-2">
      <div>
        <h3 className="display text-[1.02rem] text-ink">{children}</h3>
        {sub ? <p className="text-[0.72rem] text-ink-faint leading-snug">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 opacity-80">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="display text-[0.98rem] text-ink">{title}</div>
      {body ? <div className="text-[0.78rem] text-ink-faint max-w-[34ch] mt-1">{body}</div> : null}
    </div>
  );
}

/** A tiny inline trend line for the finance and quarterly review panels. */
export function Sparkline({
  data,
  width = 120,
  height = 30,
  color = 'var(--color-sage-deep)',
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 3) - 1.5;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      {fill && (
        <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={color} opacity="0.14" />
      )}
      <path d={d} stroke={color} strokeWidth="1.7" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}

/** Circular progress used for live sessions and campaign stages. */
export function ProgressRing({
  value,
  size = 34,
  stroke = 3.5,
  color = 'var(--color-amber)',
  track = 'color-mix(in oklab, var(--color-ink) 14%, transparent)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {/* the track's own shadow, so the arc reads as sitting in a groove */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(24,46,46,0.14)"
          strokeWidth={stroke * 0.5}
          fill="none"
          transform={`translate(0 ${stroke * 0.22})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.4s var(--ease-warm)',
            filter: v > 0.02 ? `drop-shadow(0 0 ${stroke * 0.9}px color-mix(in oklab, ${color} 55%, transparent))` : undefined,
          }}
        />
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}

/**
 * Hover card used everywhere for "why is this number what it is".
 *
 * Rendered into a portal on `document.body` rather than beside its trigger. The
 * HUD strip clips its overflow *and* establishes a stacking context via
 * `backdrop-filter`, so an absolutely-positioned tooltip inside it was both cut
 * off and trapped below the scene. A portal escapes any ancestor's clip,
 * transform, filter or z-index, which is the only reliable way to do this.
 */
export function Tooltip({
  children,
  content,
  side = 'top',
}: {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);

  const show = () => {
    const el = ref.current;
    if (el) setRect(el.getBoundingClientRect());
    setOpen(true);
  };
  const hide = () => setOpen(false);

  // A tooltip anchored to a stale rect is worse than none, so close on any
  // scroll or resize rather than trying to track the trigger.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);

  // Placement needs the tooltip's own size, so it is measured after mount and
  // positioned on the next layout pass — rendered invisible until then, so it
  // never flashes at the wrong spot. placeAnchored flips it to the opposite side
  // when the preferred one has no room, then clamps it inside the viewport; a
  // control near the right edge of the HUD would otherwise hang off the page.
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !rect) {
      setCoords(null);
      return;
    }
    const el = tipRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setCoords(
      placeAnchored(
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        { width: box.width, height: box.height },
        side,
        { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight },
      ),
    );
  }, [open, rect, side, content]);

  return (
    <>
      <span
        ref={ref}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && rect && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              style={{
                position: 'fixed',
                zIndex: 90,
                left: coords ? coords.left : 0,
                top: coords ? coords.top : 0,
                visibility: coords ? 'visible' : 'hidden',
                maxWidth: 'min(32ch, calc(100vw - 1rem))',
              }}
              className="tt-tip pointer-events-none w-max px-2.5 py-1.5 text-[0.72rem] leading-[1.45] text-ink-soft"
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

/** Number that rolls to its new value — small juice, used on cash and rep. */
export function RollingNumber({
  value,
  format = (v: number) => Math.round(v).toString(),
  className = '',
  duration = 480,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const start = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (value === display) return;
    from.current = display;
    start.current = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start.current) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from.current + (value - from.current) * eased);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}

/** Slide-over panel shell. Panels sit on top of the office scene, never replace it. */
export function PanelShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  icon,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A modal sitting on top of the panel owns Escape. Without this, one press
      // dismissed the decision *and* the panel underneath it, which reads as the
      // game losing your place.
      if (document.querySelector('[role="dialog"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Panels are opened from the keyboard as well as the rail, so the panel takes
  // focus when it arrives: Tab then walks its contents instead of resuming
  // somewhere behind it, and a screen reader follows the move.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  // Publish the room this panel is taking so the day cards can dock beside it
  // rather than fight it for the middle of the screen. Measured rather than
  // looked up in a table of widths — see src/ui/dock.ts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `offsetLeft`, not `getBoundingClientRect` — the panel is mid slide-in
    // animation on the first measurement and a transform would report it as
    // wider than it is about to be.
    const publish = () => setPanelWidth(window.innerWidth - el.offsetLeft);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      setPanelWidth(0);
    };
  }, []);

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={title}
      className={`tt-panel-in absolute right-3 bottom-3 top-[calc(var(--hud-h)+0.5rem)] z-30 flex flex-col paper overflow-hidden outline-none ${
        wide ? 'w-[min(760px,calc(100%-1.5rem))]' : 'w-[min(460px,calc(100%-1.5rem))]'
      }`}
    >
      <header
        className="relative flex items-start gap-3 px-4 pt-3.5 pb-3 shrink-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--color-amber-glow) 20%, transparent) 0%, transparent 100%)',
        }}
      >
        {icon ? <div className="text-xl leading-none mt-0.5">{icon}</div> : null}
        <div className="flex-1 min-w-0">
          <h2 className="display text-[1.15rem] leading-tight text-ink">{title}</h2>
          {subtitle ? <p className="text-[0.75rem] text-ink-faint leading-snug mt-0.5">{subtitle}</p> : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-ink-faint hover:bg-[color-mix(in_oklab,var(--color-ink)_10%,transparent)] hover:text-ink transition"
        >
          ✕
        </button>
        <EdgeRule />
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">{children}</div>
      {footer ? (
        <footer className="relative px-4 py-2.5 shrink-0">
          <EdgeRule top />
          {footer}
        </footer>
      ) : null}
    </aside>
  );
}

/**
 * An engraved rule: one ink hairline with a paper highlight beneath it, fading
 * out at both ends. Reads as a crease in the sheet rather than a CSS border.
 */
export function EdgeRule({ top = false }: { top?: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 ${top ? 'top-0' : 'bottom-0'} h-[2px]`}
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-ink) 15%, transparent) 8%, color-mix(in oklab, var(--color-ink) 15%, transparent) 92%, transparent 100%) top/100% 1px no-repeat,' +
          'linear-gradient(90deg, transparent 0%, rgba(255,253,246,0.85) 8%, rgba(255,253,246,0.85) 92%, transparent 100%) bottom/100% 1px no-repeat',
      }}
    />
  );
}

/** Centre-stage modal for events, reflections and ceremonies. */
export function Modal({
  children,
  onClose,
  width = 520,
  dismissable = true,
  labelledBy,
}: {
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  dismissable?: boolean;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!dismissable || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dismissable]);

  return (
    <div
      className="tt-scrim fixed inset-0 z-50 grid place-items-center p-4"
      onClick={dismissable && onClose ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="paper tt-modal-in w-full max-h-[92vh] overflow-y-auto"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const RULE_LEFT =
  'linear-gradient(90deg, color-mix(in oklab, var(--color-ink) 15%, transparent) 0%, color-mix(in oklab, var(--color-ink) 15%, transparent) 82%, transparent 100%)';
const RULE_RIGHT =
  'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-ink) 15%, transparent) 18%, color-mix(in oklab, var(--color-ink) 15%, transparent) 100%)';
const RULE_FULL =
  'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-ink) 15%, transparent) 5%, color-mix(in oklab, var(--color-ink) 15%, transparent) 95%, transparent 100%)';

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-3 h-px" style={{ background: RULE_FULL }} />;
  return (
    <div className="my-3.5 flex items-center gap-2.5">
      <div className="h-px flex-1" style={{ background: RULE_LEFT }} />
      <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.13em] text-ink-faint whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: RULE_RIGHT }} />
    </div>
  );
}

/** Small severity/at-risk indicator used on client rows. */
export function RiskDot({ level }: { level: 'none' | 'watch' | 'risk' }) {
  if (level === 'none') return null;
  const color = level === 'risk' ? 'var(--color-brick)' : 'var(--color-amber-deep)';
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{
        background: `radial-gradient(circle at 32% 28%, color-mix(in oklab, ${color} 45%, white) 0%, ${color} 62%, color-mix(in oklab, ${color} 78%, black) 100%)`,
        boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 20%, transparent), 0 1px 2px rgba(24,46,46,0.28)`,
      }}
      title={level === 'risk' ? 'At risk of dropping out' : 'Worth checking in on'}
    />
  );
}
