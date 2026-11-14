import { describe, expect, it } from 'vitest';
import { allocate, assertInt, convertZeroSum, sumInts } from '../src/core/integer';

describe('integer helpers', () => {
  it('rejects non-integers and unsafe numbers', () => {
    expect(() => assertInt(1.5)).toThrow();
    expect(() => assertInt(Number.MAX_SAFE_INTEGER + 2)).toThrow();
    expect(() => assertInt(NaN)).toThrow();
    expect(sumInts([1, 2, 3])).toBe(6);
  });

  it('allocate always sums exactly to the total', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(10, [50, 30, 20])).toEqual([5, 3, 2]);
    for (const total of [0, 1, 7, 99, 1001]) {
      const parts = allocate(total, [3, 5, 7, 11]);
      expect(sumInts(parts)).toBe(total);
    }
  });

  it('allocate rejects bad weights', () => {
    expect(() => allocate(10, [])).toThrow();
    expect(() => allocate(10, [0, 0])).toThrow();
    expect(() => allocate(10, [-1, 2])).toThrow();
  });

  it('convertZeroSum keeps a zero-sum input zero-sum when the ratio does not divide evenly', () => {
    // 3 chips = 1 money unit. 100 chips is not divisible by 3.
    const chips = [100, -40, -60];
    const money = convertZeroSum(chips, { chips: 3, moneyUnits: 1 });
    expect(sumInts(money)).toBe(0);
    // each result is within 1 unit of the exact value
    chips.forEach((c, i) => expect(Math.abs((money[i] as number) - c / 3)).toBeLessThan(1));
  });

  it('convertZeroSum is exact when the ratio divides evenly', () => {
    expect(convertZeroSum([800, -100, -700], { chips: 100, moneyUnits: 50 })).toEqual([
      400, -50, -350,
    ]);
  });

  it('convertZeroSum rejects input that is not zero-sum', () => {
    expect(() => convertZeroSum([10, -5], { chips: 1, moneyUnits: 1 })).toThrow();
  });
});

describe('amount bounds', () => {
  it('convertZeroSum rejects out-of-range amounts and ratios cleanly', () => {
    expect(() =>
      convertZeroSum([1, 1, 1, -1, -1, -1], { chips: 1, moneyUnits: Number.MAX_SAFE_INTEGER }),
    ).toThrow(/between/);
    expect(() => convertZeroSum([Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER], { chips: 1, moneyUnits: 1 })).toThrow(/between/);
  });

  it('convertZeroSum rejects a conversion whose result would exceed the maximum', () => {
    expect(() => convertZeroSum([1e12, -1e12], { chips: 1, moneyUnits: 1e12 })).toThrow(/exceeds/);
  });

  it('convertZeroSum handles the largest supported amounts exactly', () => {
    expect(convertZeroSum([1e12, -1e12], { chips: 1, moneyUnits: 1 })).toEqual([1e12, -1e12]);
  });
});
