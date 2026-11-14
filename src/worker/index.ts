import { DurableObject } from 'cloudflare:workers';
import { cryptoRng } from '../core/rng';
import { RateLimiter, originAllowed, randomCode, readBodyLimited } from './limits';
import {
  MAX_MESSAGE_BYTES,
  HOST_KEY_LENGTH,
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
  lobbyInfo,
  reclaimHost,
  playEnvelope,
  wakeAt,
  type Actor,
  type RoomState,
} from './roomLogic';

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  LIMITER: DurableObjectNamespace<Limiter>;
  /** Test-only: `wrangler dev --var TT_RATE_LIMIT:off` lets load tests open many tables. Never set it in production. */
  TT_RATE_LIMIT?: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const newRoomCode = (): string => randomCode(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, (n) => crypto.getRandomValues(new Uint8Array(n)));

type LimitKind = 'create' | 'status' | 'socket';
const MAX_CREATE_BYTES = 2048;
/** A phone may send one reaction a second; a little under a second allows for timer jitter. */
const REACT_GAP_MS = 900;
const limited = (env: Env): boolean => env.TT_RATE_LIMIT !== 'off';
const tooMany = (): Response => json({ code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' }, 429);
const clientKey = (request: Request): string => request.headers.get('CF-Connecting-IP') ?? 'local';
const ROOM_PATH = /^\/api\/rooms\/([^/]+)\/(status|ws)$/;

async function allowed(env: Env, request: Request, kind: LimitKind): Promise<boolean> {
  if (!limited(env)) return true;
  try {
    const stub = env.LIMITER.get(env.LIMITER.idFromName(clientKey(request)));
    const response = await stub.fetch(`https://limiter/hit?kind=${kind}`);
    const { ok } = (await response.json()) as { ok: boolean };
    return ok;
  } catch (error) {
    console.error('Limiter request failed', error);
    return true;
  }
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
      if (!(await allowed(env, request, 'create'))) return tooMany();
      const raw = await readBodyLimited(request, MAX_CREATE_BYTES);
      if (raw === null) return json({ code: 'too_large', message: 'Request too large.' }, 413);
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
        const { hostKey } = (await res.json()) as { hostKey: string };
        return json({ code, hostKey });
      }
      return json({ code: 'busy', message: 'Could not allocate a room code. Try again.' }, 503);
    }

    // GET /api/rooms/:code/status lets a reconnecting phone tell "expired" from "my network dropped".
    // GET /api/rooms/:code/ws is the live connection for one room.
    // Both check the code against the real alphabet BEFORE touching a room Durable Object, so junk never creates a room.
    const m = ROOM_PATH.exec(url.pathname);
    if (m) {
      const code = m[1] as string;
      const kind = m[2] as 'status' | 'ws';
      if (!(await allowed(env, request, kind === 'status' ? 'status' : 'socket'))) return tooMany();
      if (!ROOM_CODE_PATTERN.test(code)) return json({ code: 'no_room', message: 'Unknown room.' }, 404);
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      if (kind === 'status') return request.method === 'GET' ? stub.fetch('https://room/status') : json({ code: 'not_found', message: 'Not found.' }, 404);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ code: 'upgrade', message: 'Expected WebSocket.' }, 426);
      if (!originAllowed(request.headers.get('Origin'), url.host)) return json({ code: 'origin', message: 'Forbidden.' }, 403);
      return stub.fetch(new Request('https://room/ws', request));
    }

    return json({ code: 'not_found', message: 'Not found.' }, 404);
  },
} satisfies ExportedHandler<Env>;

/** One counter per kind, per address, shared across Worker isolates. No storage writes. */
export class Limiter extends DurableObject<Env> {
  private readonly limits = {
    create: new RateLimiter(10, 60_000),
    status: new RateLimiter(60, 60_000),
    socket: new RateLimiter(60, 60_000),
  };

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    if (url.pathname !== '/hit' || (kind !== 'create' && kind !== 'status' && kind !== 'socket')) {
      return json({ ok: false }, 404);
    }
    return json({ ok: this.limits[kind].allow('address', Date.now()) });
  }
}

