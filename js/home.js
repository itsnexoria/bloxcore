// BloxCore — index.html logic (live dashboard: featured bounty, live bounties,
// active crews, top pirates, live activity)

onReady(async () => {
  loadHappeningNow();
  loadActiveCrews();
  loadTopPirates();
  loadTrending();
});

// Matches /blox-fruits-values/<slug>/ exactly (scripts/lib/shell.mjs's slugify()) — no shared
// client-side version of this existed before since no page linked to item pages from JS.
function slugifyItemName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// "Trending" here means the community-flagged trend on bf_items (up/overpaid/underpaid/
// unstable), not a computed week-over-week % change — the price-history table exists but is
// too sparse right now (everything on record is from one same-value bulk save) for a real
// "moved X% this week" claim to be honest. This uses what's actually true today instead.
const TREND_LABEL = { up: 'Trending Up', overpaid: 'Overpaid', underpaid: 'Underpaid', unstable: 'Unstable' };
async function loadTrending() {
  const section = document.getElementById('trending-section');
  const grid = document.getElementById('trending-grid');
  if (!section || !grid) return;
  const { data, error } = await sb.from('bf_items')
    .select('name, category, regular_value, icon_url, trend')
    .neq('trend', 'stable')
    .not('regular_value', 'is', null)
    .order('regular_value', { ascending: false })
    .limit(6);
  if (error || !data || !data.length) return; // stays hidden — no fake/empty widget
  grid.innerHTML = data.map(item => {
    const color = item.trend === 'up' || item.trend === 'underpaid' ? 'var(--sea)' : '#f87171';
    return `
      <a href="/blox-fruits-values/${slugifyItemName(item.name)}/" class="panel trending-tile hover-lift-card">
        ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy">` : ''}
        <span class="trending-tile-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="trending-tile-value">${formatValue(item.regular_value)}</span>
        <span class="trending-tile-badge" style="color:${color};">${TREND_LABEL[item.trend] || item.trend}</span>
      </a>`;
  }).join('');
  section.style.display = '';
  refreshIcons();
}

// Same "quest-card" component used across the site (css/style.css .quest-card-*),
// reused here as a generic "live poster" for whatever's actually happening right
// now — a sea event, a PvP match, or a giveaway — instead of being quest-only.
const HAPPENING_TIER = { sea_event: 'medium', pvp_match: 'hard', giveaway: 'legendary' };
const HAPPENING_TIER_LABEL = { medium: 'Medium', hard: 'Hard', legendary: 'Legendary' };
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

// Compact row version of the same item, used in the homepage dashboard's
// "Live Right Now" list (everything after the single featured item above).
function dashLiveRowHtml(item) {
  const tier = HAPPENING_TIER[item.kind];
  const tagClass = tier === 'legendary' ? 'tag-legendary' : tier === 'hard' ? 'tag-hard' : 'tag-medium';
  return `
    <a href="${item.href}" class="dash-row">
      <div class="dash-row-main">
        <span class="dash-row-icon"><i data-lucide="${item.icon}" style="width:16px;height:16px;"></i></span>
        <div style="min-width:0;">
          <div class="dash-row-title">${escapeHtml(item.title)}</div>
          <div class="dash-row-sub">${escapeHtml(item.meta)}</div>
        </div>
      </div>
      <span class="tag ${tagClass}" style="flex-shrink:0;">${HAPPENING_TIER_LABEL[tier]}</span>
    </a>
  `;
}

async function loadHappeningNow() {
  const featuredEl = document.getElementById('dash-featured');
  const listEl = document.getElementById('dash-live-list');
  if (!featuredEl || !listEl) return;
  try {
    const now = Date.now();
    const [{ data: events }, { data: matches }, { data: giveaways }] = await Promise.all([
      sb.from('sea_events').select('type, notes, expires_at, created_at').order('created_at', { ascending: false }).limit(5),
      sb.from('pvp_matches').select('match_type, expires_at, created_at').order('created_at', { ascending: false }).limit(5),
      sb.from('giveaways').select('title, prize, ends_at').eq('status', 'active').order('ends_at', { ascending: true }).limit(3),
    ]);

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

    // Interleave by kind so the preview shows variety, not all of the same type.
    const byKind = { sea_event: items.filter(i => i.kind === 'sea_event'), pvp_match: items.filter(i => i.kind === 'pvp_match'), giveaway: items.filter(i => i.kind === 'giveaway') };
    const picked = [];
    for (const kind of ['sea_event', 'pvp_match', 'giveaway']) if (byKind[kind].length) picked.push(byKind[kind][0]);
    for (const kind of ['sea_event', 'pvp_match', 'giveaway']) { if (picked.length >= 5) break; if (byKind[kind][1]) picked.push(byKind[kind][1]); }
    for (const kind of ['sea_event', 'pvp_match', 'giveaway']) { if (picked.length >= 5) break; if (byKind[kind][2]) picked.push(byKind[kind][2]); }

    if (!picked.length) {
      featuredEl.innerHTML = `
        <div class="quest-card" data-difficulty="medium" style="align-items:center; justify-content:center; text-align:center; padding:30px;">
          <p class="muted" style="margin:0;">Nothing live right now — <a href="/sea-events/">post a sea event</a>, <a href="/pvp/">start a match</a>, or check back soon.</p>
        </div>`;
      listEl.innerHTML = `<p class="muted">Check back soon.</p>`;
      refreshIcons();
      return;
    }

    featuredEl.innerHTML = happeningCardHtml(picked[0]);
    listEl.innerHTML = picked.slice(1, 5).map(dashLiveRowHtml).join('') || `<p class="muted">Nothing else live at the moment.</p>`;
    refreshIcons();
  } catch (e) {
    logError('Failed to load happening-now feed:', e);
    featuredEl.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load live activity right now.</p>`;
    listEl.innerHTML = '';
  }
}

