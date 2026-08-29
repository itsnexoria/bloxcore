// BloxCore — pvp/index.html logic

let currentUser = null;
let currentFilter = 'all';
let allMatches = [];
let myJoinedIds = new Set();

const MATCH_SLOTS = { '1v1': 2, '2v2': 4, '3v3': 6, '4v4': 8 };

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    document.getElementById('post-match-btn').style.display = 'inline-flex';
  }

  document.getElementById('post-match-btn').addEventListener('click', () => {
    document.getElementById('post-match-modal').classList.add('open');
  });
  document.getElementById('post-match-close').addEventListener('click', () => {
    document.getElementById('post-match-modal').classList.remove('open');
  });
  document.getElementById('post-match-form').addEventListener('submit', handlePostMatch);

  document.querySelectorAll('#pvp-category-tabs [data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('#pvp-category-tabs [data-filter]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.filter === currentFilter ? 'btn-primary' : 'btn-ghost'}`;
      });
      renderMatches();
    });
  });

  await loadMatches();
  loadActionNeeded();

  if (new URLSearchParams(window.location.search).get('tab') === 'tournaments') {
    document.querySelector('#pvp-category-tabs [data-filter="tournaments"]').click();
  }

  setInterval(renderMatches, 30000); // keep countdowns + expired listings fresh without a full reload
});

async function loadMatches() {
  const container = document.getElementById('pvp-matches-list');

  if (currentUser) {
    const { data: joined } = await sb.from('pvp_match_participants').select('match_id').eq('user_id', currentUser.id);
    myJoinedIds = new Set((joined || []).map(j => j.match_id));
  }

  const [{ data: matches, error }, { data: participants }] = await Promise.all([
    sb.from('pvp_matches').select('*, profiles!pvp_matches_host_id_fkey(username, display_name, avatar_url, avatar_frame, roblox_verified)').order('created_at', { ascending: false }),
    sb.from('pvp_match_participants').select('match_id, user_id, profiles(username, display_name, avatar_url, avatar_frame)'),
  ]);

  if (error) {
    container.innerHTML = errorStateHtml("Couldn't load matches right now.", 'loadMatches()');
    refreshIcons();
    logError(error);
    return;
  }

  const countsByMatch = new Map();
  (participants || []).forEach(p => {
    if (!countsByMatch.has(p.match_id)) countsByMatch.set(p.match_id, []);
    countsByMatch.get(p.match_id).push(p);
  });

  allMatches = (matches || []).map(m => ({ ...m, participants: countsByMatch.get(m.id) || [] }));
  renderMatches();
}

function renderMatches() {
  const container = document.getElementById('pvp-matches-list');
  const tournamentsPanel = document.getElementById('pvp-tournaments-panel');

  if (currentFilter === 'tournaments') {
    container.style.display = 'none';
    tournamentsPanel.style.display = 'block';
    if (typeof loadTournamentsList === 'function') loadTournamentsList();
    return;
  }
  container.style.display = '';
  tournamentsPanel.style.display = 'none';

  const now = Date.now();
  const visible = allMatches
    .filter(m => new Date(m.expires_at).getTime() > now)
    .filter(m => currentFilter === 'all' || m.match_type === currentFilter);

  container.innerHTML = visible.length
    ? visible.map(renderMatchCard).join('')
    : `<div class="empty-state" style="grid-column:1/-1;">No live matches${currentFilter === 'all' ? '' : ' for this type'} right now — post one to get a game going.</div>`;

  refreshIcons();
  document.querySelectorAll('[data-join-match]').forEach(btn => btn.addEventListener('click', () => joinMatch(btn.dataset.joinMatch)));
  document.querySelectorAll('[data-leave-match]').forEach(btn => btn.addEventListener('click', () => leaveMatch(btn.dataset.leaveMatch)));
  document.querySelectorAll('[data-delete-match]').forEach(btn => btn.addEventListener('click', () => deleteMatch(btn.dataset.deleteMatch)));
  document.querySelectorAll('[data-report-match]').forEach(btn => btn.addEventListener('click', () => reportContent('pvp_match', btn.dataset.reportMatch)));
  document.querySelectorAll('[data-report-result]').forEach(btn => btn.addEventListener('click', () => openReportResultModal(btn.dataset.reportResult)));
}

