import { describe, expect, it } from 'vitest';
import {
  actorFor,
  advancePlay,
  applyMessage,
  buildView,
  createRoom,
  joinRoom,
  playEnvelope,
  wakeAt,
  type RoomState,
} from '../src/worker/roomLogic';
import { parseClientMessage } from '../src/shared/protocol';
import type { PdView } from '../src/games/pusoy-dos/engine';
import { meldsContaining } from '../src/games/tong-its/engine';
import { pusoyEngine } from '../src/games/pusoy/engine';


const T0 = 1_700_000_000_000;
const H = { host: 'h'.repeat(64), a: 'a'.repeat(64), b: 'b'.repeat(64), x: 'f'.repeat(64) };

function make(over: Record<string, unknown> = {}): RoomState {
  const r = createRoom(
    { name: 'Night', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'A', bots: ['easy', 'normal', 'hard'], ...over },
    'ABCDE',
    H.host,
    T0,
  );
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.value;
}
const host = (s: RoomState) => actorFor(s, H.host);
const ok = (r: ReturnType<typeof applyMessage>): RoomState => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.value;
};

describe('create with computers', () => {
  it('solo: one human and three computers fill the table', () => {
    const s = make();
    expect(s.players.map((p) => [p.id, p.bot ?? null])).toEqual([['p1', null], ['p2', 'easy'], ['p3', 'normal'], ['p4', 'hard']]);
    expect(s.players.every((p) => p.bot === undefined || p.tokenHash === null)).toBe(true);
    const v = buildView(s, new Set(['p1']));
    expect(v.players.filter((p) => p.bot).every((p) => p.connected)).toBe(true);
  });

  it('rejects bad requests', () => {
    const code = (over: object) => {
      const r = createRoom({ name: 'x', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'A', ...over }, 'ABCDE', H.host, T0);
      return r.ok ? 'ok' : r.code;
    };
    expect(code({ bots: ['easy', 'easy', 'easy', 'easy'] })).toBe('bad_bots');
    expect(code({ bots: ['genius'] })).toBe('bad_bots');
    expect(code({ bots: 'easy' })).toBe('bad_bots');
    expect(code({ gameId: 'poker', playerCount: 8 })).toBe('bad_player_count'); // poker in the app seats 2 to 6
  });

  it('computers can be added and removed by the host before the first hand', () => {
    let s = make({ bots: ['easy'] });
    s = ok(applyMessage(s, host(s), { t: 'addBot', level: 'hard' }, T0));
    expect(s.players).toHaveLength(3);
    expect(s.players[2]).toMatchObject({ bot: 'hard', name: 'Computer 2' });
    const j = joinRoom(s, H.a, 'B', T0);
    expect(j.ok).toBe(true);
    const bad = applyMessage(s, actorFor(s, H.a), { t: 'addBot', level: 'easy' }, T0);
    expect(bad.ok).toBe(false);
    s = ok(applyMessage(s, host(s), { t: 'removeBot', playerId: 'p3' }, T0));
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(applyMessage(s, host(s), { t: 'removeBot', playerId: 'p1' }, T0).ok).toBe(false);
  });
});

