// BloxCore — admin/appeals/index.html logic (mod+ only)

let currentAppealStatus = 'pending';
let _appealsTabInit = false;

async function initAppealsTab() {
  if (_appealsTabInit) return;
  _appealsTabInit = true;

  try {
    document.querySelectorAll('#appeal-status-tabs [data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentAppealStatus = btn.dataset.status;
        document.querySelectorAll('#appeal-status-tabs [data-status]').forEach(b => {
          b.className = `btn btn-sm ${b.dataset.status === currentAppealStatus ? 'btn-primary' : 'btn-ghost'}`;
        });
        loadAppeals();
      });
    });

    await loadAppeals();
  } catch (e) {
    logError('Failed to init Appeals tab:', e);
    _appealsTabInit = false;
    showToast('Something went wrong loading appeals. Try again.', true);
  }
}

const APPEALS_PAGE_SIZE = 20;
let appealsListDelegated = false;

async function fetchAppealsPage(offset, pageSize) {
  const { data, error } = await sb
    .from('ban_appeals')
    .select('*, profiles!ban_appeals_user_id_fkey(username, display_name, banned_reason)')
    .eq('status', currentAppealStatus)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { logError(error); return null; }
  return data;
}

async function loadAppeals() {
  const list = document.getElementById('appeals-list');
  const data = await fetchAppealsPage(0, APPEALS_PAGE_SIZE);

  if (data === null) {
    list.innerHTML = errorStateHtml("Couldn't load appeals right now.", 'loadAppeals()');
    refreshIcons();
    return;
  }

  list.innerHTML = data.length
    ? data.map(renderAppealCard).join('')
    : `<div class="empty-state">No ${currentAppealStatus} appeals.</div>`;

  refreshIcons();
  wireAppealBulk();
  refreshAppealBulkBar();

  if (!appealsListDelegated) {
    appealsListDelegated = true;
    list.addEventListener('click', (e) => {
      const approveBtn = e.target.closest('[data-approve-appeal]');
      if (approveBtn) { resolveAppeal(approveBtn.dataset.approveAppeal, true); return; }
      const denyBtn = e.target.closest('[data-deny-appeal]');
      if (denyBtn) resolveAppeal(denyBtn.dataset.denyAppeal, false);
    });
  }

  if (data.length === APPEALS_PAGE_SIZE) {
    attachLoadMore(list, {
      wrapId: 'appeals-load-more-wrap',
      pageSize: APPEALS_PAGE_SIZE,
      initialOffset: data.length,
      fetchPage: async (offset, pageSize) => (await fetchAppealsPage(offset, pageSize)) || [],
      renderItem: renderAppealCard,
      onAppend: () => { refreshIcons(); refreshAppealBulkBar(); },
    });
  }
}

