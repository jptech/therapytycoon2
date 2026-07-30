import { describe, it, expect } from 'vitest';
import { Rng, makeId } from './rng';

/**
 * Determinism is load-bearing here: saves store the four-word rng state and
 * expect to resume the identical stream, and the balance harness compares runs
 * across seeds. If any of these break, replays and saves silently diverge.
 */
describe('Rng', () => {
  const draw = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

  describe('determinism', () => {
    it('produces an identical sequence for the same seed', () => {
      const a = draw(Rng.fromSeed(1234), 500);
      const b = draw(Rng.fromSeed(1234), 500);
      expect(a).toEqual(b);
    });

    it('diverges immediately for adjacent seeds', () => {
      const a = draw(Rng.fromSeed(1000), 5);
      const b = draw(Rng.fromSeed(1001), 5);
      for (let i = 0; i < a.length; i++) expect(a[i]).not.toBe(b[i]);
    });

    it('diverges across many seed pairs', () => {
      const firsts = new Set<number>();
      for (let seed = 0; seed < 400; seed++) firsts.add(Rng.fromSeed(seed).next());
      // No collisions at all in 400 adjacent seeds.
      expect(firsts.size).toBe(400);
    });

    it('resumes the exact same stream after serialising and restoring state', () => {
      const original = Rng.fromSeed(99);
      draw(original, 37);
      const saved = JSON.parse(JSON.stringify(original.state)) as typeof original.state;

      const expected = draw(original, 50);

      const restored = new Rng(saved);
      expect(draw(restored, 50)).toEqual(expected);
    });

    it('exposes state as a copy, so mutating it cannot corrupt the stream', () => {
      const rng = Rng.fromSeed(7);
      const snapshot = rng.state;
      snapshot.a = 0;
      snapshot.b = 0;
      const control = new Rng(rng.state);
      expect(rng.next()).toBe(control.next());
    });

    it('assigning state rewinds the stream', () => {
      const rng = Rng.fromSeed(31);
      const mark = rng.state;
      const first = draw(rng, 10);
      rng.state = mark;
      expect(draw(rng, 10)).toEqual(first);
    });

    it('fork gives a deterministic sub-stream that does not consume the parent', () => {
      const parent = Rng.fromSeed(4242);
      const parentState = parent.state;
      const forkA = draw(parent.fork(3), 20);
      expect(parent.state).toEqual(parentState);
      const forkB = draw(parent.fork(3), 20);
      expect(forkA).toEqual(forkB);
      expect(draw(parent.fork(4), 20)).not.toEqual(forkA);
    });
  });

  describe('next / range', () => {
    it('stays inside [0, 1) over 20k draws', () => {
      const rng = Rng.fromSeed(5);
      for (let i = 0; i < 20000; i++) {
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('range stays inside [min, max)', () => {
      const rng = Rng.fromSeed(6);
      for (let i = 0; i < 10000; i++) {
        const v = rng.range(-3, 11);
        expect(v).toBeGreaterThanOrEqual(-3);
        expect(v).toBeLessThan(11);
      }
    });
  });

  describe('int', () => {
    it('is inclusive on both ends and never out of range over 10k draws', () => {
      const rng = Rng.fromSeed(2024);
      const seen = new Set<number>();
      for (let i = 0; i < 10000; i++) {
        const v = rng.int(3, 7);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
        seen.add(v);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
    });

    it('handles a degenerate range', () => {
      const rng = Rng.fromSeed(8);
      for (let i = 0; i < 200; i++) expect(rng.int(4, 4)).toBe(4);
    });

    it('handles negative ranges inclusively', () => {
      const rng = Rng.fromSeed(9);
      const seen = new Set<number>();
      for (let i = 0; i < 5000; i++) seen.add(rng.int(-2, 1));
      expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1]);
    });
  });

  describe('chance', () => {
    it('chance(0) is never true', () => {
      const rng = Rng.fromSeed(11);
      for (let i = 0; i < 20000; i++) expect(rng.chance(0)).toBe(false);
    });

    it('chance(1) is always true', () => {
      const rng = Rng.fromSeed(12);
      for (let i = 0; i < 20000; i++) expect(rng.chance(1)).toBe(true);
    });

    it('chance(p) lands near p', () => {
      const rng = Rng.fromSeed(13);
      let hits = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) if (rng.chance(0.25)) hits++;
      expect(hits / n).toBeGreaterThan(0.22);
      expect(hits / n).toBeLessThan(0.28);
    });
  });

  describe('weighted', () => {
    interface Item {
      id: string;
      w: number;
    }
    const items: Item[] = [
      { id: 'a', w: 1 },
      { id: 'b', w: 3 },
      { id: 'zero', w: 0 },
      { id: 'negative', w: -5 },
      { id: 'c', w: 6 },
    ];

    it('never picks a zero-weight or negative-weight item', () => {
      const rng = Rng.fromSeed(14);
      for (let i = 0; i < 20000; i++) {
        const picked = rng.weighted(items, (x) => x.w);
        expect(picked).toBeDefined();
        expect(picked!.w).toBeGreaterThan(0);
      }
    });

    it('roughly respects the weights over 20k draws', () => {
      const rng = Rng.fromSeed(15);
      const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
      const n = 20000;
      for (let i = 0; i < n; i++) counts[rng.weighted(items, (x) => x.w)!.id] += 1;
      expect(counts.a / n).toBeCloseTo(0.1, 1);
      expect(counts.b / n).toBeCloseTo(0.3, 1);
      expect(counts.c / n).toBeCloseTo(0.6, 1);
      // Ordering must hold well inside sampling noise.
      expect(counts.c).toBeGreaterThan(counts.b);
      expect(counts.b).toBeGreaterThan(counts.a);
    });

    it('returns undefined when every weight is non-positive', () => {
      const rng = Rng.fromSeed(16);
      expect(rng.weighted([{ w: 0 }, { w: -1 }], (x) => x.w)).toBeUndefined();
      expect(rng.weighted([], () => 1)).toBeUndefined();
    });
  });

  describe('shuffle', () => {
    it('is a permutation — same multiset, same length', () => {
      const rng = Rng.fromSeed(17);
      for (let trial = 0; trial < 200; trial++) {
        const source = Array.from({ length: 24 }, (_, i) => i);
        const shuffled = rng.shuffle([...source]);
        expect(shuffled).toHaveLength(source.length);
        expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
      }
    });

    it('actually reorders at least sometimes', () => {
      const rng = Rng.fromSeed(18);
      let reordered = 0;
      for (let trial = 0; trial < 50; trial++) {
        const source = Array.from({ length: 12 }, (_, i) => i);
        if (rng.shuffle([...source]).some((v, i) => v !== source[i])) reordered++;
      }
      expect(reordered).toBeGreaterThan(45);
    });

    it('handles empty and single-element arrays', () => {
      const rng = Rng.fromSeed(19);
      expect(rng.shuffle([])).toEqual([]);
      expect(rng.shuffle(['only'])).toEqual(['only']);
    });
  });

  describe('pick', () => {
    it('returns the sole element of a one-element array', () => {
      const rng = Rng.fromSeed(20);
      for (let i = 0; i < 500; i++) expect(rng.pick(['solo'])).toBe('solo');
    });

    it('only ever returns members of the array', () => {
      const rng = Rng.fromSeed(21);
      const arr = ['a', 'b', 'c', 'd'];
      const seen = new Set<string>();
      for (let i = 0; i < 5000; i++) {
        const v = rng.pick(arr);
        expect(arr).toContain(v);
        seen.add(v);
      }
      expect(seen.size).toBe(arr.length);
    });
  });

  describe('normal', () => {
    it('centres on the mean and stays finite', () => {
      const rng = Rng.fromSeed(22);
      let total = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const v = rng.normal(0.5, 0.1);
        expect(Number.isFinite(v)).toBe(true);
        total += v;
      }
      expect(total / n).toBeCloseTo(0.5, 2);
    });
  });

  describe('makeId', () => {
    it('is deterministic for a given rng state and prefixed', () => {
      const a = makeId(Rng.fromSeed(77), 'c');
      const b = makeId(Rng.fromSeed(77), 'c');
      expect(a).toBe(b);
      expect(a.startsWith('c_')).toBe(true);
      expect(a).toMatch(/^c_[a-z0-9]{8}$/);
    });

    it('does not repeat itself within a stream', () => {
      const rng = Rng.fromSeed(78);
      const ids = new Set<string>();
      for (let i = 0; i < 2000; i++) ids.add(makeId(rng, 't'));
      expect(ids.size).toBe(2000);
    });
  });
});
