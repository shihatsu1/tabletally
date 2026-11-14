import { describe, expect, it } from 'vitest';
import { mixSeed } from '../src/core/rng';
import { BOT_LEVELS, type BotLevel } from '../src/core/play';
import { makeCard } from '../src/games/cards';
import { tongIts, type TongItsSetup } from '../src/games/tong-its';
import { canSapaw, handPoints, keepsDiscardMeld, meldKind, meldsContaining, tongItsEngine as E, type TiMove, type TiState } from '../src/games/tong-its/engine';

const C = (suit: 'S' | 'H' | 'D' | 'C', rank: number) => makeCard('SHDC'.indexOf(suit), rank);
const players = ['A', 'B', 'C'];
const setup: TongItsSetup = tongIts.defaultSetup(3);

describe('melds', () => {
  it('knows sets, runs (ace low only) and non-melds', () => {
    expect(meldKind([C('S', 7), C('H', 7), C('D', 7)])).toBe('set');
    expect(meldKind([C('S', 7), C('H', 7), C('D', 7), C('C', 7)])).toBe('set');
    expect(meldKind([C('S', 1), C('S', 2), C('S', 3)])).toBe('run');
    expect(meldKind([C('S', 12), C('S', 13), C('S', 1)])).toBeNull();
    expect(meldKind([C('S', 4), C('S', 5), C('H', 6)])).toBeNull();
    expect(meldKind([C('S', 4), C('S', 5)])).toBeNull();
    expect(meldKind([C('S', 4), C('S', 4), C('S', 4)])).toBeNull();
  });
  it('lays off onto sets (only a fourth card) and runs (either end)', () => {
    expect(canSapaw('set', [C('S', 7), C('H', 7), C('D', 7)], C('C', 7))).toBe(true);
    expect(canSapaw('set', [C('S', 7), C('H', 7), C('D', 7), C('C', 7)], C('C', 8))).toBe(false);
    expect(canSapaw('run', [C('S', 4), C('S', 5), C('S', 6)], C('S', 7))).toBe(true);
    expect(canSapaw('run', [C('S', 4), C('S', 5), C('S', 6)], C('S', 3))).toBe(true);
    expect(canSapaw('run', [C('S', 4), C('S', 5), C('S', 6)], C('S', 8))).toBe(false);
    expect(canSapaw('run', [C('S', 4), C('S', 5), C('S', 6)], C('H', 7))).toBe(false);
    expect(canSapaw('run', [C('S', 11), C('S', 12), C('S', 13)], C('S', 1))).toBe(false);
  });
  it('finds the melds a card can join', () => {
    expect(meldsContaining([C('S', 5), C('H', 5)], C('D', 5)).length).toBeGreaterThan(0);
    expect(meldsContaining([C('S', 5), C('S', 7)], C('S', 6))).toContainEqual([C('S', 5), C('S', 6), C('S', 7)].sort((a, b) => a - b));
    expect(meldsContaining([C('S', 5), C('H', 9)], C('D', 5))).toEqual([]);
    expect(meldsContaining([C('S', 1), C('S', 2)], C('S', 3)).length).toBe(1);
  });
});

describe('dealing', () => {
  it('deals 13 to the dealer and 12 to the others with a 15-card stock, deterministically', () => {
    const s = E.start(setup, players, 5);
    const sizes = players.map((id) => s.hands[id]!.length).sort();
    expect(sizes).toEqual([12, 12, 13]);
    expect(s.hands[s.turn]!.length).toBe(13);
    expect(s.stock).toHaveLength(15);
    const all = [...players.flatMap((id) => s.hands[id]!), ...s.stock];
    expect(new Set(all).size).toBe(52);
    expect(JSON.stringify(E.start(setup, players, 5))).toBe(JSON.stringify(s));
    expect(s.phase).toBe('play'); // the dealer opens by discarding
  });
});

const base = (over: Partial<TiState> & { hands: Record<string, number[]> }): TiState => ({
  players,
  stock: [C('D', 9), C('C', 12), C('H', 2)],
  discards: [],
  melds: [],
  nextMeld: 1,
  turn: 'A',
  phase: 'draw',
  drew: null,
  drawnCard: null,
  mustMeld: null,
  firstTurn: false,
  stockOut: false,
  fight: null,
  sagasa: { A: 0, B: 0, C: 0 },
  end: null,
  ...over,
});
const ok = (s: TiState, pid: string, m: TiMove) => {
  expect(E.validate(s, pid, m)).toEqual([]);
  return E.apply(s, pid, m);
};

