import { describe, expect, it } from 'vitest';
import { replay } from '../src/core/ledger';
import {
  NATURAL_KEYS, NATURAL_WIKIPEDIA, ROYALTY_KEYS, ROYALTY_PRESETS, SYSTEMS, analyze, defaultSetup, pusoy as game,
  type PusoyInput, type PusoySetup, type Ranking,
} from '../src/games/pusoy';

const P3 = ['A', 'B', 'C'];
const P4 = ['A', 'B', 'C', 'D'];
const sum = (n: Record<string, number>) => Object.values(n).reduce((a, b) => a + b, 0);

const sys = (name: '1-6' | '2-4', over: Partial<PusoySetup> = {}): PusoySetup => ({ ...defaultSetup(), royalties: false, naturals: false, natural: { ...NATURAL_WIKIPEDIA }, system: name, ...SYSTEMS[name], ...over });
const rows = (front: Ranking, middle: Ranking, back: Ranking) => ({ front, middle, back });
const run = (s: PusoySetup, players: string[], input: PusoyInput) => {
  expect(game.validate(s, players, input)).toEqual([]);
  return game.score(s, players, input) as Record<string, number>;
};

// docs/rules/pusoy.md worked example: A beats B 2-1, A scoops C, B beats C 2-1
const worked = rows([['A'], ['B'], ['C']], [['B'], ['A'], ['C']], [['A'], ['C'], ['B']]);

describe('point systems (docs worked examples)', () => {
  it('1-6: a scoop is worth 6. A +7, B 0, C -7', () => {
    expect(run(sys('1-6'), P3, { stake: 1, rows: worked })).toEqual({ A: 7, B: 0, C: -7 });
  });

  it('2-4: a 2-1 win is 2 and a scoop is 4. A +6, B 0, C -6', () => {
    expect(run(sys('2-4'), P3, { stake: 1, rows: worked })).toEqual({ A: 6, B: 0, C: -6 });
  });

  it("Wikipedia's Amy and Bob: front and back to Amy, middle to Bob. 2-4 pays 2, 1-6 pays 1", () => {
    const r = rows([['A'], ['B']], [['B'], ['A']], [['A'], ['B']]);
    expect(run(sys('2-4'), ['A', 'B'], { stake: 1, rows: r })).toEqual({ A: 2, B: -2 });
    expect(run(sys('1-6'), ['A', 'B'], { stake: 1, rows: r })).toEqual({ A: 1, B: -1 });
  });

  it('ties in a row score nothing for that row', () => {
    const r = rows([['A', 'B']], [['A'], ['B']], [['B'], ['A']]);
    expect(run(sys('1-6'), ['A', 'B'], { stake: 10, rows: r })).toEqual({ A: 0, B: 0 });
    expect(run(sys('2-4'), ['A', 'B'], { stake: 10, rows: rows([['A', 'B']], [['A'], ['B']], [['A'], ['B']]) })).toEqual({ A: 30, B: -30 }); // 2 rows + the majority bonus
  });

  it('stake scales every unit', () => {
    expect(run(sys('1-6'), P3, { stake: 50, rows: worked })).toEqual({ A: 350, B: 0, C: -350 });
  });

  it('the bonuses can be set by hand', () => {
    expect(run(sys('1-6', { system: 'custom', scoopBonus: 5 }), P3, { stake: 1, rows: worked })).toEqual({ A: 9, B: 0, C: -9 });
  });
});

describe('fouls', () => {
  const r = rows([['A'], ['C']], [['C'], ['A']], [['A'], ['C']]);

  it('scoop mode: the fouler loses all 3 rows to each valid player. 1-6 pays 6 each', () => {
    expect(run(sys('1-6'), P3, { stake: 1, rows: r, fouls: ['B'] })).toEqual({ A: 7, B: -12, C: 5 });
  });

  it('flat mode pays the flat amount to each valid player', () => {
    expect(run(sys('1-6', { foul: 'flat', foulFlat: 3 }), P3, { stake: 1, rows: r, fouls: ['B'] })).toEqual({ A: 4, B: -6, C: 2 });
  });

  it('two players fouling pay each other nothing; the valid player collects from both', () => {
    const only = rows([['C']], [['C']], [['C']]);
    expect(run(sys('1-6'), P3, { stake: 1, rows: only, fouls: ['A', 'B'] })).toEqual({ A: -6, B: -6, C: 12 });
    expect(run(sys('1-6'), ['A', 'B'], { stake: 1, rows: rows([], [], []), fouls: ['A', 'B'] })).toEqual({ A: 0, B: 0 });
  });
});