function renderMatchCard(m) {
  const joined = myJoinedIds.has(m.id);
  const full = m.participants.length >= m.max_players;
  const isHost = currentUser && m.host_id === currentUser.id;

  const totalMs = new Date(m.expires_at).getTime() - new Date(m.created_at).getTime();
  const leftMs = new Date(m.expires_at).getTime() - Date.now();
  const pctLeft = Math.max(0, Math.min(100, (leftMs / totalMs) * 100));
  const urgent = pctLeft < 25;

  let actionHtml;
  if (!currentUser) {
    actionHtml = `<a href="/auth/" class="btn btn-primary btn-block btn-sm">Sign in to Join</a>`;
  } else if (joined) {
    actionHtml = `<button class="btn btn-ghost btn-block btn-sm" data-leave-match="${m.id}">Leave</button>`;
  } else if (full) {
    actionHtml = `<button class="btn btn-ghost btn-block btn-sm" disabled>Match Full</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-block btn-sm" data-join-match="${m.id}">Join</button>`;
  }

  const avatarStack = m.participants.slice(0, 5).map(p => avatarHtml(p.profiles || {}, 26, 'margin-left:-8px;')).join('');
  const extraCount = m.participants.length > 5 ? `<span class="muted" style="font-size:0.72rem; margin-left:8px;">+${m.participants.length - 5}</span>` : '';

  const cornerBtn = isHost
    ? `<button class="se-corner-btn" data-delete-match="${m.id}" title="Delete match"><i data-lucide="x" class="icon-sm"></i></button>`
    : (currentUser ? `<button class="se-corner-btn" data-report-match="${m.id}" title="Report"><i data-lucide="flag" class="icon-sm"></i></button>` : '');
  return `
    <div class="panel se-card hover-lift-card pvp-match-card">
      <div class="se-banner" style="background:linear-gradient(135deg, rgba(220,38,38,0.25), rgba(8,8,12,0.65));">
        <div class="se-banner-scrim"></div>
        <span class="se-type-pill"><i data-lucide="swords" class="icon-sm"></i>${m.match_type}</span>
        ${cornerBtn}
        <div class="se-host-row">
          ${avatarHtml(m.profiles || {}, 28, 'box-shadow:0 0 0 2px rgba(10,14,23,0.9);')}
          <a href="/player/?u=${encodeURIComponent(m.profiles?.username || '')}">${escapeHtml(displayNameFor(m.profiles || {}))}</a>
          ${m.profiles?.roblox_verified ? '<i data-lucide="badge-check" class="icon-sm" style="color:#34d399;" title="Verified Roblox account"></i>' : ''}
        </div>
      </div>

      <div class="se-body">
        ${m.notes ? `<p class="muted" style="margin:0 0 14px; font-size:0.85rem;">${escapeHtml(m.notes)}</p>` : ''}

        <div class="flex-between" style="font-size:0.78rem; margin-bottom:6px;">
          <span class="muted">${m.participants.length}/${m.max_players} joined</span>
          <span style="color:${urgent ? 'var(--blood-dim)' : 'var(--ash)'};">${timeRemaining(m.expires_at)}</span>
        </div>
        <div style="height:4px; border-radius:2px; background:rgba(255,255,255,0.06); overflow:hidden; margin-bottom:14px;">
          <div style="height:100%; width:${pctLeft}%; background:${urgent ? 'var(--blood-dim)' : 'var(--brass)'}; transition:width 1s linear;"></div>
        </div>
        ${m.participants.length ? `<div style="display:flex; align-items:center; margin:0 0 14px 8px;">${avatarStack}${extraCount}</div>` : ''}

        <div style="display:flex; gap:8px;">
          <a href="${safeUrl(m.link)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="flex:1; min-width:0;"><i data-lucide="external-link" class="icon-sm icon-inline"></i>Open</a>
          <div style="flex:1; min-width:0;">${actionHtml}</div>
        </div>
        ${isHost ? `<button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px;" data-report-result="${m.id}"><i data-lucide="clipboard-check" class="icon-sm icon-inline"></i>Report Result</button>` : ''}
      </div>
    </div>
  `;
}

async function handlePostMatch(e) {
  e.preventDefault();
  const errorEl = document.getElementById('post-match-error');
  errorEl.style.display = 'none';

  const matchType = document.getElementById('pvp-type').value;
  const notes = document.getElementById('pvp-notes').value.trim();

  const payload = {
    match_type: matchType,
    host_id: currentUser.id,
    link: document.getElementById('pvp-link').value.trim(),
    notes: notes || null,
    max_players: MATCH_SLOTS[matchType] || 2,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  if (!isRobloxLink(payload.link)) {
    errorEl.textContent = 'Link must be a roblox.com link (your profile or a private server link) — other sites aren\'t allowed, to keep scam links off here.';
    errorEl.style.display = 'block';
    return;
  }

  const { error } = await sb.from('pvp_matches').insert(payload);
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  document.getElementById('post-match-form').reset();
  document.getElementById('post-match-modal').classList.remove('open');
  showToast('Match posted — it auto-deletes in 1h.');
  await loadMatches();
}

async function joinMatch(matchId) {
  const { error } = await sb.from('pvp_match_participants').insert({ match_id: matchId, user_id: currentUser.id });
  if (error) { showToast(error.message, true); return; }
  myJoinedIds.add(matchId);
  showToast('Joined — good luck out there.');
  await loadMatches();
}

async function leaveMatch(matchId) {
  const { error } = await sb.from('pvp_match_participants').delete().eq('match_id', matchId).eq('user_id', currentUser.id);
  if (error) { showToast(error.message, true); return; }
  myJoinedIds.delete(matchId);
  await loadMatches();
}

async function deleteMatch(matchId) {
  if (!window.confirm('Delete this match?')) return;
  const { error } = await sb.from('pvp_matches').delete().eq('id', matchId);
  if (error) { showToast(error.message, true); return; }
  await loadMatches();
}

// ---------------------------------------------------------------------------
// Result reporting (host) + proof upload (host +, for 1v1s, the opponent too)
// ---------------------------------------------------------------------------

let reportingMatch = null;
let reportWon = null;
let proofTargetResultId = null;

document.getElementById('report-result-close').addEventListener('click', () => {
  document.getElementById('report-result-modal').classList.remove('open');
});
document.getElementById('submit-proof-close').addEventListener('click', () => {
  document.getElementById('submit-proof-modal').classList.remove('open');
});
document.getElementById('report-won-btn').addEventListener('click', () => setReportWon(true));
document.getElementById('report-lost-btn').addEventListener('click', () => setReportWon(false));
document.getElementById('report-result-form').addEventListener('submit', handleReportResult);
document.getElementById('submit-proof-form').addEventListener('submit', handleSubmitProof);

function setReportWon(won) {
  reportWon = won;
  document.getElementById('report-won-btn').className = `btn btn-sm ${won === true ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('report-lost-btn').className = `btn btn-sm ${won === false ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('report-won-btn').style.flex = '1';
  document.getElementById('report-lost-btn').style.flex = '1';
}

async function openReportResultModal(matchId) {
  reportingMatch = allMatches.find(m => m.id === matchId);
  if (!reportingMatch) return;
  reportWon = null;
  document.getElementById('report-result-form').reset();
  document.getElementById('report-result-error').style.display = 'none';
  setReportWon(null);

  const opponentField = document.getElementById('report-opponent-field');
  const opponentSelect = document.getElementById('report-opponent');
  const proofNote = document.getElementById('report-proof-note');

  if (reportingMatch.match_type === '1v1') {
    if (!reportingMatch.participants.length) {
      showToast('Nobody has joined this match yet — nothing to report.', true);
      return;
    }
    opponentField.style.display = 'block';
    opponentSelect.required = true;
    opponentSelect.innerHTML = reportingMatch.participants.map(p =>
      `<option value="${p.user_id}">${escapeHtml(displayNameFor(p.profiles || {}))}</option>`).join('');
    proofNote.textContent = 'For 1v1s, both you and your opponent need to upload your own proof screenshot before staff can approve it.';
  } else {
    opponentField.style.display = 'none';
    opponentSelect.required = false;
    proofNote.textContent = 'Your screenshot or video is enough for team matches — your teammates/opponents don\'t need to submit anything.';
  }

  document.getElementById('report-result-modal').classList.add('open');
}

async function handleReportResult(e) {
  e.preventDefault();
  const errorEl = document.getElementById('report-result-error');
  errorEl.style.display = 'none';

  if (reportWon === null) {
    errorEl.textContent = 'Pick whether you won or lost.';
    errorEl.style.display = 'block';
    return;
  }

  const file = document.getElementById('report-screenshot').files[0];
  const videoUrl = document.getElementById('report-video').value.trim();
  if (!file && !videoUrl) {
    errorEl.textContent = 'Add a screenshot or a video link as proof.';
    errorEl.style.display = 'block';
    return;
  }
  if (videoUrl && !isVideoPlatformLink(videoUrl)) {
    errorEl.textContent = 'Video link must be from YouTube, Twitch, Streamable, Medal, Vimeo, TikTok, or a Google Drive link.';
    errorEl.style.display = 'block';
    return;
  }

  const submitBtn = document.getElementById('report-result-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const opponentId = reportingMatch.match_type === '1v1' ? document.getElementById('report-opponent').value : null;

    const { data: result, error: resultError } = await sb.from('pvp_results').insert({
      match_id: reportingMatch.id,
      match_type: reportingMatch.match_type,
      host_id: currentUser.id,
      opponent_id: opponentId,
      host_won: reportWon,
    }).select().single();
    if (resultError) throw resultError;

    let proofUrl = null;
    if (file) {
      proofUrl = await uploadScreenshot(currentUser.id, file, `pvp-${result.id}-${Date.now()}`);
    }

    const { error: proofError } = await sb.from('pvp_result_proofs').insert({
      result_id: result.id,
      user_id: currentUser.id,
      proof_url: proofUrl,
      video_url: videoUrl || null,
    });
    if (proofError) throw proofError;

    document.getElementById('report-result-modal').classList.remove('open');
    showToast(reportingMatch.match_type === '1v1'
      ? 'Reported — your opponent needs to confirm with their own proof before staff review.'
      : 'Reported — staff will review it soon.');
    loadActionNeeded();
  } catch (err) {
    errorEl.textContent = err.message?.includes('kill_cap_reached')
      ? 'You\'ve already beaten this player 3 times in the last 3 days — wait for the cooldown before reporting another win against them.'
      : (err.message || 'Something went wrong. Try again.');
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Result';
  }
}

async function openSubmitProofModal(resultId, contextLabel) {
  proofTargetResultId = resultId;
  document.getElementById('submit-proof-form').reset();
  document.getElementById('submit-proof-error').style.display = 'none';
  document.getElementById('submit-proof-context').textContent = contextLabel;
  document.getElementById('submit-proof-modal').classList.add('open');
}

async function handleSubmitProof(e) {
  e.preventDefault();
  const errorEl = document.getElementById('submit-proof-error');
  errorEl.style.display = 'none';

  const file = document.getElementById('proof-screenshot').files[0];
  const videoUrl = document.getElementById('proof-video').value.trim();
  if (!file && !videoUrl) {
    errorEl.textContent = 'Add a screenshot or a video link.';
    errorEl.style.display = 'block';
    return;
  }
  if (videoUrl && !isVideoPlatformLink(videoUrl)) {
    errorEl.textContent = 'Video link must be from YouTube, Twitch, Streamable, Medal, Vimeo, TikTok, or a Google Drive link.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    let proofUrl = null;
    if (file) {
      proofUrl = await uploadScreenshot(currentUser.id, file, `pvp-${proofTargetResultId}-${Date.now()}`);
    }

    const { error } = await sb.from('pvp_result_proofs').insert({
      result_id: proofTargetResultId,
      user_id: currentUser.id,
      proof_url: proofUrl,
      video_url: videoUrl || null,
    });
    if (error) throw error;

    document.getElementById('submit-proof-modal').classList.remove('open');
    showToast('Proof submitted — staff will review it soon.');
    loadActionNeeded();
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

async function loadActionNeeded() {
  const container = document.getElementById('pvp-action-needed');
  if (!currentUser) { container.style.display = 'none'; return; }

  const { data: results } = await sb.from('pvp_results')
    .select('id, match_type, host_id, opponent_id, host_won, status, created_at, host:profiles!pvp_results_host_id_fkey(username, display_name), opponent:profiles!pvp_results_opponent_id_fkey(username, display_name)')
    .or(`host_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (!results?.length) { container.style.display = 'none'; return; }

  const { data: myProofs } = await sb.from('pvp_result_proofs').select('result_id').eq('user_id', currentUser.id);
  const proofedIds = new Set((myProofs || []).map(p => p.result_id));

  const needsMyProof = results.filter(r => r.match_type === '1v1' && r.opponent_id === currentUser.id && !proofedIds.has(r.id));

  if (!needsMyProof.length) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="panel" style="border-color:var(--brass); background:rgb(var(--brass-rgb) / 0.06);">
      <p style="margin:0 0 10px; font-weight:700; display:flex; align-items:center; gap:8px;"><i data-lucide="alert-triangle" class="icon-sm" style="color:var(--brass-bright);"></i>Action needed — confirm these results</p>
      ${needsMyProof.map(r => `
        <div class="flex-between" style="padding:8px 0; border-top:1px solid var(--glass-border); flex-wrap:wrap; gap:8px;">
          <span style="font-size:0.85rem;">${escapeHtml(displayNameFor(r.host))} reported a <strong>${r.match_type}</strong> — they said ${r.host_won ? 'they won' : 'you won'}.</span>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" data-confirm-result="${r.id}">Confirm — Upload Proof</button>
            <button class="btn btn-ghost btn-sm" data-dispute-result="${r.id}" style="color:var(--blood-dim);">That's Not What Happened</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  refreshIcons();
  container.querySelectorAll('[data-confirm-result]').forEach(btn => {
    btn.addEventListener('click', () => openSubmitProofModal(btn.dataset.confirmResult, 'Upload your own screenshot to confirm this result — staff will review both sides.'));
  });
  container.querySelectorAll('[data-dispute-result]').forEach(btn => {
    btn.addEventListener('click', () => openDisputeFlow(btn.dataset.disputeResult));
  });
}

async function openDisputeFlow(resultId) {
  const reason = window.prompt('What actually happened? Be specific — staff will compare this against both proofs.');
  if (!reason || !reason.trim()) return;
  if (!window.confirm('This will flag the result for staff review instead of a normal approval. Continue?')) return;

  const { error } = await sb.rpc('dispute_pvp_result', { p_result_id: resultId, p_reason: reason.trim() });
  if (error) { showToast(error.message, true); return; }
  showToast('Disputed — upload your own proof so staff can compare both sides.');
  openSubmitProofModal(resultId, 'Upload your proof for this disputed result — staff will decide the outcome.');
  loadActionNeeded();
}