describe('a turn', () => {
  it('draw, show a meld, discard, then the next player draws', () => {
    let s = base({ hands: { A: [C('S', 4), C('H', 4), C('D', 4), C('C', 13), C('S', 8)], B: [C('S', 1)], C: [C('S', 2)] } });
    expect(E.validate(s, 'A', { t: 'discard', card: C('S', 8) })[0]).toMatch(/draw first/);
    expect(E.validate(s, 'B', { t: 'draw', from: 'stock' })[0]).toMatch(/not your turn/);
    s = ok(s, 'A', { t: 'draw', from: 'stock' }); // takes the top, the last element (2 of hearts)
    expect(s.hands.A).toContain(C('H', 2));
    s = ok(s, 'A', { t: 'meld', cards: [C('S', 4), C('H', 4), C('D', 4)] });
    expect(s.melds[0]).toMatchObject({ owner: 'A', kind: 'set', hidden: false });
    s = ok(s, 'A', { t: 'discard', card: C('C', 13) });
    expect(s.turn).toBe('B');
    expect(s.phase).toBe('draw');
    expect(s.discards).toEqual([C('C', 13)]);
  });

  it('taking the discard needs a meld and then forces you to show it', () => {
    let s = base({ hands: { A: [C('S', 5), C('H', 5), C('C', 13)], B: [C('S', 1)], C: [C('S', 2)] }, discards: [C('D', 5)] });
    s = ok(s, 'A', { t: 'draw', from: 'discard' });
    expect(s.mustMeld).toBe(C('D', 5));
    expect(E.validate(s, 'A', { t: 'discard', card: C('C', 13) })[0]).toMatch(/show the meld/);
    s = ok(s, 'A', { t: 'meld', cards: [C('S', 5), C('H', 5), C('D', 5)] });
    expect(s.mustMeld).toBeNull();
    const bad = base({ hands: { A: [C('S', 6), C('H', 5)], B: [C('S', 1)], C: [C('S', 2)] }, discards: [C('D', 5)] });
    expect(E.validate(bad, 'A', { t: 'draw', from: 'discard' })[0]).toMatch(/only take the discard/);
  });

  it('does not let you use up the cards the discard needs before showing it (no dead end)', () => {
    let s = base({ hands: { A: [C('S', 5), C('H', 5), C('S', 6), C('S', 7), C('C', 13)], B: [C('S', 1)], C: [C('S', 2)] }, discards: [C('D', 5)] });
    s = ok(s, 'A', { t: 'draw', from: 'discard' });
    // showing the 5s-run S5 S6 S7 would use a 5 that the set 5-5-5 needs
    expect(E.validate(s, 'A', { t: 'meld', cards: [C('S', 5), C('S', 6), C('S', 7)] })[0]).toMatch(/keep the cards/);
  });

  it('lays off onto any shown meld, and a fourth card drawn from the stock onto your own set is a sagasa', () => {
    let s = base({
      hands: { A: [C('C', 7), C('S', 3)], B: [C('S', 1)], C: [C('S', 2)] },
      melds: [{ id: 1, owner: 'A', kind: 'set', cards: [C('S', 7), C('H', 7), C('D', 7)], hidden: false }, { id: 2, owner: 'B', kind: 'run', cards: [C('S', 4), C('S', 5), C('S', 6)], hidden: false }],
      nextMeld: 3,
      stock: [C('C', 7)],
    });
    s = E.apply(s, 'A', { t: 'draw', from: 'stock' });
    expect(s.stockOut).toBe(true);
    s = ok(s, 'A', { t: 'sapaw', meld: 2, card: C('S', 3) }); // someone else's run: allowed
    expect(s.melds[1]!.cards).toHaveLength(4);
    s = ok(s, 'A', { t: 'sapaw', meld: 1, card: C('C', 7) });
    expect(s.sagasa.A).toBe(1);
  });

  it('only a four of a kind can be shown face down, and others never see it', () => {
    let s = base({ hands: { A: [C('S', 9), C('H', 9), C('D', 9), C('C', 9), C('S', 2), C('S', 3)], B: [C('S', 1)], C: [C('S', 2)] }, phase: 'play', drew: 'stock' });
    expect(E.validate(s, 'A', { t: 'meld', cards: [C('S', 9), C('H', 9), C('D', 9)], hidden: true })[0]).toMatch(/only four/);
    s = ok(s, 'A', { t: 'meld', cards: [C('S', 9), C('H', 9), C('D', 9), C('C', 9)], hidden: true });
    expect(E.viewFor(s, 'B').melds[0]).toMatchObject({ hidden: true, cards: [], size: 4 });
    expect(E.viewFor(s, 'A').melds[0]!.cards).toHaveLength(4);
    expect(E.validate(s, 'A', { t: 'sapaw', meld: 1, card: C('S', 2) })[0]).toMatch(/face-down/);
  });
});

