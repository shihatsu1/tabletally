import { describe, expect, it } from 'vitest';
import { replay, type LedgerEvent } from '../src/core/ledger';
import { settle } from '../src/core/settlement';
import {
  deuceMultiplier,
  penalty,
  setPlacementPoint,
  pusoyDos as game,
  TIER_PRESETS,
  type PusoyDosInput,
  type PusoyDosSetup,
} from '../src/games/pusoy-dos';

const P4 = ['A', 'B', 'C', 'D'];
const P3 = ['A', 'B', 'C'];
const P2 = ['A', 'B'];

function setup(over: Partial<PusoyDosSetup> = {}, n = 4): PusoyDosSetup {
  return { ...game.defaultSetup(n), scoringVersion: undefined, ...over };
}
const sum = (net: Record<string, number>) => Object.values(net).reduce((a, b) => a + b, 0);
const run = (s: PusoyDosSetup, players: string[], input: PusoyDosInput) => {
  const problems = game.validate(s, players, input);
  expect(problems).toEqual([]);
  return game.score(s, players, input) as Record<string, number>;
};

describe('winner-take-all', () => {
  it('worked example: 4 players, stake 50, A wins', () => {
    expect(run(setup(), P4, { winner: 'A', stake: 50 })).toEqual({ A: 150, B: -50, C: -50, D: -50 });
  });

  it('reproduces the canonical 15-round real game through the real module', () => {
    const rounds: [string, number][] = [
      ...['A', 'B', 'B', 'D', 'C'].map((w): [string, number] => [w, 50]),
      ...['D', 'D', 'B', 'C', 'B', 'C', 'A', 'D'].map((w): [string, number] => [w, 200]),
      ...['A', 'C'].map((w): [string, number] => [w, 300]),
    ];
    const events: LedgerEvent<PusoyDosInput>[] = rounds.map(([winner, stake], i) => ({
      type: 'round.add',
      id: `r${i + 1}`,
      at: i,
      by: 'host',
      input: { winner, stake },
    }));
    const state = replay(game, setup(), P4, events);
    expect(state.totals).toEqual({ A: -250, B: -450, C: 550, D: 150 });
    expect(settle(state.totals)).toEqual([
      { from: 'B', to: 'C', amount: 450 },
      { from: 'A', to: 'D', amount: 150 },
      { from: 'A', to: 'C', amount: 100 },
    ]);
  });

  it.each([[P2], [P3], [P4]])('is zero-sum with %j', (players) => {
    const net = run(setup({}, players.length), players, { winner: players[0], stake: 70 });
    expect(sum(net)).toBe(0);
    expect(net[players[0] as string]).toBe(70 * (players.length - 1));
  });
});

describe('deuce multiplier', () => {
  it('pow2: a pair of 2s in the final play is x4 (docs example: stake 50 pays 200 each, winner +600)', () => {
    const s = setup({ deuce: 'pow2' });
    expect(run(s, P4, { winner: 'A', stake: 50, deuces: 2 })).toEqual({ A: 600, B: -200, C: -200, D: -200 });
    expect(deuceMultiplier('pow2', 0)).toBe(1);
    expect([1, 2, 3, 4].map((k) => deuceMultiplier('pow2', k))).toEqual([2, 4, 8, 16]);
  });

  it('double-once: any number of 2s doubles once', () => {
    expect([1, 2, 4].map((k) => deuceMultiplier('double-once', k))).toEqual([2, 2, 2]);
    expect(run(setup({ deuce: 'double-once' }), P3, { winner: 'B', stake: 10, deuces: 3 })).toEqual({ A: -20, B: 40, C: -20 });
  });

  it('is refused when the option is off or out of range', () => {
    expect(game.validate(setup(), P4, { winner: 'A', stake: 5, deuces: 1 })).toEqual(['the deuce multiplier is switched off']);
    expect(game.validate(setup({ deuce: 'pow2' }), P4, { winner: 'A', stake: 5, deuces: 5 })).toEqual(['deuces must be 0 to 4']);
  });
});

