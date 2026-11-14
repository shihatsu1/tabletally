import { describe, expect, it } from 'vitest';
import { mixSeed, makeRng, shuffle } from '../src/core/rng';
import { pusoyDos, type PusoyDosSetup } from '../src/games/pusoy-dos';
import { classify, legalPlays, pusoyDosEngine as E, type PdMove, type PdState } from '../src/games/pusoy-dos/engine';
import { makeCard } from '../src/games/cards';
import { BOT_LEVELS, type BotLevel } from '../src/core/play';

// suits are S H D C = 0..3, ranks A=1 .. K=13
const C = (suit: 'S' | 'H' | 'D' | 'C', rank: number) => makeCard('SHDC'.indexOf(suit), rank);
const players = ['A', 'B', 'C', 'D'];
const setupOf = (over: Partial<PusoyDosSetup> = {}): PusoyDosSetup => ({ ...pusoyDos.defaultSetup(4), ...over });

describe('rng', () => {
  it('is deterministic per seed and shuffles every card exactly once', () => {
    const a = shuffle(Array.from({ length: 52 }, (_, i) => i), makeRng(7));
    const b = shuffle(Array.from({ length: 52 }, (_, i) => i), makeRng(7));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect(shuffle(a, makeRng(8))).not.toEqual(a);
  });
  it('reaches every ordering of three items', () => {
    const seen = new Set<string>();
    for (let s = 1; s < 200; s++) seen.add(shuffle([1, 2, 3], makeRng(s)).join());
    expect(seen.size).toBe(6);
  });
});

describe('classify', () => {
  it('orders plays: suits C < S < H < D, 2 highest', () => {
    expect(classify([C('C', 5)])!.rank).toBeLessThan(classify([C('S', 5)])!.rank);
    expect(classify([C('S', 5)])!.rank).toBeLessThan(classify([C('H', 5)])!.rank);
    expect(classify([C('H', 5)])!.rank).toBeLessThan(classify([C('D', 5)])!.rank);
    expect(classify([C('C', 1)])!.rank).toBeLessThan(classify([C('C', 2)])!.rank);
    expect(classify([C('D', 1)])!.rank).toBeLessThan(classify([C('C', 2)])!.rank);
  });
  it('ranks five-card hands straight < flush < full house < four+1 < straight flush', () => {
    const straight = classify([C('C', 3), C('S', 4), C('H', 5), C('D', 6), C('C', 7)])!;
    const flush = classify([C('H', 3), C('H', 5), C('H', 7), C('H', 9), C('H', 11)])!;
    const full = classify([C('C', 9), C('S', 9), C('H', 9), C('C', 4), C('S', 4)])!;
    const four = classify([C('C', 9), C('S', 9), C('H', 9), C('D', 9), C('S', 4)])!;
    const sf = classify([C('H', 3), C('H', 4), C('H', 5), C('H', 6), C('H', 7)])!;
    expect([straight.kind, flush.kind, full.kind, four.kind, sf.kind]).toEqual(['straight', 'flush', 'fullHouse', 'fourPlus', 'straightFlush']);
    const r = [straight, flush, full, four, sf].map((x) => x.rank);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
  });
  it('rejects non-plays', () => {
    expect(classify([C('C', 3), C('S', 4)])).toBeNull();
    expect(classify([C('C', 3), C('C', 3)])).toBeNull();
    expect(classify([C('C', 3), C('S', 4), C('H', 5), C('D', 6), C('C', 8)])).toBeNull();
    expect(classify([C('C', 3), C('S', 3), C('H', 3), C('D', 3)])).toBeNull();
  });
  it('allows J-Q-K-A-2 and does not wrap', () => {
    expect(classify([C('C', 11), C('S', 12), C('H', 13), C('D', 1), C('C', 2)])!.kind).toBe('straight');
    expect(classify([C('C', 12), C('S', 13), C('H', 1), C('D', 2), C('C', 3)])).toBeNull();
  });
});

