// BloxCore — admin/manage/index.html "PvP Results" tab logic

let _pvpTabInit = false;
let pvpResultsFilter = 'pending';

function initPvpResultsTab() {
  if (_pvpTabInit) { loadPvpResults(); return; }
  _pvpTabInit = true;

  document.querySelectorAll('[data-pvp-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      pvpResultsFilter = btn.dataset.pvpFilter;
      document.querySelectorAll('[data-pvp-filter]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.pvpFilter === pvpResultsFilter ? 'btn-primary' : 'btn-ghost'}`;
      });
      loadPvpResults();
    });
  });

  loadPvpResults();
}

async function loadPvpResults() {
  const container = document.getElementById('pvp-results-list');
  container.innerHTML = `<div class="skeleton" style="height:100px; margin-bottom:10px;"></div><div class="skeleton" style="height:100px;"></div>`;

  const { data: results, error } = await sb.from('pvp_results')
    .select('id, match_type, host_id, opponent_id, host_won, status, admin_note, dispute_reason, created_at, host:profiles!pvp_results_host_id_fkey(username, display_name, avatar_url, avatar_frame), opponent:profiles!pvp_results_opponent_id_fkey(username, display_name, avatar_url, avatar_frame, pvp_disputes_against)')
    .eq('status', pvpResultsFilter)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) { container.innerHTML = `<p class="muted">Couldn't load results right now.</p>`; return; }
  if (!results.length) { container.innerHTML = `<div class="empty-state">No ${pvpResultsFilter} results.</div>`; return; }

  const { data: proofs } = await sb.from('pvp_result_proofs').select('result_id, user_id, proof_url, video_url');
  const proofsByResult = new Map();
  (proofs || []).forEach(p => {
    if (!proofsByResult.has(p.result_id)) proofsByResult.set(p.result_id, []);
    proofsByResult.get(p.result_id).push(p);
  });

  container.innerHTML = results.map(r => renderPvpResultRow(r, proofsByResult.get(r.id) || [])).join('');
  refreshIcons();

  container.querySelectorAll('[data-approve-pvp]').forEach(btn => btn.addEventListener('click', () => reviewPvpResult(btn.dataset.approvePvp, 'approve')));
  container.querySelectorAll('[data-reject-pvp]').forEach(btn => btn.addEventListener('click', () => reviewPvpResult(btn.dataset.rejectPvp, 'reject')));
  container.querySelectorAll('[data-resolve-host-won]').forEach(btn => btn.addEventListener('click', () => resolveDispute(btn.dataset.resolveHostWon, true)));
  container.querySelectorAll('[data-resolve-opponent-won]').forEach(btn => btn.addEventListener('click', () => resolveDispute(btn.dataset.resolveOpponentWon, false)));
}

function renderPvpResultRow(r, proofs) {
  const required = r.match_type === '1v1' ? 2 : 1;
  const hostProof = proofs.find(p => p.user_id === r.host_id);
  const opponentProof = r.opponent_id ? proofs.find(p => p.user_id === r.opponent_id) : null;
  const complete = proofs.length >= required;

  const winnerName = r.host_won ? displayNameFor(r.host) : (r.opponent ? displayNameFor(r.opponent) : 'Host\'s side');
  const loserName = r.host_won ? (r.opponent ? displayNameFor(r.opponent) : 'Opponent\'s side') : displayNameFor(r.host);

  const proofLink = (p, label) => p
    ? (p.proof_url
        ? `<a href="${p.proof_url}" target="_blank" rel="noopener noreferrer" title="${label} proof"><img src="${p.proof_url}" alt="" loading="lazy" style="width:32px; height:32px; object-fit:cover; border-radius:6px; border:1px solid var(--glass-border);"></a>`
        : `<a href="${p.video_url}" target="_blank" rel="noopener noreferrer" class="tag tag-medium" style="font-size:0.7rem;">${label} video</a>`)
    : `<span class="tag" style="background:rgba(220,38,38,0.12); color:var(--blood-dim); font-size:0.7rem;">${label} missing</span>`;

  return `
    <div class="panel" style="margin-bottom:10px; ${r.status === 'disputed' ? 'border-color:var(--blood-dim);' : ''}">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(r.match_type)} — <span style="color:#34d399;">${escapeHtml(winnerName)}</span> beat <span style="color:var(--blood-dim);">${escapeHtml(loserName)}</span> ${r.status === 'disputed' ? '<span class="tag" style="background:rgba(220,38,38,0.15); color:var(--blood-dim);">Disputed</span>' : ''}</p>
          <p class="muted" style="margin:4px 0 0; font-size:0.78rem;">Reported by ${escapeHtml(displayNameFor(r.host))} · ${timeAgo(r.created_at)} ${!complete ? `· <span style="color:var(--brass-bright);">Waiting on ${required - proofs.length} more proof${required - proofs.length > 1 ? 's' : ''}</span>` : ''}</p>
          ${r.dispute_reason ? `<p style="margin:6px 0 0; font-size:0.82rem; color:var(--blood-dim);">${escapeHtml(displayNameFor(r.opponent || {}))} says: "${escapeHtml(r.dispute_reason)}"${r.opponent?.pvp_disputes_against >= 2 ? ` <span class="tag" style="background:rgba(220,38,38,0.15); color:var(--blood-dim); font-size:0.68rem;" title="Disputes this player has lost before">⚠ ${r.opponent.pvp_disputes_against} baseless disputes on record</span>` : ''}</p>` : ''}
          ${r.admin_note ? `<p class="muted" style="margin:6px 0 0; font-size:0.78rem;">Note: ${escapeHtml(r.admin_note)}</p>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${proofLink(hostProof, 'Host')}
          ${r.match_type === '1v1' ? proofLink(opponentProof, 'Opponent') : ''}
        </div>
      </div>
      ${r.status === 'pending' ? `
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn btn-primary btn-sm" data-approve-pvp="${r.id}" ${complete ? '' : 'disabled title="Missing required proof"'}>Approve</button>
          <button class="btn btn-ghost btn-sm" data-reject-pvp="${r.id}">Reject</button>
        </div>
      ` : ''}
      ${r.status === 'disputed' ? `
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" data-resolve-host-won="${r.id}">${escapeHtml(displayNameFor(r.host))} Actually Won</button>
          <button class="btn btn-primary btn-sm" data-resolve-opponent-won="${r.id}">${escapeHtml(displayNameFor(r.opponent || {}))} Actually Won</button>
          <button class="btn btn-ghost btn-sm" data-reject-pvp="${r.id}">Reject Entirely</button>
        </div>
      ` : ''}
    </div>
  `;
}

async function reviewPvpResult(id, action) {
  let note = null;
  if (action === 'reject') {
    note = window.prompt('Optional note for the reporter (why this was rejected):') || null;
  }
  const rpcName = action === 'approve' ? 'approve_pvp_result' : 'reject_pvp_result';
  const { error } = await sb.rpc(rpcName, { p_result_id: id, p_note: note });
  if (error) { showToast(error.message, true); return; }
  showToast(action === 'approve' ? 'Approved — win/loss recorded.' : 'Rejected.');
  loadPvpResults();
}

async function resolveDispute(id, hostWon) {
  const note = window.prompt('Note explaining the decision (shown to the reporter):') || null;
  const { error } = await sb.rpc('resolve_pvp_dispute', { p_result_id: id, p_host_won: hostWon, p_note: note });
  if (error) { showToast(error.message, true); return; }
  showToast('Dispute resolved — win/loss recorded.');
  loadPvpResults();
}
