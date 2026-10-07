// Generates the data-driven SEO/tool pages:
//   /trade-calculator/                     (interactive; items load client-side)
//   /blox-fruits-tier-list/                (fruits grouped into value tiers)
//   /blox-fruits-compare/                  (hub) + /blox-fruits-compare/<a>-vs-<b>/ for the top fruits
//   /blox-fruits-trading-guide/
//
// Usage: node scripts/generate-guide-pages.mjs <siteRoot> [local-items.json]
//
// These pages are plain static HTML — nothing re-runs this automatically on its own.
// .github/workflows/regenerate-value-pages.yml runs it on a schedule (and on manual
// dispatch) and pushes the result, which triggers a real Cloudflare redeploy; that's the
// "automatic" part. You can still run it by hand any time for an immediate refresh.

import fs from 'node:fs';
import path from 'node:path';
import { loadShell, renderPage, esc, slugify, formatValue, breadcrumbLd, breadcrumbHtml, ctaSectionHtml, adSlotTop, adSlotMiddle, adSlotBottom } from './lib/shell.mjs';

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';
const SITE_ROOT = process.argv[2] || '.';
const LOCAL_JSON = process.argv[3] || null;
const SITE = 'https://bloxcores.com';
const COMPARE_TOP_N = 12; // top fruits by value → N*(N-1)/2 comparison pages

// Tier cut-offs on regular (physical) value. Trading-value tiers, NOT combat strength.
const TIERS = [
  { key: 'S', min: 100_000_000, blurb: 'The most valuable fruits on the market.' },
  { key: 'A', min: 10_000_000, blurb: 'High-value fruits that hold serious trading power.' },
  { key: 'B', min: 2_000_000, blurb: 'Solid mid-to-high value fruits.' },
  { key: 'C', min: 500_000, blurb: 'Mid-range fruits — good trade fodder.' },
  { key: 'D', min: 0, blurb: 'Lower-value fruits that are easy to pick up.' },
];

const TREND_LABEL = { up: 'Trending up', overpaid: 'Overpaid', underpaid: 'Underpaid', unstable: 'Unstable', stable: 'Stable' };

const write = (rel, html) => {
  const file = path.join(SITE_ROOT, rel, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
};

const pageHead = (crumbs, h1, sub) => `
<section class="section" style="padding-bottom:0;">
  <div class="container" style="max-width:820px;">
    ${breadcrumbHtml(crumbs)}
    <h1 style="font-size:1.8rem; line-height:1.15; margin:0;">${esc(h1)}</h1>
    ${sub ? `<p class="muted" style="margin:6px 0 0;">${esc(sub)}</p>` : ''}
  </div>
</section>`;

const wrapSection = inner => `<section class="section"><div class="container" style="max-width:820px; line-height:1.75; font-size:0.96rem;">${inner}</div></section>`;

const chip = f => `<a href="/blox-fruits-values/${slugify(f.name)}/" class="tier-chip">${f.icon_url ? `<img src="${esc(f.icon_url)}" alt="" loading="lazy" width="34" height="34">` : ''}<span>${esc(f.name)}</span><small class="muted">${formatValue(f.regular_value)}</small></a>`;

// ---------------- Trade calculator ----------------
function calculatorPage(shell) {
  const url = `${SITE}/trade-calculator/`;
  const title = 'Blox Fruits Trade Calculator (2026) — Is Your Trade Fair? | BloxCore';
  const description = 'Free Blox Fruits trade calculator. Add the fruits, limiteds and gamepasses on each side and instantly see whether the trade is fair, using community values.';
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Trade Calculator', url }];
  const body = `${pageHead(crumbs, 'Blox Fruits Trade Calculator', 'Add items to each side and see whether the trade is fair, using community-estimated values.')}
<section class="section">
  <div class="container" style="max-width:960px;">
    <div class="calc-grid">
      <div class="panel calc-side">
        <h2>You give</h2>
        <input type="text" id="calc-give-search" placeholder="Search items to add…" autocomplete="off">
        <div id="calc-give-results" class="calc-results"></div>
        <div id="calc-give-list"></div>
        <p class="calc-total">Total: <strong id="calc-give-total">—</strong></p>
      </div>
      <div class="panel calc-side">
        <h2>You get</h2>
        <input type="text" id="calc-get-search" placeholder="Search items to add…" autocomplete="off">
        <div id="calc-get-results" class="calc-results"></div>
        <div id="calc-get-list"></div>
        <p class="calc-total">Total: <strong id="calc-get-total">—</strong></p>
      </div>
    </div>
    <div id="calc-verdict" class="panel calc-verdict"><p class="muted" style="margin:0;">Loading item values…</p></div>
    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:14px;">
      <button type="button" class="btn btn-ghost btn-sm" id="calc-swap"><i data-lucide="arrow-left-right" class="icon-sm icon-inline"></i>Swap sides</button>
      <button type="button" class="btn btn-ghost btn-sm" id="calc-share"><i data-lucide="link" class="icon-sm icon-inline"></i>Copy link</button>
      <button type="button" class="btn btn-ghost btn-sm" id="calc-copy-text"><i data-lucide="clipboard" class="icon-sm icon-inline"></i>Copy as Text</button>
      <button type="button" class="btn btn-ghost btn-sm" id="calc-clear">Clear</button>
    </div>
    <p class="muted" style="text-align:center; font-size:0.8rem; margin-top:18px;">Values are community estimates and only compare raw value — demand and trend aren't priced in. Within ±8% counts as roughly fair. BloxCore doesn't verify or guarantee any trade. See the <a href="/blox-fruits-trading-guide/">trading guide</a> and the <a href="/blox-fruits-tier-list/">value tier list</a>.</p>
  </div>
</section>
${ctaSectionHtml({ heading: 'Found a fair trade?', body: 'Create a free account to post it on the Trading board and get it in front of real traders.' })}`;
  write('trade-calculator', renderPage(shell, {
    title, description, url,
    ld: [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Blox Fruits Trade Calculator', url, applicationCategory: 'GameApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }, breadcrumbLd(crumbs)],
    body, extraScripts: ['/js/build-options.js', '/js/listings.js', '/js/trade-calculator.js'],
  }));
}

