import { DurableObject } from 'cloudflare:workers';
import {
  MAX_MESSAGE_BYTES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  TOKEN_PATTERN,
  parseClientMessage,
  type ServerMessage,
} from '../shared/protocol';
import {
  actorFor,
  advancePlay,
  applyMessage,
  buildView,
  createRoom,
  isExpired,
  joinRoom,
  playEnvelope,
  wakeAt,
  type Actor,
  type RoomState,
} from './roomLogic';

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/rooms: create a room and return its code. The caller's device token becomes the host key.
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 2048) return json({ code: 'too_large', message: 'Request too large.' }, 413);
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
        body = parsed as Record<string, unknown>;
      } catch {
        return json({ code: 'bad_json', message: 'Bad request.' }, 400);
      }
      if (typeof body.token !== 'string' || !TOKEN_PATTERN.test(body.token)) {
        return json({ code: 'bad_token', message: 'Bad request.' }, 400);
      }
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = newRoomCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ code, params: body, token: body.token }),
        });
        if (res.status === 409) continue; // code already in use, try another
        if (!res.ok) return new Response(res.body, { status: res.status, headers: res.headers });
        return json({ code });
      }
      return json({ code: 'busy', message: 'Could not allocate a room code. Try again.' }, 503);
    }

    // GET /api/rooms/:code/status: lets a reconnecting phone tell "expired" from "my network dropped".
    const st = /^\/api\/rooms\/([A-Z0-9]{5})\/status$/.exec(url.pathname);
    if (st && request.method === 'GET') {
      const stub = env.ROOM.get(env.ROOM.idFromName(st[1] as string));
      return stub.fetch('https://room/status');
    }

    // GET /api/rooms/:code/ws: live connection for one room.
    const m = /^\/api\/rooms\/([A-Z0-9]{5})\/ws$/.exec(url.pathname);
    if (m) {
      const code = m[1] as string;
      if (!ROOM_CODE_PATTERN.test(code)) return json({ code: 'bad_code', message: 'Unknown room.' }, 404);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ code: 'upgrade', message: 'Expected WebSocket.' }, 426);
      const origin = request.headers.get('Origin');
      if (origin && new URL(origin).host !== url.host) return json({ code: 'origin', message: 'Forbidden.' }, 403);
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(new Request('https://room/ws', request));
    }

    return json({ code: 'not_found', message: 'Not found.' }, 404);
  },
} satisfies ExportedHandler<Env>;

type Attachment = { tokenHash: string } | null;
type RoomMeta = Omit<RoomState, 'events'>;

