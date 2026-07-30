import type { RngState } from './types';

/**
 * sfc32 — small, fast, high-quality 32-bit PRNG with a fully serialisable
 * 4-word state. Serialisability is the point: saves and the balance harness
 * both need to resume an identical stream.
 */
export class Rng {
  private s: RngState;

  constructor(state: RngState) {
    this.s = { ...state };
  }

  static fromSeed(seed: number): Rng {
    // Scramble the seed into four words via splitmix32.
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    const rng = new Rng({ a: next(), b: next(), c: next(), d: next() });
    // Warm up so nearby seeds diverge immediately.
    for (let i = 0; i < 12; i++) rng.next();
    return rng;
  }

  get state(): RngState {
    return { ...this.s };
  }

  set state(v: RngState) {
    this.s = { ...v };
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const s = this.s;
    const t = (s.a + s.b) | 0;
    s.a = s.b ^ (s.b >>> 9);
    s.b = (s.c + (s.c << 3)) | 0;
    s.c = (s.c << 21) | (s.c >>> 11);
    s.d = (s.d + 1) | 0;
    const t2 = (t + s.d) | 0;
    s.c = (s.c + t2) | 0;
    return (t2 >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick. Items with weight <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const it of items) {
      const w = weight(it);
      if (w > 0) total += w;
    }
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      const w = weight(it);
      if (w <= 0) continue;
      r -= w;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Approximately normal via sum of three uniforms; clamped to ±1 then scaled. */
  normal(mean: number, sd: number): number {
    const u = (this.next() + this.next() + this.next()) / 3;
    return mean + (u - 0.5) * 3.4641 * sd;
  }

  /** Deterministic sub-stream, so one system's draws don't shift another's. */
  fork(tag: number): Rng {
    return Rng.fromSeed((this.s.a ^ (tag * 0x9e3779b9)) >>> 0);
  }
}

/** Stable non-cryptographic id generator driven by the sim rng. */
export function makeId(rng: Rng, prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[rng.int(0, chars.length - 1)];
  return `${prefix}_${out}`;
}