describe('review fixes', () => {
  it('there is no message for seating a player without a phone (nobody could play their cards)', () => {
    expect(parseClientMessage({ t: 'addPlayer', name: 'Ghost' })).toBeNull();
  });
  it('creation never gives two players the same name', () => {
    const s = make({ hostName: 'Computer 1', bots: ['easy', 'hard'] });
    const names = s.players.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
  it('a move that arrives after the turn ran out is not accepted; the safe move is played instead', () => {
    let d = make();
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 5, turnSeconds: 20 }, T0 + 10, 3));
    for (let i = 0; i < 10 && d.players.find((p) => p.id === playEnvelope(d, null)!.toAct)!.bot; i++) d = advancePlay(d, d.play!.botAt!);
    expect(playEnvelope(d, null)!.toAct).toBe('p1');
    const late = d.play!.turnStartedAt! + 25_000;
    const view = playEnvelope(d, 'p1')!.view as PdView;
    const mv = view.lead ? { t: 'pass' } : { t: 'play', cards: [view.hand[view.hand.length - 1]] };
    const before = d.play!.moves;
    const r = ok(applyMessage(d, host(d), { t: 'move', move: mv }, late));
    expect(r.play!.moves).toBe(before + 1); // the timeout move, not the late one
    if (!view.lead) expect((r.play!.state as { hands: Record<string, number[]> }).hands.p1!.length).toBe(12);
  });
  it('a hand whose round cannot be recorded still ends, flagged as unscored, instead of getting stuck', () => {
    let d = make();
    d = { ...d, setup: { ...(d.setup as object), scoring: 'placement', placementPoints: [1000, 0, 0, 0] } };
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10_000_000, turnSeconds: 0 }, T0 + 10, 3));

    const runHand = (start: RoomState): RoomState => {
      let h = start;
      let now = T0 + 100;
      for (let i = 0; i < 900 && playEnvelope(h, null)!.toAct !== null; i++) {
        const who = playEnvelope(h, null)!.toAct!;
        if (h.players.find((p) => p.id === who)!.bot) {
          now = h.play!.botAt!;
          h = advancePlay(h, now);
        } else {
          const v = playEnvelope(h, who)!.view as PdView;
          const move = v.lead ? { t: 'pass' } : { t: 'play', cards: [v.mustInclude ?? v.hand[0]] };
          h = ok(applyMessage(h, host(h), { t: 'move', move }, now));
        }
      }
      return h;
    };
    // Learn who finishes first, then put the table 33 first-place finishes in for that player: one more passes 1e12.
    const first = (runHand(d).play!.state as { out: string[] }).out[0]!;
    const order = [first, ...['p1', 'p2', 'p3', 'p4'].filter((id) => id !== first)];
    const ev = (i: number) => ({ type: 'round.add' as const, id: `r${i}`, at: T0, by: 'game', input: { order, stake: 10_000_000 } });
    const loaded: RoomState = { ...d, events: Array.from({ length: 33 }, (_, i) => ev(i + 1)), nextRound: 34 };
    const done = runHand(loaded);
    expect(playEnvelope(done, null)!.toAct).toBeNull();
    expect(playEnvelope(done, 'p1')!.unscored).toBe(true);
    expect(done.events.length).toBe(33);
  });
});

