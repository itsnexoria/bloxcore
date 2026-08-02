// BloxCore — leaderboard.html logic

const PAGE_SIZE = 20;
let currentPage = 0;
let activeTab = 'players';

document.addEventListener('DOMContentLoaded', () => {
  loadLeaderboard(0);
  document.getElementById('lb-tab-players').addEventListener('click', () => switchTab('players'));
  document.getElementById('lb-tab-crews').addEventListener('click', () => switchTab('crews'));
});

function switchTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  document.getElementById('lb-tab-players').className = `btn btn-sm ${tab === 'players' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lb-tab-crews').className = `btn btn-sm ${tab === 'crews' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lb-subtitle').textContent = tab === 'players'
    ? 'Ranked by level, then total XP earned.'
    : 'Ranked by total crew XP.';
  if (tab === 'players') loadLeaderboard(0);
  else loadCrewLeaderboard();
}

async function loadLeaderboard(page) {
  const list = document.getElementById('leaderboard-list');
  currentPage = page;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await sb
    .from('profiles')
    .select('username, display_name, avatar_url, level, xp, current_streak, titles(name, color)', { count: 'exact' })
    .eq('hide_from_leaderboard', false)
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
        ${avatarHtml(p, 36)}
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

async function loadCrewLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = `<div class="skeleton" style="height:60px; margin:16px;"></div>`;

  const { data, error } = await sb.rpc('get_crew_leaderboard');

  if (error) {
    list.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the crew leaderboard right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty-state">No crews yet — be the first to start one.</div>`;
    return;
  }

  list.innerHTML = data.map((c, i) => `
    <div class="flex-between" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
      <div style="display:flex; align-items:center; gap:16px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${i + 1}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" style="width:36px; height:36px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:36px; height:36px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.85rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">
          ${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}
        </a>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(c.total_xp).toLocaleString()} XP</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${c.member_count} member${c.member_count == 1 ? '' : 's'} · avg Lv. ${Math.round(c.avg_level)}</p>
      </div>
    </div>
  `).join('');
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'lb-prev') loadLeaderboard(currentPage - 1);
  if (e.target.id === 'lb-next') loadLeaderboard(currentPage + 1);
});
