import { LedgerError, replay, type LedgerEvent } from '../core/ledger';
import { BOT_LEVELS, type BotLevel } from '../core/play';
import { mixSeed, type Rng } from '../core/rng';
import { getGame } from '../games';
import { getEngine } from '../games/engines';
import {
  cleanName,
  type ClientMessage,
  type LobbyInfo,
  type PlayEnvelope,
  type RoomView,
} from '../shared/protocol';

/** Pure room logic. The Durable Object is a thin adapter around these functions, so everything
 *  here is unit-tested without a server. No I/O, no clock, no randomness: callers pass `now`. The only side
 *  effect is console.error when a game engine throws (an engine bug), so it shows in the Worker's logs. */

export const DAY_MS = 86_400_000;
export const MAX_ROOM_NAME = 40;
export const MAX_UNIT = 12;
export const MAX_EVENTS = 1500;

export interface PlayerRec {
  id: string;
  name: string;
  /** SHA-256 hex of the device token. Null for computers. */
  tokenHash: string | null;
  /** Set for computer players. */
  bot?: BotLevel;
}

/** The hand being played (digital play). Lives in the room's saved data and is deleted with the room. */
export interface PlayRec {
  /** The engine's own state, including every hand. Never sent to a phone as-is; only through `viewFor`. */
  state: unknown;
  stake: number;
  handNo: number;
  /** Per-turn time limit in ms, 0 = none. */
  turnMs: number;
  /** When the current turn began (server time), or null. */
  turnStartedAt: number | null;
  /** When a computer player will move (server time), or null. */
  botAt: number | null;
  seed: number;
  /** Moves made this hand; mixed into each computer's seed so every move is reproducible. */
  moves: number;
  /** Bounded server-only states used to describe consecutive moves to each viewer. */
  animationHistory?: { revision: number; before: unknown; after: unknown }[];
  /** Set when the finished hand could not be added to the ledger (for example a running total would pass the limit). */
  unscored?: boolean;
}

export interface RoomState {
  code: string;
  name: string;
  gameId: string;
  setup: unknown;
  playerCount: number;
  unit: string;
  hostHash: string;
  /** SHA-256 of the host key shown once at creation. Cleared when the host role is handed over. */
  hostKeyHash?: string | null;
  players: PlayerRec[];
  events: LedgerEvent<unknown>[];
  nextRound: number;
  nextPlayer: number;
  createdAt: number;
  lastActivityAt: number;
  keepDays: 1 | 30;
  play?: PlayRec | null;
}

export interface Actor {
  playerId: string | null;
  isHost: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
const fail = (code: string, message: string): { ok: false; code: string; message: string } => ({
  ok: false,
  code,
  message,
});

export interface CreateParams {
  name: unknown;
  gameId: unknown;
  playerCount: unknown;
  unit: unknown;
  hostName: unknown;
  /** Optional host options. Defaults to the game's defaults when absent. */
  setup?: unknown;
  /** Levels of computer players to seat now, at most playerCount - 1. */
  bots?: unknown;
}

export const MAX_PLAY_STAKE = 10_000_000;
export const MAX_TURN_SECONDS = 300;
const BOT_NAME = 'Computer';

export function createRoom(
  p: CreateParams,
  code: string,
  hostHash: string,
  now: number,
  hostKeyHash: string | null = null,
): Result<RoomState> {
  const name = typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 1 || name.length > MAX_ROOM_NAME) return fail('bad_name', 'Room name must be 1 to 40 characters.');
  const hostName = cleanName(p.hostName);
  if (!hostName) return fail('bad_name', 'Your name must be 1 to 24 characters.');
  const game = typeof p.gameId === 'string' ? getGame(p.gameId) : undefined;
  if (!game) return fail('bad_game', 'Unknown game.');
  const playerCount = p.playerCount;
  if (typeof playerCount !== 'number' || !game.playerCounts.includes(playerCount)) {
    return fail('bad_player_count', `This game supports ${game.playerCounts.join(', ')} players.`);
  }
  const unit = typeof p.unit === 'string' ? p.unit.trim() : '';
  if (unit.length < 1 || unit.length > MAX_UNIT) return fail('bad_unit', 'Unit label must be 1 to 12 characters.');