describe('renaming', () => {
  it('you can rename yourself at any time; ids and totals do not change', () => {
    let s = make();
    s = ok(applyMessage(s, host(s), { t: 'rename', name: '  Ate   A ' }, T0 + 1));
    expect(s.players[0]).toMatchObject({ id: 'p1', name: 'Ate A' });
  });
  it('rejects empty, long and duplicate names', () => {
    const s = make();
    expect(applyMessage(s, host(s), { t: 'rename', name: '   ' }, T0).ok).toBe(false);
    expect(applyMessage(s, host(s), { t: 'rename', name: 'x'.repeat(25) }, T0).ok).toBe(false);
    const dup = applyMessage(s, host(s), { t: 'rename', name: 'computer 1' }, T0);
    expect(dup.ok ? '' : dup.code).toBe('name_taken');
    // renaming to your own current name (different case) is fine
    expect(applyMessage(s, host(s), { t: 'rename', name: 'ANN' }, T0).ok).toBe(true);
  });
  it('the host may rename computers and hand-added players, but a guest may not rename others', () => {
    let s = make({ bots: ['easy'] });
    s = ok(applyMessage(s, host(s), { t: 'rename', name: 'Kuya Bot', playerId: 'p2' }, T0));
    expect(s.players[1]!.name).toBe('Kuya Bot');
    const j = joinRoom(s, H.a, 'B', T0);
    if (!j.ok) throw new Error('join');
    s = j.value.state;
    const guest = actorFor(s, H.a);
    expect(applyMessage(s, guest, { t: 'rename', name: 'Mine' }, T0).ok).toBe(true);
    const other = applyMessage(s, guest, { t: 'rename', name: 'Nope', playerId: 'p1' }, T0);
    expect(other.ok ? '' : other.code).toBe('not_allowed');
    // the host cannot rename another real player (that is their own name)
    const real = applyMessage(s, host(s), { t: 'rename', name: 'Nope', playerId: 'p3' }, T0);
    expect(real.ok ? '' : real.code).toBe('not_allowed');
  });
  it('works after hands have been recorded', () => {
    let s = make();
    s = { ...s, events: [{ type: 'round.add', id: 'r1', at: T0, by: 'game', input: { winner: 'p1', stake: 10 } }], nextRound: 2 };
    s = ok(applyMessage(s, host(s), { t: 'rename', name: 'Kuya', playerId: 'p2' }, T0));
    expect(s.players[1]!.name).toBe('Kuya');
    expect(buildView(s, new Set()).totals.p1).toBe(30);
  });
  it('parses on the wire', () => {
    expect(parseClientMessage({ t: 'rename', name: 'A' })).toEqual({ t: 'rename', name: 'A' });
    expect(parseClientMessage({ t: 'rename', name: 'A', playerId: 'p2' })).toEqual({ t: 'rename', name: 'A', playerId: 'p2' });
    expect(parseClientMessage({ t: 'rename', name: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'addBot', level: 'hard' })).toEqual({ t: 'addBot', level: 'hard' });
    expect(parseClientMessage({ t: 'addBot', level: 'god' })).toBeNull();
    expect(parseClientMessage({ t: 'deal', stake: 5, turnSeconds: 0 })).toEqual({ t: 'deal', stake: 5, turnSeconds: 0 });
    expect(parseClientMessage({ t: 'deal', stake: '5' })).toBeNull();
  });
});

