// Safety net for the split stylesheet: css/style.css holds the shared rules, css/pages/<page>.css holds
// rules that only one page needs and is linked from that page only. If someone later uses those classes on
// another page, that page silently loses its styling — this script finds it.
//
// A page "needs" a bundle when it contains every class of at least one selector in that bundle (so a stray
// word like "up" in page text doesn't count).  Usage: node scripts/check-css-split.mjs [siteRoot]
// Exit code 1 when a page is missing a bundle.  Fix: link the bundle from the page, or move the rule into style.css.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const read = (p) => fs.readFileSync(p, 'utf8');
const tok = /[A-Za-z_][\w-]*/g;

// --- tiny CSS walker: yields selector lists for every style rule, descending into @media/@supports ---
function* selectorLists(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function* walk(s) {
    let p = 0;
    while (p < s.length) {
      const open = s.indexOf('{', p);
      if (open < 0) return;
      const semi = s.indexOf(';', p);
      if (semi >= 0 && semi < open) { p = semi + 1; continue; }
      let depth = 1, q = open + 1;
      while (q < s.length && depth) { if (s[q] === '{') depth++; else if (s[q] === '}') depth--; q++; }
      const head = s.slice(p, open).trim(), body = s.slice(open + 1, q - 1);
      if (/^@(media|supports)/.test(head)) yield* walk(body);
      else if (!head.startsWith('@')) yield head;
      p = q;
    }
  }
  yield* walk(css);
}
function splitSelectors(head) {
  const out = []; let depth = 0, cur = '';
  for (const ch of head) {
    if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function requiredClasses(sel) {
  let prev;
  do { prev = sel; sel = sel.replace(/:(?:not|is|where|has|matches)\([^()]*\)/g, ''); } while (sel !== prev);
  return [...sel.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]);
}

const bundles = {};
const dir = path.join(ROOT, 'css/pages');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.css')) {
  const sels = [];
  for (const head of selectorLists(read(path.join(dir, f)))) for (const s of splitSelectors(head)) { const r = requiredClasses(s); if (r.length) sels.push(r); }
  bundles[`/css/pages/${f}`] = sels;
}

const jsTokens = {};
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (f.endsWith('.js')) jsTokens[f] = new Set(read(path.join(ROOT, 'js', f)).match(tok) || []);

function* htmlFiles(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'css') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* htmlFiles(p); else if (e.name.endsWith('.html')) yield p;
  }
}

let problems = 0, checked = 0;
for (const file of htmlFiles(ROOT)) {
  const html = read(file);
  if (!html.includes('/css/style.css')) continue;
  checked++;
  const linked = new Set([...html.matchAll(/href="(\/css\/pages\/[^"]+\.css)"/g)].map(m => m[1]));
  const used = new Set(html.match(tok) || []);
  for (const j of html.matchAll(/src="\/js\/([^"?]+)"/g)) for (const t of jsTokens[j[1]] || []) used.add(t);
  const missing = [];
  for (const [b, sels] of Object.entries(bundles)) {
    if (linked.has(b)) continue;
    const hit = sels.find(req => req.every(c => used.has(c)));
    if (hit) missing.push(`${b} (e.g. .${hit.join('.')})`);
  }
  if (missing.length) { problems++; console.log(`${path.relative(ROOT, file)} needs ${missing.join(', ')}`); }
}
console.log(problems ? `\n${problems} page(s) are missing a stylesheet bundle.` : `OK — ${checked} pages, none is missing a bundle.`);
process.exit(problems ? 1 : 0);
