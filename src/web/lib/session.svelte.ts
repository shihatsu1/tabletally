import type { BotLevel } from '../../core/play';
import type { ClientMessage, LobbyInfo, PlayEnvelope, RoomView, ServerMessage } from '../../shared/protocol';
import { deviceToken, getItem, setItem } from './storage';

export type Status = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';

export const session = $state<{
  status: Status;
  code: string | null;
  room: RoomView | null;
  /** The hand in progress as this phone may see it (digital play), else null. */
  play: PlayEnvelope | null;
  you: { playerId: string | null; isHost: boolean } | null;
  /** The table as seen before sitting down (name, game, free seats). Null once seated. */
  lobby: LobbyInfo | null;
  error: { code: string; message: string } | null;
  /** Server time minus this phone's time, so the countdown agrees across phones. */
  clockOffset: number;
  /** Reactions on screen right now (they vanish after a couple of seconds). */
  reactions: { id: number; from: string; emoji: string }[];
}>({ status: 'idle', code: null, room: null, play: null, you: null, lobby: null, error: null, clockOffset: 0, reactions: [] });

let ws: WebSocket | null = null;
let retry = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pinger: ReturnType<typeof setInterval> | undefined;
let wanted = false;
let reactionId = 0;

const wsUrl = (code: string) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${code}/ws`;

function connect(): void {
  const code = session.code;
  if (!code || !wanted) return;
  session.status = retry === 0 && !session.room ? 'connecting' : 'reconnecting';
  const socket = new WebSocket(wsUrl(code));
  ws = socket;

  socket.onopen = () => {
    retry = 0;
    socket.send(JSON.stringify({ t: 'join', token: deviceToken(), name: getItem('tt.name') ?? '' }));
    clearInterval(pinger);
    pinger = setInterval(() => socket.readyState === 1 && socket.send('{"t":"ping"}'), 30_000);
  };

  socket.onmessage = (e: MessageEvent<string>) => {
    const msg = JSON.parse(e.data) as ServerMessage;
    if (msg.t === 'state') {
      session.room = msg.room;
      session.play = msg.play;
      session.you = msg.you;
      session.clockOffset = msg.now - Date.now();
      session.lobby = null;
      session.error = null;
      session.status = 'live';
    } else if (msg.t === 'lobby') {
      session.lobby = msg.lobby;
      session.status = 'live';
    } else if (msg.t === 'react') {
      const id = ++reactionId;
      session.reactions = [...session.reactions.slice(-8), { id, from: msg.from, emoji: msg.emoji }];
      setTimeout(() => (session.reactions = session.reactions.filter((r) => r.id !== id)), 2600);
    } else if (msg.t === 'error') {
      if (msg.code === 'no_room') session.status = 'closed';
      session.error = { code: msg.code, message: msg.message };
      if (session.status !== 'closed' && !session.room) session.status = 'live';
    }
  };

  socket.onclose = (e) => {
    clearInterval(pinger);
    if (!wanted || ws !== socket) return;
    if (e.code === 4004) {
      session.status = 'closed';
      return;
    }
    retry += 1;
    session.status = 'reconnecting';
    // After a couple of failures ask the server whether the room still exists. A 404 means it expired;
    // a network error just means we are offline, so keep trying.
    if (retry >= 2) {
      void fetch(`/api/rooms/${code}/status`, { cache: 'no-store' })
        .then((r) => {
          if (r.status === 404 && wanted && ws === socket) session.status = 'closed';
        })
        .catch(() => undefined);
    }
    timer = setTimeout(() => session.status !== 'closed' && connect(), Math.min(1000 * 2 ** (retry - 1), 10_000));
  };
}

/** Counts how many times a room was opened, so a delayed clean-up can tell it belongs to an older session. */
let generation = 0;
export const roomGeneration = (): number => generation;

/** Leave only if no newer room was opened since `gen` (used by a page that cleans up after it has torn down). */
export function leaveRoomIfCurrent(gen: number): void {
  if (gen === generation) leaveRoom();
}

export function openRoom(code: string): void {
  leaveRoom();
  generation++;
  wanted = true;
  Object.assign(session, { code, room: null, play: null, you: null, lobby: null, error: null });
  connect();
}

export function leaveRoom(): void {
  wanted = false;
  clearTimeout(timer);
  clearInterval(pinger);
  ws?.close();
  ws = null;
  retry = 0;
  Object.assign(session, { status: 'idle', code: null, room: null, play: null, you: null, lobby: null, error: null });
}

/**
 * Send a message to the room. Returns false, and says so on screen, when the connection is down: nothing is
 * queued, because the table may have moved on by the time the phone reconnects. Screens that act disable
 * themselves while the status is not 'live', so this is the last line of defence.
 */
export function send(msg: ClientMessage): boolean {
  if (ws?.readyState === 1) {
    session.error = null;
    ws.send(JSON.stringify(msg));
    return true;
  }
  session.error = { code: 'offline', message: '' };
  return false;
}

/** Seat this device with a name (used after scanning the QR code). */
export function sitDown(name: string): void {
  setItem('tt.name', name.trim());
  session.error = null;
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'join', token: deviceToken(), name: name.trim() }));
  else session.error = { code: 'offline', message: '' };
}

export async function createRoom(params: {
  name: string;
  gameId: string;
  playerCount: number;
  unit: string;
  hostName: string;
  setup?: unknown;
  bots?: BotLevel[];
}): Promise<{ ok: true; code: string } | { ok: false; code: string; message: string }> {
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ ...params, token: deviceToken() }),
    });
    const body = (await res.json()) as { code: string; message?: string };
    if (!res.ok) return { ok: false, code: body.code, message: body.message ?? '' };
    setItem('tt.name', params.hostName);
    return { ok: true, code: body.code };
  } catch {
    return { ok: false, code: 'network', message: '' };
  }
}
