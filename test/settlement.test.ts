import { describe, expect, it } from 'vitest';
import { applyPayments, settle } from '../src/core/settlement';

/** Independent reference: minimum payments = people - max number of disjoint zero-sum groups. */
function maxZeroGroups(vals: number[]): number {
  if (vals.length === 0) return 0;
  const [first, ...rest] = vals as [number, ...number[]];
  let best = 0;
  const n = rest.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let s = first;
    const others: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) s += rest[i] as number;
      else others.push(rest[i] as number);
    }
    if (s === 0) best = Math.max(best, 1 + maxZeroGroups(others));
  }
  return best;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('settle', () => {
  it('settles the canonical Pusoy Dos case with the expected three payments', () => {
    const net = { A: -250, B: -450, C: 550, D: 150 };
    expect(settle(net)).toEqual([
      { from: 'B', to: 'C', amount: 450 },
      { from: 'A', to: 'D', amount: 150 },
      { from: 'A', to: 'C', amount: 100 },
    ]);
  });

  it('returns nothing when everyone is square', () => {
    expect(settle({ A: 0, B: 0 })).toEqual([]);
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => settle({ A: 10, B: -5 })).toThrow(/sum to zero/);
  });

  it('rejects non-integers', () => {
    expect(() => settle({ A: 0.5, B: -0.5 })).toThrow(/safe integer/);
  });

  it('beats a naive greedy pass by splitting into zero-sum groups', () => {
    // {3,4,-7} and {5,-5} are separate groups: 3 payments, a global greedy needs 4.
    const net = { A: 3, B: 4, C: 5, D: -7, E: -5 };
    expect(settle(net)).toHaveLength(3);
  });

  it('matches a brute-force minimum and always reproduces the nets (random, 2 to 8 players)', () => {
    const rand = rng(12345);
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(rand() * 7);
      const vals: number[] = [];
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const v = Math.floor(rand() * 41) - 20;
        vals.push(v);
        sum += v;
      }
      vals.push(0 - sum);
      const net = Object.fromEntries(vals.map((v, i) => [`P${i}`, v]));
      const payments = settle(net);

      const owed = Object.fromEntries(Object.entries(net).map(([k, v]) => [k, v]));
      const applied = applyPayments(payments);
      for (const [id, v] of Object.entries(owed)) {
        // a payer's balance is negative: paying amount brings them to zero
        expect(0 - (applied[id] ?? 0)).toBe(v);
      }
      expect(payments.every((p) => p.amount > 0 && p.from !== p.to)).toBe(true);

      const nonzero = vals.filter((v) => v !== 0);
      expect(payments.length).toBe(nonzero.length - maxZeroGroups(nonzero));
    }
  });

  it('is deterministic regardless of key order', () => {
    const a = settle({ A: -250, B: -450, C: 550, D: 150 });
    const b = settle({ D: 150, C: 550, B: -450, A: -250 });
    expect(a).toEqual(b);
  });

  it('still produces a valid settlement above the exact-search limit', () => {
    const net: Record<string, number> = {};
    let sum = 0;
    for (let i = 0; i < 20; i++) {
      const v = (i % 2 === 0 ? 1 : -1) * (i + 1);
      net[`P${String(i).padStart(2, '0')}`] = v;
      sum += v;
    }
    net['P19'] = (net['P19'] as number) - sum;
    const payments = settle(net);
    const applied = applyPayments(payments);
    for (const [id, v] of Object.entries(net)) expect(0 - (applied[id] ?? 0)).toBe(v);
  });
});

describe('settle with large amounts', () => {
  const big = 2 ** 32;
  it('keeps exact subset sums beyond 32 bits (finds the 4-payment optimum)', () => {
    const net = {
      a: -8 * big,
      b: -7 * big,
      c: -5 * big,
      d: 10 * big,
      e: 8 * big,
      f: 2 * big,
    };
    expect(settle(net)).toHaveLength(4);
  });

  it('rejects amounts above the supported maximum instead of losing precision', () => {
    expect(() => settle({ a: Number.MAX_SAFE_INTEGER, b: -Number.MAX_SAFE_INTEGER })).toThrow(
      /between/,
    );
  });
});
