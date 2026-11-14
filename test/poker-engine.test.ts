import { describe, expect, it } from 'vitest';
import { mixSeed } from '../src/core/rng';
import { BOT_LEVELS, type BotLevel } from '../src/core/play';
import { makeCard } from '../src/games/cards';
import { defaultSetup, poker, type PokerSetup } from '../src/games/poker';
import { bestOf, buildPots, chen, pokerEngine as E, type PkMove, type PkState } from '../src/games/poker/engine';

const C = (suit: 'S' | 'H' | 'D' | 'C', rank: number) => makeCard('SHDC'.indexOf(suit), rank);
const setup: PokerSetup = { ...defaultSetup(), buyIn: 100, smallBlind: 1, bigBlind: 2 };

describe('hand strength (best five of seven)', () => {
  const key = (cards: number[]) => bestOf(cards).key;
  it('orders hands, including the wheel and ties', () => {
    const pairAces = key([C('S', 1), C('H', 1), C('D', 5), C('C', 7), C('S', 9), C('H', 11), C('D', 3)]);
    const twoPair = key([C('S', 2), C('H', 2), C('D', 5), C('C', 5), C('S', 9), C('H', 11), C('D', 3)]);
    const wheel = key([C('S', 1), C('H', 2), C('D', 3), C('C', 4), C('S', 5), C('H', 11), C('D', 13)]);
    const sixHigh = key([C('S', 2), C('H', 3), C('D', 4), C('C', 5), C('S', 6), C('H', 11), C('D', 13)]);
    const flush = key([C('H', 2), C('H', 6), C('H', 9), C('H', 11), C('H', 13), C('S', 4), C('D', 4)]);
    expect(twoPair).toBeGreaterThan(pairAces);
    expect(wheel).toBeGreaterThan(twoPair);
    expect(sixHigh).toBeGreaterThan(wheel);
    expect(flush).toBeGreaterThan(sixHigh);
  });
  it('plays the board when it is best, and ties on equal hands', () => {
    const board = [C('S', 10), C('H', 11), C('D', 12), C('C', 13), C('S', 1)];
    expect(key([C('H', 2), C('D', 3), ...board])).toBe(key([C('C', 4), C('H', 5), ...board]));
  });
  it('chen scores pairs and suited connectors sensibly', () => {
    expect(chen([C('S', 1), C('H', 1)])).toBeGreaterThan(chen([C('S', 13), C('H', 12)]));
    expect(chen([C('S', 13), C('S', 12)])).toBeGreaterThan(chen([C('S', 13), C('H', 12)]));
    expect(chen([C('S', 7), C('H', 2)])).toBeLessThan(chen([C('S', 7), C('S', 8)]));
  });
});

describe('side pots', () => {
  it('builds a main pot and side pots from what each put in', () => {
    const pots = buildPots({ A: 100, B: 200, C: 400 }, new Set());
    expect(pots).toEqual([{ amount: 300, eligible: ['A', 'B', 'C'] }, { amount: 200, eligible: ['B', 'C'] }, { amount: 200, eligible: ['C'] }]);
  });
  it('a folded player funds the pots but cannot win them', () => {
    const pots = buildPots({ A: 50, B: 100, C: 100 }, new Set(['A']));
    expect(pots).toEqual([{ amount: 250, eligible: ['B', 'C'] }]); // one pot: the folded player's chips join it
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(250);
  });
});

// ---- helpers for fixed hands
type Rig = { holes?: Record<string, [number, number]>; board?: number[]; button?: number; stacks?: Record<string, number>; setup?: PokerSetup };
function hand(players: string[], rig: Rig = {}): PkState {
  const stacks = rig.stacks ?? Object.fromEntries(players.map((id) => [id, 100]));
  const prev = { button: ((rig.button ?? 0) + players.length - 1) % players.length, endStacks: stacks } as unknown as PkState;
  const s = E.start(rig.setup ?? setup, players, 7, prev);
  for (const [id, h] of Object.entries(rig.holes ?? {})) s.seats[id]!.hole = h;
  if (rig.board) {
    const [f1, f2, f3, t, r] = rig.board as [number, number, number, number, number];
    const used = new Set([...players.flatMap((id) => s.seats[id]!.hole), ...rig.board]);
    const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c));
    // pops come out: burn, flop x3, burn, turn, burn, river
    s.deck = [...rest, r, rest[0]!, t, rest[1]!, f3, f2, f1, rest[2]!];
  }
  return s;
}
const act = (s: PkState, id: string, m: PkMove): PkState => {
  expect(E.validate(s, id, m)).toEqual([]);
  return E.apply(s, id, m);
};