describe('cards-left', () => {
  const cl = (over: Partial<PusoyDosSetup> = {}, n = 4) => setup({ scoring: 'cards-left', ...over }, n);
  const left = { B: 5, C: 10, D: 13 };

  it('penalty tiers: 1/card up to 9, 2/card for 10 to 12, 3/card for all 13', () => {
    const t = TIER_PRESETS.standard!;
    expect([1, 5, 9, 10, 12, 13].map((n) => penalty(t, n))).toEqual([1, 5, 9, 20, 24, 39]);
  });

  it('winner-only worked example: A wins, B 5, C 10, D 13 => A +64, B -5, C -20, D -39', () => {
    expect(run(cl(), P4, { winner: 'A', stake: 1, cardsLeft: left })).toEqual({ A: 64, B: -5, C: -20, D: -39 });
  });

  it('pairwise worked example: A +64, B +44, C -16, D -92', () => {
    expect(run(cl({ settlement: 'pairwise' }), P4, { winner: 'A', stake: 1, cardsLeft: left })).toEqual({ A: 64, B: 44, C: -16, D: -92 });
  });

  it('tiered-8 preset: 8 cards pay 2 each, 13 cards pay 4 each', () => {
    const t = TIER_PRESETS['tiered-8']!;
    expect([7, 8, 9, 10, 12, 13].map((n) => penalty(t, n))).toEqual([7, 16, 18, 30, 36, 52]);
  });

  it('the deuce multiplier scales every penalty', () => {
    const s = cl({ deuce: 'pow2' });
    expect(run(s, P4, { winner: 'A', stake: 1, cardsLeft: left, deuces: 1 })).toEqual({ A: 128, B: -10, C: -40, D: -78 });
  });

  it('stake scales the result', () => {
    expect(run(cl(), P3, { winner: 'C', stake: 10, cardsLeft: { A: 3, B: 11 } })).toEqual({ A: -30, B: -220, C: 250 });
  });

  it.each([[P2], [P3], [P4]])('is zero-sum in both settlement modes with %j', (players) => {
    for (const settlement of ['winner-only', 'pairwise'] as const) {
      const winner = players[players.length - 1] as string;
      const cardsLeft = Object.fromEntries(players.filter((p) => p !== winner).map((p, i) => [p, 2 + i * 5]));
      const net = run(cl({ settlement }, players.length), players, { winner, stake: 7, cardsLeft });
      expect(sum(net)).toBe(0);
    }
  });

  it('supports a 17-card deal when the host sets it', () => {
    const s = cl({ startingHand: 17 }, 3);
    expect(game.validate(s, P3, { winner: 'A', stake: 1, cardsLeft: { B: 17, C: 4 } })).toEqual([]);
    expect(game.validate(cl({}, 3), P3, { winner: 'A', stake: 1, cardsLeft: { B: 17, C: 4 } }).length).toBeGreaterThan(0);
  });

  it('rejects missing, zero, extra and winner cards-left', () => {
    const s = cl();
    expect(game.validate(s, P4, { winner: 'A', stake: 1 }).length).toBe(1);
    expect(game.validate(s, P4, { winner: 'A', stake: 1, cardsLeft: { B: 5, C: 0, D: 3 } }).length).toBeGreaterThan(0);
    expect(game.validate(s, P4, { winner: 'A', stake: 1, cardsLeft: { B: 5, C: 5 } }).length).toBeGreaterThan(0);
    expect(game.validate(s, P4, { winner: 'A', stake: 1, cardsLeft: { A: 2, B: 5, C: 5, D: 5 } }).length).toBeGreaterThan(0);
    expect(game.validate(s, P4, { winner: 'A', stake: 1, cardsLeft: { B: 5, C: 5, D: 5, Z: 1 } }).length).toBeGreaterThan(0);
  });
});

describe('placement (play until one remains)', () => {
  const pl = (n = 4) => setup({ scoring: 'placement' }, n);

  it('docs example: order A,B,C,D, points 5/3/1/0, stake 10 => +110, +30, -50, -90', () => {
    expect(run(pl(), P4, { stake: 10, order: ['A', 'B', 'C', 'D'] })).toEqual({ A: 110, B: 30, C: -50, D: -90 });
  });

  it.each([[P2], [P3], [P4]])('is zero-sum with %j and the winner gets the most', (players) => {
    const net = run(pl(players.length), players, { stake: 3, order: [...players].reverse() });
    expect(sum(net)).toBe(0);
    expect(Math.max(...Object.values(net))).toBe(net[players[players.length - 1] as string]);
  });

  it('rejects an order that is not a permutation of the players', () => {
    for (const order of [['A', 'B', 'C'], ['A', 'A', 'C', 'D'], ['A', 'B', 'C', 'Z'], 'ABCD' as unknown as string[]]) {
      expect(game.validate(pl(), P4, { stake: 1, order }).length).toBeGreaterThan(0);
    }
  });

  it('does not accept deuces', () => {
    expect(game.validate(pl(), P4, { stake: 1, order: P4, deuces: 1 }).length).toBe(1);
  });
});

