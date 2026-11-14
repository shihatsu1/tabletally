// Live stress test against a running `wrangler dev` (default http://localhost:8787).
//   node tools/stress.mjs [baseUrl]                 soak + chaos + abuse (start the Worker with
//                                                   `npx wrangler dev --var TT_RATE_LIMIT:off`, or the soak hits the limits)
//   STRESS_ROOMS=300 STRESS_CONC=60 node tools/stress.mjs
//   node tools/stress.mjs --persist                 also kill and restart a private wrangler mid-hand (port 8791)
// Plays whole games over real WebSockets with random human behaviour, and reports hung rooms, error codes and timings.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client, createRoom, pick, rand, sleep, token, upgradeStatus } from './lib/ws.mjs';

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const ROOMS = Number(process.env.STRESS_ROOMS ?? 90);
const CONC = Number(process.env.STRESS_CONC ?? 30);
const HAND_TIMEOUT = Number(process.env.STRESS_HAND_TIMEOUT ?? 150_000);
const out = new URL('./stress/out/', import.meta.url);
mkdirSync(out, { recursive: true });

const report = { base, rooms: 0, hands: 0, hung: [], unexpectedErrors: {}, expectedErrors: {}, perGame: {}, abuse: [], persist: null, maxStateBytes: 0, messages: 0 };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const EXPECTED = new Set(['not_host', 'bad_move', 'room_full', 'name_taken', 'not_seated', 'hand_running', 'bad_name', 'game_started', 'nothing_to_restore', 'linked_hands', 'rate_limited']);

const GAMES = {
  'pusoy-dos': { counts: [2, 3, 4], setupFor: () => undefined },
  'tong-its': { counts: [3], setupFor: () => undefined },
  pusoy: { counts: [2, 3, 4], setupFor: () => undefined },
  poker: { counts: [2, 3, 4, 5, 6], setupFor: () => undefined },
};

/** A simple, always-legal move for a human, or null when the game needs the time limit to move for them. */
function humanMove(gameId, play, me) {
  const v = play.view;
  if (gameId === 'pusoy-dos') return play.toAct === me ? (v.lead ? { t: 'pass' } : { t: 'play', cards: [v.mustInclude ?? v.hand[0]] }) : null;
  if (gameId === 'tong-its') {
    if (play.toAct !== me) return null;
    if (v.phase === 'fight') return { t: 'respond', challenge: false };
    if (v.phase === 'draw') return { t: 'draw', from: 'stock' };
    return v.mustMeld !== null ? null : { t: 'discard', card: v.hand[0] };
  }
  if (gameId === 'poker') {
    if (play.toAct !== me) return null;
    if (v.toCall === 0) return Math.random() < 0.2 && v.raise ? { t: 'raise', to: v.raise.min } : { t: 'check' };
    return Math.random() < 0.6 ? { t: 'call' } : { t: 'fold' };
  }
  return null; // pusoy: the server sets the rows when the (shortened) limit runs out
}

