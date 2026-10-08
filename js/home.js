// BloxCore — index.html logic (trending values strip)

onReady(() => {
  loadLiveStrip();
  loadTrending();
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

// "Trending" here means the community-flagged trend on bf_items (up/overpaid/underpaid/
// unstable), not a computed week-over-week % change — the price-history table exists but is
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
  const { data, error } = await sb.from('bf_items')
    .select('name, category, regular_value, icon_url, trend')
    .neq('trend', 'stable')
    .not('regular_value', 'is', null)
    .order('regular_value', { ascending: false })
    .limit(6);
  if (error || !data || !data.length) return; // stays hidden — no fake/empty widget
  grid.innerHTML = data.map((item, i) => {
    const t = TREND_STYLE[item.trend] || { color: 'var(--ash)', icon: 'minus' };
    return `
      <a href="/blox-fruits-values/${slugifyItemName(item.name)}/" class="panel trending-tile hover-lift-card" style="--tile-accent:${t.color};">
        <span class="trending-tile-rank">#${i + 1}</span>
        <span class="trending-tile-img">${item.icon_url ? `<img src="${escapeHtml(item.icon_url)}" alt="" loading="lazy" width="52" height="52">` : '<i data-lucide="sparkles"></i>'}</span>
        <span class="trending-tile-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="trending-tile-value">${formatValue(item.regular_value)}</span>
        <span class="trending-tile-badge"><i data-lucide="${t.icon}"></i>${TREND_LABEL[item.trend] || item.trend}</span>
      </a>`;
  }).join('');
  section.style.display = '';
  refreshIcons();
}
