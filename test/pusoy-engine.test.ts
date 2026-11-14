import { describe, expect, it } from 'vitest';
import { mixSeed } from '../src/core/rng';
import { BOT_LEVELS, type BotLevel } from '../src/core/play';
import { makeCard } from '../src/games/cards';
import { pusoy, defaultSetup, type NaturalKey, type PusoyInput } from '../src/games/pusoy';
import {
  CAT, arrangementProblem, bestArrangement, eval3, eval5, middleCoversFront, naturalsOf, pusoyEngine as E, royaltiesOf,
  type Arrangement, type PsState,
} from '../src/games/pusoy/engine';

const C = (suit: 'S' | 'H' | 'D' | 'C', rank: number) => makeCard('SHDC'.indexOf(suit), rank);
const players = ['A', 'B', 'C', 'D'];
const setup = defaultSetup();

describe('hand evaluation', () => {
  it('ranks five-card hands in order, with the wheel as the lowest straight', () => {
    const hands = [
      [C('S', 2), C('H', 5), C('D', 7), C('C', 9), C('S', 13)], // high card
      [C('S', 2), C('H', 2), C('D', 7), C('C', 9), C('S', 13)], // pair
      [C('S', 2), C('H', 2), C('D', 7), C('C', 7), C('S', 13)], // two pair
      [C('S', 2), C('H', 2), C('D', 2), C('C', 9), C('S', 13)], // trips
      [C('S', 1), C('H', 2), C('D', 3), C('C', 4), C('S', 5)], // wheel
      [C('S', 10), C('H', 11), C('D', 12), C('C', 13), C('S', 1)], // broadway
      [C('H', 2), C('H', 5), C('H', 7), C('H', 9), C('H', 13)], // flush
      [C('S', 2), C('H', 2), C('D', 2), C('C', 9), C('S', 9)], // full house
      [C('S', 2), C('H', 2), C('D', 2), C('C', 2), C('S', 9)], // quads
      [C('H', 3), C('H', 4), C('H', 5), C('H', 6), C('H', 7)], // straight flush
    ].map(eval5);
    expect(hands.map((h) => h.cat)).toEqual([0, 1, 2, 3, 4, 4, 5, 6, 7, 8]);
    expect(hands[4]!.key).toBeLessThan(hands[5]!.key); // wheel < broadway
    expect(hands[4]!.key).toBeGreaterThan(hands[3]!.key); // but still beats trips
    const keys = hands.map((h) => h.key);
    expect(keys.filter((_, i) => i !== 5)).toEqual([...keys.filter((_, i) => i !== 5)].sort((a, b) => a - b));
  });
  it('breaks ties by rank, never by suit', () => {
    const a = eval5([C('S', 2), C('H', 2), C('D', 9), C('C', 11), C('S', 13)]);
    const b = eval5([C('D', 2), C('C', 2), C('H', 9), C('S', 11), C('H', 13)]);
    expect(a.key).toBe(b.key);
    const higherKicker = eval5([C('S', 2), C('H', 2), C('D', 9), C('C', 11), C('S', 1)]);
    expect(higherKicker.key).toBeGreaterThan(a.key);
    const fhLow = eval5([C('S', 3), C('H', 3), C('D', 3), C('C', 9), C('S', 9)]);
    const fhHigh = eval5([C('S', 4), C('H', 4), C('D', 4), C('C', 5), C('S', 5)]);
    expect(fhHigh.key).toBeGreaterThan(fhLow.key); // decided by the triple
  });
  it('knows a royal flush', () => {
    expect(eval5([C('S', 10), C('S', 11), C('S', 12), C('S', 13), C('S', 1)]).royal).toBe(true);
    expect(eval5([C('S', 9), C('S', 10), C('S', 11), C('S', 12), C('S', 13)]).royal).toBe(false);
    expect(eval5([C('S', 1), C('S', 2), C('S', 3), C('S', 4), C('S', 5)]).royal).toBe(false);
  });
  it('front hands: trips > pair > high card', () => {
    expect(eval3([C('S', 4), C('H', 4), C('D', 4)]).key).toBeGreaterThan(eval3([C('S', 1), C('H', 1), C('D', 13)]).key);
    expect(eval3([C('S', 4), C('H', 4), C('D', 13)]).key).toBeGreaterThan(eval3([C('S', 1), C('H', 13), C('D', 12)]).key);
  });
  it('middle must cover the front: category first, then the deciding ranks', () => {
    const covers = (m: number[], f: number[]) => middleCoversFront(eval5(m), eval3(f));
    expect(covers([C('S', 9), C('H', 9), C('D', 2), C('C', 5), C('S', 7)], [C('S', 5), C('H', 5), C('D', 13)])).toBe(true);
    expect(covers([C('S', 9), C('H', 3), C('D', 2), C('C', 5), C('S', 7)], [C('S', 5), C('H', 5), C('D', 13)])).toBe(false); // high card under a pair
    expect(covers([C('S', 5), C('H', 5), C('D', 2), C('C', 6), C('S', 7)], [C('S', 5), C('H', 5), C('D', 13)])).toBe(false); // same pair, weaker kicker
    expect(covers([C('S', 5), C('H', 5), C('D', 13), C('C', 6), C('S', 7)], [C('S', 5), C('H', 5), C('D', 13)])).toBe(true); // equal is allowed
    expect(covers([C('S', 2), C('H', 2), C('D', 3), C('C', 3), C('S', 7)], [C('S', 9), C('H', 9), C('D', 13)])).toBe(true); // two pair > pair
  });
  it('checks an arrangement: sizes, the 13 dealt cards, and the back >= middle >= front order', () => {
    const hand = [C('S', 1), C('H', 1), C('D', 1), C('C', 1), C('S', 2), C('H', 5), C('D', 7), C('C', 9), C('S', 11), C('H', 3), C('D', 4), C('C', 6), C('S', 8)];
    const good: Arrangement = { back: [C('S', 1), C('H', 1), C('D', 1), C('C', 1), C('S', 2)], middle: [C('H', 5), C('D', 7), C('C', 9), C('S', 11), C('H', 3)], front: [C('D', 4), C('C', 6), C('S', 8)] };
    expect(arrangementProblem(good, hand)).toBeNull();
    expect(arrangementProblem({ ...good, back: good.middle, middle: good.back }, hand)).toBe('order');
    expect(arrangementProblem({ ...good, front: [C('D', 4), C('C', 6)] }, hand)).toBe('sizes');
    expect(arrangementProblem({ ...good, front: [C('D', 4), C('C', 6), C('S', 9)] }, hand)).toBe('cards');
  });
  it('the best arrangement of a hand is always valid', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = E.start(setup, players, seed);
      const hand = s.hands.A!;
      const a = bestArrangement(hand, ({ b, m, f }) => b.key + m.key + f.key);
      expect(arrangementProblem(a, hand)).toBeNull();
    }
  });
});