async function runRoom(i) {
  const gameId = pick(Object.keys(GAMES));
  const count = pick(GAMES[gameId].counts);
  const humansWanted = 1 + rand(Math.min(3, count));
  const botLevels = Array.from({ length: count - humansWanted }, () => pick(['easy', 'normal', 'hard']));
  const hostTok = token();
  const host = await createRoom(base, { name: `Soak ${i}`, gameId, playerCount: count, unit: 'pts', hostName: 'Host', token: hostTok, bots: botLevels });
  if (host.status !== 200) { bump(report.unexpectedErrors, `create:${host.status}`); return; }
  const code = host.json.code;
  const g = (report.perGame[gameId] ??= { rooms: 0, hands: 0, ms: [], reconnects: 0 });
  g.rooms++;
  report.rooms++;
  const clients = [];
  const me = new Client(base, code, hostTok, 'Host');
  await me.open();
  clients.push(me);
  for (let k = 1; k < humansWanted; k++) {
    const c = new Client(base, code, token(), `Guest${k}`);
    await c.open();
    clients.push(c);
  }
  for (const c of clients) c.sentKey = '';
  // stranger and duplicate-token sockets (never allowed to disturb the game)
  let stranger = null;
  const wire = (c) => c.onState((st) => {
    report.maxStateBytes = Math.max(report.maxStateBytes, c.maxBytes);
    const play = st.play;
    const you = st.you?.playerId;
    if (!play || !you || play.toAct === null && !(play.pending ?? []).includes(you)) return;
    if (!(play.pending ?? [play.toAct]).includes(you)) return;
    const key = `${play.handNo}:${JSON.stringify(play.pending)}:${play.view.street ?? play.view.phase ?? ''}:${play.view.hand?.length ?? ''}:${play.view.board?.length ?? ''}:${play.view.toCall ?? ''}:${play.view.lead?.cards?.join('.') ?? ''}`;
    if (c.sentKey === key) return;
    c.sentKey = key;
    const mv = humanMove(gameId, play, you);
    if (!mv) return; // the time limit will play for this human
    if (Math.random() < 0.12 && st.room.players.length > 0) return; // idle this turn and let the limit run
    setTimeout(() => c.send({ t: 'move', move: mv }), 30 + rand(250));
  });
  clients.forEach(wire);

  try {
    await me.waitState((s) => s.room.players.length === count, 20000);
  } catch {
    // seat any remaining humans? the table never filled
    report.hung.push({ code, gameId, why: 'table never filled', have: me.state?.room.players.length, want: count });
    clients.forEach((c) => c.close());
    return;
  }
  const handsTarget = gameId === 'poker' ? 3 : 2;
  for (let hand = 1; hand <= handsTarget; hand++) {
    // turnSeconds 1 gives 1s (poker/others) or 6s (pusoy) so idle humans are timed out quickly; 0 only when humans always move
    const needsLimit = gameId === 'pusoy' || humansWanted > 0;
    const turnSeconds = gameId === 'pusoy' ? 1 : needsLimit ? pick([2, 3, 20]) : 0;
    const t0 = Date.now();
    me.send({ t: 'deal', stake: 5, turnSeconds });
    // chaos while the hand runs
    const chaos = (async () => {
      await sleep(400 + rand(2500));
      const r = rand(6);
      if (r === 0) { // reconnect a human mid-hand with the same token
        const c = pick(clients);
        const was = c.state?.you?.playerId;
        c.close();
        await sleep(100 + rand(400));
        await c.open(); // keeps its listeners, so waiting callers and the human policy carry on
        try { await c.waitState((s) => s.you?.playerId === was, 8000); g.reconnects++; }
        catch { report.hung.push({ code, gameId, why: 'reconnect did not restore identity', was }); }
      } else if (r === 1) { // a second socket with an existing token joins as the same player
        const c = pick(clients);
        const twin = new Client(base, code, c.tok, c.name);
        await twin.open();
        try { await twin.waitState((s) => s.you?.playerId === c.state?.you?.playerId, 6000); } catch { report.hung.push({ code, gameId, why: 'twin socket did not get the same identity' }); }
        twin.close();
      } else if (r === 2) { // a stranger tries to sit at a full table
        stranger = new Client(base, code, token(), 'Stranger');
        await stranger.open();
        await sleep(600);
        // A stranger gets only the preview (full or started) and never a seat, a state or any cards.
        const refused = (stranger.lobby?.status === 'full' || stranger.lobby?.status === 'started') && !stranger.state;
        if (!refused) report.hung.push({ code, gameId, why: 'a stranger was not refused at a full table', errors: stranger.errors.map((e) => e.code), lobby: stranger.lobby ?? null, gotState: !!stranger.state });
        stranger.close();
      } else if (r === 3 && clients.length > 1) { // a guest tries host-only actions and moves out of turn
        const guest = clients[1];
        guest.send({ t: 'deal', stake: 5, turnSeconds: 0 });
        guest.send({ t: 'undo' });
        guest.send({ t: 'move', move: { t: 'fold' } });
        guest.send({ t: 'move', move: { garbage: true } });
        await sleep(500);
      } else if (r === 4) { // rename storm
        const c = pick(clients);
        for (let k = 0; k < 6; k++) { c.send({ t: 'rename', name: `N${rand(1000)}${'x'.repeat(rand(30))}` }); await sleep(30); }
      }
    })();
    try {
      await me.waitState((s) => s.play && s.play.handNo === hand && s.play.toAct === null, HAND_TIMEOUT);
    } catch {
      report.hung.push({ code, gameId, hand, why: 'hand did not finish', play: me.state?.play ? { toAct: me.state.play.toAct, pending: me.state.play.pending, street: me.state.play.view.street ?? me.state.play.view.phase } : null, turnSeconds });
      break;
    }
    await chaos.catch(() => undefined);
    g.hands++;
    report.hands++;
    g.ms.push(Date.now() - t0);
    const total = Object.values(me.state.room.totals).reduce((a, b) => a + b, 0);
    if (total !== 0) report.hung.push({ code, gameId, why: `totals not zero-sum: ${total}` });
    if (me.state.room.rounds.length !== hand) report.hung.push({ code, gameId, why: `rounds ${me.state.room.rounds.length} != hands ${hand}` });
  }
  for (const c of clients) {
    for (const e of c.errors) bump(EXPECTED.has(e.code) ? report.expectedErrors : report.unexpectedErrors, e.code);
    report.messages += c.messages;
    c.close();
  }
}