describe('playing a hand', () => {
  const dealt = (seed = 3, turnSeconds = 0): RoomState => {
    const s = make();
    return ok(applyMessage(s, host(s), { t: 'deal', stake: 50, turnSeconds }, T0 + 10, seed));
  };

  it('only the host deals, only with a full table, and not twice', () => {
    const s = make({ bots: ['easy'] });
    const notFull = applyMessage(s, host(s), { t: 'deal', stake: 5, turnSeconds: 0 }, T0);
    expect(notFull.ok ? '' : notFull.code).toBe('table_not_full');
    const d = dealt();
    const again = applyMessage(d, host(d), { t: 'deal', stake: 5, turnSeconds: 0 }, T0 + 20, 9);
    expect(again.ok ? '' : again.code).toBe('hand_running');
    const bad = make();
    expect(applyMessage(bad, host(bad), { t: 'deal', stake: 0, turnSeconds: 0 }, T0).ok).toBe(false);
    expect(applyMessage(bad, host(bad), { t: 'deal', stake: 5, turnSeconds: 9999 }, T0).ok).toBe(false);
  });

  it('options lock while a hand runs', () => {
    const d = dealt();
    const r = applyMessage(d, host(d), { t: 'setup', setup: d.setup }, T0);
    expect(r.ok ? '' : r.code).toBe('hand_running');
  });

  it('each phone only ever receives its own cards', () => {
    const d = dealt();
    const mine = playEnvelope(d, 'p1')!;
    const theirs = playEnvelope(d, 'p2')!;
    const watcher = playEnvelope(d, null)!;
    const state = d.play!.state as { hands: Record<string, number[]> };
    const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);
    // each viewer's `hand` is exactly their own cards (or empty for a watcher), and no one gets the `hands` map
    expect(sorted((mine.view as PdView).hand)).toEqual(sorted(state.hands.p1!));
    expect(sorted((theirs.view as PdView).hand)).toEqual(sorted(state.hands.p2!));
    for (const e of [mine, theirs, watcher]) {
      expect((e.view as PdView).hands).toBeUndefined();
      expect((e.view as PdView).counts).toEqual({ p1: 13, p2: 13, p3: 13, p4: 13 });
    }
    expect((watcher.view as PdView).hand).toEqual([]);
    // the room view itself carries no cards at all
    expect(JSON.stringify(buildView(d, new Set(['p1'])))).not.toContain('hands');
  });

  it('rejects moves out of turn and illegal moves, and accepts a legal one from the human', () => {
    let d = dealt(3);
    const toAct = playEnvelope(d, 'p1')!.toAct!;
    const other = ['p1', 'p2', 'p3', 'p4'].find((id) => id !== toAct)!;
    const st = d.play!.state as { hands: Record<string, number[]> };
    const out = applyMessage(d, { playerId: other, isHost: false }, { t: 'move', move: { t: 'pass' } }, T0);
    expect(out.ok ? '' : out.code).toBe('bad_move');
    const bogus = applyMessage(d, { playerId: toAct, isHost: false }, { t: 'move', move: { t: 'play', cards: [99] } }, T0);
    expect(bogus.ok).toBe(false);
    const lowest = (d.play!.state as { mustInclude: number }).mustInclude;
    d = ok(applyMessage(d, { playerId: toAct, isHost: false }, { t: 'move', move: { t: 'play', cards: [lowest] } }, T0 + 30));
    expect(st.hands[toAct]!.length).toBe(13);
    expect((d.play!.state as { hands: Record<string, number[]> }).hands[toAct]!.length).toBe(12);
    expect(applyMessage(make(), { playerId: null, isHost: false }, { t: 'move', move: { t: 'pass' } }, T0).ok).toBe(false);
  });

  it('computers move when due, and a whole hand plays out to a scored round', () => {
    let d = dealt(7);
    let now = T0 + 100;
    let steps = 0;
    while (d.play && playEnvelope(d, null)!.toAct !== null) {
      const who = playEnvelope(d, null)!.toAct!;
      const isBot = d.players.find((p) => p.id === who)!.bot !== undefined;
      if (isBot) {
        expect(d.play.botAt).not.toBeNull();
        expect(d.play.botAt!).toBeGreaterThan(now);
        const early = advancePlay(d, now); // not due yet
        expect(early).toBe(d);
        now = d.play.botAt!;
        d = advancePlay(d, now);
      } else {
        // the human just plays the engine's safe move through the normal message path
        const view = playEnvelope(d, who)!.view as PdView;
        const move = view.lead ? { t: 'pass' } : { t: 'play', cards: [view.mustInclude ?? view.hand[0]] };
        d = ok(applyMessage(d, { playerId: who, isHost: who === 'p1' }, { t: 'move', move }, now));
      }
      if (++steps > 800) throw new Error('hand did not end');
    }
    const v = buildView(d, new Set(['p1']));
    expect(v.rounds).toHaveLength(1);
    expect(Object.values(v.totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(Math.max(...Object.values(v.totals))).toBe(150); // winner takes 3 x 50
    expect(d.events[0]).toMatchObject({ type: 'round.add', by: 'game' });
    expect(((playEnvelope(d, 'p1')!.view) as PdView).hands).toBeDefined(); // hands are revealed once it is over
    // next hand can be dealt; undo still works on the ledger
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 50, turnSeconds: 0 }, now + 10, 11));
    expect(playEnvelope(d, 'p1')!.handNo).toBe(2);
    expect(d.nextRound).toBe(2);
  });

  it('a human whose time runs out has the safe move played, and the room wakes for it', () => {
    let d = dealt(3, 20);
    const who = playEnvelope(d, null)!.toAct!;
    const human = d.players.find((p) => p.id === who)!.bot === undefined;
    if (!human) {
      // let the computers move until it is a human's turn
      for (let i = 0; i < 10 && d.players.find((p) => p.id === playEnvelope(d, null)!.toAct)!.bot; i++) d = advancePlay(d, d.play!.botAt!);
    }
    expect(playEnvelope(d, null)!.toAct).toBe('p1');
    const started = d.play!.turnStartedAt!;
    expect(playEnvelope(d, 'p1')!.turnEndsAt).toBe(started + 20_000);
    expect(wakeAt(d)).toBe(started + 20_000);
    expect(advancePlay(d, started + 19_999)).toBe(d);
    const after = advancePlay(d, started + 20_000);
    expect(after).not.toBe(d);
    expect(after.play!.moves).toBe(d.play!.moves + 1);
  });

  it('the same seed gives the same game', () => {
    const a = dealt(42);
    const b = dealt(42);
    expect(JSON.stringify(a.play!.state)).toBe(JSON.stringify(b.play!.state));
    expect(JSON.stringify(dealt(43).play!.state)).not.toBe(JSON.stringify(a.play!.state));
  });
});

