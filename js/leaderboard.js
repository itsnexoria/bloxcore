// BloxCore — leaderboard.html logic

const PAGE_SIZE = 20;
let currentPage = 0;

document.addEventListener('DOMContentLoaded', () => loadLeaderboard(0));

async function loadLeaderboard(page) {
  const list = document.getElementById('leaderboard-list');
  currentPage = page;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await sb
    .from('profiles')
    .select('username, display_name, level, xp, current_streak, titles(name, color)', { count: 'exact' })
    .order('level', { ascending: false })
    .order('xp', { ascending: false })
    .range(from, to);

  if (error) {
    list.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the leaderboard right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = page === 0
      ? `<div class="empty-state">No pirates have made a name for themselves yet.</div>`
      : `<div class="empty-state">No more pirates on this page.</div>`;
    return;
  }

  list.innerHTML = data.map((p, i) => `
    <div class="flex-between" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
      <div style="display:flex; align-items:center; gap:16px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${from + i + 1}</span>
        <div>
          <a href="/player/?u=${encodeURIComponent(p.username)}" style="margin:0; font-weight:700; color:var(--bone); text-decoration:none; display:block;">${escapeHtml(displayNameFor(p))}${titleBadge(p)}</a>
          <p class="muted" style="margin:0; font-size:0.82rem;">${rankTitleForLevel(p.level)}${p.current_streak > 0 ? ` · 🔥 ${p.current_streak}` : ''}</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">Lv. ${p.level}</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${p.xp} XP</p>
      </div>
    </div>
  `).join('') + renderPager(count);
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 20px;">
      <button class="btn btn-ghost btn-sm" id="lb-prev" ${currentPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${currentPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="lb-next" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Next →</button>
    </div>
  `;
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'lb-prev') loadLeaderboard(currentPage - 1);
  if (e.target.id === 'lb-next') loadLeaderboard(currentPage + 1);
});
