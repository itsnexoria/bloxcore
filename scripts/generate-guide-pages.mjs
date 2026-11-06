// Generates the data-driven SEO/tool pages:
//   (the trade calculator is a tab on the hand-written /trading/ page now, so it is no longer generated here)
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
import { statCard, cap, TREND_META, rarityChip, trendChip, demandLabel, demandMeter, iconImg, fmtRatio, versusBar, faqAccordion, faqLd as buildFaqLd, crumbsHtml } from './lib/seo-ui.mjs';

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

// Item pages are generated under /blox-fruits-values/<slug>/ from the items table, where the fruit is "Magnet Fruit" —
// compare data calls it "Magnet", so alias it for value-page links only (compare slugs stay as-is).
const VALUE_SLUG_ALIAS = { magnet: 'magnet-fruit' };
const valueSlug = n => VALUE_SLUG_ALIAS[slugify(n)] || slugify(n);
const chip = f => `<a href="/blox-fruits-values/${valueSlug(f.name)}/" class="tier-chip">${f.icon_url ? `<img src="${esc(f.icon_url)}" alt="" loading="lazy" width="34" height="34">` : ''}<span>${esc(f.name)}</span><small class="muted">${formatValue(f.regular_value)}</small></a>`;

// Data strip shown above the tier rows: how many are ranked, the top value, the median, and how many are in high demand.
function summaryStrip(items, label) {
  if (!items.length) return '';
  const top = items[0], med = items[Math.floor(items.length / 2)];
  const hot = items.filter(i => i.demand != null && i.demand >= 8).length;
  const rising = items.filter(i => i.trend === 'up' || i.trend === 'underpaid').length;
  return `<div class="seo-stats">${[
    statCard({ label: `${label} ranked`, value: items.length, sub: 'with a known value' }),
    statCard({ label: 'Top value', value: formatValue(top.regular_value), sub: `<a href="/blox-fruits-values/${valueSlug(top.name)}/">${esc(top.name)}</a>`, tone: 'is-primary' }),
    statCard({ label: 'Median value', value: formatValue(med.regular_value), sub: esc(med.name) }),
    statCard({ label: 'High demand', value: hot, sub: `${hot === 1 ? 'item' : 'items'} at 8/10 or more${rising ? ` · ${rising} rising or underpaid` : ''}` }),
  ].join('')}</div>`;
}

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
    <p>This tier list ranks fruits by what they're worth on the trading market, not by how strong they are in a fight. Tiers are set by each fruit's physical trading value and update whenever the values do. Click any fruit for its full value page, or use the <a href="/trading/?tab=calculator">trade calculator</a> to check a specific trade.</p>
    <p class="muted" style="font-size:0.85rem;">Also see the <a href="/blox-fruits-limited-tier-list/">limited</a> and <a href="/blox-fruits-gamepass-tier-list/">gamepass</a> tier lists.</p>
    ${adSlotTop()}
    ${summaryStrip(fruits, 'Fruits')}
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
    <p>Ranked by current community trading value, split into five roughly equal tiers — not a measure of in-game usefulness. Click any ${itemLabel} for its full value page, or use the <a href="/trading/?tab=calculator">trade calculator</a> to check a specific trade.</p>
    <p class="muted" style="font-size:0.85rem;">Also see the <a href="/blox-fruits-tier-list/">fruit</a>, <a href="/blox-fruits-limited-tier-list/">limited</a> and <a href="/blox-fruits-gamepass-tier-list/">gamepass</a> tier lists.</p>
    ${adSlotTop()}
    ${summaryStrip(items, cap(itemLabel) + 's')}
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

// Compare URLs must not flip when two items swap places in the value ranking (control-vs-venom would
// become venom-vs-control, orphaning the indexed page). If a page already exists for the pair in either
// order, keep that order; only brand-new pairs use the value order.
function pairSlug(prefix, x, y) {
  const s1 = `${prefix}${slugify(x.name)}-vs-${slugify(y.name)}`;
  const s2 = `${prefix}${slugify(y.name)}-vs-${slugify(x.name)}`;
  const has = sl => fs.existsSync(path.join(SITE_ROOT, 'blox-fruits-compare', sl));
  return !has(s1) && has(s2) ? s2 : s1;
}

