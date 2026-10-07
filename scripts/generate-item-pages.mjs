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
import { loadShell } from './lib/shell.mjs';

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';
const SITE_ROOT = process.argv[2] || '.'; // path to the repo root
const LOCAL_JSON = process.argv[3] || null; // optional: path to a local items JSON (skips the network fetch)
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

let shell; // nav/footer read from the homepage at run time (see lib/shell.mjs)

function pageHtml(item, related) {
  const categoryLabel = CATEGORY_LABEL[item.category] || item.category;
  const slug = slugify(item.name);
  const url = `https://bloxcores.com/blox-fruits-values/${slug}/`;
  const rarity = item.rarity ? item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1) : null;
  const regularFmt = formatValue(item.regular_value);
  const permFmt = formatValue(item.permanent_value);
  const hasPermanent = item.category === 'fruit' && permFmt;

  const valueSentence = hasPermanent
    ? `A physical ${item.name} currently trades for around <strong>${regularFmt}</strong>, while a permanent (Robux-locked) ${item.name} runs closer to <strong>${permFmt}</strong> since it can never be lost, dropped, or stolen.`
    : regularFmt
    ? `${item.name} currently trades for around <strong>${regularFmt}</strong> on the community market.`
    : `${item.name} doesn't have an established community value yet — check the live <a href="/trading/">Trading board</a> for current offers.`;

  const title = `${item.name} Value in Blox Fruits (2026) — ${rarity ? rarity + ' ' : ''}${categoryLabel} Price & Demand | BloxCore`;
  const description = `${item.name} Blox Fruits value: ${regularFmt ? `~${regularFmt}${hasPermanent ? ` physical / ${permFmt} permanent` : ''}` : 'see current price'}. ${rarity ? rarity + ' ' : ''}${categoryLabel.toLowerCase()} — demand, trend, and live trades on BloxCore.`;

  const relatedHtml = related.map(r => `<li><a href="/blox-fruits-values/${slugify(r.name)}/" class="muted" style="font-size:0.85rem;">${r.name}</a></li>`).join('');

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
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${item.icon_url || 'https://bloxcores.com/assets/og-banner.jpg'}">
<link rel="preconnect" href="https://unpkg.com">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="dns-prefetch" href="https://unpkg.com">
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
<link rel="stylesheet" href="/css/animations.css">
<link rel="icon" type="image/png" href="/assets/logo.png">
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
</head>
<body>

${shell.nav}
<section class="section" style="padding-bottom:0;">
  <div class="container" style="max-width:820px;">
    <nav aria-label="Breadcrumb" style="margin-bottom:14px;">
      <ol style="list-style:none; display:flex; gap:6px; padding:0; margin:0; font-size:0.8rem; flex-wrap:wrap;" class="muted">
        <li><a href="/" class="muted">Home</a></li>
        <li aria-hidden="true">/</li>
        <li><a href="/blox-fruits-values/" class="muted">Values</a></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">${item.name}</li>
      </ol>
    </nav>
    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
      ${item.icon_url ? `<img src="${item.icon_url}" alt="${item.name}" style="width:64px; height:64px; object-fit:contain; flex-shrink:0;">` : ''}
      <div>
        <h1 style="font-size:1.8rem; line-height:1.15; margin:0;">${item.name} Value in Blox Fruits</h1>
        <p class="muted" style="margin:4px 0 0;">${rarity ? rarity + ' ' : ''}${categoryLabel} · updated regularly by the BloxCore community</p>
      </div>
    </div>
  </div>
</section>

<main>
<section class="section">
  <div class="container" style="max-width:820px; line-height:1.75; font-size:0.96rem;">
    <p>${valueSentence}</p>
    <div class="panel" style="display:flex; gap:24px; flex-wrap:wrap; margin:20px 0;">
      <div><p class="muted" style="margin:0; font-size:0.75rem; text-transform:uppercase;">Physical Value</p><p style="margin:2px 0 0; font-family:var(--font-mono); font-size:1.3rem; color:var(--brass-bright);">${regularFmt || '—'}</p></div>
      ${hasPermanent ? `<div><p class="muted" style="margin:0; font-size:0.75rem; text-transform:uppercase;">Permanent Value</p><p style="margin:2px 0 0; font-family:var(--font-mono); font-size:1.3rem; color:var(--brass-bright);">${permFmt}</p></div>` : ''}
      ${rarity ? `<div><p class="muted" style="margin:0; font-size:0.75rem; text-transform:uppercase;">Rarity</p><p style="margin:2px 0 0; font-size:1.1rem;">${rarity}</p></div>` : ''}
    </div>
    ${affiliateBlockHtml()}
    <h2 style="font-size:1.3rem;">Demand &amp; Trend</h2>
    <p>${demandCopy(item.demand)}${item.trend && TREND_COPY[item.trend] ? ` It's also ${TREND_COPY[item.trend]}.` : ''}</p>
    <h2 style="font-size:1.3rem;">How to Trade ${item.name}</h2>
    <p>Values shift with the trend above, so always confirm the current going rate before agreeing to a trade — check the live <a href="/trading/">Trading board</a> for active listings involving ${item.name}, or post your own offer if you're looking to buy or sell. See our <a href="/blox-fruits-values/">full guide to how Blox Fruits values work</a> for more on reading physical vs. permanent pricing, rarity tiers, and spotting inflated value claims.</p>
    ${related.length ? `<h2 style="font-size:1.3rem;">Other ${categoryLabel} Values</h2><ul style="padding-left:20px; columns:2; column-gap:24px;">${relatedHtml}</ul>` : ''}
  </div>
</section>

<section class="section" style="padding-top:0;">
  <div class="container panel" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:20px; max-width:820px;">
    <div>
      <h2 style="font-size:1.3rem; margin-bottom:6px;">Ready to trade?</h2>
      <p class="muted" style="margin:0;">Join BloxCore and list ${item.name} on the Trading board in seconds.</p>
    </div>
    <a href="/trading/" class="btn btn-primary">Browse Live Trades</a>
  </div>
</section>
</main>

${shell.footer}
<script src="https://unpkg.com/lucide@1.34.0"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4"></script>
<script src="/js/animations.js"></script>
<script src="/js/install-prompt.js"></script>
<script src="/js/supabase-client.js"></script>
<script src="/js/nav.js"></script>
<script src="/js/search.js"></script>
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

  // Only items with an actual established value are worth their own page — a "value" page
  // with no number on it doesn't serve the search intent and drags down overall page quality.
  items = items.filter(i => ['fruit', 'gamepass', 'limited'].includes(i.category) && i.regular_value);
  console.log(`${items.length} of those have a real value and will get a page.`);

  const byCategory = {};
  for (const item of items) {
    (byCategory[item.category] ||= []).push(item);
  }

  const seenSlugs = new Set();
  const sitemapUrls = [];
  let written = 0;

  for (const item of items) {
    let slug = slugify(item.name);
    if (seenSlugs.has(slug)) slug = `${slug}-${item.category}`; // rare name collision across categories
    seenSlugs.add(slug);

    const related = (byCategory[item.category] || [])
      .filter(i => i.id !== item.id)
      .slice(0, 6);

    const dir = path.join(OUT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(item, related));
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