describe('royalties', () => {
  const tie = rows([['A', 'B']], [['A', 'B']], [['A', 'B']]);

  it('all-opponents mode: every opponent pays each royalty, even when the row is tied', () => {
    const s = sys('1-6', { royalties: true, royaltyMode: 'all' });
    expect(run(s, ['A', 'B'], { stake: 1, rows: tie, royalties: { A: { front: 'trips' } } })).toEqual({ A: 3, B: -3 });
    expect(run(s, P3, { stake: 1, rows: rows([['A', 'B', 'C']], [['A', 'B', 'C']], [['A', 'B', 'C']]), royalties: { A: { front: 'trips', middle: 'quads' } } })).toEqual({ A: 14, B: -7, C: -7 });
  });

  it('on-win mode: only opponents beaten in that row pay it', () => {
    const s = sys('1-6', { royalties: true, royaltyMode: 'on-win' });
    expect(run(s, ['A', 'B'], { stake: 1, rows: tie, royalties: { A: { front: 'trips' } } })).toEqual({ A: 0, B: 0 });
    // A wins the front (+1 row) and holds trips there (+3); B wins middle and back
    const r = rows([['A'], ['B']], [['B'], ['A']], [['B'], ['A']]);
    expect(run(s, ['A', 'B'], { stake: 1, rows: r, royalties: { A: { front: 'trips' } } })).toEqual({ A: 3 - 1, B: -(3 - 1) });
  });

  it('presets give the documented values', () => {
    expect(ROYALTY_PRESETS.classic['front.trips']).toBe(3);
    expect(ROYALTY_PRESETS.classic['middle.fullHouse']).toBe(2);
    expect(ROYALTY_PRESETS.wikipedia['middle.fullHouse']).toBe(1);
    expect(ROYALTY_PRESETS.playtime['middle.royal']).toBe(10);
    for (const t of Object.values(ROYALTY_PRESETS)) expect(Object.keys(t).sort()).toEqual([...ROYALTY_KEYS].sort());
  });

  it('a fouled hand collects no royalties, but a valid player still collects theirs from the fouler', () => {
    const s = sys('1-6', { royalties: true });
    const r = rows([['A']], [['A']], [['A']]);
    expect(run(s, ['A', 'B'], { stake: 1, rows: r, fouls: ['B'], royalties: { A: { back: 'straightFlush' } } })).toEqual({ A: 6 + 5, B: -(6 + 5) });
  });

  it('royalties are refused when the option is off or the player fouled', () => {
    expect(game.validate(sys('1-6'), ['A', 'B'], { stake: 1, rows: rows([['A', 'B']], [['A', 'B']], [['A', 'B']]), royalties: { A: { front: 'trips' } } })).toEqual(['royalties are switched off']);
    const on = sys('1-6', { royalties: true });
    expect(game.validate(on, ['A', 'B'], { stake: 1, rows: rows([['A']], [['A']], [['A']]), fouls: ['B'], royalties: { B: { front: 'trips' } } }).length).toBeGreaterThan(0);
  });
});

describe('naturals', () => {
  const s = sys('1-6', { naturals: true });

  it('a natural wins its value from each opponent without comparing rows', () => {
    const r = rows([['B'], ['C']], [['C'], ['B']], [['B'], ['C']]);
    expect(run(s, P3, { stake: 1, rows: r, naturals: { A: 'dragon' } })).toEqual({ A: 72, B: -36 + 1, C: -36 - 1 });
  });

  it('the higher natural wins its own value; equal naturals draw', () => {
    const only = rows([['C']], [['C']], [['C']]);
    expect(run(s, P3, { stake: 1, rows: only, naturals: { A: 'pureDragon', B: 'dragon' } })).toEqual({ A: 108 + 108, B: -108 + 36, C: -108 - 36 });
    expect(run(s, P3, { stake: 1, rows: only, naturals: { A: 'dragon', B: 'dragon' } })).toEqual({ A: 36, B: 36, C: -72 });
  });

  it('is refused when off, for a fouled player, or when the player is also ranked', () => {
    const r = rows([['B']], [['B']], [['B']]);
    expect(game.validate(sys('1-6'), ['A', 'B'], { stake: 1, rows: r, naturals: { A: 'dragon' } })).toContain('naturals are switched off');
    expect(game.validate(s, ['A', 'B'], { stake: 1, rows: r, fouls: ['A'], naturals: { A: 'dragon' } }).length).toBeGreaterThan(0);
    expect(game.validate(s, ['A', 'B'], { stake: 1, rows: rows([['A'], ['B']], [['A'], ['B']], [['A'], ['B']]), naturals: { A: 'dragon' } }).length).toBeGreaterThan(0);
  });

  it('defaults cover every natural hand; the Wikipedia list is complete', () => {
    expect(NATURAL_KEYS.every((k) => NATURAL_WIKIPEDIA[k] > 0)).toBe(true);
    expect(NATURAL_KEYS.every((k) => Number.isInteger(defaultSetup().natural[k]))).toBe(true);
  });

  it('the table defaults are 2-4, royalties on, and the Philippine naturals (dragon 13, three kinds worth 3)', () => {
    const d = defaultSetup();
    expect(d).toMatchObject({ system: '2-4', majorityBonus: 1, scoopBonus: 0, foul: 'scoop', royalties: true, royaltyPreset: 'classic', naturals: true });
    expect(d.natural).toMatchObject({ dragon: 13, sixPairs: 3, threeStraights: 3, threeFlushes: 3, pureDragon: 0 });
    // a dragon sweeps the table: 13 from each of the 3 opponents
    expect(run(d, ['A', 'B', 'C', 'D'], { stake: 1, rows: rows([['B', 'C', 'D']], [['B', 'C', 'D']], [['B', 'C', 'D']]), naturals: { A: 'dragon' } })).toEqual({ A: 39, B: -13, C: -13, D: -13 });
  });

  it('a natural that is switched off (value 0) is refused', () => {
    const s = { ...defaultSetup() };
    expect(game.validate(s, ['A', 'B'], { stake: 1, rows: rows([['B']], [['B']], [['B']]), naturals: { A: 'pureDragon' } })).toContain('that natural hand is not played at this table');
  });
});

