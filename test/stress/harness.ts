import { expect } from 'vitest';
import { makeRng, type Rng } from '../../src/core/rng';
import type { BotLevel } from '../../src/core/play';

/** 1 = thousands of games per suite. STRESS_N=0.05 is a quick check, STRESS_N=10 a long soak. */
export const SCALE = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.STRESS_N ?? '1');
export const N = (base: number): number => Math.max(1, Math.round(base * SCALE));

export const LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];
export const pick = <T>(items: readonly T[], r: Rng): T => items[r() % items.length] as T;
export const randLevels = (n: number, r: Rng): BotLevel[] => Array.from({ length: n }, () => pick(LEVELS, r));
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
export const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);

export const roundTrip = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Collects failures (with the seed and context needed to replay them) so one run reports many, not just the first. */
export class Failures {
  readonly list: string[] = [];
  total = 0;
  add(msg: string): void {
    this.total++;
    if (this.list.length < 25) this.list.push(msg);
  }
  check(cond: boolean, msg: () => string): void {
    if (!cond) this.add(msg());
  }
  /** Run something that must not throw. */
  guard<T>(ctx: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (e) {
      this.add(`THROW in ${ctx}: ${(e as Error).message}\n${((e as Error).stack ?? '').split('\n').slice(1, 4).join('\n')}`);
      return undefined;
    }
  }
  done(label: string): void {
    // eslint-disable-next-line no-console
    console.log(`[stress] ${label}: ${this.total} failure(s)`);
    expect(this.list).toEqual([]);
  }
}

/** A stream of garbage "moves": wrong types, out-of-range numbers, prototype tricks, deep objects. */
export function garbage(r: Rng): unknown {
  const junk: unknown[] = [
    null, undefined, 0, -1, 1.5, NaN, Infinity, '', 'x', true, [], {}, [1, 2, 3], { t: 'nope' }, { t: 'play' }, { t: 'play', cards: 'abc' },
    { t: 'play', cards: [99] }, { t: 'play', cards: [-1, 2] }, { t: 'play', cards: [1, 1, 1] }, { t: 'set' }, { t: 'set', back: [], middle: [], front: [] },
    { t: 'raise' }, { t: 'raise', to: -5 }, { t: 'raise', to: 1e18 }, { t: 'raise', to: 'all' }, { t: 'raise', to: NaN }, { t: 'draw', from: 'moon' },
    { t: 'meld', cards: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }, { t: 'sapaw', meld: 'x', card: [] }, { t: 'discard' }, { t: 'respond' },
    { t: 'natural', key: '__proto__' }, { t: 'natural', key: 'constructor' }, JSON.parse('{"t":"play","cards":[999],"__proto__":{"x":1}}'),
    { t: 'folded', extra: { deep: { deeper: [1, 2, 3] } } }, { t: { toString: 1 } }, Object.create(null),
  ];
  return pick(junk, r);
}

export const seeded = (seed: number): Rng => makeRng(seed);
