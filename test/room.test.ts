import { describe, expect, it } from 'vitest';
import {
  actorFor,
  applyMessage,
  buildView,
  createRoom,
  DAY_MS,
  expiresAt,
  isExpired,
  joinRoom,
  type RoomState,
} from '../src/worker/roomLogic';
import { cleanName, parseClientMessage } from '../src/shared/protocol';

const T0 = 1_700_000_000_000;
const H = { host: 'h'.repeat(64), a: 'a'.repeat(64), b: 'b'.repeat(64), c: 'c'.repeat(64), x: 'f'.repeat(64) };

function room(playerCount = 4): RoomState {
  const r = createRoom(
    { name: 'Friday night', gameId: 'pusoy-dos', playerCount, unit: 'pts', hostName: 'A' },
    'ABCDE',
    H.host,
    T0,
  );
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

function seated(playerCount = 4): RoomState {
  let s = room(playerCount);
  const tokens = [H.a, H.b, H.c];
  const names = ['B', 'C', 'D'];
  for (let i = 0; i < playerCount - 1; i++) {
    const j = joinRoom(s, tokens[i] as string, names[i], T0 + 1);
    if (!j.ok) throw new Error(j.message);
    s = j.value.state;
  }
  return s;
}

const host = (s: RoomState) => actorFor(s, H.host);

describe('createRoom', () => {
  it('creates a room with the host seated as p1', () => {
    const s = room();
    expect(s.players).toEqual([{ id: 'p1', name: 'A', manual: false, tokenHash: H.host }]);
    expect(s.gameId).toBe('pusoy-dos');
  });

  it('rejects unknown games, bad counts, empty names and long units', () => {
    const base = { name: 'x', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'A' };
    const code = (over: object) => {
      const r = createRoom({ ...base, ...over }, 'ABCDE', H.host, T0);
      return r.ok ? 'ok' : r.code;
    };
    expect(code({ gameId: 'nope' })).toBe('bad_game');
    expect(code({ gameId: '__proto__' })).toBe('bad_game');
    expect(code({ playerCount: 7 })).toBe('bad_player_count');
    expect(code({ playerCount: '4' })).toBe('bad_player_count');
    expect(code({ name: '   ' })).toBe('bad_name');
    expect(code({ hostName: '' })).toBe('bad_name');
    expect(code({ unit: 'x'.repeat(13) })).toBe('bad_unit');
  });
});

describe('joining and rejoining', () => {
  it('seats new devices in order and recognises a returning device', () => {
    let s = room();
    const j = joinRoom(s, H.a, '  B  ', T0 + 5);
    if (!j.ok) throw new Error(j.message);
    s = j.value.state;
    expect(s.players.map((p) => p.name)).toEqual(['A', 'B']);
    expect(j.value.actor).toEqual({ playerId: 'p2', isHost: false });

    // refresh: same token, any name => same identity, nobody new is seated
    const again = joinRoom(s, H.a, 'whatever', T0 + 9);
    if (!again.ok) throw new Error(again.message);
    expect(again.value.state.players).toHaveLength(2);
    expect(again.value.actor.playerId).toBe('p2');
  });

  it('keeps the host identity on rejoin', () => {
    const s = room();
    const j = joinRoom(s, H.host, '', T0 + 1);
    expect(j.ok && j.value.actor).toEqual({ playerId: 'p1', isHost: true });
  });

  it('refuses a full table, duplicate names (case-insensitive) and joins after rounds start', () => {
    const full = seated(2);
    const r1 = joinRoom(full, H.x, 'Z', T0);
    expect(r1.ok ? 'ok' : r1.code).toBe('room_full');

    const s = room();
    const r2 = joinRoom(s, H.a, 'a', T0);
    expect(r2.ok ? 'ok' : r2.code).toBe('name_taken');

    const started = applyMessage(seated(), host(seated()), { t: 'addRound', input: { winner: 'p1', stake: 5 } }, T0 + 2);
    if (!started.ok) throw new Error(started.message);
    const r3 = joinRoom({ ...started.value, players: started.value.players.slice(0, 3) }, H.x, 'Z', T0 + 3);
    expect(r3.ok ? 'ok' : r3.code).toBe('game_started');
  });

  it('only visitors with a token matching a seat get a player id', () => {
    const s = seated();
    expect(actorFor(s, H.x)).toEqual({ playerId: null, isHost: false });
  });
});

describe('host actions', () => {
  it('only the host can change the ledger', () => {
    const s = seated();
    const guest = actorFor(s, H.a);
    for (const msg of [
      { t: 'addRound', input: { winner: 'p1', stake: 5 } },
      { t: 'undo' },
      { t: 'edit', id: 'r1', reason: 'x', input: { winner: 'p1', stake: 5 } },
      { t: 'addPlayer', name: 'Q' },
      { t: 'keep', days: 30 },
    ] as const) {
      const r = applyMessage(s, guest, msg, T0 + 5);
      expect(r.ok ? 'ok' : r.code).toBe('not_host');
    }
  });

  it('needs a full table before the first round', () => {
    const s = room();
    const r = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'p1', stake: 5 } }, T0 + 1);
    expect(r.ok ? 'ok' : r.code).toBe('table_not_full');
  });

  it('lets the host seat a player who has no phone', () => {
    const s = room(3);
    const r = applyMessage(s, host(s), { t: 'addPlayer', name: 'Lola' }, T0 + 1);
    if (!r.ok) throw new Error(r.message);
    expect(r.value.players[1]).toMatchObject({ name: 'Lola', manual: true, tokenHash: null });
  });

  it('replays the canonical Pusoy Dos game through the room', () => {
    let s = seated();
    const ids: Record<string, string> = { A: 'p1', B: 'p2', C: 'p3', D: 'p4' };
    const rounds: [string, number][] = [
      ...['A', 'B', 'B', 'D', 'C'].map((w): [string, number] => [w, 50]),
      ...['D', 'D', 'B', 'C', 'B', 'C', 'A', 'D'].map((w): [string, number] => [w, 200]),
      ...['A', 'C'].map((w): [string, number] => [w, 300]),
    ];
    let t = T0 + 10;
    for (const [w, stake] of rounds) {
      const r = applyMessage(s, host(s), { t: 'addRound', input: { winner: ids[w], stake } }, (t += 1000));
      if (!r.ok) throw new Error(r.message);
      s = r.value;
    }
    const v = buildView(s, new Set(['p1']));
    expect(v.rounds).toHaveLength(15);
    expect(v.totals).toEqual({ p1: -250, p2: -450, p3: 550, p4: 150 });
    expect(v.players.find((p) => p.id === 'p1')?.connected).toBe(true);
    expect(JSON.stringify(v)).not.toContain(H.host); // token hashes never leave the server
  });

  it('rejects invalid rounds with the game message and leaves state unchanged', () => {
    const s = seated();
    const r = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'zzz', stake: 5 } }, T0 + 5);
    expect(r.ok ? 'ok' : r.code).toBe('invalid_round');
    const r2 = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'p1', stake: 1.5 } }, T0 + 5);
    expect(r2.ok ? 'ok' : r2.code).toBe('invalid_round');
    expect(s.events).toHaveLength(0);
  });

  it('undo and edit work and edits need a reason', () => {
    let s = seated();
    const add = (w: string) => {
      const r = applyMessage(s, host(s), { t: 'addRound', input: { winner: w, stake: 10 } }, T0 + 20);
      if (!r.ok) throw new Error(r.message);
      s = r.value;
    };
    add('p1');
    add('p2');
    const noReason = applyMessage(s, host(s), { t: 'edit', id: 'r1', reason: '  ', input: { winner: 'p3', stake: 10 } }, T0 + 30);
    expect(noReason.ok ? 'ok' : noReason.code).toBe('bad_reason');

    const edited = applyMessage(s, host(s), { t: 'edit', id: 'r1', reason: 'wrong winner', input: { winner: 'p3', stake: 10 } }, T0 + 31);
    if (!edited.ok) throw new Error(edited.message);
    expect(buildView(edited.value, new Set()).totals).toEqual({ p1: -20, p2: 20, p3: 20, p4: -20 });

    const undone = applyMessage(edited.value, host(s), { t: 'undo' }, T0 + 32);
    if (!undone.ok) throw new Error(undone.message);
    expect(buildView(undone.value, new Set()).rounds.map((r) => r.id)).toEqual(['r1']);

    const empty = applyMessage(room(), host(room()), { t: 'undo' }, T0);
    expect(empty.ok ? 'ok' : empty.code).toBe('invalid_round');
  });
});

