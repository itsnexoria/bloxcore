#!/usr/bin/env node
// Deploy hygiene (run in CI and after regeneration). Fails on things that only break once deployed:
//   1. dev-only files (patches, RECOVERY notes, .env, sql, zips…) that .assetsignore would NOT keep off the public site
//   2. _headers lines over Cloudflare's 2,000-char limit / more than 100 rules
//   3. /js/, /css/ or /assets/ files referenced from JS, HTML, CSS or the service worker that don't exist
// Usage: node scripts/check-deploy.mjs [repoRoot]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const SKIP_DIRS = new Set(['node_modules', '.git', '.lighthouseci', '.wrangler']);
const errors = [];
const fail = (m) => errors.push(m);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = [...walk(ROOT)];

// ---- 1. .assetsignore vs dev-only files --------------------------------------------------------------
function globToRe(g) {
  g = g.trim().replace(/^\//, '');
  const dirOnly = g.endsWith('/');
  if (dirOnly) g = g.slice(0, -1);
  const re = g.split('**').map((part) => part.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  const hasSlash = g.includes('/');
  return new RegExp(`^${hasSlash ? '' : '(?:.*/)?'}${re}${dirOnly ? '/.*' : '(?:/.*)?'}$`);
}
const ignoreFile = path.join(ROOT, '.assetsignore');
const ignoreRes = fs.existsSync(ignoreFile)
  ? fs.readFileSync(ignoreFile, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map(globToRe)
  : [];
const isIgnored = (r) => ignoreRes.some((re) => re.test(r));
const DEV_ONLY = [/\.patch$/, /\.diff$/, /(^|\/)RECOVERY[^/]*$/i, /(^|\/)\.env/, /\.sql$/, /\.zip$/, /\.map$/, /^patches\//, /^supabase\//, /^scripts\//, /^\.github\//, /(^|\/)package(-lock)?\.json$/];
for (const f of files) {
  const r = rel(f);
  if (DEV_ONLY.some((re) => re.test(r)) && !isIgnored(r)) fail(`dev-only file would be served publicly (add to .assetsignore): ${r}`);
}

// ---- 1b. inline event-handler attributes (blocked by script-src-attr 'none') ---------------------------------
const inlineHandler = /\son(click|change|submit|input|load|error|keydown|keyup|focus|blur|mouseover|mouseout|dblclick)\s*=\s*["'\\]/i;
for (const f of files) {
  if (!/\.(html|js)$/.test(f)) continue;
  const r = rel(f);
  if (r.startsWith('scripts/') || r.startsWith('patches/')) continue;
  const m = fs.readFileSync(f, 'utf8').match(inlineHandler);
  if (m) fail(`inline event handler "${m[0].trim()}" in ${r} — the CSP blocks these; use addEventListener`);
}

// ---- 2. _headers limits --------------------------------------------------------------------------------
const hp = path.join(ROOT, '_headers');
if (fs.existsSync(hp)) {
  const lines = fs.readFileSync(hp, 'utf8').split('\n');
  let rules = 0;
  lines.forEach((l, i) => {
    if (l.length > 2000) fail(`_headers line ${i + 1} is ${l.length} chars (limit 2000)`);
    if (l.trim() && !/^\s/.test(l) && !l.startsWith('#')) rules++;
  });
  if (rules > 100) fail(`_headers has ${rules} rules (limit 100)`);
}

// ---- 3. referenced static files exist --------------------------------------------------------------------
const exts = 'js|css|png|jpe?g|webp|svg|ico|woff2?|json|mp3|ogg|webm|mp4|gif|avif';
const refRe = new RegExp(`["'\`(](/(?:js|css|assets)/[A-Za-z0-9_./@-]+\\.(?:${exts}))(?:\\?[^"'\`)]*)?["'\`)]`, 'g');
const exists = (u) => fs.existsSync(path.join(ROOT, u.slice(1)));
const missing = new Map();
for (const f of files) {
  if (!/\.(html|js|mjs|css)$/.test(f)) continue;
  const r = rel(f);
  if (r.startsWith('scripts/') || r.startsWith('patches/')) continue; // generators build paths dynamically
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(refRe)) {
    if (m[1].includes('${') || m[1].includes('*')) continue;
    if (!exists(m[1])) { if (!missing.has(m[1])) missing.set(m[1], []); missing.get(m[1]).push(r); }
  }
}
for (const [u, from] of missing) fail(`missing file ${u} (referenced by ${from.length} file(s), e.g. ${from[0]})`);

if (errors.length) {
  console.error(`check-deploy: ${errors.length} problem(s)`);
  errors.slice(0, 40).forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('check-deploy: OK');
