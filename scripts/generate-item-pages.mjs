// Generates one static, SEO-optimized page per tradeable Blox Fruits item at
// /blox-fruits-values/<slug>/index.html — each targets an exact-match search like
// "blox fruits dragon fruit value". Run with: node generate-item-pages.mjs
//
// These pages are plain static HTML — nothing re-runs this automatically on its own.
// .github/workflows/regenerate-value-pages.yml runs it on a schedule (and on manual
// dispatch) and pushes the result, which triggers a real Cloudflare redeploy; that's the
// "automatic" part. You can still run it by hand any time for an immediate refresh.

import fs from 'node:fs';
import path from 'node:path';
import { loadShell, adSlotTop, adSlotMiddle, adSlotBottom } from './lib/shell.mjs';
import { cap, TREND_META, rarityChip, trendChip, demandLabel, demandMeter, statCard, iconImg, fmtRatio, ladderHtml, faqAccordion, faqLd as buildFaqLd } from './lib/seo-ui.mjs';
import { historyHtml } from './lib/sparkline.mjs';

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';
const SITE_ROOT = process.argv[2] || '.'; // path to the repo root
const LOCAL_JSON = process.argv[3] || null; // optional: path to a local items JSON (skips the network fetch)
const LOCAL_HISTORY = process.argv[4] || null; // optional: local price-history JSON rows (skips that fetch too)
let historyByItem = new Map(); // item_id -> [{ regular_value, recorded_at }]
const OUT_DIR = path.join(SITE_ROOT, 'blox-fruits-values');

const CATEGORY_LABEL = {
  fruit: 'Fruit', sword: 'Sword', gun: 'Gun', accessory: 'Accessory',
  fighting_style: 'Fighting Style', race: 'Race', gamepass: 'Gamepass', limited: 'Limited',
};

