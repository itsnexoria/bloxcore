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
    console.error('Failed to init Appeals tab:', e);
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
  if (error) { console.error(error); return null; }
  return data;
}

async function loadAppeals() {
  const list = document.getElementById('appeals-list');
  const data = await fetchAppealsPage(0, APPEALS_PAGE_SIZE);

  if (data === null) {
    list.innerHTML = `<p class="muted">Couldn't load appeals right now.</p>`;
    return;
  }

  list.innerHTML = data.length
    ? data.map(renderAppealCard).join('')
    : `<div class="empty-state">No ${currentAppealStatus} appeals.</div>`;

  refreshIcons();

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
      onAppend: refreshIcons,
    });
  }
}

function renderAppealCard(a) {
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="flex-between" style="align-items:flex-start; flex-wrap:wrap; gap:8px;">
        <div>
          <a href="/player/?u=${encodeURIComponent(a.profiles?.username || '')}" style="font-weight:700; color:var(--bone); text-decoration:none;">${escapeHtml(displayNameFor(a.profiles || {}))}</a>
          <p class="muted" style="margin:2px 0 0; font-size:0.78rem;">${timeAgo(a.created_at)}</p>
        </div>
        ${a.profiles?.banned_reason ? `<span class="tag tag-hard">Banned: ${escapeHtml(a.profiles.banned_reason)}</span>` : ''}
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

async function resolveAppeal(appealId, approve) {
  const response = window.prompt(approve ? 'Optional note to include (visible to the user):' : 'Reason for denying (visible to the user):');
  if (response === null) return;

  const { error } = await sb.rpc('resolve_ban_appeal', { p_appeal_id: appealId, p_approve: approve, p_response: response.trim() || null });
  if (error) { showToast(error.message, true); return; }
  showToast(approve ? 'Appeal approved — user unbanned.' : 'Appeal denied.');
  await loadAppeals();
}