async function loadTopPirates() {
  const el = document.getElementById('top-pirates');
  if (!el) return;
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

// Homepage dashboard's "Active Crews" list — recruiting crews first (so the
// panel actually helps people find a crew), topped up with the biggest crews
// by member count if there aren't enough open ones yet.
async function loadActiveCrews() {
  const el = document.getElementById('dash-active-crews');
  if (!el) return;
  try {
    const { data, error } = await sb.from('crews').select('id, name, tag, logo_url, recruiting').order('created_at', { ascending: false }).limit(30);
    if (error || !data?.length) {
      el.innerHTML = `<p class="muted">No crews have made a name for themselves yet — <a href="/crews/">start one</a>.</p>`;
      return;
    }
    const { data: members } = await sb.from('crew_members').select('crew_id').in('crew_id', data.map(c => c.id));
    const countByCrew = {};
    (members || []).forEach(m => { countByCrew[m.crew_id] = (countByCrew[m.crew_id] || 0) + 1; });
    data.forEach(c => { c._memberCount = countByCrew[c.id] || 0; });

    const sorted = [...data].sort((a, b) => (b.recruiting - a.recruiting) || (b._memberCount - a._memberCount));
    const top4 = sorted.slice(0, 4);

    el.innerHTML = top4.map(c => `
      <a href="/crew/?name=${encodeURIComponent(c.name)}" class="dash-row">
        <div class="dash-row-main">
          <span class="dash-row-icon">
            ${c.logo_url
              ? `<img src="${c.logo_url}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='${escapeHtml((c.name[0] || '?').toUpperCase())}';">`
              : escapeHtml((c.name[0] || '?').toUpperCase())}
          </span>
          <div style="min-width:0;">
            <div class="dash-row-title">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</div>
            <div class="dash-row-sub">${c._memberCount} member${c._memberCount === 1 ? '' : 's'}</div>
          </div>
        </div>
        <span class="tag ${c.recruiting ? 'tag-easy' : ''}" style="flex-shrink:0; ${c.recruiting ? '' : 'background:rgb(255 255 255 / 0.06); color:var(--ash);'}">${c.recruiting ? 'Recruiting' : 'Full'}</span>
      </a>
    `).join('');
    refreshIcons();
  } catch (e) {
    logError('Failed to load active crews:', e);
    el.innerHTML = `<p class="muted">Couldn't load crews right now.</p>`;
  }
}
