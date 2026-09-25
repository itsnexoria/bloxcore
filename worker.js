// BloxCore — Worker entry point. This project deploys as a plain Cloudflare Worker with
// static assets (not Cloudflare Pages), so the Pages-only `functions/` directory
// convention does nothing here. This file is the real, working equivalent: it only runs
// for the four route patterns listed in wrangler.jsonc's `assets.run_worker_first` —
// everything else is served straight from static assets without ever touching this code.
//
// For a matching route with the right query param, it fetches the static HTML via the
// ASSETS binding, then rewrites the <title>/meta tags with real data before responding —
// this is required because link-unfurling bots (Discord, Twitter/X, iMessage, etc.) only
// ever read the raw HTML; they never run the site's client-side JS.

import { ImageResponse } from 'cf-workers-og/html';

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] || null : data;
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Discord CDN avatar URLs default to a small size (often 128px) unless you ask for bigger —
// that's most of why the unfurled card looked "ugly": a tiny, often-pixelated square image
// stretched into Discord's large embed-image slot. Request a proper size when we can.
function bigAvatar(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'cdn.discordapp.com') u.searchParams.set('size', '512');
    return u.toString();
  } catch {
    return url;
  }
}

class MetaRewriter {
  constructor(data) {
    this.data = data;
  }
  element(el) {
    const tag = el.tagName;
    const { title, description, image, url, imageAlt } = this.data;
    if (tag === 'title' && title) el.setInnerContent(title);
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

function rewriteMeta(response, data) {
  return new HTMLRewriter().on('title', new MetaRewriter(data)).on('meta', new MetaRewriter(data)).transform(response);
}

async function handlePlayer(request, env, url) {
  const username = url.searchParams.get('u');
  if (!username) return env.ASSETS.fetch(request);

  const profile = await supabaseGet(
    `profiles?username=eq.${encodeURIComponent(username)}&select=username,display_name,avatar_url,level,status_line`
  );
  const response = await env.ASSETS.fetch(request);
  if (!profile) return response;

  const name = profile.display_name || profile.username;
  const title = `${name} (@${profile.username}) — Level ${profile.level} — BloxCore`;
  const description = profile.status_line
    ? `"${profile.status_line}" — Level ${profile.level} pirate on BloxCore, the #1 Blox Fruits community.`
    : `Level ${profile.level} pirate on BloxCore, the #1 Blox Fruits community. Check their quests, trades, and crew.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description),
    image: bigAvatar(profile.avatar_url) || undefined,
    imageAlt: escapeAttr(`${name}'s avatar`),
    url: `https://bloxcores.com/player/?u=${encodeURIComponent(profile.username)}`,
  });
}

async function handleAuth(request, env, url) {
  const refUsername = url.searchParams.get('ref');
  if (!refUsername) return env.ASSETS.fetch(request);

  const profile = await supabaseGet(
    `profiles?username=eq.${encodeURIComponent(refUsername)}&select=username,display_name,avatar_url,level`
  );
  const response = await env.ASSETS.fetch(request);
  if (!profile) return response;

  const name = profile.display_name || profile.username;
  const title = `${name} invited you to BloxCore!`;
  const description = `${name} is a Level ${profile.level} pirate on BloxCore, the #1 Blox Fruits community — trading, bounty hunting, crews, and more. Join with their link and you're both in.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description),
    image: bigAvatar(profile.avatar_url) || undefined,
    imageAlt: escapeAttr(`${name}'s avatar`),
    url: `https://bloxcores.com/auth/?ref=${encodeURIComponent(profile.username)}`,
  });
}

async function handleCrew(request, env, url) {
  const name = url.searchParams.get('name');
  if (!name) return env.ASSETS.fetch(request);

  const crew = await supabaseGet(
    `crews?name=eq.${encodeURIComponent(name)}&select=name,tag,description,logo_url,banner_url,crew_members(count)`
  );
  const response = await env.ASSETS.fetch(request);
  if (!crew) return response;

  const memberCount = crew.crew_members?.[0]?.count ?? 0;
  const title = `${crew.tag ? `[${crew.tag}] ` : ''}${crew.name} — BloxCore Crew`;
  const description = crew.description
    ? crew.description.slice(0, 160)
    : `${memberCount} member${memberCount === 1 ? '' : 's'} — a Blox Fruits crew on BloxCore.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description),
    image: crew.banner_url || crew.logo_url || undefined,
    imageAlt: escapeAttr(`${crew.name} banner`),
    url: `https://bloxcores.com/crew/?name=${encodeURIComponent(crew.name)}`,
  });
}

async function handleTrading(request, env, url) {
  const listingId = url.searchParams.get('listing');
  if (!listingId) return env.ASSETS.fetch(request);

  const listing = await supabaseGet(
    `trade_listings?id=eq.${encodeURIComponent(listingId)}&select=offering_item_ids,requesting_item_ids,profiles(username,display_name)`
  );
  const response = await env.ASSETS.fetch(request);
  if (!listing) return response;

  const offeringIds = (listing.offering_item_ids || []).map(i => i.id);
  const requestingIds = (listing.requesting_item_ids || []).map(i => i.id);
  const allIds = [...new Set([...offeringIds, ...requestingIds])];

  let itemsById = {};
  if (allIds.length) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bf_items?id=in.(${allIds.join(',')})&select=id,name,icon_url`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (res.ok) {
      for (const item of await res.json()) itemsById[item.id] = item;
    }
  }

  const nameList = (ids) => ids.map(id => itemsById[id]?.name).filter(Boolean).join(', ') || 'items';
  const posterName = listing.profiles?.display_name || listing.profiles?.username || 'A trader';

  const title = `${posterName}'s Trade — BloxCore`;
  const description = `Offering: ${nameList(offeringIds)}. Looking for: ${nameList(requestingIds)}.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description.slice(0, 200)),
    image: `https://bloxcores.com/og/trade.png?listing=${encodeURIComponent(listingId)}`,
    imageAlt: escapeAttr('Trade details'),
    url: `https://bloxcores.com/trading/?listing=${encodeURIComponent(listingId)}`,
  });
}

