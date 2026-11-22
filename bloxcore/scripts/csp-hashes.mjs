#!/usr/bin/env node
// Keeps the strict (Report-Only) CSP in _headers in sync with the site's inline <script> blocks.
// Usage: node scripts/csp-hashes.mjs [repoRoot]          rewrite _headers
//        node scripts/csp-hashes.mjs [repoRoot] --check   exit 1 if _headers is out of date (CI)
// Why: with hashes, script-src no longer needs 'unsafe-inline', so the policy can be flipped from
// Report-Only to enforced once /csp-report stays quiet. JSON-LD / data blocks are not executed → no hash.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const CHECK = process.argv.includes('--check');
const SKIP = new Set(['node_modules', '.git', '.lighthouseci', 'patches', 'build-tmp']);
const MAX_LINE = 2000; // Cloudflare _headers: a rule line may not exceed 2,000 characters

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

const hashes = new Set();
for (const f of walk(ROOT)) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) continue; // JSON-LD etc.
    if (!m[2].trim()) continue;
    hashes.add("'sha256-" + crypto.createHash('sha256').update(m[2]).digest('base64') + "'");
  }
}

const hp = path.join(ROOT, '_headers');
const src = fs.readFileSync(hp, 'utf8');
const lines = src.split('\n');
const idx = lines.findIndex((l) => /^\s*Content-Security-Policy-Report-Only:/i.test(l));
if (idx < 0) { console.error('csp-hashes: no Content-Security-Policy-Report-Only line in _headers'); process.exit(1); }

const [name, ...rest] = lines[idx].split(':');
const dirs = rest.join(':').split(';').map((d) => d.trim()).filter(Boolean);
const out = [];
let sawScript = false, sawAttr = false;
for (const d of dirs) {
  if (d.startsWith('script-src-attr')) { sawAttr = true; out.push(d); continue; }
  if (d.startsWith('script-src ') || d === 'script-src') {
    sawScript = true;
    const hosts = d.split(/\s+/).slice(1).filter((t) => t !== "'self'" && t !== "'unsafe-inline'" && !t.startsWith("'sha256-"));
    out.push(['script-src', "'self'", ...[...hashes].sort(), ...hosts].join(' '));
    continue;
  }
  out.push(d);
}
if (!sawScript) { console.error('csp-hashes: no script-src directive found'); process.exit(1); }
// No inline event-handler attributes (onclick=…) are used anywhere any more, so they can be blocked outright.
if (!sawAttr) out.splice(out.findIndex((d) => d.startsWith('script-src')) + 1, 0, "script-src-attr 'none'");

const next = `${name}: ${out.join('; ')}`;
const indent = lines[idx].match(/^\s*/)[0];
const full = indent + next.trim();
if (full.length > MAX_LINE) {
  console.error(`csp-hashes: CSP line is ${full.length} chars (> ${MAX_LINE}). Move an inline script into /js/ or shorten the policy.`);
  process.exit(1);
}
if (full === lines[idx]) { console.log(`csp-hashes: up to date (${hashes.size} inline scripts, ${full.length} chars)`); process.exit(0); }
if (CHECK) { console.error('csp-hashes: _headers is out of date — run `node scripts/csp-hashes.mjs`'); process.exit(1); }
lines[idx] = full;
fs.writeFileSync(hp, lines.join('\n'));
console.log(`csp-hashes: wrote ${hashes.size} hashes (${full.length} chars)`);
