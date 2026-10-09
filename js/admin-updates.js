// BloxCore — /admin/updates/ : create game-update guides and freeze today's fruit tier list onto them (admin only).

onReady(async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  document.getElementById('upd-admin-content').style.display = '';
  const nameInput = document.getElementById('upd-name');
  const slugInput = document.getElementById('upd-slug');
  let slugTouched = false;
  slugInput.addEventListener('input', () => { slugTouched = true; });
  nameInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = nameInput.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  });
  document.getElementById('upd-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('upd-form').addEventListener('submit', (e) => createUpdate(e, auth.user));
  await loadAdminUpdates();
});

async function createUpdate(e, user) {
  e.preventDefault();
  const btn = document.getElementById('upd-submit');
  btn.disabled = true;
  const row = {
    slug: document.getElementById('upd-slug').value.trim(),
    name: document.getElementById('upd-name').value.trim(),
    released_on: document.getElementById('upd-date').value,
    summary: document.getElementById('upd-summary').value.trim(),
    notes: document.getElementById('upd-notes').value.trim(),
    created_by: user.id,
  };
  const { data, error } = await sb.from('game_updates').insert(row).select('id').single();
  if (error) { btn.disabled = false; showToast(error.code === '23505' ? 'That slug is already used.' : error.message, true); return; }
  // freeze the current tier list right away — the common case, and it's re-runnable from the list
  const { error: snapErr } = await sb.rpc('snapshot_update_tiers', { p_update_id: data.id });
  btn.disabled = false;
  if (snapErr) showToast(`Saved, but the tier snapshot failed: ${snapErr.message}`, true); else showToast('Update published with a tier list snapshot.');
  document.getElementById('upd-form').reset();
  document.getElementById('upd-date').value = new Date().toISOString().slice(0, 10);
  loadAdminUpdates();
}

async function loadAdminUpdates() {
  const list = document.getElementById('upd-admin-list');
  const { data, error } = await sb.from('game_updates').select('id, slug, name, released_on, snapshot_at').order('released_on', { ascending: false });
  if (error) { list.innerHTML = '<p class="muted">Couldn\'t load updates.</p>'; return; }
  if (!data.length) { list.innerHTML = '<p class="muted">No updates yet.</p>'; return; }
  list.innerHTML = data.map(u => `
    <div class="panel" style="padding:12px 14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <div style="flex:1; min-width:180px;"><strong>${escapeHtml(u.name)}</strong><div class="muted" style="font-size:0.78rem;">${u.released_on} · ${u.snapshot_at ? `tier list saved ${new Date(u.snapshot_at).toLocaleDateString()}` : 'no tier list'}</div></div>
      <a class="btn btn-ghost btn-sm" href="/blox-fruits-updates/?u=${encodeURIComponent(u.slug)}" target="_blank" rel="noopener">View</a>
      <button class="btn btn-ghost btn-sm" data-snap="${u.id}">Re-snapshot tiers</button>
      <button class="btn btn-ghost btn-sm" data-del="${u.id}" aria-label="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
    </div>`).join('');
  refreshIcons();
  list.querySelectorAll('[data-snap]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Replace this update\'s tier list with TODAY\'s fruit values?')) return;
    const { error: err } = await sb.rpc('snapshot_update_tiers', { p_update_id: b.dataset.snap });
    if (err) { showToast(err.message, true); return; }
    showToast('Tier list re-saved from current values.');
    loadAdminUpdates();
  }));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this update guide?')) return;
    const { error: err } = await sb.from('game_updates').delete().eq('id', b.dataset.del);
    if (err) { showToast(err.message, true); return; }
    loadAdminUpdates();
  }));
}