  let setup: unknown = game.defaultSetup(playerCount);
  if (p.setup !== undefined) {
    const problems = setupProblems(game.id, p.setup, playerCount);
    if (problems.length > 0) return fail('bad_setup', problems.join('; '));
    setup = p.setup;
  }

  // Every table is played in the app: the server deals and runs the turns.
  const engine = getEngine(game.id);
  if (!engine) return fail('no_engine', 'This game cannot be played in the app yet.');
  if (engine.playerCounts && !engine.playerCounts.includes(playerCount)) {
    return fail('bad_player_count', `Playing this game in the app supports ${engine.playerCounts.join(', ')} players.`);
  }
  const wanted = p.bots === undefined ? [] : p.bots;
  if (!Array.isArray(wanted) || wanted.some((l) => !(BOT_LEVELS as readonly unknown[]).includes(l))) return fail('bad_bots', 'Pick Easy, Normal or Hard for each computer.');
  if (wanted.length > playerCount - 1) return fail('bad_bots', 'There is no room for that many computers.');

  const players: PlayerRec[] = [{ id: 'p1', name: hostName, tokenHash: hostHash }];
  (wanted as BotLevel[]).forEach((level, i) => {
    let name = `${BOT_NAME} ${i + 1}`;
    for (let k = i + 1; players.some((pl) => pl.name.toLowerCase() === name.toLowerCase()); k++) name = `${BOT_NAME} ${k + 1}`;
    players.push({ id: `p${i + 2}`, name, tokenHash: null, bot: level });
  });

  return {
    ok: true,
    value: {
      code,
      name,
      gameId: game.id,
      setup,
      playerCount,
      unit,
      hostHash,
      hostKeyHash,
      players,
      events: [],
      nextRound: 1,
      nextPlayer: players.length + 1,
      createdAt: now,
      lastActivityAt: now,
      keepDays: 1,
      play: null,
    },
  };
}

/** Run a game's setup validator; an exception from it means the options are invalid. */
function setupProblems(gameId: string, setup: unknown, playerCount: number): string[] {
  const game = getGame(gameId);
  if (!game) return ['unknown game'];
  try {
    return game.validateSetup(setup, playerCount);
  } catch {
    return ['options could not be read'];
  }
}

export const expiresAt = (s: RoomState): number => s.lastActivityAt + s.keepDays * DAY_MS;
export const isExpired = (s: RoomState, now: number): boolean => now >= expiresAt(s);

export function actorFor(s: RoomState, tokenHash: string): Actor {
  const player = s.players.find((pl) => pl.tokenHash === tokenHash);
  return { playerId: player?.id ?? null, isHost: tokenHash === s.hostHash };
}

const nameTaken = (s: RoomState, name: string): boolean =>
  s.players.some((pl) => pl.name.toLowerCase() === name.toLowerCase());

/** Seat a device, or recognise a returning one. Returning players keep their identity. */
export function joinRoom(
  s: RoomState,
  tokenHash: string,
  rawName: unknown,
  now: number,
): Result<{ state: RoomState; actor: Actor }> {
  const existing = actorFor(s, tokenHash);
  if (existing.playerId) return { ok: true, value: { state: s, actor: existing } };
  const name = cleanName(rawName);
  if (!name) return fail('bad_name', 'Your name must be 1 to 24 characters.');
  if (s.players.length >= s.playerCount) return fail('room_full', 'This table is full.');
  if (s.events.length > 0 || s.play) return fail('game_started', 'Hands have started, so no one new can sit down.');
  if (nameTaken(s, name)) return fail('name_taken', 'Someone at this table already has that name.');
  const id = `p${s.nextPlayer}`;
  const state: RoomState = {
    ...s,
    players: [...s.players, { id, name, tokenHash }],
    nextPlayer: s.nextPlayer + 1,
    lastActivityAt: now,
  };
  return { ok: true, value: { state, actor: { playerId: id, isHost: tokenHash === s.hostHash } } };
}

/**
 * Take the host seat back with the host key, from a phone that lost the host's identity (cleared storage, new
 * phone). The host's seat and the host role move to this phone; the old identity stops working.
 */
