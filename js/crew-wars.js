// BloxCore — Crew Wars hub, now a tab inside /crews/ (was its own /crew-wars/
// page; that URL now redirects here). Read-only here; calling/responding to
// a war still happens from your own crew page. initCrewWarsHub() is called
// lazily by crews.js the first time the Crew Wars tab is opened, so a plain
// visit to /crews/ never fires the wars queries for nothing.

let warTab = 'active';
let _warsHubInited = false;

function initCrewWarsHub() {
  if (_warsHubInited) return;
  _warsHubInited = true;
  document.querySelectorAll('#war-tabs [data-war-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchWarTab(btn.dataset.warTab));
  });
  loadActiveWars();
}

function switchWarTab(tab) {
  if (tab === warTab) return;
  warTab = tab;
  document.querySelectorAll('#war-tabs [data-war-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.warTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('war-tab-active').style.display = tab === 'active' ? '' : 'none';
  document.getElementById('war-tab-history').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('war-tab-leaderboard').style.display = tab === 'leaderboard' ? '' : 'none';

  if (tab === 'active' && !_activeLoaded) loadActiveWars();
  if (tab === 'history' && !_historyLoaded) loadWarHistory();
  if (tab === 'leaderboard' && !_leaderboardLoaded) loadWarLeaderboard();
}

let _activeLoaded = false, _historyLoaded = false, _leaderboardLoaded = false;

async function loadActiveWars() {
  _activeLoaded = true;
  const list = document.getElementById('war-active-list');
  const { data, error } = await sb
    .from('crew_wars')
    .select('*, challenger:challenger_crew_id(name, tag, logo_url), defender:defender_crew_id(name, tag, logo_url)')
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) { list.innerHTML = `<p class="muted">Couldn't load wars right now.</p>`; console.error(error); return; }
  if (!data.length) { list.innerHTML = `<div class="empty-state">No pending or active wars right now.</div>`; return; }

  list.innerHTML = data.map(renderHubWarCard).join('');
  refreshIcons();
}

async function loadWarHistory() {
  _historyLoaded = true;
  const list = document.getElementById('war-history-list');
  list.innerHTML = `<div class="skeleton" style="height:90px;"></div><div class="skeleton" style="height:90px;"></div>`;

  const { data, error } = await sb
    .from('crew_wars')
    .select('*, challenger:challenger_crew_id(name, tag, logo_url), defender:defender_crew_id(name, tag, logo_url)')
    .in('status', ['completed', 'declined', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { list.innerHTML = `<p class="muted">Couldn't load war history right now.</p>`; console.error(error); return; }
  if (!data.length) { list.innerHTML = `<div class="empty-state">No settled wars yet.</div>`; return; }

  list.innerHTML = data.map(renderHubWarCard).join('');
  refreshIcons();
}

async function loadWarLeaderboard() {
  _leaderboardLoaded = true;
  const el = document.getElementById('war-leaderboard-list');
  el.innerHTML = `<div class="skeleton" style="height:60px; margin:16px;"></div>`;

  const { data, error } = await sb.rpc('get_crew_war_leaderboard');
  if (error) { el.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the leaderboard right now.</p>`; console.error(error); return; }
  if (!data.length) { el.innerHTML = `<div class="empty-state">No completed wars yet — the first crews to finish one will show up here.</div>`; return; }

  el.innerHTML = data.map((c, i) => `
    <div class="flex-between" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
      <div style="display:flex; align-items:center; gap:16px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${i + 1}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:36px; height:36px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:36px; height:36px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.85rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">
          ${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}
        </a>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${c.wins}W – ${c.losses}L${c.ties ? ` – ${c.ties}T` : ''}</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${c.total_wars} war${c.total_wars == 1 ? '' : 's'} fought</p>
      </div>
    </div>
  `).join('');
}

function renderHubWarCard(w) {
  const statusMeta = {
    pending: { tag: `<span class="tag tag-medium">Pending</span>`, accent: 'var(--gold)', glow: 'var(--gold-rgb)' },
    accepted: { tag: `<span class="tag tag-easy">Active</span>`, accent: 'var(--sea)', glow: 'var(--brass-rgb)' },
    declined: { tag: `<span class="muted" style="font-size:0.78rem;">Declined</span>`, accent: 'var(--ash)', glow: '120 120 130' },
    cancelled: { tag: `<span class="muted" style="font-size:0.78rem;">Cancelled</span>`, accent: 'var(--ash)', glow: '120 120 130' },
    completed: { tag: `<span class="tag tag-legendary">Completed</span>`, accent: 'var(--purple)', glow: 'var(--purple-rgb)' },
  }[w.status] || { tag: '', accent: 'var(--ash)', glow: '120 120 130' };

  const winnerName = w.status === 'completed' && w.winner_crew_id
    ? (w.winner_crew_id === w.challenger_crew_id ? w.challenger?.name : w.defender?.name)
    : (w.status === 'completed' ? 'Tie' : null);

  return `
    <div class="panel war-card" data-war-id="${w.id}" style="border-left:3px solid ${statusMeta.accent}; background:linear-gradient(120deg, rgb(${statusMeta.glow} / 0.05), transparent 55%);">
      <div class="flex-between" style="align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div class="war-card-matchup">
          ${crewChip(w.challenger)}
          <span class="war-vs">VS</span>
          ${crewChip(w.defender)}
        </div>
        ${statusMeta.tag}
      </div>
      ${w.message ? `<p class="muted war-card-message">"${escapeHtml(w.message)}"</p>` : ''}
      <div class="flex-between war-card-footer">
        <span class="muted" style="font-size:0.75rem; display:flex; align-items:center; gap:5px;"><i data-lucide="clock" class="icon-sm"></i>${timeAgo(w.created_at)}</span>
        ${winnerName ? `<span class="war-card-winner" style="color:${winnerName === 'Tie' ? 'var(--ash)' : 'var(--gold-bright)'};"><i data-lucide="${winnerName === 'Tie' ? 'minus' : 'trophy'}" class="icon-sm icon-inline"></i>${escapeHtml(winnerName)}${winnerName !== 'Tie' ? ' won' : ''}</span>` : ''}
      </div>
    </div>
  `;
}

function crewChip(c) {
  if (!c) return `<span class="muted" style="font-size:0.85rem;">Unknown Crew</span>`;
  return `
    <a href="/crew/?name=${encodeURIComponent(c.name)}" class="war-chip">
      ${c.logo_url
        ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:34px; height:34px; border-radius:8px; object-fit:cover; box-shadow:0 0 0 1px var(--glass-border);" onerror="this.style.visibility='hidden';">`
        : `<span style="width:34px; height:34px; border-radius:8px; background:var(--navy-light); display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem; color:var(--ash); box-shadow:0 0 0 1px var(--glass-border);">${escapeHtml((c.name[0] || '?').toUpperCase())}</span>`}
      <span style="font-weight:700; font-size:0.92rem;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</span>
    </a>
  `;
}