// ---------------- Tier list ----------------
function tierListPage(shell, fruits) {
  const url = `${SITE}/blox-fruits-tier-list/`;
  const title = 'Blox Fruits Value Tier List (2026) — Fruits Ranked by Trading Value | BloxCore';
  const description = `Blox Fruits value tier list: all ${fruits.length} fruits ranked S to D by current community trading value. This is a trading-value ranking, not a combat power ranking.`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Values', url: `${SITE}/blox-fruits-values/` }, { name: 'Tier List', url }];
  const byTier = TIERS.map((t, i) => ({ ...t, fruits: fruits.filter(f => f.regular_value >= t.min && (i === 0 || f.regular_value < TIERS[i - 1].min)) }));
  const rows = byTier.map(t => `
    <div class="tier-row">
      <div class="tier-label tier-${t.key.toLowerCase()}">${t.key}</div>
      <div class="tier-body">
        <p class="muted" style="margin:0 0 8px; font-size:0.82rem;">${t.blurb} ${t.min ? `${formatValue(t.min)}+ each.` : `Under ${formatValue(TIERS[TIERS.length - 2].min)} each.`}</p>
        <div class="tier-chips">${t.fruits.map(chip).join('')}</div>
      </div>
    </div>`).join('');
  const body = `${pageHead(crumbs, 'Blox Fruits Value Tier List', 'Every fruit ranked by current community trading value.')}
${wrapSection(`
    <p>This tier list ranks fruits by what they're worth on the trading market, not by how strong they are in a fight. Tiers are set by each fruit's physical trading value and update whenever the values do. Click any fruit for its full value page, or use the <a href="/trade-calculator/">trade calculator</a> to check a specific trade.</p>
    <p class="muted" style="font-size:0.85rem;">Also see the <a href="/blox-fruits-limited-tier-list/">limited</a> and <a href="/blox-fruits-gamepass-tier-list/">gamepass</a> tier lists.</p>
    ${adSlotTop()}
    ${rows}
    ${adSlotMiddle()}
    <h2 style="font-size:1.3rem; margin-top:28px;">How the tiers work</h2>
    <p>S tier starts at ${formatValue(TIERS[0].min)}, A at ${formatValue(TIERS[1].min)}, B at ${formatValue(TIERS[2].min)} and C at ${formatValue(TIERS[3].min)}; everything below that is D. Values come from the community and shift with demand, so check the live <a href="/trading/">Trading board</a> before agreeing to a trade. You can also <a href="/blox-fruits-compare/">compare any two top fruits</a> side by side.</p>`)}
${ctaSectionHtml({ heading: 'Know what your fruits are worth?', body: 'Create a free account to post trades, set price alerts, and track your own collection.' })}
${adSlotBottom()}`;
  write('blox-fruits-tier-list', renderPage(shell, { title, description, url, ld: [breadcrumbLd(crumbs)], body }));
}