export function reclaimHost(s: RoomState, tokenHash: string, keyHash: string, now: number): Result<{ state: RoomState; actor: Actor }> {
  if (!s.hostKeyHash || keyHash !== s.hostKeyHash) return fail('bad_key', 'That host key does not match this table.');
  const seat = s.players.find((pl) => pl.tokenHash === s.hostHash);
  const mine = s.players.find((pl) => pl.tokenHash === tokenHash);
  if (mine && mine !== seat) return fail('already_seated', 'This phone already has another seat at this table.');
  if (!seat) return fail('no_such_player', 'The host seat could not be found.');
  const players = s.players.map((pl) => (pl === seat ? { ...pl, tokenHash } : pl));
  return { ok: true, value: { state: { ...s, players, hostHash: tokenHash, lastActivityAt: now }, actor: { playerId: seat.id, isHost: true } } };
}

/** The table as a phone that is not seated may see it. No names of players, no scores. */
export function lobbyInfo(s: RoomState): LobbyInfo {
  const started = s.events.length > 0 || s.play != null;
  const status = started ? 'started' : s.players.length >= s.playerCount ? 'full' : 'open';
  return { name: s.name, gameId: s.gameId, seated: s.players.length, playerCount: s.playerCount, status };
}

/** Replay the event log; returns the ledger state or a human-readable error. */
function replayState(s: RoomState, events: LedgerEvent<unknown>[]) {
  const game = getGame(s.gameId);
  if (!game) throw new LedgerError('unknown game');
  return replay(game, s.setup, s.players.map((p) => p.id), events);
}

