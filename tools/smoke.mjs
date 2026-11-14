// End-to-end smoke test against a running `wrangler dev` (default http://localhost:8787).
// Usage: node tools/smoke.mjs [baseUrl]
import { randomBytes } from 'node:crypto';
import http from 'node:http';

const base = process.argv[2] ?? 'http://localhost:8787';
const wsBase = base.replace(/^http/, 'ws');
const token = () => randomBytes(16).toString('hex');
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};

function connect(code, tok, name) {
  const ws = new WebSocket(`${wsBase}/api/rooms/${code}/ws`, { headers: { Origin: base } });
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    const w = waiters.findIndex((x) => x.pred(m));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(m);
    else inbox.push(m);
  });
  const next = (pred = () => true, ms = 4000) =>
    new Promise((resolve, reject) => {
      const i = inbox.findIndex(pred);
      if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
      const t = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
      waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  const open = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('ws error')));
  });
  const send = (m) => ws.send(JSON.stringify(m));
  const drain = () => { inbox.length = 0; };
  const has = (pred) => inbox.some(pred);
  return { ws, open, send, next, drain, has, join: () => send({ t: 'join', token: tok, name }) };
}
const isState = (m) => m.t === 'state';
const latest = async (c, pred = isState) => c.next(pred);

/** Status of a raw WebSocket upgrade request (fetch cannot send an Upgrade header). */
const upgradeStatus = (path, origin) =>
  new Promise((resolve, reject) => {
    const req = http.request(base + path, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        Origin: origin,
      },
    });
    req.on('response', (r) => (r.resume(), resolve(r.statusCode)));
    req.on('upgrade', (r, socket) => (socket.destroy(), resolve(r.statusCode)));
    req.on('error', reject);
    req.end();
  });

const hostTok = token();
const res = await fetch(`${base}/api/rooms`, {
  method: 'POST',
  body: JSON.stringify({ name: 'Smoke', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'A', token: hostTok }),
});
const created = await res.json();
check('create room returns a 6-character code', res.ok && /^[A-Z2-9]{6}$/.test(created.code), JSON.stringify(created));
const code = created.code;

const bad = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: 'x', gameId: 'nope', playerCount: 4, unit: 'p', hostName: 'A', token: token() }) });
check('unknown game is rejected', bad.status === 400);

const nullBody = await fetch(`${base}/api/rooms`, { method: 'POST', body: 'null' });
check('a JSON null body is a 400, not a crash', nullBody.status === 400, String(nullBody.status));
const statusOk = await fetch(`${base}/api/rooms/${code}/status`);
check('status route says a live room exists', statusOk.status === 200, String(statusOk.status));
const statusNo = await fetch(`${base}/api/rooms/ZZZZZZ/status`);
check('status route says an unknown room does not', statusNo.status === 404, String(statusNo.status));

const noRoom = await upgradeStatus('/api/rooms/ZZZZZZ/ws', base);
check('socket to a room that does not exist is refused', noRoom === 404, String(noRoom));

// a phone that opens the link before giving a name sees the table, not an error
const visitor = connect(code, token(), '');
await visitor.open;
visitor.join();
const preview = await visitor.next();
check('a new visitor gets a table preview, not an error', preview.t === 'lobby' && preview.lobby.status === 'open' && preview.lobby.seated === 1 && preview.lobby.name === 'Smoke', JSON.stringify(preview));
visitor.ws.close();

const host = connect(code, hostTok, 'A');
await host.open;
host.join();
let s = await latest(host);
check('host joins and is host', s.you.isHost && s.you.playerId === 'p1');

const toks = { B: token(), C: token(), D: token() };
const guests = {};
for (const [name, tok] of Object.entries(toks)) {
  guests[name] = connect(code, tok, name);
  await guests[name].open;
  guests[name].join();
  await latest(guests[name]);
}
s = await latest(host, (m) => isState(m) && m.room.players.length === 4);
check('all four seated, all connected', s.room.players.every((p) => p.connected));

guests.B.send({ t: 'deal', stake: 50, turnSeconds: 0 });
const denied = await guests.B.next((m) => m.t === 'error');
check('a guest cannot deal', denied.code === 'not_host', JSON.stringify(denied));

guests.B.send({ t: 'addRound', input: { winner: 'p1', stake: 50 } });
const typedIn = await guests.B.next((m) => m.t === 'error');
check('there is no way to type in a result', typedIn.code === 'bad_message', JSON.stringify(typedIn));

// refresh: drop B's socket, reconnect with the same token and a different name
guests.B.ws.close();
await latest(host, (m) => isState(m) && m.room.players.find((p) => p.id === 'p2')?.connected === false);
check('host sees B disconnect', true);
const b2 = connect(code, toks.B, 'ignored');
await b2.open;
b2.join();
s = await latest(b2);
check('rejoining keeps identity (still p2, no new seat)', s.you.playerId === 'p2' && s.room.players.length === 4);

