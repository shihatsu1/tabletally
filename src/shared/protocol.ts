import { BOT_LEVELS, type BotLevel } from '../core/play';

/** Wire format shared by the Worker and the browser. Everything is plain JSON. */

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_NAME_LENGTH = 24;
export const TOKEN_PATTERN = /^[0-9a-f]{32,64}$/;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0 O 1 I L
/** 31 letters and digits, 6 long: about 887 million codes, so guessing a live table is impractical. */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** Quick reactions anyone seated can send. They are shown for a moment and never stored. */
export const REACTIONS = ['\u{1F44D}', '\u{1F602}', '\u{1F62E}', '\u{1F621}', '\u{1F62D}', '\u{1F525}', '\u{1F44F}', '\u{1F91D}'] as const;

export type ClientMessage =
  | { t: 'join'; token: string; name: string }
  /** Host: void the last recorded hand (not while a hand is being played; never in games whose hands carry over). */
  | { t: 'undo' }
  /** Host: bring back the hand just voided, as long as nothing was recorded since. */
  | { t: 'restore' }
  /** Change a name. Without `playerId` it renames you. The host may also rename computers. */
  | { t: 'rename'; name: string; playerId?: string }
  | { t: 'addBot'; level: BotLevel }
  | { t: 'removeBot'; playerId: string }
  /** Host: shuffle and deal the next hand (digital play). `turnSeconds` 0 means no time limit. */
  | { t: 'deal'; stake: number; turnSeconds: number }
  /** A move in the hand being played. Its shape belongs to the game's engine. */
  | { t: 'move'; move: unknown }
  | { t: 'setup'; setup: unknown }
  | { t: 'keep'; days: 1 | 30 }
  | { t: 'react'; emoji: string }
  | { t: 'ping' };

export interface PublicPlayer {
  id: string;
  name: string;
  /** Set for computer players. */
  bot?: BotLevel;
  connected: boolean;
}

export interface PublicRound {
  id: string;
  input: unknown;
  delta: Record<string, number>;
  edited: boolean;
}

export interface PublicHistory {
  at: number;
  by: string;
  action: 'add' | 'undo' | 'restore' | 'edit';
  roundId: string;
  reason?: string;
}

export interface RoomView {
  code: string;
  name: string;
  gameId: string;
  setup: unknown;
  playerCount: number;
  unit: string;
  players: PublicPlayer[];
  rounds: PublicRound[];
  totals: Record<string, number>;
  history: PublicHistory[];
  expiresAt: number;
  keepDays: 1 | 30;
}

/** What a phone that is not seated yet may know about a table: enough to decide whether to sit down. */
export interface LobbyInfo {
  name: string;
  gameId: string;
  seated: number;
  playerCount: number;
  /** 'open' = a seat is free; 'full' = every seat is taken; 'started' = hands have been played, so no one new can join. */
  status: 'open' | 'full' | 'started';
}

/** The hand in progress as ONE viewer may see it (their own cards only). Null when no hand has been dealt. */
export interface PlayEnvelope {
  view: unknown;
  stake: number;
  handNo: number;
  /** Whose turn it is, or null when the hand is over. */
  toAct: string | null;
  /** Everyone who still has to act (several at once in games where everyone sets a hand in secret). */
  pending: string[];
  /** When the current turn runs out (server time), or null when there is no time limit. */
  turnEndsAt: number | null;
  /** True when the finished hand could not be added to the totals. */
  unscored: boolean;
}

export type ServerMessage =
  | { t: 'state'; room: RoomView; you: { playerId: string | null; isHost: boolean }; now: number; play: PlayEnvelope | null }
  | { t: 'error'; code: string; message: string }
  /** Sent to a phone that is not seated (yet): the table it opened, and whether it can sit down. */
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'react'; from: string; emoji: string }
  | { t: 'pong' };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Clean a display name: trims, collapses spaces, strips control characters. Returns null if unusable. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Narrow an untrusted value to a ClientMessage, or null. Game-specific input is validated later by the game. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'join':
      if (typeof raw.token !== 'string' || !TOKEN_PATTERN.test(raw.token)) return null;
      return typeof raw.name === 'string' ? { t: 'join', token: raw.token, name: raw.name } : null;
    case 'undo':
      return { t: 'undo' };
    case 'restore':
      return { t: 'restore' };
    case 'rename':
      if (typeof raw.name !== 'string') return null;
      return typeof raw.playerId === 'string' ? { t: 'rename', name: raw.name, playerId: raw.playerId } : { t: 'rename', name: raw.name };
    case 'addBot':
      return typeof raw.level === 'string' && (BOT_LEVELS as readonly string[]).includes(raw.level) ? { t: 'addBot', level: raw.level as BotLevel } : null;
    case 'removeBot':
      return typeof raw.playerId === 'string' ? { t: 'removeBot', playerId: raw.playerId } : null;
    case 'deal':
      return finite(raw.stake) && finite(raw.turnSeconds) ? { t: 'deal', stake: raw.stake, turnSeconds: raw.turnSeconds } : null;
    case 'move':
      return isRecord(raw.move) ? { t: 'move', move: raw.move } : null;
    case 'setup':
      return isRecord(raw.setup) ? { t: 'setup', setup: raw.setup } : null;
    case 'keep':
      return raw.days === 1 || raw.days === 30 ? { t: 'keep', days: raw.days } : null;
    case 'react':
      return typeof raw.emoji === 'string' && (REACTIONS as readonly string[]).includes(raw.emoji) ? { t: 'react', emoji: raw.emoji } : null;
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}
