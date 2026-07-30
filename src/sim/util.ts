export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Maps x through a smooth ease-out curve in 0..1. */
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 2;

/**
 * Scales a positive gain down as the value approaches its ceiling, so meters
 * asymptote rather than pin. Losses pass through unchanged — falling from 90 to
 * 60 should hurt at full strength.
 */
export function softGain(current: number, gain: number, max: number, falloff = 1.4): number {
  if (gain <= 0) return gain;
  const headroom = clamp01(1 - current / max);
  return gain * headroom ** falloff;
}

export function sum(arr: number[]): number {
  let t = 0;
  for (const v of arr) t += v;
  return t;
}

export function avg(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}

/** 8:00 → "8:00 AM"; minutes are measured from midnight. */
export function formatClock(minutesFromMidnight: number): string {
  const h24 = Math.floor(minutesFromMidnight / 60) % 24;
  const m = Math.floor(minutesFromMidnight % 60);
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatMoney(v: number, showSign = false): string {
  const sign = v < 0 ? '−' : showSign ? '+' : '';
  const n = Math.abs(Math.round(v));
  return `${sign}$${n.toLocaleString('en-US')}`;
}

export function formatDay(day: number): string {
  const week = Math.floor((day - 1) / 7) + 1;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(day - 1) % 7];
  return `${dow} · Week ${week}`;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function isWeekend(day: number): boolean {
  const i = (day - 1) % 7;
  return i === 5 || i === 6;
}

/** Title-case a snake or kebab id for fallback labels. */
export function titleize(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
