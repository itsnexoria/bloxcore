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

// Fetches an image and inlines it as a data: URI so the ImageResponse renderer never makes a
// *remote* fetch mid-render (the documented failure mode noted on the trade card) — the bytes
// are already in hand by the time we hand HTML to it. Returns null on any failure so callers
// can render a text-only fallback instead of ever throwing.
async function fetchImageAsDataUri(imageUrl, { timeoutMs = 3000 } = {}) {
  if (!imageUrl) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2_000_000) return null; // guard against an unexpectedly huge image
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
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

class CanonicalRewriter {
  constructor(url) { this.url = url; }
  element(el) {
    if (this.url && el.getAttribute('rel') === 'canonical') el.setAttribute('href', this.url);
  }
}

function rewriteMeta(response, data) {
  return new HTMLRewriter()
    .on('title', new MetaRewriter(data))
    .on('meta', new MetaRewriter(data))
    .on('link', new CanonicalRewriter(data.url))
    .transform(response);
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
    title: title,
    description: description,
    image: `https://bloxcores.com/og/player.png?u=${encodeURIComponent(profile.username)}`,
    imageAlt: `${name}'s BloxCore profile card`,
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
    title: title,
    description: description,
    image: bigAvatar(profile.avatar_url) || undefined,
    imageAlt: `${name}'s avatar`,
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
    title: title,
    description: description,
    image: `https://bloxcores.com/og/crew.png?name=${encodeURIComponent(crew.name)}`,
    imageAlt: `${crew.name} crew card`,
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
    title: title,
    description: description.slice(0, 200),
    image: `https://bloxcores.com/og/trade.png?listing=${encodeURIComponent(listingId)}`,
    imageAlt: 'Trade details',
    url: `https://bloxcores.com/trading/?listing=${encodeURIComponent(listingId)}`,
  });
}

