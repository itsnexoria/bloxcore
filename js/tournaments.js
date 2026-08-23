// BloxCore — pvp/index.html "Tournaments" sub-tab logic. Shares `currentUser` and `sb`
// with pvp.js, which loads first on the same page.

let myTournamentRegistrations = new Set();
let tournamentsLoaded = false;

async function loadTournamentsList() {
  const listEl = document.getElementById('tournaments-list');

  if (currentUser && !tournamentsLoaded) {
    const { data: mine } = await sb.from('tournament_participants').select('tournament_id').eq('user_id', currentUser.id);
    myTournamentRegistrations = new Set((mine || []).map(r => r.tournament_id));
  }
  tournamentsLoaded = true;

  const { data: tournaments, error } = await sb.from('tournaments')
    .select('id, name, description, match_type, bracket_size, status, starts_at, winner:profiles!tournaments_winner_id_fkey(username, display_name)')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { listEl.innerHTML = `<p class="muted">Couldn't load tournaments right now.</p>`; return; }
  if (!tournaments.length) { listEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No tournaments yet — check back soon.</div>`; return; }

  const tournamentIds = tournaments.map(t => t.id);
  const { data: counts } = await sb.from('tournament_participants').select('tournament_id').in('tournament_id', tournamentIds);
  const countByTournament = new Map();
  (counts || []).forEach(c => countByTournament.set(c.tournament_id, (countByTournament.get(c.tournament_id) || 0) + 1));

  listEl.innerHTML = tournaments.map(t => renderTournamentCard(t, countByTournament.get(t.id) || 0)).join('');
  refreshIcons();

  listEl.querySelectorAll('[data-view-tournament]').forEach(btn => btn.addEventListener('click', () => openTournamentDetail(btn.dataset.viewTournament)));
  listEl.querySelectorAll('[data-register-tournament]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); registerForTournament(btn.dataset.registerTournament); }));
  listEl.querySelectorAll('[data-unregister-tournament]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); unregisterFromTournament(btn.dataset.unregisterTournament); }));
}

const TOURNAMENT_STATUS_LABEL = { registration_open: 'Registration Open', in_progress: 'In Progress', completed: 'Completed' };
const TOURNAMENT_STATUS_COLOR = { registration_open: 'tag-medium', in_progress: '', completed: 'tag-legendary' };

function renderTournamentCard(t, count) {
  const registered = myTournamentRegistrations.has(t.id);
  const full = count >= t.bracket_size;

  let actionHtml;
  if (t.status === 'completed') {
    actionHtml = t.winner ? `<p style="margin:0; font-size:0.85rem;"><i data-lucide="crown" class="icon-sm icon-inline" style="color:var(--brass-bright);"></i>${escapeHtml(displayNameFor(t.winner))}</p>` : '';
  } else if (t.status === 'in_progress') {
    actionHtml = `<p class="muted" style="margin:0; font-size:0.82rem;">Bracket is live — tap to watch</p>`;
  } else if (!currentUser) {
    actionHtml = `<a href="/auth/" class="btn btn-primary btn-sm" onclick="event.stopPropagation();">Sign in to Register</a>`;
  } else if (registered) {
    actionHtml = `<button class="btn btn-ghost btn-sm" data-unregister-tournament="${t.id}">Unregister</button>`;
  } else if (full) {
    actionHtml = `<button class="btn btn-ghost btn-sm" disabled>Bracket Full</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-sm" data-register-tournament="${t.id}">Register</button>`;
  }

  return `
    <div class="panel" data-view-tournament="${t.id}" style="cursor:pointer;">
      <div class="flex-between" style="align-items:flex-start;">
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(t.name)}</p>
          <p class="muted" style="margin:4px 0 0; font-size:0.8rem;">${escapeHtml(t.match_type)} · ${count}/${t.bracket_size} players</p>
        </div>
        <span class="tag ${TOURNAMENT_STATUS_COLOR[t.status]}">${TOURNAMENT_STATUS_LABEL[t.status]}</span>
      </div>
      ${t.description ? `<p class="muted" style="margin:10px 0; font-size:0.82rem;">${escapeHtml(t.description)}</p>` : ''}
      <div style="margin-top:12px;">${actionHtml}</div>
    </div>
  `;
}

async function registerForTournament(id) {
  const { error } = await sb.from('tournament_participants').insert({ tournament_id: id, user_id: currentUser.id });
  if (error) { showToast(error.message, true); return; }
  myTournamentRegistrations.add(id);
  showToast('Registered — good luck!');
  loadTournamentsList();
}

