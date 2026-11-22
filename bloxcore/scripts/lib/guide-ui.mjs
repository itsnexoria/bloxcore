// Building blocks shared by the evergreen guide / hub generators and the item + compare + tier-list generators.
// Pure functions (data in, HTML / JSON-LD out). Styling lives in css/pages/seo.css (classes prefixed seo-).
import { esc } from './shell.mjs';
import { cap, TREND_META, rarityChip, trendChip, demandMeter, iconImg, fmtRatio } from './seo-ui.mjs';

export const SITE = 'https://bloxcores.com';
export const PUBLISHER = { '@type': 'Organization', name: 'BloxCore', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/assets/logo.png` } };

// Who is credited on guides. Put real names here when you want them shown (e.g. REVIEWER = 'Nexus, founder').
export const AUTHOR = 'The BloxCore Team';
export const REVIEWER = '';

export const fmtDate = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// "Written by … · Reviewed … · Last updated …" trust block with a link to the editorial policy.
export function authorBlock({ updated, published }) {
  return `<div class="seo-author" itemscope itemtype="https://schema.org/Article">
    <span class="seo-author-badge" aria-hidden="true">B</span>
    <div class="seo-author-text">
      <span>Written by <b>${esc(AUTHOR)}</b>${REVIEWER ? ` · Reviewed by <b>${esc(REVIEWER)}</b>` : ''}</span>
      <span class="muted">Last updated <time datetime="${updated}">${fmtDate(updated)}</time>${published && published !== updated ? ` · First published ${fmtDate(published)}` : ''} · <a href="/about/">How we make our guides</a></span>
    </div>
  </div>`;
}

export function articleLd({ title, description, url, published, updated, image }) {
  return { '@context': 'https://schema.org', '@type': 'Article', headline: title, description, mainEntityOfPage: url, image: image || `${SITE}/assets/og-banner.jpg`,
    datePublished: published, dateModified: updated, author: { '@type': 'Organization', name: AUTHOR, url: `${SITE}/about/` }, publisher: PUBLISHER };
}

export function howToLd({ name, description, steps, totalTime }) {
  return { '@context': 'https://schema.org', '@type': 'HowTo', name, description, ...(totalTime ? { totalTime } : {}),
    step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: s.text })) };
}

// Visible numbered steps that mirror the HowTo schema (Google wants the schema to match what's on the page).
export function stepsHtml(steps) {
  return `<ol class="dc-steps seo-steps">${steps.map(s => `<li><b>${esc(s.name)}</b>${esc(s.text)}</li>`).join('')}</ol>`;
}

export function tocHtml(sections) {
  return `<nav class="seo-toc" aria-label="On this page"><b>On this page</b><ul>${sections.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ul></nav>`;
}

// Trading-value verdict from the data we already have (rank, demand, trend). Honest by construction: it never
// claims anything about combat strength — only about how the item trades.
export function verdictFor(item, rank, total) {
  const pct = total ? rank / total : 1;
  const d = item.demand ?? 5;
  const t = item.trend;
  if (t === 'overpaid') return { label: 'Overpaid right now', tone: 'warn', text: 'It is trading above what many consider fair value. If you own it, this can be a good time to sell; if you are buying, expect to pay a premium.' };
  if (t === 'underpaid') return { label: 'Possible pickup', tone: 'cool', text: 'It is trading below what many consider fair value, which can make it a good time to buy — confirm the going rate first.' };
  if (t === 'unstable') return { label: 'Volatile', tone: 'down', text: 'The price is swinging, so the value you agree on today may not hold. Check recent changes before you trade.' };
  if (pct <= 0.25 && d >= 7) return { label: 'Strong hold', tone: 'up', text: 'High value and high demand: it is easy to trade and has been holding its price.' };
  if (d >= 7) return { label: 'Easy to trade', tone: 'flat', text: 'Demand is high, so you should be able to find a taker quickly.' };
  if (pct <= 0.25) return { label: 'Big-ticket, slower to move', tone: 'flat', text: 'High value, but demand is only moderate — it can take longer to find the right trade.' };
  if (d <= 3) return { label: 'Niche', tone: 'down', text: 'Demand is low: cheap to pick up, but harder to trade away again.' };
  return { label: 'Mid-tier', tone: 'flat', text: 'Moderate value and demand — a fair everyday trading chip.' };
}

export const verdictChip = v => `<span class="seo-chip seo-trend is-${v.tone}">${esc(v.label)}</span>`;

// A pick card: icon, name, live BloxCore stats and a one-line reason.
export function pickCard(item, { rank, total, why, hrefFor }) {
  if (!item) return '';
  return `<a class="seo-pick" href="${hrefFor(item)}">
    <span class="seo-pick-top">${iconImg(item, 44, 'seo-pick-img')}<span><b>${esc(item.name)}</b><small>${rarityChip(item.rarity)}</small></span></span>
    <span class="seo-pick-stats"><em>${fmtVal(item.regular_value)}</em>${item.demand != null ? demandMeter(item.demand) : ''}${rank ? `<small>#${rank} of ${total}</small>` : ''}${trendChip(item.trend)}</span>
    ${why ? `<span class="seo-pick-why">${esc(why)}</span>` : ''}
  </a>`;
}
let fmtVal = n => String(n);
export function setValueFormatter(fn) { fmtVal = fn; }

// Cross-links between guides, hubs, the tier list and the tools — the same block everywhere keeps the link graph tight.
export const GUIDE_LINKS = [
  ['/blox-fruits-best-fruit-first-sea/', 'Best fruit: First Sea'],
  ['/blox-fruits-best-fruit-second-sea/', 'Best fruit: Second Sea'],
  ['/blox-fruits-best-fruit-third-sea/', 'Best fruit: Third Sea'],
  ['/blox-fruits-grinding-guide/', 'Grinding & leveling guide'],
  ['/blox-fruits-raid-guide/', 'Raid & awakening guide'],
  ['/blox-fruits-is-it-worth-it/', 'Is this fruit worth it?'],
  ['/blox-fruits-trading-guide/', 'Trading guide'],
];
export const HUB_LINKS = [
  ['/blox-fruits-fruits/', 'All fruits'],
  ['/blox-fruits-swords/', 'Swords'],
  ['/blox-fruits-guns/', 'Guns'],
  ['/blox-fruits-accessories/', 'Accessories'],
  ['/blox-fruits-tier-list/', 'Value tier list'],
  ['/blox-fruits-compare/', 'Compare fruits'],
  ['/blox-fruits-values/', 'All item values'],
];

// Community / tool pages that otherwise had a single inbound link; listed on every guide + item page.
export const COMMUNITY_LINKS = [
  ['/blox-fruits-combos/', 'PvP & raid combos'],
  ['/build/', 'Build planner'],
  ['/digest/', 'Weekly digest'],
  ['/clips/', 'Clip of the week'],
  ['/status/', 'Site status'],
];

export function relatedBlock({ heading = 'Keep exploring', skip = '', guides = true, hubs = true, community = true } = {}) {
  const li = ([href, t]) => `<li><a href="${href}"${href === skip ? ' aria-current="page"' : ''}>${esc(t)}</a></li>`;
  return `<aside class="seo-related" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2><div class="seo-related-cols">
    ${guides ? `<div><b>Guides</b><ul>${GUIDE_LINKS.filter(([h]) => h !== skip).map(li).join('')}</ul></div>` : ''}
    ${hubs ? `<div><b>Values &amp; tools</b><ul>${HUB_LINKS.filter(([h]) => h !== skip).map(li).join('')}</ul></div>` : ''}
    ${community ? `<div><b>Community</b><ul>${COMMUNITY_LINKS.filter(([h]) => h !== skip).map(li).join('')}</ul></div>` : ''}
  </div></aside>`;
}

// "Why join" strip for logged-out visitors, placed next to the value tables. The inline script removes it for
// anyone who already has a session so members never see it.
export function whyJoinStrip({ compact = false } = {}) {
  return `<aside class="seo-why${compact ? ' is-compact' : ''}" aria-label="Why join BloxCore">
    <b class="seo-why-title">Free account — 10 seconds with Discord</b>
    <ul>
      <li><span aria-hidden="true">🔔</span><span><b>Price alerts</b> — get pinged when a value moves or someone lists what you want</span></li>
      <li><span aria-hidden="true">⭐</span><span><b>Watchlist</b> — follow the items you trade and track their history</span></li>
      <li><span aria-hidden="true">🔁</span><span><b>Listings</b> — post trades and get offers from the community</span></li>
    </ul>
    <a href="/auth/" class="btn btn-primary btn-sm">Join free</a>
    <script>try{if(Object.keys(localStorage).some(function(k){return /^sb-.+-auth-token$/.test(k)&&localStorage.getItem(k)}))document.currentScript.parentElement.remove()}catch(e){}</script>
  </aside>`;
}

// Live "giveaways running now" strip (filled by /js/giveaway-strip.js; stays hidden when none are active).
export function giveawayStrip() {
  return '<div class="seo-giveaways" data-giveaway-strip hidden></div>';
}
