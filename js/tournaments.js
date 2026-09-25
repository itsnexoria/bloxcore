// BloxCore — pvp/index.html "Tournaments" sub-tab logic. Shares `currentUser` and `sb`
// with pvp.js, which loads first on the same page.

let myTournamentRegistrations = new Set();
let myCheckedInIds = new Set();
let myLedCrews = [];
let tournamentsLoaded = false;

async function loadTournamentsList() {
  const listEl = document.getElementById('tournaments-list');

  if (currentUser && !tournamentsLoaded) {
    const { data: mine } = await sb.from('tournament_participants').select('tournament_id, checked_in').eq('user_id', currentUser.id);
    myTournamentRegistrations = new Set((mine || []).map(r => r.tournament_id));
    myCheckedInIds = new Set((mine || []).filter(r => r.checked_in).map(r => r.tournament_id));
    const { data: led } = await sb.from('crews').select('id, name').eq('leader_id', currentUser.id);
    myLedCrews = led || [];
  }
  tournamentsLoaded = true;

  const { data: tournaments, error } = await sb.from('tournaments')
    .select('id, name, description, match_type, bracket_size, status, elimination_type, team_based, starts_at, checkin_window_minutes, winner:profiles!tournaments_winner_id_fkey(username, display_name)')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { listEl.innerHTML = errorStateHtml("Couldn't load tournaments right now.", 'loadTournamentsList()'); refreshIcons(); return; }
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
  listEl.querySelectorAll('[data-checkin-tournament]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); checkInForTournament(btn.dataset.checkinTournament); }));

  renderHallOfFame(tournaments.filter(t => t.status === 'completed' && t.winner));
  ensureTournamentListRefresh();
}

let _tournamentListRefreshStarted = false;
function ensureTournamentListRefresh() {
  if (_tournamentListRefreshStarted) return;
  _tournamentListRefreshStarted = true;
  // Check-in windows open/close based on wall-clock time — refresh periodically so
  // the button state (too early / open / closed) stays accurate without a reload.
  setInterval(() => {
    if (document.getElementById('tournaments-list-view').style.display !== 'none') {
      loadTournamentsList();
    }
  }, 60000);
}

function renderHallOfFame(champions) {
  const el = document.getElementById('tournament-hall-of-fame');
  if (!champions.length) { el.style.display = 'none'; return; }

  el.style.display = 'block';
  el.innerHTML = `
    <p class="muted" style="margin:0 0 10px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="trophy" class="icon-sm icon-inline"></i>Hall of Fame</p>
    <div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:6px;">
      ${champions.slice(0, 8).map(t => `
        <div class="panel" style="min-width:160px; text-align:center; padding:14px 12px; flex-shrink:0;">
          <i data-lucide="crown" class="icon-md" style="color:var(--brass-bright);"></i>
          <p style="margin:6px 0 0; font-weight:700; font-size:0.85rem;">${escapeHtml(displayNameFor(t.winner))}</p>
          <p class="muted" style="margin:2px 0 0; font-size:0.72rem;">${escapeHtml(t.name)}</p>
        </div>
      `).join('')}
    </div>
  `;
  refreshIcons();
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
    actionHtml = renderCheckInAction(t);
  } else if (full) {
    actionHtml = `<button class="btn btn-ghost btn-sm" disabled>Bracket Full</button>`;
  } else if (t.team_based && !myLedCrews.length) {
    actionHtml = `<button class="btn btn-ghost btn-sm" disabled title="You need to lead a crew to register">Team Tournament</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-sm" data-register-tournament="${t.id}">Register${t.team_based ? ' Crew' : ''}</button>`;
  }

  return `
    <div class="panel hover-lift-card" data-view-tournament="${t.id}" style="cursor:pointer;">
      <div class="flex-between" style="align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="/assets/game/pvp/tournament.png" alt="" style="width:44px; height:44px; object-fit:contain; flex-shrink:0;">
          <div>
            <p style="margin:0; font-weight:700;">${escapeHtml(t.name)}</p>
            <p class="muted" style="margin:4px 0 0; font-size:0.8rem;">${escapeHtml(t.match_type)} · ${initCapWord(t.elimination_type)} Elim · ${t.team_based ? 'Crews' : 'Players'} · ${count}/${t.bracket_size}</p>
          </div>
        </div>
        <span class="tag ${TOURNAMENT_STATUS_COLOR[t.status]}">${TOURNAMENT_STATUS_LABEL[t.status]}</span>
      </div>
      ${t.description ? `<p class="muted" style="margin:10px 0; font-size:0.82rem;">${escapeHtml(t.description)}</p>` : ''}
      <div style="margin-top:12px;">${actionHtml}</div>
    </div>
  `;
}