function comparePage(shell, a, b, opts = {}) {
  const prefix = opts.urlPrefix || ''; // 'limited-' / 'gamepass-' — keeps every category's slugs collision-proof
  const { rankOf = new Map(), total = 0, pairIndex = new Map() } = opts;
  const slug = pairSlug(prefix, a, b);
  if (slug !== `${prefix}${slugify(a.name)}-vs-${slugify(b.name)}`) [a, b] = [b, a]; // keep the title in step with the existing URL
  const url = `${SITE}/blox-fruits-compare/${slug}/`;
  const fmt = formatValue;
  const tied = a.regular_value === b.regular_value;
  const winner = tied ? null : (a.regular_value > b.regular_value ? a : b);
  const loser = winner ? (winner === a ? b : a) : null;
  const ratio = winner ? winner.regular_value / loser.regular_value : 1;
  const diff = winner ? winner.regular_value - loser.regular_value : 0;
  const title = `${a.name} vs ${b.name} Value in Blox Fruits (2026) — Which Is Worth More? | BloxCore`;
  const description = `${a.name} (${fmt(a.regular_value)}) vs ${b.name} (${fmt(b.regular_value)}) in Blox Fruits: compare physical and permanent value, demand and trend. ${tied ? "They're worth the same." : `${winner.name} is worth more.`}`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Compare', url: `${SITE}/blox-fruits-compare/` }, { name: `${a.name} vs ${b.name}`, url }];
  const vHref = f => `/blox-fruits-values/${valueSlug(f.name)}/`;
  const answer = tied
    ? `${a.name} and ${b.name} are worth the same by physical value (${fmt(a.regular_value)}).`
    : `${winner.name} is worth more by physical value (${fmt(winner.regular_value)} vs ${fmt(loser.regular_value)}).`;
  const premium = f => (f.permanent_value && f.regular_value ? f.permanent_value / f.regular_value : null);

  // --- versus header ---
  const side = f => `<a class="seo-vs-side${winner === f ? ' is-win' : ''}" href="${vHref(f)}">${winner === f ? '<span class="seo-crown">Worth more</span>' : ''}${iconImg(f, 72)}<strong>${esc(f.name)}</strong><span class="seo-vs-val">${fmt(f.regular_value)}</span><span class="seo-chips">${rarityChip(f.rarity)}${rankOf.get(f.id) ? `<span class="seo-chip is-rank">#${rankOf.get(f.id)} of ${total}</span>` : ''}</span></a>`;

  // --- comparison table (the winning cell in each row is highlighted) ---
  const win = (av, bv, lowerBetter = false) => (av == null || bv == null || av === bv ? ['', ''] : ((av > bv) !== lowerBetter ? ['is-win', ''] : ['', 'is-win']));
  const rows = [];
  const addRow = (label, ca, cb, w = ['', '']) => rows.push(`<tr><th scope="row">${label}</th><td class="${w[0]}">${ca}</td><td class="${w[1]}">${cb}</td></tr>`);
  addRow('Physical value', `<b>${fmt(a.regular_value)}</b>`, `<b>${fmt(b.regular_value)}</b>`, win(a.regular_value, b.regular_value));
  if (a.permanent_value || b.permanent_value) addRow('Permanent value', fmt(a.permanent_value) || '—', fmt(b.permanent_value) || '—', win(a.permanent_value, b.permanent_value));
  if (premium(a) && premium(b)) addRow('Permanent premium', fmtRatio(premium(a)), fmtRatio(premium(b)));
  if (rankOf.get(a.id) && rankOf.get(b.id)) addRow('Value rank', `#${rankOf.get(a.id)} <small>of ${total}</small>`, `#${rankOf.get(b.id)} <small>of ${total}</small>`, win(rankOf.get(a.id), rankOf.get(b.id), true));
  addRow('Rarity', esc(a.rarity || '—'), esc(b.rarity || '—'));
  addRow('Demand', a.demand != null ? `${a.demand}/10 ${demandMeter(a.demand)}` : '—', b.demand != null ? `${b.demand}/10 ${demandMeter(b.demand)}` : '—', win(a.demand, b.demand));
  addRow('Trend', trendChip(a.trend) || '—', trendChip(b.trend) || '—');
  const icon = f => f.icon_url ? `<img src="${esc(f.icon_url)}" alt="${esc(f.name)}" width="48" height="48" style="object-fit:contain;">` : '';

  // --- verdict + trade math ---
  const eachN = ratio >= 1.5 ? Math.round(ratio) : null;
  const verdict = tied
    ? `<p class="seo-verdict-line"><b>${esc(a.name)}</b> and <b>${esc(b.name)}</b> are worth the same — <strong>${fmt(a.regular_value)}</strong> each.</p>`
    : `<p class="seo-verdict-line"><b>${esc(winner.name)}</b> is worth <strong>${fmtRatio(ratio)}</strong> as much as <b>${esc(loser.name)}</b> — ${fmt(diff)} more.</p>${versusBar(a, b, fmt)}`;
  const tradeMath = tied ? `<p>These two should swap one-for-one. Check demand and trend below to decide which you'd rather hold.</p>`
    : `<ul class="seo-list">
        <li><b>Even swap:</b> trading ${esc(loser.name)} for ${esc(winner.name)} means adding about <strong>${fmt(diff)}</strong>; going the other way you'd be giving up roughly ${fmt(diff)} of value.</li>
        ${eachN ? `<li><b>Stacking up:</b> about <strong>${eachN} ${esc(loser.name)}</strong> are worth one ${esc(winner.name)}.</li>` : ''}
        ${a.permanent_value && b.permanent_value ? `<li><b>Permanent versions:</b> ${esc(ratioCopy(a, b, a.permanent_value, b.permanent_value, 'permanent'))}</li>` : ''}
      </ul>`;

  // --- which should you pick ---
  const picks = [];
  if (winner) picks.push(`<li><b>Higher value:</b> ${esc(winner.name)}, by ${fmt(diff)} (${fmtRatio(ratio)}).</li>`);
  if (a.demand != null && b.demand != null && a.demand !== b.demand) {
    const hd = a.demand > b.demand ? a : b, ld = hd === a ? b : a;
    picks.push(`<li><b>Higher demand:</b> ${esc(hd.name)} (${hd.demand}/10 vs ${ld.demand}/10) — usually quicker to trade away.</li>`);
  }
  if (premium(a) && premium(b) && Math.abs(premium(a) - premium(b)) / Math.max(premium(a), premium(b)) > 0.15) {
    const hp = premium(a) > premium(b) ? a : b;
    picks.push(`<li><b>Bigger permanent premium:</b> a permanent ${esc(hp.name)} is worth ${fmtRatio(premium(hp))} its physical value.</li>`);
  }
  for (const f of [a, b]) {
    if (f.trend === 'underpaid') picks.push(`<li><b>Possible pickup:</b> ${esc(f.name)} is trading below what many consider fair value.</li>`);
    if (f.trend === 'overpaid') picks.push(`<li><b>Watch out:</b> ${esc(f.name)} is trading above fair value and may cool off.</li>`);
    if (f.trend === 'unstable') picks.push(`<li><b>Volatile:</b> ${esc(f.name)}'s price is swinging — confirm the going rate before trading.</li>`);
  }

  // --- FAQ ---
  const faq = [
    [`Which is worth more, ${a.name} or ${b.name} in Blox Fruits?`, answer],
    winner && [`How many ${loser.name} equal one ${winner.name}?`, eachN ? `Roughly ${eachN} — ${winner.name} is worth ${fmtRatio(ratio)} as much as ${loser.name} by physical value.` : `Less than two: ${winner.name} is worth ${fmtRatio(ratio)} as much as ${loser.name}, so you'd add about ${fmt(diff)} to even the trade.`],
    a.demand != null && b.demand != null && [`Is ${a.name} or ${b.name} in higher demand?`, a.demand === b.demand ? `They have the same demand score (${a.demand}/10).` : `${a.demand > b.demand ? a.name : b.name} has the higher demand score (${Math.max(a.demand, b.demand)}/10 vs ${Math.min(a.demand, b.demand)}/10).`],
    winner && [`Should I trade ${loser.name} for ${winner.name}?`, `On value alone, ${winner.name} is the bigger item, so swapping ${loser.name} for it usually means adding about ${fmt(diff)}. Values are community estimates — check the live Trading board and calculator before agreeing to anything.`],
  ].filter(Boolean);

  // --- related comparisons ---
  const seen = new Set([slug]);
  const rel = [];
  for (const f of [a, b]) for (const [x, y, sl] of (pairIndex.get(f.id) || [])) {
    if (seen.has(sl) || rel.length >= 6) continue;
    seen.add(sl); rel.push(`<li><a href="/blox-fruits-compare/${sl}/" class="muted" style="font-size:0.85rem;">${esc(x.name)} vs ${esc(y.name)}</a></li>`);
  }

  const calcHref = `/trading/?tab=calculator&give=${encodeURIComponent(a.name)}&amp;get=${encodeURIComponent(b.name)}`;
  const body = `<section class="section seo-hero" style="padding-bottom:0;">
  <div class="container seo-wrap">
    ${crumbsHtml(crumbs)}
    <h1 class="seo-vs-title">${esc(a.name)} vs ${esc(b.name)} Value</h1>
    <p class="seo-sub">Physical and permanent value, demand and trend side by side · updated daily</p>
    <div class="seo-vs">${side(a)}<div class="seo-vs-badge" aria-hidden="true">VS</div>${side(b)}</div>
  </div>
${adSlotTop()}
</section>
<section class="section"><div class="container seo-wrap seo-article">
    <div class="seo-verdict">${verdict}</div>
    <h2>${esc(a.name)} vs ${esc(b.name)}: full comparison</h2>
    <div class="panel" style="overflow-x:auto;">
      <table class="compare-table seo-compare">
        <thead><tr><th></th><th><a href="${vHref(a)}">${icon(a)}<br>${esc(a.name)}</a></th><th><a href="${vHref(b)}">${icon(b)}<br>${esc(b.name)}</a></th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
    <p class="muted" style="font-size:0.78rem;">Highlighted cells win that row. Values are community estimates.</p>
    ${adSlotMiddle()}
    <h2>Trade math</h2>
    ${tradeMath}
    ${picks.length ? `<h2>Which should you pick?</h2><ul class="seo-list">${picks.join('')}</ul>` : ''}
    <div class="panel seo-cta" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:24px 0;">
      <p style="margin:0;">Test a real offer: ${esc(a.name)} for ${esc(b.name)} in the trade calculator.</p>
      <a href="${calcHref}" class="btn btn-primary btn-sm">Open calculator</a>
    </div>
    <h2>${esc(a.name)} vs ${esc(b.name)} FAQ</h2>
    ${faqAccordion(faq)}
    ${rel.length ? `<h2>More comparisons</h2><ul class="seo-pills">${rel.join('')}</ul>` : ''}
    <p class="muted"><a href="${vHref(a)}">${esc(a.name)} value</a> · <a href="${vHref(b)}">${esc(b.name)} value</a> · <a href="/blox-fruits-tier-list/">Value tier list</a> · <a href="/blox-fruits-compare/">All comparisons</a></p>
</div></section>
${ctaSectionHtml({ heading: `Trading one for the other?`, body: 'Create a free account to run it past other traders on the Trading board first.' })}
${adSlotBottom()}`;
  write(`blox-fruits-compare/${slug}`, renderPage(shell, { title, description, url, image: (winner || a).icon_url, ld: [buildFaqLd(faq), breadcrumbLd(crumbs)], body }));
  return url;
}