// Limiteds and gamepasses have very different value ranges than fruits (a mid-tier limited is
// worth more than a top-tier fruit), so the fruit-calibrated TIERS thresholds above don't
// transfer. Bucket into 5 roughly-equal-sized groups by rank instead — scales to any category.
function quintileTiers(items) {
  const keys = ['S', 'A', 'B', 'C', 'D'];
  const n = items.length;
  const size = Math.ceil(n / 5);
  return keys.map((key, i) => {
    const slice = items.slice(i * size, Math.min(n, (i + 1) * size));
    return { key, min: slice.length ? slice[slice.length - 1].regular_value : 0, items: slice };
  }).filter(t => t.items.length);
}

function categoryTierListPage(shell, items, { urlSlug, title, description, pageTitle, pageSub, itemLabel }) {
  const url = `${SITE}/${urlSlug}/`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Values', url: `${SITE}/blox-fruits-values/` }, { name: pageTitle, url }];
  const tiers = quintileTiers(items);
  const rows = tiers.map(t => `
    <div class="tier-row">
      <div class="tier-label tier-${t.key.toLowerCase()}">${t.key}</div>
      <div class="tier-body">
        <p class="muted" style="margin:0 0 8px; font-size:0.82rem;">${formatValue(t.min)}+ each.</p>
        <div class="tier-chips">${t.items.map(chip).join('')}</div>
      </div>
    </div>`).join('');
  const body = `${pageHead(crumbs, pageTitle, pageSub)}
${wrapSection(`
    <p>Ranked by current community trading value, split into five roughly equal tiers — not a measure of in-game usefulness. Click any ${itemLabel} for its full value page, or use the <a href="/trade-calculator/">trade calculator</a> to check a specific trade.</p>
    <p class="muted" style="font-size:0.85rem;">Also see the <a href="/blox-fruits-tier-list/">fruit</a>, <a href="/blox-fruits-limited-tier-list/">limited</a> and <a href="/blox-fruits-gamepass-tier-list/">gamepass</a> tier lists.</p>
    ${adSlotTop()}
    ${rows}
    ${adSlotMiddle()}
    <h2 style="font-size:1.3rem; margin-top:28px;">How the tiers work</h2>
    <p>Each tier holds about a fifth of all ${items.length} ${itemLabel}s with a known value, ranked highest to lowest — S is the top fifth, D the bottom. Values come from the community and shift with demand, so check the live <a href="/trading/">Trading board</a> before agreeing to a trade. You can also <a href="/blox-fruits-compare/">compare two items</a> side by side.</p>`)}
${ctaSectionHtml({ heading: 'Know what your items are worth?', body: 'Create a free account to post trades, set price alerts, and track your own collection.' })}
${adSlotBottom()}`;
  write(urlSlug, renderPage(shell, { title, description, url, ld: [breadcrumbLd(crumbs)], body }));
  return url;
}

// ---------------- Compare pages ----------------
function ratioCopy(a, b, av, bv, label) {
  if (!av || !bv) return '';
  const hi = av >= bv ? a : b, lo = av >= bv ? b : a;
  const r = Math.max(av, bv) / Math.min(av, bv);
  if (r < 1.1) return `By ${label} value, ${a.name} and ${b.name} are about equal.`;
  const each = r >= 1.5 ? ` — roughly ${Math.round(r)} ${lo.name}${Math.round(r) === 1 ? '' : 's'} for one ${hi.name}` : '';
  return `By ${label} value, ${hi.name} is worth about ${r >= 10 ? Math.round(r) : r.toFixed(1)}× ${lo.name}${each}.`;
}

