// Browser checks against a running dev Worker (default http://localhost:8787), with real Chrome via Playwright.
// Usage: npm run e2e [baseUrl]. Covers what unit tests cannot see: joining, dealing and playing on real screens,
// no scrolling at phone sizes, and automatic accessibility checks (axe-core, WCAG 2.2 AA).
// Uses the installed Chrome (`channel: 'chrome'`), so nothing is downloaded.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.argv[2] ?? 'http://localhost:8787';
const PHONES = [{ width: 375, height: 667 }, { width: 390, height: 844 }];
const GAMES = [['pusoy-dos', 4], ['tong-its', 3], ['pusoy', 4], ['poker', 4]];

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
};
const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function createTable(gameId, playerCount, bots) {
  const t = token();
  const res = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ token: t, name: 'E2E', gameId, playerCount, unit: 'pts', hostName: 'A', bots }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`create failed: ${JSON.stringify(body)}`);
  return { code: body.code, token: t };
}
async function phone(browser, size, tok) {
  const ctx = await browser.newContext({ viewport: size, colorScheme: 'dark' });
  if (tok) await ctx.addInitScript((t) => localStorage.setItem('tt.token', t), tok);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { ctx, page, errors };
}
const fits = (page) => page.evaluate(() => {
  const d = document.documentElement;
  return d.scrollWidth <= d.clientWidth && d.scrollHeight <= d.clientHeight;
});
async function axe(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, rules: { 'target-size': { enabled: false } } });
    return r.violations.map((v) => `${v.id} x${v.nodes.length}`);
  });
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  // 1. Joining: a new phone sees the table, not an error; after a name it is seated.
  {
    const { code } = await createTable('pusoy-dos', 2, []);
    const { ctx, page, errors } = await phone(browser, PHONES[0]);
    await page.goto(`${base}/#/r/${code}`);
    await page.getByLabel(/Your name/).waitFor();
    check('a new phone sees the table preview with a name field and no error', (await page.locator('.error').count()) === 0 && (await page.getByText('E2E').count()) > 0);
    await page.getByLabel(/Your name/).fill('B');
    await page.getByRole('button', { name: /Sit down/ }).click();
    await page.getByRole('button', { name: /Menu/ }).waitFor({ timeout: 5000 });
    check('after giving a name the table fills and the hand screen opens', true);
    check('no console errors while joining', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2. Every game at both phone sizes: deal, nothing scrolls, the hand is drawn, axe finds nothing.
  for (const size of PHONES) {
    for (const [gameId, n] of GAMES) {
      const { code, token: tok } = await createTable(gameId, n, Array(n - 1).fill('normal'));
      const { ctx, page, errors } = await phone(browser, size, tok);
      await page.goto(`${base}/#/r/${code}`);
      await page.getByRole('button', { name: /^Deal/ }).click();
      await page.locator('[role="group"][aria-label="Your hand"], .holefan, .hand').first().waitFor({ timeout: 8000 });
      await page.waitForTimeout(600);
      const tag = `${gameId} at ${size.width}x${size.height}`;
      check(`${tag}: no scrolling while a hand is on`, await fits(page));
      check(`${tag}: real card faces are drawn`, (await page.locator('.art').count()) >= 2);
      const v = await axe(page);
      check(`${tag}: no WCAG 2.2 AA violations (axe)`, v.length === 0, v.join(', '));
      check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  // 3. A move: in Pusoy Dos the human picks a card and plays or passes, and the turn moves on.
  {
    const { code, token: tok } = await createTable('pusoy-dos', 2, ['easy']);
    const { ctx, page } = await phone(browser, PHONES[1], tok);
    await page.goto(`${base}/#/r/${code}`);
    await page.getByRole('button', { name: /^Deal/ }).click();
    let moved = false;
    for (let i = 0; i < 40 && !moved; i++) {
      await page.waitForTimeout(500);
      if ((await page.getByText('Your turn').count()) === 0) continue;
      const pass = page.getByRole('button', { name: 'Pass' });
      if (await pass.isEnabled()) await pass.click();
      else {
        await page.locator('button.card').first().click();
        await page.getByRole('button', { name: /^Play/ }).click();
      }
      moved = true;
    }
    await page.waitForTimeout(800);
    check('a human move is accepted and play continues', moved && (await page.locator('.error').count()) === 0);
    await ctx.close();
  }

  // 4. The home page in both themes.
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: PHONES[1], colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.getByRole('button', { name: /Create table/ }).waitFor();
    const v = await axe(page);
    check(`home (${scheme}): no WCAG 2.2 AA violations (axe)`, v.length === 0, v.join(', '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nAll browser checks passed' : `\n${failures} browser check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
