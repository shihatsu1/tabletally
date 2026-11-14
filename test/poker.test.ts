import { describe, expect, it } from 'vitest';
import { analyze, defaultSetup, poker as game, type PokerInput, type PokerSetup } from '../src/games/poker';
import { convertZeroSum } from '../src/core/integer';
import { pokerEngine } from '../src/games/poker/engine';

const P3 = ['A', 'B', 'C'];
const sum = (n: Record<string, number>) => Object.values(n).reduce((a, b) => a + b, 0);
const s = (over: Partial<PokerSetup> = {}): PokerSetup => ({ ...defaultSetup(), ...over });
const night = (buyIns: Record<string, number[]>, cashOuts: Record<string, number>, adjustTo?: string): PokerInput => ({ buyIns, cashOuts, ...(adjustTo ? { adjustTo } : {}) });
const run = (setup: PokerSetup, players: string[], input: PokerInput) => {
  expect(game.validate(setup, players, input)).toEqual([]);
  return game.score(setup, players, input) as Record<string, number>;
};

describe('a balanced night', () => {
  it('net is cash-out minus every buy-in, and rebuys count', () => {
    const out = run(s(), P3, night({ A: [1000], B: [1000, 500], C: [1000] }, { A: 1800, B: 1000, C: 700 }));
    expect(out).toEqual({ A: 800, B: -500, C: -300 });
    expect(sum(out)).toBe(0);
  });

  it('a player who loses everything cashes out 0', () => {
    expect(run(s(), ['A', 'B'], night({ A: [100], B: [100] }, { A: 200, B: 0 }))).toEqual({ A: 100, B: -100 });
  });
});

describe('chips in must equal chips out (docs worked example)', () => {
  const missing = night({ A: [1000], B: [1000], C: [1000] }, { A: 1800, B: 900, C: 200 });

  it('refuses the night and says how many chips are missing', () => {
    expect(game.validate(s(), P3, missing)).toEqual(['100 chips are missing: chips out must equal chips in']);
    expect(analyze(P3, missing)).toMatchObject({ chipsIn: 3000, chipsOut: 2900, difference: 100 });
  });

  it('says so when extra chips came out', () => {
    expect(game.validate(s(), ['A', 'B'], night({ A: [100], B: [100] }, { A: 150, B: 70 }))).toEqual(['20 extra chips came out: chips out must equal chips in']);
  });

  it('assigning the missing chips to C (the miscount) balances the night without changing anyone else', () => {
    const out = run(s(), P3, { ...missing, adjustTo: 'C' });
    expect(out).toEqual({ A: 800, B: -100, C: -700 });
    expect(sum(out)).toBe(0);
  });

  it('assigning extra chips takes them from the chosen player', () => {
    const out = run(s(), ['A', 'B'], night({ A: [100], B: [100] }, { A: 150, B: 70 }, 'B'));
    expect(out).toEqual({ A: 50, B: -50 });
  });

  it('refuses an adjustment when nothing is missing, or for a stranger', () => {
    const ok = night({ A: [100], B: [100] }, { A: 150, B: 50 });
    expect(game.validate(s(), ['A', 'B'], { ...ok, adjustTo: 'A' })).toEqual(['chips in equal chips out, so there is nothing to assign']);
    expect(game.validate(s(), P3, { ...missing, adjustTo: 'Z' })).toEqual(['the difference must be assigned to a player at the table']);
  });
});

describe('chip ratio', () => {
  it('converts exactly: 100 chips are worth 50 units', () => {
    expect(run(s({ chips: 100, moneyUnits: 50 }), P3, night({ A: [1000], B: [1000], C: [1000] }, { A: 1800, B: 900, C: 300 }))).toEqual({ A: 400, B: -50, C: -350 });
  });

  it('an uneven ratio still sums to zero (largest remainder)', () => {
    for (const [chips, moneyUnits] of [[3, 1], [7, 2], [1000, 3], [10, 1]] as const) {
      const out = run(s({ chips, moneyUnits }), P3, night({ A: [100], B: [100], C: [100] }, { A: 157, B: 83, C: 60 }));
      expect(sum(out)).toBe(0);
      expect(Object.values(out).every(Number.isInteger)).toBe(true);
    }
  });
});

