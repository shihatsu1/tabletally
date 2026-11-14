import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../src/core/ledger';
import {
  actorFor,
  applyMessage,
  buildView,
  createRoom,
  DAY_MS,
  expiresAt,
  isExpired,
  joinRoom,
  lobbyInfo,
  type RoomState,
} from '../src/worker/roomLogic';
import { cleanName, parseClientMessage } from '../src/shared/protocol';

const T0 = 1_700_000_000_000;
const H = { host: 'h'.repeat(64), a: 'a'.repeat(64), b: 'b'.repeat(64), c: 'c'.repeat(64), x: 'f'.repeat(64) };

function room(playerCount = 4, gameId = 'pusoy-dos'): RoomState {
  const r = createRoom({ name: 'Friday night', gameId, playerCount, unit: 'pts', hostName: 'A' }, 'ABCDE', H.host, T0);
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

/** Hands as the game records them when they end (round.add by 'game'), without dealing them card by card. */
function recorded(s: RoomState, inputs: unknown[]): RoomState {
  const events: LedgerEvent<unknown>[] = [...s.events];
  let next = s.nextRound;
  for (const input of inputs) events.push({ type: 'round.add', id: `r${next++}`, at: T0 + next, by: 'game', input });
  return { ...s, events, nextRound: next };
}

const host = (s: RoomState) => actorFor(s, H.host);
const code = (r: ReturnType<typeof applyMessage>): string => (r.ok ? 'ok' : r.code);

describe('createRoom', () => {
  it('creates a play-in-the-app room with the host seated as p1', () => {
    const s = room();
    expect(s.players).toEqual([{ id: 'p1', name: 'A', tokenHash: H.host }]);
    expect(s.gameId).toBe('pusoy-dos');
  });

  it('rejects unknown games, bad counts, empty names and long units', () => {
    const base = { name: 'x', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'A' };
    const c = (over: object) => {
      const r = createRoom({ ...base, ...over }, 'ABCDE', H.host, T0);
      return r.ok ? 'ok' : r.code;
    };
    expect(c({ gameId: 'nope' })).toBe('bad_game');
    expect(c({ gameId: '__proto__' })).toBe('bad_game');
    expect(c({ playerCount: 7 })).toBe('bad_player_count');
    expect(c({ playerCount: '4' })).toBe('bad_player_count');
    expect(c({ name: '   ' })).toBe('bad_name');
    expect(c({ hostName: '' })).toBe('bad_name');
    expect(c({ unit: 'x'.repeat(13) })).toBe('bad_unit');
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

  it('refuses a full table, duplicate names (case-insensitive) and joins after hands start', () => {
    const full = seated(2);
    const r1 = joinRoom(full, H.x, 'Z', T0);
    expect(r1.ok ? 'ok' : r1.code).toBe('room_full');

    const r2 = joinRoom(room(), H.a, 'a', T0);
    expect(r2.ok ? 'ok' : r2.code).toBe('name_taken');

    const started = recorded(seated(), [{ winner: 'p1', stake: 5 }]);
    const r3 = joinRoom({ ...started, players: started.players.slice(0, 3) }, H.x, 'Z', T0 + 3);
    expect(r3.ok ? 'ok' : r3.code).toBe('game_started');
  });

  it('only visitors with a token matching a seat get a player id', () => {
    expect(actorFor(seated(), H.x)).toEqual({ playerId: null, isHost: false });
  });

  it('shows a visitor the table before they sit down: open, full or started, and nothing private', () => {
    expect(lobbyInfo(room())).toEqual({ name: 'Friday night', gameId: 'pusoy-dos', seated: 1, playerCount: 4, status: 'open' });
    expect(lobbyInfo(seated()).status).toBe('full');
    expect(lobbyInfo(recorded(seated(), [{ winner: 'p1', stake: 5 }])).status).toBe('started');
    expect(JSON.stringify(lobbyInfo(seated()))).not.toMatch(/"B"|"C"|hash/);
  });
});

describe('the ledger is the game\'s', () => {
  it('there is no way to type a result: score-only messages are not part of the protocol', () => {
    for (const t of ['addRound', 'edit', 'addPlayer', 'clock']) {
      expect(parseClientMessage({ t, input: { winner: 'p1', stake: 5 }, id: 'r1', reason: 'x', name: 'Q', op: 'stop' })).toBeNull();
    }
  });

  it('only the host may void, restore or keep the room', () => {
    const s = recorded(seated(), [{ winner: 'p1', stake: 5 }]);
    const guest = actorFor(s, H.a);
    for (const msg of [{ t: 'undo' }, { t: 'restore' }, { t: 'keep', days: 30 }] as const) {
      expect(code(applyMessage(s, guest, msg, T0 + 5))).toBe('not_host');
    }
  });

  it('replays the canonical Pusoy Dos game through the room', () => {
    const ids: Record<string, string> = { A: 'p1', B: 'p2', C: 'p3', D: 'p4' };
    const rounds: [string, number][] = [
      ...['A', 'B', 'B', 'D', 'C'].map((w): [string, number] => [w, 50]),
      ...['D', 'D', 'B', 'C', 'B', 'C', 'A', 'D'].map((w): [string, number] => [w, 200]),
      ...['A', 'C'].map((w): [string, number] => [w, 300]),
    ];
    const s = recorded(seated(), rounds.map(([w, stake]) => ({ winner: ids[w], stake })));
    const v = buildView(s, new Set(['p1']));
    expect(v.rounds).toHaveLength(15);
    expect(v.totals).toEqual({ p1: -250, p2: -450, p3: 550, p4: 150 });
    expect(v.players.find((p) => p.id === 'p1')?.connected).toBe(true);
    expect(JSON.stringify(v)).not.toContain(H.host); // token hashes never leave the server
  });

  it('the host can void the last hand and bring it back, until another hand is recorded', () => {
    let s = recorded(seated(), [{ winner: 'p1', stake: 10 }, { winner: 'p2', stake: 10 }]);
    expect(code(applyMessage(s, host(s), { t: 'restore' }, T0 + 30))).toBe('nothing_to_restore');

    const voided = applyMessage(s, host(s), { t: 'undo' }, T0 + 31);
    if (!voided.ok) throw new Error(voided.message);
    s = voided.value;
    expect(buildView(s, new Set()).totals).toEqual({ p1: 30, p2: -10, p3: -10, p4: -10 });
    expect(buildView(s, new Set()).history.at(-1)).toMatchObject({ action: 'undo', roundId: 'r2' });

    const back = applyMessage(s, host(s), { t: 'restore' }, T0 + 32);
    if (!back.ok) throw new Error(back.message);
    expect(buildView(back.value, new Set()).totals).toEqual({ p1: 20, p2: 20, p3: -20, p4: -20 });
    expect(buildView(back.value, new Set()).history.at(-1)).toMatchObject({ action: 'restore', roundId: 'r2' });
    // restoring twice is refused
    expect(code(applyMessage(back.value, host(back.value), { t: 'restore' }, T0 + 33))).toBe('nothing_to_restore');

    // once a new hand is recorded, the voided one is gone for good
    const later = recorded(s, [{ winner: 'p3', stake: 10 }]);
    expect(code(applyMessage(later, host(later), { t: 'restore' }, T0 + 40))).toBe('nothing_to_restore');

    const empty = room();
    expect(code(applyMessage(empty, host(empty), { t: 'undo' }, T0))).toBe('invalid_round');
  });

  it('a hand cannot be voided while one is being played', () => {
    const s = seated();
    const dealt = applyMessage(s, host(s), { t: 'deal', stake: 5, turnSeconds: 0 }, T0 + 5);
    if (!dealt.ok) throw new Error(dealt.message);
    const withRound = recorded(dealt.value, [{ winner: 'p1', stake: 5 }]);
    expect(code(applyMessage(withRound, host(withRound), { t: 'undo' }, T0 + 6))).toBe('hand_running');
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
    expect(parseClientMessage({ t: 'restore' })).toEqual({ t: 'restore' });
    expect(parseClientMessage({ t: 'keep', days: 7 })).toBeNull();
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage([])).toBeNull();
    expect(parseClientMessage({ t: 'drop tables' })).toBeNull();
  });

  it('cleans names', () => {
    expect(cleanName('  Player   One ')).toBe('Player One');
    expect(cleanName('a\u0000b')).toBe('ab');
    expect(cleanName('')).toBeNull();
    expect(cleanName('x'.repeat(25))).toBeNull();
    expect(cleanName(5)).toBeNull();
  });

  it('refuses NaN and Infinity where a number is needed', () => {
    expect(parseClientMessage({ t: 'deal', stake: NaN, turnSeconds: 0 })).toBeNull();
    expect(parseClientMessage({ t: 'deal', stake: 5, turnSeconds: Infinity })).toBeNull();
    expect(parseClientMessage({ t: 'deal', stake: 5, turnSeconds: 20 })).toEqual({ t: 'deal', stake: 5, turnSeconds: 20 });
  });
});

describe('room limits', () => {
  it('stops accepting ledger changes at the event cap', () => {
    const base = seated();
    const full = { ...base, events: Array.from({ length: 1500 }, (_, i) => ({ type: 'round.undo' as const, at: i, by: 'host' })) };
    for (const msg of [{ t: 'undo' }, { t: 'restore' }] as const) expect(code(applyMessage(full, host(full), msg, T0 + 5))).toBe('too_many');
    expect(code(applyMessage(full, host(full), { t: 'deal', stake: 5, turnSeconds: 0 }, T0 + 5))).toBe('too_many');
  });

  // A running total past the 1e12 limit cannot be reached through a room: Pusoy Dos caps a stake at 10,000,000, so
  // even 1500 hands at the largest multiplier stay below it. The ledger refuses such a round itself; see
  // test/ledger.test.ts ("rejects a round that pushes a running total past the limit").
});

describe('game options (setup)', () => {
  const cardsLeft = (n = 4) => ({ ...(seated(n).setup as object), scoring: 'cards-left', settlement: 'pairwise' });

  it('the host can change options before the first hand; a guest cannot', () => {
    const s = seated();
    expect(code(applyMessage(s, actorFor(s, H.a), { t: 'setup', setup: cardsLeft() }, T0 + 5))).toBe('not_host');
    const r = applyMessage(s, host(s), { t: 'setup', setup: cardsLeft() }, T0 + 5);
    if (!r.ok) throw new Error(r.message);
    expect(buildView(r.value, new Set()).setup).toMatchObject({ scoring: 'cards-left', settlement: 'pairwise' });
  });

  it('then scores hands with the chosen system', () => {
    const r = applyMessage(seated(), host(seated()), { t: 'setup', setup: cardsLeft() }, T0 + 5);
    if (!r.ok) throw new Error(r.message);
    const s = recorded(r.value, [{ winner: 'p1', stake: 1, cardsLeft: { p2: 5, p3: 10, p4: 13 } }]);
    expect(buildView(s, new Set()).totals).toEqual({ p1: 64, p2: 44, p3: -16, p4: -92 });
  });

  it('options lock after the first hand and invalid options are refused', () => {
    const s = seated();
    expect(code(applyMessage(s, host(s), { t: 'setup', setup: { scoring: 'nope' } }, T0 + 5))).toBe('bad_setup');
    const started = recorded(s, [{ winner: 'p1', stake: 5 }]);
    expect(code(applyMessage(started, host(started), { t: 'setup', setup: cardsLeft() }, T0 + 7))).toBe('game_started');
  });

  it('options may be given at creation and are validated there', () => {
    const ok = createRoom({ name: 'x', gameId: 'pusoy-dos', playerCount: 3, unit: 'pts', hostName: 'A', setup: { ...cardsLeft(), placementPoints: [3, 1, 0] } }, 'ABCDE', H.host, T0);
    expect(ok.ok).toBe(true);
    const bad = createRoom({ name: 'x', gameId: 'pusoy-dos', playerCount: 3, unit: 'pts', hostName: 'A', setup: { scoring: 'nope' } }, 'ABCDE', H.host, T0);
    expect(bad.ok ? 'ok' : bad.code).toBe('bad_setup');
  });
});