// Composited profile-card image for og:image — same branded-card look as the trade card, but
// with the player's own avatar inlined as a data: URI (see fetchImageAsDataUri) when one exists.
// Falls back to a plain initial-letter badge if there's no avatar or the fetch/render fails, and
// to the static site banner if anything else goes wrong — never a broken or blank embed.
async function handleOgPlayerImage(request, env, url) {
  const fallback = () => Response.redirect('https://bloxcores.com/assets/og-banner.jpg', 302);
  const username = url.searchParams.get('u');
  if (!username) return fallback();

  try {
    const profile = await supabaseGet(
      `profiles?username=eq.${encodeURIComponent(username)}&select=username,display_name,avatar_url,level,login_streak,pvp_rating`
    );
    if (!profile) return fallback();

    const name = escapeAttr(profile.display_name || profile.username);
    const avatarData = await fetchImageAsDataUri(bigAvatar(profile.avatar_url));
    const avatarHtml = avatarData
      ? `<img src="${avatarData}" width="180" height="180" style="border-radius:50%; border:4px solid #d6a841; object-fit:cover;" />`
      : `<div style="display:flex; align-items:center; justify-content:center; width:180px; height:180px; border-radius:50%; border:4px solid #d6a841; background:rgba(214,168,65,0.12); color:#d6a841; font-size:72px; font-weight:800;">${escapeAttr((profile.display_name || profile.username || '?')[0].toUpperCase())}</div>`;

    const html = `
      <div style="display:flex; flex-direction:column; width:1200px; height:630px; background:linear-gradient(135deg, #0a0e17, #131c2e); padding:60px; font-family:sans-serif;">
        <div style="display:flex; flex-direction:column;">
          <div style="display:flex; color:#d6a841; font-size:30px; font-weight:700; letter-spacing:2px;">BLOXCORE</div>
          <div style="display:flex; color:#8892a6; font-size:22px; margin-top:4px;">bloxcores.com</div>
        </div>
        <div style="display:flex; flex:1; align-items:center; gap:48px; margin-top:24px;">
          ${avatarHtml}
          <div style="display:flex; flex-direction:column;">
            <div style="display:flex; color:#f4f2ea; font-size:52px; font-weight:800;">${name}</div>
            <div style="display:flex; color:#d6a841; font-size:28px; font-weight:600; margin-top:10px;">Level ${profile.level ?? 1} Pirate</div>
            <div style="display:flex; gap:28px; margin-top:24px;">
              <div style="display:flex; flex-direction:column; background:rgba(255,255,255,0.05); border:2px solid rgba(214,168,65,0.35); border-radius:14px; padding:16px 24px;">
                <div style="display:flex; color:#8892a6; font-size:18px;">Streak</div>
                <div style="display:flex; color:#f4f2ea; font-size:30px; font-weight:700;">${profile.login_streak || 0}</div>
              </div>
              <div style="display:flex; flex-direction:column; background:rgba(255,255,255,0.05); border:2px solid rgba(214,168,65,0.35); border-radius:14px; padding:16px 24px;">
                <div style="display:flex; color:#8892a6; font-size:18px;">PvP Rating</div>
                <div style="display:flex; color:#f4f2ea; font-size:30px; font-weight:700;">${profile.pvp_rating ?? '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    return new ImageResponse(html, { width: 1200, height: 630 });
  } catch {
    return fallback();
  }
}

// Same pattern for crew pages — crew logo inlined as a data: URI when available.
async function handleOgCrewImage(request, env, url) {
  const fallback = () => Response.redirect('https://bloxcores.com/assets/og-banner.jpg', 302);
  const name = url.searchParams.get('name');
  if (!name) return fallback();

  try {
    const crew = await supabaseGet(
      `crews?name=eq.${encodeURIComponent(name)}&select=name,tag,logo_url,crew_members(count)`
    );
    if (!crew) return fallback();

    const memberCount = crew.crew_members?.[0]?.count ?? 0;
    const crewName = escapeAttr(`${crew.tag ? `[${crew.tag}] ` : ''}${crew.name}`);
    const logoData = await fetchImageAsDataUri(crew.logo_url);
    const logoHtml = logoData
      ? `<img src="${logoData}" width="180" height="180" style="border-radius:24px; border:4px solid #d6a841; object-fit:cover;" />`
      : `<div style="display:flex; align-items:center; justify-content:center; width:180px; height:180px; border-radius:24px; border:4px solid #d6a841; background:rgba(214,168,65,0.12); color:#d6a841; font-size:72px; font-weight:800;">${escapeAttr((crew.name || '?')[0].toUpperCase())}</div>`;

    const html = `
      <div style="display:flex; flex-direction:column; width:1200px; height:630px; background:linear-gradient(135deg, #0a0e17, #131c2e); padding:60px; font-family:sans-serif;">
        <div style="display:flex; flex-direction:column;">
          <div style="display:flex; color:#d6a841; font-size:30px; font-weight:700; letter-spacing:2px;">BLOXCORE</div>
          <div style="display:flex; color:#8892a6; font-size:22px; margin-top:4px;">bloxcores.com</div>
        </div>
        <div style="display:flex; flex:1; align-items:center; gap:48px; margin-top:24px;">
          ${logoHtml}
          <div style="display:flex; flex-direction:column;">
            <div style="display:flex; color:#f4f2ea; font-size:48px; font-weight:800;">${crewName}</div>
            <div style="display:flex; color:#8892a6; font-size:26px; margin-top:14px;">${memberCount} member${memberCount === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>
    `;
    return new ImageResponse(html, { width: 1200, height: 630 });
  } catch {
    return fallback();
  }
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

// Pages that were folded into tabs of other pages — permanent redirects keep old links, bookmarks and search results working.
// Existing query params (e.g. ?give=…&get=… on the calculator, ?u=… on the scam checker, ?l=… on shared tier lists) are preserved.
const MOVED_PAGES = {
  '/trade-calculator/': ['/trading/', 'calculator'],
  '/blox-fruits-value-changes/': ['/trading/', 'values'],
  '/scam-check/': ['/trading/', 'scam'],
  '/blox-fruits-updates/': ['/whats-new/', 'game'],
  '/tier-maker/': ['/build/', 'tiers'],
  '/build-planner/': ['/build/', 'planner'],
};


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /feed/?post=<id> — shareable post link: rewrite title/description/og:image for crawlers and chat unfurls.
async function handleFeed(request, env, url) {
  const id = url.searchParams.get('post');
  if (!id || !UUID_RE.test(id)) return env.ASSETS.fetch(request);
  const [post, response] = await Promise.all([
    supabaseGet(`feed_posts?id=eq.${id}&select=content,user_id,visibility`),
    env.ASSETS.fetch(request),
  ]);
  if (!post || post.visibility !== 'public') return response;
  const author = await supabaseGet(`profiles?id=eq.${post.user_id}&select=username,display_name`);
  const name = author?.display_name || author?.username || 'A pirate';
  const snippet = (post.content || '').replace(/\s+/g, ' ').trim();
  return rewriteMeta(response, {
    title: `${name} on BloxCore: “${snippet.slice(0, 60)}${snippet.length > 60 ? '…' : ''}”`,
    description: (snippet || 'A post on the BloxCore feed.').slice(0, 200),
    image: `https://bloxcores.com/og/post.png?id=${id}`,
    imageAlt: `${name}'s post on BloxCore`,
    url: `https://bloxcores.com/feed/?post=${id}`,
  });
}

