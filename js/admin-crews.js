// BloxCore — Manage page "Crews & Wars" tab: crew directory with search + bulk delete,
// a war log with search/status filter + bulk delete, and disputed wars needing a
// staff decision (same logic as the old standalone /admin/ "Crew Wars" queue).

let _crewsWarsTabInit = false;
let cwCategory = 'crews';
let cwCrewsSearchDebounce, cwWarsSearchDebounce;

async function initCrewsWarsTab() {
  if (_crewsWarsTabInit) return;
  _crewsWarsTabInit = true;

  document.querySelectorAll('#cw-category-tabs [data-cw-category]').forEach(btn => {
    btn.addEventListener('click', () => switchCwCategory(btn.dataset.cwCategory));
  });

  document.getElementById('cw-crews-search').addEventListener('input', () => {
    clearTimeout(cwCrewsSearchDebounce);
    cwCrewsSearchDebounce = setTimeout(loadCrewsTable, 250);
  });
  document.getElementById('cw-crews-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('#cw-crews-tbody [data-cw-crew-check]').forEach(cb => { cb.checked = e.target.checked; });
    updateCwBulkState('crews');
  });
  document.getElementById('cw-crews-bulk-delete').addEventListener('click', () => bulkDeleteCw('crews'));

  document.getElementById('cw-wars-search').addEventListener('input', () => {
    clearTimeout(cwWarsSearchDebounce);
    cwWarsSearchDebounce = setTimeout(loadWarsTable, 250);
  });
  document.getElementById('cw-wars-status-filter').addEventListener('change', loadWarsTable);
  document.getElementById('cw-wars-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('#cw-wars-tbody [data-cw-war-check]').forEach(cb => { cb.checked = e.target.checked; });
    updateCwBulkState('wars');
  });
  document.getElementById('cw-wars-bulk-delete').addEventListener('click', () => bulkDeleteCw('wars'));

  await loadCrewsTable();
}