function comparePage(shell, a, b, opts = {}) {
  const prefix = opts.urlPrefix || ''; // 'limited-' / 'gamepass-' — keeps every category's slugs collision-proof
  const slug = `${prefix}${slugify(a.name)}-vs-${slugify(b.name)}`;
  const url = `${SITE}/blox-fruits-compare/${slug}/`;
  const tied = a.regular_value === b.regular_value;
  const winner = tied ? null : (a.regular_value > b.regular_value ? a : b);
  const title = `${a.name} vs ${b.name} Value in Blox Fruits (2026) — Which Is Worth More? | BloxCore`;
  const description = `${a.name} (${formatValue(a.regular_value)}) vs ${b.name} (${formatValue(b.regular_value)}) in Blox Fruits: compare physical and permanent value, demand and trend. ${tied ? "They're worth the same." : `${winner.name} is worth more.`}`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Compare', url: `${SITE}/blox-fruits-compare/` }, { name: `${a.name} vs ${b.name}`, url }];
  const cell = (f, k) => k === 'reg' ? formatValue(f.regular_value) : k === 'perm' ? formatValue(f.permanent_value) : k === 'rar' ? esc(f.rarity || '—') : k === 'dem' ? (f.demand != null ? `${f.demand}/10` : '—') : esc(TREND_LABEL[f.trend] || '—');
  const rowsDef = [['Physical value', 'reg'], ['Permanent value', 'perm'], ['Rarity', 'rar'], ['Demand', 'dem'], ['Trend', 'trend']];
  const icon = f => f.icon_url ? `<img src="${esc(f.icon_url)}" alt="${esc(f.name)}" width="56" height="56" style="object-fit:contain;">` : '';
  const answer = tied
    ? `${a.name} and ${b.name} are worth the same by physical value (${formatValue(a.regular_value)}).`
    : `${winner.name} is worth more by physical value (${formatValue(winner.regular_value)} vs ${formatValue(winner === a ? b.regular_value : a.regular_value)}).`;
  const body = `${pageHead(crumbs, `${a.name} vs ${b.name} Value`, 'Physical and permanent value, demand and trend side by side.')}
${wrapSection(`
    ${adSlotTop()}
    <div class="panel" style="overflow-x:auto;">
      <table class="compare-table">
        <thead><tr><th></th><th><a href="/blox-fruits-values/${slugify(a.name)}/">${icon(a)}<br>${esc(a.name)}</a></th><th><a href="/blox-fruits-values/${slugify(b.name)}/">${icon(b)}<br>${esc(b.name)}</a></th></tr></thead>
        <tbody>${rowsDef.map(([label, k]) => `<tr><th scope="row">${label}</th><td>${cell(a, k)}</td><td>${cell(b, k)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${adSlotMiddle()}
    <h2 style="font-size:1.3rem;">Which is worth more, ${esc(a.name)} or ${esc(b.name)}?</h2>
    <p>${esc(answer)} ${esc(ratioCopy(a, b, a.regular_value, b.regular_value, 'physical'))} ${esc(ratioCopy(a, b, a.permanent_value, b.permanent_value, 'permanent'))}</p>
    <p>Values are community estimates and don't include demand, so check the current going rate on the <a href="/trading/">Trading board</a> before you trade. Want to test a specific offer? <a href="/trade-calculator/?give=${encodeURIComponent(a.name)}&amp;get=${encodeURIComponent(b.name)}">Open ${esc(a.name)} for ${esc(b.name)} in the trade calculator</a>.</p>
    <p><a href="/blox-fruits-tier-list/">See the full value tier list</a> · <a href="/blox-fruits-compare/">More comparisons</a></p>`)}
${ctaSectionHtml({ heading: `Trading one for the other?`, body: 'Create a free account to run it past other traders on the Trading board first.' })}
${adSlotBottom()}`;
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `Which is worth more, ${a.name} or ${b.name} in Blox Fruits?`, acceptedAnswer: { '@type': 'Answer', text: answer } }] };
  write(`blox-fruits-compare/${slug}`, renderPage(shell, { title, description, url, image: (winner || a).icon_url, ld: [faq, breadcrumbLd(crumbs)], body }));
  return url;
}

function categorySectionHtml(sectionLabel, top, urlPrefix) {
  const lists = top.map(f => `<div><p style="font-weight:700; margin:0 0 6px;">${esc(f.name)}</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:4px;">${
    top.filter(o => o !== f).map(o => {
      const [x, y] = top.indexOf(f) < top.indexOf(o) ? [f, o] : [o, f];
      return `<li><a href="/blox-fruits-compare/${urlPrefix}${slugify(x.name)}-vs-${slugify(y.name)}/" class="muted" style="font-size:0.85rem;">${esc(f.name)} vs ${esc(o.name)}</a></li>`;
    }).join('')}</ul></div>`).join('');
  return `<h2 style="font-size:1.2rem; margin:28px 0 12px;">${esc(sectionLabel)}</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:22px;">${lists}</div>`;
}