describe('validation', () => {
  it('stake must be a whole number in range', () => {
    for (const stake of [0, -5, 1.5, NaN, 10_000_001, '5' as unknown as number]) {
      expect(game.validate(setup(), P4, { winner: 'A', stake }).length).toBeGreaterThan(0);
    }
    expect(game.validate(setup(), P4, { winner: 'A', stake: 10_000_000 })).toEqual([]);
  });

  it('winner must be a player and cards-left do not apply to winner-take-all', () => {
    expect(game.validate(setup(), P4, { winner: 'Z', stake: 5 }).length).toBe(1);
    expect(game.validate(setup(), P4, { winner: 'A', stake: 5, cardsLeft: { B: 1 } }).length).toBe(1);
  });

  it('survives hostile shapes without throwing', () => {
    for (const bad of [null, 5, 'x', [], { stake: {} }, { winner: {}, stake: 1 }, { winner: 'A', stake: 1, cardsLeft: 'x' }] as unknown[]) {
      expect(() => game.validate(setup({ scoring: 'cards-left' }), P4, bad as PusoyDosInput)).not.toThrow();
    }
  });

  it('the largest allowed round (max stake, 4 deuces, 26 cards at 10 per card) stays inside the amount limit', () => {
    for (const settlement of ['winner-only', 'pairwise'] as const) {
      const s = setup({ scoring: 'cards-left', settlement, deuce: 'pow2', startingHand: 26, tiers: [{ minCards: 1, perCard: 10 }] });
      const input: PusoyDosInput = { winner: 'A', stake: 10_000_000, deuces: 4, cardsLeft: { B: 26, C: 26, D: 26 } };
      expect(game.validate(s, P4, input)).toEqual([]);
      const net = game.score(s, P4, input);
      expect(sum(net)).toBe(0);
      expect(Math.max(...Object.values(net).map(Math.abs))).toBeLessThanOrEqual(1_000_000_000_000);
    }
  });
});

describe('validateSetup', () => {
  it('accepts the defaults at every player count', () => {
    for (const n of [2, 3, 4]) expect(game.validateSetup(game.defaultSetup(n), n)).toEqual([]);
  });

  it('accepts every tier preset', () => {
    for (const tiers of Object.values(TIER_PRESETS)) expect(game.validateSetup(setup({ tiers }), 4)).toEqual([]);
  });

  it('rejects bad options', () => {
    const bad: [Partial<PusoyDosSetup>, number][] = [
      [{ scoring: 'nope' as never }, 4],
      [{ deuce: 'x' as never }, 4],
      [{ startingHand: 1 }, 4],
      [{ startingHand: 27 }, 4],
      [{ tiers: [] }, 4],
      [{ tiers: [{ minCards: 2, perCard: 1 }] }, 4],
      [{ tiers: [{ minCards: 1, perCard: 1 }, { minCards: 1, perCard: 2 }] }, 4],
      [{ tiers: [{ minCards: 1, perCard: 11 }] }, 4],
      [{ placementPoints: [1, 0] }, 4],
      [{ placementPoints: [1, 2, 3, 4] }, 4],
      [{ placementPoints: [5, 3, 1, -1] }, 4],
    ];
    for (const [over, n] of bad) expect(game.validateSetup(setup(over, n), n).length, JSON.stringify(over)).toBeGreaterThan(0);
    expect(game.validateSetup(null, 4).length).toBe(1);
    expect(game.validateSetup([], 4).length).toBe(1);
  });
});

