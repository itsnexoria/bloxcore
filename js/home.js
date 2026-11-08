// BloxCore — index.html logic (trending values strip)

onReady(() => {
  loadEventBanner();
  loadLiveStrip();
  loadTrending();
  loadMovers();
  loadBoard();
  loadWhatsNew();
  loadJoinBand();
});

function endsInShort(iso) {
  const m = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

// "Live on BloxCore" — real counts only. Hidden entirely when nothing is live (no empty/fake widget).
async function loadLiveStrip() {
  const section = document.getElementById('live-strip');
  const grid = document.getElementById('live-strip-grid');
  if (!section || !grid) return;
  const nowIso = new Date().toISOString();
  const count = q => q.then(r => (r.error ? 0 : r.count || 0), () => 0);
  const [seaEvents, pvp, trades, giveawayRes] = await Promise.all([
    count(sb.from('sea_events').select('id', { count: 'exact', head: true }).gt('expires_at', nowIso)),
    count(sb.from('pvp_matches').select('id', { count: 'exact', head: true }).gt('expires_at', nowIso)),
    count(sb.from('trade_listings').select('id', { count: 'exact', head: true }).eq('active', true).gt('expires_at', nowIso)),
    sb.from('giveaways').select('title, prize, ends_at', { count: 'exact' })
      .eq('status', 'active').gt('ends_at', nowIso).order('ends_at', { ascending: true }).limit(1),
  ]);
  const giveaways = giveawayRes.error ? 0 : giveawayRes.count || 0;
  const next = giveawayRes.data && giveawayRes.data[0];
  const cards = [
    { href: '/sea-events/', icon: 'waves', tone: 'blue', n: seaEvents, label: seaEvents === 1 ? 'Sea event live' : 'Sea events live', sub: 'Join a hosted lobby' },
    { href: '/giveaways/', icon: 'gift', tone: 'purple', n: giveaways, label: giveaways === 1 ? 'Giveaway running' : 'Giveaways running',
      sub: next ? `${next.prize || next.title} · ends in ${endsInShort(next.ends_at)}` : 'Check back soon' },
    { href: '/pvp/', icon: 'crosshair', tone: 'gold', n: pvp, label: pvp === 1 ? 'PvP lobby open' : 'PvP lobbies open', sub: 'Find a match' },
    { href: '/trading/', icon: 'repeat', tone: 'sea', n: trades, label: trades === 1 ? 'Active trade' : 'Active trades', sub: 'Browse listings' },
  ];
  if (!cards.some(c => c.n > 0)) return;
  grid.innerHTML = cards.map(c => `
    <a href="${c.href}" class="panel live-card hover-lift-card${c.n ? '' : ' live-card-empty'}" data-tone="${c.tone}">
      <span class="live-card-icon"><i data-lucide="${c.icon}"></i></span>
      <span class="live-card-body">
        <span class="live-card-count">${c.n}</span>
        <span class="live-card-label">${c.label}</span>
        <span class="live-card-sub">${escapeHtml(c.sub)}</span>
      </span>
    </a>`).join('');
  section.style.display = '';
  refreshIcons();
}

// Matches /blox-fruits-values/<slug>/ exactly (scripts/lib/shell.mjs's slugify()) — no shared
// client-side version of this existed before since no page linked to item pages from JS.
function slugifyItemName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// "Trending" here means members' value votes (>= 5 votes, >= 60% one way) plus the trend flag on
// bf_items (up/overpaid/underpaid/unstable), not a computed week-over-week % change — the price-history table exists but is
// too sparse right now (everything on record is from one same-value bulk save) for a real
// "moved X% this week" claim to be honest. This uses what's actually true today instead.
const TREND_LABEL = { up: 'Trending Up', overpaid: 'Overpaid', underpaid: 'Underpaid', unstable: 'Unstable' };
const TREND_STYLE = {
  up: { color: 'var(--sea)', icon: 'trending-up' },
  underpaid: { color: 'var(--sea)', icon: 'tag' },
  overpaid: { color: '#f87171', icon: 'trending-down' },
  unstable: { color: '#fbbf24', icon: 'activity' },
};
async function loadTrending() {
  const section = document.getElementById('trending-section');
  const grid = document.getElementById('trending-grid');
  if (!section || !grid) return;
  // Community picks (members' Overpaid/Underpaid votes, see js/item-votes.js) come first, then the
  // trend flags set on bf_items fill the remaining slots. Either source failing just drops that source.
  const [community, flagged] = await Promise.all([
    sb.rpc('get_community_trending', { p_limit: 6 }),
    sb.from('bf_items')
      .select('name, category, regular_value, icon_url, trend')
      .neq('trend', 'stable')
      .not('regular_value', 'is', null)
      .order('regular_value', { ascending: false })
      .limit(6),
  ]);
  const picks = (community.data || []).map((r) => ({
    name: r.name, regular_value: r.regular_value, icon_url: r.icon_url, trend: r.verdict,
    community: `${r.share}% of ${r.votes} votes`,
  }));
  const seen = new Set(picks.map((p) => p.name));
  const data = [...picks, ...(flagged.data || []).filter((i) => !seen.has(i.name))].slice(0, 6);
  if (!data.length) return; // stays hidden — no fake/empty widget
  grid.innerHTML = data.map((item, i) => {
    const t = TREND_STYLE[item.trend] || { color: 'var(--ash)', icon: 'minus' };
    const label = (item.community ? 'Community: ' : '') + (TREND_LABEL[item.trend] || item.trend);
    return `
      <a href="/blox-fruits-values/${slugifyItemName(item.name)}/" class="panel trending-tile hover-lift-card" style="--tile-accent:${t.color};"${item.community ? ` title="${escapeHtml(item.community)} say ${escapeHtml(item.trend)}"` : ''}>
        <span class="trending-tile-rank">#${i + 1}</span>
        <span class="trending-tile-img">${item.icon_url ? `<img src="${escapeHtml(item.icon_url)}" alt="" loading="lazy" width="52" height="52">` : '<i data-lucide="sparkles"></i>'}</span>
        <span class="trending-tile-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="trending-tile-value">${formatValue(item.regular_value)}</span>
        <span class="trending-tile-badge"><i data-lucide="${t.icon}"></i>${escapeHtml(label)}</span>
      </a>`;
  }).join('');
  section.style.display = '';
  refreshIcons();
}

// ---- Latest game update banner (only while it is still fresh: released in the last 30 days) ----
async function loadEventBanner() {
  const section = document.getElementById('home-event');
  if (!section) return;
  const { data } = await sb.from('game_updates').select('slug, name, summary, released_on').order('released_on', { ascending: false }).limit(1);
  const u = data && data[0];
  if (!u) return;
  const released = new Date(`${u.released_on}T00:00:00Z`);
  if ((Date.now() - released.getTime()) / 864e5 > 30) return;
  document.getElementById('home-event-title').textContent = u.name;
  document.getElementById('home-event-sum').textContent = u.summary || '';
  document.getElementById('home-event-badge').textContent = `New game update · ${released.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  document.getElementById('home-event-link').href = `/whats-new/?tab=game&u=${encodeURIComponent(u.slug)}`;
  section.style.display = '';
  refreshIcons();
}

// ---- Biggest value moves this week (get_value_changes, same source as /value-changes/) ----
async function loadMovers() {
  const section = document.getElementById('movers-section');
  if (!section) return;
  const { data } = await sb.rpc('get_value_changes', { p_days: 7 });
  const rows = (Array.isArray(data) ? data : []).filter((r) => r && r.pct != null && Math.abs(r.pct) >= 1 && r.new_value > 0);
  const row = (r) => `
    <a href="/blox-fruits-values/${slugifyItemName(r.name)}/" class="home-mover">
      ${r.icon_url ? `<img src="${escapeHtml(r.icon_url)}" alt="" loading="lazy" width="36" height="36">` : '<span class="home-mover-noimg"></span>'}
      <span class="home-mover-name">${escapeHtml(r.name)}</span>
      <span class="home-mover-val">${formatValue(r.new_value)}</span>
      <span class="home-pct ${r.pct > 0 ? 'up' : 'down'}">${r.pct > 0 ? '+' : ''}${Math.round(r.pct * 10) / 10}%</span>
    </a>`;
  const up = rows.filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 4);
  const down = rows.filter((r) => r.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 4);
  if (!up.length && !down.length) return; // nothing real to show -> stay hidden
  document.getElementById('movers-up').innerHTML = up.map(row).join('') || '<p class="muted" style="margin:0;font-size:.85rem;">No risers this week.</p>';
  document.getElementById('movers-down').innerHTML = down.map(row).join('') || '<p class="muted" style="margin:0;font-size:.85rem;">No drops this week.</p>';
  section.style.display = '';
  refreshIcons();
}

// ---- Newest open trade listings (public read) ----
async function loadBoard() {
  const section = document.getElementById('board-section');
  const grid = document.getElementById('board-grid');
  if (!section || !grid) return;
  const { data: listings } = await sb.from('trade_listings')
    .select('id, offering_item_ids, requesting_item_ids, created_at')
    .eq('active', true).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(4);
  if (!listings || !listings.length) return;
  const ids = [...new Set(listings.flatMap((l) => [...(l.offering_item_ids || []), ...(l.requesting_item_ids || [])].map((x) => x.id)))];
  const { data: items } = await sb.from('bf_items').select('id, name, icon_url').in('id', ids);
  const byId = new Map((items || []).map((i) => [i.id, i]));
  const side = (list) => {
    const counts = new Map();
    for (const x of list || []) counts.set(x.id, (counts.get(x.id) || 0) + 1);
    const entries = [...counts].slice(0, 4);
    return entries.map(([id, n]) => {
      const it = byId.get(id);
      return `<span class="home-chip" title="${escapeHtml(it ? it.name : 'Item')}">${it && it.icon_url ? `<img src="${escapeHtml(it.icon_url)}" alt="${escapeHtml(it.name)}" loading="lazy" width="30" height="30">` : '<i data-lucide="package"></i>'}${n > 1 ? `<b>×${n}</b>` : ''}</span>`;
    }).join('') + (counts.size > 4 ? `<span class="muted" style="font-size:.75rem;">+${counts.size - 4}</span>` : '');
  };
  const names = (list) => [...new Set((list || []).map((x) => (byId.get(x.id) || {}).name).filter(Boolean))].slice(0, 2).join(', ');
  grid.innerHTML = listings.map((l) => `
    <a href="/trading/" class="panel home-listing hover-lift-card">
      <span class="home-listing-trade">
        <span class="home-listing-side">${side(l.offering_item_ids)}</span>
        <i data-lucide="arrow-right-left" class="icon-sm" aria-hidden="true"></i>
        <span class="home-listing-side req">${side(l.requesting_item_ids)}</span>
      </span>
      <span class="home-listing-meta"><span>${escapeHtml(names(l.offering_item_ids))} → ${escapeHtml(names(l.requesting_item_ids))}</span><span>${timeAgo(l.created_at)}</span></span>
    </a>`).join('');
  section.style.display = '';
  refreshIcons();
}

// ---- What's New: newest changelog posts ----
function plainExcerpt(md) {
  const line = String(md || '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#') && !/^[-*]\s*$/.test(l)) || '';
  return line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '').replace(/^[-•]\s+/, '').trim().slice(0, 140);
}
async function loadWhatsNew() {
  const section = document.getElementById('news-section');
  const grid = document.getElementById('news-grid');
  if (!section || !grid) return;
  const { data } = await sb.from('changelog_entries').select('title, description, tag, created_at').order('created_at', { ascending: false }).limit(3);
  if (!data || !data.length) return;
  const TAG = { update: 'Update', feature: 'New feature', fix: 'Fix' };
  grid.innerHTML = data.map((e) => `
    <a href="/whats-new/" class="panel home-news hover-lift-card">
      <span class="home-news-top"><span class="home-tag">${escapeHtml(TAG[e.tag] || e.tag || 'Update')}</span><span>${timeAgo(e.created_at)}</span></span>
      <h3>${escapeHtml(e.title)}</h3>
      <p>${escapeHtml(plainExcerpt(e.description))}</p>
    </a>`).join('');
  section.style.display = '';
  refreshIcons();
}

// ---- Sign-up band: only for logged-out visitors, with a real member count ----
async function loadJoinBand() {
  const band = document.getElementById('home-join');
  if (!band) return;
  const { data: { session } } = await sb.auth.getSession();
  if (session) return;
  band.style.display = '';
  const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true });
  if (count && count >= 20) document.getElementById('home-join-sub').textContent = `Join ${count} pirates trading, hunting bounties and winning giveaways — free, 10 seconds with Discord.`;
}