// sections: [{ label, items, urlPrefix }, ...] — one grid per category (fruits/limiteds/gamepasses)
function compareHub(shell, sections) {
  const url = `${SITE}/blox-fruits-compare/`;
  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  const title = 'Compare Blox Fruits Values (2026) — Fruits, Limiteds & Gamepasses | BloxCore';
  const description = `Compare the value of the top ${totalItems} Blox Fruits items side by side — fruits, limiteds and gamepasses, with physical/permanent value, demand and trend.`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Compare', url }];
  const sectionsHtml = sections.map(s => categorySectionHtml(s.label, s.items, s.urlPrefix)).join('\n');
  const body = `${pageHead(crumbs, 'Compare Blox Fruits Values', `Head-to-head value comparisons for the top items in each category.`)}
${wrapSection(`<p>Pick any two of the most valuable items to see which is worth more. For anything else, the <a href="/trade-calculator/">trade calculator</a> handles any combination of items, and the <a href="/blox-fruits-tier-list/">tier list</a> ranks every fruit.</p>
    ${adSlotTop()}
    ${sectionsHtml}
    ${adSlotMiddle()}`)}
${ctaSectionHtml({ heading: 'Ready to trade?', body: 'Create a free account to post a listing and get real offers.' })}
${adSlotBottom()}`;
  write('blox-fruits-compare', renderPage(shell, { title, description, url, ld: [breadcrumbLd(crumbs)], body }));
  return url;
}

// ---------------- Trading guide ----------------
function guidePage(shell) {
  const url = `${SITE}/blox-fruits-trading-guide/`;
  const title = 'Blox Fruits Trading Guide (2026) — How to Trade Fairly & Stay Safe | BloxCore';
  const description = 'How to trade fruits fairly in Blox Fruits: reading values, demand and trend, physical vs permanent value, checking a trade with the calculator, and staying safe.';
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Trading Guide', url }];
  const qa = [
    ['How do I know if a Blox Fruits trade is fair?', 'Add both sides to the trade calculator and compare the totals. Within about 8% counts as roughly fair. Values are community estimates and don\'t include demand, so also check demand and trend on each item\'s value page.'],
    ['What is the difference between physical and permanent value?', 'Permanent fruits are listed with their own, separate value from physical fruits. Always check which one a trade is using — mixing them up is the easiest way to get a bad deal.'],
    ['Does BloxCore guarantee trades?', 'No. BloxCore doesn\'t verify or guarantee any trade. Listings are a way to find other players, so trade at your own risk.'],
  ];
  const body = `${pageHead(crumbs, 'Blox Fruits Trading Guide', 'Trade fairly, read the numbers, and stay safe.')}
${wrapSection(`
    ${adSlotTop()}
    <h2 style="font-size:1.3rem;">1. Start from the value, then adjust</h2>
    <p>Every fruit, limited item and gamepass has a community-estimated value on its <a href="/blox-fruits-values/">value page</a>. Treat it as a starting point: the <a href="/blox-fruits-tier-list/">tier list</a> shows where a fruit sits overall, and the <a href="/blox-fruits-compare/">compare pages</a> show how two top fruits stack up.</p>
    <h2 style="font-size:1.3rem;">2. Read demand and trend</h2>
    <p>Demand is scored out of 10 — the higher it is, the easier the item should be to trade. Trend tells you which way the price is moving: <em>trending up</em> items are worth more than they were, <em>overpaid</em> items are trading above what most players consider fair and may cool off, <em>underpaid</em> items are trading below it, and <em>unstable</em> items have volatile pricing, so double-check the going rate.</p>
    <h2 style="font-size:1.3rem;">3. Check physical vs permanent</h2>
    <p>Permanent fruits carry a separate, usually much higher value than the physical copy. Make sure both players mean the same one before you agree.</p>
    ${adSlotMiddle()}
    <h2 style="font-size:1.3rem;">4. Run the numbers</h2>
    <p>Put both sides into the <a href="/trade-calculator/">trade calculator</a>. If one side is more than about 8% ahead, ask yourself what the other side is getting — extra demand, or just a better deal.</p>
    <h2 style="font-size:1.3rem;">5. Stay safe</h2>
    <p>Never share your account password or login details with anyone. Check a player's profile and vouches before trading, and remember BloxCore doesn't verify or guarantee any trade. Trade listings on BloxCore automatically disappear after 24 hours, so old listings can be stale — confirm the offer is still on.</p>
    <h2 style="font-size:1.3rem;">Ready to trade?</h2>
    <p><a href="/trading/">Browse live trade listings</a> or post your own.</p>`)}
${ctaSectionHtml({ heading: 'Put the guide into practice', body: 'Create a free account to post your first trade listing today.' })}
${adSlotBottom()}`;
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  write('blox-fruits-trading-guide', renderPage(shell, { title, description, url, ld: [faq, breadcrumbLd(crumbs)], body }));
}