describe('Tong-its in the app', () => {
  const tong = (bots: string[] = ['normal', 'hard']): RoomState => {
    const r = createRoom({ name: 'T', gameId: 'tong-its', playerCount: 3, unit: 'pts', hostName: 'A', bots }, 'ABCDE', H.host, T0);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  type TiView = import('../src/games/tong-its/engine').TiView;
  const humanMove = (e: ReturnType<typeof playEnvelope>) => {
    // what the engine would do for a player who ran out of time: always legal
    const v = e!.view as TiView;
    return v.phase === 'fight' ? { t: 'respond', challenge: false } : v.phase === 'draw' ? { t: 'draw', from: 'stock' } : v.mustMeld !== null ? null : { t: 'discard', card: v.hand[0] };
  };

  it('a solo table seats two computers and plays whole hands, scored and zero-sum, and the pot carries over', () => {
    let d = tong();
    expect(d.players.map((p) => p.bot ?? null)).toEqual([null, 'normal', 'hard']);
    let wins: string[] = [];
    let now = T0 + 10;
    for (let hand = 1; hand <= 3; hand++) {
      d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10, turnSeconds: 0 }, now, 100 + hand));
      for (let i = 0; i < 2000 && playEnvelope(d, null)!.toAct !== null; i++) {
        const who = playEnvelope(d, null)!.toAct!;
        if (d.players.find((p) => p.id === who)!.bot) {
          now = d.play!.botAt!;
          d = advancePlay(d, now);
        } else {
          const e = playEnvelope(d, who);
          let mv = humanMove(e) as object | null;
          if (mv === null) {
            // took a discard: use the engine's own safe move through the normal path
            const v = e!.view as TiView;
            mv = { t: 'meld', cards: meldsFor(v) };
          }
          d = ok(applyMessage(d, host(d), { t: 'move', move: mv }, now));
        }
      }
      wins = buildView(d, new Set()).rounds.map((r) => (r.input as { winner: string }).winner);
      expect(wins).toHaveLength(hand);
    }
    const v = buildView(d, new Set(['p1']));
    expect(Object.values(v.totals).reduce((a, b) => a + b, 0)).toBe(0);
    // every win after the first by the same player as the previous round collects a pot
    const inputs = v.rounds.map((r) => r.input as { winner: string; potDeals?: number });
    inputs.forEach((inp, i) => {
      if (i > 0 && inputs[i - 1]!.winner === inp.winner && !(inputs[i - 1]!.potDeals ?? 0)) expect(inp.potDeals ?? 0).toBeGreaterThan(0);
    });
  });
});

function meldsFor(v: import('../src/games/tong-its/engine').TiView): number[] {
  return meldsContaining(v.hand, v.mustMeld as number)[0]!;
}

