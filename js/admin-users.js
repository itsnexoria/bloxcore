// BloxCore — admin/users/index.html logic (admin only)

let currentAdminId = null;
const PAGE_SIZE = 20;
let currentPage = 0;
let currentQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  currentAdminId = auth.user.id;

  await loadUsers('', 0);

  let debounceTimer;
  document.getElementById('user-search').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadUsers(e.target.value.trim(), 0), 250);
  });

  document.getElementById('users-table').addEventListener('click', (e) => {
    if (e.target.id === 'u-prev') loadUsers(currentQuery, currentPage - 1);
    if (e.target.id === 'u-next') loadUsers(currentQuery, currentPage + 1);
  });
});

async function loadUsers(query, page) {
  const table = document.getElementById('users-table');
  currentQuery = query;
  currentPage = page;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let req = sb
    .from('profiles')
    .select('id, username, display_name, level, region, role, pirate_bounty, marine_bounty, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query) {
    req = req.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);
  }

  const { data, error, count } = await req;

  if (error) {
    table.innerHTML = `<p class="muted">Couldn't load users right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    table.innerHTML = `<div class="empty-state">No users match that search.</div>`;
    return;
  }

  table.innerHTML = `<div class="panel" style="padding:0;">` +
    data.map((u, i) => renderRow(u, i === data.length - 1)).join('') +
    `</div>` + renderPager(count);

  document.querySelectorAll('[data-set-role]').forEach(select => {
    select.addEventListener('change', () => setRole(select.dataset.setRole, select.value, select));
  });
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 20px;">
      <button class="btn btn-ghost btn-sm" id="u-prev" ${currentPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${currentPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="u-next" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Next →</button>
    </div>
  `;
}

const ROLE_TAG = {
  admin: `<span class="tag" style="background:rgba(255,77,109,0.16); color:var(--blood-dim);">Admin</span>`,
  mod: `<span class="tag" style="background:rgba(41,182,246,0.16); color:var(--brass-bright);">Mod</span>`,
  user: '',
};

function renderRow(u, isLast) {
  const isSelf = u.id === currentAdminId;

  return `
    <div class="flex-between" style="padding:14px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="min-width:0;">
        <p style="margin:0; font-weight:700;">
          <a href="/player/?u=${encodeURIComponent(u.username)}" style="color:var(--bone); text-decoration:none;">${escapeHtml(displayNameFor(u))}</a>
          ${ROLE_TAG[u.role] || ''}
        </p>
        <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
          @${escapeHtml(u.username)} · Lv. ${u.level}${u.region ? ` · ${escapeHtml(u.region)}` : ''} · joined ${formatDate(u.created_at)}
        </p>
      </div>
      <select data-set-role="${u.id}" ${isSelf ? 'disabled title="Can\'t change your own role here"' : ''} style="width:auto; margin:0;">
        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
        <option value="mod" ${u.role === 'mod' ? 'selected' : ''}>Mod</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
    </div>
  `;
}

async function setRole(userId, newRole, select) {
  select.disabled = true;
  const { error } = await sb.rpc('set_user_role', { target_user_id: userId, new_role: newRole });
  select.disabled = false;

  if (error) {
    showToast(error.message, true);
    await loadUsers(currentQuery, currentPage);
    return;
  }

  showToast(`Role updated to ${newRole}.`);
}
