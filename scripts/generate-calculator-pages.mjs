// Generates the evergreen calculator pages:
//   /blox-fruits-value-converter/             interactive "how many X equal Y" + a baked conversion chart
//   /blox-fruits-permanent-fruit-calculator/  physical vs permanent value table for every fruit
//
// Usage: node scripts/generate-calculator-pages.mjs <siteRoot> [local-items.json]
// Runs in .github/workflows/regenerate-value-pages.yml so the baked tables follow value changes
// (the converter itself always reads live values in the browser via js/calculators.js).

import fs from 'node:fs';
import path from 'node:path';
import { loadShell, renderPage, esc, slugify, formatValue, breadcrumbLd, breadcrumbHtml, ctaSectionHtml, adSlotTop, adSlotMiddle, adSlotBottom } from './lib/shell.mjs';

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';
const SITE_ROOT = process.argv[2] || '.';
const LOCAL_JSON = process.argv[3] || null;
const SITE = 'https://bloxcores.com';
const CHART_N = 6; // top N fruits in the conversion matrix

const VALUE_SLUG_ALIAS = { magnet: 'magnet-fruit' };
const valueSlug = n => VALUE_SLUG_ALIAS[slugify(n)] || slugify(n);

async function fetchItems() {
  if (LOCAL_JSON) return JSON.parse(fs.readFileSync(LOCAL_JSON, 'utf8'));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bf_items?category=eq.fruit&regular_value=not.is.null&select=id,name,category,rarity,regular_value,permanent_value,icon_url&order=regular_value.desc`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`fruit fetch failed: ${res.status}`);
  return res.json();
}

const write = (rel, html) => {
  const file = path.join(SITE_ROOT, rel, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
};
const wrap = inner => `<section class="section"><div class="container" style="max-width:820px; line-height:1.75; font-size:0.96rem;">${inner}</div></section>`;
const head = (crumbs, h1, sub) => `<section class="section" style="padding-bottom:0;"><div class="container" style="max-width:820px;">${breadcrumbHtml(crumbs)}<h1 style="font-size:1.8rem; line-height:1.15; margin:0;">${esc(h1)}</h1><p class="muted" style="margin:6px 0 0;">${esc(sub)}</p></div></section>`;
const faqLd = faq => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const faqHtml = faq => `<h2 style="font-size:1.3rem; margin-top:28px;">FAQ</h2><div class="faq-list">${faq.map(([q, a]) => `<details class="settings-accordion"><summary>${esc(q)}</summary><p class="muted" style="margin:0;">${esc(a)}</p></details>`).join('')}</div>`;
const ratio = (a, b) => { const r = a / b; return r >= 100 ? Math.round(r).toLocaleString('en-US') : r >= 10 ? r.toFixed(1).replace(/\.0$/, '') : r.toFixed(2).replace(/0$/, '').replace(/\.$/, ''); };
const nameLink = f => `<a href="/blox-fruits-values/${valueSlug(f.name)}/">${esc(f.name)}</a>`;

function converterPage(shell, fruits) {
  const url = `${SITE}/blox-fruits-value-converter/`;
  const top = fruits.slice(0, CHART_N);
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Value Converter', url }];
  const faq = [
    ['How do I convert one Blox Fruit into another?', 'Divide the total value of what you have by the value of the fruit you want. If 3 Kitsune are worth 150M and one Dragon is worth 50M, the three Kitsune cover three Dragons. This converter does that maths for any two items using the current value list.'],
    ['Are these exact trade rates?', 'No — they are community value estimates. Demand and trend matter too, so a fruit in high demand can be worth more than its number suggests. Use the converter to get a starting point, then check demand on each fruit\'s value page.'],
    ['Can I convert a permanent fruit into physical fruits?', 'Yes. Pick Permanent as the type on either side. Permanent and physical copies carry separate values, so the converter keeps them apart.'],
  ];
  const matrix = `<div class="panel" style="overflow-x:auto;"><table class="codes-table"><thead><tr><th>1 of ↓ equals → of</th>${top.map(f => `<th>${esc(f.name)}</th>`).join('')}</tr></thead><tbody>${
    top.map(r => `<tr><td>${nameLink(r)}</td>${top.map(c => r.id === c.id ? '<td class="muted">—</td>' : `<td>${ratio(r.regular_value, c.regular_value)}×</td>`).join('')}</tr>`).join('')
  }</tbody></table></div><p class="muted" style="font-size:0.8rem;">Physical values. Read across: one Dragon (row) is worth that many of the column fruit.</p>`;
  const body = `${head(crumbs, 'Blox Fruits Value Converter', 'Find out how many of one fruit equal another, using live community values.')}
${wrap(`${adSlotTop()}
<div class="panel" id="conv-app" style="padding:18px;">
  <div class="conv-grid">
    <div class="conv-side">
      <p class="conv-label">You have</p>
      <div style="display:flex; gap:8px;">
        <input type="number" id="conv-qty" min="1" max="9999" value="1" aria-label="Quantity" style="width:84px;">
        <select id="conv-from" aria-label="Item you have" style="flex:1; min-width:0;"></select>
      </div>
      <select id="conv-from-type" aria-label="Value type you have" style="margin-top:8px;"><option value="physical">Physical value</option><option value="permanent">Permanent value</option></select>
    </div>
    <button type="button" class="btn btn-ghost" id="conv-swap" aria-label="Swap" title="Swap" style="align-self:center;">⇄</button>
    <div class="conv-side">
      <p class="conv-label">You want</p>
      <select id="conv-to" aria-label="Item you want"></select>
      <select id="conv-to-type" aria-label="Value type you want" style="margin-top:8px;"><option value="physical">Physical value</option><option value="permanent">Permanent value</option></select>
    </div>
  </div>
  <div id="conv-out" class="conv-out" aria-live="polite"><p class="muted" style="margin:0;">Loading values…</p></div>
  <p style="margin:12px 0 0;"><a href="/trading/?tab=calculator" id="conv-link" class="btn btn-ghost btn-sm">Check this as a full trade →</a></p>
</div>
<noscript><p class="muted">The converter needs JavaScript. The chart below works without it.</p></noscript>
${adSlotMiddle()}
<h2 style="font-size:1.3rem; margin-top:32px;">Quick conversion chart — top ${top.length} fruits</h2>
<p>How many of each top fruit equal one of another, at current physical value. For anything else, use the converter above or the <a href="/trading/?tab=calculator">trade calculator</a>.</p>
${matrix}
<h2 style="font-size:1.3rem; margin-top:28px;">Using values wisely</h2>
<p>Values are a starting point, not a guarantee. Two fruits with the same number can trade differently depending on demand and trend — check each fruit's page, and read the <a href="/blox-fruits-trading-guide/">trading guide</a> before a big swap. Compare any two fruits side by side in the <a href="/blox-fruits-compare/">comparison tool</a>, or see the <a href="/blox-fruits-tier-list/">tier list</a>.</p>
${faqHtml(faq)}`)}
${ctaSectionHtml({ heading: 'Track what you own', body: 'Create a free BloxCore account to keep a private inventory and watch your net worth change as values move.' })}
${adSlotBottom()}`;
  write('blox-fruits-value-converter', renderPage(shell, {
    title: 'Blox Fruits Value Converter — How Many of One Fruit Equal Another | BloxCore',
    description: 'Free Blox Fruits value converter: see how many of one fruit equal another using current physical and permanent values, plus a quick conversion chart for the top fruits.',
    url, ld: [faqLd(faq), breadcrumbLd(crumbs)], body,
    extraScripts: ['/js/build-options.js', '/js/listings.js', '/js/calculators.js'],
  }));
  return url;
}

function permanentPage(shell, fruits) {
  const url = `${SITE}/blox-fruits-permanent-fruit-calculator/`;
  const rows = fruits.filter(f => f.permanent_value).sort((a, b) => b.permanent_value - a.permanent_value);
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Permanent Fruit Calculator', url }];
  const faq = [
    ['What is the difference between physical and permanent value?', 'Permanent fruits are listed with their own, separate value from physical copies, and it is usually much higher. Always confirm which one a trade is using — mixing them up is the easiest way to get a bad deal.'],
    ['How many physical fruits equal one permanent fruit?', 'Divide the permanent value by the physical value — the last column does this for every fruit using current values. Permanent and physical values are on very different scales, so the multiplier is large.'],
    ['Why do the numbers change?', 'Values are community estimates that move with demand, so this table is rebuilt whenever the value list updates.'],
  ];
  const body = `${head(crumbs, 'Blox Fruits Permanent Fruit Calculator', `Physical vs permanent value for ${rows.length} fruits and the multiplier between them.`)}
${wrap(`${adSlotTop()}
<p>Permanent fruits carry a separate, usually much higher value than the physical copy. This table shows both for every fruit that has a permanent value, and the multiplier between them.</p>
<div class="panel" style="overflow-x:auto;"><table class="codes-table"><thead><tr><th>Fruit</th><th>Physical</th><th>Permanent</th><th>Permanent ÷ physical</th></tr></thead><tbody>${
  rows.map(f => `<tr><td>${nameLink(f)}</td><td>${formatValue(f.regular_value)}</td><td>${formatValue(f.permanent_value)}</td><td>${ratio(f.permanent_value, f.regular_value)}×</td></tr>`).join('')
}</tbody></table></div>
<p class="muted" style="font-size:0.8rem;">Sorted by permanent value. Community estimates — check demand and trend on each fruit's page before trading.</p>
${adSlotMiddle()}
<h2 style="font-size:1.3rem; margin-top:28px;">Convert any two items</h2>
<p>Need a different pair — or a permanent fruit against physical ones? Use the <a href="/blox-fruits-value-converter/">value converter</a>, run a full deal through the <a href="/trading/?tab=calculator">trade calculator</a>, or see where each fruit ranks on the <a href="/blox-fruits-tier-list/">tier list</a>.</p>
${faqHtml(faq)}`)}
${ctaSectionHtml({ heading: 'Keep track of your fruits', body: 'Create a free BloxCore account to log your inventory and watch your net worth over time.' })}
${adSlotBottom()}`;
  write('blox-fruits-permanent-fruit-calculator', renderPage(shell, {
    title: 'Blox Fruits Permanent Fruit Calculator — Physical vs Permanent Value | BloxCore',
    description: `Physical vs permanent value for ${rows.length} Blox Fruits and the multiplier between them. Updated with the value list.`,
    url, ld: [faqLd(faq), breadcrumbLd(crumbs)], body,
  }));
  return url;
}

// The catalog can hold both "Magnet" and "Magnet Fruit" — skip the "<Name> Fruit" twin so it isn't listed twice.
const all = (await fetchItems()).filter(f => f.category === 'fruit' && f.regular_value);
const names = new Set(all.map(f => f.name.toLowerCase()));
const fruits = all.filter(f => !(f.name.toLowerCase().endsWith(' fruit') && names.has(f.name.toLowerCase().slice(0, -6)))).sort((a, b) => b.regular_value - a.regular_value);
if (fruits.length < CHART_N) throw new Error(`Only ${fruits.length} fruits fetched — refusing to write thin pages.`);
const shell = loadShell(SITE_ROOT);
console.log('Wrote', converterPage(shell, fruits), 'and', permanentPage(shell, fruits));
