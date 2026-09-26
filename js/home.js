// BloxCore — index.html logic (stats bar, featured challenges, top pirates/crews preview)

let homeTab = 'players';

onReady(async () => {
  loadStats();
  loadHappeningNow();
  loadOnlineChip();
  loadFeaturedCrews();
  loadTrendingValues();
  loadTopPirates();
  loadWeeklySpotlight();
  document.getElementById('home-tab-players')?.addEventListener('click', () => switchHomeTab('players'));
  document.getElementById('home-tab-crews')?.addEventListener('click', () => switchHomeTab('crews'));
  document.getElementById('home-tab-wars')?.addEventListener('click', () => switchHomeTab('wars'));
});

async function loadOnlineChip() {
  const el = document.getElementById('hero-online-count');
  if (!el) return;
  try {
    el.textContent = await getOnlineCount();
  } catch (e) {
    logError('Failed to load online count:', e);
    document.getElementById('hero-online-chip')?.remove();
  }
}

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
  const [{ count: pirates }, { count: crews }, { count: seaEvents }, { count: giveaways }] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }),
    sb.from('crews').select('id', { count: 'exact', head: true }),
    sb.from('sea_events').select('id', { count: 'exact', head: true }),
    sb.from('giveaways').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { label: 'Pirates Registered', value: pirates },
    { label: 'Sea Events Hosted', value: seaEvents },
    { label: 'Active Crews', value: crews },
    { label: 'Giveaways Run', value: giveaways },
  ];

  el.innerHTML = stats.map(s => `
    <div class="stat-tile">
      <p class="stat-number">${(s.value ?? 0).toLocaleString()}</p>
      <p class="muted" style="margin:2px 0 0; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.04em;">${s.label}</p>
    </div>
  `).join('');
}

// Same "quest-card" component used across the site (css/style.css .quest-card-*),
// reused here as a generic "live poster" for whatever's actually happening right
// now — a sea event, a PvP match, or a giveaway — instead of being quest-only.
const HAPPENING_TIER = { sea_event: 'medium', pvp_match: 'hard', giveaway: 'legendary' };
const SEA_EVENT_LABELS = {
  sea_beast: 'Sea Beast', terror_shark: 'Terror Shark', leviathan: 'Leviathan',
  prehistoric_island: 'Prehistoric Island', mirage: 'Mirage', kitsune_shrine: 'Kitsune Shrine',
};

function happeningCardHtml(item) {
  return `
    <div class="quest-card" data-difficulty="${HAPPENING_TIER[item.kind]}">
      <div class="quest-card-hero">
        <i data-lucide="${item.icon}" class="quest-card-hero-icon"></i>
        <span class="quest-card-wanted-pill"><i data-lucide="circle" style="width:8px;height:8px;fill:currentColor;"></i> LIVE NOW</span>
        <span class="quest-card-badge quest-card-badge-img"><i data-lucide="${item.icon}" class="icon-md"></i></span>
      </div>
      <div class="quest-card-body">
        <h3 class="quest-card-title">${escapeHtml(item.title)}</h3>
        <p class="quest-card-desc">${escapeHtml(item.body)}</p>
        <div class="quest-card-divider"></div>
        <p class="quest-card-reward-label">Status</p>
        <p class="quest-card-reward-value">${escapeHtml(item.status)}</p>
        <p class="quest-card-meta-row"><span class="quest-card-meta-dot"></span>${escapeHtml(item.meta)}</p>
        <a href="${item.href}" class="quest-card-claim-btn" style="text-decoration:none;">${escapeHtml(item.cta)} <i data-lucide="chevron-right" class="icon-sm"></i></a>
      </div>
    </div>
  `;
}

