// BloxCore — admin/manage/index.html "Tournaments" tab logic

let _tournamentsTabInit = false;
let expandedTournamentId = null;

function initTournamentsTab() {
  if (_tournamentsTabInit) { loadTournamentsAdminList(); return; }
  _tournamentsTabInit = true;

  document.getElementById('new-tournament-btn').addEventListener('click', () => {
    document.getElementById('tournament-form').reset();
    document.getElementById('tournament-error').style.display = 'none';
    document.getElementById('tournament-modal').style.display = 'flex';
  });
  document.getElementById('tournament-modal-cancel').addEventListener('click', () => {
    document.getElementById('tournament-modal').style.display = 'none';
  });
  document.getElementById('tournament-form').addEventListener('submit', handleCreateTournament);

  loadTournamentsAdminList();
}

async function handleCreateTournament(e) {
  e.preventDefault();
  const errorEl = document.getElementById('tournament-error');
  errorEl.style.display = 'none';

  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    name: document.getElementById('tn-name').value.trim(),
    description: document.getElementById('tn-description').value.trim() || null,
    match_type: document.getElementById('tn-match-type').value,
    bracket_size: Number(document.getElementById('tn-bracket-size').value),
    created_by: user.id,
  };

  const { error } = await sb.from('tournaments').insert(payload);
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }

  document.getElementById('tournament-modal').style.display = 'none';
  showToast('Tournament created — open for registration.');
  loadTournamentsAdminList();
}

async function loadTournamentsAdminList() {
  const container = document.getElementById('tournaments-admin-list');
  const { data: tournaments, error } = await sb.from('tournaments')
    .select('id, name, description, match_type, bracket_size, status, winner:profiles!tournaments_winner_id_fkey(username, display_name)')
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<p class="muted">Couldn't load tournaments.</p>`; return; }
  if (!tournaments.length) { container.innerHTML = `<div class="empty-state">No tournaments yet — create one to get started.</div>`; return; }

  const ids = tournaments.map(t => t.id);
  const { data: counts } = await sb.from('tournament_participants').select('tournament_id').in('tournament_id', ids);
  const countByTournament = new Map();
  (counts || []).forEach(c => countByTournament.set(c.tournament_id, (countByTournament.get(c.tournament_id) || 0) + 1));

  container.innerHTML = tournaments.map(t => renderAdminTournamentRow(t, countByTournament.get(t.id) || 0)).join('');
  refreshIcons();

  container.querySelectorAll('[data-toggle-tournament]').forEach(btn => {
    btn.addEventListener('click', () => toggleTournamentExpand(btn.dataset.toggleTournament));
  });
  container.querySelectorAll('[data-start-tournament]').forEach(btn => {
    btn.addEventListener('click', () => startTournamentAction(btn.dataset.startTournament));
  });
  container.querySelectorAll('[data-cancel-tournament]').forEach(btn => {
    btn.addEventListener('click', () => cancelTournamentAction(btn.dataset.cancelTournament));
  });

  if (expandedTournamentId) loadTournamentAdminDetail(expandedTournamentId);
}

const TN_STATUS_LABEL = { registration_open: 'Registration Open', in_progress: 'In Progress', completed: 'Completed' };

function renderAdminTournamentRow(t, count) {
  const expanded = expandedTournamentId === t.id;
  return `
    <div class="panel" style="margin-bottom:10px;">
      <div class="flex-between" style="cursor:pointer;" data-toggle-tournament="${t.id}">
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(t.name)} <span class="tag tag-medium" style="font-size:0.68rem;">${TN_STATUS_LABEL[t.status]}</span></p>
          <p class="muted" style="margin:4px 0 0; font-size:0.78rem;">${escapeHtml(t.match_type)} · ${count}/${t.bracket_size} registered ${t.winner ? `· Champion: ${escapeHtml(displayNameFor(t.winner))}` : ''}</p>
        </div>
        <i data-lucide="${expanded ? 'chevron-up' : 'chevron-down'}" class="icon-sm muted"></i>
      </div>
      ${expanded ? `
        <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--glass-border);">
          <div style="display:flex; gap:8px; margin-bottom:14px;">
            ${t.status === 'registration_open' ? `<button class="btn btn-primary btn-sm" data-start-tournament="${t.id}" ${count < 2 ? 'disabled title="Need at least 2 registered players"' : ''}>Start Tournament</button>` : ''}
            ${t.status !== 'completed' ? `<button class="btn btn-ghost btn-sm" data-cancel-tournament="${t.id}" style="color:var(--blood-dim);">Cancel Tournament</button>` : ''}
          </div>
          <div id="tournament-admin-detail-${t.id}"><div class="skeleton" style="height:80px;"></div></div>
        </div>
      ` : ''}
    </div>
  `;
}