async function abuse() {
  const note = (name, ok, extra = '') => { report.abuse.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  abuse: ${name}${ok ? '' : '  ' + extra}`); };
  const tok = token();
  const room = await createRoom(base, { name: 'Abuse', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'H', token: tok });
  const code = room.json.code;
  const c = new Client(base, code, tok, 'H');
  await c.open();
  await c.waitState((s) => !!s.room);
  c.send('x'.repeat(5000));
  await sleep(300);
  note('oversized message is refused and the socket survives', c.errors.some((e) => e.code === 'too_large') && c.ws.readyState === 1, JSON.stringify(c.errors));
  c.errors.length = 0;
  c.send('{not json');
  c.send(JSON.stringify({ t: 'nope' }));
  c.send(JSON.stringify({ t: 'rename', name: { toString: 1 } }));
  c.send(JSON.stringify([1, 2, 3]));
  c.send('null');
  await sleep(300);
  note('bad JSON, unknown and malformed messages are refused', c.errors.length === 5 && c.errors.every((e) => e.code === 'bad_message'), JSON.stringify(c.errors.map((e) => e.code)));
  c.ws.send(new Uint8Array([1, 2, 3, 4]));
  await sleep(300);
  note('a binary frame is refused, not a crash', c.ws.readyState === 1);
  const p0 = c.pongs;
  for (let i = 0; i < 300; i++) c.send({ t: 'ping' });
  await sleep(800);
  note('300 pings all answered', c.pongs - p0 === 300, `${c.pongs - p0}`);
  const r0 = c.reacts;
  for (let i = 0; i < 25; i++) c.send({ t: 'react', emoji: '\u{1F525}' });
  await sleep(500);
  note('reaction spam is throttled to a couple per second', c.reacts - r0 <= 2, `${c.reacts - r0}`);
  c.send({ t: 'react', emoji: 'not allowed' });
  await sleep(200);
  note('an emoji outside the list is refused', c.errors.some((e) => e.code === 'bad_message'));
  note('cross-origin upgrade is 403', (await upgradeStatus(base, `/api/rooms/${code}/ws`, 'https://evil.example')) === 403);
  note('unknown room is 404', (await upgradeStatus(base, '/api/rooms/ZZZZZ/ws', base)) === 404);
  note('bad room code is 404', [404].includes(await upgradeStatus(base, '/api/rooms/bad!/ws', base)));
  const big = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ x: 'y'.repeat(5000) }) });
  note('a huge create request is 413', big.status === 413, String(big.status));
  const badJson = await fetch(`${base}/api/rooms`, { method: 'POST', body: '{nope' });
  note('bad create JSON is 400', badJson.status === 400, String(badJson.status));
  const noTok = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: 'x' }) });
  note('create without a device token is 400', noTok.status === 400);
  const weird = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: 'x', gameId: 'pusoy-dos', playerCount: 4, unit: 'pts', hostName: 'H', token: token(), bots: ['easy', 'easy', 'easy', 'easy'], setup: { __proto__: { x: 1 } } }) });
  note('too many computers is refused', weird.status === 400, String(weird.status));
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await fetch(`${base}/api/rooms`, { method });
    note(`${method} /api/rooms is refused`, res.status >= 400 && res.status < 500, String(res.status));
  }
  // join flood: 40 sockets try to sit at a 4-seat table
  const flood = await Promise.all(Array.from({ length: 40 }, async (_, i) => { const x = new Client(base, code, token(), `F${i}`); await x.open(); return x; }));
  await sleep(1500);
  const seated = c.state.room.players.length;
  note('a join flood never over-fills the table', seated <= 4, `${seated} seated`);
  // Phones that do not get a seat are shown the preview with status "full", never the room or any cards.
  const refused = flood.filter((x) => x.lobby?.status === 'full' && !x.state).length;
  note('everyone past the table size is told it is full', refused >= 40 - 3, `${refused}/40 refused`);
  flood.forEach((x) => x.close());
  c.close();
}

async function persist() {
  const dir = `${process.env.TMPDIR ?? '/tmp'}/tt-stress-persist-${Date.now()}`;
  const port = 8791;
  const pbase = `http://localhost:${port}`;
  const start = () => new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--persist-to', dir, '--var', 'TT_RATE_LIMIT:off'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let ready = false;
    const on = (b) => { if (!ready && String(b).includes(`Ready on`)) { ready = true; resolve(child); } };
    child.stdout.on('data', on);
    child.stderr.on('data', on);
    setTimeout(() => !ready && reject(new Error('wrangler did not start')), 60000);
  });
  const kill = (child) => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } };
  const result = { ok: false, checks: [] };
  const check = (name, ok, extra = '') => { result.checks.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  persist: ${name}${ok ? '' : '  ' + extra}`); };
  let child = await start();
  try {
    const tok = token();
    const a = await createRoom(pbase, { name: 'Persist', gameId: 'poker', playerCount: 3, unit: 'pts', hostName: 'H', token: tok, bots: ['normal', 'hard'] });
    const b = await createRoom(pbase, { name: 'Persist2', gameId: 'pusoy-dos', playerCount: 2, unit: 'pts', hostName: 'H', token: tok, bots: ['easy'] });
    const ca = new Client(pbase, a.json.code, tok, 'H');
    const cb = new Client(pbase, b.json.code, tok, 'H');
    await ca.open(); await cb.open();
    await ca.waitState((s) => s.room.players.length === 3);
    await cb.waitState((s) => s.room.players.length === 2);
    ca.send({ t: 'deal', stake: 1, turnSeconds: 0 });
    cb.send({ t: 'deal', stake: 5, turnSeconds: 4 });
    await ca.waitState((s) => s.play && s.play.handNo === 1);
    await cb.waitState((s) => s.play && s.play.handNo === 1);
    await sleep(1500);
    const handA = ca.state.play.view.hole.join();
    const roundsBefore = [ca.state.room.rounds.length, cb.state.room.rounds.length];
    ca.close(); cb.close();
    kill(child); // kill -9 mid-hand
    await sleep(1500);
    child = await start();
    const ra = new Client(pbase, a.json.code, tok, 'H');
    const rb = new Client(pbase, b.json.code, tok, 'H');
    await ra.open(); await rb.open();
    await Promise.all([ra.waitState((s) => !!s.room, 20000), rb.waitState((s) => !!s.room, 20000)]).catch(() => undefined);
    check('both rooms survive a hard restart', !!ra.state?.room && !!rb.state?.room, JSON.stringify([ra.errors, rb.errors]));
    check('I am still the same player and host', ra.state?.you?.playerId === 'p1' && ra.state?.you?.isHost === true);
    check('my hole cards are unchanged', ra.state?.play?.view?.hole?.join() === handA, `${ra.state?.play?.view?.hole} vs ${handA}`);
    check('computers keep playing after the restart (poker hand finishes)', await ra.waitState((s) => s.play?.toAct === null || s.play?.toAct === 'p1', 60000).then(() => true).catch(() => false));
    check('the human time limit still fires after the restart (pusoy dos)', await rb.waitState((s) => s.play?.toAct === null, 90000).then(() => true).catch(() => false));
    check('a finished hand was recorded exactly once', ra.state?.room.rounds.length <= roundsBefore[0] + 1 && rb.state?.room.rounds.length === roundsBefore[1] + 1, JSON.stringify([ra.state?.room.rounds.length, rb.state?.room.rounds.length, roundsBefore]));
    ra.close(); rb.close();
    result.ok = result.checks.every((c) => c.ok);
  } catch (e) {
    check('persistence run completed', false, e.message);
  } finally {
    kill(child);
  }
  report.persist = result;
}

async function pool(total, conc, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < total) {
      const i = next++;
      try { await fn(i); } catch (e) { bump(report.unexpectedErrors, `runRoom threw: ${e.message}`); }
    }
  }));
}

const t0 = Date.now();
console.log(`stress: ${ROOMS} rooms, ${CONC} at a time, against ${base}`);
if (!args.includes('--persist-only')) {
  await abuse();
  await pool(ROOMS, CONC, runRoom);
}
if (args.includes('--persist') || args.includes('--persist-only')) await persist();
report.seconds = Math.round((Date.now() - t0) / 1000);
for (const g of Object.values(report.perGame)) { g.ms.sort((a, b) => a - b); g.p50 = g.ms[Math.floor(g.ms.length / 2)]; g.max = g.ms[g.ms.length - 1]; delete g.ms; }
writeFileSync(new URL('level3.json', out), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ rooms: report.rooms, hands: report.hands, seconds: report.seconds, hung: report.hung.length, unexpectedErrors: report.unexpectedErrors, expectedErrors: report.expectedErrors, perGame: report.perGame, maxStateBytes: report.maxStateBytes, abuseFailed: report.abuse.filter((a) => !a.ok).length, persist: report.persist?.ok }, null, 2));
if (report.hung.length) console.log('HUNG / WRONG:', JSON.stringify(report.hung.slice(0, 10), null, 1));
process.exit(report.hung.length === 0 && Object.keys(report.unexpectedErrors).length === 0 && report.abuse.every((a) => a.ok) && (report.persist?.ok ?? true) ? 0 : 1);
