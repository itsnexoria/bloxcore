// BloxCore — /blox-fruits-updates/ : per-update guides with a frozen tier-list snapshot (then vs now).
// Data: game_updates (public read; admins create via /admin/updates/). tier_snapshot is built by snapshot_update_tiers().

const UPDATE_TIER_META = {
  S: { color: '#f472b6', blurb: 'Top 10% of fruits by value' },
  A: { color: '#fbbf24', blurb: 'Next 20%' },
  B: { color: '#60a5fa', blurb: 'Next 30%' },
  C: { color: '#94a3b8', blurb: 'The rest' },
};

function updSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

onReady(async () => {
  const slug = new URLSearchParams(location.search).get('u');
  if (slug) await showUpdate(slug); else await showUpdateList();
});

async function showUpdateList() {
  const list = document.getElementById('upd-list');
  const { data, error } = await sb.from('game_updates').select('slug, name, released_on, summary, tier_snapshot').order('released_on', { ascending: false });
  if (error) { logError('game_updates list failed:', error); list.innerHTML = '<div class="panel" style="padding:24px;"><p class="muted" style="margin:0;">Couldn\'t load updates.</p></div>'; return; }
  if (!data.length) { list.innerHTML = '<div class="panel" style="padding:28px; text-align:center;"><p class="muted" style="margin:0;">No update guides yet — check back after the next Blox Fruits update.</p></div>'; return; }
  list.innerHTML = data.map(u => `
    <a class="panel upd-card hover-lift-card" href="?u=${encodeURIComponent(u.slug)}">
      <div class="flex-between"><h2 style="margin:0; font-size:1.1rem;">${escapeHtml(u.name)}</h2><span class="muted" style="font-size:0.8rem;">${new Date(u.released_on + 'T00:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></div>
      <p class="muted" style="margin:6px 0 0; font-size:0.88rem;">${escapeHtml(u.summary || '')}</p>
      ${u.tier_snapshot ? '<span class="tag tag-easy" style="margin-top:10px;"><i data-lucide="list-ordered" class="icon-sm icon-inline"></i>Tier list included</span>' : ''}
    </a>`).join('');
  refreshIcons();
}

async function showUpdate(slug) {
  document.getElementById('upd-list-view').style.display = 'none';
  const view = document.getElementById('upd-detail-view');
  view.style.display = '';
  view.innerHTML = '<div class="skeleton" style="height:240px;"></div>';
  const { data: u, error } = await sb.from('game_updates').select('*').eq('slug', slug).maybeSingle();
  if (error || !u) { view.innerHTML = '<div class="panel" style="padding:28px; text-align:center;"><p style="margin:0 0 10px; font-weight:700;">Update not found</p><a class="btn btn-ghost btn-sm" href="/blox-fruits-updates/">All updates</a></div>'; return; }

  document.title = `${u.name} Tier List & Guide — BloxCore`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = u.summary || `Blox Fruits ${u.name}: tier list snapshot and what changed.`;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = `https://bloxcores.com/blox-fruits-updates/?u=${encodeURIComponent(u.slug)}`;

  // current values for the "then vs now" column
  let nowById = new Map();
  const snap = Array.isArray(u.tier_snapshot) ? u.tier_snapshot : [];
  if (snap.length) {
    const { data: cur } = await sb.from('bf_items').select('id, regular_value').in('id', snap.map(s => s.id));
    nowById = new Map((cur || []).map(c => [c.id, c.regular_value]));
  }

  const tiersHtml = snap.length ? ['S', 'A', 'B', 'C'].map(t => {
    const items = snap.filter(s => s.tier === t);
    if (!items.length) return '';
    const meta = UPDATE_TIER_META[t];
    return `
      <div class="panel upd-tier" style="--tier:${meta.color};">
        <div class="upd-tier-label"><strong>${t}</strong><span>${meta.blurb}</span></div>
        <div class="upd-tier-items">${items.map(s => {
          const cur = nowById.get(s.id);
          const delta = cur && s.value ? Math.round(((cur - s.value) / s.value) * 100) : 0;
          return `<a class="upd-item" href="/blox-fruits-values/${updSlug(s.name)}/" title="${escapeHtml(s.name)}: ${formatValue(s.value)} then${cur ? `, ${formatValue(cur)} now` : ''}">
            ${s.icon_url ? `<img src="${escapeHtml(s.icon_url)}" alt="" loading="lazy" width="44" height="44">` : '<i data-lucide="sparkles"></i>'}
            <strong>${escapeHtml(s.name)}</strong><span class="muted">${formatValue(s.value)}</span>
            ${Math.abs(delta) >= 3 ? `<span class="upd-delta" style="color:${delta > 0 ? 'var(--sea)' : '#f87171'};">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% now</span>` : ''}
          </a>`;
        }).join('')}</div>
      </div>`;
  }).join('') : '<div class="panel" style="padding:20px;"><p class="muted" style="margin:0;">No tier list was saved for this update.</p></div>';

  view.innerHTML = `
    <a href="/blox-fruits-updates/" class="muted" style="font-size:0.85rem;"><i data-lucide="arrow-left" class="icon-sm icon-inline"></i>All updates</a>
    <h1 style="font-size:1.8rem; margin:10px 0 2px;">${escapeHtml(u.name)}</h1>
    <p class="muted" style="margin:0 0 18px;">Released ${new Date(u.released_on + 'T00:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}${u.snapshot_at ? ` · tier list saved ${new Date(u.snapshot_at).toLocaleDateString()}` : ''}</p>
    ${u.summary ? `<p style="font-size:1.02rem;">${escapeHtml(u.summary)}</p>` : ''}
    ${u.notes ? `<div class="panel" style="padding:18px; margin:16px 0;">${markdownToHtml(u.notes)}</div>` : ''}
    <h2 style="font-size:1.2rem; margin:24px 0 6px;">Tier list at launch</h2>
    <p class="muted" style="margin:0 0 12px; font-size:0.85rem;">Ranked by community trade value when this snapshot was taken. The arrow shows how a fruit's value has moved since.</p>
    <div style="display:grid; gap:12px;">${tiersHtml}</div>
    <p style="margin-top:20px;"><a class="btn btn-ghost btn-sm" href="/blox-fruits-value-changes/"><i data-lucide="activity" class="icon-sm icon-inline"></i>See recent value changes</a></p>`;
  refreshIcons();
}
