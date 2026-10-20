// BloxCore — /admin/errors/ (admin only): client_errors grouped by message with counts.
// Data: get_client_error_groups(); "Clear" removes every row of one group (clear_client_errors).

onReady(async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  document.getElementById('err-content').style.display = 'block';
  document.getElementById('err-days').addEventListener('change', loadErrorGroups);
  loadErrorGroups();
});

async function loadErrorGroups() {
  const days = Number(document.getElementById('err-days').value) || 7;
  const list = document.getElementById('err-list');
  const { data, error } = await sb.rpc('get_client_error_groups', { p_days: days });
  if (error) { logError(error); list.innerHTML = errorStateHtml("Couldn't load client errors.", 'loadErrorGroups()'); refreshIcons(); return; }
  const rows = data || [];
  const total = rows.reduce((n, r) => n + Number(r.n), 0);
  document.getElementById('err-summary').textContent = rows.length ? `${rows.length} distinct ${rows.length === 1 ? 'error' : 'errors'} · ${total} total ${total === 1 ? 'event' : 'events'}` : '';
  if (!rows.length) { list.innerHTML = '<div class="empty-state">No client errors in this window — nice.</div>'; return; }
  list.innerHTML = rows.map((r, i) => {
    let page = '';
    try { const u = new URL(r.sample_page); page = u.pathname + u.search; } catch { page = r.sample_page || ''; }
    return `
      <div class="err-row" data-i="${i}">
        <div class="err-top"><p class="err-msg">${escapeHtml(r.message)}</p><span class="err-count" title="${r.n} events">${r.n}×</span></div>
        <p class="err-meta">${r.users} ${Number(r.users) === 1 ? 'visitor' : 'visitors'} · first ${timeAgo(r.first_seen)} · last ${timeAgo(r.last_seen)}${page ? ` · e.g. <a href="${escapeHtml(safeUrl(r.sample_page))}" target="_blank" rel="noopener noreferrer">${escapeHtml(page)}</a>` : ''}</p>
        <div class="err-actions">
          ${r.sample_stack ? `<button type="button" class="btn btn-ghost btn-sm" data-stack="${i}">Stack trace</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-copy="${i}">Copy</button>
          <button type="button" class="btn btn-ghost btn-sm" data-clear="${i}">Clear group</button>
        </div>
        <pre class="err-stack" id="err-stack-${i}" hidden>${escapeHtml(r.sample_stack || '')}${r.sample_agent ? '\n\n' + escapeHtml(r.sample_agent) : ''}</pre>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-stack]').forEach(b => b.addEventListener('click', () => { const el = document.getElementById('err-stack-' + b.dataset.stack); el.hidden = !el.hidden; }));
  list.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const r = rows[Number(b.dataset.copy)];
    try { await navigator.clipboard.writeText(`${r.message}\n${r.sample_page || ''}\n${r.sample_stack || ''}`); showToast('Copied.'); } catch { showToast("Couldn't copy.", true); }
  }));
  list.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', async () => {
    const r = rows[Number(b.dataset.clear)];
    if (!window.confirm(`Delete all ${r.n} events for this error?`)) return;
    const { error: e } = await sb.rpc('clear_client_errors', { p_message: r.message });
    if (e) { showToast(e.message, true); return; }
    showToast('Cleared.');
    loadErrorGroups();
  }));
}
