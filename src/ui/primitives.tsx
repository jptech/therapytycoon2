import { type ReactNode, useEffect, useRef, useState } from 'react';

/** Shared building blocks. Every panel is assembled from these so the game
 *  reads as one designed object rather than a pile of screens. */

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
        className="w-full rounded-full overflow-hidden relative"
        style={{ height, background: 'color-mix(in oklab, var(--color-ink) 11%, transparent)' }}
      >
        {ghostPct !== undefined && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${ghostPct}%`, background: color, opacity: 0.28 }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, color-mix(in oklab, ${color} 78%, white) 0%, ${color} 100%)`,
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
      className={`card-warm px-3 py-2 text-left ${onClick ? 'hover:brightness-[1.03] transition' : ''}`}
    >
      <div className="flex items-center gap-1.5 text-[0.63rem] font-extrabold uppercase tracking-[0.09em] text-ink-faint">
        {icon}
        {label}
      </div>
      <div className="display text-[1.35rem] leading-tight tabular" style={{ color: toneColor }}>
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
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
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
          style={{ transition: 'stroke-dashoffset 0.4s var(--ease-warm)' }}
        />
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}

/** Hover card used everywhere for "why is this number what it is". */
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
  const pos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[side];
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 ${pos} pointer-events-none w-max max-w-[30ch] paper-flat px-2.5 py-1.5 text-[0.72rem] leading-snug shadow-lg fade-in`}
        >
          {content}
        </span>
      )}
    </span>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      className={`panel-enter absolute right-3 top-3 bottom-3 z-30 flex flex-col paper overflow-hidden ${
        wide ? 'w-[min(760px,calc(100%-1.5rem))]' : 'w-[min(460px,calc(100%-1.5rem))]'
      }`}
    >
      <header className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b hairline shrink-0">
        {icon ? <div className="text-xl leading-none mt-0.5">{icon}</div> : null}
        <div className="flex-1 min-w-0">
          <h2 className="display text-[1.15rem] leading-tight text-ink">{title}</h2>
          {subtitle ? <p className="text-[0.75rem] text-ink-faint leading-snug mt-0.5">{subtitle}</p> : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-ink-faint hover:bg-[color-mix(in_oklab,var(--color-ink)_10%,transparent)] transition"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">{children}</div>
      {footer ? <footer className="border-t hairline px-4 py-2.5 shrink-0">{footer}</footer> : null}
    </aside>
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
      className="fixed inset-0 z-50 grid place-items-center p-4 fade-in"
      style={{ background: 'color-mix(in oklab, var(--color-night) 62%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={dismissable && onClose ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="paper pop-in w-full max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label)
    return <div className="my-3 h-px" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />;
  return (
    <div className="my-3 flex items-center gap-2">
      <div className="h-px flex-1" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />
      <span className="text-[0.63rem] font-extrabold uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <div className="h-px flex-1" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />
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
      style={{ background: color, boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)` }}
      title={level === 'risk' ? 'At risk of dropping out' : 'Worth checking in on'}
    />
  );
}