/** Apply a message from a phone. Only the game itself adds hands; the host can void or restore the last one. */
export function applyMessage(
  s: RoomState,
  actor: Actor,
  msg: ClientMessage,
  now: number,
  /** Seed for the computer players' choices this hand (the Worker draws it from crypto). Tests pass a fixed number. */
  seed = 1,
  /** The source the cards are shuffled with: the Worker passes a cryptographic one; tests leave it out (seeded). */
  dealRng?: Rng,
): Result<RoomState> {
  const hostOnly = (): Result<never> | null =>
    actor.isHost ? null : fail('not_host', 'Only the host can do that.');
  const by = actor.playerId ?? 'host';
  const changesLedger = msg.t === 'undo' || msg.t === 'restore';
  if (changesLedger && s.events.length >= MAX_EVENTS) {
    return fail('too_many', 'This room has too many entries. Start a new table.');
  }

  const withEvents = (events: LedgerEvent<unknown>[], bump: Partial<RoomState> = {}): Result<RoomState> => {
    try {
      replayState(s, events);
    } catch (e) {
      if (e instanceof LedgerError) return fail('invalid_round', e.message);
      throw e;
    }
    return { ok: true, value: { ...s, ...bump, events, lastActivityAt: now } };
  };

  switch (msg.t) {
    case 'undo': {
      const denied = hostOnly();
      if (denied) return denied;
      if (isLinked(s)) return fail('linked_hands', 'In this game each hand starts from the last hand\'s chips, so a past hand cannot be voided.');
      if (!playIsOver(s)) return fail('hand_running', 'Wait for the hand being played to end.');
      return withEvents([...s.events, { type: 'round.undo', at: now, by }]);
    }
    case 'restore': {
      const denied = hostOnly();
      if (denied) return denied;
      if (isLinked(s)) return fail('linked_hands', 'In this game each hand starts from the last hand\'s chips, so a past hand cannot be voided.');
      if (!playIsOver(s)) return fail('hand_running', 'Wait for the hand being played to end.');
      if (s.events.at(-1)?.type !== 'round.undo') return fail('nothing_to_restore', 'Only the hand voided last can be brought back, before the next hand is recorded.');
      return withEvents([...s.events, { type: 'round.restore', at: now, by }]);
    }
    case 'rename':
      return rename(s, actor, msg.name, msg.playerId, now);
    case 'makeHost': {
      const denied = hostOnly();
      if (denied) return denied;
      const who = s.players.find((pl) => pl.id === msg.playerId);
      if (!who || who.bot || !who.tokenHash) return fail('no_such_player', 'Pick a person at this table.');
      if (who.tokenHash === s.hostHash) return { ok: true, value: s };
      // The key belonged to the old host, so it stops working; the new host is this person's own phone.
      return { ok: true, value: { ...s, hostHash: who.tokenHash, hostKeyHash: null, lastActivityAt: now } };
    }
    case 'removePlayer': {
      const denied = hostOnly();
      if (denied) return denied;
      if (s.events.length > 0 || s.play) return fail('game_started', 'Hands have started, so seats are fixed.');
      const who = s.players.find((pl) => pl.id === msg.playerId);
      if (!who) return fail('no_such_player', 'That player is not at this table.');
      if (who.tokenHash === s.hostHash) return fail('not_allowed', 'The host cannot remove their own seat.');
      return { ok: true, value: { ...s, players: s.players.filter((pl) => pl.id !== msg.playerId), lastActivityAt: now } };
    }
    case 'reclaim':
      return fail('bad_message', 'Unsupported message.'); // handled by the Worker, which hashes the key first
    case 'addBot': {
      const denied = hostOnly();
      if (denied) return denied;
      if (s.players.length >= s.playerCount) return fail('room_full', 'This table is full.');
      if (s.events.length > 0 || s.play) return fail('game_started', 'Hands have started.');
      const n = s.players.filter((pl) => pl.bot).length + 1;
      let name = `${BOT_NAME} ${n}`;
      for (let k = n; nameTaken(s, name); k++) name = `${BOT_NAME} ${k + 1}`;
      return {
        ok: true,
        value: {
          ...s,
          players: [...s.players, { id: `p${s.nextPlayer}`, name, tokenHash: null, bot: msg.level }],
          nextPlayer: s.nextPlayer + 1,
          lastActivityAt: now,
        },
      };
    }
    case 'removeBot': {
      const denied = hostOnly();
      if (denied) return denied;
      if (s.events.length > 0 || s.play) return fail('game_started', 'Hands have started.');
      if (!s.players.some((pl) => pl.id === msg.playerId && pl.bot)) return fail('no_such_player', 'That is not a computer player.');
      return { ok: true, value: { ...s, players: s.players.filter((pl) => pl.id !== msg.playerId), lastActivityAt: now } };
    }
    case 'deal': {
      const denied = hostOnly();
      if (denied) return denied;
      return deal(s, msg.stake, msg.turnSeconds, now, seed, dealRng);
    }
    case 'move': {
      if (!actor.playerId) return fail('not_seated', 'Sit down to play.');
      // If a time limit has already run out (the alarm has not fired yet), settle that first: a late move is not
      // accepted. Only time limits: a computer's move being due must not swallow this human's move.
      const settled = advancePlay(s, now, true);
      if (settled !== s) return { ok: true, value: settled };
      return playMove(s, actor.playerId, msg.move, now);
    }
    case 'setup': {
      const denied = hostOnly();
      if (denied) return denied;
      if (s.play && !playIsOver(s)) return fail('hand_running', 'Options cannot change while a hand is being played.');
      // Options change how every round is scored, so they are locked once play starts.
      if (s.events.length > 0) return fail('game_started', 'Options are locked once the first round is saved.');
      const problems = setupProblems(s.gameId, msg.setup, s.playerCount);
      if (problems.length > 0) return fail('bad_setup', problems.join('; '));
      return { ok: true, value: { ...s, setup: msg.setup, lastActivityAt: now } };
    }
    case 'keep': {
      const denied = hostOnly();
      if (denied) return denied;
      return { ok: true, value: { ...s, keepDays: msg.days, lastActivityAt: now } };
    }
    default:
      return fail('bad_message', 'Unsupported message.');
  }
}