describe('a hand of hold\'em', () => {
  const P3 = ['A', 'B', 'C'];

  it('posts the blinds left of the button and starts the action after the big blind', () => {
    const s = hand(P3, { button: 0 });
    expect([s.seats.B!.bet, s.seats.C!.bet, s.seats.A!.bet]).toEqual([1, 2, 0]);
    expect(E.toAct(s)).toBe('A'); // the button is first to act with three players
    expect(s.currentBet).toBe(2);
    expect(s.street).toBe('preflop');
  });
  it('heads-up: the button posts the small blind and acts first before the flop, last after', () => {
    let s = hand(['A', 'B'], { button: 0, board: [C('S', 2), C('H', 5), C('D', 9), C('C', 11), C('S', 13)] });
    expect([s.seats.A!.bet, s.seats.B!.bet]).toEqual([1, 2]);
    expect(E.toAct(s)).toBe('A');
    s = act(s, 'A', { t: 'call' });
    s = act(s, 'B', { t: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(E.toAct(s)).toBe('B'); // after the flop the big blind (not the button) acts first
  });
  it('everyone folding to the big blind wins the blinds with no showdown', () => {
    let s = hand(P3, { button: 0 });
    s = act(s, 'A', { t: 'fold' });
    s = act(s, 'B', { t: 'fold' });
    expect(s.street).toBe('over');
    expect(s.endStacks).toEqual({ A: 100, B: 99, C: 101 });
    expect(E.viewFor(s, 'C').reveal).toEqual([]); // nobody had to show
  });
  it('rejects illegal actions: out of turn, check facing a bet, too small a raise, more chips than you have', () => {
    const s = hand(P3, { button: 0 });
    expect(E.validate(s, 'B', { t: 'fold' })[0]).toMatch(/not your turn/);
    expect(E.validate(s, 'A', { t: 'check' })[0]).toMatch(/cannot check/);
    expect(E.validate(s, 'A', { t: 'raise', to: 3 })[0]).toMatch(/smallest raise is to 4/);
    expect(E.validate(s, 'A', { t: 'raise', to: 101 })[0]).toMatch(/that many chips/);
    expect(E.validate(s, 'A', { t: 'raise', to: 4 })).toEqual([]);
    expect(E.validate(s, 'A', { t: 'raise', to: 100 })).toEqual([]); // all in
  });
  it('a full raise sets the next minimum; the raise size is at least the last raise', () => {
    let s = hand(P3, { button: 0 });
    s = act(s, 'A', { t: 'raise', to: 10 }); // raise of 8
    expect(E.validate(s, 'B', { t: 'raise', to: 17 })[0]).toMatch(/smallest raise is to 18/);
    expect(E.validate(s, 'B', { t: 'raise', to: 18 })).toEqual([]);
  });
  it('a short all-in does not let players who already acted raise again', () => {
    // A raises to 20, B (stack 25) shoves for 25 (a raise of 5, short of 18), then A may only call or fold
    let s = hand(P3, { button: 0, stacks: { A: 100, B: 25, C: 100 } });
    s = act(s, 'A', { t: 'raise', to: 20 });
    s = act(s, 'B', { t: 'raise', to: 25 });
    expect(E.viewFor(s, 'A').raise).toBeNull();
    s = act(s, 'C', { t: 'call' });
    expect(E.toAct(s)).toBe('A');
    expect(E.validate(s, 'A', { t: 'raise', to: 60 })[0]).toMatch(/cannot raise/);
    expect(E.validate(s, 'A', { t: 'call' })).toEqual([]);
    expect(E.viewFor(s, 'A').raise).toBeNull();
  });
  it('deals 3, 1, 1 board cards and a check-around reaches the showdown; best hand wins', () => {
    let s = hand(['A', 'B'], {
      button: 0,
      holes: { A: [C('S', 1), C('H', 1)], B: [C('S', 7), C('H', 8)] },
      board: [C('D', 2), C('C', 5), C('D', 9), C('S', 12), C('H', 3)],
    });
    s = act(s, 'A', { t: 'call' });
    s = act(s, 'B', { t: 'check' });
    for (const street of ['flop', 'turn', 'river']) {
      expect(s.street).toBe(street);
      s = act(s, 'B', { t: 'check' });
      s = act(s, 'A', { t: 'check' });
    }
    expect(s.street).toBe('over');
    expect(s.board).toHaveLength(5);
    expect(s.endStacks).toEqual({ A: 102, B: 98 }); // the pot is the two 2-chip bets
    expect(E.viewFor(s, 'B').reveal!.map((r) => r.id).sort()).toEqual(['A', 'B']);
  });
  it('all-in against several stacks pays main and side pots to the right winners', () => {
    // A (100) has the best hand, B (200) the second best, C (400) the worst; all go all in preflop
    let s = hand(P3, {
      button: 0,
      stacks: { A: 100, B: 200, C: 400 },
      holes: { A: [C('S', 1), C('H', 1)], B: [C('S', 13), C('H', 13)], C: [C('S', 7), C('H', 2)] },
      board: [C('D', 4), C('C', 6), C('D', 9), C('S', 11), C('H', 3)],
    });
    s = act(s, 'A', { t: 'raise', to: 100 });
    s = act(s, 'B', { t: 'raise', to: 200 });
    s = act(s, 'C', { t: 'call' });
    expect(s.street).toBe('over');
    // main pot 300 to A, side pot 200 (B vs C) to B; C only called 200 and keeps the other 200 in the stack
    expect(s.endStacks).toEqual({ A: 300, B: 200, C: 200 });
    expect(Object.values(s.endStacks!).reduce((a, b) => a + b, 0)).toBe(700);
  });
  it('a tie on the board returns everyone their chips', () => {
    let s = hand(P3, {
      button: 0,
      holes: { A: [C('S', 2), C('H', 3)], B: [C('D', 2), C('C', 3)], C: [C('S', 4), C('H', 6)] },
      board: [C('D', 10), C('C', 11), C('D', 12), C('S', 13), C('H', 1)], // broadway on the board: everyone plays it
    });
    s = act(s, 'A', { t: 'raise', to: 4 });
    s = act(s, 'B', { t: 'call' });
    s = act(s, 'C', { t: 'call' });
    for (let i = 0; i < 3; i++) {
      s = act(s, 'B', { t: 'check' });
      s = act(s, 'C', { t: 'check' });
      s = act(s, 'A', { t: 'check' });
    }
    expect(s.street).toBe('over');
    expect(s.endStacks).toEqual({ A: 100, B: 100, C: 100 });
  });
  it('gives the odd chip to the first winner left of the button', () => {
    let s = hand(P3, {
      button: 0,
      holes: { A: [C('S', 2), C('H', 3)], B: [C('D', 2), C('C', 3)], C: [C('S', 4), C('H', 6)] },
      board: [C('D', 10), C('C', 11), C('D', 12), C('S', 13), C('H', 1)],
    });
    s = act(s, 'A', { t: 'call' });
    s = act(s, 'B', { t: 'fold' }); // the small blind's 1 chip stays in the pot
    s = act(s, 'C', { t: 'check' });
    for (let i = 0; i < 3; i++) {
      s = act(s, 'C', { t: 'check' });
      s = act(s, 'A', { t: 'check' });
    }
    // pot 2 + 2 + 1 = 5, A and C tie on the board: 2 each and the odd chip goes to C (first left of the button A)
    expect(s.endStacks).toEqual({ A: 100, B: 99, C: 101 });
  });
});

describe('stress-test regressions', () => {
  it('chips from players who folded do not split a pot in two (an odd chip is divided once)', () => {
    // A, D, E put in 2 each; B and C folded with 1 each: one pot of 8 for A, D, E, not 5 + 3
    expect(buildPots({ A: 2, B: 1, C: 1, D: 2, E: 2 }, new Set(['B', 'C']))).toEqual([{ amount: 8, eligible: ['A', 'D', 'E'] }]);
    // but a real all-in still makes a side pot
    expect(buildPots({ A: 2, B: 1, D: 5 }, new Set(['B']))).toEqual([{ amount: 5, eligible: ['A', 'D'] }, { amount: 3, eligible: ['D'] }]);
  });
});

describe('betting rules from the review', () => {
  const P4 = ['A', 'B', 'C', 'D'];
  it('a short big blind does not lower the bet to call or the minimum raise', () => {
    // C is the big blind with one chip: blinds are 1 and 2, but the bet to match stays 2
    const s = hand(['A', 'B', 'C'], { button: 0, stacks: { A: 100, B: 100, C: 1 } });
    expect(s.seats.C!.bet).toBe(1);
    expect(s.currentBet).toBe(2);
    expect(E.viewFor(s, 'A').toCall).toBe(2);
    expect(E.viewFor(s, 'A').raise).toEqual({ min: 4, max: 100 });
  });
  it('several short all-ins that add up to a full raise reopen the betting', () => {
    // D raises to 10 (a raise of 8), A calls, B shoves to 15 (+5), C shoves to 20 (+5): 10 more than D faced, so D may re-raise
    let s = hand(P4, { button: 0, stacks: { A: 100, B: 15, C: 20, D: 100 } });
    s = act(s, 'D', { t: 'raise', to: 10 });
    s = act(s, 'A', { t: 'call' });
    s = act(s, 'B', { t: 'raise', to: 15 });
    expect(s.minRaise).toBe(8); // 5 is short of a full raise
    s = act(s, 'C', { t: 'raise', to: 20 });
    expect(E.toAct(s)).toBe('D');
    expect(E.viewFor(s, 'D').raise).not.toBeNull();
    // but A (who called 10 and now faces +10 as well) is in the same position, and one short all-in alone would not reopen
    let t = hand(P4, { button: 0, stacks: { A: 100, B: 15, C: 100, D: 100 } });
    t = act(t, 'D', { t: 'raise', to: 10 });
    t = act(t, 'A', { t: 'call' });
    t = act(t, 'B', { t: 'raise', to: 15 });
    t = act(t, 'C', { t: 'fold' });
    expect(E.toAct(t)).toBe('D');
    expect(E.viewFor(t, 'D').raise).toBeNull();
  });
  it('after a hand the seats show the stacks after the payouts, and wins are what each winner gained', () => {
    // A (100) shoves against B (10): A's 90 extra chips are an uncalled bet coming back, not winnings
    let s = hand(['A', 'B'], { button: 0, stacks: { A: 100, B: 10 }, holes: { A: [C('S', 2), C('H', 3)], B: [C('S', 1), C('H', 1)] }, board: [C('D', 5), C('C', 8), C('D', 9), C('S', 11), C('H', 13)] });
    s = act(s, 'A', { t: 'raise', to: 100 });
    s = act(s, 'B', { t: 'call' });
    expect(s.street).toBe('over');
    expect(s.endStacks).toEqual({ A: 90, B: 20 });
    const v = E.viewFor(s, 'A');
    expect(v.seat.A!.stack).toBe(90);
    expect(v.seat.B!.stack).toBe(20);
    expect(v.wins).toEqual([{ id: 'B', amount: 10 }]);
  });
  it('a stack bigger than one ledger entry is written as several buy-ins and still validates', () => {
    const big = 2_500_000_000;
    let s = hand(['A', 'B'], { button: 0, stacks: { A: big, B: big } });
    s = act(s, 'A', { t: 'fold' });
    const input = E.result(s)! as { buyIns: Record<string, number[]> };
    expect(input.buyIns.A).toEqual([1_000_000_000, 1_000_000_000, 500_000_000]);
    expect(poker.validate(setup, ['A', 'B'], input as never)).toEqual([]);
  });
});

describe('hands in a row and the ledger', () => {
  it('stacks carry over, the button moves, and a busted player buys back in', () => {
    const a = hand(['A', 'B', 'C'], { button: 0, stacks: { A: 100, B: 100, C: 100 } });
    let s = act(a, 'A', { t: 'raise', to: 100 });
    s = act(s, 'B', { t: 'call' });
    s = act(s, 'C', { t: 'call' });
    expect(s.street).toBe('over');
    const stacks = s.endStacks!;
    expect(Object.values(stacks).reduce((x, y) => x + y, 0)).toBe(300);
    const next = E.start(setup, ['A', 'B', 'C'], 99, s);
    expect(next.button).toBe(1);
    for (const id of ['A', 'B', 'C']) expect(next.startStacks[id]).toBe(stacks[id]! > 0 ? stacks[id] : 100);
  });
  it('the finished hand is a valid Poker round (buy-in = start stack, cash-out = end stack) and zero-sum', () => {
    let s = hand(['A', 'B', 'C'], { button: 0 });
    s = act(s, 'A', { t: 'raise', to: 30 });
    s = act(s, 'B', { t: 'fold' });
    s = act(s, 'C', { t: 'fold' });
    const input = E.result(s)!;
    expect(poker.validate(setup, ['A', 'B', 'C'], input as never)).toEqual([]);
    const net = poker.score(setup, ['A', 'B', 'C'], input as never);
    expect(net).toEqual({ A: 3, B: -1, C: -2 });
    expect(E.result(hand(['A', 'B'], {}))).toBeNull();
  });
  it('views hide other players’ hole cards until the showdown', () => {
    const s = hand(['A', 'B'], { button: 0 });
    const v = E.viewFor(s, 'A');
    expect(v.hole).toEqual(s.seats.A!.hole);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.seats.B!.hole));
    expect(E.viewFor(s, null).hole).toEqual([]);
    expect(v.reveal).toBeUndefined();
  });
});