// /challenges/?c=<id> — shareable bounty link.
async function handleChallenges(request, env, url) {
  const id = url.searchParams.get('c');
  if (!id || !UUID_RE.test(id)) return env.ASSETS.fetch(request);
  const [c, response] = await Promise.all([
    supabaseGet(`challenges?id=eq.${id}&select=title,description,difficulty,xp_reward`),
    env.ASSETS.fetch(request),
  ]);
  if (!c) return response;
  return rewriteMeta(response, {
    title: `${c.title} — ${c.difficulty} Bounty (+${c.xp_reward} XP) — BloxCore`,
    description: (c.description || `A ${c.difficulty} bounty worth ${c.xp_reward} XP on BloxCore.`).slice(0, 200),
    image: `https://bloxcores.com/og/bounty.png?id=${id}`,
    imageAlt: `${c.title} bounty card`,
    url: `https://bloxcores.com/challenges/?c=${id}`,
  });
}

async function handleOgPostImage(request, env, url) {
  const fallback = () => Response.redirect('https://bloxcores.com/assets/og-banner.jpg', 302);
  const id = url.searchParams.get('id');
  if (!id || !UUID_RE.test(id)) return fallback();
  try {
    const post = await supabaseGet(`feed_posts?id=eq.${id}&select=content,user_id,image_url,visibility`);
    if (!post || post.visibility !== 'public') return fallback();
    const [author, likes, comments] = await Promise.all([
      supabaseGet(`profiles?id=eq.${post.user_id}&select=username,display_name,avatar_url`),
      supabaseGet(`feed_likes?post_id=eq.${id}&select=count`),
      supabaseGet(`feed_comments?post_id=eq.${id}&select=count`),
    ]);
    const name = escapeAttr(author?.display_name || author?.username || 'A pirate');
    const text = escapeAttr((post.content || '').replace(/\s+/g, ' ').trim().slice(0, 230) + ((post.content || '').length > 230 ? '…' : ''));
    const [avatarData, imageData] = await Promise.all([
      fetchImageAsDataUri(bigAvatar(author?.avatar_url)),
      post.image_url ? fetchImageAsDataUri(post.image_url) : Promise.resolve(null),
    ]);
    const avatar = avatarData
      ? `<img src="${avatarData}" width="84" height="84" style="border-radius:50%; border:3px solid #d6a841; object-fit:cover;" />`
      : `<div style="display:flex; align-items:center; justify-content:center; width:84px; height:84px; border-radius:50%; border:3px solid #d6a841; background:rgba(214,168,65,0.12); color:#d6a841; font-size:38px; font-weight:700;">${name.charAt(0).toUpperCase()}</div>`;
    const html = `
      <div style="display:flex; flex-direction:column; width:1200px; height:630px; background:linear-gradient(135deg, #0a0e17, #131c2e); padding:56px; font-family:sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; color:#d6a841; font-size:30px; font-weight:700; letter-spacing:2px;">BLOXCORE</div>
          <div style="display:flex; color:#8892a6; font-size:22px;">bloxcores.com/feed</div>
        </div>
        <div style="display:flex; flex:1; gap:40px; margin-top:28px;">
          <div style="display:flex; flex-direction:column; flex:1;">
            <div style="display:flex; align-items:center; gap:20px;">
              ${avatar}
              <div style="display:flex; color:#f4f2ea; font-size:40px; font-weight:800;">${name}</div>
            </div>
            <div style="display:flex; flex:1; margin-top:28px; color:#f4f2ea; font-size:${text.length > 140 ? 34 : 42}px; line-height:1.35; overflow:hidden;">${text || 'Shared a post on the BloxCore feed.'}</div>
            <div style="display:flex; gap:28px; color:#8892a6; font-size:26px;">
              <div style="display:flex;">♥ ${likes?.count ?? 0}</div>
              <div style="display:flex;">💬 ${comments?.count ?? 0}</div>
            </div>
          </div>
          ${imageData ? `<div style="display:flex; width:380px; height:380px; align-self:center; border-radius:20px; overflow:hidden; border:2px solid rgba(214,168,65,0.35);"><img src="${imageData}" width="380" height="380" style="object-fit:cover;" /></div>` : ''}
        </div>
      </div>`;
    return new ImageResponse(html, { width: 1200, height: 630 });
  } catch {
    return fallback();
  }
}