describe('how a hand ends', () => {
  it('Tong-its: using every card wins, and the result is scoreable (aces, secret set)', () => {
    let s = base({ hands: { A: [C('S', 9), C('H', 9), C('D', 9), C('C', 9), C('S', 1), C('H', 1), C('D', 1)], B: [C('S', 5)], C: [C('S', 6)] }, phase: 'play', drew: 'stock' });
    s = ok(s, 'A', { t: 'meld', cards: [C('S', 9), C('H', 9), C('D', 9), C('C', 9)], hidden: true });
    s = ok(s, 'A', { t: 'meld', cards: [C('S', 1), C('H', 1), C('D', 1)] });
    expect(s.phase).toBe('over');
    const r = E.result(s)!;
    expect(r).toEqual({ winner: 'A', ending: 'tongits', burned: ['B', 'C'], aces: 3, secrets: 1 });
    const input = { ...r, stake: 10 } as never;
    expect(tongIts.validate(setup, players, input)).toEqual([]);
    const net = tongIts.score(setup, players, input);
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
    expect(net.A).toBeGreaterThan(0);
  });

  it('going out by discarding your last card also ends the hand', () => {
    let s = base({ hands: { A: [C('S', 13)], B: [C('S', 5)], C: [C('S', 6)] }, phase: 'play', drew: 'stock', melds: [{ id: 1, owner: 'A', kind: 'set', cards: [C('S', 2), C('H', 2), C('D', 2)], hidden: false }], nextMeld: 2 });
    s = ok(s, 'A', { t: 'discard', card: C('S', 13) });
    expect(s.end).toEqual({ winner: 'A', ending: 'tongits' });
  });

  it('a Draw call: everyone folds, the caller wins an ordinary hand', () => {
    const melds = [{ id: 1, owner: 'A', kind: 'set' as const, cards: [C('S', 2), C('H', 2), C('D', 2)], hidden: false }];
    let s = base({ hands: { A: [C('S', 1)], B: [C('S', 13), C('H', 13)], C: [C('S', 12)] }, melds, nextMeld: 2 });
    s = ok(s, 'A', { t: 'fight' });
    // C has not shown a meld so cannot challenge; B has none either, so both fold and the hand ends at once
    expect(s.end).toEqual({ winner: 'A', ending: 'normal' });
    expect(E.result(s)).toMatchObject({ burned: ['B', 'C'] });
  });

  it('only a player who has shown a meld may call Draw', () => {
    const s = base({ hands: { A: [C('S', 1)], B: [C('S', 13)], C: [C('S', 12)] } });
    expect(E.validate(s, 'A', { t: 'fight' })[0]).toMatch(/after showing a meld/);
  });

  it('a challenge: lowest hand total wins, ties go to the challenger', () => {
    const melds = [
      { id: 1, owner: 'A', kind: 'set' as const, cards: [C('S', 2), C('H', 2), C('D', 2)], hidden: false },
      { id: 2, owner: 'B', kind: 'set' as const, cards: [C('S', 3), C('H', 3), C('D', 3)], hidden: false },
    ];
    const run = (a: number[], b: number[], reply: boolean) => {
      let s = base({ hands: { A: a, B: b, C: [C('S', 12)] }, melds, nextMeld: 3 });
      s = ok(s, 'A', { t: 'fight' });
      expect(E.toAct(s)).toBe('B'); // C has shown nothing, so only B is asked
      expect(E.validate(s, 'A', { t: 'respond', challenge: true })[0]).toMatch(/not your turn/);
      return ok(s, 'B', { t: 'respond', challenge: reply });
    };
    expect(run([C('S', 4)], [C('S', 5)], true).end).toEqual({ winner: 'A', ending: 'challenge' }); // 4 < 5
    expect(run([C('S', 5)], [C('S', 4)], true).end).toEqual({ winner: 'B', ending: 'challenge' });
    expect(run([C('S', 5)], [C('H', 5)], true).end).toEqual({ winner: 'B', ending: 'challenge' }); // tie: challenger
    expect(run([C('S', 5)], [C('S', 4)], false).end).toEqual({ winner: 'A', ending: 'normal' }); // fold
  });

  it('stock out: after the last draw and discard, the lowest total among players who showed a meld wins', () => {
    const melds = [
      { id: 1, owner: 'A', kind: 'set' as const, cards: [C('S', 2), C('H', 2), C('D', 2)], hidden: false },
      { id: 2, owner: 'B', kind: 'set' as const, cards: [C('S', 3), C('H', 3), C('D', 3)], hidden: false },
    ];
    let s = base({ hands: { A: [C('S', 9), C('S', 10)], B: [C('S', 1), C('H', 1)], C: [C('S', 1)] }, melds, nextMeld: 3, stock: [C('C', 4)], turn: 'A' });
    s = ok(s, 'A', { t: 'draw', from: 'stock' });
    expect(s.stockOut).toBe(true);
    s = ok(s, 'A', { t: 'discard', card: C('S', 10) });
    // B holds 2 points, A holds 13; C has the lowest of all but never opened, so is burned and cannot win
    expect(s.end).toEqual({ winner: 'B', ending: 'normal' });
    expect(E.result(s)).toMatchObject({ winner: 'B', burned: ['C'] });
    expect(handPoints(s.hands.B!)).toBe(2);
  });

  it('the pot goes to a player who wins two deals in a row, and counts the deals since it was emptied', () => {
    const f = (input: Record<string, unknown>, history: unknown[]) => E.finalize(input, setup, history);
    const win = (w: string, potDeals?: number) => ({ winner: w, ending: 'normal', stake: 1, ...(potDeals ? { potDeals } : {}) });
    expect(f({ winner: 'A', ending: 'normal' }, [])).toEqual({ winner: 'A', ending: 'normal' });
    expect(f({ winner: 'A', ending: 'normal' }, [win('B')])).toEqual({ winner: 'A', ending: 'normal' });
    expect(f({ winner: 'A', ending: 'normal' }, [win('B'), win('A')])).toMatchObject({ potDeals: 3 }); // 3rd deal since the pot was emptied
    expect(f({ winner: 'A', ending: 'normal' }, [win('B'), win('A', 2)])).toEqual({ winner: 'A', ending: 'normal' }); // just collected
  });
});