function playHand(prev: PkState | null, seed: number, levels: BotLevel[], n = levels.length): PkState {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
  let s = E.start(setup, ids, seed, prev);
  let moves = 0;
  while (s.street !== 'over') {
    const who = E.toAct(s)!;
    const move = E.bot(E.viewFor(s, who), levels[ids.indexOf(who)]!, mixSeed(seed, moves));
    expect(E.validate(s, who, move)).toEqual([]);
    s = E.apply(s, who, move);
    if (++moves > 200) throw new Error('hand did not end');
  }
  return s;
}

describe('computer players', () => {
  it('always act legally, every hand ends, chips are conserved, and the result is a valid zero-sum round', () => {
    for (const n of [2, 3, 6]) {
      let prev: PkState | null = null;
      for (let seed = 1; seed <= 25; seed++) {
        const levels = Array.from({ length: n }, (_, i) => BOT_LEVELS[(seed + i) % 3]!);
        const s = playHand(prev, seed * 31 + n, levels);
        const ids = s.players;
        expect(Object.values(s.endStacks!).reduce((a, b) => a + b, 0)).toBe(Object.values(s.startStacks).reduce((a, b) => a + b, 0));
        const input = E.result(s)!;
        expect(poker.validate(setup, ids, input as never)).toEqual([]);
        expect(Object.values(poker.score(setup, ids, input as never)).reduce((a, b) => a + b, 0)).toBe(0);
        prev = s;
      }
    }
  });
  it('timeoutMove is always legal (check if free, otherwise fold)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = E.start(setup, ['A', 'B', 'C', 'D'], seed, null);
      while (s.street !== 'over') {
        const who = E.toAct(s)!;
        const m = E.timeoutMove(E.viewFor(s, who));
        expect(E.validate(s, who, m)).toEqual([]);
        s = E.apply(s, who, m);
      }
    }
  });
  it('stronger levels win more chips per hand (one seat against two weaker ones, fresh stacks each hand)', () => {
    const avg = (strong: BotLevel, weak: BotLevel, hands: number): number => {
      let won = 0;
      for (let seed = 1; seed <= hands; seed++) {
        const seat = seed % 3;
        const levels = [0, 1, 2].map((i) => (i === seat ? strong : weak));
        const s = playHand(null, seed, levels);
        const id = s.players[seat]!;
        won += s.endStacks![id]! - s.startStacks[id]!;
      }
      return won / hands;
    };
    expect(avg('hard', 'easy', 400)).toBeGreaterThan(2);
    expect(avg('normal', 'easy', 400)).toBeGreaterThan(1);
    expect(avg('hard', 'normal', 600)).toBeGreaterThan(0);
  }, 300_000);
});