describe('royalties and naturals', () => {
  it('names royalties from the rows', () => {
    const a: Arrangement = { back: [C('S', 10), C('S', 11), C('S', 12), C('S', 13), C('S', 1)], middle: [C('H', 5), C('D', 5), C('C', 5), C('S', 9), C('H', 9)], front: [C('S', 7), C('H', 7), C('D', 7)] };
    expect(royaltiesOf(a)).toEqual({ front: 'trips', middle: 'fullHouse', back: 'royal' });
    const b: Arrangement = { back: [C('S', 2), C('H', 2), C('D', 2), C('C', 2), C('S', 9)], middle: [C('H', 3), C('H', 4), C('H', 5), C('H', 6), C('H', 7)], front: [C('S', 7), C('H', 8), C('D', 9)] };
    expect(royaltiesOf(b)).toEqual({ middle: 'straightFlush', back: 'quads' });
  });
  const has = (hand: number[], k: NaturalKey) => naturalsOf(hand).includes(k);
  it('detects the natural hands', () => {
    expect(has([...[2, 4, 6, 8, 10].map((r) => C('H', r)), ...[3, 5, 7, 9, 11].map((r) => C('S', r)), C('C', 2), C('C', 5), C('C', 9)], 'threeFlushes')).toBe(true);
    expect(has([C('S', 1), C('S', 2), C('S', 3), C('H', 4), C('H', 5), C('D', 3), C('D', 4), C('D', 5), C('D', 6), C('D', 7), C('C', 9), C('C', 10), C('C', 11)], 'threeStraights')).toBe(true);
    expect(has([C('S', 2), C('H', 2), C('S', 4), C('H', 4), C('S', 6), C('H', 6), C('S', 8), C('H', 8), C('S', 10), C('H', 10), C('S', 12), C('H', 12), C('D', 13)], 'sixPairs')).toBe(true);
    expect(has(Array.from({ length: 13 }, (_, i) => makeCard(i % 4, i + 1)), 'dragon')).toBe(true);
    expect(has(Array.from({ length: 13 }, (_, i) => makeCard(0, i + 1)), 'pureDragon')).toBe(true);
    expect(has([...[2, 3, 4, 5, 6, 7, 8].map((r) => C('S', r)), ...[2, 3, 4, 5, 6, 7].map((r) => C('H', r))], 'allLowOrHigh')).toBe(true);
    expect(has([C('S', 2), C('S', 3), C('H', 5), C('H', 6), C('D', 3), C('D', 4), C('D', 7), C('D', 9), C('C', 1), C('C', 8), C('C', 9), C('C', 11), C('C', 13)], 'threeFlushes')).toBe(false);
    expect(has([C('S', 2), C('H', 5), C('D', 8), C('C', 11), C('S', 3), C('H', 6), C('D', 9), C('C', 12), C('S', 4), C('H', 7), C('D', 10), C('C', 13), C('S', 13)], 'dragon')).toBe(false);
  });
  it('finds flush and straight-flush naturals even when two rows share a suit', () => {
    const spades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => C('S', r));
    expect(has([...spades, C('H', 2), C('H', 6), C('H', 10)], 'threeFlushes')).toBe(true);
    expect(has([...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => C('S', r)), C('H', 11), C('H', 12), C('H', 13)], 'threeStraightFlushes')).toBe(true);
    expect(has([...spades, C('H', 2), C('D', 6), C('C', 10)], 'threeFlushes')).toBe(false);
  });
  it('an ordinary dealt hand holds a natural only rarely', () => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) n += E.start(setup, players, seed).eligible.A!.length > 0 ? 1 : 0;
    expect(n).toBeLessThan(40);
  }, 30_000); // Hundreds of deals need headroom on shared CI runners.
});

