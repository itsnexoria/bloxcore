// BloxCore — admin/users/index.html logic

let currentAdminId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  currentAdminId = auth.user.id;

  await loadUsers('');

  let debounceTimer;
  document.getElementById('user-search').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadUsers(e.target.value.trim()), 250);
  });
});

async function loadUsers(query) {
  const table = document.getElementById('users-table');

  let req = sb
    .from('profiles')
    .select('id, username, display_name, level, region, is_admin, pirate_bounty, marine_bounty, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (query) {
    req = req.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);
  }

  const { data, error } = await req;

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
    `</div>`;

  document.querySelectorAll('[data-promote]').forEach(btn => {
    btn.addEventListener('click', () => setAdmin(btn.dataset.promote, true, btn));
  });
  document.querySelectorAll('[data-demote]').forEach(btn => {
    btn.addEventListener('click', () => setAdmin(btn.dataset.demote, false, btn));
  });
}

function renderRow(u, isLast) {
  const isSelf = u.id === currentAdminId;
  const adminTag = u.is_admin ? `<span class="tag" style="background:rgba(255,77,109,0.16); color:var(--blood-dim);">Admin</span>` : '';

  const actionBtn = u.is_admin
    ? (isSelf
        ? `<button class="btn btn-ghost btn-sm" disabled title="Can't remove your own access">Admin</button>`
        : `<button class="btn btn-danger btn-sm" data-demote="${u.id}">Remove Admin</button>`)
    : `<button class="btn btn-ghost btn-sm" data-promote="${u.id}">Make Admin</button>`;

  return `
    <div class="flex-between" style="padding:14px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="min-width:0;">
        <p style="margin:0; font-weight:700;">
          <a href="/player/?u=${encodeURIComponent(u.username)}" style="color:var(--bone); text-decoration:none;">${escapeHtml(displayNameFor(u))}</a>
          ${adminTag}
        </p>
        <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
          @${escapeHtml(u.username)} · Lv. ${u.level}${u.region ? ` · ${escapeHtml(u.region)}` : ''} · joined ${formatDate(u.created_at)}
        </p>
      </div>
      ${actionBtn}
    </div>
  `;
}

async function setAdmin(userId, makeAdmin, btn) {
  btn.disabled = true;
  const { error } = await sb.rpc('set_user_admin', { target_user_id: userId, make_admin: makeAdmin });

  if (error) {
    showToast(error.message, true);
    btn.disabled = false;
    return;
  }

  showToast(makeAdmin ? 'User promoted to admin.' : 'Admin access removed.');
  await loadUsers(document.getElementById('user-search').value.trim());
}
