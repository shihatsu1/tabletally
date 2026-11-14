import { describe, expect, it } from 'vitest';
import { replay, type LedgerEvent } from '../src/core/ledger';
import { PRESETS, baseChips, tongIts as game, type TongItsInput, type TongItsSetup } from '../src/games/tong-its';

const P = ['A', 'B', 'C'];
const pagat = (over: Partial<TongItsSetup> = {}): TongItsSetup => ({ ...PRESETS.pagat, ...over });
const go = (over: Partial<TongItsSetup> = {}): TongItsSetup => ({ ...PRESETS['tongits-go'], ...over });
const sum = (n: Record<string, number>) => Object.values(n).reduce((a, b) => a + b, 0);
const run = (s: TongItsSetup, input: TongItsInput) => {
  expect(game.validate(s, P, input)).toEqual([]);
  return game.score(s, P, input) as Record<string, number>;
};

describe('Pagat preset (docs/rules/tong-its.md worked examples)', () => {
  it('1. ordinary win with 2 aces, B opened, C burned: A +7, B -3, C -4', () => {
    expect(run(pagat(), { winner: 'A', ending: 'normal', stake: 1, aces: 2, burned: ['C'] })).toEqual({ A: 7, B: -3, C: -4 });
  });

  it('2. Tong-its with one secret set, nobody burned, no aces: A +12, B -6, C -6', () => {
    expect(run(pagat(), { winner: 'A', ending: 'tongits', stake: 1, secrets: 1 })).toEqual({ A: 12, B: -6, C: -6 });
  });

  it('3. challenged Draw pays 3 each, and a burned loser pays 1 more', () => {
    expect(run(pagat(), { winner: 'B', ending: 'challenge', stake: 1, burned: ['C'] })).toEqual({ A: -3, B: 7, C: -4 });
  });

  it('3 as written: A wins a challenged Draw, B pays 3, C (burned) pays 4: A +7, B -3, C -4', () => {
    expect(run(pagat(), { winner: 'A', ending: 'challenge', stake: 1, burned: ['C'] })).toEqual({ A: 7, B: -3, C: -4 });
  });

  it('stake scales every chip', () => {
    expect(run(pagat(), { winner: 'A', ending: 'normal', stake: 50, aces: 2, burned: ['C'] })).toEqual({ A: 350, B: -150, C: -200 });
  });

  it('the variation "runs of 5+ earn 3 extra" and "2 chips instead of 3" are just option changes', () => {
    expect(run(pagat({ longRunChips: 3 }), { winner: 'A', ending: 'normal', stake: 1, longRuns: 1 })).toEqual({ A: 8, B: -4, C: -4 });
    expect(run(pagat({ tongitsChips: 2, secretChips: 2 }), { winner: 'A', ending: 'tongits', stake: 1, secrets: 1 })).toEqual({ A: 8, B: -4, C: -4 });
  });
});

describe('Tongits Go preset (multipliers are added)', () => {
  it('normal win is 1 each; Tongits is 1 + 1 = 2 each', () => {
    expect(run(go(), { winner: 'A', ending: 'normal', stake: 1 })).toEqual({ A: 2, B: -1, C: -1 });
    expect(run(go(), { winner: 'A', ending: 'tongits', stake: 1 })).toEqual({ A: 4, B: -2, C: -2 });
  });

  it('a won challenge is 1 + 2 = 3 each; secret melds add 2 each; sagasa adds 1; burned adds 1', () => {
    expect(baseChips(go(), 'challenge')).toBe(3);
    expect(run(go(), { winner: 'C', ending: 'challenge', stake: 1, secrets: 1, sagasa: 1, burned: ['A'] })).toEqual({ A: -7, B: -6, C: 13 });
  });

  it('aces are worth nothing in this preset', () => {
    expect(run(go(), { winner: 'A', ending: 'normal', stake: 1, aces: 4 })).toEqual({ A: 2, B: -1, C: -1 });
  });
});

describe('defaults', () => {
  it('start as Tongits Go style with a pot that is always on', () => {
    const d = game.defaultSetup(3);
    expect(d.preset).toBe('tongits-go');
    expect(d.potAnte).toBeGreaterThanOrEqual(1);
    expect(PRESETS.pagat.potAnte).toBeGreaterThanOrEqual(1);
    expect(game.validateSetup(d, 3)).toEqual([]);
  });
});

describe('pot', () => {
  it('each loser pays the ante for every deal in the pot, on top of the hand', () => {
    const s = pagat({ potAnte: 2 });
    expect(run(s, { winner: 'A', ending: 'normal', stake: 1, potDeals: 2 })).toEqual({ A: 10, B: -5, C: -5 });
  });

  it('is refused when the pot is off', () => {
    expect(game.validate(pagat({ potAnte: 0 }), P, { winner: 'A', ending: 'normal', stake: 1, potDeals: 1 })).toEqual(['the pot is switched off']);
  });
});

