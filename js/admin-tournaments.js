// BloxCore — admin/manage/index.html "Tournaments" tab logic

let _tournamentsTabInit = false;
let expandedTournamentId = null;

function initTournamentsTab() {
  if (_tournamentsTabInit) { loadTournamentsAdminList(); return; }
  _tournamentsTabInit = true;

  document.getElementById('new-tournament-btn').addEventListener('click', () => {
    document.getElementById('tournament-form').reset();
    document.getElementById('tournament-error').style.display = 'none';
    document.getElementById('tn-team-note').style.display = 'none';
    document.getElementById('tournament-modal').style.display = 'flex';
  });
  document.getElementById('tournament-modal-cancel').addEventListener('click', () => {
    document.getElementById('tournament-modal').style.display = 'none';
  });
  document.getElementById('tn-team-based').addEventListener('change', (e) => {
    document.getElementById('tn-team-note').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('tournament-form').addEventListener('submit', handleCreateTournament);

  document.getElementById('new-template-btn').addEventListener('click', () => {
    document.getElementById('template-form').reset();
    document.getElementById('template-error').style.display = 'none';
    document.getElementById('tpl-recurrence-fields').style.display = 'none';
    document.getElementById('template-modal').style.display = 'flex';
  });
  document.getElementById('template-modal-cancel').addEventListener('click', () => {
    document.getElementById('template-modal').style.display = 'none';
  });
  document.getElementById('tpl-recurrence').addEventListener('change', (e) => {
    document.getElementById('tpl-recurrence-fields').style.display = e.target.value === 'weekly' ? 'block' : 'none';
  });
  document.getElementById('template-form').addEventListener('submit', handleCreateTemplate);

  populateTournamentPrizeSelect();
  loadTournamentsAdminList();
  loadTournamentTemplates();
}

async function handleCreateTemplate(e) {
  e.preventDefault();
  const errorEl = document.getElementById('template-error');
  errorEl.style.display = 'none';

  const recurrence = document.getElementById('tpl-recurrence').value;
  const { data: { user } } = await sb.auth.getUser();

  const payload = {
    name: document.getElementById('tpl-name').value.trim(),
    description: document.getElementById('tpl-description').value.trim() || null,
    match_type: document.getElementById('tpl-match-type').value,
    bracket_size: Number(document.getElementById('tpl-bracket-size').value),
    elimination_type: document.getElementById('tpl-elimination-type').value,
    recurrence,
    day_of_week: recurrence === 'weekly' ? Number(document.getElementById('tpl-day-of-week').value) : null,
    time_of_day: recurrence === 'weekly' ? document.getElementById('tpl-time-of-day').value : null,
    created_by: user.id,
  };

  if (recurrence === 'weekly' && !payload.time_of_day) {
    errorEl.textContent = 'Pick a time of day for the weekly recurrence.';
    errorEl.style.display = 'block';
    return;
  }

  const { error } = await sb.from('tournament_templates').insert(payload);
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }

  document.getElementById('template-modal').style.display = 'none';
  showToast('Template saved.');
  loadTournamentTemplates();
}

async function loadTournamentTemplates() {
  const container = document.getElementById('tournament-templates-list');
  const { data: templates, error } = await sb.from('tournament_templates').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = `<p class="muted" style="font-size:0.82rem;">Couldn't load templates.</p>`; return; }
  if (!templates.length) { container.innerHTML = `<p class="muted" style="font-size:0.82rem;">No templates yet.</p>`; return; }

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  container.innerHTML = templates.map(t => `
    <div class="flex-between" style="padding:8px 0; border-top:1px solid var(--glass-border); font-size:0.85rem;">
      <span>
        ${escapeHtml(t.name)} <span class="muted">— ${escapeHtml(t.match_type)}, ${t.bracket_size}-slot, ${initCapWord(t.elimination_type)} Elim</span>
        ${t.recurrence === 'weekly' ? `<span class="tag tag-medium" style="font-size:0.66rem;">Weekly ${DAY_NAMES[t.day_of_week]} ${t.time_of_day?.slice(0, 5)} UTC</span>` : ''}
      </span>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-primary btn-sm" style="padding:3px 8px; font-size:0.72rem;" data-spawn-template="${t.id}">Create Now</button>
        <button class="btn btn-ghost btn-sm" style="padding:3px 8px; font-size:0.72rem; color:var(--blood-dim);" data-delete-template="${t.id}">Delete</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-spawn-template]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error: spawnError } = await sb.rpc('create_tournament_from_template', { p_template_id: btn.dataset.spawnTemplate });
      if (spawnError) { showToast(spawnError.message, true); return; }
      showToast('Tournament created from template.');
      loadTournamentsAdminList();
    });
  });
  container.querySelectorAll('[data-delete-template]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this template? Tournaments already created from it are unaffected.')) return;
      const { error: delError } = await sb.from('tournament_templates').delete().eq('id', btn.dataset.deleteTemplate);
      if (delError) { showToast(delError.message, true); return; }
      loadTournamentTemplates();
    });
  });
}

async function populateTournamentPrizeSelect() {
  const { data: items } = await sb.from('bf_items').select('id, name, category').in('category', ['fruit', 'limited', 'gamepass']).order('name');
  const select = document.getElementById('tn-prize-item');
  select.innerHTML = '<option value="">— No prize —</option>' + (items || []).map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
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
    elimination_type: document.getElementById('tn-elimination-type').value,
    team_based: document.getElementById('tn-team-based').checked,
    starts_at: document.getElementById('tn-starts-at').value ? new Date(document.getElementById('tn-starts-at').value).toISOString() : null,
    prize_item_id: document.getElementById('tn-prize-item').value || null,
    prize_is_permanent: document.getElementById('tn-prize-permanent').checked,
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
    .select('id, name, description, match_type, bracket_size, status, starts_at, winner:profiles!tournaments_winner_id_fkey(username, display_name)')
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
          <p class="muted" style="margin:4px 0 0; font-size:0.78rem;">${escapeHtml(t.match_type)} · ${count}/${t.bracket_size} registered ${t.winner ? `· Champion: ${escapeHtml(displayNameFor(t.winner))}` : ''} ${t.status === 'registration_open' && t.starts_at ? `· Auto-starts ${new Date(t.starts_at).toLocaleString()}` : ''}</p>
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

  const { data: t } = await sb.from('tournaments').select('status, team_based, elimination_type').eq('id', id).single();

  if (t.status === 'registration_open') {
    const { data: participants } = await sb.from('tournament_participants')
      .select('user_id, joined_at, profiles(username, display_name, avatar_url, avatar_frame), crews(name, logo_url)')
      .eq('tournament_id', id).order('joined_at');
    el.innerHTML = `
      <p class="muted" style="margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">Registered ${t.team_based ? 'Crews' : 'Players'}</p>
      ${(participants || []).length ? (participants || []).map(p => `
        <div style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:0.85rem;">
          ${t.team_based
            ? `<span style="width:22px; height:22px; border-radius:6px; background:var(--navy-light); display:inline-flex; align-items:center; justify-content:center; font-size:0.7rem;">${escapeHtml((p.crews?.name?.[0] || '?').toUpperCase())}</span><span>${escapeHtml(p.crews?.name || 'Unknown Crew')}</span>`
            : `${avatarHtml(p.profiles || {}, 22)}<span>${escapeHtml(displayNameFor(p.profiles || {}))}</span>`}
        </div>
      `).join('') : `<p class="muted" style="font-size:0.82rem;">Nobody's registered yet.</p>`}
    `;
    refreshIcons();
    return;
  }

  const { data: matches } = await sb.from('tournament_matches')
    .select(`id, round, match_number, bracket, player1_id, player2_id, winner_id, status, claimed_winner_id, claimed_by,
      player1:profiles!tournament_matches_player1_id_fkey(username, display_name, avatar_url, avatar_frame),
      player2:profiles!tournament_matches_player2_id_fkey(username, display_name, avatar_url, avatar_frame),
      team1:crews!tournament_matches_team1_id_fkey(name, logo_url),
      team2:crews!tournament_matches_team2_id_fkey(name, logo_url)`)
    .eq('tournament_id', id).order('round').order('match_number');

  const { data: participants } = await sb.from('tournament_participants').select('user_id, seed').eq('tournament_id', id);
  const seedByUser = new Map((participants || []).map(p => [p.user_id, p.seed]));

  el.innerHTML = renderAdminBracket(matches || [], t.team_based, seedByUser);
  refreshIcons();

  el.querySelectorAll('[data-report-winner]').forEach(btn => {
    btn.addEventListener('click', () => reportTournamentMatchWinner(btn.dataset.reportWinner, btn.dataset.winnerId));
  });
  el.querySelectorAll('[data-override-winner]').forEach(btn => {
    btn.addEventListener('click', () => overrideTournamentMatchWinner(btn.dataset.overrideWinner, btn.dataset.winnerId));
  });
}

function renderAdminBracket(matches, teamBased, seedByUser) {
  const winners = matches.filter(m => m.bracket === 'winners');
  const losers = matches.filter(m => m.bracket === 'losers');
  const grandFinal = matches.filter(m => m.bracket === 'grand_final');

  const section = (label, list) => {
    if (!list.length) return '';
    const rounds = new Map();
    list.forEach(m => { if (!rounds.has(m.round)) rounds.set(m.round, []); rounds.get(m.round).push(m); });
    const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
    return `
      <div style="margin-bottom:16px;">
        <p class="muted" style="margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">${label}</p>
        <div style="display:flex; gap:20px; overflow-x:auto; padding-bottom:8px;">
          ${roundNumbers.map(r => `
            <div style="min-width:230px; display:flex; flex-direction:column; gap:10px;">
              ${rounds.get(r).sort((a, b) => a.match_number - b.match_number).map(m => renderAdminBracketMatch(m, teamBased, seedByUser)).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  return section('Winners Bracket', winners) + section('Losers Bracket', losers) + section('Grand Final', grandFinal);
}

function renderAdminBracketMatch(m, teamBased, seedByUser) {
  const canReport = m.status === 'pending' && m.player1_id && m.player2_id;
  // Overriding a bye doesn't make sense (there was no real opponent to have lost to),
  // only a genuinely played, confirmed match.
  const canOverride = m.status === 'confirmed' && m.player1_id && m.player2_id;
  const playerRow = (profile, team, playerId) => {
    if (!profile && !playerId) return `<div class="bracket-slot bracket-slot-empty">TBD</div>`;
    const isWinner = m.winner_id === playerId;
    const isClaimed = m.claimed_winner_id === playerId;
    const label = teamBased ? (team?.name || 'Unknown Crew') : (profile ? displayNameFor(profile) : 'Bye');
    const seed = !teamBased && seedByUser?.get(playerId);
    return `
      <div class="bracket-slot ${isWinner ? 'bracket-slot-winner' : ''}" style="justify-content:space-between;">
        <span style="display:flex; align-items:center; gap:8px;">${!teamBased && profile ? avatarHtml(profile, 20) : ''}${seed ? `<span class="muted" style="font-size:0.68rem;">#${seed}</span>` : ''}${escapeHtml(label)}${isClaimed ? ' <span class="tag tag-medium" style="font-size:0.65rem;" title="Claimed by a player — not yet confirmed">Claimed</span>' : ''}</span>
        ${canReport ? `<button class="btn ${isClaimed ? 'btn-primary' : 'btn-ghost'} btn-sm" style="padding:3px 8px; font-size:0.7rem;" data-report-winner="${m.id}" data-winner-id="${playerId}">${isClaimed ? 'Confirm' : 'Won'}</button>` : ''}
        ${canOverride && !isWinner ? `<button class="btn btn-ghost btn-sm" style="padding:3px 8px; font-size:0.68rem; color:var(--blood-dim);" data-override-winner="${m.id}" data-winner-id="${playerId}" title="Correct this result — only works if nobody downstream has played yet">Override → Won</button>` : ''}
      </div>
    `;
  };
  return `<div class="panel" style="padding:6px 8px;">${playerRow(m.player1, m.team1, m.player1_id)}${playerRow(m.player2, m.team2, m.player2_id)}</div>`;
}

async function reportTournamentMatchWinner(matchId, winnerId) {
  if (!window.confirm('Confirm this result? The winner advances immediately.')) return;
  const { error } = await sb.rpc('report_tournament_match', { p_match_id: matchId, p_winner_id: winnerId });
  if (error) { showToast(error.message, true); return; }
  showToast('Result recorded.');
  loadTournamentsAdminList();
}

async function overrideTournamentMatchWinner(matchId, winnerId) {
  const note = window.prompt('Why is this being corrected? (shown internally, not to players)') || null;
  if (!window.confirm('Override this result? This can only be undone by another override, and only while nothing downstream has been played.')) return;
  const { error } = await sb.rpc('override_tournament_match_result', { p_match_id: matchId, p_new_winner_id: winnerId, p_note: note });
  if (error) { showToast(error.message, true); return; }
  showToast('Result corrected.');
  loadTournamentsAdminList();
}
