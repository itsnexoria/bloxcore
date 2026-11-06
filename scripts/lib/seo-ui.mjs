// Shared HTML building blocks for the generated SEO pages (item values + comparisons).
// Pure functions: data in, markup out. Styling lives in css/pages/seo.css (classes prefixed seo-).

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const RARITY_COLOR = { common: '#9ca3af', uncommon: '#34d399', rare: '#38bdf8', legendary: '#a78bfa', mythical: '#f87171' };

export const TREND_META = {
  up:        { label: 'Rising',      icon: '▲', tone: 'up',   note: 'worth more today than a week ago' },
  stable:    { label: 'Stable',      icon: '●', tone: 'flat', note: 'holding a steady price' },
  overpaid:  { label: 'Overpaid',    icon: '▲', tone: 'warn', note: 'trading above fair value — may cool off' },
  underpaid: { label: 'Underpaid',   icon: '▼', tone: 'cool', note: 'trading below fair value — a possible pickup' },
  unstable:  { label: 'Volatile',    icon: '↕', tone: 'down', note: 'prices are swinging — confirm before trading' },
};

export function rarityChip(rarity) {
  if (!rarity) return '';
  const c = RARITY_COLOR[String(rarity).toLowerCase()] || 'var(--brass-bright)';
  return `<span class="seo-chip" style="--chip:${c}">${esc(cap(rarity))}</span>`;
}

export function trendChip(trend) {
  const m = TREND_META[trend];
  return m ? `<span class="seo-chip seo-trend is-${m.tone}">${m.icon} ${m.label}</span>` : '';
}

export function demandLabel(d) {
  if (d == null) return 'Unknown';
  if (d >= 8) return 'Very high';
  if (d >= 6) return 'High';
  if (d >= 4) return 'Moderate';
  if (d >= 2) return 'Low';
  return 'Very low';
}

// 10 small segments, `d` of them lit.
export function demandMeter(d) {
  if (d == null) return '';
  const on = Math.max(0, Math.min(10, d));
  return `<span class="seo-meter" role="img" aria-label="Demand ${on} out of 10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function statCard({ label, value, sub = '', tone = '', extra = '' }) {
  return `<div class="seo-stat ${tone}"><small>${esc(label)}</small><strong>${value}</strong>${sub ? `<span>${sub}</span>` : ''}${extra}</div>`;
}

export function iconImg(item, size = 56, cls = '') {
  return item.icon_url
    ? `<img${cls ? ` class="${cls}"` : ""} src="${esc(item.icon_url)}" alt="${esc(item.name)}" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : '';
}

export const fmtRatio = r => (r >= 10 ? String(Math.round(r)) : r.toFixed(1).replace(/\.0$/, '')) + '×';

// Value ladder: a window of neighbours around the current item, bars scaled to the biggest value shown.
// rows: [{ item, rank }] ordered by rank; current: item id; hrefFor(item) -> url
export function ladderHtml(rows, currentId, fmt, hrefFor) {
  if (rows.length < 2) return '';
  const max = Math.max(...rows.map(r => r.item.regular_value || 0), 1);
  const cur = rows.find(r => r.item.id === currentId)?.item;
  return `<ol class="seo-ladder">${rows.map(({ item, rank }) => {
    const isCur = item.id === currentId;
    const w = Math.max(4, Math.round(((item.regular_value || 0) / max) * 100));
    const diff = cur && !isCur ? item.regular_value - cur.regular_value : null;
    const delta = diff == null ? '<em>You are here</em>' : `<em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}</em>`;
    const name = isCur ? `<b>${esc(item.name)}</b>` : `<a href="${hrefFor(item)}">${esc(item.name)}</a>`;
    return `<li class="${isCur ? 'is-current' : ''}"${isCur ? ' aria-current="true"' : ''}>`
      + `<span class="seo-rank">#${rank}</span>${iconImg(item, 28, 'seo-mini')}<span class="seo-ladder-name">${name}</span>`
      + `<span class="seo-ladder-bar" aria-hidden="true"><i style="width:${w}%"></i></span><span class="seo-ladder-val">${fmt(item.regular_value)}</span>${delta}</li>`;
  }).join('')}</ol>`;
}

// "FAQ" as native <details> accordions (reuses the site's .settings-accordion look).
export function faqAccordion(faq) {
  return `<div class="faq-list seo-faq">${faq.map(([q, a], i) =>
    `<details class="settings-accordion"${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
}

export function faqLd(faq) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

// Horizontal "share of the pair" bar for comparisons.
export function versusBar(a, b, fmt) {
  const total = (a.regular_value || 0) + (b.regular_value || 0) || 1;
  const pa = Math.round((a.regular_value / total) * 100);
  return `<div class="seo-versus-bar" role="img" aria-label="${esc(a.name)} ${fmt(a.regular_value)} versus ${esc(b.name)} ${fmt(b.regular_value)}">`
    + `<span class="a" style="width:${pa}%"><b>${esc(a.name)}</b> ${fmt(a.regular_value)}</span>`
    + `<span class="b" style="width:${100 - pa}%"><b>${esc(b.name)}</b> ${fmt(b.regular_value)}</span></div>`;
}

export function crumbsHtml(crumbs) {
  return `<nav aria-label="Breadcrumb" class="seo-crumbs"><ol>${crumbs.map((c, i) => i === crumbs.length - 1
    ? `<li aria-current="page">${esc(c.name)}</li>`
    : `<li><a href="${c.url.replace('https://bloxcores.com', '')}">${esc(c.name)}</a></li><li aria-hidden="true">/</li>`).join('')}</ol></nav>`;
}
