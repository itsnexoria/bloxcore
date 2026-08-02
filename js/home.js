// BloxCore — index.html logic (stats bar, featured challenges, top pirates preview)

document.addEventListener('DOMContentLoaded', async () => {
  loadStats();
  loadFeaturedChallenges();
  loadTopPirates();
});

async function loadStats() {
  const el = document.getElementById('home-stats');
  const [{ count: pirates }, { count: crews }, { count: completions }, { count: titles }] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }),
    sb.from('crews').select('id', { count: 'exact', head: true }),
    sb.from('completions').select('id', { count: 'exact', head: true }),
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
    el.innerHTML = `<p class="muted" style="grid-column:1/-1;">No challenges live right now — check back soon.</p>`;
    return;
  }

  el.innerHTML = data.map((c, i) => `
    <div class="poster" style="transform: rotate(${(i - 1) * 1.5}deg);">
      <p class="poster-eyebrow">★ WANTED ★</p>
      <p class="poster-title">${escapeHtml(c.title)}</p>
      <p class="poster-body">${escapeHtml(c.description)}</p>
      <p class="poster-reward">+${c.xp_reward} XP</p>
      <div class="center" style="margin-top:10px;"><span class="tag tag-${c.difficulty}">${c.difficulty}</span></div>
    </div>
  `).join('');
}

async function loadTopPirates() {
  const el = document.getElementById('top-pirates');
  const { data, error } = await sb
    .from('profiles')
    .select('username, display_name, avatar_url, level, xp, titles(name, color)')
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
        <a href="/player/?u=${encodeURIComponent(p.username)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(displayNameFor(p))}${titleBadge(p)}</a>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">Lv. ${p.level}</p>
    </div>
  `).join('');
}
