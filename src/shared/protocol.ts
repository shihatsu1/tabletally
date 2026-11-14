import type { Clock } from '../core/clock';
import { BOT_LEVELS, type BotLevel } from '../core/play';

/** Wire format shared by the Worker and the browser. Everything is plain JSON. */

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_NAME_LENGTH = 24;
export const TOKEN_PATTERN = /^[0-9a-f]{32,64}$/;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0 O 1 I L
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** Quick reactions anyone seated can send. They are shown for a moment and never stored. */
export const REACTIONS = ['\u{1F44D}', '\u{1F602}', '\u{1F62E}', '\u{1F621}', '\u{1F62D}', '\u{1F525}', '\u{1F44F}', '\u{1F91D}'] as const;

export type ClientMessage =
  | { t: 'join'; token: string; name: string }
  | { t: 'addRound'; input: unknown }
  | { t: 'undo' }
  | { t: 'edit'; id: string; reason: string; input: unknown }
  | { t: 'addPlayer'; name: string }
  /** Change a name. Without `playerId` it renames you. The host may also rename players it added and computers. */
  | { t: 'rename'; name: string; playerId?: string }
  | { t: 'addBot'; level: BotLevel }
  | { t: 'removeBot'; playerId: string }
  /** Host: shuffle and deal the next hand (digital play). `turnSeconds` 0 means no time limit. */
  | { t: 'deal'; stake: number; turnSeconds: number }
  /** A move in the hand being played. Its shape belongs to the game's engine. */
  | { t: 'move'; move: unknown }
  | { t: 'setup'; setup: unknown }
  | { t: 'keep'; days: 1 | 30 }
  | { t: 'clock'; op: 'start'; seconds: number; first: number }
  | { t: 'clock'; op: 'stop' | 'done' | 'pause' | 'decline' | 'resume' }
  | { t: 'react'; emoji: string }
  | { t: 'ping' };

export interface PublicPlayer {
  id: string;
  name: string;
  manual: boolean;
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
  action: 'add' | 'undo' | 'edit';
  roundId: string;
  reason?: string;
}

export interface RoomView {
  code: string;
  name: string;
  gameId: string;
  /** 'score' = real cards on a real table; 'play' = the app deals and runs the turns. */
  mode: 'score' | 'play';
  setup: unknown;
  playerCount: number;
  unit: string;
  players: PublicPlayer[];
  rounds: PublicRound[];
  totals: Record<string, number>;
  history: PublicHistory[];
  expiresAt: number;
  keepDays: 1 | 30;
  /** Turn clock, already brought up to the server's `now`. Null when no timer is running. */
  clock: Clock | null;
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
    case 'addRound':
      return isRecord(raw.input) ? { t: 'addRound', input: raw.input } : null;
    case 'undo':
      return { t: 'undo' };
    case 'edit':
      return typeof raw.id === 'string' && typeof raw.reason === 'string' && isRecord(raw.input)
        ? { t: 'edit', id: raw.id, reason: raw.reason, input: raw.input }
        : null;
    case 'addPlayer':
      return typeof raw.name === 'string' ? { t: 'addPlayer', name: raw.name } : null;
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
    case 'clock':
      if (raw.op === 'start') {
        return finite(raw.seconds) && finite(raw.first)
          ? { t: 'clock', op: 'start', seconds: raw.seconds, first: raw.first }
          : null;
      }
      return raw.op === 'stop' || raw.op === 'done' || raw.op === 'pause' || raw.op === 'decline' || raw.op === 'resume'
        ? { t: 'clock', op: raw.op }
        : null;
    case 'react':
      return typeof raw.emoji === 'string' && (REACTIONS as readonly string[]).includes(raw.emoji) ? { t: 'react', emoji: raw.emoji } : null;
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}
