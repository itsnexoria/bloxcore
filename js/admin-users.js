// BloxCore — admin/users/index.html logic (admin only)

let currentAdminId = null;
const USERS_PAGE_SIZE = 20;
let usersPage = 0;
let currentQuery = '';
let selectedUserIds = new Set();

let _usersTabInit = false;

async function initUsersTab() {
  if (_usersTabInit) return;
  _usersTabInit = true;

  try {
    const { user } = await getCurrentProfile();
    currentAdminId = user?.id ?? null;

    await loadActiveUsers();
    await loadUsers('', 0);
    wireUserBulkBar();

    let debounceTimer;
    document.getElementById('user-search').addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadUsers(e.target.value.trim(), 0), 250);
    });

    document.getElementById('users-table').addEventListener('click', (e) => {
      if (e.target.id === 'u-prev') loadUsers(currentQuery, usersPage - 1);
      if (e.target.id === 'u-next') loadUsers(currentQuery, usersPage + 1);
    });
  } catch (e) {
    console.error('Failed to init Users tab:', e);
    _usersTabInit = false;
    showToast('Something went wrong loading users. Try again.', true);
  }
}

function wireUserBulkBar() {
  document.getElementById('user-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('[data-user-select]').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) selectedUserIds.add(cb.dataset.userSelect);
      else selectedUserIds.delete(cb.dataset.userSelect);
    });
    updateUserBulkBar();
  });
  document.getElementById('bulk-xp-btn').addEventListener('click', bulkAdjustXp);
  document.getElementById('bulk-role-btn').addEventListener('click', bulkSetRole);
  document.getElementById('bulk-ban-btn').addEventListener('click', () => bulkSetBanned(true));
  document.getElementById('bulk-unban-btn').addEventListener('click', () => bulkSetBanned(false));
}

function updateUserBulkBar() {
  const count = selectedUserIds.size;
  document.getElementById('user-select-count').textContent = count ? `${count} selected` : 'Select users below';
  ['bulk-xp-btn', 'bulk-role-btn', 'bulk-ban-btn', 'bulk-unban-btn'].forEach(id => {
    document.getElementById(id).disabled = count === 0;
  });
  const selectAll = document.getElementById('user-select-all');
  const rowCount = document.querySelectorAll('[data-user-select]').length;
  selectAll.checked = count > 0 && rowCount > 0 && document.querySelectorAll('[data-user-select]:checked').length === rowCount;
}

async function bulkAdjustXp() {
  const amount = parseInt(document.getElementById('bulk-xp-input').value, 10);
  if (!amount) {
    showToast('Enter a non-zero XP amount first.', true);
    return;
  }
  const ids = Array.from(selectedUserIds);
  let failed = 0;
  for (const id of ids) {
    const { error } = await sb.rpc('adjust_user_xp', { target_user_id: id, amount });
    if (error) failed++;
  }
  showToast(failed ? `Done, but ${failed} of ${ids.length} failed.` : `Adjusted XP by ${amount > 0 ? '+' : ''}${amount} for ${ids.length} user${ids.length > 1 ? 's' : ''}.`, failed > 0);
  document.getElementById('bulk-xp-input').value = '';
  selectedUserIds = new Set();
  await loadUsers(currentQuery, usersPage);
}

async function bulkSetRole() {
  const role = document.getElementById('bulk-role-select').value;
  const ids = Array.from(selectedUserIds);
  if (!ids.length) return;
  if (!window.confirm(`Set ${ids.length} user${ids.length > 1 ? 's' : ''} to "${role}"?`)) return;

  let failed = 0;
  for (const id of ids) {
    const { error } = await sb.rpc('set_user_role', { target_user_id: id, new_role: role });
    if (error) failed++;
  }
  showToast(failed ? `Done, but ${failed} of ${ids.length} failed.` : `Set ${ids.length} user${ids.length > 1 ? 's' : ''} to ${role}.`, failed > 0);
  selectedUserIds = new Set();
  await loadUsers(currentQuery, usersPage);
}

