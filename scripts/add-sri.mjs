// Adds Subresource Integrity (integrity + crossorigin) to every pinned third-party <script> in the site's HTML
// and in the page generators' templates, so a compromised CDN can't swap the file under you.
//
//   node scripts/add-sri.mjs .            # fetch each unique CDN URL, hash it, patch all files (idempotent)
//   node scripts/add-sri.mjs . --check    # CI-style: fetch + verify every tag's hash, exit 1 on mismatch/missing
//
// Hashes are computed from the live bytes of the EXACT URLs the pages use (unpkg redirects bare versions to
// the real file; browsers verify the final response). Re-run after bumping a pinned version. Needs Node 18+.
// Only hosts on the allowlist below are touched; versions MUST be pinned (no @latest) or the script refuses.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const CHECK = process.argv.includes('--check');
const HOSTS = ['https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/', 'https://cdnjs.cloudflare.com/'];
const TAG = /<script\b([^>]*?)\bsrc="(https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm|cdnjs\.cloudflare\.com)\/[^"]+)"([^>]*)>\s*<\/script>/g;

export function patchHtml(html, sriByUrl) {
  return html.replace(TAG, (full, pre, url, post) => {
    const sri = sriByUrl[url];
    if (!sri) return full;
    const attrs = `${pre}${post}`.replace(/\s*\bintegrity="[^"]*"/g, '').replace(/\s*\bcrossorigin(="[^"]*")?/g, '');
    return `<script${attrs.replace(/\s+$/, '')} src="${url}" integrity="${sri}" crossorigin="anonymous"></script>`;
  });
}

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(html|mjs)$/.test(e.name)) yield p;
  }
}

async function hashOf(url) {
  if (/@(latest|next)\b|\/npm\/[^@/]+\/|unpkg\.com\/[^@/]+\//.test(url) && !/@\d/.test(url)) throw new Error(`Refusing unpinned URL: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return 'sha384-' + crypto.createHash('sha384').update(Buffer.from(await res.arrayBuffer())).digest('base64');
}

const all = [...files(ROOT)];
const urls = new Set();
for (const f of all) for (const m of fs.readFileSync(f, 'utf8').matchAll(TAG)) urls.add(m[2]);
console.log(`Found ${urls.size} pinned CDN script URL(s):\n  ${[...urls].join('\n  ')}`);

const sri = {};
for (const u of urls) sri[u] = await hashOf(u);

if (CHECK) {
  let bad = 0;
  for (const f of all) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(TAG)) {
      const tag = m[0];
      if (!tag.includes(`integrity="${sri[m[2]]}"`)) { bad++; console.log(`${path.relative(ROOT, f)}: wrong/missing integrity for ${m[2]}`); }
    }
  }
  console.log(bad ? `\n${bad} tag(s) need fixing — run without --check.` : 'OK — every CDN script has the correct integrity hash.');
  process.exit(bad ? 1 : 0);
}

let changed = 0;
for (const f of all) {
  const before = fs.readFileSync(f, 'utf8');
  const after = patchHtml(before, sri);
  if (after !== before) { fs.writeFileSync(f, after); changed++; }
}
fs.writeFileSync(path.join(ROOT, 'scripts', 'sri.json'), JSON.stringify(sri, null, 2) + '\n');
console.log(`Patched ${changed} file(s). Hashes saved to scripts/sri.json.`);