describe('validation', () => {
  const base: TongItsInput = { winner: 'A', ending: 'normal', stake: 5 };
  it('accepts a plain round and rejects bad fields', () => {
    expect(game.validate(pagat(), P, base)).toEqual([]);
    const bad: unknown[] = [
      { ...base, winner: 'Z' }, { ...base, ending: 'x' }, { ...base, stake: 0 }, { ...base, stake: 1.5 }, { ...base, stake: 10_000_001 },
      { ...base, burned: ['A'] }, { ...base, burned: ['B', 'B'] }, { ...base, burned: ['Z'] }, { ...base, burned: 'B' },
      { ...base, aces: 5 }, { ...base, aces: -1 }, { ...base, secrets: 14 }, { ...base, longRuns: 11 }, { ...base, sagasa: 14 }, { ...base, potDeals: 1501 },
      null, 5, [], { stake: {} },
    ];
    for (const b of bad) expect(game.validate(pagat({ potAnte: 2 }), P, b as TongItsInput).length, JSON.stringify(b)).toBeGreaterThan(0);
  });

  it('validateSetup accepts both presets and rejects bad options without throwing', () => {
    expect(game.validateSetup(PRESETS.pagat, 3)).toEqual([]);
    expect(game.validateSetup(PRESETS['tongits-go'], 3)).toEqual([]);
    for (const bad of [null, [], { ...PRESETS.pagat, potAnte: 0 }, { ...PRESETS.pagat, preset: 'x' }, { ...PRESETS.pagat, winChips: 0 }, { ...PRESETS.pagat, aceChips: 101 }, { ...PRESETS.pagat, tongitsMode: 'x' }, { ...PRESETS.pagat, potAnte: { toString: null } }, { ...PRESETS.pagat, burnedChips: 1.5 }]) {
      expect(() => game.validateSetup(bad, 3)).not.toThrow();
      expect(game.validateSetup(bad, 3).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('the biggest allowed round stays inside the amount limit', () => {
    const s: TongItsSetup = { ...PRESETS.pagat, preset: 'custom', winChips: 100, tongitsChips: 100, tongitsMode: 'add', burnedChips: 100, aceChips: 100, secretChips: 100, longRunChips: 100, sagasaChips: 100, potAnte: 100 };
    const input: TongItsInput = { winner: 'A', ending: 'tongits', stake: 10_000_000, aces: 4, secrets: 3, longRuns: 2, sagasa: 3, burned: ['B', 'C'], potDeals: 50 };
    expect(game.validate(s, P, input)).toEqual([]);
    const net = game.score(s, P, input);
    expect(Math.max(...Object.values(net).map(Math.abs))).toBeLessThanOrEqual(1_000_000_000_000);
    expect(sum(net)).toBe(0);
  });
});

describe('zero-sum and replay', () => {
  it('every random round is zero-sum, integer and never -0', () => {
    let seed = 99;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 400; i++) {
      const s = i % 2 ? go({ potAnte: Math.floor(rand() * 4) }) : pagat({ potAnte: Math.floor(rand() * 4) });
      const winner = P[Math.floor(rand() * 3)]!;
      const input: TongItsInput = {
        winner, ending: (['normal', 'tongits', 'challenge'] as const)[Math.floor(rand() * 3)]!, stake: 1 + Math.floor(rand() * 200),
        aces: Math.floor(rand() * 5), secrets: Math.floor(rand() * 4), burned: P.filter((p) => p !== winner && rand() < 0.5),
        potDeals: s.potAnte > 0 ? Math.floor(rand() * 4) : 0,
      };
      const net = run(s, input);
      expect(sum(net)).toBe(0);
      expect(Object.values(net).every((v) => Number.isSafeInteger(v) && !Object.is(v, -0))).toBe(true);
    }
  });

  it('works through the ledger with undo and keeps totals at zero', () => {
    const ev = (n: number, input: TongItsInput): LedgerEvent<TongItsInput> => ({ type: 'round.add', id: `r${n}`, at: n, by: 'h', input });
    const state = replay(game, pagat(), P, [
      ev(1, { winner: 'A', ending: 'normal', stake: 10, aces: 1 }),
      ev(2, { winner: 'B', ending: 'tongits', stake: 10 }),
      { type: 'round.undo', at: 3, by: 'h' },
    ]);
    expect(state.totals).toEqual({ A: 40, B: -20, C: -20 });
  });

  it('only three players are supported', () => {
    expect(game.playerCounts).toEqual([3]);
  });
});