async function bulkSetBanned(isBanned) {
  const ids = Array.from(selectedUserIds);
  if (!ids.length) return;

  let reason = null;
  if (isBanned) {
    reason = window.prompt(`Reason for banning ${ids.length} user${ids.length > 1 ? 's' : ''} (shown to them):`, '');
    if (reason === null) return;
  } else if (!window.confirm(`Unban ${ids.length} user${ids.length > 1 ? 's' : ''}?`)) {
    return;
  }

  let failed = 0;
  for (const id of ids) {
    const { error } = await sb.rpc('set_user_banned', { target_user_id: id, is_banned: isBanned, reason: reason || null });
    if (error) failed++;
  }
  showToast(failed ? `Done, but ${failed} of ${ids.length} failed.` : `${isBanned ? 'Banned' : 'Unbanned'} ${ids.length} user${ids.length > 1 ? 's' : ''}.`, failed > 0);
  selectedUserIds = new Set();
  await loadUsers(currentQuery, usersPage);
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;   // active in the last 5 min = online
const IDLE_WINDOW_MS = 30 * 60 * 1000;    // active in the last 30 min = idle, else offline
let crmUsers = [];
let crmFilter = 'all';

function activityStatus(lastActiveAt) {
  if (!lastActiveAt) return 'offline';
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (ms <= ONLINE_WINDOW_MS) return 'online';
  if (ms <= IDLE_WINDOW_MS) return 'idle';
  return 'offline';
}

const STATUS_COLOR = { online: 'var(--sea)', idle: 'var(--brass-bright)', offline: 'var(--ash)' };
const STATUS_LABEL = { online: 'Online', idle: 'Idle', offline: 'Offline' };

async function loadActiveUsers() {
  const statsEl = document.getElementById('crm-stats');
  const listEl = document.getElementById('active-users');

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, avatar_frame, last_active_at')
    .order('last_active_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    statsEl.innerHTML = '';
    listEl.innerHTML = `<p class="muted">Couldn't load user activity right now.</p>`;
    console.error(error);
    return;
  }

  crmUsers = data.map(u => ({ ...u, status: activityStatus(u.last_active_at) }));

  const counts = { online: 0, idle: 0, offline: 0 };
  crmUsers.forEach(u => counts[u.status]++);

  statsEl.innerHTML = `
    <div class="panel" style="padding:16px 20px;">
      <p class="muted" style="margin:0; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;">Total Users</p>
      <p style="margin:4px 0 0; font-size:1.5rem; font-family:var(--font-mono);">${crmUsers.length}</p>
    </div>
    <div class="panel" style="padding:16px 20px;">
      <p class="muted" style="margin:0; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;"><i data-lucide="circle" style="width:8px;height:8px;fill:currentColor;"></i> Online</p>
      <p style="margin:4px 0 0; font-size:1.5rem; font-family:var(--font-mono); color:var(--sea);">${counts.online}</p>
    </div>
    <div class="panel" style="padding:16px 20px;">
      <p class="muted" style="margin:0; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;"><i data-lucide="circle" style="width:8px;height:8px;fill:currentColor;"></i> Idle</p>
      <p style="margin:4px 0 0; font-size:1.5rem; font-family:var(--font-mono); color:var(--brass-bright);">${counts.idle}</p>
    </div>
    <div class="panel" style="padding:16px 20px;">
      <p class="muted" style="margin:0; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;"><i data-lucide="circle" style="width:8px;height:8px;fill:currentColor;"></i> Offline</p>
      <p style="margin:4px 0 0; font-size:1.5rem; font-family:var(--font-mono);">${counts.offline}</p>
    </div>
  `;

  renderCrmList();
}

function renderCrmList() {
  const listEl = document.getElementById('active-users');
  const rows = crmFilter === 'all' ? crmUsers : crmUsers.filter(u => u.status === crmFilter);

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">No users match this filter.</div>`;
    return;
  }

  listEl.innerHTML = `<div class="panel panel-plain" style="padding:0;">` + rows.slice(0, 40).map((u, i) => `
    <div class="flex-between" style="padding:10px 20px; ${i === Math.min(rows.length, 40) - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:10px;">
        ${avatarHtml(u, 30)}
        <a href="/player/?u=${encodeURIComponent(u.username)}" style="color:var(--bone); text-decoration:none; font-weight:600;">${escapeHtml(displayNameFor(u))}</a>
      </div>
      <span style="font-size:0.8rem; font-family:var(--font-mono); color:${STATUS_COLOR[u.status]};"><i data-lucide="circle" style="width:8px;height:8px;fill:currentColor;"></i> ${STATUS_LABEL[u.status]}${u.last_active_at ? ` · ${timeAgo(u.last_active_at)}` : ''}</span>
    </div>
  `).join('') + `</div>`;
  refreshIcons();
}

