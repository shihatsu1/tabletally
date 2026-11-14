// Static i18n audit: English and Filipino must define the same keys, and every key the code asks for must exist.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync('src/web/lib/i18n.svelte.ts', 'utf8');
const section = (name) => {
  const start = src.indexOf(`const ${name}: Record<string, string> = {`);
  const end = src.indexOf('\n};', start);
  return src.slice(start, end);
};
const keysOf = (s) => new Set([...s.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
const en = keysOf(section('en'));
const tl = keysOf(section('tl'));
const dupes = (s) => { const seen = new Set(); const d = []; for (const m of s.matchAll(/^\s*'([^']+)':/gm)) { if (seen.has(m[1])) d.push(m[1]); seen.add(m[1]); } return d; };
const problems = [];
for (const k of en) if (!tl.has(k)) problems.push(`missing in Filipino: ${k}`);
for (const k of tl) if (!en.has(k)) problems.push(`only in Filipino: ${k}`);
for (const k of dupes(section('en'))) problems.push(`duplicate English key: ${k}`);
for (const k of dupes(section('tl'))) problems.push(`duplicate Filipino key: ${k}`);

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(svelte|ts)$/.test(f)) files.push(p); } };
walk('src/web');
const used = new Set();
const dynamic = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
  for (const m of text.matchAll(/\bt\(\s*`([^`]+)`/g)) {
    if (m[1].includes('${')) dynamic.push({ file: f, template: m[1] });
    else used.add(m[1]);
  }
}
for (const k of used) if (!en.has(k)) problems.push(`used but not defined: ${k}`);
// dynamic keys: check that the static prefix has at least one definition and report the families for review
const families = new Map();
for (const d of dynamic) {
  const prefix = d.template.split('${')[0];
  families.set(prefix, (families.get(prefix) ?? 0) + 1);
  if (![...en].some((k) => k.startsWith(prefix))) problems.push(`dynamic key family has no definitions: ${prefix}* (${d.file})`);
}
const unused = [...en].filter((k) => !used.has(k) && ![...families.keys()].some((p) => k.startsWith(p)));
console.log(JSON.stringify({ english: en.size, filipino: tl.size, usedKeys: used.size, dynamicFamilies: [...families.keys()], unusedCount: unused.length, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
