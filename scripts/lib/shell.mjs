// Shared page shell for the static generators. The nav, footer and theme-bootstrap script are
// read straight from the homepage (index.html) at generation time, so generated pages can
// never drift from the site's real nav/footer again.

import fs from 'node:fs';
import path from 'node:path';

export function loadShell(siteRoot) {
  const home = fs.readFileSync(path.join(siteRoot, 'index.html'), 'utf8');
  const pick = (re, label) => {
    const m = home.match(re);
    if (!m) throw new Error(`Couldn't find ${label} in index.html — did its markup change?`);
    return m[0];
  };
  return {
    themeScript: pick(/<script>\(function\(\)\{try\{var a=localStorage\.getItem\('bc_accent'\).*?<\/script>/s, 'theme script'),
    nav: pick(/<nav class="nav nav-bar">.*?<\/nav>\n/s, 'nav'),
    footer: pick(/<footer class="site-footer".*?<\/footer>\n/s, 'footer'),
  };
}

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function formatValue(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// Wraps page body HTML in the full document. `ld` is an array of JSON-LD objects.
export function renderPage(shell, { title, description, url, image, ld = [], body, extraScripts = [] }) {
  const img = image || 'https://bloxcores.com/assets/og-banner.jpg';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${shell.themeScript}
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="robots" content="index, follow">
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BloxCore">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<link rel="preconnect" href="https://unpkg.com">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
<link rel="stylesheet" href="/css/animations.css">
<link rel="icon" type="image/png" href="/assets/logo.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#0a0e17">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>
<body>

${shell.nav}
<main>
${body}
</main>

${shell.footer}
<script src="https://unpkg.com/lucide@1.34.0"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4"></script>
<script src="/js/animations.js"></script>
<script src="/js/install-prompt.js"></script>
<script src="/js/supabase-client.js"></script>
<script src="/js/nav.js"></script>
<script src="/js/search.js"></script>
${extraScripts.map(s => `<script src="${s}"></script>`).join('\n')}
</body>
</html>
`;
}

// Ad placements for public SEO pages only — never used on the homepage or on any page that's
// in the nav/drawer (those stay ad-free). Three varied slots: a leaderboard banner, a
// mid-content rectangle, and the native banner already used elsewhere on the site.
export function adSlotTop() {
  return `<div class="ad-slot" style="margin:20px auto; max-width:728px; text-align:center;">
  <span class="ad-slot-label">Advertisement</span>
  <script>atOptions = { 'key':'3d822fd28f7e2dcb27760223dda2eb9c', 'format':'iframe', 'height':90, 'width':728, 'params':{} };</script>
  <script src="https://www.highrevenueformat.com/3d822fd28f7e2dcb27760223dda2eb9c/invoke.js"></script>
</div>`;
}
export function adSlotMiddle() {
  return `<div class="ad-slot" style="margin:24px auto; max-width:300px; text-align:center;">
  <span class="ad-slot-label">Advertisement</span>
  <script>atOptions = { 'key':'8e6309b4097896ed979f562c5d09f06e', 'format':'iframe', 'height':250, 'width':300, 'params':{} };</script>
  <script src="https://www.highrevenueformat.com/8e6309b4097896ed979f562c5d09f06e/invoke.js"></script>
</div>`;
}
export function adSlotBottom() {
  return `<div class="ad-slot ad-slot-native">
  <span class="ad-slot-label">Advertisement</span>
  <script async="async" data-cfasync="false" src="https://pl31528379.profitableratecpmnetwork.com/1dd0069cb22b02f6884ad8e7e72afcb2/invoke.js"></script>
  <div id="container-1dd0069cb22b02f6884ad8e7e72afcb2"></div>
</div>`;
}

export function ctaSectionHtml({ heading, body, label = 'Create Free Account', href = '/auth/' }) {
  return `<section class="section" style="padding-top:0;">
  <div class="container panel" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:20px; max-width:820px;">
    <div>
      <h2 style="font-size:1.3rem; margin-bottom:6px;">${esc(heading)}</h2>
      <p class="muted" style="margin:0;">${esc(body)}</p>
    </div>
    <a href="${href}" class="btn btn-primary"><i data-lucide="user-plus" class="icon-sm icon-inline"></i>${esc(label)}</a>
  </div>
</section>`;
}

export function breadcrumbLd(crumbs) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}

export function breadcrumbHtml(crumbs) {
  return `<nav aria-label="Breadcrumb" style="margin-bottom:14px;"><ol style="list-style:none; display:flex; gap:6px; padding:0; margin:0; font-size:0.8rem; flex-wrap:wrap;" class="muted">${
    crumbs.map((c, i) => i === crumbs.length - 1
      ? `<li aria-current="page">${esc(c.name)}</li>`
      : `<li><a href="${c.url.replace('https://bloxcores.com', '')}" class="muted">${esc(c.name)}</a></li><li aria-hidden="true">/</li>`).join('')
  }</ol></nav>`;
}
