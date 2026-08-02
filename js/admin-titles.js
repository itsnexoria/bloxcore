// BloxCore — admin/titles/index.html logic (admin only)

let allTitles = [];

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;

  await loadTitles();
  await loadSeasonalConfig();

  document.getElementById('title-form').addEventListener('submit', handleCreateTitle);
  document.getElementById('save-seasonal-btn').addEventListener('click', saveSeasonalConfig);
  document.getElementById('run-seasonal-btn').addEventListener('click', runSeasonalNow);

  let debounceTimer;
  document.getElementById('grant-user-search').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchUsers(e.target.value.trim()), 250);
  });
  document.getElementById('grant-title-select').addEventListener('change', () => {
    searchUsers(document.getElementById('grant-user-search').value.trim());
  });
  document.getElementById('grant-select-all').addEventListener('click', selectAllShown);
  document.getElementById('grant-apply-btn').addEventListener('click', () => applyBulk('grant'));
  document.getElementById('revoke-apply-btn').addEventListener('click', () => applyBulk('revoke'));
});

async function loadTitles() {
  const list = document.getElementById('titles-list');
  const { data, error } = await sb.from('titles').select('*').order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load titles right now.</p>`;
    console.error(error);
    return;
  }

  allTitles = data;

  const seasonalLb = document.getElementById('seasonal-leaderboard');
  const seasonalCrew = document.getElementById('seasonal-crew');
  const grantSelect = document.getElementById('grant-title-select');
  [seasonalLb, seasonalCrew, grantSelect].forEach(select => {
    if (!select) return;
    select.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
    data.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.name;
      select.appendChild(option);
    });
  });

  if (!data.length) {
    list.innerHTML = `<div class="empty-state">No titles yet — create the first one above.</div>`;
    return;
  }

  list.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    data.map((t, i) => `
      <div class="flex-between" style="padding:12px 20px; ${i === data.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="border:1px solid ${t.color}; color:${t.color}; padding:2px 10px; border-radius:10px; font-size:0.82rem;">${escapeHtml(t.name)}</span>
          <span class="muted" style="font-size:0.75rem; text-transform:capitalize;">${t.rarity}</span>
        </div>
        <button class="btn btn-danger btn-sm" data-delete-title="${t.id}" data-name="${escapeHtml(t.name)}">Delete</button>
      </div>
    `).join('') +
    `</div>`;

  document.querySelectorAll('[data-delete-title]').forEach(btn => {
    btn.addEventListener('click', () => deleteTitle(btn.dataset.deleteTitle, btn.dataset.name));
  });
}

async function loadSeasonalConfig() {
  const { data, error } = await sb.from('seasonal_titles').select('*');
  if (error) {
    console.error(error);
    return;
  }

  const lbRow = data.find(r => r.slot === 'leaderboard_top10');
  const crewRow = data.find(r => r.slot === 'crew_top10');
  if (lbRow?.title_id) document.getElementById('seasonal-leaderboard').value = lbRow.title_id;
  if (crewRow?.title_id) document.getElementById('seasonal-crew').value = crewRow.title_id;

  const lastRun = [lbRow?.last_run_at, crewRow?.last_run_at].filter(Boolean).sort().pop();
  document.getElementById('seasonal-last-run').textContent = lastRun ? `Last ran ${timeAgo(lastRun)}` : 'Never run yet.';
}

async function saveSeasonalConfig() {
  const lbTitle = document.getElementById('seasonal-leaderboard').value || null;
  const crewTitle = document.getElementById('seasonal-crew').value || null;

  const { error } = await sb.from('seasonal_titles').upsert([
    { slot: 'leaderboard_top10', title_id: lbTitle },
    { slot: 'crew_top10', title_id: crewTitle },
  ], { onConflict: 'slot' });

  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('Seasonal award config saved.');
}

async function runSeasonalNow() {
  if (!window.confirm('Run seasonal title awards now? This clears the previous holders of each configured title and re-awards based on current standings.')) return;

  const btn = document.getElementById('run-seasonal-btn');
  btn.disabled = true;
  const { error } = await sb.rpc('run_seasonal_title_awards');
  btn.disabled = false;

  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('Seasonal titles awarded.');
  await loadSeasonalConfig();
}

async function handleCreateTitle(e) {
  e.preventDefault();
  const name = document.getElementById('title-name').value.trim();
  const color = document.getElementById('title-color').value;
  const rarity = document.getElementById('title-rarity').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const { error } = await sb.from('titles').insert({ name, color, rarity });
  btn.disabled = false;

  if (error) {
    showToast(error.message, true);
    return;
  }
  e.target.reset();
  document.getElementById('title-color').value = '#7be0ff';
  showToast('Title created.');
  await loadTitles();
}

async function deleteTitle(id, name) {
  if (!window.confirm(`Delete "${name}"? This removes it from anyone currently wearing it.`)) return;

  const { error } = await sb.from('titles').delete().eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('Title deleted.');
  await loadTitles();
}

let grantResultUsers = [];   // [{ id, username, display_name, owned }]

async function searchUsers(query) {
  const results = document.getElementById('grant-results');
  const actionBar = document.getElementById('grant-action-bar');
  const titleId = document.getElementById('grant-title-select').value;

  if (!titleId) {
    results.innerHTML = `<p class="muted" style="font-size:0.85rem;">Choose a title above to get started.</p>`;
    actionBar.style.display = 'none';
    grantResultUsers = [];
    return;
  }

  let req = sb.from('profiles').select('id, username, display_name').order('username').limit(40);
  if (query) req = req.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);
  const { data: users, error } = await req;

  if (error) {
    results.innerHTML = `<p class="muted">Couldn't search users right now.</p>`;
    console.error(error);
    return;
  }

  if (!users.length) {
    results.innerHTML = `<p class="muted">No users match that search.</p>`;
    actionBar.style.display = 'none';
    grantResultUsers = [];
    return;
  }

  const { data: owned } = await sb.from('user_titles').select('user_id').eq('title_id', titleId).in('user_id', users.map(u => u.id));
  const ownedIds = new Set((owned || []).map(o => o.user_id));

  grantResultUsers = users.map(u => ({ ...u, owned: ownedIds.has(u.id) }));

  results.innerHTML = `<div class="panel panel-plain" style="padding:0;">` + grantResultUsers.map((u, i) => `
    <div class="flex-between" style="padding:10px 20px; ${i === grantResultUsers.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <label style="display:flex; align-items:center; gap:10px; text-transform:none; font-weight:600; margin:0;">
        <input type="checkbox" data-grant-user="${u.id}" style="width:auto; margin:0;">
        ${escapeHtml(displayNameFor(u))} <span class="muted" style="font-weight:400; font-size:0.8rem;">@${escapeHtml(u.username)}</span>
      </label>
      ${u.owned ? `<span class="tag tag-easy">Owns it</span>` : ''}
    </div>
  `).join('') + `</div>`;

  actionBar.style.display = 'flex';
  document.querySelectorAll('[data-grant-user]').forEach(cb => {
    cb.addEventListener('change', updateGrantSelectCount);
  });
  updateGrantSelectCount();
}