async function loadHappeningNow() {
  const el = document.getElementById('happening-now');
  const ticker = document.getElementById('home-ticker');
  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const [
      { data: events }, { data: matches }, { data: giveaways },
      { count: eventCount }, { count: matchCount }, { count: giveawayCount },
    ] = await Promise.all([
      sb.from('sea_events').select('type, notes, expires_at, created_at').order('created_at', { ascending: false }).limit(5),
      sb.from('pvp_matches').select('match_type, expires_at, created_at').order('created_at', { ascending: false }).limit(5),
      sb.from('giveaways').select('title, prize, ends_at').eq('status', 'active').order('ends_at', { ascending: true }).limit(3),
      sb.from('sea_events').select('id', { count: 'exact', head: true }).gt('expires_at', nowIso),
      sb.from('pvp_matches').select('id', { count: 'exact', head: true }).gt('expires_at', nowIso),
      sb.from('giveaways').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

    if (ticker) {
      const parts = [];
      if (eventCount) parts.push(`<span class="home-ticker-item"><i data-lucide="waves"></i>${eventCount} sea event${eventCount === 1 ? '' : 's'} live</span>`);
      if (matchCount) parts.push(`<span class="home-ticker-item"><i data-lucide="crosshair"></i>${matchCount} PvP match${matchCount === 1 ? '' : 'es'} open</span>`);
      if (giveawayCount) parts.push(`<span class="home-ticker-item"><i data-lucide="gift"></i>${giveawayCount} giveaway${giveawayCount === 1 ? '' : 's'} running</span>`);
      ticker.innerHTML = parts.length
        ? `<span class="live-dot"></span>${parts.join('<span class="home-ticker-sep">·</span>')}`
        : `<span class="home-ticker-item"><i data-lucide="sparkles"></i>Be the first to post something today</span>`;
      refreshIcons();
    }

    const items = [];
    (events || []).filter(ev => new Date(ev.expires_at).getTime() > now).slice(0, 3).forEach(ev => items.push({
      kind: 'sea_event', icon: 'waves',
      title: `${SEA_EVENT_LABELS[ev.type] || ev.type} — Live Server`,
      body: ev.notes || 'A server is up and taking pirates right now.',
      status: 'Open', meta: timeRemainingCompact(ev.expires_at),
      href: '/sea-events/', cta: 'Join Server',
    }));
    (matches || []).filter(m => new Date(m.expires_at).getTime() > now).slice(0, 3).forEach(m => items.push({
      kind: 'pvp_match', icon: 'crosshair',
      title: `${m.match_type} Match — Open`,
      body: 'A PvP match is looking for opponents right now.',
      status: 'Open', meta: timeRemainingCompact(m.expires_at),
      href: '/pvp/', cta: 'Join Match',
    }));
    (giveaways || []).slice(0, 3).forEach(g => items.push({
      kind: 'giveaway', icon: 'gift',
      title: g.title,
      body: `Prize: ${g.prize}`,
      status: 'Entries Open', meta: timeRemaining(g.ends_at),
      href: '/giveaways/', cta: 'Enter Giveaway',
    }));

    // Interleave by kind so the preview shows variety, not three of the same type.
    const byKind = { sea_event: items.filter(i => i.kind === 'sea_event'), pvp_match: items.filter(i => i.kind === 'pvp_match'), giveaway: items.filter(i => i.kind === 'giveaway') };
    const picked = [];
    for (const kind of ['sea_event', 'pvp_match', 'giveaway']) if (byKind[kind].length) picked.push(byKind[kind][0]);
    for (const kind of ['sea_event', 'pvp_match', 'giveaway']) { if (picked.length >= 3) break; if (byKind[kind][1]) picked.push(byKind[kind][1]); }

    if (!picked.length) {
      el.innerHTML = `<p class="muted" style="grid-column:1/-1;">Nothing live right now — <a href="/sea-events/">post a sea event</a>, <a href="/pvp/">start a match</a>, or check back soon.</p>`;
      return;
    }

    el.innerHTML = picked.map(happeningCardHtml).join('');
    refreshIcons();
  } catch (e) {
    logError('Failed to load happening-now feed:', e);
    el.innerHTML = `<p class="muted" style="grid-column:1/-1;">Couldn't load live activity right now.</p>`;
    if (ticker) ticker.innerHTML = `<span class="home-ticker-item">Live activity unavailable right now</span>`;
  }
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

// Visually richer than the flat leaderboard rows below — reuses the exact same
// .crew-card component /crews/ renders, banner-behind-logo overlap included, so
// the homepage doesn't run a second, competing crew-card design.
async function loadFeaturedCrews() {
  const el = document.getElementById('featured-crews');
  if (!el) return;
  try {
    const { data, error } = await sb.rpc('get_crew_leaderboard');
    if (error || !data?.length) {
      el.innerHTML = `<p class="muted" style="grid-column:1/-1;">No crews have made a name for themselves yet — <a href="/crews/">start one</a>.</p>`;
      return;
    }
    el.innerHTML = data.slice(0, 3).map(c => `
      <div class="panel crew-card hover-lift-card">
        <div class="crew-card-banner" style="${c.banner_url ? `background-image:linear-gradient(160deg, transparent 40%, var(--navy) 100%), url('${c.banner_url}'); background-size:cover; background-position:center;` : ''}"></div>
        <div class="crew-card-top">
          <div class="crew-card-logo-ring">
            ${c.logo_url
              ? `<img src="${c.logo_url}" alt="" loading="lazy" class="crew-card-logo" onerror="this.style.display='none';">`
              : `<div class="crew-card-logo crew-card-logo-fallback">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
          </div>
          <div style="min-width:0; flex:1;">
            <h3 title="${escapeHtml(c.name)}" style="margin:0;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</h3>
            <span class="muted" style="font-size:0.8rem; font-family:var(--font-mono);">${Number(c.total_xp).toLocaleString()} XP</span>
          </div>
        </div>
        <div class="crew-card-footer">
          <span class="muted crew-card-members"><i data-lucide="users" class="icon-sm icon-inline"></i>${c.member_count} member${Number(c.member_count) === 1 ? '' : 's'}</span>
          <a href="/crew/?name=${encodeURIComponent(c.name)}" class="btn btn-primary btn-sm">View Crew</a>
        </div>
      </div>
    `).join('');
    refreshIcons();
  } catch (e) {
    logError('Failed to load featured crews:', e);
    el.innerHTML = `<p class="muted" style="grid-column:1/-1;">Couldn't load crews right now.</p>`;
  }
}

// Highest-value tradeable items — reuses the same rarity-tinted .build-modal-tile
// component from the build picker, so items look identical everywhere they show up.
async function loadTrendingValues() {
  const el = document.getElementById('trending-values');
  if (!el) return;
  try {
    const { data, error } = await sb.from('bf_items').select('name, icon_url, rarity, regular_value, trend')
      .in('category', ['fruit', 'limited', 'gamepass']).not('regular_value', 'is', null)
      .order('regular_value', { ascending: false }).limit(6);
    if (error || !data?.length) {
      el.innerHTML = `<p class="muted" style="grid-column:1/-1;">Item values aren't up yet — check <a href="/blox-fruits-values/">the full list</a>.</p>`;
      return;
    }
    const trendColor = t => (t === 'up' || t === 'underpaid') ? 'var(--sea)' : (t === 'overpaid' || t === 'unstable') ? '#f87171' : 'var(--ash)';
    el.innerHTML = data.map(item => `
      <figure class="value-tile-figure" style="margin:0;">
        <div class="build-modal-tile" data-rarity="${(item.rarity || 'common').toLowerCase()}" style="cursor:default;">
          ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy">` : `<i data-lucide="gem" class="icon-md"></i>`}
        </div>
        <figcaption>
          <div class="value-tile-name">${escapeHtml(item.name)}</div>
          <div class="value-tile-price">${Number(item.regular_value).toLocaleString()}</div>
          ${item.trend ? `<div class="value-tile-trend" style="color:${trendColor(item.trend)};">${escapeHtml(item.trend)}</div>` : ''}
        </figcaption>
      </figure>
    `).join('');
    refreshIcons();
  } catch (e) {
    logError('Failed to load trending values:', e);
    el.innerHTML = `<p class="muted" style="grid-column:1/-1;">Couldn't load item values right now.</p>`;
  }
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

// Homepage spotlight — auto-rotates between this week's top XP-earning player and
// top XP-earning crew every few seconds. Both come from a single RPC call so the
// widget never fires two separate round-trips.
async function loadWeeklySpotlight() {
  const el = document.getElementById('weekly-spotlight');
  const [{ data, error }, { data: shotData }] = await Promise.all([
    sb.rpc('get_weekly_spotlight'),
    sb.rpc('get_screenshot_of_the_week'),
  ]);
  const row = data?.[0];
  const shot = shotData?.[0];

  if ((error || !row || (!row.player_id && !row.crew_id)) && !shot) {
    el.innerHTML = `<p class="muted" style="margin:0; padding:10px 0;">Spotlight kicks in once someone earns XP this week — could be you.</p>`;
    return;
  }

  const playerProfile = row?.player_id ? {
    username: row.player_username, display_name: row.player_display_name,
    avatar_url: row.player_avatar_url, avatar_frame: row.player_avatar_frame,
    title_color_override: row.player_title_color_override,
    titles: row.player_title_name ? { name: row.player_title_name, color: row.player_title_color } : null,
  } : null;

  const views = [];
  if (playerProfile) {
    views.push(`
      <div class="spotlight-view">
        <i data-lucide="crown" class="spotlight-decor-icon"></i>
        <span class="spotlight-kicker"><i data-lucide="star" class="icon-sm icon-inline"></i>Player of the Week</span>
        <div class="flex-between" style="margin-top:8px; gap:14px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="spotlight-avatar-ring">${avatarHtml(playerProfile, 50)}</div>
            <div style="min-width:0;">
              <a href="/player/?u=${encodeURIComponent(row.player_username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:1.05rem;">${escapeHtml(displayNameFor(playerProfile))}</a> ${titleBadge(playerProfile)}
              <div><span class="spotlight-stat-pill"><i data-lucide="trending-up" style="width:12px;height:12px;"></i>+${Number(row.player_weekly_xp).toLocaleString()} XP this week</span></div>
            </div>
          </div>
          <a href="/player/?u=${encodeURIComponent(row.player_username || '')}" class="btn btn-ghost btn-sm" style="flex-shrink:0;">View Profile <i data-lucide="arrow-right" class="icon-sm"></i></a>
        </div>
      </div>
    `);
  }
  if (row?.crew_id) {
    views.push(`
      <div class="spotlight-view">
        <i data-lucide="crown" class="spotlight-decor-icon"></i>
        <span class="spotlight-kicker"><i data-lucide="users" class="icon-sm icon-inline"></i>Crew of the Week</span>
        <div class="flex-between" style="margin-top:8px; gap:14px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="spotlight-avatar-ring">
              ${row.crew_logo_url
                ? `<img src="${row.crew_logo_url}" alt="" style="width:50px; height:50px; border-radius:11px; object-fit:cover; display:block;" onerror="this.style.visibility='hidden';">`
                : `<div style="width:50px; height:50px; border-radius:11px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; color:var(--ash); font-weight:700;">${escapeHtml((row.crew_name[0] || '?').toUpperCase())}</div>`}
            </div>
            <div style="min-width:0;">
              <a href="/crew/?name=${encodeURIComponent(row.crew_name)}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:1.05rem;">${row.crew_tag ? `[${escapeHtml(row.crew_tag)}] ` : ''}${escapeHtml(row.crew_name)}</a>
              <div><span class="spotlight-stat-pill"><i data-lucide="trending-up" style="width:12px;height:12px;"></i>+${Number(row.crew_weekly_xp).toLocaleString()} XP · ${row.crew_member_count} members</span></div>
            </div>
          </div>
          <a href="/crew/?name=${encodeURIComponent(row.crew_name)}" class="btn btn-ghost btn-sm" style="flex-shrink:0;">View Crew <i data-lucide="arrow-right" class="icon-sm"></i></a>
        </div>
      </div>
    `);
  }

  if (shot) {
    views.push(`
      <div class="spotlight-view">
        <i data-lucide="camera" class="spotlight-decor-icon"></i>
        <span class="spotlight-kicker"><i data-lucide="image" class="icon-sm icon-inline"></i>Screenshot of the Week</span>
        <div class="flex-between" style="margin-top:8px; gap:14px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:14px; min-width:0;">
            <img src="${shot.image_url}" alt="" style="width:58px; height:58px; border-radius:11px; object-fit:cover; flex-shrink:0; border:2px solid var(--brass-bright);">
            <div style="min-width:0;">
              <span style="color:var(--bone); font-weight:700; font-size:1rem;">${escapeHtml(displayNameFor({ username: shot.username, display_name: shot.display_name }))}</span>
              <div><span class="spotlight-stat-pill"><i data-lucide="heart" style="width:12px;height:12px;"></i>${shot.like_count} like${shot.like_count === 1 ? '' : 's'} this week</span></div>
            </div>
          </div>
          <a href="/feed/#${shot.id}" class="btn btn-ghost btn-sm" style="flex-shrink:0;">View Post <i data-lucide="arrow-right" class="icon-sm"></i></a>
        </div>
      </div>
    `);
  }

  if (!views.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="spotlight-dots">${views.map((_, i) => `<span class="spotlight-dot${i === 0 ? ' is-active' : ''}"></span>`).join('')}</div><div id="spotlight-slot">${views[0]}</div>`;
  refreshIcons();

  if (views.length > 1) {
    let idx = 0;
    setInterval(() => {
      idx = (idx + 1) % views.length;
      const slot = document.getElementById('spotlight-slot');
      if (!slot) return;
      slot.classList.add('is-fading');
      setTimeout(() => {
        slot.innerHTML = views[idx];
        slot.classList.remove('is-fading');
        refreshIcons();
        document.querySelectorAll('.spotlight-dot').forEach((d, i) => d.classList.toggle('is-active', i === idx));
      }, 250);
    }, 6000);
  }
}