describe('expiry', () => {
  it('expires 24 hours after the last activity, or 30 days if the host keeps it', () => {
    let s = room();
    expect(expiresAt(s)).toBe(T0 + DAY_MS);
    expect(isExpired(s, T0 + DAY_MS - 1)).toBe(false);
    expect(isExpired(s, T0 + DAY_MS)).toBe(true);

    const kept = applyMessage(s, host(s), { t: 'keep', days: 30 }, T0 + 1000);
    if (!kept.ok) throw new Error(kept.message);
    s = kept.value;
    expect(expiresAt(s)).toBe(T0 + 1000 + 30 * DAY_MS);
  });

  it('activity pushes the expiry out', () => {
    const s = seated();
    expect(s.lastActivityAt).toBe(T0 + 1);
    expect(expiresAt(s)).toBe(T0 + 1 + DAY_MS);
  });
});

describe('protocol parsing', () => {
  it('accepts well-formed messages and rejects junk', () => {
    expect(parseClientMessage({ t: 'join', token: H.a, name: 'B' })).toEqual({ t: 'join', token: H.a, name: 'B' });
    expect(parseClientMessage({ t: 'join', token: 'short', name: 'B' })).toBeNull();
    expect(parseClientMessage({ t: 'addRound', input: 5 })).toBeNull();
    expect(parseClientMessage({ t: 'keep', days: 7 })).toBeNull();
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage([])).toBeNull();
    expect(parseClientMessage({ t: 'drop tables' })).toBeNull();
  });

  it('cleans names', () => {
    expect(cleanName('  Ana   Cruz ')).toBe('Ana Cruz');
    expect(cleanName('a\u0000b')).toBe('ab');
    expect(cleanName('')).toBeNull();
    expect(cleanName('x'.repeat(25))).toBeNull();
    expect(cleanName(5)).toBeNull();
  });
});

