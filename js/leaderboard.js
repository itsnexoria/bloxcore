// BloxCore — leaderboard.html logic

const PAGE_SIZE = 20;
let currentPage = 0;
let activeTab = 'players';
let activePeriod = 'alltime';
let currentUsername = null;

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const { data: me } = await sb.from('profiles').select('username').eq('id', session.user.id).single();
    currentUsername = me?.username || null;
  }
  loadLeaderboard(0);
  document.getElementById('lb-tab-players').addEventListener('click', () => switchTab('players'));
  document.getElementById('lb-tab-crews').addEventListener('click', () => switchTab('crews'));
  document.getElementById('lb-tab-wars').addEventListener('click', () => switchTab('wars'));
  document.getElementById('lb-tab-pvp').addEventListener('click', () => switchTab('pvp'));
  if (window.location.hash === '#crews') switchTab('crews');
  else if (window.location.hash === '#wars') switchTab('wars');
  else if (window.location.hash === '#pvp') switchTab('pvp');
  document.querySelectorAll('#lb-period-tabs [data-period]').forEach(btn => {
    btn.addEventListener('click', () => switchPeriod(btn.dataset.period));
  });
});

const PERIOD_LABELS = {
  today: 'Ranked by XP earned today.',
  weekly: 'Ranked by XP earned this week.',
  monthly: 'Ranked by XP earned this month.',
  alltime: null, // falls back to the players/crews subtitle below
};

function switchPeriod(period) {
  if (period === activePeriod) return;
  activePeriod = period;
  document.querySelectorAll('#lb-period-tabs [data-period]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.period === period ? 'btn-primary' : 'btn-ghost'}`;
  });
  if (activeTab === 'players') loadLeaderboard(0);
  else loadCrewLeaderboard();
}

function switchTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  document.getElementById('lb-tab-players').className = `btn btn-sm ${tab === 'players' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lb-tab-crews').className = `btn btn-sm ${tab === 'crews' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lb-tab-wars').className = `btn btn-sm ${tab === 'wars' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lb-tab-pvp').className = `btn btn-sm ${tab === 'pvp' ? 'btn-primary' : 'btn-ghost'}`;
  // Crew Wars and PvP are both cumulative win/loss records, not period-based XP
  // totals — the Today/Weekly/etc. tabs don't apply to either, unlike Players and Crews.
  document.getElementById('lb-period-tabs').style.display = (tab === 'wars' || tab === 'pvp') ? 'none' : 'flex';
  if (tab === 'players') loadLeaderboard(0);
  else if (tab === 'crews') loadCrewLeaderboard();
  else if (tab === 'pvp') loadPvpLeaderboard();
  else loadCrewWarLeaderboard();
}

function updateSubtitle(defaultText) {
  document.getElementById('lb-subtitle').textContent = PERIOD_LABELS[activePeriod] || defaultText;
}

