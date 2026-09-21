// Shared helpers for the dynamic-OG-tag Pages Functions under /functions/.
// These intercept a handful of shareable routes (profile, referral, crew, trade listing)
// server-side and rewrite the <meta> tags before the response reaches the client — this
// is required because link-unfurling bots (Discord, Twitter/X, iMessage, etc.) only ever
// read the raw HTML; they never execute the site's client-side JS.

export const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';

export async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] || null : data;
}

export function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rewrites <title>, meta[name=description], og:*, and twitter:* tags in one pass.
// Any field left undefined in `data` leaves that tag untouched (falls back to the
// page's own static default rather than blanking it out).
export class MetaRewriter {
  constructor(data) {
    this.data = data;
  }
  element(el) {
    const tag = el.tagName;
    const { title, description, image, url, imageAlt } = this.data;

    if (tag === 'title' && title) {
      el.setInnerContent(title);
    }
    if (tag === 'meta') {
      const name = el.getAttribute('name');
      const prop = el.getAttribute('property');
      if (name === 'description' && description) el.setAttribute('content', description);
      if (prop === 'og:title' && title) el.setAttribute('content', title);
      if (prop === 'og:description' && description) el.setAttribute('content', description);
      if (prop === 'og:image' && image) el.setAttribute('content', image);
      if (prop === 'og:image:alt' && imageAlt) el.setAttribute('content', imageAlt);
      if (prop === 'og:url' && url) el.setAttribute('content', url);
      if (name === 'twitter:title' && title) el.setAttribute('content', title);
      if (name === 'twitter:description' && description) el.setAttribute('content', description);
      if (name === 'twitter:image' && image) el.setAttribute('content', image);
      if (name === 'twitter:card' && image) el.setAttribute('content', 'summary_large_image');
    }
  }
}

export function rewriteMeta(response, data) {
  return new HTMLRewriter().on('title', new MetaRewriter(data)).on('meta', new MetaRewriter(data)).transform(response);
}

export function formatValue(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K';
  return String(n);
}
