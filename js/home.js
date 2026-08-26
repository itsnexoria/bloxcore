// BloxCore — index.html logic (stats bar, featured challenges, top pirates/crews preview)

let homeTab = 'players';

onReady(async () => {
  loadStats();
  loadFeaturedChallenges();
  loadTopPirates();
  document.getElementById('home-tab-players')?.addEventListener('click', () => switchHomeTab('players'));
  document.getElementById('home-tab-crews')?.addEventListener('click', () => switchHomeTab('crews'));
  document.getElementById('home-tab-wars')?.addEventListener('click', () => switchHomeTab('wars'));
});

function switchHomeTab(tab) {
  if (tab === homeTab) return;
  homeTab = tab;
  document.getElementById('home-tab-players').className = `btn btn-sm ${tab === 'players' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('home-tab-crews').className = `btn btn-sm ${tab === 'crews' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('home-tab-wars').className = `btn btn-sm ${tab === 'wars' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('home-leaderboard-link').href = tab === 'crews' || tab === 'wars' ? '/leaderboard/#' + tab : '/leaderboard/';
  if (tab === 'crews') loadTopCrews();
  else if (tab === 'wars') loadTopCrewWars();
  else loadTopPirates();
}

async function loadStats() {
  const el = document.getElementById('home-stats');
  const [{ count: pirates }, { count: crews }, { count: completions }, { count: titles }] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }),
    sb.from('crews').select('id', { count: 'exact', head: true }),
    // `completions` only stores one row per (user, challenge) — it's a cooldown/last-completed
    // marker, not a log, so it undercounts repeatable daily/weekly bounties. activity_log gets a
    // fresh row every approval, so it's the accurate source for a running total.
    sb.from('activity_log').select('id', { count: 'exact', head: true }).eq('type', 'challenge_approved'),
    sb.from('titles').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { label: 'Pirates Registered', value: pirates },
    { label: 'Bounties Completed', value: completions },
    { label: 'Active Crews', value: crews },
    { label: 'Titles to Unlock', value: titles },
  ];

  el.innerHTML = stats.map(s => `
    <div class="stat-tile">
      <p class="stat-number">${(s.value ?? 0).toLocaleString()}</p>
      <p class="muted" style="margin:2px 0 0; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.04em;">${s.label}</p>
    </div>
  `).join('');
}

async function loadFeaturedChallenges() {
  const el = document.getElementById('featured-challenges');
  const { data, error } = await sb
    .from('challenges')
    .select('title, description, difficulty, xp_reward')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(3);

  if (error || !data?.length) {
    el.innerHTML = `<p class="muted" style="grid-column:1/-1;">No quests live right now — check back soon.</p>`;
    return;
  }

  el.innerHTML = data.map((c, i) => `
    <div class="poster" style="transform: rotate(${(i - 1) * 1.5}deg);">
      <p class="poster-eyebrow"><i data-lucide="star" class="icon-sm"></i> WANTED <i data-lucide="star" class="icon-sm"></i></p>
      <p class="poster-title">${escapeHtml(c.title)}</p>
      <p class="poster-body">${escapeHtml(c.description)}</p>
      <p class="poster-reward">+${c.xp_reward} XP</p>
      <div class="center" style="margin-top:10px;"><span class="tag tag-${c.difficulty}">${c.difficulty}</span></div>
    </div>
  `).join('');
  refreshIcons();
}

async function loadTopPirates() {
  const el = document.getElementById('top-pirates');
  const { data, error } = await sb
    .from('profiles')
    .select('username, display_name, avatar_url, avatar_frame, level, xp, title_color_override, titles(name, color)')
    .eq('hide_from_leaderboard', false)
    .order('level', { ascending: false })
    .order('xp', { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    el.innerHTML = `<p class="muted" style="padding:20px;">No pirates have made a name for themselves yet.</p>`;
    return;
  }

  el.innerHTML = data.map((p, i) => `
    <div class="flex-between" style="padding:12px 20px; ${i === data.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:22px;">#${i + 1}</span>
        ${avatarHtml(p, 32)}
        <a href="/player/?u=${encodeURIComponent(p.username)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(displayNameFor(p))}</a> ${titleBadge(p)}
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">Lv. ${p.level}</p>
    </div>
  `).join('');
}

async function loadTopCrewWars() {
  const el = document.getElementById('top-pirates');
  el.innerHTML = `<div class="skeleton" style="height:50px; margin:14px;"></div>`;

  const { data, error } = await sb.rpc('get_crew_war_leaderboard');

  if (error || !data?.length) {
    el.innerHTML = `<p class="muted" style="padding:20px;">No completed wars yet — the first crews to finish one will show up here.</p>`;
    return;
  }

  const top5 = data.slice(0, 5);
  el.innerHTML = top5.map((c, i) => `
    <div class="flex-between" style="padding:12px 20px; ${i === top5.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:22px;">#${i + 1}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:32px; height:32px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:32px; height:32px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</a>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${c.wins}W – ${c.losses}L${c.ties ? ` – ${c.ties}T` : ''}</p>
    </div>
  `).join('');
}

async function loadTopCrews() {
  const el = document.getElementById('top-pirates');
  el.innerHTML = `<div class="skeleton" style="height:50px; margin:14px;"></div>`;

  const { data, error } = await sb.rpc('get_crew_leaderboard');

  if (error || !data?.length) {
    el.innerHTML = `<p class="muted" style="padding:20px;">No crews have made a name for themselves yet.</p>`;
    return;
  }

  const top5 = data.slice(0, 5);
  el.innerHTML = top5.map((c, i) => `
    <div class="flex-between" style="padding:12px 20px; ${i === top5.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:22px;">#${i + 1}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" style="width:32px; height:32px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:32px; height:32px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</a>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(c.total_xp).toLocaleString()} XP</p>
    </div>
  `).join('');
}
