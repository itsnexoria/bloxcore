// Adds <link rel="preload" as="font"> for the site's Google Fonts so text paints in the right face sooner
// (better LCP, less font-swap layout shift). Google serves versioned gstatic URLs I can't know ahead of time,
// so this script asks Google for the current CSS, picks the latin woff2 files and patches every page + the
// page generators' templates (idempotent: re-running replaces the old preload block).
//
//   node scripts/preload-fonts.mjs .          # fetch + patch
//   node scripts/preload-fonts.mjs . --dry    # just print what it would add
// Needs Node 18+ and network access to fonts.googleapis.com. Re-run if you change the font families.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const DRY = process.argv.includes('--dry');
const MARK_START = '<!-- font-preload:start -->';
const MARK_END = '<!-- font-preload:end -->';
const CSS_LINK = /<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"[^>]*>/;

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(html|mjs)$/.test(e.name)) yield p;
  }
}

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cssUrl = (index.match(CSS_LINK) || [])[1]?.replace(/&amp;/g, '&');
if (!cssUrl) { console.error('Could not find the Google Fonts <link> in index.html'); process.exit(1); }

// A modern UA makes Google return woff2 (and unicode-range blocks); we keep only the latin subset.
const css = await (await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' } })).text();
const blocks = css.split('@font-face').slice(1);
const urls = [];
for (const b of blocks) {
  const range = (b.match(/unicode-range:\s*([^;]+)/) || [])[1] || '';
  const url = (b.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/) || [])[1];
  if (url && (/U\+0000-00FF/.test(range) || !range)) urls.push(url); // latin block
}
const unique = [...new Set(urls)].slice(0, 4); // preload only the first few: too many preloads backfire
if (!unique.length) { console.error('No latin woff2 URLs found in the Google CSS.'); process.exit(1); }
const block = `${MARK_START}\n${unique.map(u => `<link rel="preload" as="font" type="font/woff2" href="${u}" crossorigin>`).join('\n')}\n${MARK_END}`;
console.log(`Will preload ${unique.length} font file(s):\n  ${unique.join('\n  ')}`);
if (DRY) process.exit(0);

let changed = 0;
for (const f of files(ROOT)) {
  const before = fs.readFileSync(f, 'utf8');
  if (!CSS_LINK.test(before)) continue;
  let after = before.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}\\n?`, 'g'), '');
  after = after.replace(CSS_LINK, (m) => `${block}\n${m}`);
  if (after !== before) { fs.writeFileSync(f, after); changed++; }
}
console.log(`Patched ${changed} file(s).`);