describe('room limits', () => {
  it('stops accepting ledger changes at the event cap, including edits and undos', () => {
    const base = seated();
    const full = { ...base, events: Array.from({ length: 1500 }, (_, i) => ({ type: 'round.undo' as const, at: i, by: 'host' })) };
    for (const msg of [
      { t: 'addRound', input: { winner: 'p1', stake: 5 } },
      { t: 'undo' },
      { t: 'edit', id: 'r1', reason: 'x', input: { winner: 'p1', stake: 5 } },
    ] as const) {
      const r = applyMessage(full, host(full), msg, T0 + 5);
      expect(r.ok ? 'ok' : r.code).toBe('too_many');
    }
  });

  it('refuses a round that would overflow a running total instead of corrupting the room', () => {
    let s = seated();
    let rejected = false;
    for (let i = 0; i < 12; i++) {
      const r = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'p1', stake: 62_500_000_000 } }, T0 + 10 + i);
      if (!r.ok) {
        expect(r.code).toBe('invalid_round');
        rejected = true;
        break;
      }
      s = r.value;
    }
    expect(rejected).toBe(true);
    expect(() => buildView(s, new Set())).not.toThrow(); // the room is still readable
  });
});

describe('game options (setup)', () => {
  const cardsLeft = (n = 4) => {
    const base = seated(n);
    return { ...(base.setup as object), scoring: 'cards-left', settlement: 'pairwise' };
  };

  it('the host can change options before the first round; a guest cannot', () => {
    const s = seated();
    const opts = cardsLeft();
    const guest = applyMessage(s, actorFor(s, H.a), { t: 'setup', setup: opts }, T0 + 5);
    expect(guest.ok ? 'ok' : guest.code).toBe('not_host');
    const r = applyMessage(s, host(s), { t: 'setup', setup: opts }, T0 + 5);
    if (!r.ok) throw new Error(r.message);
    expect(buildView(r.value, new Set()).setup).toMatchObject({ scoring: 'cards-left', settlement: 'pairwise' });
  });

  it('then scores rounds with the chosen system', () => {
    let s = seated();
    const r = applyMessage(s, host(s), { t: 'setup', setup: cardsLeft() }, T0 + 5);
    if (!r.ok) throw new Error(r.message);
    s = r.value;
    const round = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'p1', stake: 1, cardsLeft: { p2: 5, p3: 10, p4: 13 } } }, T0 + 6);
    if (!round.ok) throw new Error(round.message);
    expect(buildView(round.value, new Set()).totals).toEqual({ p1: 64, p2: 44, p3: -16, p4: -92 });
  });

  it('winner-take-all style input is refused under cards-left (the entry must match the options)', () => {
    let s = seated();
    const r = applyMessage(s, host(s), { t: 'setup', setup: cardsLeft() }, T0 + 5);
    if (!r.ok) throw new Error(r.message);
    s = r.value;
    const bad = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'p1', stake: 5 } }, T0 + 6);
    expect(bad.ok ? 'ok' : bad.code).toBe('invalid_round');
  });

  it('options lock after the first round and invalid options are refused', () => {
    let s = seated();
    const bad = applyMessage(s, host(s), { t: 'setup', setup: { scoring: 'nope' } }, T0 + 5);
    expect(bad.ok ? 'ok' : bad.code).toBe('bad_setup');
    const r = applyMessage(s, host(s), { t: 'addRound', input: { winner: 'p1', stake: 5 } }, T0 + 6);
    if (!r.ok) throw new Error(r.message);
    s = r.value;
    const late = applyMessage(s, host(s), { t: 'setup', setup: cardsLeft() }, T0 + 7);
    expect(late.ok ? 'ok' : late.code).toBe('game_started');
  });

  it('options may be given at creation and are validated there', () => {
    const ok = createRoom({ name: 'x', gameId: 'pusoy-dos', playerCount: 3, unit: 'pts', hostName: 'A', setup: { ...cardsLeft(), placementPoints: [3, 1, 0] } }, 'ABCDE', H.host, T0);
    expect(ok.ok).toBe(true);
    const bad = createRoom({ name: 'x', gameId: 'pusoy-dos', playerCount: 3, unit: 'pts', hostName: 'A', setup: { scoring: 'nope' } }, 'ABCDE', H.host, T0);
    expect(bad.ok ? 'ok' : bad.code).toBe('bad_setup');
  });
});

