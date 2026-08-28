// BloxCore — admin/wars/index.html logic (mod+ only)

let _warsTabInit = false;

async function initWarsTab() {
  if (_warsTabInit) return;
  _warsTabInit = true;
  try {
    await loadDisputedWars();
  } catch (e) {
    logError('Failed to init Wars tab:', e);
    _warsTabInit = false;
    showToast('Something went wrong loading wars. Try again.', true);
  }
}

async function loadDisputedWars() {
  const list = document.getElementById('disputed-wars-list');

  const { data, error } = await sb
    .from('crew_wars')
    .select('*, challenger:challenger_crew_id(name, tag), defender:defender_crew_id(name, tag)')
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load wars right now.</p>`;
    logError(error);
    return;
  }

  list.innerHTML = data.length
    ? data.map(renderDisputeCard).join('')
    : `<div class="empty-state">No wars waiting on a decision right now.</div>`;

  refreshIcons();
  document.querySelectorAll('[data-resolve-war]').forEach(btn => {
    btn.addEventListener('click', () => resolveWar(btn.dataset.resolveWar, btn.dataset.winnerCrew || null));
  });
}

function renderDisputeCard(w) {
  return `
    <div class="panel" style="margin-bottom:14px;">
      <p style="margin:0 0 10px; font-weight:700; font-size:1.05rem;">
        ${escapeHtml(w.challenger?.name || 'Unknown')} <span class="muted">vs</span> ${escapeHtml(w.defender?.name || 'Unknown')}
      </p>
      ${w.message ? `<p class="muted" style="margin:0 0 12px; font-size:0.85rem;">${escapeHtml(w.message)}</p>` : ''}
      <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:14px;">
        <div>
          <p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase;">${escapeHtml(w.challenger?.name || 'Challenger')}'s clip</p>
          ${w.challenger_video_url ? `<a href="${safeUrl(w.challenger_video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Watch</a>` : `<p class="muted" style="font-size:0.82rem; margin:0;">Not submitted</p>`}
        </div>
        <div>
          <p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase;">${escapeHtml(w.defender?.name || 'Defender')}'s clip</p>
          ${w.defender_video_url ? `<a href="${safeUrl(w.defender_video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Watch</a>` : `<p class="muted" style="font-size:0.82rem; margin:0;">Not submitted</p>`}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" data-resolve-war="${w.id}" data-winner-crew="${w.challenger_crew_id}" ${w.challenger_video_url ? '' : 'disabled title="No video from this crew — can\'t be named winner"'}>${escapeHtml(w.challenger?.name || 'Challenger')} Wins</button>
        <button class="btn btn-primary btn-sm" data-resolve-war="${w.id}" data-winner-crew="${w.defender_crew_id}" ${w.defender_video_url ? '' : 'disabled title="No video from this crew — can\'t be named winner"'}>${escapeHtml(w.defender?.name || 'Defender')} Wins</button>
        <button class="btn btn-ghost btn-sm" data-resolve-war="${w.id}">Declare Tie</button>
      </div>
    </div>
  `;
}

async function resolveWar(warId, winnerCrewId) {
  if (!window.confirm(winnerCrewId ? 'Lock in this result? This ends the war for both crews.' : 'Declare this war a tie? This ends it for both crews with no winner.')) return;
  const { error } = await sb.rpc('resolve_crew_war', { war_id: warId, winner_id: winnerCrewId });
  if (error) { showToast(error.message, true); return; }
  showToast(winnerCrewId ? 'War resolved.' : 'War tied.');
  await loadDisputedWars();
}