const stranger = connect(code, token(), 'Eve');
await stranger.open;
stranger.join();
const full = await stranger.next((m) => m.t === 'lobby' || m.t === 'error');
check('a fifth device is shown that the table is full', full.t === 'lobby' && full.lobby.status === 'full', JSON.stringify(full));

const drainAll = () => [host, b2, guests.C, guests.D].forEach((c) => c.drain());
// reactions: shown to everyone, throttled, and never stored
drainAll();
host.send({ t: 'react', emoji: '\u{1F525}' });
const seen = await guests.D.next((m) => m.t === 'react');
check('an emoji reaction reaches every phone with the sender', seen.emoji === '\u{1F525}' && seen.from === 'p1');
host.send({ t: 'react', emoji: '\u{1F525}' });
await new Promise((r) => setTimeout(r, 300));
check('a second reaction inside a second is dropped', !guests.D.has((m) => m.t === 'react'));
host.send({ t: 'react', emoji: 'not an allowed emoji' });
const bad2 = await host.next((m) => m.t === 'error');
check('an emoji that is not on the list is refused', bad2.code === 'bad_message');

const crossOrigin = await upgradeStatus(`/api/rooms/${code}/ws`, 'https://evil.example');
check('cross-origin socket is refused', crossOrigin === 403, String(crossOrigin));

// ---- digital play: a solo table against three computers, played over real sockets
{
  const tok = token();
  const mk = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Solo', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'A', token: tok, bots: ['easy', 'normal', 'hard'] }),
  });
  const made = await mk.json();
  check('a solo play table is created with computers', mk.ok && /^[A-Z2-9]{6}$/.test(made.code), JSON.stringify(made));
  const solo = connect(made.code, tok, 'A');
  await solo.open;
  solo.join();
  let st = await latest(solo);
  check('computers are seated, tagged and shown as connected', st.room.players.filter((p) => p.bot).length === 3 && st.room.players.every((p) => p.connected), JSON.stringify(st.room.players));
  check('no hand yet', st.play === null);

  solo.send({ t: 'rename', name: 'Ate A' });
  st = await latest(solo);
  check('a player can rename themselves live', st.room.players[0].name === 'Ate A' && st.room.players[0].id === 'p1');
  solo.send({ t: 'rename', name: 'Kuya Bot', playerId: 'p2' });
  st = await latest(solo);
  check('the host can rename a computer', st.room.players[1].name === 'Kuya Bot');
  solo.send({ t: 'rename', name: 'ate a', playerId: 'p3' });
  const dupe = await solo.next((m) => m.t === 'error');
  check('a duplicate name is refused', dupe.code === 'name_taken', JSON.stringify(dupe));

  solo.send({ t: 'deal', stake: 50, turnSeconds: 0 });
  st = await latest(solo, (m) => m.t === 'state' && m.play);
  check('the hand is dealt and I only see my own 13 cards', st.play.view.hand.length === 13 && st.play.view.hands === undefined && Object.values(st.play.view.counts).every((n) => n === 13));

  let moves = 0;
  const started = Date.now();
  while (st.play.toAct !== null) {
    if (st.play.toAct === 'p1') {
      const v = st.play.view;
      solo.send({ t: 'move', move: v.lead ? { t: 'pass' } : { t: 'play', cards: [v.mustInclude ?? v.hand[0]] } });
      moves++;
    }
    st = await latest(solo, (m) => m.t === 'state' || (m.t === 'error' && m.code !== 'x'));
    if (st.t === 'error') throw new Error(`move refused: ${JSON.stringify(st)}`);
    if (Date.now() - started > 240_000) throw new Error('solo hand took too long');
  }
  check('computers play their own turns until the hand ends', moves >= 1 && st.room.rounds.length === 1, `rounds=${st.room.rounds.length}`);
  check('the finished hand was scored with zero-sum totals', Object.values(st.room.totals).reduce((a, b) => a + b, 0) === 0 && Math.max(...Object.values(st.room.totals)) === 150);
  check('once it is over every hand is revealed', st.play.view.done === true && !!st.play.view.hands);
  solo.send({ t: 'undo' });
  st = await latest(solo, (m) => m.t === 'state' && m.room.rounds.length === 0);
  check('the host can void the last hand', Object.values(st.room.totals).every((v) => v === 0) && st.room.history.at(-1).action === 'undo');
  solo.send({ t: 'restore' });
  st = await latest(solo, (m) => m.t === 'state' && m.room.rounds.length === 1);
  check('and bring it back', Math.max(...Object.values(st.room.totals)) === 150 && st.room.history.at(-1).action === 'restore');
  solo.send({ t: 'deal', stake: 50, turnSeconds: 0 });
  st = await latest(solo, (m) => m.t === 'state' && m.play && m.play.handNo === 2);
  check('the host can deal the next hand', st.play.handNo === 2 && st.play.view.hands === undefined);
  solo.ws.close();
}