async function unregisterFromTournament(id) {
  const { error } = await sb.from('tournament_participants').delete().eq('tournament_id', id).eq('user_id', currentUser.id);
  if (error) { showToast(error.message, true); return; }
  myTournamentRegistrations.delete(id);
  showToast('Unregistered.');
  loadTournamentsList();
}

// ---------------------------------------------------------------------------
// Detail view — bracket display
// ---------------------------------------------------------------------------

async function openTournamentDetail(id) {
  document.getElementById('tournaments-list-view').style.display = 'none';
  document.getElementById('tournament-detail-view').style.display = 'block';
  document.getElementById('tournament-back-btn').onclick = () => {
    document.getElementById('tournament-detail-view').style.display = 'none';
    document.getElementById('tournaments-list-view').style.display = 'block';
  };

  const header = document.getElementById('tournament-detail-header');
  const bracketEl = document.getElementById('tournament-bracket');
  header.innerHTML = `<div class="skeleton" style="height:60px;"></div>`;
  bracketEl.innerHTML = '';

  const { data: t, error } = await sb.from('tournaments')
    .select('id, name, description, match_type, bracket_size, status, winner:profiles!tournaments_winner_id_fkey(username, display_name)')
    .eq('id', id).single();
  if (error) { header.innerHTML = `<p class="muted">Couldn't load this tournament.</p>`; return; }

  header.innerHTML = `
    <div class="flex-between" style="align-items:flex-start; flex-wrap:wrap; gap:10px;">
      <div>
        <p style="margin:0; font-weight:700; font-size:1.15rem;">${escapeHtml(t.name)}</p>
        <p class="muted" style="margin:4px 0 0; font-size:0.82rem;">${escapeHtml(t.match_type)} · ${t.bracket_size}-player bracket</p>
      </div>
      <span class="tag ${TOURNAMENT_STATUS_COLOR[t.status]}">${TOURNAMENT_STATUS_LABEL[t.status]}</span>
    </div>
    ${t.description ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem;">${escapeHtml(t.description)}</p>` : ''}
    ${t.status === 'completed' && t.winner ? `<p style="margin:12px 0 0; font-size:0.95rem;"><i data-lucide="crown" class="icon-sm icon-inline" style="color:var(--brass-bright);"></i>Champion: <strong>${escapeHtml(displayNameFor(t.winner))}</strong></p>` : ''}
  `;

  if (t.status === 'registration_open') {
    bracketEl.innerHTML = `<p class="muted" style="padding:20px 0;">The bracket will appear here once registration closes and the tournament starts.</p>`;
    refreshIcons();
    return;
  }

  const { data: matches } = await sb.from('tournament_matches')
    .select('id, round, match_number, player1_id, player2_id, winner_id, status, player1:profiles!tournament_matches_player1_id_fkey(username, display_name, avatar_url), player2:profiles!tournament_matches_player2_id_fkey(username, display_name, avatar_url)')
    .eq('tournament_id', id)
    .order('round').order('match_number');

  bracketEl.innerHTML = renderBracket(matches || []);
  refreshIcons();
}

function renderBracket(matches) {
  const rounds = new Map();
  matches.forEach(m => {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round).push(m);
  });
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
  const totalRounds = roundNumbers.length;
  const roundLabel = (r) => totalRounds - r === 0 ? 'Final' : totalRounds - r === 1 ? 'Semifinals' : `Round ${r}`;

  return `
    <div style="display:flex; gap:32px; min-width:max-content;">
      ${roundNumbers.map(r => `
        <div style="display:flex; flex-direction:column; justify-content:space-around; gap:16px; min-width:220px;">
          <p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; text-align:center;">${roundLabel(r)}</p>
          ${rounds.get(r).sort((a, b) => a.match_number - b.match_number).map(m => renderBracketMatch(m)).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderBracketMatch(m) {
  const slot = (profile, playerId) => {
    if (!profile && !playerId) return `<div class="bracket-slot bracket-slot-empty">TBD</div>`;
    const isWinner = m.winner_id && playerId === m.winner_id;
    const name = profile ? displayNameFor(profile) : 'Bye';
    return `<div class="bracket-slot ${isWinner ? 'bracket-slot-winner' : ''}">${profile ? avatarHtml(profile, 20) : ''}<span>${escapeHtml(name)}</span></div>`;
  };

  return `
    <div class="panel" style="padding:8px 10px;">
      ${slot(m.player1, m.player1_id)}
      ${slot(m.player2, m.player2_id)}
    </div>
  `;
}