async function fetchCategory(category) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bf_items?category=eq.${category}&regular_value=not.is.null&select=id,name,category,rarity,regular_value,permanent_value,icon_url,demand,trend&order=regular_value.desc`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed (${category}): ${res.status} ${await res.text()}`);
  return res.json();
}

function pairUpTo(items, n) {
  const top = items.slice(0, n);
  const pairs = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) pairs.push([top[i], top[j]]);
  return { top, pairs };
}

async function main() {
  const shell = loadShell(SITE_ROOT);
  let items;
  if (LOCAL_JSON) items = JSON.parse(fs.readFileSync(LOCAL_JSON, 'utf8'));
  else items = [...await fetchCategory('fruit'), ...await fetchCategory('limited'), ...await fetchCategory('gamepass')];

  const byCategory = cat => items.filter(i => i.category === cat && i.regular_value).sort((x, y) => y.regular_value - x.regular_value);
  const fruits = byCategory('fruit');
  const limiteds = byCategory('limited');
  const gamepasses = byCategory('gamepass');
  console.log(`${fruits.length} fruits, ${limiteds.length} limiteds, ${gamepasses.length} gamepasses with values.`);

  const urls = [];
  calculatorPage(shell); urls.push(`${SITE}/trade-calculator/`);
  guidePage(shell); urls.push(`${SITE}/blox-fruits-trading-guide/`);

  tierListPage(shell, fruits); urls.push(`${SITE}/blox-fruits-tier-list/`);
  urls.push(categoryTierListPage(shell, limiteds, {
    urlSlug: 'blox-fruits-limited-tier-list',
    title: 'Blox Fruits Limited Items Tier List (2026) — Skins & Limiteds Ranked | BloxCore',
    description: `Blox Fruits limited items ranked S to D by current community trading value — all ${limiteds.length} tracked skins and limiteds.`,
    pageTitle: 'Blox Fruits Limited Items Tier List',
    pageSub: 'Every tracked limited/skin ranked by current community trading value.',
    itemLabel: 'limited',
  }));
  urls.push(categoryTierListPage(shell, gamepasses, {
    urlSlug: 'blox-fruits-gamepass-tier-list',
    title: 'Blox Fruits Gamepasses Tier List (2026) — Ranked by Value | BloxCore',
    description: `Blox Fruits gamepasses ranked S to D by current community trading value — all ${gamepasses.length} tracked gamepasses.`,
    pageTitle: 'Blox Fruits Gamepasses Tier List',
    pageSub: 'Every tracked gamepass ranked by current community trading value.',
    itemLabel: 'gamepass',
  }));

  // Fruits keep their existing top-12/66-pair footprint untouched (same URLs as before).
  // Limiteds get top 10 (45 pairs); gamepasses are few enough (10) to compare all of them.
  const fruitSet = pairUpTo(fruits, COMPARE_TOP_N);
  const limitedSet = pairUpTo(limiteds, 10);
  const gamepassSet = pairUpTo(gamepasses, gamepasses.length);

  const pairUrls = [
    ...fruitSet.pairs.map(([a, b]) => comparePage(shell, a, b)),
    ...limitedSet.pairs.map(([a, b]) => comparePage(shell, a, b, { urlPrefix: 'limited-' })),
    ...gamepassSet.pairs.map(([a, b]) => comparePage(shell, a, b, { urlPrefix: 'gamepass-' })),
  ];
  urls.push(compareHub(shell, [
    { label: 'Fruits', items: fruitSet.top, urlPrefix: '' },
    { label: 'Limiteds', items: limitedSet.top, urlPrefix: 'limited-' },
    { label: 'Gamepasses', items: gamepassSet.top, urlPrefix: 'gamepass-' },
  ]), ...pairUrls);

  fs.writeFileSync(path.join(SITE_ROOT, 'guide-page-sitemap-urls.txt'), urls.join('\n') + '\n');
  console.log(`Wrote ${urls.length} pages. URL list: guide-page-sitemap-urls.txt`);
}

main().catch(err => { console.error(err); process.exit(1); });