/** Everything a phone needs to draw the table. Never includes token hashes. */
export function buildView(s: RoomState, connected: ReadonlySet<string>): RoomView {
  const ledger = replayState(s, s.events);
  return {
    code: s.code,
    name: s.name,
    gameId: s.gameId,
    setup: s.setup,
    playerCount: s.playerCount,
    unit: s.unit,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.bot ? { bot: p.bot } : {}),
      connected: p.bot ? true : connected.has(p.id),
    })),
    rounds: ledger.rounds.map((r) => ({ id: r.id, input: r.input, delta: { ...r.delta }, edited: r.edited })),
    totals: ledger.totals,
    history: ledger.history,
    expiresAt: expiresAt(s),
    keepDays: s.keepDays,
  };
}

// ---------------------------------------------------------------------------------------------
// Names

function rename(s: RoomState, actor: Actor, rawName: string, target: string | undefined, now: number): Result<RoomState> {
  const name = cleanName(rawName);
  if (!name) return fail('bad_name', 'Name must be 1 to 24 characters.');
  const id = target ?? actor.playerId;
  const who = s.players.find((pl) => pl.id === id);
  if (!id || !who) return fail('no_such_player', 'That player is not at this table.');
  // You can rename yourself. The host can also rename computers.
  const mine = actor.playerId === id;
  const hostMay = actor.isHost && who.bot !== undefined;
  if (!mine && !hostMay) return fail('not_allowed', 'You can only change your own name.');
  if (s.players.some((pl) => pl.id !== id && pl.name.toLowerCase() === name.toLowerCase())) {
    return fail('name_taken', 'Someone at this table already has that name.');
  }
  // Names are display text only (ids never change), so this is allowed at any time, even after rounds.
  return { ok: true, value: { ...s, players: s.players.map((pl) => (pl.id === id ? { ...pl, name } : pl)), lastActivityAt: now } };
}

// ---------------------------------------------------------------------------------------------
// Digital play

const BOT_MIN_MS = 800;
const BOT_SPREAD_MS = 700;

/** True for a digital table whose hands depend on each other (poker stacks carry over). */
export const isLinked = (s: RoomState): boolean => getEngine(s.gameId)?.linkedHands === true;

export const playIsOver = (s: RoomState): boolean => {
  const engine = getEngine(s.gameId);
  return !s.play || !engine || engine.toAct(s.play.state) === null;
};

/** Who must act now, or null. */
function toAct(s: RoomState): string | null {
  const engine = getEngine(s.gameId);
  return s.play && engine ? engine.toAct(s.play.state) : null;
}

/** Everyone who still has to act: one player in turn-based games, several at once when everyone acts in secret. */
function pendingOf(s: RoomState): string[] {
  const engine = getEngine(s.gameId);
  if (!s.play || !engine) return [];
  if (engine.pending) return engine.pending(s.play.state);
  const who = engine.toAct(s.play.state);
  return who ? [who] : [];
}

/** How long a human has: exactly the host's time per turn (in Pusoy, the time to set the whole hand). */
function turnLimitMs(s: RoomState): number {
  return s.play?.turnMs ?? 0;
}

/** Set (or clear) the computer-move time and the turn clock after anything changed the hand. */
function schedule(s: RoomState, now: number): RoomState {
  if (!s.play) return s;
  const engine = getEngine(s.gameId);
  const pending = pendingOf(s);
  const bots = pending.filter((id) => s.players.find((pl) => pl.id === id)?.bot);
  const humans = pending.length - bots.length;
  const botAt = bots.length > 0 ? now + BOT_MIN_MS + (mixSeed(s.play.seed, s.play.moves) % BOT_SPREAD_MS) : null;
  // In turn-based games each move restarts the clock. When everyone acts at once they share one clock, which keeps
  // running until all of them have acted.
  const keep = engine?.simultaneous === true && s.play.turnStartedAt !== null;
  const turnStartedAt = humans > 0 && s.play.turnMs > 0 ? (keep ? s.play.turnStartedAt : now) : null;
  return { ...s, play: { ...s.play, botAt, turnStartedAt } };
}

/** The next time the room needs waking: expiry, a computer's move, or a human's turn running out. */
export function wakeAt(s: RoomState): number {
  let t = expiresAt(s);
  if (s.play?.botAt != null) t = Math.min(t, s.play.botAt);
  if (s.play?.turnStartedAt != null && s.play.turnMs > 0) t = Math.min(t, s.play.turnStartedAt + turnLimitMs(s));
  return t;
}

