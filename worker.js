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
    image: profile.avatar_url || undefined,
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
    image: profile.avatar_url || undefined,
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
  const firstImage = itemsById[offeringIds[0]]?.icon_url || itemsById[requestingIds[0]]?.icon_url;

  const title = `${posterName}'s Trade — BloxCore`;
  const description = `Offering: ${nameList(offeringIds)}. Looking for: ${nameList(requestingIds)}.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description.slice(0, 200)),
    image: firstImage || undefined,
    imageAlt: escapeAttr('Trade item'),
    url: `https://bloxcores.com/trading/?listing=${encodeURIComponent(listingId)}`,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/player/') return await handlePlayer(request, env, url);
      if (url.pathname === '/auth/') return await handleAuth(request, env, url);
      if (url.pathname === '/crew/') return await handleCrew(request, env, url);
      if (url.pathname === '/trading/') return await handleTrading(request, env, url);
    } catch (err) {
      // Any failure (Supabase down, bad data, etc.) should never take the page down —
      // fall through to the plain static page instead.
      return env.ASSETS.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