type Attachment = { tokenHash: string } | null;
type RoomMeta = Omit<RoomState, 'events'>;

/** One Durable Object per room: single writer, hibernating sockets, SQLite storage, expiry alarm. */
export class Room extends DurableObject<Env> {
  private cache: RoomState | null = null;
  private persistedEvents = 0;

  // Tables are created on the first save only, so looking up a code that does not exist writes nothing.

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)',
    );
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, json TEXT NOT NULL)');
  }

  private hasTables(): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length > 0;
  }

  private load(): RoomState | null {
    if (this.cache) return this.cache;
    if (!this.hasTables()) return null;
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
    this.ensureSchema();
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
      const hostKey = randomCode(ROOM_CODE_ALPHABET, HOST_KEY_LENGTH, (n) => crypto.getRandomValues(new Uint8Array(n)));
      const created = createRoom(params, code, await sha256Hex(token), Date.now(), await sha256Hex(hostKey));
      if (!created.ok) return json({ code: created.code, message: created.message }, 400);
      await this.save(created.value);
      return json({ ok: true, hostKey });
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
      room = buildView(state, connected);
    } catch (e) {
      for (const s of sockets) this.send(s, { t: 'error', code: 'corrupt', message: 'Room data could not be read.' });
      console.error('buildView failed', e);
      return;
    }
    sockets.forEach((s, i) => {
      const a = attachments[i];
      if (!a) return;
      const actor: Actor = actorFor(state, a.tokenHash);
      // A phone without a seat (not joined yet, removed, or at a full table) only gets the preview: no names,
      // no scores, no hands. A host who lost their seat's identity gets it back with the host key.
      if (!actor.playerId) {
        this.send(s, { t: 'lobby', lobby: lobbyInfo(state) });
        return;
      }
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
    const keyHash = parsed.t === 'reclaim' ? await sha256Hex(parsed.key) : null;
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
        // A new phone without a name yet, or a table it cannot join: show the table instead of an error.
        // The phone is remembered (so it can sit down later, or use the host key) but sees only the preview.
        const noNameYet = joined.code === 'bad_name' && parsed.name.trim() === '';
        ws.serializeAttachment({ tokenHash } satisfies Attachment);
        if (noNameYet || joined.code === 'room_full' || joined.code === 'game_started') this.send(ws, { t: 'lobby', lobby: lobbyInfo(state) });
        else this.send(ws, { t: 'error', code: joined.code, message: joined.message });
        return;
      }
      if (joined.value.state !== state) await this.save(joined.value.state);
      ws.serializeAttachment({ tokenHash } satisfies Attachment);
      this.broadcast(joined.value.state);
      return;
    }

    if (parsed.t === 'reclaim' && keyHash) {
      // The phone must have said who it is (a join) first; its token is in the socket attachment.
      const who = ws.deserializeAttachment() as Attachment;
      if (!who) {
        this.send(ws, { t: 'error', code: 'not_joined', message: 'Join the room first.' });
        return;
      }
      const back = reclaimHost(state, who.tokenHash, keyHash, now);
      if (!back.ok) {
        this.send(ws, { t: 'error', code: back.code, message: back.message });
        return;
      }
      await this.save(back.value.state);
      this.broadcast(back.value.state);
      return;
    }

    if (parsed.t === 'react') {
      // Reactions are transient: nothing is saved, and a phone can send at most one a second.
      const who = ws.deserializeAttachment() as Attachment;
      const id = who ? actorFor(state, who.tokenHash).playerId : null;
      if (!id || now - (this.lastReact.get(ws) ?? 0) < REACT_GAP_MS) return;
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
    // Cards are shuffled straight from crypto.getRandomValues, never from a 32-bit seed someone could search.
    const result = applyMessage(state, actorFor(state, att.tokenHash), parsed, now, seed, cryptoRng());
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
      // deleteAll() also drops the tables; load() treats missing tables as "no room", and a save recreates them.
      await this.ctx.storage.deleteAll();
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