describe('Pusoy in the app (everyone sets in secret, at the same time)', () => {
  type PsView = import('../src/games/pusoy/engine').PsView;
  const pusoyRoom = (bots: string[], humans = 1): RoomState => {
    const r = createRoom({ name: 'P', gameId: 'pusoy', playerCount: 4, unit: 'pts', hostName: 'A', bots }, 'ABCDE', H.host, T0);
    if (!r.ok) throw new Error(r.message);
    let s = r.value;
    for (let i = 1; i < humans; i++) {
      const j = joinRoom(s, i === 1 ? H.a : H.b, `Guest${i}`, T0);
      if (!j.ok) throw new Error(j.message);
      s = j.value.state;
    }
    return s;
  };
  const setOf = (e: ReturnType<typeof playEnvelope>) => ({ ...pusoyEngine.timeoutMove(e!.view as PsView) });

  it('a solo table: computers set one by one, the human sets any time, and the hand is scored', () => {
    let d = pusoyRoom(['easy', 'normal', 'hard']);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10, turnSeconds: 0 }, T0 + 10, 5));
    let e = playEnvelope(d, 'p1')!;
    expect(e.pending).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(e.turnEndsAt).toBeNull();
    // the three computers each get their turn to set
    let now = T0 + 100;
    for (let i = 0; i < 3; i++) {
      expect(d.play!.botAt).not.toBeNull();
      now = d.play!.botAt!;
      d = advancePlay(d, now);
    }
    e = playEnvelope(d, 'p1')!;
    expect(e.pending).toEqual(['p1']);
    expect(d.play!.botAt).toBeNull();
    expect(buildView(d, new Set()).rounds).toHaveLength(0); // still waiting for the human
    d = ok(applyMessage(d, host(d), { t: 'move', move: setOf(e) }, now + 5));
    expect(playEnvelope(d, 'p1')!.toAct).toBeNull();
    const v = buildView(d, new Set(['p1']));
    expect(v.rounds).toHaveLength(1);
    expect(Object.values(v.totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(((playEnvelope(d, 'p1')!.view) as PsView).done).toBe(true);
  });

  it('a human set is never swallowed by a computer move that happens to be due', () => {
    let d = pusoyRoom(['easy', 'normal', 'hard']);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10, turnSeconds: 0 }, T0 + 10, 5));
    const late = d.play!.botAt! + 10_000; // a computer is long overdue
    d = ok(applyMessage(d, host(d), { t: 'move', move: setOf(playEnvelope(d, 'p1')) }, late));
    expect(playEnvelope(d, null)!.pending).not.toContain('p1');
  });

  it('when a computer is due and the humans\' time is also up, everything due happens in one go (no past wake-up left behind)', () => {
    let d = pusoyRoom(['easy', 'easy'], 2);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10, turnSeconds: 20 }, T0 + 10, 5));
    const started = d.play!.turnStartedAt!;
    const after = advancePlay(d, started + 130_000); // far past both the computers' delay and the humans' limit
    expect(playEnvelope(after, null)!.pending).not.toContain('p4');
    expect(playEnvelope(after, null)!.pending).not.toContain('p1');
    expect(wakeAt(after)).toBeGreaterThan(started + 130_000 - 1); // never points into the past
  });

  it('only a phone sees its own cards, and others rows stay hidden until everyone has set', () => {
    let d = pusoyRoom(['easy', 'easy'], 2);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10, turnSeconds: 0 }, T0 + 10, 5));
    const st = d.play!.state as { hands: Record<string, number[]> };
    const mine = playEnvelope(d, 'p1')!.view as PsView;
    const theirs = playEnvelope(d, 'p2')!.view as PsView;
    expect([...mine.hand].sort((a, b) => a - b)).toEqual([...st.hands.p1!].sort((a, b) => a - b));
    expect(mine.hand).not.toEqual(theirs.hand);
    expect(mine.reveal).toBeUndefined();
    d = ok(applyMessage(d, host(d), { t: 'move', move: setOf(playEnvelope(d, 'p1')) }, T0 + 20));
    const other = playEnvelope(d, 'p2')!.view as PsView;
    expect(other.reveal).toBeUndefined();
    expect(other.mine).toBeNull();
    expect(playEnvelope(d, 'p1')!.pending).not.toContain('p1');
  });

  it('the shared time limit is six times the turn time, and when it runs out every human still pending gets the safe set', () => {
    let d = pusoyRoom(['easy', 'easy'], 2);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 10, turnSeconds: 20 }, T0 + 10, 5));
    const started = d.play!.turnStartedAt!;
    expect(playEnvelope(d, 'p1')!.turnEndsAt).toBe(started + 120_000);
    expect(wakeAt(d)).toBe(Math.min(d.play!.botAt!, started + 120_000));
    // one human sets early: the clock keeps running for the other
    d = ok(applyMessage(d, host(d), { t: 'move', move: setOf(playEnvelope(d, 'p1')) }, started + 5000));
    expect(d.play!.turnStartedAt).toBe(started);
    // computers go first
    for (let i = 0; i < 2; i++) d = advancePlay(d, d.play!.botAt!);
    expect(playEnvelope(d, null)!.pending).toEqual(['p4']);
    expect(advancePlay(d, started + 119_999)).toBe(d);
    const after = advancePlay(d, started + 120_000);
    expect(playEnvelope(after, null)!.toAct).toBeNull();
    expect(buildView(after, new Set()).rounds).toHaveLength(1);
  });
});