async function loadLeaderboard(page) {
  const list = document.getElementById('leaderboard-list');
  currentPage = page;

  if (activePeriod !== 'alltime') {
    updateSubtitle('Ranked by level, then total XP earned.');
    list.innerHTML = `<div class="skeleton" style="height:60px; margin:16px;"></div>`;
    const { data, error } = await sb.rpc('get_period_player_leaderboard', { period: activePeriod });
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
      <div class="flex-between${p.username === currentUsername ? ' lb-row-mine' : ''}" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
        <div style="display:flex; align-items:center; gap:16px;">
          <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${i + 1}</span>
          ${avatarHtml(p, 36)}
          <div>
            <a href="/player/?u=${encodeURIComponent(p.username)}" style="margin:0; font-weight:700; color:var(--bone); text-decoration:none; display:block;">${escapeHtml(displayNameFor(p))} ${titleBadge({ title_color_override: p.title_color_override, titles: p.title_name ? { name: p.title_name, color: p.title_color } : null })}</a>
            <p class="muted" style="margin:0; font-size:0.82rem;">${rankTitleForLevel(p.level)}${p.current_streak > 0 ? ` · <i data-lucide="flame" class="icon-sm" style="color:var(--brass-bright);"></i> ${p.current_streak}` : ''}</p>
          </div>
        </div>
        <div style="text-align:right;">
          <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(p.period_xp).toLocaleString()} XP</p>
          <p class="muted" style="margin:0; font-size:0.78rem;">Lv. ${p.level}</p>
        </div>
      </div>
    `).join('');
    refreshIcons();
    return;
  }

  updateSubtitle('Ranked by level, then total XP earned.');
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await sb
    .from('profiles')
    .select('username, display_name, avatar_url, avatar_frame, level, xp, current_streak, title_color_override, titles(name, color)', { count: 'exact' })
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
    <div class="flex-between${p.username === currentUsername ? ' lb-row-mine' : ''}" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
      <div style="display:flex; align-items:center; gap:16px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${from + i + 1}</span>
        ${avatarHtml(p, 36)}
        <div>
          <a href="/player/?u=${encodeURIComponent(p.username)}" style="margin:0; font-weight:700; color:var(--bone); text-decoration:none; display:block;">${escapeHtml(displayNameFor(p))} ${titleBadge(p)}</a>
          <p class="muted" style="margin:0; font-size:0.82rem;">${rankTitleForLevel(p.level)}${p.current_streak > 0 ? ` · <i data-lucide="flame" class="icon-sm" style="color:var(--brass-bright);"></i> ${p.current_streak}` : ''}</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">Lv. ${p.level}</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${p.xp} XP</p>
      </div>
    </div>
  `).join('') + renderPager(count);
  refreshIcons();
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 20px;">
      <button class="btn btn-ghost btn-sm" id="lb-prev" ${currentPage === 0 ? 'disabled' : ''}><i data-lucide="chevron-left" class="icon-sm"></i> Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${currentPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="lb-next" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Next <i data-lucide="chevron-right" class="icon-sm"></i></button>
    </div>
  `;
}

async function loadCrewLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = `<div class="skeleton" style="height:60px; margin:16px;"></div>`;

  if (activePeriod !== 'alltime') {
    updateSubtitle('Ranked by total crew XP.');
    const { data, error } = await sb.rpc('get_period_crew_leaderboard', { period: activePeriod });
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
            ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:36px; height:36px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
            : `<div style="width:36px; height:36px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.85rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
          <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">
            ${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}
          </a>
        </div>
        <div style="text-align:right;">
          <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(c.period_xp).toLocaleString()} XP</p>
          <p class="muted" style="margin:0; font-size:0.78rem;">${c.member_count} member${c.member_count == 1 ? '' : 's'}</p>
        </div>
      </div>
    `).join('');
    return;
  }

  updateSubtitle('Ranked by total crew XP.');
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
          ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:36px; height:36px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
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

async function loadPvpLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  document.getElementById('lb-subtitle').textContent = 'Ranked by 1v1 rating — needs at least 3 verified matches to appear.';
  list.innerHTML = `<div class="skeleton" style="height:60px; margin:16px;"></div>`;

  const { data, error } = await sb.rpc('get_pvp_leaderboard');

  if (error) {
    list.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the PvP leaderboard right now.</p>`;
    console.error(error);
    return;
  }
  if (!data.length) {
    list.innerHTML = `<div class="empty-state">Nobody's played 3 verified 1v1s yet — post a match on the <a href="/pvp/" style="color:var(--brass-bright);">PvP page</a> to get started.</div>`;
    return;
  }

  list.innerHTML = data.map((p, i) => `
    <a href="/player/?u=${encodeURIComponent(p.username)}" style="text-decoration:none; color:inherit;">
      <div class="flex-between" style="padding:16px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
        <div style="display:flex; align-items:center; gap:16px;">
          <span style="font-family:var(--font-mono); color:var(--ash); width:28px;">#${i + 1}</span>
          ${avatarHtml(p, 36)}
          <span style="color:var(--bone); font-weight:700;">${escapeHtml(displayNameFor(p))}</span>
        </div>
        <div style="text-align:right;">
          <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${p.rating} rating</p>
          <p class="muted" style="margin:0; font-size:0.78rem;">${p.wins}W – ${p.losses}L</p>
        </div>
      </div>
    </a>
  `).join('');
}

async function loadCrewWarLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  document.getElementById('lb-subtitle').textContent = 'Ranked by crew war record — wins, then fewest losses.';
  list.innerHTML = `<div class="skeleton" style="height:60px; margin:16px;"></div>`;

  const { data, error } = await sb.rpc('get_crew_war_leaderboard');

  if (error) {
    list.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the crew war leaderboard right now.</p>`;
    console.error(error);
    return;
  }
  if (!data.length) {
    list.innerHTML = `<div class="empty-state">No completed wars yet — the first crews to finish one will show up here.</div>`;
    return;
  }

  list.innerHTML = data.map((c, i) => `
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