describe('review fixes', () => {
  it('what you just drew is private: other players and watchers only see which pile it came from', () => {
    let s = base({ hands: { A: [C('S', 4)], B: [C('S', 1)], C: [C('S', 2)] }, stock: [C('D', 9), C('H', 7)] });
    s = ok(s, 'A', { t: 'draw', from: 'stock' });
    expect(E.viewFor(s, 'A').drawnCard).toBe(C('H', 7));
    for (const who of ['B', 'C', null]) {
      const v = E.viewFor(s, who);
      expect(v.drawnCard).toBeNull();
      expect(v.drew).toBe('stock');
    }
  });

  it('a discard you took can always still be shown, even if you try to use up its partners (and the safe move never throws)', () => {
    // A holds S5 H5 S6 S7 and takes D5; D2-D4 is already shown, so D5 could be laid off, but the 5-5-5 set is the alternative
    const melds = [{ id: 1, owner: 'B', kind: 'run' as const, cards: [C('D', 2), C('D', 3), C('D', 4)], hidden: false }];
    let s = base({ hands: { A: [C('S', 5), C('H', 5), C('S', 6), C('S', 7), C('C', 13)], B: [C('S', 1)], C: [C('S', 2)] }, melds, nextMeld: 2, discards: [C('D', 5)] });
    s = ok(s, 'A', { t: 'draw', from: 'discard' });
    // using S5 H5 S6 S7 to make a run would leave only the lay-off, which is still possible: allowed
    s = ok(s, 'A', { t: 'meld', cards: [C('S', 5), C('S', 6), C('S', 7)] });
    // now D5 has no meld in hand, but the timeout and bots lay it off instead of crashing
    expect(E.validate(s, 'A', { t: 'discard', card: C('C', 13) })[0]).toMatch(/show the meld/);
    const view = E.viewFor(s, 'A');
    for (const move of [E.timeoutMove(view), E.bot(view, 'easy', 1), E.bot(view, 'normal', 1), E.bot(view, 'hard', 1)]) {
      expect(E.validate(s, 'A', move)).toEqual([]);
    }
    expect(E.timeoutMove(view)).toEqual({ t: 'sapaw', meld: 1, card: C('D', 5) });
    s = E.apply(s, 'A', E.timeoutMove(view));
    expect(s.mustMeld).toBeNull();
  });

  it('keepsDiscardMeld (also used by the screen) says when a move would strand the discard', () => {
    const hand = [C('S', 5), C('H', 5), C('D', 5), C('S', 6), C('S', 7)];
    expect(keepsDiscardMeld(C('D', 5), hand, [], [C('S', 5), C('S', 6), C('S', 7)])).toBe(false);
    expect(keepsDiscardMeld(C('D', 5), hand, [], [C('D', 5), C('S', 5), C('H', 5)])).toBe(true); // uses the card itself
    expect(keepsDiscardMeld(null, hand, [], [C('S', 5)])).toBe(true);
  });

  it('counts every long run, secret and sagasa the winner really made (no silent cap)', () => {
    const runs = [0, 1, 2].map((i) => ({ id: i + 1, owner: 'A', kind: 'run' as const, cards: [3, 4, 5, 6, 7].map((r) => C('SHD'[i] as 'S' | 'H' | 'D', r)), hidden: false }));
    const s = base({ hands: { A: [], B: [C('S', 1)], C: [C('S', 2)] }, melds: runs, phase: 'over', end: { winner: 'A', ending: 'tongits' }, sagasa: { A: 4, B: 0, C: 0 } });
    expect(E.result(s)).toMatchObject({ longRuns: 3, sagasa: 4 });
    const input = { ...E.result(s)!, stake: 1 } as never;
    expect(tongIts.validate(setup, players, input)).toEqual([]);
  });

  it('the pot is not capped at 50 deals', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({ winner: i % 2 ? 'B' : 'C', ending: 'normal', stake: 1 }));
    history.push({ winner: 'A', ending: 'normal', stake: 1 });
    const out = E.finalize({ winner: 'A', ending: 'normal' }, setup, history) as { potDeals: number };
    expect(out.potDeals).toBe(62);
    expect(tongIts.validate(setup, players, { ...out, stake: 1 } as never)).toEqual([]);
  });
});

