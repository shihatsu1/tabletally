const { chromium } = require(process.cwd() + '/node_modules/playwright-core');
(async () => {
  const token = require('node:crypto').randomBytes(16).toString('hex');
  const response = await fetch('http://localhost:8787/api/rooms', { method: 'POST', body: JSON.stringify({ token, name: 'Animation', gameId: 'tong-its', playerCount: 3, unit: 'pts', hostName: 'A', bots: ['easy', 'easy'] }) });
  const { code } = await response.json();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(value => localStorage.setItem('tt.token', value), token);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:8787/#/r/${code}`);
  await page.getByRole('button', { name: /^Deal/ }).click();
  await page.locator('.ti .hand [data-animation-card]').first().waitFor();
  await page.waitForTimeout(1200);
  async function emit() {
    await page.evaluate(() => {
      const card = Number(document.querySelector('.ti .hand [data-animation-card]').getAttribute('data-animation-card'));
      const base = { you: 'p1', players: ['p1', 'p2', 'p3'], turn: 'p1', stockCount: 20, discards: [1], counts: { p1: 12, p2: 12, p3: 12 }, hand: [], melds: [], done: false };
      const before = { ...base }, after = { ...base, stockCount: 19, hand: [card] };
      const envelope = view => ({ view, handNo: 99, revision: undefined, stake: 1, toAct: 'p1', pending: ['p1'], turnEndsAt: null, unscored: false });
      const room = { gameId: 'tong-its', rounds: [], history: [], players: [], setup: {}, unit: 'pts' };
      window.dispatchEvent(new CustomEvent('tt:play-update', { detail: { before: envelope(before), after: envelope(after), beforeRoom: room, room } }));
    });
  }
  await emit();
  await page.locator('.animation-arriving').first().waitFor({ timeout: 1000 });
  if (!await page.locator('.moving-card').count()) throw Error('moving card missing');
  await page.locator('.animation-arriving').first().waitFor({ state: 'detached', timeout: 2000 }).catch(async () => { if (await page.locator('.animation-arriving').count()) throw Error('card stayed hidden'); });
  await emit();
  await page.locator('.animation-arriving').first().waitFor({ timeout: 1000 });
  await page.evaluate(() => window.dispatchEvent(new Event('tt:animation-reset')));
  if (await page.locator('.animation-arriving').count()) throw Error('reset left a card hidden');
  await page.waitForTimeout(50);
  if (await page.locator('.moving-card').count()) throw Error('reset left a moving card');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emit();
  await page.locator('.animation-highlight').first().waitFor({ timeout: 1000 });
  if (await page.locator('.moving-card').count()) throw Error('card moved with reduced motion');
  await page.waitForTimeout(650);
  if (await page.locator('.animation-highlight').count()) throw Error('highlight did not clear');
  console.log('PASS arrival concealment, reset cleanup, and reduced-motion feedback');
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
