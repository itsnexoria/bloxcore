// BloxCore — leaderboard.html logic

document.addEventListener('DOMContentLoaded', loadLeaderboard);

async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');

  const { data, error } = await sb
    .from('profiles')
    .select('username, level, xp')
    .order('level', { ascending: false })
    .order('xp', { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the leaderboard right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty-state">No pirates have made a name for themselves yet.</div>`;
    return;
  }

  list.innerHTML = data.map((p, i) => `
    <div class="flex-between" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
      <div style="display:flex; align-items:center; gap:16px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${i + 1}</span>
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(p.username)}</p>
          <p class="muted" style="margin:0; font-size:0.82rem;">${rankTitleForLevel(p.level)}</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">Lv. ${p.level}</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${p.xp} XP</p>
      </div>
    </div>
  `).join('');
}