function selectAllShown() {
  document.querySelectorAll('[data-grant-user]').forEach(cb => { cb.checked = true; });
  updateGrantSelectCount();
}

function updateGrantSelectCount() {
  const count = document.querySelectorAll('[data-grant-user]:checked').length;
  document.getElementById('grant-select-count').textContent = `${count} selected`;
}

async function applyBulk(mode) {
  const titleId = document.getElementById('grant-title-select').value;
  const selected = Array.from(document.querySelectorAll('[data-grant-user]:checked')).map(cb => cb.dataset.grantUser);
  if (!selected.length) {
    showToast('Check at least one player first.', true);
    return;
  }

  const targets = mode === 'grant'
    ? grantResultUsers.filter(u => selected.includes(u.id) && !u.owned)
    : grantResultUsers.filter(u => selected.includes(u.id) && u.owned);

  if (!targets.length) {
    showToast(mode === 'grant' ? 'Everyone selected already owns this title.' : "None selected currently own this title.", true);
    return;
  }

  document.getElementById('grant-apply-btn').disabled = true;
  document.getElementById('revoke-apply-btn').disabled = true;

  let failed = 0;
  for (const u of targets) {
    const { error } = mode === 'grant'
      ? await sb.from('user_titles').insert({ user_id: u.id, title_id: titleId })
      : await sb.from('user_titles').delete().eq('user_id', u.id).eq('title_id', titleId);
    if (error) failed++;
  }

  document.getElementById('grant-apply-btn').disabled = false;
  document.getElementById('revoke-apply-btn').disabled = false;

  showToast(failed
    ? `Done, but ${failed} of ${targets.length} failed.`
    : `${mode === 'grant' ? 'Granted to' : 'Revoked from'} ${targets.length} player${targets.length > 1 ? 's' : ''}.`, failed > 0);

  await searchUsers(document.getElementById('grant-user-search').value.trim());
}