document.querySelectorAll('[data-crm-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    crmFilter = btn.dataset.crmFilter;
    document.querySelectorAll('[data-crm-filter]').forEach(b => b.className = `btn btn-sm ${b === btn ? 'btn-primary' : 'btn-ghost'}`);
    renderCrmList();
  });
});

async function loadUsers(query, page) {
  const table = document.getElementById('users-table');
  currentQuery = query;
  usersPage = page;
  const from = page * USERS_PAGE_SIZE;
  const to = from + USERS_PAGE_SIZE - 1;

  let req = sb
    .from('profiles')
    .select('id, username, display_name, level, xp, region, role, banned, banned_reason, auto_approve_disabled, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query) {
    req = req.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);
  }

  const { data, error, count } = await req;

  if (error) {
    table.innerHTML = `<p class="muted">Couldn't load users right now.</p>`;
    document.getElementById('user-bulk-bar').style.display = 'none';
    console.error(error);
    return;
  }

  if (!data.length) {
    table.innerHTML = `<div class="empty-state">No users match that search.</div>`;
    document.getElementById('user-bulk-bar').style.display = 'none';
    return;
  }

  document.getElementById('user-bulk-bar').style.display = 'flex';

  table.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    data.map((u, i) => renderUserRow(u, i === data.length - 1)).join('') +
    `</div>` + renderUsersPager(count);

  document.querySelectorAll('[data-set-role]').forEach(select => {
    select.addEventListener('change', () => setRole(select.dataset.setRole, select.value, select));
  });
  document.querySelectorAll('[data-ban]').forEach(btn => {
    btn.addEventListener('click', () => handleBan(btn.dataset.ban));
  });
  document.querySelectorAll('[data-unban]').forEach(btn => {
    btn.addEventListener('click', () => handleUnban(btn.dataset.unban));
  });
  document.querySelectorAll('[data-xp-form]').forEach(form => {
    form.addEventListener('submit', handleXpAdjust);
  });
  document.querySelectorAll('[data-toggle-auto-approve]').forEach(btn => {
    btn.addEventListener('click', () => toggleAutoApprove(btn.dataset.toggleAutoApprove, btn.dataset.next === 'true'));
  });
  document.querySelectorAll('[data-user-select]').forEach(cb => {
    cb.checked = selectedUserIds.has(cb.dataset.userSelect);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedUserIds.add(cb.dataset.userSelect);
      else selectedUserIds.delete(cb.dataset.userSelect);
      updateUserBulkBar();
    });
  });
  updateUserBulkBar();
  refreshIcons();
}

function renderUsersPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 20px;">
      <button class="btn btn-ghost btn-sm" id="u-prev" ${usersPage === 0 ? 'disabled' : ''}><i data-lucide="chevron-left" class="icon-sm"></i> Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${usersPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="u-next" ${usersPage + 1 >= totalPages ? 'disabled' : ''}>Next <i data-lucide="chevron-right" class="icon-sm"></i></button>
    </div>
  `;
}

const ROLE_TAG = {
  admin: `<span class="tag" style="background:rgba(255,77,109,0.16); color:var(--blood-dim);">Admin</span>`,
  mod: `<span class="tag" style="background:rgb(var(--brass-rgb) / 0.16); color:var(--brass-bright);">Mod</span>`,
  user: '',
};

function renderUserRow(u, isLast) {
  const isSelf = u.id === currentAdminId;
  const isAdminUser = u.role === 'admin';
  const bannedTag = u.banned ? `<span class="tag" style="background:rgba(255,77,109,0.3); color:#ffc2cf;">Banned${u.banned_reason ? `: ${escapeHtml(u.banned_reason)}` : ''}</span>` : '';

  const banControl = isSelf || isAdminUser
    ? ''
    : (u.banned
        ? `<button class="btn btn-ghost btn-sm" data-unban="${u.id}">Unban</button>`
        : `<button class="btn btn-danger btn-sm" data-ban="${u.id}">Ban</button>`);

  return `
    <div style="padding:14px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:flex-start; gap:10px; min-width:0;">
          ${isSelf || isAdminUser ? '<span style="width:16px; display:inline-block;"></span>' : `<input type="checkbox" data-user-select="${u.id}" style="width:auto; margin-top:5px;">`}
          <div style="min-width:0;">
            <p style="margin:0; font-weight:700;">
              <a href="/player/?u=${encodeURIComponent(u.username)}" style="color:var(--bone); text-decoration:none;">${escapeHtml(displayNameFor(u))}</a>
              ${ROLE_TAG[u.role] || ''} ${bannedTag}
            </p>
            <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
              @${escapeHtml(u.username)} · Lv. ${u.level} (${u.xp} XP)${u.region ? ` · ${escapeHtml(u.region)}` : ''} · joined ${formatDate(u.created_at)}
            </p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <select data-set-role="${u.id}" ${isSelf ? 'disabled title="Can\'t change your own role here"' : ''} style="width:auto; margin:0;">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
            <option value="mod" ${u.role === 'mod' ? 'selected' : ''}>Mod</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ${banControl}
        </div>
      </div>
      <form data-xp-form="${u.id}" style="display:flex; gap:8px; align-items:center; margin-top:10px;">
        <input type="number" data-xp-input step="1" placeholder="e.g. 50 or -50" style="width:160px; margin:0;">
        <button type="submit" class="btn btn-ghost btn-sm">Adjust XP</button>
        ${!isSelf ? `<button type="button" class="btn btn-ghost btn-sm" data-toggle-auto-approve="${u.id}" data-next="${!u.auto_approve_disabled}">${u.auto_approve_disabled ? 'Re-enable Auto-Approve' : 'Disable Auto-Approve'}</button>` : ''}
      </form>
    </div>
  `;
}

async function setRole(userId, newRole, select) {
  select.disabled = true;
  const { error } = await sb.rpc('set_user_role', { target_user_id: userId, new_role: newRole });
  select.disabled = false;

  if (error) {
    showToast(error.message, true);
    await loadUsers(currentQuery, usersPage);
    return;
  }
  showToast(`Role updated to ${newRole}.`);
}

async function handleBan(userId) {
  const reason = window.prompt('Reason for the ban (shown to the player):', '');
  if (reason === null) return; // cancelled

  const { error } = await sb.rpc('set_user_banned', { target_user_id: userId, is_banned: true, reason: reason || null });
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('User banned.');
  await loadUsers(currentQuery, usersPage);
}

async function handleUnban(userId) {
  const { error } = await sb.rpc('set_user_banned', { target_user_id: userId, is_banned: false });
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('User unbanned.');
  await loadUsers(currentQuery, usersPage);
}

async function handleXpAdjust(e) {
  e.preventDefault();
  const userId = e.target.dataset.xpForm;
  const input = e.target.querySelector('[data-xp-input]');
  const amount = parseInt(input.value, 10);

  if (!amount) {
    showToast('Enter a non-zero amount.', true);
    return;
  }

  const { error } = await sb.rpc('adjust_user_xp', { target_user_id: userId, amount });
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast(`XP adjusted by ${amount > 0 ? '+' : ''}${amount}.`);
  await loadUsers(currentQuery, usersPage);
}

async function toggleAutoApprove(userId, nextDisabled) {
  const { error } = await sb.rpc('set_auto_approve_disabled', { target_user_id: userId, disabled: nextDisabled });
  if (error) { showToast(error.message, true); return; }
  showToast(nextDisabled ? 'Auto-approve disabled for this user.' : 'Auto-approve re-enabled.');
  await loadUsers(currentQuery, usersPage);
}