describe('dealing and turn rules', () => {
  it('deals 13 each, the lowest card leads and must be in the first play', () => {
    const s = E.start(setupOf(), players, 11);
    for (const id of players) expect(s.hands[id]).toHaveLength(13);
    const all = players.flatMap((id) => s.hands[id]!);
    expect(new Set(all).size).toBe(52);
    expect(s.mustInclude).toBe(C('C', 3));
    expect(s.turn).toBe(players.find((id) => s.hands[id]!.includes(C('C', 3))));
    const other = s.hands[s.turn!]!.find((c) => c !== s.mustInclude)!;
    expect(E.validate(s, s.turn!, { t: 'play', cards: [other] })).not.toEqual([]);
    expect(E.validate(s, s.turn!, { t: 'play', cards: [s.mustInclude] })).toEqual([]);
    expect(E.validate(s, s.turn!, { t: 'pass' })).not.toEqual([]); // cannot pass when leading
    const notTurn = players.find((id) => id !== s.turn)!;
    expect(E.validate(s, notTurn, { t: 'pass' })).toEqual(['it is not your turn']);
  });

  it('deals fewer cards when the deck cannot cover the table', () => {
    const s = E.start(setupOf({ startingHand: 17 }), players, 3);
    expect(s.hands.A).toHaveLength(13);
    const s3 = E.start(setupOf({ startingHand: 17 }), ['A', 'B', 'C'], 3);
    expect(s3.hands.A).toHaveLength(17);
  });

  const fixed = (hands: Record<string, number[]>, over: Partial<PdState> = {}): PdState => ({
    rules: { scoring: 'winner-take-all', deuce: 'off' },
    players: Object.keys(hands),
    hands,
    turn: Object.keys(hands)[0]!,
    lead: null,
    passed: [],
    out: [],
    played: [],
    mustInclude: null,
    finalPlay: null,
    done: false,
    ...over,
  });

  it('enforces size and rank against the lead, and passing rotates back to the last player', () => {
    let s = fixed({ A: [C('C', 4), C('S', 4), C('D', 9)], B: [C('H', 5), C('D', 5), C('C', 6)], C: [C('C', 7), C('S', 8), C('H', 9)] });
    s = E.apply(s, 'A', { t: 'play', cards: [C('C', 4), C('S', 4)] });
    expect(s.turn).toBe('B');
    expect(E.validate(s, 'B', { t: 'play', cards: [C('C', 6)] })[0]).toMatch(/match the lead/);
    expect(E.validate(s, 'B', { t: 'play', cards: [C('H', 5), C('D', 5)] })).toEqual([]);
    s = E.apply(s, 'B', { t: 'pass' });
    expect(s.turn).toBe('C');
    s = E.apply(s, 'C', { t: 'pass' });
    expect(s.lead).toBeNull();
    expect(s.turn).toBe('A'); // A made the last play, so A leads again
    expect(s.passed).toEqual([]);
  });

  it('a player who passed stays out of the whole trick, even after someone else plays again', () => {
    let s = fixed(
      { A: [C('C', 4), C('S', 9)], B: [C('H', 6), C('D', 12)], C: [C('S', 7), C('D', 13)], D: [C('C', 8), C('H', 9)] },
    );
    s = E.apply(s, 'A', { t: 'play', cards: [C('C', 4)] });
    s = E.apply(s, 'B', { t: 'pass' });
    s = E.apply(s, 'C', { t: 'play', cards: [C('S', 7)] });
    s = E.apply(s, 'D', { t: 'pass' });
    expect(s.turn).toBe('A');
    s = E.apply(s, 'A', { t: 'pass' });
    // B passed earlier, so the trick is over and C (last play) leads; B does not get another chance to beat the 7
    expect(s.lead).toBeNull();
    expect(s.turn).toBe('C');
  });

  it('a pair of equal rank beats by suit', () => {
    const s = fixed({ A: [C('C', 5), C('S', 5)], B: [C('H', 5), C('D', 5)] }, { lead: { by: 'A', cards: [C('C', 5), C('S', 5)] }, turn: 'B' });
    expect(E.validate(s, 'B', { t: 'play', cards: [C('H', 5), C('D', 5)] })).toEqual([]);
  });

  it('winner takes all: first out ends the hand and result maps to a scoreable input', () => {
    let s = fixed({ A: [C('C', 4)], B: [C('H', 5), C('D', 5)], C: [C('C', 7)], D: [C('C', 8)] });
    s = E.apply(s, 'A', { t: 'play', cards: [C('C', 4)] });
    expect(s.done).toBe(true);
    const input = { ...E.result(s)!, stake: 50 } as never;
    expect(pusoyDos.validate(setupOf(), players, input)).toEqual([]);
    const net = pusoyDos.score(setupOf(), players, input);
    expect(net).toEqual({ A: 150, B: -50, C: -50, D: -50 });
  });

  it('cards-left reports what each loser holds and counts 2s when the multiplier is on', () => {
    const setup = setupOf({ scoring: 'cards-left', deuce: 'pow2' });
    let s = fixed({ A: [C('C', 2)], B: [C('H', 5), C('D', 5)], C: [C('C', 7)], D: [C('C', 8)] }, { rules: { scoring: 'cards-left', deuce: 'pow2' }, mustInclude: null });
    s = E.apply(s, 'A', { t: 'play', cards: [C('C', 2)] });
    const r = E.result(s)!;
    expect(r).toEqual({ winner: 'A', deuces: 1, cardsLeft: { B: 2, C: 1, D: 1 } });
    expect(pusoyDos.validate(setup, players, { ...r, stake: 1 } as never)).toEqual([]);
  });

  it('placement plays on until one player remains', () => {
    let s = fixed({ A: [C('C', 4)], B: [C('H', 5)], C: [C('C', 7), C('S', 7)] }, { rules: { scoring: 'placement', deuce: 'off' } });
    s = E.apply(s, 'A', { t: 'play', cards: [C('C', 4)] });
    expect(s.done).toBe(false);
    expect(s.turn).toBe('B');
    s = E.apply(s, 'B', { t: 'play', cards: [C('H', 5)] });
    expect(s.done).toBe(true);
    expect(E.result(s)).toEqual({ order: ['A', 'B', 'C'] });
  });

  it('views never contain another player’s cards until the hand is over', () => {
    const s = E.start(setupOf(), players, 5);
    const v = E.viewFor(s, 'B');
    expect([...v.hand].sort((a, b) => a - b)).toEqual([...s.hands.B!].sort((a, b) => a - b));
    expect(v.hands).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.hands.A));
    expect(E.viewFor(s, null).hand).toEqual([]);
  });
});

