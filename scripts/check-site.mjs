// Smoke checks for the static site. Usage: node scripts/check-site.mjs [siteRoot]
// Fails (exit 1) on: broken local links/assets in HTML, indexable pages missing title/description/canonical,
// noindex pages that robots.txt also blocks (crawlers would never see the tag), sitemap URLs that don't exist,
// and JS files with syntax errors. Everything it prints as "warn" is informational.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const SKIP_DIRS = new Set(['node_modules', '.git', '.github']);
// Routes served by the Worker or generated at runtime, not present as files. Pages the Worker 301s
// elsewhere (MOVED_PAGES in worker.js) count as valid link targets too.
const DYNAMIC = [/^\/og\//, /^\/csp-report$/];
const workerSrc = fs.existsSync(path.join(ROOT, 'worker.js')) ? fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8') : '';
const moved = workerSrc.match(/const MOVED_PAGES = \{([\s\S]*?)\};/);
if (moved) for (const m of moved[1].matchAll(/'(\/[^']+)':/g)) DYNAMIC.push(new RegExp('^' + m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = walk(ROOT);
const htmlFiles = files.filter((f) => f.endsWith('.html'));

function resolves(urlPath) {
  const clean = decodeURIComponent(urlPath);
  if (DYNAMIC.some((re) => re.test(clean))) return true;
  const target = path.join(ROOT, clean);
  if (!target.startsWith(ROOT)) return false;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  if (clean.endsWith('/') || !path.extname(clean)) return fs.existsSync(path.join(target, 'index.html'));
  return false;
}

// robots.txt disallows
const robots = fs.existsSync(path.join(ROOT, 'robots.txt')) ? fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8') : '';
const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);

const seenLinks = new Map(); // urlPath -> first page, so each target is checked once
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  const page = rel(f);
  const isRoot404 = page === '404.html';

  for (const m of html.matchAll(/\b(?:href|src)="(\/[^"#?]*)[^"]*"/g)) {
    const u = m[1];
    if (u.startsWith('//') || seenLinks.has(u)) continue;
    seenLinks.set(u, page);
    if (!resolves(u)) fail(`broken link ${u}  (first seen in ${page})`);
  }

  const noindex = /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
  const redirect = /http-equiv="refresh"/i.test(html);
  if (!/<title>[^<]+<\/title>/i.test(html)) fail(`${page}: missing <title>`);
  if (!noindex && !redirect) {
    if (!/<meta[^>]+name="description"[^>]+content="[^"]{20,}/i.test(html)) fail(`${page}: indexable page without a meta description`);
    if (!/<link[^>]+rel="canonical"/i.test(html)) fail(`${page}: indexable page without a canonical link`);
  }
  if (noindex && !isRoot404) {
    const url = '/' + page.replace(/index\.html$/, '');
    const blocker = disallowed.find((d) => d !== '/' && url.startsWith(d));
    if (blocker && !url.startsWith('/admin/')) fail(`${page}: noindex but robots.txt Disallow ${blocker} hides the tag from crawlers`);
  }
}