function deal(s: RoomState, stake: number, turnSeconds: number, now: number, seed: number, dealRng?: Rng): Result<RoomState> {
  const engine = getEngine(s.gameId);
  if (!engine) return fail('no_engine', 'This game cannot be played in the app.');
  if (s.players.length !== s.playerCount) return fail('table_not_full', `Waiting for ${s.playerCount - s.players.length} more player(s).`);
  if (!playIsOver(s)) return fail('hand_running', 'A hand is already being played.');
  if (s.events.length >= MAX_EVENTS) return fail('too_many', 'This room has too many entries. Start a new table.');
  if (!Number.isSafeInteger(stake) || stake < 1 || stake > MAX_PLAY_STAKE) return fail('bad_stake', `Stake must be a whole number from 1 to ${MAX_PLAY_STAKE.toLocaleString('en-US')}.`);
  if (!Number.isSafeInteger(turnSeconds) || turnSeconds < 0 || turnSeconds > MAX_TURN_SECONDS) return fail('bad_turn_time', 'Turn time must be 0 to 300 seconds.');
  let state: unknown;
  try {
    state = engine.start(s.setup, s.players.map((pl) => pl.id), dealRng ?? seed, s.play?.state ?? null);
  } catch (e) {
    console.error(`deal failed for ${s.gameId} in room ${s.code}`, e); // no cards or tokens in the message
    return fail('bad_setup', 'The game options cannot be dealt.');
  }
  const play: PlayRec = {
    state,
    stake,
    handNo: (s.play?.handNo ?? 0) + 1,
    turnMs: turnSeconds * 1000,
    turnStartedAt: null,
    botAt: null,
    seed,
    moves: 0,
  };
  const dealt: RoomState = { ...s, play, lastActivityAt: now };
  // A hand can be over the moment it is dealt (for example when the blinds put everyone all in): record it now.
  return { ok: true, value: schedule(recordFinishedHand(s, dealt, now), now) };
}

/**
 * If the hand in `state` is over, add it to the ledger as a round (so totals, history and void work).
 * `before` is the room as it was before this change (its events are what the ledger already holds).
 */
function recordFinishedHand(before: RoomState, state: RoomState, now: number): RoomState {
  const engine = getEngine(state.gameId);
  if (!engine || !state.play) return state;
  let input = engine.result(state.play.state);
  if (!input) return state;
  if (engine.finalize) {
    try {
      input = engine.finalize(input, state.setup, replayState(before, before.events).rounds.map((r) => r.input));
    } catch (e) {
      console.error(`finalize failed for ${state.gameId} in room ${state.code}; using the plain result`, e);
    }
  }
  const round = engine.stakeless ? input : { ...input, stake: state.play.stake };
  const ev: LedgerEvent<unknown> = { type: 'round.add', id: `r${before.nextRound}`, at: now, by: 'game', input: round };
  try {
    replayState(before, [...before.events, ev]);
    return { ...state, events: [...before.events, ev], nextRound: before.nextRound + 1 };
  } catch (e) {
    if (!(e instanceof LedgerError)) throw e;
    // The hand still ends (never leave a game stuck, and never loop on a move that cannot be recorded),
    // but it is not scored; the table is told so.
    return { ...state, play: { ...state.play, unscored: true } };
  }
}

/** Apply a move for `pid` (already known to be at the table). Scores the hand when it ends. */
function playMove(s: RoomState, pid: string, move: unknown, now: number): Result<RoomState> {
  const engine = getEngine(s.gameId);
  if (!engine || !s.play) return fail('no_hand', 'There is no hand being played.');
  let problems: string[];
  try {
    problems = engine.validate(s.play.state, pid, move);
  } catch (e) {
    console.error(`validate threw for ${s.gameId} in room ${s.code}`, e);
    problems = ['that move could not be read'];
  }
  if (problems.length > 0) return fail('bad_move', problems.join('; '));
  let next: unknown;
  try {
    next = engine.apply(s.play.state, pid, move);
  } catch (e) {
    console.error(`apply threw for ${s.gameId} in room ${s.code}`, e);
    return fail('bad_move', 'That move could not be played.');
  }
  let state: RoomState = { ...s, play: { ...s.play, state: next, moves: s.play.moves + 1, animationHistory: [...(s.play.animationHistory ?? []), { revision: s.play.moves + 1, before: s.play.state, after: next }].slice(-8) }, lastActivityAt: now };

  state = recordFinishedHand(s, state, now);
  return { ok: true, value: schedule(state, now) };
}