async function handleOgBountyImage(request, env, url) {
  const fallback = () => Response.redirect('https://bloxcores.com/assets/og-banner.jpg', 302);
  const id = url.searchParams.get('id');
  if (!id || !UUID_RE.test(id)) return fallback();
  try {
    const c = await supabaseGet(`challenges?id=eq.${id}&select=title,description,difficulty,xp_reward`);
    if (!c) return fallback();
    const tone = { easy: '#34d399', medium: '#fbbf24', hard: '#fb7185', insane: '#c084fc' }[String(c.difficulty).toLowerCase()] || '#d6a841';
    const title = escapeAttr(c.title);
    const desc = escapeAttr((c.description || '').replace(/\s+/g, ' ').slice(0, 170) + ((c.description || '').length > 170 ? '…' : ''));
    const html = `
      <div style="display:flex; flex-direction:column; width:1200px; height:630px; background:linear-gradient(135deg, #0a0e17, #131c2e); padding:60px; font-family:sans-serif;">
        <div style="display:flex; flex-direction:column;">
          <div style="display:flex; color:#d6a841; font-size:30px; font-weight:700; letter-spacing:2px;">BLOXCORE · BOUNTY</div>
          <div style="display:flex; color:#8892a6; font-size:22px; margin-top:4px;">bloxcores.com/challenges</div>
        </div>
        <div style="display:flex; flex-direction:column; flex:1; justify-content:center;">
          <div style="display:flex; margin-bottom:22px;"><div style="display:flex; padding:8px 26px; border-radius:999px; border:3px solid ${tone}; color:${tone}; font-size:28px; font-weight:800; text-transform:uppercase;">${escapeAttr(String(c.difficulty))}</div></div>
          <div style="display:flex; color:#f4f2ea; font-size:${title.length > 38 ? 54 : 70}px; font-weight:800; line-height:1.12;">${title}</div>
          <div style="display:flex; color:#8892a6; font-size:28px; line-height:1.4; margin-top:22px;">${desc}</div>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="display:flex; background:rgba(255,255,255,0.05); border:2px solid rgba(214,168,65,0.45); border-radius:16px; padding:14px 28px; color:#d6a841; font-size:40px; font-weight:800;">+${c.xp_reward} XP</div>
        </div>
      </div>`;
    return new ImageResponse(html, { width: 1200, height: 630 });
  } catch {
    return fallback();
  }
}

function movedPageRedirect(url) {
  const key = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const target = MOVED_PAGES[key];
  if (!target) return null;
  const dest = new URL(target[0], url.origin);
  const params = new URLSearchParams({ tab: target[1] });
  for (const [k, v] of url.searchParams) if (k !== 'tab') params.append(k, v);
  dest.search = params.toString();
  return Response.redirect(dest.toString(), 301);
}

// Social crawlers re-request OG images constantly; let Cloudflare/browsers cache them briefly.
function withOgCache(res) {
  if (!(res instanceof Response) || res.status !== 200) return res;
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const moved = movedPageRedirect(url);
    if (moved) return moved;
    try {
      if (url.pathname === '/player/') return await handlePlayer(request, env, url);
      if (url.pathname === '/auth/') return await handleAuth(request, env, url);
      if (url.pathname === '/crew/') return await handleCrew(request, env, url);
      if (url.pathname === '/trading/') return await handleTrading(request, env, url);
      if (url.pathname === '/feed/') return await handleFeed(request, env, url);
      if (url.pathname === '/challenges/') return await handleChallenges(request, env, url);
      if (url.pathname === '/og/post.png') return withOgCache(await handleOgPostImage(request, env, url));
      if (url.pathname === '/og/bounty.png') return withOgCache(await handleOgBountyImage(request, env, url));
      if (url.pathname === '/og/trade.png') return withOgCache(await handleOgTradeImage(request, env, url));
      if (url.pathname === '/og/player.png') return withOgCache(await handleOgPlayerImage(request, env, url));
      if (url.pathname === '/og/crew.png') return withOgCache(await handleOgCrewImage(request, env, url));
    } catch (err) {
      // Any failure (Supabase down, bad data, etc.) should never take the page down —
      // fall through to the plain static page instead.
      return env.ASSETS.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