function toggleTournamentExpand(id) {
  expandedTournamentId = expandedTournamentId === id ? null : id;
  loadTournamentsAdminList();
}

async function startTournamentAction(id) {
  if (!window.confirm('Start this tournament? Registration will close and the bracket will be generated.')) return;
  const { error } = await sb.rpc('start_tournament', { p_tournament_id: id });
  if (error) { showToast(error.message, true); return; }
  showToast('Tournament started — bracket generated.');
  loadTournamentsAdminList();
}

async function cancelTournamentAction(id) {
  const reason = window.prompt('Optional reason (shown to registered players):') || null;
  if (!window.confirm('Cancel this tournament? This can\'t be undone.')) return;
  const { error } = await sb.rpc('cancel_tournament', { p_tournament_id: id, p_reason: reason });
  if (error) { showToast(error.message, true); return; }
  showToast('Tournament cancelled.');
  expandedTournamentId = null;
  loadTournamentsAdminList();
}

async function loadTournamentAdminDetail(id) {
  const el = document.getElementById(`tournament-admin-detail-${id}`);
  if (!el) return;

  const { data: t } = await sb.from('tournaments').select('status').eq('id', id).single();

  if (t.status === 'registration_open') {
    const { data: participants } = await sb.from('tournament_participants').select('user_id, joined_at, profiles(username, display_name, avatar_url)').eq('tournament_id', id).order('joined_at');
    el.innerHTML = `
      <p class="muted" style="margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">Registered Players</p>
      ${(participants || []).length ? (participants || []).map(p => `
        <div style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:0.85rem;">${avatarHtml(p.profiles || {}, 22)}<span>${escapeHtml(displayNameFor(p.profiles || {}))}</span></div>
      `).join('') : `<p class="muted" style="font-size:0.82rem;">Nobody's registered yet.</p>`}
    `;
    refreshIcons();
    return;
  }

  const { data: matches } = await sb.from('tournament_matches')
    .select('id, round, match_number, player1_id, player2_id, winner_id, status, player1:profiles!tournament_matches_player1_id_fkey(username, display_name, avatar_url), player2:profiles!tournament_matches_player2_id_fkey(username, display_name, avatar_url)')
    .eq('tournament_id', id).order('round').order('match_number');

  el.innerHTML = renderAdminBracket(matches || []);
  refreshIcons();

  el.querySelectorAll('[data-report-winner]').forEach(btn => {
    btn.addEventListener('click', () => reportTournamentMatchWinner(btn.dataset.reportWinner, btn.dataset.winnerId));
  });
}

function renderAdminBracket(matches) {
  const rounds = new Map();
  matches.forEach(m => { if (!rounds.has(m.round)) rounds.set(m.round, []); rounds.get(m.round).push(m); });
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);

  return `
    <div style="display:flex; gap:20px; overflow-x:auto; padding-bottom:8px;">
      ${roundNumbers.map(r => `
        <div style="min-width:230px; display:flex; flex-direction:column; gap:10px;">
          <p class="muted" style="margin:0; font-size:0.72rem; text-transform:uppercase;">Round ${r}</p>
          ${rounds.get(r).sort((a, b) => a.match_number - b.match_number).map(m => renderAdminBracketMatch(m)).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderAdminBracketMatch(m) {
  const canReport = m.status === 'pending' && m.player1_id && m.player2_id;
  const playerRow = (profile, playerId) => {
    if (!profile && !playerId) return `<div class="bracket-slot bracket-slot-empty">TBD</div>`;
    const isWinner = m.winner_id === playerId;
    return `
      <div class="bracket-slot ${isWinner ? 'bracket-slot-winner' : ''}" style="justify-content:space-between;">
        <span style="display:flex; align-items:center; gap:8px;">${profile ? avatarHtml(profile, 20) : ''}${escapeHtml(profile ? displayNameFor(profile) : 'Bye')}</span>
        ${canReport ? `<button class="btn btn-ghost btn-sm" style="padding:3px 8px; font-size:0.7rem;" data-report-winner="${m.id}" data-winner-id="${playerId}">Won</button>` : ''}
      </div>
    `;
  };
  return `<div class="panel" style="padding:6px 8px;">${playerRow(m.player1, m.player1_id)}${playerRow(m.player2, m.player2_id)}</div>`;
}

async function reportTournamentMatchWinner(matchId, winnerId) {
  if (!window.confirm('Confirm this result? The winner advances immediately.')) return;
  const { error } = await sb.rpc('report_tournament_match', { p_match_id: matchId, p_winner_id: winnerId });
  if (error) { showToast(error.message, true); return; }
  showToast('Result recorded.');
  loadTournamentsAdminList();
}
