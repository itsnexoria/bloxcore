// BloxCore — admin/reports/index.html logic (mod+ only)

let currentStatus = 'open';
let selectedReportIds = new Set();

const TARGET_LABEL = {
  trade_listing: 'Trade Listing',
  sea_event: 'Sea Event',
  pvp_match: 'PvP Match',
  crew: 'Crew',
  profile: 'Player Profile',
  service_listing: 'Service Listing',
  direct_message: 'Direct Message',
  vouch: 'Vouch',
};
const TARGET_LINK = {
  trade_listing: id => `/trading/#${id}`,
  sea_event: () => `/sea-events/`,
  pvp_match: () => `/pvp/`,
  crew: id => `/crew/?id=${id}`,
  // Profile links need a username, not the id — resolved separately via reportedUsernames.
  profile: id => reportedUsernames.get(id) ? `/player/?u=${encodeURIComponent(reportedUsernames.get(id))}` : null,
  service_listing: () => `/services/`,
  // DMs have no public page — the message content itself is shown inline instead of a link.
  direct_message: () => null,
  // A vouch's own id isn't a profile — the target profile is resolved separately, same as 'profile'.
  vouch: id => reportedVouchProfiles.get(id) ? `/player/?u=${encodeURIComponent(reportedVouchProfiles.get(id))}` : null,
};
// Deleting a reported profile isn't a real action — banning/moderating a player goes
// through admin/users instead, so 'profile' is deliberately absent here.
const TARGET_TABLE = { trade_listing: 'trade_listings', sea_event: 'sea_events', pvp_match: 'pvp_matches', crew: 'crews', service_listing: 'service_listings', direct_message: 'direct_messages', vouch: 'vouches' };
let reportedUsernames = new Map();
let reportedVouchProfiles = new Map();
let reportedMessages = new Map();
let _reportsTabInit = false;

async function initReportsTab() {
  if (_reportsTabInit) return;
  _reportsTabInit = true;

  try {
    document.querySelectorAll('#report-status-tabs [data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentStatus = btn.dataset.status;
        document.querySelectorAll('#report-status-tabs [data-status]').forEach(b => {
          b.className = `btn btn-sm ${b.dataset.status === currentStatus ? 'btn-primary' : 'btn-ghost'}`;
        });
        selectedReportIds = new Set();
        loadReports();
      });
    });

    document.getElementById('report-select-all').addEventListener('change', (e) => {
      document.querySelectorAll('[data-report-select]').forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) selectedReportIds.add(cb.dataset.reportSelect);
        else selectedReportIds.delete(cb.dataset.reportSelect);
      });
      updateReportBulkBar();
    });
    document.getElementById('report-bulk-dismiss-btn').addEventListener('click', bulkDismissReports);

    await loadReports();
  } catch (e) {
    logError('Failed to init Reports tab:', e);
    _reportsTabInit = false;
    showToast('Something went wrong loading reports. Try again.', true);
  }
}

function updateReportBulkBar() {
  const count = selectedReportIds.size;
  document.getElementById('report-select-count').textContent = count ? `${count} selected` : 'Select reports below';
  document.getElementById('report-bulk-dismiss-btn').disabled = count === 0;
  // Load More appends fresh, unchecked rows — without this, checking "select all" then
  // loading more would leave the select-all box looking checked even though the new
  // rows aren't actually selected.
  const selectAll = document.getElementById('report-select-all');
  const rowCount = document.querySelectorAll('[data-report-select]').length;
  selectAll.checked = count > 0 && rowCount > 0 && document.querySelectorAll('[data-report-select]:checked').length === rowCount;
}

async function bulkDismissReports() {
  const ids = Array.from(selectedReportIds);
  if (!ids.length) return;
  const { error } = await sb.from('reports').update({ status: 'dismissed' }).in('id', ids);
  if (error) { showToast(error.message, true); return; }
  showToast(`Dismissed ${ids.length} report${ids.length > 1 ? 's' : ''}.`);
  selectedReportIds = new Set();
  await loadReports();
}

const REPORTS_PAGE_SIZE = 25;
let reportsListDelegated = false;

async function fetchReportsPage(offset, pageSize) {
  const { data, error } = await sb
    .from('reports')
    .select('*, profiles!reports_reporter_id_fkey(username, display_name)')
    .eq('status', currentStatus)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { logError(error); return null; }

  const profileTargetIds = [...new Set(data.filter(r => r.target_type === 'profile').map(r => r.target_id))];
  if (profileTargetIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', profileTargetIds);
    profs?.forEach(p => reportedUsernames.set(p.id, p.username));
  }

  const dmTargetIds = [...new Set(data.filter(r => r.target_type === 'direct_message').map(r => r.target_id))];
  if (dmTargetIds.length) {
    const { data: msgs } = await sb.from('direct_messages').select('id, message, sender_id, profiles!direct_messages_sender_id_fkey(username, display_name)').in('id', dmTargetIds);
    msgs?.forEach(m => reportedMessages.set(m.id, { message: m.message, sender: displayNameFor(m.profiles || {}) }));
  }

  const vouchTargetIds = [...new Set(data.filter(r => r.target_type === 'vouch').map(r => r.target_id))];
  if (vouchTargetIds.length) {
    const { data: vouches } = await sb.from('vouches').select('id, target_id, profiles!vouches_target_id_fkey(username)').in('id', vouchTargetIds);
    vouches?.forEach(v => reportedVouchProfiles.set(v.id, v.profiles?.username));
  }
  return data;
}