function initCapWord(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function renderCheckInAction(t) {
  if (!t.starts_at) {
    // No scheduled start — no check-in concept, staff starts it whenever.
    return `<button class="btn btn-ghost btn-sm" data-unregister-tournament="${t.id}">Unregister</button>`;
  }
  if (myCheckedInIds.has(t.id)) {
    return `<p style="margin:0; font-size:0.82rem; color:#34d399;"><i data-lucide="check-circle" class="icon-sm icon-inline"></i>Checked in</p>`;
  }

  const windowMinutes = t.checkin_window_minutes ?? 15;
  const opensAt = new Date(t.starts_at).getTime() - windowMinutes * 60000;
  const now = Date.now();

  if (now < opensAt) {
    return `<p class="muted" style="margin:0; font-size:0.78rem;">Check-in opens ${new Date(opensAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>`;
  }
  if (now >= new Date(t.starts_at).getTime()) {
    return `<p class="muted" style="margin:0; font-size:0.78rem;">Check-in closed</p>`;
  }
  return `<div style="display:flex; align-items:center; gap:8px;"><button class="btn btn-primary btn-sm" data-checkin-tournament="${t.id}" onclick="event.stopPropagation();">Check In Now</button><button class="btn btn-ghost btn-sm" data-unregister-tournament="${t.id}" onclick="event.stopPropagation();" style="font-size:0.72rem; padding:6px 8px;">Can't make it</button></div>`;
}

async function checkInForTournament(id) {
  const { error } = await sb.rpc('check_in_for_tournament', { p_tournament_id: id });
  if (error) { showToast(error.message, true); return; }
  myCheckedInIds.add(id);
  showToast('Checked in — see you in the bracket!');
  loadTournamentsList();
}

async function registerForTournament(id) {
  const t = (await sb.from('tournaments').select('team_based').eq('id', id).single()).data;
  const payload = { tournament_id: id, user_id: currentUser.id };

  if (t?.team_based) {
    if (!myLedCrews.length) { showToast('You need to lead a crew to register for a team tournament.', true); return; }
    payload.crew_id = myLedCrews.length === 1 ? myLedCrews[0].id : myLedCrews.find(c => window.confirm(`Register ${c.name}? Cancel to check the next crew.`))?.id;
    if (!payload.crew_id) return;
  }

  const { error } = await sb.from('tournament_participants').insert(payload);
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
    if (tournamentChatChannel) { sb.removeChannel(tournamentChatChannel); tournamentChatChannel = null; }
  };

  const header = document.getElementById('tournament-detail-header');
  const bracketEl = document.getElementById('tournament-bracket');
  header.innerHTML = `<div class="skeleton" style="height:60px;"></div>`;
  bracketEl.innerHTML = '';
  document.getElementById('tournament-chat-panel').style.display = 'none';

  const { data: t, error } = await sb.from('tournaments')
    .select('id, name, description, match_type, bracket_size, status, elimination_type, team_based, winner:profiles!tournaments_winner_id_fkey(username, display_name)')
    .eq('id', id).single();
  if (error) { header.innerHTML = errorStateHtml("Couldn't load this tournament.", `openTournamentDetail('${id}')`); refreshIcons(); return; }

  header.innerHTML = `
    <div class="flex-between" style="align-items:flex-start; flex-wrap:wrap; gap:10px;">
      <div>
        <p style="margin:0; font-weight:700; font-size:1.15rem;">${escapeHtml(t.name)}</p>
        <p class="muted" style="margin:4px 0 0; font-size:0.82rem;">${escapeHtml(t.match_type)} · ${t.bracket_size}-${t.team_based ? 'crew' : 'player'} bracket · ${initCapWord(t.elimination_type)} Elimination</p>
      </div>
      <span class="tag ${TOURNAMENT_STATUS_COLOR[t.status]}">${TOURNAMENT_STATUS_LABEL[t.status]}</span>
    </div>
    ${t.description ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem;">${escapeHtml(t.description)}</p>` : ''}
    ${t.status === 'completed' && t.winner ? `<p style="margin:12px 0 0; font-size:0.95rem;"><i data-lucide="crown" class="icon-sm icon-inline" style="color:var(--brass-bright);"></i>Champion: <strong>${escapeHtml(displayNameFor(t.winner))}</strong></p>` : ''}
  `;

  if (t.status === 'registration_open') {
    if (t.team_based && myTournamentRegistrations.has(id)) {
      bracketEl.innerHTML = `<div class="panel" id="tournament-roster-panel"><div class="skeleton" style="height:60px;"></div></div>`;
      loadRosterPicker(id);
    } else {
      bracketEl.innerHTML = `<p class="muted" style="padding:20px 0;">The bracket will appear here once registration closes and the tournament starts.</p>`;
    }
    refreshIcons();
    return;
  }

  if (t.status === 'in_progress' && currentUser) {
    document.getElementById('tournament-prediction-panel').style.display = 'block';
    loadPredictionPicker(id);
  } else {
    document.getElementById('tournament-prediction-panel').style.display = 'none';
  }

  const { data: matches } = await sb.from('tournament_matches')
    .select(`id, round, match_number, bracket, player1_id, player2_id, winner_id, status, claimed_winner_id,
      player1:profiles!tournament_matches_player1_id_fkey(username, display_name, avatar_url, avatar_frame),
      player2:profiles!tournament_matches_player2_id_fkey(username, display_name, avatar_url, avatar_frame),
      team1:crews!tournament_matches_team1_id_fkey(name, logo_url),
      team2:crews!tournament_matches_team2_id_fkey(name, logo_url)`)
    .eq('tournament_id', id)
    .order('round').order('match_number');

  const { data: participants } = await sb.from('tournament_participants').select('user_id, seed').eq('tournament_id', id);
  const seedByUser = new Map((participants || []).map(p => [p.user_id, p.seed]));

  bracketEl.innerHTML = renderBracketSections(matches || [], t.team_based, seedByUser);
  refreshIcons();

  bracketEl.querySelectorAll('[data-claim-match]').forEach(btn => {
    btn.addEventListener('click', () => claimMatchWinner(btn.dataset.claimMatch, btn.dataset.claimWinner));
  });

  if (currentUser && myTournamentRegistrations.has(id)) {
    initTournamentChat(id);
  }
}

async function loadRosterPicker(tournamentId) {
  const panel = document.getElementById('tournament-roster-panel');
  const { data: reg } = await sb.from('tournament_participants').select('id, crew_id, roster_user_ids').eq('tournament_id', tournamentId).eq('user_id', currentUser.id).maybeSingle();
  if (!reg) { panel.innerHTML = ''; return; }

  const { data: members } = await sb.from('crew_members').select('user_id, profiles(username, display_name, avatar_url, avatar_frame)').eq('crew_id', reg.crew_id);
  const currentRoster = new Set(reg.roster_user_ids || []);

  panel.innerHTML = `
    <p style="margin:0 0 4px; font-weight:700; font-size:0.9rem;">Set Your Roster</p>
    <p class="muted" style="margin:0 0 10px; font-size:0.78rem;">Pick who's actually playing for your crew this tournament (optional — leave blank and it'll just show the crew name).</p>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${(members || []).map(m => `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem;">
          <input type="checkbox" data-roster-member="${m.user_id}" ${currentRoster.has(m.user_id) ? 'checked' : ''} style="width:auto;">
          ${avatarHtml(m.profiles || {}, 20)}${escapeHtml(displayNameFor(m.profiles || {}))}
        </label>
      `).join('')}
    </div>
    <button class="btn btn-primary btn-sm" id="save-roster-btn" style="margin-top:12px;">Save Roster</button>
  `;

  document.getElementById('save-roster-btn').addEventListener('click', async () => {
    const picked = [...panel.querySelectorAll('[data-roster-member]:checked')].map(el => el.dataset.rosterMember);
    const { error } = await sb.rpc('set_tournament_roster', { p_tournament_id: tournamentId, p_roster_user_ids: picked });
    if (error) { showToast(error.message, true); return; }
    showToast('Roster saved.');
  });
}

async function claimMatchWinner(matchId, winnerId) {
  if (!window.confirm('Report this result? Staff will confirm it before it counts.')) return;
  const { error } = await sb.rpc('claim_tournament_match_winner', { p_match_id: matchId, p_winner_id: winnerId });
  if (error) { showToast(error.message, true); return; }
  showToast('Reported — staff will confirm it shortly.');
}

function renderBracketSections(matches, teamBased, seedByUser) {
  const winners = matches.filter(m => m.bracket === 'winners');
  const losers = matches.filter(m => m.bracket === 'losers');
  const grandFinal = matches.filter(m => m.bracket === 'grand_final');

  const section = (label, list) => {
    if (!list.length) return '';
    const rounds = new Map();
    list.forEach(m => { if (!rounds.has(m.round)) rounds.set(m.round, []); rounds.get(m.round).push(m); });
    const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
    return `
      <div style="margin-bottom:24px;">
        <p class="muted" style="margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">${label}</p>
        <div style="display:flex; gap:32px; min-width:max-content;">
          ${roundNumbers.map(r => `
            <div style="display:flex; flex-direction:column; justify-content:space-around; gap:16px; min-width:220px;">
              ${rounds.get(r).sort((a, b) => a.match_number - b.match_number).map(m => renderBracketMatch(m, teamBased, seedByUser)).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  return `<div style="overflow-x:auto;">${section('Winners Bracket', winners)}${section('Losers Bracket', losers)}${section('Grand Final', grandFinal)}</div>`;
}

function renderBracketMatch(m, teamBased, seedByUser) {
  // A "claim" button only makes sense for the two people who actually played this
  // match — not spectators — and only while it's genuinely still open.
  const canClaim = m.status === 'pending' && m.player1_id && m.player2_id
    && currentUser && (currentUser.id === m.player1_id || currentUser.id === m.player2_id);

  const slot = (profile, team, playerId) => {
    if (!profile && !playerId) return `<div class="bracket-slot bracket-slot-empty">TBD</div>`;
    const isWinner = m.winner_id && playerId === m.winner_id;
    const isClaimed = m.claimed_winner_id === playerId;
    const label = teamBased ? (team?.name || 'Unknown Crew') : (profile ? displayNameFor(profile) : 'Bye');
    const seed = !teamBased && seedByUser?.get(playerId);
    return `
      <div class="bracket-slot ${isWinner ? 'bracket-slot-winner' : ''}" style="justify-content:space-between;">
        <span style="display:flex; align-items:center; gap:6px;">${!teamBased && profile ? avatarHtml(profile, 20) : ''}${seed ? `<span class="muted" style="font-size:0.66rem;">#${seed}</span>` : ''}${escapeHtml(label)}${isClaimed ? ' <i data-lucide="clock" class="icon-sm" title="Reported — awaiting staff confirmation" style="color:var(--brass-bright);"></i>' : ''}</span>
        ${canClaim ? `<button class="btn btn-ghost btn-sm" style="padding:2px 6px; font-size:0.66rem;" data-claim-match="${m.id}" data-claim-winner="${playerId}">I won</button>` : ''}
      </div>
    `;
  };

  return `
    <div class="panel" style="padding:8px 10px;">
      ${slot(m.player1, m.team1, m.player1_id)}
      ${slot(m.player2, m.team2, m.player2_id)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tournament chat — a lightweight coordination space, visible only to
// registered participants (+ staff) once you're actually in the bracket.
// ---------------------------------------------------------------------------

let tournamentChatChannel = null;

async function initTournamentChat(tournamentId) {
  const panel = document.getElementById('tournament-chat-panel');
  const list = document.getElementById('tournament-chat-messages');
  panel.style.display = 'block';
  list.innerHTML = `<div class="skeleton" style="height:60px;"></div>`;

  const { data: messages } = await sb.from('tournament_messages')
    .select('id, user_id, message, created_at, profiles(username, display_name, avatar_url, avatar_frame)')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .limit(50);

  list.innerHTML = (messages || []).length
    ? messages.map(renderTournamentChatMessage).join('')
    : `<p class="muted" style="font-size:0.82rem; padding:8px 0;">No messages yet — say hey to your bracket.</p>`;
  list.scrollTop = list.scrollHeight;

  const form = document.getElementById('tournament-chat-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('tournament-chat-input');
    const text = input.value.trim();
    if (!text) return;
    const { error } = await sb.from('tournament_messages').insert({ tournament_id: tournamentId, user_id: currentUser.id, message: text });
    if (error) { showToast(error.message, true); return; }
    input.value = '';
  };

  if (tournamentChatChannel) sb.removeChannel(tournamentChatChannel);
  tournamentChatChannel = sb.channel(`tournament-chat:${tournamentId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tournament_messages', filter: `tournament_id=eq.${tournamentId}` }, async (payload) => {
      const { data: profile } = await sb.from('profiles').select('username, display_name, avatar_url, avatar_frame').eq('id', payload.new.user_id).single();
      if (list.querySelector('.muted')) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', renderTournamentChatMessage({ ...payload.new, profiles: profile }));
      list.scrollTop = list.scrollHeight;
    })
    .subscribe();
}

function renderTournamentChatMessage(m) {
  return `
    <div style="display:flex; gap:8px; padding:6px 0;">
      ${avatarHtml(m.profiles || {}, 24)}
      <div>
        <span style="font-size:0.8rem; font-weight:700;">${escapeHtml(displayNameFor(m.profiles || {}))}</span>
        <span class="muted" style="font-size:0.72rem; margin-left:6px;">${timeAgo(m.created_at)}</span>
        <p style="margin:2px 0 0; font-size:0.85rem;">${escapeHtml(m.message)}</p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bracket predictions — open once the bracket exists, lock the moment round 1's
// first match is decided.
// ---------------------------------------------------------------------------

async function loadPredictionPicker(tournamentId) {
  const panel = document.getElementById('tournament-prediction-panel');
  panel.innerHTML = `<div class="panel"><div class="skeleton" style="height:50px;"></div></div>`;

  const { data: round1 } = await sb.from('tournament_matches').select('status').eq('tournament_id', tournamentId).eq('round', 1);
  const locked = (round1 || []).some(m => m.status !== 'pending');

  const { data: myPick } = await sb.from('tournament_predictions').select('predicted_champion_id').eq('tournament_id', tournamentId).eq('user_id', currentUser.id).maybeSingle();

  if (locked && !myPick) { panel.style.display = 'none'; return; }

  const { data: participants } = await sb.from('tournament_participants')
    .select('user_id, profiles(username, display_name), crews(name)')
    .eq('tournament_id', tournamentId);

  const options = (participants || []).map(p =>
    `<option value="${p.user_id}" ${myPick?.predicted_champion_id === p.user_id ? 'selected' : ''}>${escapeHtml(p.crews?.name || displayNameFor(p.profiles || {}))}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="panel">
      <p style="margin:0 0 8px; font-weight:700; font-size:0.9rem;"><i data-lucide="sparkles" class="icon-sm icon-inline"></i>Predict the Champion</p>
      ${locked
        ? `<p class="muted" style="font-size:0.82rem; margin:0;">Predictions are locked — the bracket's already underway. Your pick: <strong>${escapeHtml(displayNameFor(participants?.find(p => p.user_id === myPick.predicted_champion_id)?.profiles || {}))}</strong></p>`
        : `
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <select id="prediction-select" style="flex:1; min-width:180px;"><option value="">— Pick who wins it all —</option>${options}</select>
            <button class="btn btn-primary btn-sm" id="submit-prediction-btn">${myPick ? 'Update Pick' : 'Lock In'}</button>
          </div>
          <p class="muted" style="margin:8px 0 0; font-size:0.76rem;">Locks the moment the first match is played. Get it right for bonus XP.</p>
        `}
    </div>
  `;
  refreshIcons();

  if (!locked) {
    document.getElementById('submit-prediction-btn').addEventListener('click', async () => {
      const championId = document.getElementById('prediction-select').value;
      if (!championId) { showToast('Pick someone first.', true); return; }
      const { error } = await sb.from('tournament_predictions').upsert(
        { tournament_id: tournamentId, user_id: currentUser.id, predicted_champion_id: championId },
        { onConflict: 'tournament_id,user_id' }
      );
      if (error) { showToast(error.message, true); return; }
      showToast('Prediction locked in — good luck!');
      loadPredictionPicker(tournamentId);
    });
  }
}
