// Rebuilds sitemap.xml + sitemap.txt with <lastmod>. Keeps each URL's existing changefreq/priority,
// adds any URLs listed in item-page-sitemap-urls.txt / guide-page-sitemap-urls.txt, and skips pages
// that are missing, noindex or meta-refresh redirects. lastmod = last git commit date of the page
// (falls back to file mtime when git history isn't available). Run: node scripts/generate-sitemap.mjs .
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2] || '.';
const ORIGIN = 'https://bloxcores.com';
const read = f => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');

const meta = new Map(); // path -> { changefreq, priority }
for (const m of read('sitemap.xml').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1];
  if (!loc) continue;
  meta.set(loc.replace(ORIGIN, ''), {
    changefreq: /<changefreq>([^<]+)/.exec(m[1])?.[1] || 'weekly',
    priority: /<priority>([^<]+)/.exec(m[1])?.[1] || '0.6',
  });
}
for (const f of ['item-page-sitemap-urls.txt', 'guide-page-sitemap-urls.txt']) {
  for (const line of read(f).split('\n')) {
    const p = line.trim().replace(ORIGIN, '');
    if (p && !meta.has(p)) meta.set(p, { changefreq: 'weekly', priority: p.includes('/blox-fruits-values/') ? '0.7' : '0.6' });
  }
}

function fileFor(p) { return path.join(ROOT, p === '/' ? 'index.html' : p.replace(/^\/|\/$/g, '') + '/index.html'); }
function lastmod(file) {
  try {
    // regenerated-but-not-yet-committed pages (the CI run) count as modified today
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (dirty) return new Date().toISOString().slice(0, 10);
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (d) return d;
  } catch { /* no git */ }
  return fs.statSync(file).mtime.toISOString().slice(0, 10);
}

const rows = [];
for (const [p, { changefreq, priority }] of [...meta.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const file = fileFor(p);
  if (!fs.existsSync(file)) { console.warn('skip (missing):', p); continue; }
  const html = fs.readFileSync(file, 'utf8');
  if (/noindex/.test(html) || /http-equiv="refresh"/i.test(html)) { console.warn('skip (noindex/redirect):', p); continue; }
  rows.push({ p, changefreq, priority, lastmod: lastmod(file) });
}
rows.sort((a, b) => parseFloat(b.priority) - parseFloat(a.priority) || a.p.localeCompare(b.p));

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  rows.map(r => `  <url>\n    <loc>${ORIGIN}${r.p}</loc>\n    <lastmod>${r.lastmod}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`).join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
fs.writeFileSync(path.join(ROOT, 'sitemap.txt'), rows.map(r => ORIGIN + r.p).join('\n') + '\n');
console.log(`Wrote ${rows.length} URLs to sitemap.xml / sitemap.txt`);