// ---- digital play, mixed table: two people and a computer; each phone must only receive its own cards
{
  const tokA = token();
  const tokB = token();
  const mk = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Mixed', gameId: 'pusoy-dos', playerCount: 3, unit: 'pts', hostName: 'A', token: tokA, bots: ['normal'] }),
  });
  const made = await mk.json();
  const a = connect(made.code, tokA, 'A');
  const b = connect(made.code, tokB, 'B');
  await Promise.all([a.open, b.open]);
  a.join();
  await latest(a);
  b.join();
  await latest(b, (m) => m.t === 'state' && m.you.playerId === 'p3');
  a.drain();
  a.send({ t: 'deal', stake: 10, turnSeconds: 0 });
  const sa = await latest(a, (m) => m.t === 'state' && m.play);
  const sb = await latest(b, (m) => m.t === 'state' && m.play);
  const cardsA = JSON.stringify([...sa.play.view.hand].sort((x, y) => x - y));
  const cardsB = JSON.stringify([...sb.play.view.hand].sort((x, y) => x - y));
  check('two phones get different hands of 13', cardsA !== cardsB && sa.play.view.hand.length === 13 && sb.play.view.hand.length === 13);
  const overlap = sa.play.view.hand.filter((c) => sb.play.view.hand.includes(c));
  check('no card is dealt to two players', overlap.length === 0);
  check('neither phone is sent the hidden hands', sa.play.view.hands === undefined && sb.play.view.hands === undefined && !JSON.stringify(sa).includes('"hands"') && !JSON.stringify(sb).includes('"hands"'));
  b.send({ t: 'deal', stake: 10, turnSeconds: 0 });
  const nb = await b.next((m) => m.t === 'error');
  check('a guest cannot deal', nb.code === 'not_host');
  a.ws.close();
  b.ws.close();
}

// ---- digital play, Tong-its: a solo table against two computers
{
  const tok = token();
  const mk = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Tong', gameId: 'tong-its', playerCount: 3, unit: 'pts', hostName: 'A', token: tok, bots: ['normal', 'hard'] }),
  });
  const made = await mk.json();
  check('a Tong-its play table is created with two computers', mk.ok, JSON.stringify(made));
  const solo = connect(made.code, tok, 'A');
  await solo.open;
  solo.join();
  let st = await latest(solo);
  solo.send({ t: 'deal', stake: 10, turnSeconds: 0 });
  st = await latest(solo, (m) => m.t === 'state' && m.play);
  const mine = st.play.view.hand.length;
  check('the hand is dealt: 12 or 13 cards, stock of 15, nobody else\'s cards', (mine === 12 || mine === 13) && st.play.view.stockCount === 15 && st.play.view.hands === undefined);
  const started = Date.now();
  while (st.play.toAct !== null) {
    if (st.play.toAct === 'p1') {
      const v = st.play.view;
      const move = v.phase === 'fight' ? { t: 'respond', challenge: false } : v.phase === 'draw' ? { t: 'draw', from: 'stock' } : { t: 'discard', card: v.hand[0] };
      solo.send({ t: 'move', move });
    }
    st = await latest(solo, (m) => m.t === 'state' || m.t === 'error');
    if (st.t === 'error') throw new Error(`tong-its move refused: ${JSON.stringify(st)}`);
    if (Date.now() - started > 300_000) throw new Error('solo Tong-its hand took too long');
  }
  check('the Tong-its hand ends and is scored with zero-sum totals', st.room.rounds.length === 1 && Object.values(st.room.totals).reduce((a, b) => a + b, 0) === 0, JSON.stringify(st.room.totals));
  check('every hand is revealed once it is over', st.play.view.done === true && !!st.play.view.hands);
  solo.ws.close();
}

