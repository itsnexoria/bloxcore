// BloxCore — admin/index.html logic (consolidated review hub: mod+ only)
//
// Submissions, Giveaways, Reports, Appeals, and Crew Wars used to be five separate
// pages, each re-running requireMod() and its own full page load. Now they're tabs on
// one page: one shared auth check, and each tab's queries only fire the first time
// that tab is actually opened (see the _xTabInit guards in each section's own file).

const TABS = ['submissions', 'giveaways', 'reports', 'appeals', 'wars'];
let activeReviewTab = 'submissions';

onReady(async () => {
  const auth = await requireMod();
  if (!auth) return;

  populateTrustSystemBlurb();

  const requested = window.location.hash.replace('#', '');
  const initial = TABS.includes(requested) ? requested : 'submissions';

  document.querySelectorAll('[data-review-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchReviewTab(btn.dataset.reviewTab));
  });

  switchReviewTab(initial);
});

async function populateTrustSystemBlurb() {
  const el = document.getElementById('trust-system-blurb');
  if (!el) return;
  const settings = await getSiteSettings();
  if (!settings.trustAutoApproveEnabled) {
    el.innerHTML = `Pending bounty submissions awaiting a stamp. Auto-approve is currently <strong>disabled</strong> in <a href="/admin/manage/#site" style="color:var(--brass-bright);">Site Controls</a> — everything lands in this queue.`;
    return;
  }
  const rejectPct = Math.round(settings.trustMaxRejectRate * 100);
  el.innerHTML = `Pending bounty submissions awaiting a stamp. Trusted users (${settings.trustMinApproved}+ approved, ≤${rejectPct}% reject rate) auto-approve and skip this queue — manage that per-user on <a href="/admin/manage/#users" style="color:var(--brass-bright);">Manage Users</a>.`;
}

function switchReviewTab(tab) {
  if (!TABS.includes(tab)) return;
  activeReviewTab = tab;
  window.history.replaceState(null, '', `#${tab}`);

  document.querySelectorAll('[data-review-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.reviewTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.querySelectorAll('[data-review-panel]').forEach(panel => {
    panel.style.display = panel.dataset.reviewPanel === tab ? 'block' : 'none';
  });

  // Each of these is idempotent (guarded by its own _xTabInit flag) — safe to call
  // every time its tab is clicked, only actually fetches on the first activation.
  if (tab === 'submissions') initSubmissionsTab();
  else if (tab === 'giveaways') initGiveawaysReviewTab();
  else if (tab === 'reports') initReportsTab();
  else if (tab === 'appeals') initAppealsTab();
  else if (tab === 'wars') initWarsTab();
}

// ---- Giveaways review (new — pending submissions only; full CRUD stays on
// /admin/manage/#giveaways, which now also goes through the same review_giveaway() RPC) ----

let _giveawaysReviewTabInit = false;

async function initGiveawaysReviewTab() {
  if (_giveawaysReviewTabInit) return;
  _giveawaysReviewTabInit = true;
  try {
    await loadPendingGiveaways();
  } catch (e) {
    console.error('Failed to init Giveaways review tab:', e);
    _giveawaysReviewTabInit = false;
    showToast('Something went wrong loading giveaways. Try again.', true);
  }
}

async function loadPendingGiveaways() {
  const list = document.getElementById('pending-giveaways-list');

  const { data, error } = await sb
    .from('giveaways')
    .select('*, submitter:profiles!giveaways_created_by_fkey(username, display_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load pending giveaways right now.</p>`;
    console.error(error);
    return;
  }

  list.innerHTML = data.length
    ? data.map(renderPendingGiveawayCard).join('')
    : `<div class="empty-state">No giveaways waiting on review.</div>`;

  refreshIcons();
  document.querySelectorAll('[data-approve-pending-giveaway]').forEach(btn => {
    btn.addEventListener('click', () => reviewPendingGiveaway(btn.dataset.approvePendingGiveaway, true));
  });
  document.querySelectorAll('[data-reject-pending-giveaway]').forEach(btn => {
    btn.addEventListener('click', () => reviewPendingGiveaway(btn.dataset.rejectPendingGiveaway, false));
  });
}

function renderPendingGiveawayCard(g) {
  const image = g.image_url ? `<img src="${g.image_url}" alt="" loading="lazy" style="width:48px; height:48px; object-fit:contain; flex-shrink:0;">` : '';
  const submittedBy = g.submitter ? escapeHtml(displayNameFor(g.submitter)) : 'Unknown';
  return `
    <div class="panel" style="margin-bottom:14px; display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap;">
      ${image}
      <div style="flex:1; min-width:200px;">
        <p style="margin:0; font-weight:700;">${escapeHtml(g.title)} <span class="muted" style="font-weight:400;">— ${escapeHtml(g.prize)}</span></p>
        <p class="muted" style="margin:4px 0 0; font-size:0.82rem;">Submitted by ${submittedBy} · ends ${formatDate(g.ends_at)}</p>
        ${g.description ? `<p style="margin:10px 0 0; font-size:0.88rem; white-space:pre-wrap;">${escapeHtml(g.description)}</p>` : ''}
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button class="btn btn-primary btn-sm" data-approve-pending-giveaway="${g.id}">Approve</button>
        <button class="btn btn-ghost btn-sm" data-reject-pending-giveaway="${g.id}">Reject</button>
      </div>
    </div>
  `;
}

async function reviewPendingGiveaway(giveawayId, approve) {
  let note = null;
  if (!approve) {
    note = window.prompt('Reason for rejecting (shown to the submitter, optional):');
    if (note === null) return;
    note = note.trim() || null;
  } else if (!window.confirm('Approve this giveaway? It goes live immediately.')) {
    return;
  }

  const { error } = await sb.rpc('review_giveaway', { p_giveaway_id: giveawayId, p_approve: approve, p_note: note });
  if (error) { showToast(error.message, true); return; }
  showToast(approve ? 'Giveaway approved and live.' : 'Giveaway rejected.');
  await loadPendingGiveaways();
}