// Composited trade-card image for og:image — text-only by design. An earlier version
// embedded remote item-icon <img> URLs directly in the render, but that's a documented
// real-world failure mode for image-generation libraries in Workers (the remote fetch can
// blow up the whole request at render time even when it works in testing) — so this only
// ever renders text/shapes it already has in hand, no network calls mid-render.
async function handleOgTradeImage(request, env, url) {
  const fallback = () => Response.redirect('https://bloxcores.com/assets/og-banner.jpg', 302);
  const listingId = url.searchParams.get('listing');
  if (!listingId) return fallback();

  try {
    const listing = await supabaseGet(
      `trade_listings?id=eq.${encodeURIComponent(listingId)}&select=offering_item_ids,requesting_item_ids,profiles(username,display_name)`
    );
    if (!listing) return fallback();

    const offeringIds = (listing.offering_item_ids || []).map(i => i.id);
    const requestingIds = (listing.requesting_item_ids || []).map(i => i.id);
    const allIds = [...new Set([...offeringIds, ...requestingIds])];

    let itemsById = {};
    if (allIds.length) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bf_items?id=in.(${allIds.join(',')})&select=id,name`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (res.ok) {
        for (const item of await res.json()) itemsById[item.id] = item;
      }
    }

    const namesFor = (ids) => ids.map(id => itemsById[id]?.name).filter(Boolean);
    const offeringNames = namesFor(offeringIds);
    const requestingNames = namesFor(requestingIds);
    const posterName = escapeAttr(listing.profiles?.display_name || listing.profiles?.username || 'A trader');

    const itemListHtml = (names) => {
      const shown = names.slice(0, 5);
      const extra = names.length - shown.length;
      const rows = shown.map(n => `<div style="display:flex; color:#f4f2ea; font-size:26px; margin-bottom:10px;">• ${escapeAttr(n)}</div>`).join('');
      const more = extra > 0 ? `<div style="display:flex; color:#8892a6; font-size:22px;">+${extra} more</div>` : '';
      return rows + more || '<div style="display:flex; color:#8892a6; font-size:24px;">Nothing listed</div>';
    };

    const html = `
      <div style="display:flex; flex-direction:column; width:1200px; height:630px; background:linear-gradient(135deg, #0a0e17, #131c2e); padding:60px; font-family:sans-serif;">
        <div style="display:flex; flex-direction:column;">
          <div style="display:flex; color:#d6a841; font-size:30px; font-weight:700; letter-spacing:2px;">BLOXCORE</div>
          <div style="display:flex; color:#8892a6; font-size:22px; margin-top:4px;">bloxcores.com</div>
        </div>
        <div style="display:flex; color:#f4f2ea; font-size:44px; font-weight:800; margin-top:24px;">${posterName}'s Trade</div>
        <div style="display:flex; flex:1; margin-top:36px; gap:32px;">
          <div style="display:flex; flex-direction:column; flex:1; background:rgba(255,255,255,0.05); border:2px solid rgba(214,168,65,0.35); border-radius:18px; padding:28px;">
            <div style="display:flex; color:#d6a841; font-size:22px; font-weight:700; letter-spacing:1px; margin-bottom:18px;">OFFERING</div>
            ${itemListHtml(offeringNames)}
          </div>
          <div style="display:flex; align-items:center; justify-content:center; color:#8892a6; font-size:36px; font-weight:700;">→</div>
          <div style="display:flex; flex-direction:column; flex:1; background:rgba(255,255,255,0.05); border:2px solid rgba(214,168,65,0.35); border-radius:18px; padding:28px;">
            <div style="display:flex; color:#d6a841; font-size:22px; font-weight:700; letter-spacing:1px; margin-bottom:18px;">LOOKING FOR</div>
            ${itemListHtml(requestingNames)}
          </div>
        </div>
      </div>
    `;

    return new ImageResponse(html, { width: 1200, height: 630 });
  } catch (err) {
    // Any failure in the render pipeline (WASM hiccup, bad data, timeout) falls back to a
    // static image rather than ever surfacing a broken/blank embed.
    return fallback();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/player/') return await handlePlayer(request, env, url);
      if (url.pathname === '/auth/') return await handleAuth(request, env, url);
      if (url.pathname === '/crew/') return await handleCrew(request, env, url);
      if (url.pathname === '/trading/') return await handleTrading(request, env, url);
      if (url.pathname === '/og/trade.png') return await handleOgTradeImage(request, env, url);
    } catch (err) {
      // Any failure (Supabase down, bad data, etc.) should never take the page down —
      // fall through to the plain static page instead.
      return env.ASSETS.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