/** One Durable Object per room: single writer, hibernating sockets, SQLite storage, expiry alarm. */
export class Room extends DurableObject<Env> {
  private cache: RoomState | null = null;
  private persistedEvents = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)',
    );
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, json TEXT NOT NULL)');
  }

  private load(): RoomState | null {
    if (this.cache) return this.cache;
    const meta = this.ctx.storage.sql.exec('SELECT json FROM meta WHERE id = 1').toArray()[0];
    if (!meta) return null;
    const events = this.ctx.storage.sql
      .exec('SELECT json FROM events ORDER BY seq')
      .toArray()
      .map((r) => JSON.parse(r.json as string) as RoomState['events'][number]);
    this.cache = { ...(JSON.parse(meta.json as string) as RoomMeta), events };
    this.persistedEvents = events.length;
    return this.cache;
  }

  private async save(next: RoomState): Promise<void> {
    const { events, ...meta } = next;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO meta (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json',
        JSON.stringify(meta),
      );
      for (let i = this.persistedEvents; i < events.length; i++) {
        this.ctx.storage.sql.exec('INSERT INTO events (seq, json) VALUES (?, ?)', i, JSON.stringify(events[i]));
      }
    });
    this.persistedEvents = events.length;
    this.cache = next;
    await this.ctx.storage.setAlarm(wakeAt(next));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.load()) return json({ code: 'exists', message: 'exists' }, 409);
      const { code, params, token } = (await request.json()) as {
        code: string;
        params: Parameters<typeof createRoom>[0];
        token: string;
      };
      const created = createRoom(params, code, await sha256Hex(token), Date.now());
      if (!created.ok) return json({ code: created.code, message: created.message }, 400);
      await this.save(created.value);
      return json({ ok: true });
    }

    if (url.pathname === '/status') {
      const state = this.load();
      return state && !isExpired(state, Date.now()) ? json({ ok: true }) : json({ code: 'no_room', message: 'Expired.' }, 404);
    }

    if (url.pathname === '/ws') {
      const state = this.load();
      if (!state || isExpired(state, Date.now())) return json({ code: 'no_room', message: 'This room has expired or does not exist.' }, 404);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment(null satisfies Attachment);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return json({ code: 'not_found', message: 'Not found.' }, 404);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already gone */
    }
  }

  /** Send every connected phone the current table, personalised with who they are. */
  private broadcast(state: RoomState, closing?: WebSocket): void {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets().filter((s) => s !== closing);
    const attachments = sockets.map((s) => s.deserializeAttachment() as Attachment);
    const connected = new Set<string>();
    for (const a of attachments) {
      if (a) {
        const id = actorFor(state, a.tokenHash).playerId;
        if (id) connected.add(id);
      }
    }
    let room;
    try {
      room = buildView(state, connected, now);
    } catch (e) {
      for (const s of sockets) this.send(s, { t: 'error', code: 'corrupt', message: 'Room data could not be read.' });
      console.error('buildView failed', e);
      return;
    }
    sockets.forEach((s, i) => {
      const a = attachments[i];
      if (!a) return;
      const actor: Actor = actorFor(state, a.tokenHash);
      // Each phone gets its own view of the hand: its own cards, and nobody else's.
      this.send(s, { t: 'state', room, you: { playerId: actor.playerId, isHost: actor.isHost }, now, play: playEnvelope(state, actor.playerId) });
    });
  }

  private readonly lastReact = new WeakMap<WebSocket, number>();

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) {
      this.send(ws, { t: 'error', code: 'too_large', message: 'Message too large.' });
      return;
    }
    let parsed;
    try {
      parsed = parseClientMessage(JSON.parse(message));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      this.send(ws, { t: 'error', code: 'bad_message', message: 'Bad message.' });
      return;
    }
    if (parsed.t === 'ping') {
      this.send(ws, { t: 'pong' });
      return;
    }

    // Hash the device token BEFORE reading the room: awaiting between a read and a save would let another
    // message change the room in the gap, and this save would then overwrite it.
    const joinHash = parsed.t === 'join' ? await sha256Hex(parsed.token) : null;
    const state = this.load();
    const now = Date.now();
    if (!state || isExpired(state, now)) {
      this.send(ws, { t: 'error', code: 'no_room', message: 'This room has expired.' });
      ws.close(4004, 'expired');
      return;
    }

    if (parsed.t === 'join' && joinHash) {
      const tokenHash = joinHash;
      const joined = joinRoom(state, tokenHash, parsed.name, now);
      if (!joined.ok) {
        this.send(ws, { t: 'error', code: joined.code, message: joined.message });
        return;
      }
      if (joined.value.state !== state) await this.save(joined.value.state);
      ws.serializeAttachment({ tokenHash } satisfies Attachment);
      this.broadcast(joined.value.state);
      return;
    }

    if (parsed.t === 'react') {
      // Reactions are transient: nothing is saved, and a phone can send at most one a second.
      const who = ws.deserializeAttachment() as Attachment;
      const id = who ? actorFor(state, who.tokenHash).playerId : null;
      if (!id || now - (this.lastReact.get(ws) ?? 0) < 900) return;
      this.lastReact.set(ws, now);
      for (const s of this.ctx.getWebSockets()) this.send(s, { t: 'react', from: id, emoji: parsed.emoji });
      return;
    }

    const att = ws.deserializeAttachment() as Attachment;
    if (!att) {
      this.send(ws, { t: 'error', code: 'not_joined', message: 'Join the room first.' });
      return;
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] as number;
    const result = applyMessage(state, actorFor(state, att.tokenHash), parsed, now, seed);
    if (!result.ok) {
      this.send(ws, { t: 'error', code: result.code, message: result.message });
      return;
    }
    await this.save(result.value);
    this.broadcast(result.value);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code === 1005 ? 1000 : code, 'bye');
    const state = this.load();
    if (state) this.broadcast(state, ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const state = this.load();
    if (state) this.broadcast(state, ws);
  }

  /** Fires at the expiry time. Kept rooms (30 days) reschedule themselves. */
  async alarm(): Promise<void> {
    const state = this.load();
    if (!state) return;
    if (isExpired(state, Date.now())) {
      for (const s of this.ctx.getWebSockets()) s.close(4004, 'expired');
      this.cache = null;
      this.persistedEvents = 0;
      await this.ctx.storage.deleteAll();
      // deleteAll() also drops the tables; recreate them so a late request finds an empty room, not an error.
      this.ensureSchema();
      return;
    }
    // Not expired: this wake-up is a computer's move or a human's turn running out (or a kept room renewing).
    const next = advancePlay(state, Date.now());
    if (next !== state) {
      await this.save(next);
      this.broadcast(next);
      return;
    }
    await this.ctx.storage.setAlarm(wakeAt(state));
  }
}