describe('random rounds are always zero-sum and exact', () => {
  it('holds across systems, settlements, deuce modes and player counts', () => {
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 400; i++) {
      const n = 2 + Math.floor(rand() * 3);
      const players = P4.slice(0, n);
      const scoring = (['winner-take-all', 'cards-left', 'placement'] as const)[Math.floor(rand() * 3)]!;
      const s = setup({
        scoring,
        settlement: rand() < 0.5 ? 'winner-only' : 'pairwise',
        deuce: (['off', 'pow2', 'double-once'] as const)[Math.floor(rand() * 3)]!,
      }, n);
      const winner = players[Math.floor(rand() * n)]!;
      const input: PusoyDosInput = { winner, stake: 1 + Math.floor(rand() * 500) };
      if (scoring === 'cards-left') input.cardsLeft = Object.fromEntries(players.filter((p) => p !== winner).map((p) => [p, 1 + Math.floor(rand() * 13)]));
      if (scoring === 'placement') { delete input.winner; input.order = [...players].sort(() => rand() - 0.5); }
      if (scoring !== 'placement' && s.deuce !== 'off') input.deuces = Math.floor(rand() * 5);
      const net = run(s, players, input);
      expect(sum(net)).toBe(0);
      for (const v of Object.values(net)) expect(Number.isSafeInteger(v)).toBe(true);
    }
  });
});

describe('hardening (from code review)', () => {
  it('validateSetup does not throw on hostile placement points', () => {
    const hostile = { ...game.defaultSetup(2), placementPoints: [{ toString: null }, 0] } as unknown;
    expect(() => game.validateSetup(hostile, 2)).not.toThrow();
    expect(game.validateSetup(hostile, 2).length).toBeGreaterThan(0);
  });

  it('score never returns -0', () => {
    const s = setup({ scoring: 'placement', placementPoints: JSON.parse('[-0,0]') as number[] }, 2);
    const net = game.score(s, P2, { stake: 1, order: ['A', 'B'] });
    expect(Object.values(net).every((v) => !Object.is(v, -0))).toBe(true);
  });

  it('setPlacementPoint keeps points non-increasing and in range', () => {
    expect(setPlacementPoint([5, 3, 1, 0], 1, 9)).toEqual([5, 5, 1, 0]);
    expect(setPlacementPoint([5, 3, 1, 0], 0, 2)).toEqual([2, 2, 1, 0]);
    expect(setPlacementPoint([5, 3, 1, 0], 3, -4)).toEqual([5, 3, 1, 0]);
    expect(setPlacementPoint([5, 3, 1, 0], 0, 5000)).toEqual([1000, 3, 1, 0]);
    for (const [i, v] of [[0, 7], [1, 0], [2, 4], [3, 99]] as const) {
      expect(game.validateSetup(setup({ placementPoints: setPlacementPoint([5, 3, 1, 0], i, v) }), 4)).toEqual([]);
    }
  });

  it('a game module that throws becomes an invalid round, not a crash', () => {
    const exploding = { ...game, validate: () => { throw new TypeError('boom'); } };
    expect(() => replay(exploding, setup(), P4, [{ type: 'round.add', id: 'r1', at: 1, by: 'h', input: { winner: 'A', stake: 1 } }])).toThrow(/could not be read/);
  });
});

describe('17-card hands (three players): the top tier still means "never played a card" (audit C01)', () => {
  it('13 to 16 cards left pay the 10+ rate, and only all 17 pay the top rate', () => {
    const standard = TIER_PRESETS.standard!;
    expect(penalty(standard, 9, 17)).toBe(9);
    expect(penalty(standard, 13, 17)).toBe(26);
    expect(penalty(standard, 16, 17)).toBe(32);
    expect(penalty(standard, 17, 17)).toBe(51);
    // 13-card hands are unchanged
    expect(penalty(standard, 12, 13)).toBe(24);
    expect(penalty(standard, 13, 13)).toBe(39);
  });

  it('a hand size the deck cannot deal to every player is refused', () => {
    const base = game.defaultSetup(4);
    expect(game.validateSetup({ ...base, startingHand: 17 }, 4).length).toBeGreaterThan(0);
    expect(game.validateSetup({ ...game.defaultSetup(3), startingHand: 17 }, 3)).toEqual([]);
  });
});

describe('fixed winner scoring', () => {
  it('adds a flat card penalty to the base win and scales both', () => {
    const s = { ...game.defaultSetup(3), scoring: 'cards-left' as const, scoringVersion: 2 as const };
    expect(run(s, P3, { winner: 'A', stake: 5, cardsLeft: { B: 4, C: 2 } })).toEqual({ A: 40, B: -25, C: -15 });
  });
});
