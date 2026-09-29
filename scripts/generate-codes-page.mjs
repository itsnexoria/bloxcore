// Generates /blox-fruits-codes/ — a high-search-volume SEO page listing current Blox Fruits
// redeem codes. Data isn't pulled from a live source automatically (the game's codes aren't
// something Supabase tracks); re-run this after manually updating the CODES array below with
// a fresh check (codes expire and new ones are rare — a monthly glance is plenty).
//
// Usage: node scripts/generate-codes-page.mjs <siteRoot>

import fs from 'node:fs';
import path from 'node:path';
import { loadShell, renderPage, esc, breadcrumbLd, breadcrumbHtml } from './lib/shell.mjs';

const SITE_ROOT = process.argv[2] || '.';
const SITE = 'https://bloxcores.com';
const LAST_CHECKED = 'September 27, 2026'; // update this alongside CODES

// Update this list when you refresh the page — reward text should match what redeeming it
// actually gives right now. Source-check the official Blox Fruits Discord/Trello when unsure.
const CODES = [
  ['EASTEREXP', '2x EXP for 20 minutes'],
  ['KITT_RESET', 'Free stat reset'],
  ['SUB2CAPTAINMAUI', '2x EXP for 20 minutes'],
  ['Enyu_is_Pro', '2x EXP for 20 minutes'],
  ['Starcodeheo', '2x EXP for 20 minutes'],
  ['Sub2Fer999', '2x EXP for 20 minutes'],
  ['Magicbus', '2x EXP for 20 minutes'],
  ['JCWK', '2x EXP for 20 minutes'],
  ['kittgaming', '2x EXP for 20 minutes'],
  ['Bluxxy', '2x EXP for 20 minutes'],
  ['SUB2GAMERROBOT_EXP1', '2x EXP for 30 minutes'],
  ['SUB2GAMERROBOT_RESET1', 'Free stat reset'],
  ['Sub2UncleKizaru', 'Free stat reset'],
  ['Axiore', '2x EXP for 20 minutes'],
  ['Sub2Daigrock', '2x EXP for 20 minutes'],
  ['Bignews', 'In-game title "Big News" (redeem with the Title Specialist NPC, Second Sea)'],
  ['Sub2NoobMaster123', '2x EXP for 20 minutes'],
  ['StrawHatMaine', '2x EXP for 20 minutes'],
  ['TantaiGaming', '2x EXP for 20 minutes'],
  ['TheGreatAce', '2x EXP for 20 minutes'],
  ['Sub2OfficialNoobie', '2x EXP for 20 minutes'],
];

const url = `${SITE}/blox-fruits-codes/`;
const title = 'Blox Fruits Codes (September 2026) — All Active Codes | BloxCore';
const description = `${CODES.length} active Blox Fruits codes for September 2026 — free 2x XP boosts, stat resets, and more. Checked ${LAST_CHECKED}.`;
const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Blox Fruits Codes', url }];

const rows = CODES.map(([code, reward]) => `
  <tr>
    <td><code class="codes-code">${esc(code)}</code></td>
    <td>${esc(reward)}</td>
    <td><button type="button" class="btn btn-ghost btn-sm codes-copy-btn" data-code="${esc(code)}">Copy</button></td>
  </tr>`).join('');

const faqData = [
  ['What do Blox Fruits codes give you?', 'Free 2x EXP boosts, stat resets, small Beli rewards, and occasionally an in-game title. Regular codes never give a free Devil Fruit — only official merchandise DLC codes do that.'],
  ['How do I redeem a code in Blox Fruits?', 'Open the game, click the Settings (gear) icon, choose "Redeem DLC Code," paste the code exactly as shown, and press Redeem.'],
  ['Why isn\u2019t my code working?', 'It\u2019s most likely expired — Blox Fruits codes are usually only active for a short window. Double-check for typos (codes are case-sensitive) and try pasting instead of typing it.'],
  ['Do 2x EXP codes stack?', 'The multiplier doesn\u2019t stack, but the durations add up — redeeming every active EXP code in a row can give you a few hours of 2x EXP in total.'],
];

const body = `${breadcrumbHtml(crumbs).replace('<nav', '<nav style="margin:0 0 14px;"')}
<section class="section" style="padding-bottom:0;">
  <div class="container" style="max-width:820px;">
    <h1 style="font-size:1.8rem; line-height:1.15; margin:0;">Blox Fruits Codes</h1>
    <p class="muted" style="margin:6px 0 0;">${CODES.length} active codes for free 2x EXP, stat resets, and more. Checked ${esc(LAST_CHECKED)}.</p>
  </div>
</section>
<section class="section">
  <div class="container" style="max-width:820px; line-height:1.75; font-size:0.96rem;">
    <div class="panel" style="overflow-x:auto;">
      <table class="codes-table">
        <thead><tr><th>Code</th><th>Reward</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted" style="font-size:0.8rem; margin-top:10px;">Codes expire without notice — if one shows "Code Invalid," it\u2019s no longer active. BloxCore isn\u2019t affiliated with Blox Fruits' developers; we just track codes here for convenience.</p>

    <h2 style="font-size:1.3rem; margin-top:32px;">How to redeem a code</h2>
    <ol style="padding-left:20px;">
      <li>Launch Blox Fruits in Roblox.</li>
      <li>Click the Settings (gear) icon on the left of the screen.</li>
      <li>Select "Redeem DLC Code."</li>
      <li>Paste the code into the Reward Codes box.</li>
      <li>Click Redeem to claim it.</li>
    </ol>

    <h2 style="font-size:1.3rem; margin-top:28px;">FAQ</h2>
    <div class="faq-list">
      ${faqData.map(([q, a]) => `<details class="settings-accordion"><summary>${esc(q)}</summary><p class="muted" style="margin:0;">${esc(a)}</p></details>`).join('\n')}
    </div>

    <h2 style="font-size:1.3rem; margin-top:28px;">While you're stocking up on freebies</h2>
    <p>Check the <a href="/blox-fruits-tier-list/">value tier list</a> to see what your fruits are worth, run a trade through the <a href="/trade-calculator/">trade calculator</a> before you commit, or head to <a href="/trading/">Trading</a> to post a listing.</p>
  </div>
</section>`;

const shell = loadShell(SITE_ROOT);
const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqData.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const html = renderPage(shell, { title, description, url, ld: [faqLd, breadcrumbLd(crumbs)], body, extraScripts: ['/js/codes-page.js'] });

const file = path.join(SITE_ROOT, 'blox-fruits-codes', 'index.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, html);
console.log(`Wrote ${file}`);