describe('analysis for banners', () => {
  it('reports scoops, fouls, royalty and natural holders', () => {
    const s = sys('1-6', { royalties: true, naturals: true });
    const d = analyze(s, P4, {
      stake: 1,
      rows: rows([['A'], ['B']], [['A'], ['B']], [['A'], ['B']]),
      fouls: ['C'], naturals: { D: 'sixPairs' }, royalties: { A: { front: 'trips' } },
    });
    expect(d.fouls).toEqual(['C']);
    expect(d.royaltyHolders).toEqual(['A']);
    expect(d.naturalHolders).toEqual(['D']);
    expect(d.scoops).toContainEqual({ winner: 'A', loser: 'B' });
  });
});

describe('validation', () => {
  const ok = { stake: 5, rows: rows([['A'], ['B']], [['A'], ['B']], [['A'], ['B']]) };
  const s = sys('1-6');

  it('accepts a normal round and rejects bad rankings', () => {
    expect(game.validate(s, ['A', 'B'], ok)).toEqual([]);
    const bad: unknown[] = [
      { ...ok, rows: { ...ok.rows, front: [['A']] } },                    // missing B
      { ...ok, rows: { ...ok.rows, back: [['A'], ['B'], ['C']] } },      // unknown player
      { ...ok, rows: { ...ok.rows, middle: [['A'], ['A', 'B']] } },      // A twice
      { ...ok, rows: { ...ok.rows, middle: [[], ['A', 'B']] } },         // empty group
      { ...ok, rows: { front: [['A', 'B']], middle: [['A', 'B']] } },    // a row missing
      { ...ok, rows: null }, { ...ok, rows: 'x' }, { stake: 5 },
      { ...ok, stake: 0 }, { ...ok, stake: 1.5 }, { ...ok, stake: 10_000_001 },
      { ...ok, fouls: ['B', 'B'] }, { ...ok, fouls: ['Z'] }, { ...ok, fouls: 'B' },
      null, 5, [],
    ];
    for (const b of bad) {
      expect(() => game.validate(s, ['A', 'B'], b as PusoyInput)).not.toThrow();
      expect(game.validate(s, ['A', 'B'], b as PusoyInput).length, JSON.stringify(b)).toBeGreaterThan(0);
    }
  });

  it('fouled players must be left out of the rows', () => {
    expect(game.validate(s, ['A', 'B'], { ...ok, fouls: ['B'] }).length).toBeGreaterThan(0);
    expect(game.validate(s, ['A', 'B'], { stake: 1, rows: rows([['A']], [['A']], [['A']]), fouls: ['B'] })).toEqual([]);
  });

  it('validateSetup accepts the defaults and every preset, and rejects bad options without throwing', () => {
    for (const n of [2, 3, 4]) expect(game.validateSetup(game.defaultSetup(n), n)).toEqual([]);
    for (const p of ['classic', 'wikipedia', 'playtime'] as const) {
      expect(game.validateSetup({ ...defaultSetup(), royaltyPreset: p, royalty: ROYALTY_PRESETS[p] }, 4)).toEqual([]);
    }
    const base = defaultSetup();
    for (const bad of [null, [], { ...base, system: 'x' }, { ...base, scoopBonus: -1 }, { ...base, scoopBonus: 1.5 }, { ...base, foul: 'x' }, { ...base, royalties: 'yes' }, { ...base, royalty: null }, { ...base, royalty: { 'front.trips': { toString: null } } }, { ...base, natural: { dragon: 999 } }]) {
      expect(() => game.validateSetup(bad, 4)).not.toThrow();
      expect(game.validateSetup(bad, 4).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
});

describe('every round is zero-sum, exact and bounded', () => {
  it('holds across systems, fouls, royalties, naturals and player counts', () => {
    let seed = 2024;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 600; i++) {
      const n = 2 + Math.floor(rand() * 3);
      const players = P4.slice(0, n);
      const s = sys(rand() < 0.5 ? '1-6' : '2-4', {
        foul: rand() < 0.5 ? 'scoop' : 'flat', royalties: rand() < 0.5, royaltyMode: rand() < 0.5 ? 'all' : 'on-win', naturals: rand() < 0.5,
      });
      const fouls = players.filter(() => rand() < 0.2);
      const natural: Record<string, (typeof NATURAL_KEYS)[number]> = {};
      if (s.naturals) for (const p of players) if (!fouls.includes(p) && rand() < 0.2) natural[p] = NATURAL_KEYS[Math.floor(rand() * NATURAL_KEYS.length)]!;
      const ranked = players.filter((p) => !fouls.includes(p) && !(p in natural));
      const ranking = (): Ranking => {
        const order = [...ranked].sort(() => rand() - 0.5);
        const groups: Ranking = [];
        for (const p of order) {
          if (groups.length > 0 && rand() < 0.25) groups[groups.length - 1]!.push(p);
          else groups.push([p]);
        }
        return groups;
      };
      const royalties: Record<string, never> | Record<string, { front?: 'trips'; middle?: 'quads'; back?: 'royal' }> = {};
      if (s.royalties) for (const p of ranked) if (rand() < 0.4) (royalties as Record<string, object>)[p] = { front: 'trips', ...(rand() < 0.5 ? { back: 'royal' } : {}) };
      const input: PusoyInput = { stake: 1 + Math.floor(rand() * 300), rows: { front: ranking(), middle: ranking(), back: ranking() } };
      if (fouls.length) input.fouls = fouls;
      if (Object.keys(natural).length) input.naturals = natural;
      if (Object.keys(royalties).length) input.royalties = royalties as PusoyInput['royalties'];
      const net = run(s, players, input);
      expect(sum(net)).toBe(0);
      for (const v of Object.values(net)) expect(Number.isSafeInteger(v) && !Object.is(v, -0)).toBe(true);
    }
  });

  it('the largest allowed round stays inside the amount limit', () => {
    const s = sys('1-6', { royalties: true, naturals: true, foul: 'flat', foulFlat: 50 });
    const input: PusoyInput = { stake: 10_000_000, rows: rows([['A']], [['A']], [['A']]), fouls: ['B', 'C', 'D'], royalties: { A: { front: 'trips', middle: 'royal', back: 'royal' } } };
    expect(game.validate(s, P4, input)).toEqual([]);
    const net = game.score(s, P4, input);
    expect(Math.max(...Object.values(net).map(Math.abs))).toBeLessThanOrEqual(1_000_000_000_000);
    expect(sum(net)).toBe(0);
  });

  it('works through the ledger with undo', () => {
    const state = replay(game, sys('2-4'), P3, [
      { type: 'round.add', id: 'r1', at: 1, by: 'h', input: { stake: 10, rows: worked } },
      { type: 'round.add', id: 'r2', at: 2, by: 'h', input: { stake: 10, rows: worked } },
      { type: 'round.undo', at: 3, by: 'h' },
    ]);
    expect(state.totals).toEqual({ A: 60, B: 0, C: -60 });
  });
});

describe('hardening (from code review)', () => {
  it('a zero-valued natural is still a natural: rows are ignored and the pair draws', () => {
    const s = { ...sys('1-6', { naturals: true, royalties: true }), natural: { ...defaultSetup().natural, threeFlushes: 0 } };
    expect(game.validateSetup(s, 2)).toEqual([]); // 0 now means "not played"; validate() refuses to enter it, score() stays safe if one slips through
    const input: PusoyInput = { stake: 1, rows: rows([['B']], [['B']], [['B']]), naturals: { A: 'threeFlushes' }, royalties: { B: { front: 'trips' } } };
    expect(game.score(s, ['A', 'B'], input)).toEqual({ A: 0, B: 0 });
  });

  it('keeps every amount for a player id that is also an Object.prototype name', () => {
    const net = run(sys('1-6'), ['__proto__', 'B'], { stake: 1, rows: rows([['__proto__'], ['B']], [['__proto__'], ['B']], [['__proto__'], ['B']]) });
    expect(Object.entries(net).map(([k, v]) => [k, v])).toEqual([['__proto__', 6], ['B', -6]]);
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
