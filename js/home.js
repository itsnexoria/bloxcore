// BloxCore — index.html logic (trending values strip)

onReady(() => {
  loadTrending();
});

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
  grid.innerHTML = data.map(item => {
    const color = item.trend === 'up' || item.trend === 'underpaid' ? 'var(--sea)' : '#f87171';
    return `
      <a href="/blox-fruits-values/${slugifyItemName(item.name)}/" class="panel trending-tile hover-lift-card">
        ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy">` : ''}
        <span class="trending-tile-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="trending-tile-value">${formatValue(item.regular_value)}</span>
        <span class="trending-tile-badge" style="color:${color};">${TREND_LABEL[item.trend] || item.trend}</span>
      </a>`;
  }).join('');
  section.style.display = '';
  refreshIcons();
}
