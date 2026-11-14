import { describe, it } from 'vitest';
import { LedgerError } from '../../src/core/ledger';
import { BOT_LEVELS } from '../../src/core/play';
import { games, getGame } from '../../src/games';
import { getEngine } from '../../src/games/engines';
import { cleanName, parseClientMessage, MAX_NAME_LENGTH, type ClientMessage } from '../../src/shared/protocol';
import {
  actorFor, advancePlay, applyMessage, buildView, createRoom, expiresAt, isLinked, joinRoom, playEnvelope, wakeAt, MAX_EVENTS, type RoomState,
} from '../../src/worker/roomLogic';
import { Failures, N, garbage, pick, range, roundTrip, same, seeded, sum } from './harness';

const hashOf = (i: number): string => i.toString(16).padStart(64, '0');
const HOST = hashOf(1);
const GUESTS = range(8).map((i) => hashOf(100 + i));
const STRANGER = hashOf(999);
const NAMES = ['Ann', 'ann', ' Ann ', 'Ben', 'Cy', 'Di', '', '   ', 'x'.repeat(24), 'x'.repeat(25), 'x'.repeat(80), '😀', '😀😀😀😀😀😀😀😀😀😀😀😀😀', 'Ca\u0000t', 'Computer 1', 'COMPUTER 1', 'Ñandú', 'عربى', 'a‏b', '\n', 'tab\tname', '__proto__', 'constructor', 'null', '0', 'A  B   C'];
const FORBIDDEN_KEYS = ['hands', 'seats', 'stock', 'deck', 'sets', 'hole', 'eligible'];

function hasKey(x: unknown, keys: string[], depth = 0): string | null {
  if (depth > 8 || typeof x !== 'object' || x === null) return null;
  for (const [k, v] of Object.entries(x)) {
    if (keys.includes(k)) return k;
    const inner = hasKey(v, keys, depth + 1);
    if (inner) return inner;
  }
  return null;
}

/** A round that is valid for the game's default options (used to exercise the ledger, undo and edit). */
function validRound(gameId: string, players: string[], r: () => number): unknown {
  const winner = pick(players, r);
  const stake = pick([1, 5, 50], r);
  if (gameId === 'pusoy-dos') return { winner, stake };
  if (gameId === 'tong-its') return { winner, ending: 'normal', stake };
  if (gameId === 'pusoy') return { stake, rows: { front: [players], middle: [players], back: [players] } };
  return { buyIns: Object.fromEntries(players.map((p) => [p, [100]])), cashOuts: Object.fromEntries(players.map((p, i) => [p, i === 0 ? 100 + 50 * (players.length - 1) : 50])) };
}

function randomRoom(r: () => number): RoomState | null {
  const gameId = pick(Object.keys(games), r);
  const game = getGame(gameId)!;
  const mode = r() % 3 === 0 ? 'score' : 'play';
  const engine = mode === 'play' ? getEngine(gameId) : undefined;
  const counts = (engine?.playerCounts ?? game.playerCounts) as readonly number[];
  const playerCount = pick(counts, r);
  const bots = mode === 'play' ? range(r() % playerCount).map(() => pick(BOT_LEVELS, r)) : [];
  const out = createRoom(
    { name: pick(['Night', ' ', 'x'.repeat(41), 'Game night'], r), gameId, playerCount, unit: pick(['pts', 'PHP', '', 'x'.repeat(13), '  USD  '], r), hostName: pick(NAMES, r), mode, bots, ...(r() % 4 === 0 ? { setup: garbage(r) } : {}) },
    'ABCDE', HOST, 1_700_000_000_000,
  );
  return out.ok ? out.value : null;
}