async function loadReports() {
  const list = document.getElementById('reports-list');
  reportedUsernames = new Map();
  reportedVouchProfiles = new Map();
  reportedMessages = new Map();
  const data = await fetchReportsPage(0, REPORTS_PAGE_SIZE);

  if (data === null) {
    list.innerHTML = `<p class="muted">Couldn't load reports right now.</p>`;
    return;
  }

  list.innerHTML = data.length
    ? data.map(renderReportCard).join('')
    : `<div class="empty-state">No ${currentStatus} reports.</div>`;

  document.getElementById('report-bulk-bar').style.display = (currentStatus === 'open' && data.length) ? 'flex' : 'none';
  refreshIcons();
  wireReportRowState();

  if (!reportsListDelegated) {
    reportsListDelegated = true;
    list.addEventListener('click', (e) => {
      const dismissBtn = e.target.closest('[data-dismiss-report]');
      if (dismissBtn) { updateReport(dismissBtn.dataset.dismissReport, 'dismissed'); return; }
      const resolveBtn = e.target.closest('[data-resolve-report]');
      if (resolveBtn) { updateReport(resolveBtn.dataset.resolveReport, 'resolved'); return; }
      const deleteBtn = e.target.closest('[data-delete-target]');
      if (deleteBtn) deleteTargetAndResolve(deleteBtn.dataset.deleteTarget, deleteBtn.dataset.targetType, deleteBtn.dataset.targetId);
    });
    list.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-report-select]');
      if (!cb) return;
      if (cb.checked) selectedReportIds.add(cb.dataset.reportSelect);
      else selectedReportIds.delete(cb.dataset.reportSelect);
      updateReportBulkBar();
    });
  }

  if (data.length === REPORTS_PAGE_SIZE) {
    attachLoadMore(list, {
      wrapId: 'reports-load-more-wrap',
      pageSize: REPORTS_PAGE_SIZE,
      initialOffset: data.length,
      fetchPage: async (offset, pageSize) => (await fetchReportsPage(offset, pageSize)) || [],
      renderItem: renderReportCard,
      onAppend: () => { refreshIcons(); wireReportRowState(); },
    });
  }
}

// Syncs each visible checkbox's checked state from selectedReportIds (new rows always
// start unchecked, which is correct — selections are cleared on every status-tab switch).
function wireReportRowState() {
  document.querySelectorAll('[data-report-select]').forEach(cb => {
    cb.checked = selectedReportIds.has(cb.dataset.reportSelect);
  });
  updateReportBulkBar();
}

function renderReportCard(r) {
  const label = TARGET_LABEL[r.target_type] || r.target_type;
  const link = TARGET_LINK[r.target_type]?.(r.target_id);
  const canDelete = !!TARGET_TABLE[r.target_type];
  const dm = r.target_type === 'direct_message' ? reportedMessages.get(r.target_id) : null;
  const noLinkFallback = r.target_type === 'direct_message'
    ? (dm ? '' : `<span class="muted" style="font-size:0.78rem;">Message already auto-deleted</span>`)
    : `<span class="muted" style="font-size:0.78rem;">Reported player no longer exists</span>`;
  return `
    <div class="panel" style="margin-bottom:12px;">
      <div class="flex-between" style="align-items:flex-start; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          ${r.status === 'open' ? `<input type="checkbox" data-report-select="${r.id}" style="width:auto; margin-top:4px;">` : ''}
          <div>
            <span class="tag tag-medium">${label}</span>
            <p style="margin:6px 0 0;">${escapeHtml(r.reason)}</p>
            <p class="muted" style="margin:6px 0 0; font-size:0.78rem;">Reported by ${escapeHtml(displayNameFor(r.profiles || {}))} · ${timeAgo(r.created_at)}</p>
            ${dm ? `<p style="margin:8px 0 0; font-size:0.82rem; padding:8px 10px; background:rgb(var(--shadow-rgb) / 0.25); border-radius:var(--radius-sm, 8px);"><strong>${escapeHtml(dm.sender)}:</strong> ${escapeHtml(dm.message)}</p>` : ''}
          </div>
        </div>
        ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">View <i data-lucide="external-link" class="icon-sm icon-inline"></i></a>` : noLinkFallback}
      </div>
      ${r.status === 'open' ? `
        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          ${canDelete ? `<button class="btn btn-danger btn-sm" data-delete-target="${r.id}" data-target-type="${r.target_type}" data-target-id="${r.target_id}">Delete Content</button>` : ''}
          <button class="btn btn-primary btn-sm" data-resolve-report="${r.id}">Mark Resolved</button>
          <button class="btn btn-ghost btn-sm" data-dismiss-report="${r.id}">Dismiss</button>
        </div>
      ` : ''}
    </div>
  `;
}

async function updateReport(reportId, status) {
  const { error } = await sb.from('reports').update({ status }).eq('id', reportId);
  if (error) { showToast(error.message, true); return; }
  await loadReports();
}

async function deleteTargetAndResolve(reportId, targetType, targetId) {
  const table = TARGET_TABLE[targetType];
  if (!table) return;
  if (!window.confirm('Delete the reported content? This can\'t be undone.')) return;

  const { error: deleteError } = await sb.from(table).delete().eq('id', targetId);
  if (deleteError) { showToast(deleteError.message, true); return; }

  await sb.from('reports').update({ status: 'resolved' }).eq('id', reportId);
  showToast('Content deleted and report resolved.');
  await loadReports();
}
