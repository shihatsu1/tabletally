// UI monkey for TableTally. Injected into the app page; drives the real app inside iframes of many sizes.
// Usage (in the page): await __monkey.run({ pages: [...], sizes: [...], steps: 200 })  -> JSON summary
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const TEXTS = ['', ' ', 'Abe', 'x'.repeat(30), '😀😀😀', 'عربى', 'a‏b', '-5', '0', '99999999999999', '1.5', 'NaN', '<b>x</b>', '"; drop', 'Ñandú', '\n', 'COMPUTER 1', 'A'.repeat(300)];
  const KEYLIKE = /(^|[\s(])((?:play|room|home|opt|tong|pusoy|poker|entry|hand|level|error|banner|rules|cur|nav|app|game|react|bot|history|clock|turn)\.[A-Za-z0-9_.-]+)(?=[\s).,:;!?]|$)/;

  function visible(el) {
    const r = el.getBoundingClientRect();
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert]') && !el.disabled;
  }
  function fire(el, type, init) { el.dispatchEvent(new (el.ownerDocument.defaultView.Event)(type, { bubbles: true, ...init })); }

  /** Things that must never be true on any page. */
  function audit(win, label, opts = {}) {
    const d = win.document;
    const issues = [];
    const add = (m) => issues.push(`${label}: ${m}`);
    if (d.documentElement.scrollWidth > win.innerWidth + 1) add(`horizontal overflow (${d.documentElement.scrollWidth} > ${win.innerWidth})`);
    const text = d.body.innerText || '';
    const m = KEYLIKE.exec(text);
    if (m) add(`raw translation key shown: "${m[2]}"`);
    if (/\bNaN\b|\bundefined\b|\[object |\bnull\b(?!\w)/.test(text)) add(`bad value in text: ${(/.{0,25}(NaN|undefined|\[object |null).{0,15}/.exec(text) || [''])[0].trim()}`);
    for (const b of d.querySelectorAll('button')) {
      if (!visible(b)) continue;
      const name = (b.getAttribute('aria-label') || b.textContent || b.title || '').trim();
      if (!name) add(`a visible button has no accessible name (${b.className})`);
    }
    for (const i of d.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      if (!visible(i)) continue;
      const named = i.getAttribute('aria-label') || (i.id && d.querySelector(`label[for="${i.id}"]`)) || i.closest('label') || i.getAttribute('aria-labelledby');
      if (!named) add(`a visible ${i.tagName.toLowerCase()} has no label (${i.id || i.className})`);
    }
    for (const img of d.querySelectorAll('img')) if (!img.hasAttribute('alt')) add('an image has no alt');
    // a control must be fully inside the viewport horizontally
    for (const el of d.querySelectorAll('button, input, select, a')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > win.innerWidth + 1 || r.left < -1) { add(`control out of the viewport: ${(el.textContent || el.id || el.className).trim().slice(0, 30)} [${Math.round(r.left)}..${Math.round(r.right)}]`); break; }
    }
    const screen = d.querySelector('.screen');
    if (screen) {
      // the in-hand screen must never scroll
      if (d.documentElement.scrollHeight > win.innerHeight + 1) add(`in-hand page scrolls (${d.documentElement.scrollHeight} > ${win.innerHeight})`);
      const play = d.querySelector('.play');
      if (play && play.scrollHeight > play.clientHeight + 1 && !opts.allowClip) add(`play area clips content (${play.scrollHeight} > ${play.clientHeight})`);
      // the hand and the buttons must stay on screen
      for (const b of d.querySelectorAll('.play button')) {
        if (!visible(b)) continue;
        const r = b.getBoundingClientRect();
        if (r.bottom > win.innerHeight + 1 || r.top < 0) { add(`a play button is off screen: ${b.textContent.trim().slice(0, 20)}`); break; }
      }
    }
    return issues;
  }

  /** Random actions on whatever is on screen. Returns what it did and any problems. */
  async function monkey(win, steps, label, state) {
    const d = win.document;
    const issues = [];
    const log = [];
    for (let i = 0; i < steps; i++) {
      const els = [...d.querySelectorAll('button, a[href], input, select, summary, textarea, [role=button]')].filter(visible);
      if (els.length === 0) break;
      const el = pick(els);
      const tag = el.tagName.toLowerCase();
      try {
        // remember what we are about to do: if the page freezes, this is the last thing it was asked
        window.sessionStorage.setItem('mk.last', JSON.stringify({ label, i, tag, id: el.id, text: (el.textContent || '').trim().slice(0, 30), type: el.getAttribute('type'), cls: String(el.className).slice(0, 40) }));
        if (tag === 'input') {
          const type = (el.getAttribute('type') || 'text').toLowerCase();
          if (type === 'checkbox' || type === 'radio') el.click();
          else if (type === 'range') { el.value = pick([el.min, el.max, String((Number(el.min) + Number(el.max)) >> 1)]); fire(el, 'input'); fire(el, 'change'); }
          else { el.focus(); el.value = pick(TEXTS); fire(el, 'input'); fire(el, 'change'); }
        } else if (tag === 'textarea') { el.value = pick(TEXTS); fire(el, 'input'); }
        else if (tag === 'select') { const o = pick([...el.options]); el.value = o.value; fire(el, 'input'); fire(el, 'change'); }
        else if (tag === 'a') { const href = el.getAttribute('href') || ''; if (href.startsWith('#/') || href === '#') el.click(); }
        else el.click();
        log.push(`${tag}:${(el.textContent || el.id || '').trim().slice(0, 18)}`);
      } catch (e) { issues.push(`${label}: action threw: ${e.message}`); }
      await sleep(15);
      if (i % 4 === 0) for (const m of audit(win, `${label} [step ${i} after ${log[log.length - 1]}]`, { allowClip: false })) issues.push(m);
      // never wander off the page being tested: if the app navigated away, come back
      if (state?.hash && win.location.hash !== state.hash && rnd() < 0.5) { win.location.hash = state.hash; await sleep(50); }
    }
    return { issues, actions: log.length, sample: log.slice(0, 5) };
  }

  async function frame(w, h, hash, lang) {
    document.body.innerHTML = '';
    document.body.style.overflow = 'auto';
    // the language is chosen when the app starts, so set it before the iframe loads (it shares this page's storage)
    if (lang) { try { localStorage.setItem('tt.lang', lang); } catch { /* ignore */ } }
    const f = document.createElement('iframe');
    f.style.cssText = `width:${w}px;height:${h}px;border:2px solid #888;display:block;margin:0 auto`;
    f.src = `/?mk=${Math.random()}${hash || ''}`;
    document.body.appendChild(f);
    await new Promise((r) => f.addEventListener('load', r));
    const win = f.contentWindow;
    const errors = [];
    win.addEventListener('error', (e) => errors.push(`error: ${e.message} @ ${String(e.filename).split('/').slice(-2).join('/')}:${e.lineno} ${String(e.error?.stack ?? '').split('\n').slice(1, 4).map((x) => x.trim().replace(/https?:\/\/[^/]+/, '')).join(' < ')}`));
    win.addEventListener('unhandledrejection', (e) => errors.push(`rejection: ${e.reason?.message ?? e.reason}`));
    const cw = win.console.warn;
    win.console.warn = (...a) => { const t = a.map(String).join(' '); if (!/DevTools|HMR/.test(t)) errors.push(`console.warn: ${t.slice(0, 260)}`); cw.apply(win.console, a); };
    const ce = win.console.error;
    win.console.error = (...a) => { errors.push(`console.error: ${a.map(String).join(' ').slice(0, 200)}`); ce.apply(win.console, a); };
    if (lang) { try { win.localStorage.setItem('tt.lang', lang); } catch { /* ignore */ } }
    await sleep(900);
    return { f, win, errors };
  }

  async function createRoomVia(body) {
    const tok = localStorage.getItem('tt.token');
    const r = await fetch('/api/rooms', { method: 'POST', body: JSON.stringify({ ...body, token: tok }) }).then((x) => x.json());
    return r.code;
  }

  const click = (win, text) => { const b = [...win.document.querySelectorAll('button')].find((x) => x.textContent.trim() === text && visible(x)); b?.click(); return !!b; };

  /** One page scenario: open it, audit, wake the monkey, audit again. */
  async function scenario(spec, size, steps) {
    const [w, h] = size;
    const label = `${spec.name} @${w}x${h}${spec.lang ? ' ' + spec.lang : ''}`;
    let code = null;
    if (spec.room) code = await createRoomVia(spec.room);
    const hash = spec.hash ?? (code ? `#/r/${code}` : '');
    // a stranger is a different device: same page storage, but a new device token
    const realToken = localStorage.getItem('tt.token');
    if (spec.stranger) localStorage.setItem('tt.token', Array.from({ length: 32 }, () => Math.floor(rnd() * 16).toString(16)).join(''));
    const { win, errors } = await frame(w, h, hash, spec.lang);
    if (spec.stranger && realToken) setTimeout(() => localStorage.setItem('tt.token', realToken), 0);
    const issues = [];
    if (spec.setup) await spec.setup(win, { click, sleep, createRoomVia });
    await sleep(spec.wait ?? 600);
    issues.push(...audit(win, `${label} (loaded)`));
    const run = await monkey(win, steps, label, { hash });
    issues.push(...run.issues);
    issues.push(...errors.map((e) => `${label}: ${e}`));
    return { label, issues, actions: run.actions };
  }

  async function run({ specs, sizes, steps = 120, seedStart = 1, lang }) {
    seed = seedStart;
    const results = [];
    for (const spec of specs) for (const size of sizes) {
      try { results.push(await scenario({ ...spec, lang: lang ?? spec.lang }, size, steps)); }
      catch (e) { results.push({ label: `${spec.name} @${size}`, issues: [`scenario threw: ${e.message}`], actions: 0 }); }
    }
    const all = results.flatMap((r) => r.issues);
    // de-duplicate by the part after the viewport so one bug is reported once per page
    const unique = [...new Set(all.map((s) => s.replace(/ \[step[^\]]*\]/g, '').slice(0, 700)))];
    const summary = JSON.stringify({ scenarios: results.length, actions: results.reduce((a, r) => a + r.actions, 0), issueCount: all.length, issues: unique.slice(0, 40) });
    try { window.sessionStorage.setItem('mk.result', summary); } catch { /* ignore */ }
    return summary;
  }

  window.__monkey = { run, audit, monkey, frame, createRoomVia, click, sleep };
})();