/**
 * Run whatever is due: a computer's move, or a human's turn that ran out (which plays the engine's safe move).
 * Returns the same state when nothing is due.
 */
export function advancePlay(s: RoomState, now: number, timeOnly = false): RoomState {
  const engine = getEngine(s.gameId);
  const play = s.play;
  if (!engine || !play) return s;
  const pending = pendingOf(s);
  if (pending.length === 0) return s;
  const isBot = (id: string): boolean => s.players.find((pl) => pl.id === id)?.bot !== undefined;
  const bots = pending.filter(isBot);
  const humans = pending.filter((id) => !isBot(id));
  const botDue = !timeOnly && bots.length > 0 && play.botAt !== null && now >= play.botAt;
  const timeDue = humans.length > 0 && play.turnStartedAt !== null && play.turnMs > 0 && now >= play.turnStartedAt + turnLimitMs(s);
  if (!botDue && !timeDue) return s;

  // A computer moves one at a time (so the table can watch). When a time limit runs out, every human still pending
  // gets the safe move (there is only one of them in turn-based games).
  const movers = botDue ? [bots[0] as string, ...(timeDue ? humans : [])] : humans;
  let cur = s;
  let moved = false;
  for (const who of movers) {
    if (!cur.play || playIsOver(cur)) break;
    const view = engine.viewFor(cur.play.state, who);
    const level = cur.players.find((pl) => pl.id === who)?.bot;
    let move: unknown;
    try {
      move = level ? engine.bot(view, level, mixSeed(cur.play.seed, cur.play.moves)) : engine.timeoutMove(view);
    } catch (e) {
      console.error(`computer move failed for ${cur.gameId} in room ${cur.code}; playing the safe move`, e);
      move = engine.timeoutMove(view);
    }
    let res = playMove(cur, who, move, now);
    if (!res.ok) res = playMove(cur, who, engine.timeoutMove(view), now); // a computer must never get stuck
    if (res.ok) {
      cur = res.value;
      moved = true;
      // In games where a turn is several moves (Tong-its: draw, then discard), a human whose time ran out has the
      // rest of that turn played for them, so the clock does not start again on the same turn.
      for (let n = 0; !level && engine.finishTurnOnTimeout === true && n < 6 && cur.play && !playIsOver(cur) && engine.toAct(cur.play.state) === who; n++) {
        const next = playMove(cur, who, engine.timeoutMove(engine.viewFor(cur.play.state, who)), now);
        if (!next.ok) break;
        cur = next.value;
      }
    }
  }
  if (moved) return cur;
  // Nothing worked (an engine bug). Do not leave the alarm pointing at the past: retry in a few seconds.
  return { ...s, play: { ...play, botAt: botDue ? now + 5000 : play.botAt, turnStartedAt: timeDue ? now : play.turnStartedAt } };
}

/** What one viewer may see of the hand in progress. */
export function playEnvelope(s: RoomState, playerId: string | null): PlayEnvelope | null {
  const engine = getEngine(s.gameId);
  if (!engine || !s.play) return null;
  const who = engine.toAct(s.play.state);
  return {
    view: engine.viewFor(s.play.state, playerId),
    revision: s.play.moves,
    transitions: (s.play.animationHistory ?? []).map((transition) => ({ revision: transition.revision, before: engine.viewFor(transition.before, playerId), after: engine.viewFor(transition.after, playerId) })),
    stake: s.play.stake,
    handNo: s.play.handNo,
    toAct: who,
    pending: pendingOf(s),
    turnEndsAt: s.play.turnStartedAt !== null && s.play.turnMs > 0 ? s.play.turnStartedAt + turnLimitMs(s) : null,
    unscored: s.play.unscored === true,
  };
}