function slugify(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatValue(n) {
  if (n == null) return null;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K';
  return String(n);
}

const PLURAL = { fruit: 'fruits', gamepass: 'gamepasses', limited: 'limited items' };

const TREND_COPY = {
  up: 'trending upward right now — it\'s worth more today than it was a week ago',
  overpaid: 'currently trading above what most of the community considers fair, so it may cool off',
  underpaid: 'currently trading below what many consider fair value, which can make it a good pickup',
  unstable: 'seeing volatile pricing lately, so double-check the going rate before committing to a trade',
  stable: 'holding a steady, consistent price without much recent movement',
};

function demandCopy(demand) {
  if (demand == null) return 'Demand data isn\'t available for this item yet.';
  if (demand >= 8) return `Demand sits at ${demand}/10 — one of the more sought-after items to trade for right now.`;
  if (demand >= 5) return `Demand sits at ${demand}/10 — a reasonably active item on the trading board.`;
  if (demand >= 2) return `Demand sits at ${demand}/10 — not a hot item right now, so it may take longer to find a trade.`;
  return `Demand sits at ${demand}/10 — quite low right now, so expect it to move slowly on the trading board.`;
}

// Affiliate/sponsored slot — edit AFFILIATE_LINK and AFFILIATE_LABEL once you have a real
// program to use (e.g. an Amazon Associates link for Robux gift cards, or a creator-code
// program). Leave AFFILIATE_LINK empty to hide the block entirely. Must stay clearly
// disclosed as an affiliate/sponsored link per FTC guidelines — don't strip that wording.
const AFFILIATE_LINK = 'https://www.g2g.com/nxrealm08';
const AFFILIATE_LABEL = 'Want to buy or sell this directly?';

function affiliateBlockHtml() {
  if (!AFFILIATE_LINK) return '';
  return `
    <div class="panel" style="margin:20px 0; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; border-color:rgb(var(--brass-rgb) / 0.3);">
      <p style="margin:0; font-size:0.88rem;">${AFFILIATE_LABEL}</p>
      <a href="${AFFILIATE_LINK}" target="_blank" rel="noopener noreferrer sponsored" class="btn btn-ghost btn-sm">Check Prices <i data-lucide="external-link" class="icon-sm icon-inline"></i></a>
    </div>
    <p class="muted" style="font-size:0.7rem; margin:-14px 0 20px;">Sponsored/affiliate link — BloxCore may earn a small commission at no extra cost to you.</p>
  `;
}

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD — pages are rebuilt daily by the workflow
const stripTags = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const escAttr = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let shell; // nav/footer read from the homepage at run time (see lib/shell.mjs)

function pageHtml(item, related, ctx) {
  const categoryLabel = CATEGORY_LABEL[item.category] || item.category;
  const slug = ctx.slug;
  const url = `https://bloxcores.com/blox-fruits-values/${slug}/`;
  const rarity = item.rarity ? item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1) : null;
  const rarityPrefix = rarity && rarity.toLowerCase() !== categoryLabel.toLowerCase() ? rarity + ' ' : ''; // avoid "Limited Limited" / "Gamepass Gamepass"
  const regularFmt = formatValue(item.regular_value);
  const permFmt = formatValue(item.permanent_value);
  const hasPermanent = item.category === 'fruit' && permFmt;

  const valueSentence = hasPermanent
    ? `A physical ${item.name} currently trades for around <strong>${regularFmt}</strong>, while a permanent (Robux-locked) ${item.name} runs closer to <strong>${permFmt}</strong> since it can never be lost, dropped, or stolen.`
    : regularFmt
    ? `${item.name} currently trades for around <strong>${regularFmt}</strong> on the community market.`
    : `${item.name} doesn't have an established community value yet — check the live <a href="/trading/">Trading board</a> for current offers.`;

  const title = `${item.name} Value in Blox Fruits (2026) — ${rarityPrefix}${categoryLabel} Price & Demand | BloxCore`;
  const description = `${item.name} Blox Fruits value: ${regularFmt ? `~${regularFmt}${hasPermanent ? ` physical / ${permFmt} permanent` : ''}` : 'see current price'}. ${rarityPrefix}${categoryLabel.toLowerCase()} — demand, trend, and live trades on BloxCore.`;

  const relatedHtml = related.map(r => `<li><a href="${ctx.hrefFor(r)}" class="muted" style="font-size:0.85rem;">${r.name} · ${formatValue(r.regular_value)}</a></li>`).join('');

  const plural = PLURAL[item.category] || `${categoryLabel.toLowerCase()}s`;
  const { rank, total, top, ladderRows, equal } = ctx;
  const isTop = top && top.id === item.id;
  const pctTop = top && top.regular_value ? Math.round((item.regular_value / top.regular_value) * 100) : null;
  const premium = hasPermanent && item.regular_value ? item.permanent_value / item.regular_value : null;
  const tm = TREND_META[item.trend];
  const rankSentence = `${item.name} ranks #${rank} of ${total} ${plural} by physical value${isTop ? ' — the highest-valued one on the list' : top ? `, at ${pctTop}% of the top-ranked ${top.name} (${formatValue(top.regular_value)})` : ''}.`;
  const equalList = equal.map(e => e.item.name).join(', ');

  const demandTrend = `${demandCopy(item.demand)}${item.trend && TREND_COPY[item.trend] ? ` It's also ${TREND_COPY[item.trend]}.` : ''}`;
  const faq = [
    [`What is ${item.name} worth in Blox Fruits?`, stripTags(valueSentence)],
    [`Is ${item.name} in demand right now?`, demandTrend],
    hasPermanent && [`How much more is a permanent ${item.name} worth?`, `A permanent ${item.name} (${permFmt}) is worth about ${fmtRatio(premium)} a physical one (${regularFmt}) — roughly ${formatValue(item.permanent_value - item.regular_value)} more — because it can never be lost, dropped, or stolen.`],
    [`Where does ${item.name} rank by value?`, rankSentence],
    equal.length && [`What trades evenly with ${item.name}?`, `Items within about 20% of ${item.name}'s value include ${equalList}. Use the trade calculator on BloxCore to check an exact offer before you agree to it.`],
    [`How do I trade ${item.name}?`, `Check the live Trading board on BloxCore for active listings involving ${item.name}, or post your own offer. Values shift with the trend, so confirm the current going rate before agreeing to a trade.`],
  ].filter(Boolean);
  const faqLd = buildFaqLd(faq);
  const faqHtml = faqAccordion(faq);

  const statCards = [
    statCard({ label: 'Physical value', value: regularFmt, sub: isTop ? 'Highest on the list' : pctTop != null ? `${pctTop}% of ${top.name}` : '', tone: 'is-primary' }),
    hasPermanent && statCard({ label: 'Permanent value', value: permFmt, sub: premium ? `${fmtRatio(premium)} the physical price` : '' }),
    statCard({ label: 'Value rank', value: `#${rank}`, sub: `of ${total} ${plural}` }),
    item.demand != null && statCard({ label: 'Demand', value: `${item.demand}<small>/10</small>`, sub: demandLabel(item.demand), extra: demandMeter(item.demand) }),
    tm && statCard({ label: 'Trend', value: `${tm.icon} ${tm.label}`, sub: tm.note, tone: `is-${tm.tone}` }),
    rarity && statCard({ label: 'Rarity', value: rarity, sub: categoryLabel }),
  ].filter(Boolean).join('');

  const equalHtml = equal.length ? `
    <h2>Trades evenly with ${escAttr(item.name)}</h2>
    <p class="muted">Items within about 20% of ${escAttr(item.name)}'s value — a fair starting point for a 1-for-1 swap.</p>
    <div class="seo-equal">${equal.map(e => `<a class="seo-equal-card" href="${ctx.hrefFor(e.item)}">${iconImg(e.item, 40)}<span><b>${escAttr(e.item.name)}</b><small>${formatValue(e.item.regular_value)}</small></span><em class="${e.pct >= 0 ? 'up' : 'down'}">${e.pct >= 0 ? '+' : '−'}${Math.abs(e.pct)}%</em></a>`).join('')}</div>` : '';

  const ladder = ladderRows.length >= 2 ? `
    <h2>Where ${escAttr(item.name)} sits in the value ranking</h2>
    <p class="muted">${escAttr(rankSentence)} The bars compare each item to the highest in this window.</p>
    ${ladderHtml(ladderRows, item.id, formatValue, ctx.hrefFor)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script>(function(){try{var a=localStorage.getItem('bc_accent');if(a==='custom'){var c=JSON.parse(localStorage.getItem('bc_custom_theme')||'null');if(c){var s=document.documentElement.style;s.setProperty('--ink',c.ink);s.setProperty('--navy',c.navy);s.setProperty('--navy-light',c['navy-light']);s.setProperty('--brass',c.brass);s.setProperty('--brass-bright',c['brass-bright']);s.setProperty('--ink-glow',c.navy);var h=c.brass.replace('#','');s.setProperty('--brass-rgb',parseInt(h.substring(0,2),16)+' '+parseInt(h.substring(2,4),16)+' '+parseInt(h.substring(4,6),16));document.documentElement.setAttribute('data-accent','custom');}}else if(a){document.documentElement.setAttribute('data-accent',a);}if(localStorage.getItem('bc_reduce_motion')==='1')document.documentElement.classList.add('reduce-motion');if(localStorage.getItem('bc_compact_mode')==='1')document.documentElement.classList.add('compact-mode');}catch(e){}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="robots" content="index, follow">
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BloxCore">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${item.icon_url || 'https://bloxcores.com/assets/og-banner.jpg'}">
<meta property="og:url" content="${url}">
<meta property="article:modified_time" content="${TODAY}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${item.icon_url || 'https://bloxcores.com/assets/og-banner.jpg'}">
<link rel="preconnect" href="https://unpkg.com">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="dns-prefetch" href="https://unpkg.com">
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/pages/seo.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/css/animations.css">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/assets/favicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#0a0e17">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": ${JSON.stringify(title)},
  "description": ${JSON.stringify(description)},
  "url": ${JSON.stringify(url)},
  "dateModified": "${TODAY}",
  "isPartOf": { "@type": "WebSite", "name": "BloxCore", "url": "https://bloxcores.com/" }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://bloxcores.com/" },
    { "@type": "ListItem", "position": 2, "name": "Values", "item": "https://bloxcores.com/blox-fruits-values/" },
    { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(item.name)}, "item": ${JSON.stringify(url)} }
  ]
}
</script>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head>
<body class="seo-page">

${shell.nav}
<section class="section seo-hero" style="padding-bottom:0;">
  <div class="container seo-wrap">
    <nav aria-label="Breadcrumb" class="seo-crumbs">
      <ol>
        <li><a href="/">Home</a></li>
        <li aria-hidden="true">/</li>
        <li><a href="/blox-fruits-values/">Values</a></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">${item.name}</li>
      </ol>
    </nav>
    <div class="seo-hero-row">
      ${item.icon_url ? `<div class="seo-icon"><img src="${item.icon_url}" alt="${escAttr(item.name)}" width="96" height="96" decoding="async"></div>` : ''}
      <div class="seo-hero-text">
        <h1>${item.name} Value in Blox Fruits</h1>
        <div class="seo-chips">${rarityChip(item.rarity)}<span class="seo-chip">${categoryLabel}</span>${trendChip(item.trend)}<span class="seo-chip is-rank">#${rank} of ${total} ${plural}</span></div>
        <p class="seo-sub">Last updated <time datetime="${TODAY}">${TODAY}</time> · community-estimated values, refreshed daily</p>
      </div>
      <div class="seo-hero-value"><small>Physical value</small><strong>${regularFmt}</strong>${hasPermanent ? `<span>Permanent ${permFmt}</span>` : ''}</div>
    </div>
  </div>
${adSlotTop()}
</section>

<main>
<section class="section">
  <div class="container seo-wrap seo-article">
    <p class="seo-lead">${valueSentence}</p>
    <div class="seo-stats">${statCards}</div>
    <div class="seo-live" data-item-id="${item.id}" data-name="${escAttr(item.name)}" hidden>
      <span class="seo-live-dot" aria-hidden="true"></span><span class="seo-live-text"></span>
      <a href="/trading/" class="btn btn-ghost btn-sm">Open trading board</a>
    </div>
    ${affiliateBlockHtml()}
    <h2>${item.name} Demand &amp; Trend</h2>
    <p>${demandTrend}</p>
    ${historyHtml(item, historyByItem.get(item.id), formatValue)}
    ${ladder}
    ${equalHtml}
    <h2>How to Trade ${item.name}</h2>
    <p>Values shift with the trend above, so always confirm the current going rate before agreeing to a trade — check the live <a href="/trading/">Trading board</a> for active listings involving ${item.name}, or post your own offer if you're looking to buy or sell. See our <a href="/blox-fruits-values/">full guide to how Blox Fruits values work</a> for more on reading physical vs. permanent pricing, rarity tiers, and spotting inflated value claims.</p>
    <h2>${escAttr(item.name)} FAQ</h2>
    ${faqHtml}
    ${related.length ? `<h2>Other ${categoryLabel} Values</h2><ul class="seo-pills">${relatedHtml}</ul>` : ''}
  </div>
</section>

<section class="section" style="padding-top:0;">
  <div class="container panel seo-cta" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:20px; max-width:820px;">
    <div>
      <h2 style="font-size:1.3rem; margin-bottom:6px;">Ready to trade?</h2>
      <p class="muted" style="margin:0;">Join BloxCore and list ${item.name} on the Trading board in seconds.</p>
    </div>
    <a href="/trading/" class="btn btn-primary">Browse Live Trades</a>
  </div>
</section>
</main>

${adSlotMiddle()}

${adSlotBottom()}

${shell.footer}
<script defer src="https://unpkg.com/lucide@1.34.0"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4"></script>
<script src="/js/animations.js"></script>
<script src="/js/install-prompt.js"></script>
<script src="/js/supabase-client.js"></script>
<script src="/js/nav.js"></script>
<script src="/js/search.js"></script>
<script defer src="/js/seo-live.js"></script>
</body>
</html>
`;
}