describe('turn timer in the room', () => {
  const start = (s: RoomState, first = 0, secs = 30) => {
    const r = applyMessage(s, host(s), { t: 'clock', op: 'start', seconds: secs, first }, T0 + 100);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };

  it('only the host starts or stops it, and a guest cannot', () => {
    const s = seated();
    const g = applyMessage(s, actorFor(s, H.a), { t: 'clock', op: 'start', seconds: 30, first: 0 }, T0 + 5);
    expect(g.ok ? 'ok' : g.code).toBe('not_host');
    const running = start(s);
    const stopGuest = applyMessage(running, actorFor(running, H.a), { t: 'clock', op: 'stop' }, T0 + 6);
    expect(stopGuest.ok ? 'ok' : stopGuest.code).toBe('not_host');
    const stopped = applyMessage(running, host(running), { t: 'clock', op: 'stop' }, T0 + 7);
    expect(stopped.ok && stopped.value.clock).toBeNull();
  });

  it('shows up in the view, normalised to the server time', () => {
    const s = start(seated(), 1);
    expect(buildView(s, new Set(), T0 + 100).clock?.turn).toBe(1);
    expect(buildView(s, new Set(), T0 + 100 + 30_000).clock?.turn).toBe(2);
  });

  it('only the player on the clock (or the host) can pass the turn', () => {
    const s = start(seated(), 1); // p2 is on the clock
    const p3 = applyMessage(s, actorFor(s, H.b), { t: 'clock', op: 'done' }, T0 + 200);
    expect(p3.ok ? 'ok' : p3.code).toBe('not_your_turn');
    const p2 = applyMessage(s, actorFor(s, H.a), { t: 'clock', op: 'done' }, T0 + 200);
    expect(p2.ok && p2.value.clock?.turn).toBe(2);
    const h = applyMessage(s, host(s), { t: 'clock', op: 'done' }, T0 + 200);
    expect(h.ok && h.value.clock?.turn).toBe(2);
  });

  it('pauses only when every player with a phone agrees; a decline keeps it running', () => {
    let s = start(seated());
    const step = (token: string, op: 'pause' | 'decline' | 'resume', at: number) => {
      const r = applyMessage(s, actorFor(s, token), { t: 'clock', op }, at);
      if (!r.ok) throw new Error(r.message);
      s = r.value;
    };
    step(H.host, 'pause', T0 + 1000);
    step(H.a, 'pause', T0 + 2000);
    step(H.b, 'pause', T0 + 3000);
    expect(s.clock?.paused).toBeNull(); // p4 (token c) has not agreed
    step(H.c, 'pause', T0 + 4000);
    expect(s.clock?.paused).not.toBeNull();
    step(H.a, 'resume', T0 + 9000);
    expect(s.clock?.paused).toBeNull();

    step(H.host, 'pause', T0 + 10_000);
    step(H.b, 'decline', T0 + 11_000);
    expect(s.clock?.pauseReq).toBeNull();
    expect(s.clock?.paused).toBeNull();
  });

  it('players added by hand are not asked to agree', () => {
    let s = room(3);
    const j = joinRoom(s, H.a, 'B', T0 + 1);
    if (!j.ok) throw new Error(j.message);
    const man = applyMessage(j.value.state, actorFor(j.value.state, H.host), { t: 'addPlayer', name: 'Lola' }, T0 + 2);
    if (!man.ok) throw new Error(man.message);
    s = start(man.value);
    for (const [tok, at] of [[H.host, 1000], [H.a, 2000]] as const) {
      const r = applyMessage(s, actorFor(s, tok), { t: 'clock', op: 'pause' }, T0 + at);
      if (!r.ok) throw new Error(r.message);
      s = r.value;
    }
    expect(s.clock?.paused).not.toBeNull();
  });

  it('refuses timer actions when there is no timer or the visitor has no seat', () => {
    const s = seated();
    const none = applyMessage(s, actorFor(s, H.a), { t: 'clock', op: 'pause' }, T0 + 5);
    expect(none.ok ? 'ok' : none.code).toBe('no_clock');
    const running = start(s);
    const stranger = applyMessage(running, actorFor(running, H.x), { t: 'clock', op: 'pause' }, T0 + 200);
    expect(stranger.ok ? 'ok' : stranger.code).toBe('not_seated');
  });

  it('rejects bad start options', () => {
    const s = seated();
    for (const [seconds, first] of [[2, 0], [30, 9], [999, 0], [30.5, 0]] as const) {
      const r = applyMessage(s, host(s), { t: 'clock', op: 'start', seconds, first }, T0 + 5);
      expect(r.ok ? 'ok' : r.code).toBe('bad_clock');
    }
  });
});

