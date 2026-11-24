// Stamps the build id into js/supabase-client.js so client errors are tagged with the deploy that produced them.
// Run it as the build command on the host (it only edits the build copy, nothing is committed):
//   Cloudflare Workers/Pages -> Build command:  node scripts/stamp-release.mjs
// The id is the commit SHA (7 chars) + date, e.g. "a1b2c3d-1110". Unstamped builds stay "dev".
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const file = 'js/supabase-client.js';
const sha = (process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_REF
  || (() => { try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })() || '').slice(0, 7);
const d = new Date();
const stamp = `${sha || 'nosha'}-${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const src = fs.readFileSync(file, 'utf8');
if (!/var BC_RELEASE = '[^']*';/.test(src)) { console.error(`stamp-release: no BC_RELEASE line in ${file}`); process.exit(1); }
fs.writeFileSync(file, src.replace(/var BC_RELEASE = '[^']*';/, `var BC_RELEASE = '${stamp}';`));
console.log(`stamped release ${stamp}`);
