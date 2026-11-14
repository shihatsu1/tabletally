// Project consistency checks (run with `npm run lint`). TypeScript and svelte-check cover types; this covers the
// house rules that a type checker cannot see. Plain Node, no dependencies.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    if (f.startsWith('._') || f === 'node_modules') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|svelte|mjs|js)$/.test(f)) files.push(p);
  }
};
walk(join(root, 'src'));

const problems = [];
const rules = [
  { test: /eslint-disable/, why: 'no ESLint here: remove the suppression or explain the code in a comment' },
  { test: /console\.log\(/, why: 'use console.warn/error for diagnostics, or remove the log' },
  { test: /\{@html/, why: 'raw HTML is only allowed for the QR code (Invite.svelte)', allow: /Invite\.svelte$/ },
  { test: /\bstyle="[^"{]*"/, why: 'static inline style: use a class (inline styles are for computed geometry only)', only: /\.svelte$/ },
  { test: /innerHTML/, why: 'never write innerHTML' },
];
for (const f of files) {
  const rel = relative(root, f);
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const r of rules) {
      if (r.only && !r.only.test(rel)) continue;
      if (r.allow && r.allow.test(rel)) continue;
      if (r.test.test(line)) problems.push(`${rel}:${i + 1}: ${r.why}`);
    }
  });
}

// English strings: proper plurals ("1 chip", "2 chips" via a `.one` key), never "chip(s)".
const i18n = readFileSync(join(root, 'src/web/lib/i18n.svelte.ts'), 'utf8');
const en = i18n.slice(i18n.indexOf('const en'), i18n.indexOf('const tl'));
for (const m of en.matchAll(/^\s*'([^']+)': '(.*)',$/gm)) {
  if (/\w\(s\)/.test(m[2])) problems.push(`i18n ${m[1]}: write a plural form instead of "(s)"`);
  if (/\.\.\./.test(m[2])) problems.push(`i18n ${m[1]}: use the ellipsis character … instead of three dots`);
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} lint problem(s)`);
  process.exit(1);
}
console.log('lint: no problems');