const arr = (hand: number[]): Arrangement => bestArrangement(hand, ({ b, m, f }) => b.key + m.key + f.key);

describe('a hand of Pusoy', () => {
  it('deals 13 each, everyone sets at once in any order, and nothing is revealed until all have set', () => {
    let s = E.start(setup, players, 4);
    for (const id of players) expect(s.hands[id]).toHaveLength(13);
    expect(new Set(players.flatMap((id) => s.hands[id]!)).size).toBe(52);
    expect(E.pending!(s)).toEqual(players);
    const a = arr(s.hands.C!);
    expect(E.validate(s, 'C', { t: 'set', ...a })).toEqual([]);
    s = E.apply(s, 'C', { t: 'set', ...a });
    expect(E.pending!(s)).toEqual(['A', 'B', 'D']);
    expect(E.toAct(s)).toBe('A');
    const seen = E.viewFor(s, 'B');
    expect(seen.reveal).toBeUndefined();
    expect(seen.mine).toBeNull();
    expect(JSON.stringify(seen)).not.toContain(JSON.stringify(a.back)); // another player's rows stay hidden
    expect(E.viewFor(s, 'C').mine).toEqual({ back: [...a.back].sort((x, y) => x - y), middle: [...a.middle].sort((x, y) => x - y), front: [...a.front].sort((x, y) => x - y) });
    expect(E.validate(s, 'C', { t: 'set', ...a })[0]).toMatch(/already set/);
    for (const id of ['D', 'A', 'B']) s = E.apply(s, id, { t: 'set', ...arr(s.hands[id]!) });
    expect(s.done).toBe(true);
    expect(E.toAct(s)).toBeNull();
    expect(E.viewFor(s, 'B').reveal!.A!.arrangement).not.toBeNull();
  });
  it('refuses mis-set hands (no fouls in digital play)', () => {
    const s = E.start(setup, players, 4);
    const a = arr(s.hands.A!);
    expect(E.validate(s, 'A', { t: 'set', back: a.middle, middle: a.back, front: a.front }).join()).toMatch(/at least as strong|back/);
    expect(E.validate(s, 'A', { t: 'set', back: a.back, middle: a.middle, front: [...a.front.slice(0, 2), s.hands.B![0]] })[0]).toMatch(/13 cards/);
    expect(E.validate(s, 'A', { t: 'set', back: [1, 2], middle: [], front: [] })[0]).toMatch(/set 5 cards/);
    expect(E.validate(s, 'Z', { t: 'pass' })[0]).toMatch(/not at this table/);
    expect(E.validate(s, 'A', { t: 'natural', key: 'dragon' })[0]).toMatch(/do not hold/);
  });
  it('the result goes to the normal scorer, is zero-sum, and royalties are included when the table plays them', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s = E.start(setup, players, seed);
      for (const id of players) s = E.apply(s, id, E.timeoutMove(E.viewFor(s, id)));
      const input = { ...E.result(s)!, stake: 5 } as PusoyInput;
      expect(pusoy.validate(setup, players, input)).toEqual([]);
      const net = pusoy.score(setup, players, input);
      expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
    }
  }, 30_000); // Includes arranging all four hands for each seeded deal.
  it('ties share a group, and a row of equal hands scores nothing', () => {
    const base = (hands: Record<string, Arrangement>): PsState => ({
      rules: { royalties: false, naturals: false, natural: setup.natural },
      players: ['A', 'B'], hands: { A: [], B: [] }, eligible: { A: [], B: [] }, sets: hands, declared: { A: null, B: null }, done: true,
    });
    const rowsOf = (a: Arrangement, b: Arrangement) => (E.result(base({ A: a, B: b })) as { rows: PusoyInput['rows'] }).rows;
    const a: Arrangement = { back: [C('S', 9), C('H', 9), C('D', 2), C('C', 3), C('S', 5)], middle: [C('S', 6), C('H', 6), C('D', 4), C('C', 7), C('S', 8)], front: [C('S', 5), C('H', 5), C('D', 13)] };
    const b: Arrangement = { back: [C('D', 9), C('C', 9), C('H', 2), C('S', 3), C('H', 5)], middle: [C('S', 7), C('H', 7), C('D', 4), C('C', 2), C('S', 9)], front: [C('D', 5), C('C', 5), C('H', 13)] };
    const rows = rowsOf(a, b);
    expect(rows.back).toEqual([['A', 'B']]); // identical ranks, different suits: a tie
    expect(rows.middle).toEqual([['B'], ['A']]);
    expect(rows.front).toEqual([['A', 'B']]);
  });
  it('a natural replaces the rows, and others are scored without it', () => {
    const naturalSetup = { ...setup, natural: { ...setup.natural } };
    let s = E.start(naturalSetup, players, 1);
    // force a flush natural into A's eligible list and declare it
    s = { ...s, eligible: { ...s.eligible, A: ['threeFlushes'] } };
    expect(E.viewFor(s, 'A').eligible).toEqual(['threeFlushes']);
    expect(E.viewFor(s, 'B').eligible).toEqual(s.eligible.B);
    s = E.apply(s, 'A', { t: 'natural', key: 'threeFlushes' });
    for (const id of ['B', 'C', 'D']) s = E.apply(s, id, E.timeoutMove(E.viewFor(s, id)));
    const r = E.result(s) as { naturals: Record<string, string>; rows: PusoyInput['rows'] };
    expect(r.naturals).toEqual({ A: 'threeFlushes' });
    expect(r.rows.back.flat().sort()).toEqual(['B', 'C', 'D']);
    const input = { ...r, stake: 1 } as PusoyInput;
    expect(pusoy.validate(setup, players, input)).toEqual([]);
    const net = pusoy.score(setup, players, input);
    expect(net.A).toBe(9); // 3 from each of the three others
  });
});