function switchCwCategory(cat) {
  cwCategory = cat;
  document.querySelectorAll('#cw-category-tabs [data-cw-category]').forEach(b => {
    b.className = `btn btn-sm ${b.dataset.cwCategory === cat ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('cw-panel-crews').style.display = cat === 'crews' ? '' : 'none';
  document.getElementById('cw-panel-wars').style.display = cat === 'wars' ? '' : 'none';
  document.getElementById('cw-panel-disputes').style.display = cat === 'disputes' ? '' : 'none';

  if (cat === 'wars' && !_cwWarsLoaded) loadWarsTable();
  if (cat === 'disputes' && !_cwDisputesLoaded) loadCwDisputes();
}

let _cwWarsLoaded = false, _cwDisputesLoaded = false;

// --- Crews -----------------------------------------------------------------

async function loadCrewsTable() {
  const tbody = document.getElementById('cw-crews-tbody');
  const search = document.getElementById('cw-crews-search').value.trim();

  let query = sb.from('crews').select('id, name, tag, leader_id, created_at, profiles!crews_leader_id_fkey(username, display_name)').order('created_at', { ascending: false }).limit(100);
  if (search) query = query.or(`name.ilike.%${search}%,tag.ilike.%${search}%`);
  const { data, error } = await query;

  if (error) { tbody.innerHTML = `<tr><td colspan="7" class="muted">Couldn't load crews.</td></tr>`; logError(error); return; }
  if (!data.length) {
    tbody.innerHTML = '';
    document.getElementById('cw-crews-empty').style.display = 'block';
    return;
  }
  document.getElementById('cw-crews-empty').style.display = 'none';

  const crewIds = data.map(c => c.id);
  const [{ data: members }] = await Promise.all([
    sb.from('crew_members').select('crew_id, profiles(pirate_bounty)').in('crew_id', crewIds),
  ]);
  const countByCrew = {}, bountyByCrew = {};
  (members || []).forEach(m => {
    countByCrew[m.crew_id] = (countByCrew[m.crew_id] || 0) + 1;
    bountyByCrew[m.crew_id] = (bountyByCrew[m.crew_id] || 0) + (m.profiles?.pirate_bounty || 0);
  });

  tbody.innerHTML = data.map(c => `
    <tr>
      <td><input type="checkbox" data-cw-crew-check="${c.id}"></td>
      <td><a href="/crew/?name=${encodeURIComponent(c.name)}" target="_blank" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(c.name)}</a>${c.tag ? ` <span class="muted">[${escapeHtml(c.tag)}]</span>` : ''}</td>
      <td>${c.profiles ? `<a href="/player/?u=${encodeURIComponent(c.profiles.username)}" target="_blank" style="color:inherit;">${escapeHtml(displayNameFor(c.profiles))}</a>` : '<span class="muted">Unknown</span>'}</td>
      <td>${countByCrew[c.id] || 0}</td>
      <td>${formatBounty(bountyByCrew[c.id] || 0)}</td>
      <td class="muted">${timeAgo(c.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" data-cw-delete-crew="${c.id}" aria-label="Delete crew"><i data-lucide="trash-2" class="icon-sm"></i></button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-cw-crew-check]').forEach(cb => cb.addEventListener('change', () => updateCwBulkState('crews')));
  tbody.querySelectorAll('[data-cw-delete-crew]').forEach(btn => {
    btn.addEventListener('click', () => deleteCrews([btn.dataset.cwDeleteCrew]));
  });
  updateCwBulkState('crews');
  refreshIcons();
}

async function deleteCrews(ids) {
  if (!window.confirm(`Delete ${ids.length} crew${ids.length === 1 ? '' : 's'}? This also removes their members and war history. This can't be undone.`)) return;
  const { error } = await sb.from('crews').delete().in('id', ids);
  if (error) { showToast(error.message, true); return; }
  showToast(`${ids.length} crew${ids.length === 1 ? '' : 's'} deleted.`);
  loadCrewsTable();
}

// --- Wars --------------------------------------------------------------

async function loadWarsTable() {
  const tbody = document.getElementById('cw-wars-tbody');
  _cwWarsLoaded = true;
  const search = document.getElementById('cw-wars-search').value.trim();
  const status = document.getElementById('cw-wars-status-filter').value;

  let query = sb.from('crew_wars').select('id, status, created_at, winner_crew_id, challenger_crew_id, defender_crew_id, challenger:challenger_crew_id(name), defender:defender_crew_id(name)').order('created_at', { ascending: false }).limit(100);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;

  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="muted">Couldn't load wars.</td></tr>`; logError(error); return; }

  const filtered = search
    ? data.filter(w => (w.challenger?.name || '').toLowerCase().includes(search.toLowerCase()) || (w.defender?.name || '').toLowerCase().includes(search.toLowerCase()))
    : data;

  if (!filtered.length) {
    tbody.innerHTML = '';
    document.getElementById('cw-wars-empty').style.display = 'block';
    return;
  }
  document.getElementById('cw-wars-empty').style.display = 'none';

  const statusTag = {
    pending: `<span class="tag tag-medium">Pending</span>`,
    accepted: `<span class="tag tag-easy">Active</span>`,
    declined: `<span class="muted">Declined</span>`,
    cancelled: `<span class="muted">Cancelled</span>`,
    completed: `<span class="tag tag-legendary">Completed</span>`,
  };

  tbody.innerHTML = filtered.map(w => `
    <tr>
      <td><input type="checkbox" data-cw-war-check="${w.id}"></td>
      <td>${escapeHtml(w.challenger?.name || 'Unknown')}</td>
      <td>${escapeHtml(w.defender?.name || 'Unknown')}</td>
      <td>${statusTag[w.status] || w.status}</td>
      <td class="muted">${timeAgo(w.created_at)}</td>
      <td class="muted">${w.winner_crew_id ? (w.winner_crew_id === w.challenger_crew_id ? escapeHtml(w.challenger?.name || '') : escapeHtml(w.defender?.name || '')) : '—'}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-cw-war-check]').forEach(cb => cb.addEventListener('change', () => updateCwBulkState('wars')));
  updateCwBulkState('wars');
}

async function bulkDeleteCw(kind) {
  const checks = kind === 'crews'
    ? document.querySelectorAll('#cw-crews-tbody [data-cw-crew-check]:checked')
    : document.querySelectorAll('#cw-wars-tbody [data-cw-war-check]:checked');
  const ids = [...checks].map(cb => kind === 'crews' ? cb.dataset.cwCrewCheck : cb.dataset.cwWarCheck);
  if (!ids.length) return;

  if (kind === 'crews') {
    await deleteCrews(ids);
    return;
  }

  if (!window.confirm(`Delete ${ids.length} war${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
  const { error } = await sb.from('crew_wars').delete().in('id', ids);
  if (error) { showToast(error.message, true); return; }
  showToast(`${ids.length} war${ids.length === 1 ? '' : 's'} deleted.`);
  loadWarsTable();
}

function updateCwBulkState(kind) {
  const checked = kind === 'crews'
    ? document.querySelectorAll('#cw-crews-tbody [data-cw-crew-check]:checked').length
    : document.querySelectorAll('#cw-wars-tbody [data-cw-war-check]:checked').length;
  const btn = document.getElementById(kind === 'crews' ? 'cw-crews-bulk-delete' : 'cw-wars-bulk-delete');
  const countEl = document.getElementById(kind === 'crews' ? 'cw-crews-selected-count' : 'cw-wars-selected-count');
  btn.disabled = checked === 0;
  countEl.textContent = checked;
}

// --- Disputes needing a decision ----------------------------------------

async function loadCwDisputes() {
  _cwDisputesLoaded = true;
  const list = document.getElementById('cw-disputes-list');
  list.innerHTML = `<div class="skeleton" style="height:90px;"></div>`;

  const { data, error } = await sb
    .from('crew_wars')
    .select('*, challenger:challenger_crew_id(name, tag), defender:defender_crew_id(name, tag)')
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  if (error) { list.innerHTML = `<p class="muted">Couldn't load wars right now.</p>`; logError(error); return; }

  list.innerHTML = data.length
    ? data.map(renderCwDisputeCard).join('')
    : `<div class="empty-state">No wars waiting on a decision right now.</div>`;

  refreshIcons();
  list.querySelectorAll('[data-cw-resolve-war]').forEach(btn => {
    btn.addEventListener('click', () => resolveCwWar(btn.dataset.cwResolveWar, btn.dataset.winnerCrew || null));
  });
}

function renderCwDisputeCard(w) {
  return `
    <div class="panel" style="margin-bottom:14px;">
      <p style="margin:0 0 10px; font-weight:700; font-size:1.05rem;">
        ${escapeHtml(w.challenger?.name || 'Unknown')} <span class="muted">vs</span> ${escapeHtml(w.defender?.name || 'Unknown')}
      </p>
      ${w.message ? `<p class="muted" style="margin:0 0 12px; font-size:0.85rem;">${escapeHtml(w.message)}</p>` : ''}
      <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:14px;">
        <div>
          <p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase;">${escapeHtml(w.challenger?.name || 'Challenger')}'s clip</p>
          ${w.challenger_video_url ? `<a href="${escapeHtml(w.challenger_video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Watch</a>` : `<p class="muted" style="font-size:0.82rem; margin:0;">Not submitted</p>`}
        </div>
        <div>
          <p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase;">${escapeHtml(w.defender?.name || 'Defender')}'s clip</p>
          ${w.defender_video_url ? `<a href="${escapeHtml(w.defender_video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Watch</a>` : `<p class="muted" style="font-size:0.82rem; margin:0;">Not submitted</p>`}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" data-cw-resolve-war="${w.id}" data-winner-crew="${w.challenger_crew_id}" ${w.challenger_video_url ? '' : 'disabled title="No video from this crew — can\'t be named winner"'}>${escapeHtml(w.challenger?.name || 'Challenger')} Wins</button>
        <button class="btn btn-primary btn-sm" data-cw-resolve-war="${w.id}" data-winner-crew="${w.defender_crew_id}" ${w.defender_video_url ? '' : 'disabled title="No video from this crew — can\'t be named winner"'}>${escapeHtml(w.defender?.name || 'Defender')} Wins</button>
        <button class="btn btn-ghost btn-sm" data-cw-resolve-war="${w.id}">Declare Tie</button>
      </div>
    </div>
  `;
}

async function resolveCwWar(warId, winnerCrewId) {
  if (!window.confirm(winnerCrewId ? 'Lock in this result? This ends the war for both crews.' : 'Declare this war a tie? This ends it for both crews with no winner.')) return;
  const { error } = await sb.rpc('resolve_crew_war', { war_id: warId, winner_id: winnerCrewId });
  if (error) { showToast(error.message, true); return; }
  showToast(winnerCrewId ? 'War resolved.' : 'War tied.');
  await loadCwDisputes();
}
