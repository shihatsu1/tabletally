// Shared helpers for the live stress tools: a small WebSocket client and HTTP helpers.
import { randomBytes } from 'node:crypto';
import http from 'node:http';

export const token = () => randomBytes(16).toString('hex');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (a) => a[rand(a.length)];

export class Client {
  constructor(base, code, tok, name) {
    this.base = base;
    this.code = code;
    this.tok = tok;
    this.name = name;
    this.state = null;
    this.errors = [];
    this.reacts = 0;
    this.pongs = 0;
    this.messages = 0;
    this.maxBytes = 0;
    this.closed = null;
    this.listeners = [];
    this.ws = null;
  }

  open({ join = true, origin } = {}) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.base.replace(/^http/, 'ws')}/api/rooms/${this.code}/ws`, { headers: { Origin: origin ?? this.base } });
      this.ws = ws;
      this.closed = null;
      ws.addEventListener('message', (e) => {
        this.messages++;
        const text = typeof e.data === 'string' ? e.data : '';
        this.maxBytes = Math.max(this.maxBytes, text.length);
        let m;
        try { m = JSON.parse(text); } catch { return; }
        if (m.t === 'state') { this.state = m; for (const l of this.listeners) l(m); }
        else if (m.t === 'error') this.errors.push(m);
        else if (m.t === 'lobby') this.lobby = m.lobby; // not seated: the table preview only
        else if (m.t === 'react') this.reacts++;
        else if (m.t === 'pong') this.pongs++;
      });
      ws.addEventListener('close', (e) => { this.closed = e.code; });
      ws.addEventListener('open', () => { if (join) this.send({ t: 'join', token: this.tok, name: this.name }); resolve(this); });
      ws.addEventListener('error', () => reject(new Error('ws error')));
    });
  }

  send(m) { if (this.ws?.readyState === 1) this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  close() { try { this.ws?.close(); } catch { /* already closed */ } }
  onState(fn) { this.listeners.push(fn); }
  /** Wait until a state message satisfies `pred`, or time out. */
  waitState(pred, ms = 20000) {
    return new Promise((resolve, reject) => {
      if (this.state && pred(this.state)) return resolve(this.state);
      const t = setTimeout(() => { this.listeners = this.listeners.filter((l) => l !== h); reject(new Error('timeout waiting for state')); }, ms);
      const h = (m) => { if (pred(m)) { clearTimeout(t); this.listeners = this.listeners.filter((l) => l !== h); resolve(m); } };
      this.listeners.push(h);
    });
  }
}

export async function createRoom(base, body) {
  const res = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

export const upgradeStatus = (base, path, origin) =>
  new Promise((resolve, reject) => {
    const req = http.request(base + path, {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), Origin: origin },
    });
    req.on('response', (r) => (r.resume(), resolve(r.statusCode)));
    req.on('upgrade', (r, socket) => (socket.destroy(), resolve(r.statusCode)));
    req.on('error', reject);
    req.end();
  });