describe('computer players', () => {
  it('always set a valid hand at every level, and declare an available natural', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = E.start(setup, players, seed);
      for (const level of BOT_LEVELS) {
        const view = E.viewFor(s, 'A');
        const move = E.bot(view, level, mixSeed(seed, 1));
        expect(E.validate(s, 'A', move)).toEqual([]);
      }
    }
    const s = { ...E.start(setup, players, 3) };
    s.eligible = { ...s.eligible, A: ['sixPairs'] };
    expect(E.bot(E.viewFor(s, 'A'), 'hard', 1)).toEqual({ t: 'natural', key: 'sixPairs' });
    expect(E.bot(E.viewFor(s, 'A'), 'normal', 1)).toEqual({ t: 'natural', key: 'sixPairs' });
  });
  it('stronger levels earn more points per hand (one seat against three weaker ones)', () => {
    const avg = (strong: BotLevel, weak: BotLevel, hands: number): number => {
      let units = 0;
      for (let seed = 1; seed <= hands; seed++) {
        const seat = seed % 4;
        let s = E.start(setup, players, seed);
        for (const [i, id] of players.entries()) s = E.apply(s, id, E.bot(E.viewFor(s, id), i === seat ? strong : weak, mixSeed(seed, i)));
        const input = { ...E.result(s)!, stake: 1 } as PusoyInput;
        units += pusoy.score(setup, players, input)[players[seat]!]!;
      }
      return units / hands;
    };
    expect(avg('hard', 'easy', 150)).toBeGreaterThan(6);
    expect(avg('normal', 'easy', 150)).toBeGreaterThan(4);
    expect(avg('hard', 'normal', 150)).toBeGreaterThan(1);
  }, 120_000);
});
