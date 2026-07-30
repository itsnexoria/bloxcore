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
  [seasonalLb, seasonalCrew].forEach(select => {
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

  list.innerHTML = `<div class="panel" style="padding:0;">` +
    data.map((t, i) => `
      <div class="flex-between" style="padding:12px 20px; ${i === data.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
        <span style="border:1px solid ${t.color}; color:${t.color}; padding:2px 10px; border-radius:10px; font-size:0.82rem;">${escapeHtml(t.name)}</span>
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
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const { error } = await sb.from('titles').insert({ name, color });
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

async function searchUsers(query) {
  const results = document.getElementById('grant-results');
  if (!query) {
    results.innerHTML = '';
    return;
  }

  const { data: users, error } = await sb
    .from('profiles')
    .select('id, username, display_name')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);

  if (error) {
    results.innerHTML = `<p class="muted">Couldn't search users right now.</p>`;
    console.error(error);
    return;
  }

  if (!users.length) {
    results.innerHTML = `<p class="muted">No users match that search.</p>`;
    return;
  }

  const rows = await Promise.all(users.map(renderUserGrantRow));
  results.innerHTML = `<div class="panel" style="padding:0;">${rows.join('')}</div>`;
  wireGrantButtons();
}

async function renderUserGrantRow(u) {
  const { data: owned } = await sb.from('user_titles').select('title_id').eq('user_id', u.id);
  const ownedIds = new Set((owned || []).map(o => o.title_id));

  const titleChips = allTitles.map(t => {
    const has = ownedIds.has(t.id);
    return `<button class="btn btn-sm" data-toggle-title="${t.id}" data-user="${u.id}" data-owned="${has}"
              style="border:1px solid ${t.color}; color:${has ? '#04141d' : t.color}; background:${has ? t.color : 'transparent'};">
              ${escapeHtml(t.name)}${has ? ' ✕' : ' +'}
            </button>`;
  }).join(' ');

  return `
    <div style="padding:14px 20px; border-bottom:1px solid var(--navy-light);">
      <p style="margin:0 0 8px; font-weight:700;">${escapeHtml(displayNameFor(u))} <span class="muted" style="font-weight:400; font-size:0.8rem;">@${escapeHtml(u.username)}</span></p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">${titleChips || '<span class="muted">No titles exist yet.</span>'}</div>
    </div>
  `;
}

function wireGrantButtons() {
  document.querySelectorAll('[data-toggle-title]').forEach(btn => {
    btn.addEventListener('click', () => toggleUserTitle(btn.dataset.user, btn.dataset.toggleTitle, btn.dataset.owned === 'true'));
  });
}

async function toggleUserTitle(userId, titleId, currentlyOwned) {
  if (currentlyOwned) {
    const { error } = await sb.from('user_titles').delete().eq('user_id', userId).eq('title_id', titleId);
    if (error) { showToast(error.message, true); return; }
    showToast('Title revoked.');
  } else {
    const { error } = await sb.from('user_titles').insert({ user_id: userId, title_id: titleId });
    if (error) { showToast(error.message, true); return; }
    showToast('Title granted.');
  }
  await searchUsers(document.getElementById('grant-user-search').value.trim());
}
