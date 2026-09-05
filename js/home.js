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

// Same "quest-card" component used on /challenges/ (css/style.css .quest-card-*),
// so the homepage's Live Bounties preview visually matches the full quest board
// instead of running its own separate wanted-poster design.
const QUEST_ICON_RULES = [
  { icon: 'anchor', words: ['sea beast', 'sea', 'shark', 'ocean', 'fish'] },
  { icon: 'swords', words: ['raid', 'dungeon', 'boss', 'trial'] },
  { icon: 'crosshair', words: ['pvp', 'duel', 'kill', 'defeat player'] },
  { icon: 'crown', words: ['bounty', 'wanted level'] },
  { icon: 'circle-dollar-sign', words: ['beli', 'money', 'earn', 'cash'] },
  { icon: 'users', words: ['crew', 'team'] },
  { icon: 'gift', words: ['giveaway'] },
];
function questIconFor(c) {
  const text = `${c.title} ${c.description}`.toLowerCase();
  for (const rule of QUEST_ICON_RULES) {
    if (rule.words.some(w => text.includes(w))) return rule.icon;
  }
  return 'target';
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

  el.innerHTML = data.map(c => `
    <div class="quest-card" data-difficulty="${c.difficulty}">
      <div class="quest-card-hero">
        <i data-lucide="${questIconFor(c)}" class="quest-card-hero-icon"></i>
        <span class="quest-card-wanted-pill"><i data-lucide="star" style="width:10px;height:10px;"></i> WANTED <i data-lucide="star" style="width:10px;height:10px;"></i></span>
        <span class="quest-card-badge"><i data-lucide="${questIconFor(c)}" class="icon-md"></i></span>
      </div>
      <div class="quest-card-body">
        <h3 class="quest-card-title">${escapeHtml(c.title)}</h3>
        <p class="quest-card-desc">${escapeHtml(c.description)}</p>
        <div class="quest-card-divider"></div>
        <p class="quest-card-reward-label">Reward</p>
        <p class="quest-card-reward-value">+${c.xp_reward} XP</p>
        <p class="quest-card-meta-row"><span class="quest-card-meta-dot"></span>${c.difficulty}</p>
        <p class="quest-card-meta-sub">${c.rotation !== 'none' ? `${c.rotation.charAt(0).toUpperCase()}${c.rotation.slice(1)} Quest` : c.repeatable ? `Repeatable${c.cooldown_hours > 0 ? ` · ${c.cooldown_hours}h cooldown` : ''}` : 'One-Time Quest'}</p>
        <a href="/challenges/" class="quest-card-claim-btn" style="text-decoration:none;">View Quest <i data-lucide="chevron-right" class="icon-sm"></i></a>
      </div>
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

  el.innerHTML = data.map((p, i) => {
    const rank = i + 1;
    const podium = rank <= 3;
    return `
    <div class="flex-between${podium ? ' lb-row-podium' : ''}" ${podium ? `data-rank="${rank}"` : ''} style="padding:12px 20px; ${i === data.length - 1 || podium ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="${podium ? 'lb-podium-rank' : ''}" style="font-family:var(--font-mono); color:var(--ash); width:22px;">${podium ? `<i data-lucide="${rank === 1 ? 'crown' : 'medal'}" class="icon-sm"></i>` : `#${rank}`}</span>
        ${avatarHtml(p, 32)}
        <a href="/player/?u=${encodeURIComponent(p.username)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(displayNameFor(p))}</a> ${titleBadge(p)}
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">Lv. ${p.level}</p>
    </div>
  `;
  }).join('');
  refreshIcons();
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
  el.innerHTML = top5.map((c, i) => {
    const rank = i + 1;
    const podium = rank <= 3;
    return `
    <div class="flex-between${podium ? ' lb-row-podium' : ''}" ${podium ? `data-rank="${rank}"` : ''} style="padding:12px 20px; ${i === top5.length - 1 || podium ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="${podium ? 'lb-podium-rank' : ''}" style="font-family:var(--font-mono); color:var(--ash); width:22px;">${podium ? `<i data-lucide="${rank === 1 ? 'crown' : 'medal'}" class="icon-sm"></i>` : `#${rank}`}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:32px; height:32px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:32px; height:32px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</a>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${c.wins}W – ${c.losses}L${c.ties ? ` – ${c.ties}T` : ''}</p>
    </div>
  `;
  }).join('');
  refreshIcons();
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
  el.innerHTML = top5.map((c, i) => {
    const rank = i + 1;
    const podium = rank <= 3;
    return `
    <div class="flex-between${podium ? ' lb-row-podium' : ''}" ${podium ? `data-rank="${rank}"` : ''} style="padding:12px 20px; ${i === top5.length - 1 || podium ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="${podium ? 'lb-podium-rank' : ''}" style="font-family:var(--font-mono); color:var(--ash); width:22px;">${podium ? `<i data-lucide="${rank === 1 ? 'crown' : 'medal'}" class="icon-sm"></i>` : `#${rank}`}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" style="width:32px; height:32px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:32px; height:32px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</a>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(c.total_xp).toLocaleString()} XP</p>
    </div>
  `;
  }).join('');
  refreshIcons();
}