function categorySectionHtml(sectionLabel, top, urlPrefix) {
  const lists = top.map(f => `<div><p style="font-weight:700; margin:0 0 6px;">${esc(f.name)}</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:4px;">${
    top.filter(o => o !== f).map(o => {
      const [x, y] = top.indexOf(f) < top.indexOf(o) ? [f, o] : [o, f];
      return `<li><a href="/blox-fruits-compare/${pairSlug(urlPrefix, x, y)}/" class="muted" style="font-size:0.85rem;">${esc(f.name)} vs ${esc(o.name)}</a></li>`;
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
${wrapSection(`<p>Pick any two of the most valuable items to see which is worth more. For anything else, the <a href="/trading/?tab=calculator">trade calculator</a> handles any combination of items, and the <a href="/blox-fruits-tier-list/">tier list</a> ranks every fruit.</p>
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
    <p>Put both sides into the <a href="/trading/?tab=calculator">trade calculator</a>. If one side is more than about 8% ahead, ask yourself what the other side is getting — extra demand, or just a better deal.</p>
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
  urls.push(`${SITE}/trading/`); // the calculator is a tab on the hand-written /trading/ page (kept in the sitemap list)
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

  const rankMapFor = list => { const m = new Map(); for (const it of list) m.set(it.id, list.filter(x => x.regular_value > it.regular_value).length + 1); return m; };
  const withIndex = (set, list, urlPrefix) => {
    const pairIndex = new Map();
    for (const [x, y] of set.pairs) {
      const sl = pairSlug(urlPrefix, x, y);
      for (const f of [x, y]) { if (!pairIndex.has(f.id)) pairIndex.set(f.id, []); pairIndex.get(f.id).push([x, y, sl]); }
    }
    return { urlPrefix, rankOf: rankMapFor(list), total: list.length, pairIndex };
  };
  const fo = withIndex(fruitSet, fruits, ''), lo = withIndex(limitedSet, limiteds, 'limited-'), go = withIndex(gamepassSet, gamepasses, 'gamepass-');
  const pairUrls = [
    ...fruitSet.pairs.map(([a, b]) => comparePage(shell, a, b, fo)),
    ...limitedSet.pairs.map(([a, b]) => comparePage(shell, a, b, lo)),
    ...gamepassSet.pairs.map(([a, b]) => comparePage(shell, a, b, go)),
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