// Sitemap URLs must exist
const sm = path.join(ROOT, 'sitemap.txt');
if (fs.existsSync(sm)) {
  for (const line of fs.readFileSync(sm, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const u = new URL(line).pathname;
    if (!resolves(u)) fail(`sitemap.txt lists missing page ${u}`);
  }
}

// js/client-extras.js holds helpers split out of supabase-client.js. A page whose scripts (or inline code) use
// one of them must load client-extras.js right after supabase-client.js, otherwise it throws ReferenceError at runtime.
const extrasPath = path.join(ROOT, 'js/client-extras.js');
if (fs.existsSync(extrasPath)) {
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const extrasSrc = fs.readFileSync(extrasPath, 'utf8');
  const names = [...extrasSrc.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm), ...extrasSrc.matchAll(/^(?:const|let|var)\s+([\w$]+)\s*=/gm)].map((m) => m[1]);
  const re = names.map((n) => ({ n, re: new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '\\b') }));
  const jsText = new Map();
  for (const f of files.filter((x) => x.endsWith('.js') && rel(x).startsWith('js/'))) jsText.set(path.basename(f), stripComments(fs.readFileSync(f, 'utf8')));
  const jsBases = new Set([...jsText.keys()].map((k) => k.replace(/\.js$/, '')));
  // scripts a script pulls in at runtime: '/js/x.js' strings or loadXxxModule('name') calls
  const children = (name) => {
    const t = jsText.get(name) || '';
    const out = new Set();
    for (const m of t.matchAll(/['"`]\/js\/([\w.-]+\.js)/g)) out.add(m[1]);
    for (const m of t.matchAll(/\w*Module\(\s*['"]([\w-]+)['"]/g)) if (jsBases.has(m[1])) out.add(m[1] + '.js'); // e.g. loadFeedModule('feed-comments')
    return out;
  };
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    const srcs = [...html.matchAll(/src="\/js\/([\w.-]+\.js)/g)].map((m) => m[1]);
    if (!srcs.includes('supabase-client.js') || srcs.includes('client-extras.js')) continue;
    const seen = new Set(srcs);
    for (const q = [...srcs]; q.length;) for (const c of children(q.pop())) if (!seen.has(c) && jsText.has(c)) { seen.add(c); q.push(c); }
    seen.delete('supabase-client.js');
    const inline = stripComments(html.replace(/<script[^>]*src=[^>]*><\/script>/g, ''));
    const hit = new Set();
    for (const { n, re: r } of re) {
      if (r.test(inline)) hit.add(n);
      for (const j of seen) if (jsText.has(j) && r.test(jsText.get(j))) hit.add(n);
    }
    if (hit.size) fail(`${rel(f)}: uses ${[...hit].slice(0, 4).join(', ')} from js/client-extras.js but does not load it (add <script src="/js/client-extras.js"></script> after supabase-client.js)`);
  }
}

// Two scripts on the same page must not both declare the same top-level const/let/class (or a var/function that
// collides with one): the browser throws "Identifier 'X' has already been declared" and the whole later script never
// runs. This once took down feed reactions, menus and admin tools site-wide (BOUNTY_TIERS declared in both
// supabase-client.js and client-extras.js), so it is checked for every page's /js/ scripts, in load order.
{
  const declCache = new Map();
  const decls = (relPath) => {
    if (declCache.has(relPath)) return declCache.get(relPath);
    const p = path.join(ROOT, relPath);
    const out = [];
    if (fs.existsSync(p)) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/^(const|let|var|class|function\*?|async\s+function)\s+([A-Za-z_$][\w$]*)/gm)) {
        out.push([m[2], /^(const|let|class)$/.test(m[1]) ? 'lex' : 'var']);
      }
    }
    declCache.set(relPath, out);
    return out;
  };
  const reported = new Set();
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="(\/js\/[^"?#]+\.js)"/g)].map((m) => m[1].slice(1));
    const seen = new Map(); // name -> { file, kind }
    for (const s of srcs) {
      for (const [name, kind] of decls(s)) {
        const prev = seen.get(name);
        if (prev && prev.file !== s && (prev.kind === 'lex' || kind === 'lex')) {
          const key = `${name}|${prev.file}|${s}`;
          if (!reported.has(key)) {
            reported.add(key);
            fail(`${rel(f)}: "${name}" is declared by both ${prev.file} and ${s} (const/let/class clash -> "already been declared"; the later script never runs)`);
          }
        }
        if (!prev || kind === 'lex') seen.set(name, { file: s, kind });
      }
    }
  }
}

// Required files
for (const req of ['404.html', 'offline/index.html', 'sw.js', 'worker.js', 'wrangler.jsonc', '_headers']) {
  if (!fs.existsSync(path.join(ROOT, req))) fail(`missing required file ${req}`);
}

// JS syntax (node --check). Files are classic browser scripts; --check only parses.
const jsFiles = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { fail(`syntax error in ${rel(f)}: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ')}`); }
}

console.log(`checked ${htmlFiles.length} html, ${jsFiles.length} js, ${seenLinks.size} unique local links`);
warns.forEach((w) => console.log('warn:', w));
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  errors.slice(0, 60).forEach((e) => console.error(' -', e));
  if (errors.length > 60) console.error(` ... and ${errors.length - 60} more`);
  process.exit(1);
}
console.log('OK');