describe('poker through the room', () => {
  function pokerRoom(): RoomState {
    const made = createRoom({ name: 'Night', gameId: 'poker', playerCount: 3, unit: 'pts', hostName: 'A', setup: { chips: 100, moneyUnits: 50, buyIn: 1000 } }, 'ABCDE', H.host, T0);
    if (!made.ok) throw new Error(made.message);
    let s = made.value;
    for (const [tok, name] of [[H.a, 'B'], [H.b, 'C']] as const) {
      const j = joinRoom(s, tok, name, T0 + 1);
      if (!j.ok) throw new Error(j.message);
      s = j.value.state;
    }
    return s;
  }
  const buyIns = { p1: [1000], p2: [1000], p3: [1000] };

  it('refuses a night where chips in and out differ, then accepts it once the difference is assigned', () => {
    const s = pokerRoom();
    const input = { buyIns, cashOuts: { p1: 1800, p2: 900, p3: 200 } };
    const bad = applyMessage(s, host(s), { t: 'addRound', input }, T0 + 2);
    expect(bad.ok ? 'ok' : bad.code).not.toBe('ok');
    const ok = applyMessage(s, host(s), { t: 'addRound', input: { ...input, adjustTo: 'p3' } }, T0 + 3);
    if (!ok.ok) throw new Error(ok.message);
    // 100 chips = 50 units: +800, -100, -700 chips
    expect(buildView(ok.value, new Set()).totals).toEqual({ p1: 400, p2: -50, p3: -350 });
  });

  it('a second night adds to the first', () => {
    let s = pokerRoom();
    for (const outs of [{ p1: 1500, p2: 1000, p3: 500 }, { p1: 500, p2: 1000, p3: 1500 }]) {
      const r = applyMessage(s, host(s), { t: 'addRound', input: { buyIns, cashOuts: outs } }, T0 + 4);
      if (!r.ok) throw new Error(r.message);
      s = r.value;
    }
    expect(buildView(s, new Set()).totals).toEqual({ p1: 0, p2: 0, p3: 0 });
  });
});

describe('parseClientMessage numbers (from the stress tests)', () => {
  it('refuses NaN and Infinity where a number is needed', () => {
    expect(parseClientMessage({ t: 'deal', stake: NaN, turnSeconds: 0 })).toBeNull();
    expect(parseClientMessage({ t: 'deal', stake: 5, turnSeconds: Infinity })).toBeNull();
    expect(parseClientMessage({ t: 'clock', op: 'start', seconds: NaN, first: 0 })).toBeNull();
    expect(parseClientMessage({ t: 'deal', stake: 5, turnSeconds: 20 })).toEqual({ t: 'deal', stake: 5, turnSeconds: 20 });
  });
});