describe('views', () => {
  it('never contain another player’s cards until the hand is over, and hide others’ face-down melds', () => {
    const s = E.start(setup, players, 9);
    const v = E.viewFor(s, 'B');
    expect([...v.hand].sort((a, b) => a - b)).toEqual([...s.hands.B!].sort((a, b) => a - b));
    expect(v.hands).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.stock)); // the stock order is never sent either
    expect(v.stockCount).toBe(15);
    expect(E.viewFor(s, null).hand).toEqual([]);
  });
});

function playOut(seed: number, levels: BotLevel[]) {
  let s = E.start(setup, players, seed);
  let moves = 0;
  while (s.phase !== 'over') {
    const who = E.toAct(s)!;
    const view = E.viewFor(s, who);
    const move = E.bot(view, levels[players.indexOf(who)]!, mixSeed(seed, moves));
    expect(E.validate(s, who, move)).toEqual([]);
    s = E.apply(s, who, move);
    if (++moves > 1500) throw new Error(`hand did not end (seed ${seed})`);
  }
  return s;
}

describe('computer players', () => {
  it('always play legally, every hand ends, and every result scores to zero', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const level = BOT_LEVELS[seed % 3]!;
      const s = playOut(seed, [level, level, level]);
      const r = { ...E.result(s)!, stake: 5 };
      expect(tongIts.validate(setup, players, r as never)).toEqual([]);
      const net = tongIts.score(setup, players, r as never);
      expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
  it('mixed levels also finish', () => {
    for (let seed = 200; seed < 260; seed++) playOut(seed, ['easy', 'hard', 'normal']);
  });
  it('timeoutMove is always legal, so a stalled human can never block the table', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s = E.start(setup, players, seed);
      for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
        const who = E.toAct(s)!;
        const m = E.timeoutMove(E.viewFor(s, who));
        expect(E.validate(s, who, m)).toEqual([]);
        s = E.apply(s, who, m);
      }
      expect(s.phase).toBe('over');
    }
  });
  it('stronger levels win more often (one seat against two weaker ones; one third is an even share)', () => {
    const share = (strong: BotLevel, weak: BotLevel, games: number): number => {
      let wins = 0;
      for (let seed = 1; seed <= games; seed++) {
        const seat = seed % 3;
        const levels = [0, 1, 2].map((i) => (i === seat ? strong : weak));
        if (playOut(seed, levels).end!.winner === players[seat]) wins++;
      }
      return wins / games;
    };
    expect(share('hard', 'easy', 400)).toBeGreaterThan(0.65);
    expect(share('normal', 'easy', 400)).toBeGreaterThan(0.5);
    expect(share('hard', 'normal', 600)).toBeGreaterThan(0.4);
  }, 120_000);
});