// ---- digital play, Pusoy: everyone sets their rows at once; the human lets the (shortened) time limit run out
{
  const tok = token();
  const mk = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Pusoy', gameId: 'pusoy', playerCount: 4, unit: 'pts', hostName: 'A', token: tok, bots: ['easy', 'normal', 'hard'] }),
  });
  const made = await mk.json();
  check('a Pusoy play table is created with three computers', mk.ok, JSON.stringify(made));
  const solo = connect(made.code, tok, 'A');
  await solo.open;
  solo.join();
  let st = await latest(solo);
  solo.send({ t: 'deal', stake: 10, turnSeconds: 1 }); // 1 second x 6 = 6 seconds to set
  st = await latest(solo, (m) => m.t === 'state' && m.play);
  check('everyone is pending at once and I only see my own 13 cards', st.play.pending.length === 4 && st.play.view.hand.length === 13 && st.play.view.reveal === undefined);
  check('the time limit is six times the turn time', st.play.turnEndsAt - st.now > 4000 && st.play.turnEndsAt - st.now <= 6100, String(st.play.turnEndsAt - st.now));
  const started = Date.now();
  while (st.play.toAct !== null) {
    st = await latest(solo, (m) => m.t === 'state');
    if (st.play.pending.length > 0) check('rows stay hidden while others are still setting', st.play.view.reveal === undefined);
    if (Date.now() - started > 60_000) throw new Error('Pusoy hand took too long');
  }
  check('the hand is scored once everyone has set (the server set the human\'s rows)', st.room.rounds.length === 1 && Object.values(st.room.totals).reduce((a, b) => a + b, 0) === 0, JSON.stringify(st.room.totals));
  check('all rows are revealed at the end', st.play.view.done === true && Object.keys(st.play.view.reveal).length === 4);
  const o = st.play.view.outcome;
  check('the reveal says how each pair came out, and it matches the recorded hand', !!o && Object.keys(o.pairs).length === 6 && Object.entries(o.units).every(([id, u]) => u * 10 === st.room.rounds[0].delta[id]), JSON.stringify(o?.units));
  solo.ws.close();
}

// ---- digital play, Poker: a solo table against three computers, linked hands recorded one by one
{
  const tok = token();
  const mk = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Poker', gameId: 'poker', playerCount: 4, unit: 'pts', hostName: 'A', token: tok, bots: ['easy', 'normal', 'hard'] }),
  });
  const made = await mk.json();
  check('a Poker play table is created with three computers', mk.ok, JSON.stringify(made));
  const bad8 = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: 'x', gameId: 'poker', playerCount: 8, unit: 'pts', hostName: 'A', token: token() }) });
  check('poker in the app refuses more than 6 players', bad8.status === 400);
  const solo = connect(made.code, tok, 'A');
  await solo.open;
  solo.join();
  let st = await latest(solo);
  for (let hand = 1; hand <= 2; hand++) {
    solo.send({ t: 'deal', stake: 1, turnSeconds: 0 });
    st = await latest(solo, (m) => m.t === 'state' && m.play && m.play.handNo === hand);
    if (hand === 1) check('I only see my own two hole cards', st.play.view.hole.length === 2 && st.play.view.reveal === undefined);
    const started = Date.now();
    while (st.play.toAct !== null) {
      if (st.play.toAct === 'p1') {
        const v = st.play.view;
        solo.send({ t: 'move', move: v.toCall === 0 ? { t: 'check' } : { t: 'fold' } });
      }
      st = await latest(solo, (m) => m.t === 'state' || m.t === 'error');
      if (st.t === 'error') throw new Error(`poker move refused: ${JSON.stringify(st)}`);
      if (Date.now() - started > 120_000) throw new Error('poker hand took too long');
    }
    check(`hand ${hand} is recorded as a ledger round and totals stay zero-sum`, st.room.rounds.length === hand && Object.values(st.room.totals).reduce((a, b) => a + b, 0) === 0, JSON.stringify(st.room.totals));
  }
  solo.ws.close();
}

// ---- the public routes hold up against junk (audit S01-S04)
{
  const opaque = await upgradeStatus(`/api/rooms/${code}/ws`, 'null');
  check('a socket from an opaque origin is refused, not a crash', opaque === 403, String(opaque));
  const big = await fetch(`${base}/api/rooms`, { method: 'POST', body: 'x'.repeat(1024 * 1024) });
  check('a 1 MB create request is refused as too large', big.status === 413, String(big.status));
  const junkJson = await fetch(`${base}/api/rooms`, { method: 'POST', body: '{' });
  check('broken JSON is a 400', junkJson.status === 400 || junkJson.status === 429, String(junkJson.status));
  const lower = await fetch(`${base}/api/rooms/abcdef/status`);
  check('a code outside the room alphabet is a 404 straight away', lower.status === 404, String(lower.status));
  let limited = false;
  for (let i = 0; i < 15 && !limited; i++) {
    const r = await fetch(`${base}/api/rooms`, { method: 'POST', body: '{}' });
    limited = r.status === 429;
  }
  check('too many creates from one address in a minute are refused', limited);
}

for (const c of [host, b2, stranger, ...Object.values(guests)]) c.ws.close();
await new Promise((r) => setTimeout(r, 100));
console.log(failures === 0 ? '\nAll smoke checks passed' : `\n${failures} smoke check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