function renderAppealCard(a) {
  const uname = a.profiles?.username || '';
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="flex-between" style="align-items:flex-start; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          ${a.status === 'pending' ? `<input type="checkbox" data-appeal-select="${a.id}" aria-label="Select appeal" style="width:auto; margin-top:5px;">` : ''}
          <div>
            <a href="/player/?u=${encodeURIComponent(uname)}" style="font-weight:700; color:var(--bone); text-decoration:none;">${escapeHtml(displayNameFor(a.profiles || {}))}</a>
            <p class="muted" style="margin:2px 0 0; font-size:0.78rem;">${timeAgo(a.created_at)}</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          ${a.profiles?.banned_reason ? `<span class="tag tag-hard">Banned: ${escapeHtml(a.profiles.banned_reason)}</span>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-mod-notes="${a.user_id}" data-username="${escapeHtml(uname)}" title="Private staff notes"><i data-lucide="notebook-pen" class="icon-sm icon-inline"></i>Notes</button>
        </div>
      </div>
      <p style="margin:12px 0 0; padding:12px; background:rgba(255,255,255,0.03); border-radius:var(--radius-sm); font-size:0.9rem;">${escapeHtml(a.message)}</p>
      ${a.admin_response ? `<p class="muted" style="margin:10px 0 0; font-size:0.82rem;">Staff response: "${escapeHtml(a.admin_response)}"</p>` : ''}
      ${a.status === 'pending' ? `
        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" data-approve-appeal="${a.id}">Approve & Unban</button>
          <button class="btn btn-danger btn-sm" data-deny-appeal="${a.id}">Deny</button>
        </div>
      ` : ''}
    </div>
  `;
}

// Reply dialog with canned templates (admin-shell.js); falls back to a plain prompt if the shell isn't loaded.
async function askAppealResponse(approve, count = 1) {
  if (window.admShell?.askResponse) {
    return window.admShell.askResponse({
      kind: approve ? 'approve' : 'deny',
      title: `${approve ? 'Approve & unban' : 'Deny'} ${count > 1 ? `${count} appeals` : 'appeal'}`,
      confirmLabel: approve ? 'Approve & unban' : 'Deny',
      hint: approve ? 'Optional note, visible to the user.' : 'Reason for denying — visible to the user.',
    });
  }
  const r = window.prompt(approve ? 'Optional note to include (visible to the user):' : 'Reason for denying (visible to the user):');
  return r === null ? null : r.trim();
}

async function resolveAppeal(appealId, approve) {
  const response = await askAppealResponse(approve);
  if (response === null) return;

  const { error } = await sb.rpc('resolve_ban_appeal', { p_appeal_id: appealId, p_approve: approve, p_response: response || null });
  if (error) { showToast(error.message, true); return; }
  showToast(approve ? 'Appeal approved — user unbanned.' : 'Appeal denied.');
  await loadAppeals();
}

// ---- bulk select (pending tab) ----
function selectedAppealIds() { return [...document.querySelectorAll('[data-appeal-select]:checked')].map(c => c.dataset.appealSelect); }

function refreshAppealBulkBar() {
  const bar = document.getElementById('appeal-bulk-bar');
  if (!bar) return;
  const boxes = document.querySelectorAll('[data-appeal-select]');
  const n = selectedAppealIds().length;
  bar.style.display = boxes.length ? 'flex' : 'none';
  document.getElementById('appeal-select-count').textContent = `${n} selected`;
  document.getElementById('appeal-bulk-approve').disabled = n === 0;
  document.getElementById('appeal-bulk-deny').disabled = n === 0;
  const all = document.getElementById('appeal-select-all');
  all.checked = boxes.length > 0 && n === boxes.length;
}

let appealBulkWired = false;
function wireAppealBulk() {
  if (appealBulkWired || !document.getElementById('appeal-bulk-bar')) return;
  appealBulkWired = true;
  document.getElementById('appeals-list').addEventListener('change', (e) => { if (e.target.matches('[data-appeal-select]')) refreshAppealBulkBar(); });
  document.getElementById('appeal-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('[data-appeal-select]').forEach(c => { c.checked = e.target.checked; });
    refreshAppealBulkBar();
  });
  document.getElementById('appeal-bulk-approve').addEventListener('click', () => bulkResolveAppeals(true));
  document.getElementById('appeal-bulk-deny').addEventListener('click', () => bulkResolveAppeals(false));
}

async function bulkResolveAppeals(approve) {
  const ids = selectedAppealIds();
  if (!ids.length) return;
  const response = await askAppealResponse(approve, ids.length);
  if (response === null) return;
  let failed = 0;
  for (const id of ids) {
    const { error } = await sb.rpc('resolve_ban_appeal', { p_appeal_id: id, p_approve: approve, p_response: response || null });
    if (error) { failed++; logError(error); }
  }
  showToast(failed ? `${ids.length - failed} done, ${failed} failed.` : `${approve ? 'Approved' : 'Denied'} ${ids.length} appeal${ids.length === 1 ? '' : 's'}.`, failed > 0);
  await loadAppeals();
}
