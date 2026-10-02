// Crew vs crew comparison — /crew-compare/?a=<name>&b=<name>. Crews are live, user-created
// content (unlike the fixed ~40-fruit catalog), so this is a dynamic client-rendered page
// rather than statically pre-generated for every possible pairing.

const compareSelected = { a: null, b: null };

// Mirrors crews.js's own fallback banner so a crew looks the same here as it does on its card
// and its own page — same palette, same hash, so a given crew is always the same color.
const CREW_CARD_PALETTE = ['167 139 250', '56 189 248', '251 191 36', '52 211 153', '248 113 113', '37 99 235', '244 114 182', '45 212 191'];
function crewBannerStyle(c) {
  if (c.banner_url) return `background:url('${c.banner_url.replace(/'/g, '%27')}') center/cover;`;
  let rgb = c.accent_color;
  if (!rgb) {
    let hash = 0;
    const key = String(c.id || c.name || '');
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    rgb = CREW_CARD_PALETTE[hash % CREW_CARD_PALETTE.length];
  }
  const isHex = typeof rgb === 'string' && rgb.startsWith('#');
  const c1 = isHex ? `${rgb}59` : `rgb(${rgb} / 0.35)`;
  const c2 = isHex ? `${rgb}38` : `rgb(${rgb} / 0.22)`;
  return `background: radial-gradient(circle at 30% 0%, ${c1}, transparent 65%), linear-gradient(120deg, ${c2}, var(--navy) 80%);`;
}

async function fetchCrewExtras(crew) {
  const { count } = await sb.from('crew_members').select('user_id', { count: 'exact', head: true }).eq('crew_id', crew.id);
  const { data: members } = await sb.from('crew_members').select('profiles(pirate_bounty)').eq('crew_id', crew.id);
  const bounty = (members || []).reduce((sum, m) => sum + (m.profiles?.pirate_bounty || 0), 0);
  return { memberCount: count || 0, bounty };
}

function setupPicker(side) {
  const input = document.getElementById(`compare-${side}-search`);
  const results = document.getElementById(`compare-${side}-results`);
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const { data } = await sb.from('crews').select('id, name, tag, logo_url').ilike('name', `%${q}%`).limit(8);
      if (input.value.trim() !== q) return;
      results.innerHTML = (data || []).map(c => `
        <button type="button" class="crew-compare-result-row" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
          ${c.logo_url ? `<img src="${c.logo_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<div class="crew-card-logo-fallback" style="display:flex; align-items:center; justify-content:center; font-weight:700;">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
          <span>${escapeHtml(c.name)}</span>${c.tag ? `<small class="muted">[${escapeHtml(c.tag)}]</small>` : ''}
        </button>`).join('') || '<p class="muted" style="margin:8px 10px; font-size:0.82rem;">No crews found.</p>';
      results.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => {
        input.value = btn.dataset.name;
        results.innerHTML = '';
        selectCrew(side, btn.dataset.name);
      }));
    }, 350);
  });
}

async function selectCrew(side, name) {
  const { data: crew, error } = await sb.from('crews').select('*').eq('name', name).maybeSingle();
  if (error || !crew) { showToast('Could not find that crew.', true); return; }
  const extras = await fetchCrewExtras(crew);
  compareSelected[side] = { ...crew, ...extras };
  syncUrl();
  renderComparison();
}

function syncUrl() {
  const params = new URLSearchParams();
  if (compareSelected.a) params.set('a', compareSelected.a.name);
  if (compareSelected.b) params.set('b', compareSelected.b.name);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function statRow(label, a, b, { formatter = v => v, lowerIsBetter = false } = {}) {
  const aWin = lowerIsBetter ? a < b : a > b;
  const bWin = lowerIsBetter ? b < a : b > a;
  return `<div class="crew-compare-stat-row">
    <span class="${aWin ? 'crew-compare-stat-winner' : ''}">${formatter(a)}</span>
    <span class="muted">${label}</span>
    <span class="${bWin ? 'crew-compare-stat-winner' : ''}">${formatter(b)}</span>
  </div>`;
}

function crewColumnHtml(c) {
  return `
    <div class="panel crew-compare-card">
      <div class="crew-compare-card-head">
        ${c.logo_url ? `<img src="${c.logo_url}" alt="" loading="lazy" class="crew-compare-logo">` : `<div class="crew-compare-logo crew-card-logo-fallback" style="display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.4rem;">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <div style="min-width:0;">
          <h3 style="margin:0; font-size:1.1rem;" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</h3>
          ${c.tag ? `<span class="tag tag-legendary">${escapeHtml(c.tag)}</span>` : ''}
        </div>
      </div>
      <div class="crew-card-banner" style="${crewBannerStyle(c)} border-radius:10px; height:40px; margin-bottom:14px;"></div>
      <a href="/crew/?name=${encodeURIComponent(c.name)}" class="btn btn-ghost btn-sm" style="width:100%;">View Crew</a>
    </div>`;
}

function renderComparison() {
  const el = document.getElementById('crew-compare-result');
  const { a, b } = compareSelected;
  if (!a && !b) { el.innerHTML = ''; return; }
  if (!a || !b) {
    el.innerHTML = `<p class="muted" style="text-align:center;">Pick a second crew to see the comparison.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="grid" style="grid-template-columns:1fr 1fr; gap:16px;">
      ${crewColumnHtml(a)}
      ${crewColumnHtml(b)}
    </div>
    <div class="panel" style="margin-top:16px; max-width:500px; margin-left:auto; margin-right:auto;">
      ${statRow('Bounty', a.bounty, b.bounty, { formatter: formatBounty })}
      ${statRow('Members', a.memberCount, b.memberCount)}
      ${statRow('War Wins', a.wins || 0, b.wins || 0)}
      ${statRow('War Losses', a.losses || 0, b.losses || 0, { lowerIsBetter: true })}
      ${a.recruiting || b.recruiting ? `<div class="crew-compare-stat-row"><span>${a.recruiting ? '✅' : '—'}</span><span class="muted">Recruiting</span><span>${b.recruiting ? '✅' : '—'}</span></div>` : ''}
    </div>`;
  refreshIcons();
}

onReady(async () => {
  setupPicker('a');
  setupPicker('b');

  const params = new URLSearchParams(location.search);
  const aName = params.get('a');
  const bName = params.get('b');
  if (aName) { document.getElementById('compare-a-search').value = aName; await selectCrew('a', aName); }
  if (bName) { document.getElementById('compare-b-search').value = bName; await selectCrew('b', bName); }
});