describe('untrusted input', () => {
  const good = night({ A: [100], B: [100] }, { A: 100, B: 100 });
  const P2 = ['A', 'B'];

  it('rejects bad shapes without throwing', () => {
    const bad: unknown[] = [
      null, [], 'x', {}, { buyIns: {}, cashOuts: {} },
      { ...good, buyIns: { A: [100] } },
      { ...good, buyIns: { A: [100], B: [] } },
      { ...good, buyIns: { A: [100], B: [0] } },
      { ...good, buyIns: { A: [100], B: [1.5] } },
      { ...good, buyIns: { A: [100], B: ['100'] } },
      { ...good, buyIns: { A: [100], B: [100], Z: [5] } },
      { ...good, cashOuts: { A: 100 } },
      { ...good, cashOuts: { A: -1, B: 201 } },
      { ...good, cashOuts: { A: 1e20, B: 0 } },
      { ...good, cashOuts: { A: NaN, B: 0 } },
      { ...good, buyIns: { A: Array(31).fill(1), B: [100] } },
      { ...good, buyIns: { toString: 1 } },
    ];
    for (const b of bad) {
      expect(() => game.validate(s(), P2, b as PokerInput)).not.toThrow();
      expect(game.validate(s(), P2, b as PokerInput).length).toBeGreaterThan(0);
    }
  });

  it('keeps every amount for a player id that is also an Object.prototype name', () => {
    const out = run(s(), ['__proto__', 'B'], night({ ['__proto__']: [100], B: [100] }, { ['__proto__']: 150, B: 50 }));
    expect(Object.entries(out)).toEqual([['__proto__', 50], ['B', -50]]);
  });

  it('validates the options', () => {
    expect(game.validateSetup(defaultSetup(), 4)).toEqual([]);
    for (const bad of [null, [], {}, { chips: 0, moneyUnits: 1, buyIn: 100 }, { chips: 1, moneyUnits: 0, buyIn: 100 }, { chips: 1.5, moneyUnits: 1, buyIn: 1 }, { chips: 1, moneyUnits: 1, buyIn: 'x' }, { chips: 1e12, moneyUnits: 1, buyIn: 1 }]) {
      expect(() => game.validateSetup(bad, 4)).not.toThrow();
      expect(game.validateSetup(bad, 4).length).toBeGreaterThan(0);
    }
  });

  it('supports 2 to 10 players', () => {
    expect(game.playerCounts).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('poker: a session is converted as a whole, not hand by hand (audit C02/C03)', () => {
  const ratio = s({ chips: 3, moneyUnits: 1 });
  /** Play hands through the engine's finalize, then score them like the ledger does. */
  const session = (players: string[], hands: Record<string, number>[]) => {
    const inputs: PokerInput[] = [];
    const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const net of hands) {
      const plain = night(Object.fromEntries(players.map((p) => [p, [100]])), Object.fromEntries(players.map((p) => [p, 100 + (net[p] ?? 0)])));
      const input = pokerEngine.finalize!(plain as unknown as Record<string, unknown>, ratio, inputs) as unknown as PokerInput;
      expect(game.validate(ratio, players, input)).toEqual([]);
      const d = game.score(ratio, players, input);
      expect(sum(d)).toBe(0);
      for (const p of players) totals[p] = (totals[p] as number) + (d[p] as number);
      inputs.push(input);
    }
    return totals;
  };

  it('three one-chip wins at 3 chips to 1 unit score one unit, like one three-chip win', () => {
    expect(session(['A', 'B'], [{ A: 1, B: -1 }, { A: 1, B: -1 }, { A: 1, B: -1 }])).toEqual({ A: 1, B: -1 });
    expect(session(['A', 'B'], [{ A: 3, B: -3 }])).toEqual({ A: 1, B: -1 });
  });

  it('running totals always equal the whole session converted once', () => {
    const players = ['A', 'B', 'C', 'D'];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const hands: Record<string, number>[] = [];
    for (let h = 0; h < 40; h++) {
      const a = (rnd() % 21) - 10;
      const b = (rnd() % 21) - 10;
      hands.push({ A: a, B: b, C: -a - b, D: 0 });
      const cum = Object.fromEntries(players.map((p) => [p, hands.reduce((x, n) => x + (n[p] ?? 0), 0)]));
      const once = convertZeroSum(players.map((p) => cum[p] as number), { chips: 3, moneyUnits: 1 }, h);
      expect(session(players, hands)).toEqual(Object.fromEntries(players.map((p, i) => [p, once[i]])));
    }
  });

  it('an equal remainder does not always go to the first seat', () => {
    // [1, 1, -2] at 2 chips to 1 unit: one of the two winners gets the odd unit; it moves with the hand number
    const winners = [0, 1, 2, 3].map((seq) => convertZeroSum([1, 1, -2], { chips: 2, moneyUnits: 1 }, seq));
    expect(new Set(winners.map((w) => w.indexOf(1))).size).toBeGreaterThan(1);
    for (const w of winners) expect(w.reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('refuses a bad record of earlier chips', () => {
    const base = night({ A: [100], B: [100] }, { A: 101, B: 99 });
    for (const prior of [{ A: 1, B: 1 }, { A: 1 }, { A: 1, B: -1, Z: 0 }, { A: 1.5, B: -1.5 }, 'x']) {
      expect(game.validate(ratio, ['A', 'B'], { ...base, prior } as PokerInput).length).toBeGreaterThan(0);
    }
    expect(game.validate(ratio, ['A', 'B'], { ...base, seq: -1 }).length).toBeGreaterThan(0);
  });
});