async function main() {
  shell = loadShell(SITE_ROOT);
  let items;
  if (LOCAL_JSON) {
    items = JSON.parse(fs.readFileSync(LOCAL_JSON, 'utf8'));
    console.log(`Loaded ${items.length} items from local file ${LOCAL_JSON}.`);
  } else {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bf_items?select=id,name,category,rarity,regular_value,permanent_value,icon_url,demand,trend&order=category.asc,regular_value.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
    items = await res.json();
    console.log(`Fetched ${items.length} items from Supabase.`);
  }

  try {
    let rows = [];
    if (LOCAL_HISTORY) rows = JSON.parse(fs.readFileSync(LOCAL_HISTORY, 'utf8'));
    else if (!LOCAL_JSON) {
      for (let from = 0; ; from += 1000) { // PostgREST caps a page at 1000 rows
        const r = await fetch(`${SUPABASE_URL}/rest/v1/bf_item_price_history?select=item_id,regular_value,recorded_at&order=recorded_at.asc`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Range: `${from}-${from + 999}` },
        });
        if (!r.ok) throw new Error(`history fetch failed: ${r.status}`);
        const page = await r.json();
        rows.push(...page);
        if (page.length < 1000) break;
      }
    }
    rows.forEach(r => { if (!historyByItem.has(r.item_id)) historyByItem.set(r.item_id, []); historyByItem.get(r.item_id).push(r); });
    console.log(`Loaded ${rows.length} price-history rows for ${historyByItem.size} items.`);
  } catch (err) {
    console.warn('Price history unavailable — pages will be built without it:', err.message); // never block the daily rebuild on this
  }

  // Only items with an actual established value are worth their own page — a "value" page
  // with no number on it doesn't serve the search intent and drags down overall page quality.
  items = items.filter(i => ['fruit', 'gamepass', 'limited'].includes(i.category) && i.regular_value);
  console.log(`${items.length} of those have a real value and will get a page.`);

  const byCategory = {};
  for (const item of items) {
    (byCategory[item.category] ||= []).push(item);
  }

  // Keep the established /magnet-fruit/ URL + title even though the items table now calls it "Magnet".
  items = items.map(i => (i.category === 'fruit' && i.name === 'Magnet' ? { ...i, name: 'Magnet Fruit' } : i));
  for (const k of Object.keys(byCategory)) byCategory[k] = byCategory[k].map(i => items.find(x => x.id === i.id));

  const seenSlugs = new Set();
  const slugOf = new Map();
  for (const item of items) {
    let slug = slugify(item.name);
    if (seenSlugs.has(slug)) slug = `${slug}-${item.category}`; // rare name collision across categories
    seenSlugs.add(slug);
    slugOf.set(item.id, slug);
  }
  const hrefFor = it => `/blox-fruits-values/${slugOf.get(it.id)}/`;

  const sortedBy = {};
  const rankOf = new Map(); // competition ranking: ties share the better rank
  for (const [cat, list] of Object.entries(byCategory)) {
    const sorted = [...list].sort((a, b) => b.regular_value - a.regular_value || a.name.localeCompare(b.name));
    sortedBy[cat] = sorted;
    for (const it of sorted) rankOf.set(it.id, sorted.filter(x => x.regular_value > it.regular_value).length + 1);
  }

  const sitemapUrls = [];
  let written = 0;

  for (const item of items) {
    const slug = slugOf.get(item.id);
    const sorted = sortedBy[item.category];
    const idx = sorted.findIndex(i => i.id === item.id);
    const window = sorted.slice(Math.max(0, idx - 3), idx + 4);
    const ladderRows = window.map(it => ({ item: it, rank: rankOf.get(it.id) }));
    const equal = sorted
      .filter(c => c.id !== item.id && c.regular_value / item.regular_value >= 0.8 && c.regular_value / item.regular_value <= 1.25)
      .sort((a, b) => Math.abs(Math.log(a.regular_value / item.regular_value)) - Math.abs(Math.log(b.regular_value / item.regular_value)))
      .slice(0, 4)
      .map(c => ({ item: c, pct: Math.round((c.regular_value / item.regular_value - 1) * 100) }));

    const related = sorted.filter(i => i.id !== item.id).slice(0, 6);
    const ctx = { slug, hrefFor, rank: rankOf.get(item.id), total: sorted.length, top: sorted[0], ladderRows, equal };

    const dir = path.join(OUT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(item, related, ctx));
    sitemapUrls.push(`https://bloxcores.com/blox-fruits-values/${slug}/`);
    written++;
  }

  fs.writeFileSync(path.join(SITE_ROOT, 'item-page-sitemap-urls.txt'), sitemapUrls.join('\n') + '\n');
  console.log(`Wrote ${written} item pages under ${OUT_DIR}`);
  console.log(`URL list for sitemap.xml written to item-page-sitemap-urls.txt`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