function playOut(seed: number, levels: BotLevel[], setup = setupOf(), n = levels.length) {
  const ids = players.slice(0, n);
  let s = E.start(setup, ids, seed);
  let moves = 0;
  while (!s.done) {
    const who = s.turn!;
    const view = E.viewFor(s, who);
    const level = levels[ids.indexOf(who)]!;
    const move: PdMove = E.bot(view, level, mixSeed(seed, moves));
    expect(E.validate(s, who, move)).toEqual([]);
    s = E.apply(s, who, move);
    if (++moves > 600) throw new Error('hand did not end');
  }
  return s;
}

describe('computer players', () => {
  it('always play legally and every hand ends, at every level and table size', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const level = BOT_LEVELS[seed % 3]!;
      for (const n of [2, 3, 4]) {
        const s = playOut(seed, Array(n).fill(level), setupOf(), n);
        expect(s.done).toBe(true);
        const input = { ...E.result(s)!, stake: 1 };
        const ids = players.slice(0, n);
        expect(pusoyDos.validate(setupOf(), ids, input as never)).toEqual([]);
      }
    }
  });
  it('also finish in cards-left and placement modes with zero-sum scores', () => {
    for (const scoring of ['cards-left', 'placement'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const setup = setupOf({ scoring, deuce: 'double-once' });
        const s = playOut(seed, ['easy', 'normal', 'hard', 'normal'], setup);
        const input = { ...E.result(s)!, stake: 1 };
        expect(pusoyDos.validate(setup, players, input as never)).toEqual([]);
        const net = pusoyDos.score(setup, players, input as never);
        expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
      }
    }
  });
  it('stronger levels win more often (one seat against three weaker ones; 25% is an even share)', () => {
    const share = (strong: BotLevel, weak: BotLevel, games: number): number => {
      let wins = 0;
      for (let seed = 1; seed <= games; seed++) {
        const seat = seed % 4;
        const levels = [0, 1, 2, 3].map((i) => (i === seat ? strong : weak));
        if (playOut(seed, levels).out[0] === players[seat]) wins++;
      }
      return wins / games;
    };
    expect(share('hard', 'easy', 600)).toBeGreaterThan(0.5);
    expect(share('normal', 'easy', 600)).toBeGreaterThan(0.45);
    expect(share('hard', 'normal', 800)).toBeGreaterThan(0.27);
  }, 60_000);
  it('timeoutMove is always legal', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = E.start(setupOf(), players, seed);
      for (let i = 0; i < 30 && !s.done; i++) {
        const who = s.turn!;
        const m = E.timeoutMove(E.viewFor(s, who));
        expect(E.validate(s, who, m)).toEqual([]);
        s = E.apply(s, who, m);
      }
    }
  });
  it('legalPlays only returns plays that beat the lead', () => {
    const hand = [C('C', 4), C('S', 4), C('H', 4), C('D', 9), C('C', 10), C('S', 11), C('H', 12), C('D', 13)];
    const lead = classify([C('C', 5), C('S', 5)])!;
    const plays = legalPlays(hand, lead, null);
    expect(plays.every((p) => p.combo.size === 2 && p.combo.rank > lead.rank)).toBe(true);
    expect(plays).toHaveLength(0); // the 4s are lower than the pair of 5s
  });
});