describe('Room and protocol stress', () => {
  it('parseClientMessage and cleanName survive random garbage', () => {
    const f = new Failures();
    const r = seeded(808);
    const TYPES = ['join', 'addRound', 'undo', 'edit', 'addPlayer', 'rename', 'addBot', 'removeBot', 'deal', 'move', 'setup', 'keep', 'clock', 'react', 'ping', 'nope', '__proto__'];
    const rnd = (depth = 0): unknown => {
      const k = r() % 9;
      if (depth > 3 || k < 4) return pick([null, true, false, 0, -1, 1e308, NaN, 'x', '', 'p1', NAMES[r() % NAMES.length], 'a'.repeat(70), 5, 30, 1, 1.5], r);
      if (k < 6) return Array.from({ length: r() % 4 }, () => rnd(depth + 1));
      const o: Record<string, unknown> = {};
      for (const key of ['t', 'name', 'token', 'input', 'id', 'reason', 'playerId', 'level', 'stake', 'turnSeconds', 'move', 'setup', 'days', 'op', 'seconds', 'first', 'emoji', 'to', 'cards', '__proto__']) if (r() % 3 === 0) o[key] = rnd(depth + 1);
      if (r() % 2) o.t = pick(TYPES, r);
      return o;
    };
    for (let t = 0; t < N(60000); t++) {
      const raw = rnd();
      const m = f.guard(`parse ${JSON.stringify(raw)}`, () => parseClientMessage(raw));
      if (m) {
        f.check(TYPES.includes(m.t), () => `parse returned an unknown type ${m.t}`);
        f.check(same(parseClientMessage(JSON.parse(JSON.stringify(m))), m), () => `parse is not stable for ${JSON.stringify(m)}`);
      }
      const name = pick([...NAMES, JSON.stringify(rnd()) ?? "undefined", 'x'.repeat(r() % 60), '\u0000'.repeat(r() % 5) + 'ab'], r);
      const c = f.guard(`cleanName ${JSON.stringify(name)}`, () => cleanName(name));
      if (c !== null && c !== undefined) {
        f.check(c.length >= 1 && c.length <= MAX_NAME_LENGTH, () => `cleanName length ${c.length} for ${JSON.stringify(name)}`);
        f.check(c === c.trim() && !/\s\s/.test(c) && !/[\u0000-\u001f\u007f]/.test(c), () => `cleanName left junk: ${JSON.stringify(c)}`);
        f.check(cleanName(c) === c, () => `cleanName not idempotent: ${JSON.stringify(c)}`);
      }
    }
    f.done('protocol fuzz');
  });

  it('thousands of random message sequences keep every room invariant (permissions, ledger, privacy, scheduling)', () => {
    const f = new Failures();
    const rooms = N(250);
    let ops = 0;
    let accepted = 0;
    let handsRecorded = 0;
    const acc: Record<string, number> = {};
    const rej: Record<string, number> = {};
    for (let k = 0; k < rooms; k++) {
      const seed = 5000 + k;
      const r = seeded(seed);
      let s0: RoomState | null = null;
      for (let tries = 0; tries < 400 && !s0; tries++) s0 = randomRoom(r);
      if (!s0) { f.add(`seed=${seed}: could not create any room in 400 tries`); continue; }
      let s: RoomState = s0;
      const ctx0 = `seed=${seed} ${s.gameId}/${s.mode}/${s.playerCount}p`;
      let now = 1_700_000_000_000;
      const knownIds = new Set(s.players.map((p) => p.id));
      const joined = new Set<string>();
      const lastLen = { events: 0 };
      const steps = 120 + (r() % 260);
      for (let i = 0; i < steps; i++) {
        const ctx = `${ctx0} step=${i}`;
        ops++;
        now += pick([50, 400, 1500, 5000, 20_000, 120_000, 3_600_000], r);
        const kind = r() % 100;
        const before = s;
        let msg: ClientMessage | null = null;
        let actorHash = pick([HOST, HOST, HOST, HOST, HOST, HOST, ...GUESTS.slice(0, 4), STRANGER], r);
        const actor = actorFor(s, actorHash);
        let note = '';

        if (kind < 10) {
          // someone tries to sit down
          const hash = pick(GUESTS, r);
          const res = f.guard(`${ctx} join`, () => joinRoom(s, hash, pick(NAMES, r), now));
          if (res?.ok) {
            s = res.value.state;
            joined.add(hash);
            accepted++;
          }
          note = 'join';
        } else if (kind < 45) {
          // play sensibly: a pending human acts, or a bot/timeout is due
          if (s.play) {
            const pend = playEnvelope(s, null)!.pending;
            const human = s.players.find((p) => pend.includes(p.id) && !p.bot && p.tokenHash);
            if (human && r() % 3 !== 0) {
              const env = playEnvelope(s, human.id)!;
              const engine = getEngine(s.gameId)!;
              const move = r() % 5 === 0 ? garbage(r) : engine.timeoutMove(env.view);
              msg = parseClientMessage({ t: 'move', move });
              actorHash = human.tokenHash!;
              note = 'human move';
            } else {
              const due = Math.max(s.play.botAt ?? 0, (s.play.turnStartedAt ?? 0) + s.play.turnMs * 6 + 1);
              now = Math.max(now, due);
              const adv = f.guard(`${ctx} advance`, () => advancePlay(s, now));
              if (adv) {
                f.check(adv === s || adv.play !== null, () => `${ctx}: advancePlay lost the hand`);
                s = adv;
              }
              note = 'advance';
            }
          } else {
            msg = parseClientMessage({ t: 'deal', stake: pick([1, 10, 0, -3, 1.5, 1e9], r), turnSeconds: pick([0, 5, 20, 400, -1], r) });
            note = 'deal';
          }
        } else {
          const ids = s.players.map((p) => p.id);
          const raw: Record<string, unknown>[] = [
            { t: 'deal', stake: pick([1, 5, 50, 0, 1e9], r), turnSeconds: pick([0, 0, 20, 400], r) },
            { t: 'addRound', input: r() % 2 ? validRound(s.gameId, ids, r) : garbage(r) },
            { t: 'undo' },
            { t: 'edit', id: pick(['r1', 'r2', 'r99', 'x', ''], r), reason: pick(['typo', '', 'x'.repeat(141), 'ok'], r), input: r() % 2 ? validRound(s.gameId, ids, r) : garbage(r) },
            { t: 'addPlayer', name: pick(NAMES, r) },
            { t: 'rename', name: pick(NAMES, r), ...(r() % 2 ? { playerId: pick([...ids, 'p99', 'x'], r) } : {}) },
            { t: 'addBot', level: pick([...BOT_LEVELS, 'god'], r) },
            { t: 'removeBot', playerId: pick([...ids, 'p99'], r) },
            { t: 'setup', setup: r() % 2 ? s.setup : garbage(r) },
            { t: 'keep', days: pick([1, 30, 7], r) },
            { t: 'clock', op: pick(['start', 'stop', 'done', 'pause', 'decline', 'resume', 'bad'], r), seconds: pick([5, 30, 90, 1000, -1], r), first: pick([0, 1, 2, 9, -1], r) },
            { t: 'ping' }, { t: 'react', emoji: '\u{1F44D}' }, garbage(r) as Record<string, unknown>,
          ];
          msg = parseClientMessage(pick(raw, r));
          note = msg?.t ?? 'unparsed';
        }

        if (msg && msg.t !== 'ping' && msg.t !== 'react') {
          const res = f.guard(`${ctx} apply ${JSON.stringify(msg).slice(0, 200)}`, () => applyMessage(s, actor, msg!, now, 1 + (r() % 1_000_000)));
          if (res) {
            if (!res.ok) rej[res.code] = (rej[res.code] ?? 0) + 1;
            if (res.ok) {
              accepted++;
              acc[msg.t] = (acc[msg.t] ?? 0) + 1;
              s = res.value;
              // ---- permissions: things only the host may do
              const hostOnly = ['addRound', 'undo', 'edit', 'addPlayer', 'addBot', 'removeBot', 'deal', 'setup', 'keep'];
              if (hostOnly.includes(msg.t) && !actor.isHost) f.add(`${ctx}: a non-host got ${msg.t} accepted`);
              if (msg.t === 'move' && !actor.playerId) f.add(`${ctx}: an unseated device made a move`);
              if (msg.t === 'rename') {
                const target = msg.playerId ?? actor.playerId;
                const was = before.players.find((p) => p.id === target);
                const mine = actor.playerId === target;
                if (!was) f.add(`${ctx}: renamed a player that does not exist`);
                else if (!mine && !(actor.isHost && (was.manual || was.bot))) f.add(`${ctx}: rename of someone else's name was allowed`);
              }
              if (msg.t === 'addRound' && before.mode === 'play') f.add(`${ctx}: a hand was typed in at a play table`);
              if ((msg.t === 'undo' || msg.t === 'edit') && isLinked(before)) f.add(`${ctx}: undo/edit of a linked-hands game succeeded`);
              if (msg.t === 'setup' && (before.events.length > 0 || (before.play && playEnded(before) === false))) f.add(`${ctx}: options changed after play started`);
              if ((msg.t === 'addBot' || msg.t === 'addPlayer') && (before.events.length > 0 || before.play)) f.add(`${ctx}: a seat was added after play started`);
            }
          }
        }

        // ---------- invariants after every step
        const ctxI = `${ctx} (${note})`;
        f.check(same(roundTrip(s), s), () => `${ctxI}: room state does not survive JSON`);
        const names = s.players.map((p) => p.name.toLowerCase());
        f.check(new Set(names).size === names.length, () => `${ctxI}: duplicate player names ${JSON.stringify(s.players.map((p) => p.name))}`);
        f.check(new Set(s.players.map((p) => p.id)).size === s.players.length && s.players.length <= s.playerCount, () => `${ctxI}: player ids or count wrong`);
        for (const id of knownIds) f.check(s.players.some((p) => p.id === id) || (s.players.find((p) => p.id === id) === undefined && before.players.every((p) => p.id !== id || true)), () => `${ctxI}: id ${id} vanished`);
        for (const p of s.players) knownIds.add(p.id);
        f.check(s.players.every((p) => p.name.length >= 1 && p.name.length <= MAX_NAME_LENGTH), () => `${ctxI}: a name has a bad length`);
        f.check(s.events.length <= MAX_EVENTS + 1, () => `${ctxI}: too many events`);
        const view = f.guard(`${ctxI} buildView`, () => buildView(s, new Set(), now));
        if (view) {
          f.check(Math.abs(sum(view.totals)) === 0, () => `${ctxI}: totals not zero-sum ${JSON.stringify(view.totals)}`);
          const leak = hasKey(view, FORBIDDEN_KEYS);
          f.check(leak === null, () => `${ctxI}: the shared room view contains "${leak}"`);
          f.check(view.rounds.length <= s.events.length, () => `${ctxI}: more rounds than events`);
        }
        if (s.events.length > lastLen.events) handsRecorded += s.events.length - lastLen.events;
        lastLen.events = s.events.length;
        if (s.play) {
          const env = f.guard(`${ctxI} envelope`, () => playEnvelope(s, pick([null, ...s.players.map((p) => p.id)], r)));
          if (env) {
            const pend = env.pending;
            const bots = pend.filter((id) => s.players.find((p) => p.id === id)?.bot);
            f.check(pend.every((id) => s.players.some((p) => p.id === id)), () => `${ctxI}: pending names a stranger`);
            if (bots.length > 0) f.check(s.play.botAt !== null, () => `${ctxI}: a computer is pending but no move is scheduled (STALL)`);
            if (pend.length === 0) f.check(s.play.botAt === null && s.play.turnStartedAt === null, () => `${ctxI}: hand over but timers still set`);
            if (pend.some((id) => !s.players.find((p) => p.id === id)?.bot) && s.play.turnMs > 0) f.check(s.play.turnStartedAt !== null, () => `${ctxI}: a human is pending with a time limit but no clock`);
            f.check(wakeAt(s) <= expiresAt(s), () => `${ctxI}: wake-up after expiry`);
            const leak2 = hasKey(env, ['stock', 'deck']);
            f.check(leak2 === null, () => `${ctxI}: the hand view contains "${leak2}"`);
          }
        }
      }
      // drain: let every computer and timer run; nothing may loop or stall forever
      if (s.play) {
        let guard = 0;
        while (guard++ < 600) {
          const env = playEnvelope(s, null)!;
          if (env.pending.length === 0) break;
          const pl = s.play!;
          const due = Math.max(pl.botAt ?? 0, (pl.turnStartedAt ?? 0) + pl.turnMs * 6 + 1);
          if (pl.botAt === null && (pl.turnStartedAt === null || pl.turnMs === 0)) break; // waiting on a human with no limit, by design
          now = Math.max(now + 1, due);
          const next = f.guard(`${ctx0} drain`, () => advancePlay(s, now));
          if (!next) break;
          if (next === s) { f.add(`${ctx0}: advancePlay made no progress although a move is due (alarm would spin)`); break; }
          s = next;
        }
        f.check(guard < 600, () => `${ctx0}: hand never finished while draining`);
      }
      void LedgerError;
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] room: ${rooms} rooms, ${ops} ops, ${accepted} accepted messages, ${handsRecorded} ledger events\n  accepted by type: ${JSON.stringify(acc)}\n  rejected by code: ${JSON.stringify(rej)}`);
    f.done('room fuzz');
  });
});

function playEnded(s: RoomState): boolean {
  return s.play ? playEnvelope(s, null)!.toAct === null : true;
}