describe('Poker in the app', () => {
  type PkView = import('../src/games/poker/engine').PkView;
  const pokerRoom = (playerCount = 4, bots: string[] = ['easy', 'normal', 'hard']): RoomState => {
    const r = createRoom({ name: 'P', gameId: 'poker', playerCount, unit: 'pts', hostName: 'A', bots }, 'ABCDE', H.host, T0);
    if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
    return r.value;
  };

  it('allows 2 to 6 players, not 7 to 10', () => {
    expect(pokerRoom(6, ['easy']).playerCount).toBe(6);
    const big = createRoom({ name: 'P', gameId: 'poker', playerCount: 8, unit: 'pts', hostName: 'A' }, 'ABCDE', H.host, T0);
    expect(big.ok ? '' : big.code).toBe('bad_player_count');
  });

  it('hands are linked: stacks and the button carry over, each hand is one ledger round, totals stay zero-sum', () => {
    let d = pokerRoom();
    let now = T0 + 10;
    const buttons: number[] = [];
    for (let hand = 1; hand <= 4; hand++) {
      d = ok(applyMessage(d, host(d), { t: 'deal', stake: 1, turnSeconds: 0 }, now, 40 + hand));
      buttons.push((d.play!.state as { button: number }).button);
      for (let i = 0; i < 400 && playEnvelope(d, null)!.toAct !== null; i++) {
        const who = playEnvelope(d, null)!.toAct!;
        if (d.players.find((p) => p.id === who)!.bot) {
          now = d.play!.botAt!;
          d = advancePlay(d, now);
        } else {
          const v = playEnvelope(d, who)!.view as PkView;
          const move = v.toCall === 0 ? { t: 'check' } : { t: 'fold' };
          d = ok(applyMessage(d, host(d), { t: 'move', move }, now));
        }
      }
      expect(buildView(d, new Set()).rounds).toHaveLength(hand);
    }
    expect(buttons[1]).toBe((buttons[0]! + 1) % 4);
    expect(buttons[3]).toBe((buttons[0]! + 3) % 4);
    const v = buildView(d, new Set(['p1']));
    expect(Object.values(v.totals).reduce((a, b) => a + b, 0)).toBe(0);
    // the second hand started from the first hand's final stacks (or a re-buy for a busted player)
    const input = v.rounds[0]!.input as { buyIns: Record<string, number[]>; cashOuts: Record<string, number> };
    expect(Object.keys(input.buyIns)).toHaveLength(4);
    expect(Object.values(input.cashOuts).reduce((a, b) => a + b, 0)).toBe(Object.values(input.buyIns).reduce((a, b) => a + b[0]!, 0));
    expect(JSON.stringify(v.rounds[0]!.input)).not.toContain('stake');
  });

  it('only a phone sees its own hole cards', () => {
    let d = pokerRoom(3, ['easy', 'easy']);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 1, turnSeconds: 0 }, T0 + 10, 3));
    const st = d.play!.state as { seats: Record<string, { hole: number[] }> };
    const mine = playEnvelope(d, 'p1')!.view as PkView;
    expect(mine.hole).toEqual(st.seats.p1!.hole);
    const other = JSON.stringify(playEnvelope(d, 'p2')!.view);
    expect(other).not.toContain(JSON.stringify(st.seats.p1!.hole));
    expect((playEnvelope(d, null)!.view as PkView).hole).toEqual([]);
  });

  it('a hand that is over the moment it is dealt (blinds put everyone all in) is still recorded', () => {
    const r = createRoom(
      { name: 'P', gameId: 'poker', playerCount: 2, unit: 'pts', hostName: 'A', bots: ['easy'], setup: { chips: 1, moneyUnits: 1, buyIn: 1, smallBlind: 1, bigBlind: 1 } },
      'ABCDE', H.host, T0,
    );
    if (!r.ok) throw new Error(r.message);
    const d = ok(applyMessage(r.value, host(r.value), { t: 'deal', stake: 1, turnSeconds: 0 }, T0 + 10, 5));
    expect(playEnvelope(d, 'p1')!.toAct).toBeNull();
    expect(d.events).toHaveLength(1);
    expect(Object.values(buildView(d, new Set()).totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(d.play!.botAt).toBeNull();
  });

  it('past poker hands cannot be undone or edited, because the next hand starts from their chips', () => {
    let d = pokerRoom(2, ['easy']);
    d = ok(applyMessage(d, host(d), { t: 'deal', stake: 1, turnSeconds: 0 }, T0 + 10, 3));
    let now = T0 + 20;
    for (let i = 0; i < 200 && playEnvelope(d, null)!.toAct !== null; i++) {
      const who = playEnvelope(d, null)!.toAct!;
      if (d.players.find((p) => p.id === who)!.bot) {
        now = d.play!.botAt!;
        d = advancePlay(d, now);
      } else {
        d = ok(applyMessage(d, host(d), { t: 'move', move: { t: 'fold' } }, now));
      }
    }
    expect(d.events).toHaveLength(1);
    const undo = applyMessage(d, host(d), { t: 'undo' }, now);
    expect(undo.ok ? '' : undo.code).toBe('linked_hands');
    const back = applyMessage(d, host(d), { t: 'restore' }, now);
    expect(back.ok ? '' : back.code).toBe('linked_hands');
  });
});

describe('dealing randomness (audit S05)', () => {
  it('a deal can use any random source; the same source gives the same deal, a different one does not', async () => {
    const { cryptoRng, makeRng, randInt } = await import('../src/core/rng');
    const s = make();
    const handOf = (r: ReturnType<typeof applyMessage>) => (playEnvelope(ok(r), 'p1')!.view as PdView).hand.join(',');
    const a = handOf(applyMessage(s, host(s), { t: 'deal', stake: 5, turnSeconds: 0 }, T0, 1, makeRng(42)));
    const b = handOf(applyMessage(s, host(s), { t: 'deal', stake: 5, turnSeconds: 0 }, T0, 1, makeRng(42)));
    expect(a).toBe(b);
    const hands = new Set(Array.from({ length: 5 }, () => handOf(applyMessage(s, host(s), { t: 'deal', stake: 5, turnSeconds: 0 }, T0, 1, cryptoRng()))));
    expect(hands.size).toBe(5);
    // randInt never returns out of range, even for sizes that do not divide 2^32
    const r = cryptoRng();
    for (let i = 0; i < 2000; i++) {
      const n = randInt(r, 52);
      expect(n >= 0 && n < 52 && Number.isInteger(n)).toBe(true);
    }
  });
});
