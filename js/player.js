// BloxCore — player/index.html logic (public profile view)

const fruitSkinIconMap = {};

onReady(loadPlayer);

async function loadPlayer() {
  const content = document.getElementById('player-content');
  const params = new URLSearchParams(window.location.search);
  const username = params.get('u');

  if (!username) {
    content.innerHTML = `<div class="empty-state">No player specified. Try a link from the leaderboard instead.</div>`;
    setNoindex();
    return;
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*, titles(name, color)')
    .eq('username', username)
    .single();

  if (error || !profile) {
    content.innerHTML = `<div class="empty-state">Couldn't find a pirate named "${escapeHtml(username)}".</div>`;
    setNoindex();
    return;
  }

  const { data: membership } = await sb.from('crew_members').select('crews(name, tag, logo_url)').eq('user_id', profile.id).maybeSingle();
  const { data: { session } } = await sb.auth.getSession();
  const viewerId = session?.user?.id || null;
  const isOwnProfile = viewerId === profile.id;

  if (profile.build_fruit_skin) {
    const { data: skinRow } = await sb.from('bf_items').select('icon_url').eq('category', 'limited').eq('name', profile.build_fruit_skin).maybeSingle();
    if (skinRow?.icon_url) fruitSkinIconMap[profile.build_fruit_skin] = skinRow.icon_url;
  }

  document.title = `${displayNameFor(profile)} — BloxCore`;
  setProfileMeta(profile);
  content.innerHTML = renderProfile(profile, membership?.crews, isOwnProfile);
  refreshIcons();
  wireProfileActions(profile);
  loadSocialActions(profile, viewerId, isOwnProfile);
  loadPlayerAchievements(profile.id);
  loadPlayerActivity(profile.id);
  loadPlayerTradeListings(profile.id);
  loadPlayerCombos(profile.id);
  loadPlayerServices(profile.id);
  loadPlayerSeaEvents(profile.id);
  loadPlayerGiveaways(profile.id, viewerId);
  loadPlayerLikesTotal(profile.id);
  loadPlayerVouches(profile.id, viewerId, isOwnProfile);
  loadPlayerPvpHistory(profile.id);
}

function setNoindex() {
  // The bare /player/ page (no ?u=) and a "no such player" result have nothing worth
  // indexing, and letting Google crawl them risks it treating one of the thousands of
  // near-identical error states as canonical instead of actual profiles.
  document.getElementById('meta-robots')?.setAttribute('content', 'noindex, nofollow');
}

function setProfileMeta(p) {
  const name = displayNameFor(p);
  const url = `https://blox.nexorealm.org/player/?u=${encodeURIComponent(p.username)}`;
  const desc = `${name} — Level ${p.level ?? 1} Blox Fruits pirate on BloxCore. See their rank, XP, bounty, and build.`;
  document.getElementById('meta-canonical')?.setAttribute('href', url);
  document.getElementById('meta-description')?.setAttribute('content', desc);
  document.getElementById('meta-og-title')?.setAttribute('content', `${name} — BloxCore`);
  document.getElementById('meta-og-description')?.setAttribute('content', desc);
  document.getElementById('meta-twitter-title')?.setAttribute('content', `${name} — BloxCore`);
  document.getElementById('meta-twitter-description')?.setAttribute('content', desc);
}

function wireProfileActions(p) {
  document.getElementById('profile-copy-link')?.addEventListener('click', async () => {
    const url = `${location.origin}/player/?u=${encodeURIComponent(p.username)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Profile link copied.');
    } catch {
      showToast(url);
    }
  });
  document.getElementById('profile-report')?.addEventListener('click', () => reportContent('profile', p.id));
}

async function loadSocialActions(p, viewerId, isOwnProfile) {
  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    sb.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', p.id),
    sb.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', p.id),
  ]);
  const countsEl = document.getElementById('follow-counts');
  if (countsEl) countsEl.innerHTML = `<span class="profile-hero-sep">·</span> ${followerCount || 0} Followers · ${followingCount || 0} Following`;

  const actionsEl = document.getElementById('social-actions');
  if (!actionsEl || isOwnProfile || !viewerId) return;

  const [{ data: followRow }, { data: friendshipRow }] = await Promise.all([
    sb.from('follows').select('follower_id').eq('follower_id', viewerId).eq('followed_id', p.id).maybeSingle(),
    sb.from('friendships').select('id, status, requester_id, addressee_id')
      .or(`and(requester_id.eq.${viewerId},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${viewerId})`)
      .maybeSingle(),
  ]);

  renderSocialActions(p, viewerId, !!followRow, friendshipRow);
}

function renderSocialActions(p, viewerId, isFollowing, friendship) {
  const actionsEl = document.getElementById('social-actions');

  let friendBtnHtml;
  if (!friendship) {
    friendBtnHtml = `<button type="button" class="btn btn-ghost btn-sm" id="friend-action-btn" data-action="request"><i data-lucide="user-plus" class="icon-sm icon-inline"></i>Add Friend</button>`;
  } else if (friendship.status === 'accepted') {
    friendBtnHtml = `<a href="/chat/?tab=messages&u=${encodeURIComponent(p.username)}" class="btn btn-ghost btn-sm"><i data-lucide="mail" class="icon-sm icon-inline"></i>Message</a>`;
  } else if (friendship.requester_id === viewerId) {
    friendBtnHtml = `<button type="button" class="btn btn-ghost btn-sm" disabled><i data-lucide="clock" class="icon-sm icon-inline"></i>Requested</button>`;
  } else {
    friendBtnHtml = `<button type="button" class="btn btn-primary btn-sm" id="friend-action-btn" data-action="accept" data-friendship-id="${friendship.id}"><i data-lucide="check" class="icon-sm icon-inline"></i>Accept Request</button>`;
  }

  actionsEl.innerHTML = `
    <button type="button" class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'} btn-sm" id="follow-toggle-btn" data-following="${isFollowing}">
      <i data-lucide="${isFollowing ? 'user-check' : 'user-plus-2'}" class="icon-sm icon-inline"></i>${isFollowing ? 'Following' : 'Follow'}
    </button>
    ${friendBtnHtml}
  `;
  refreshIcons();

  document.getElementById('follow-toggle-btn').addEventListener('click', async () => {
    const btn = document.getElementById('follow-toggle-btn');
    const nowFollowing = btn.dataset.following === 'true';
    btn.disabled = true;
    const { error } = nowFollowing
      ? await sb.from('follows').delete().eq('follower_id', viewerId).eq('followed_id', p.id)
      : await sb.from('follows').insert({ follower_id: viewerId, followed_id: p.id });
    btn.disabled = false;
    if (error) { showToast(error.message, true); return; }
    loadSocialActions(p, viewerId, false);
  });

  document.getElementById('friend-action-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    let error;
    if (btn.dataset.action === 'request') {
      ({ error } = await sb.from('friendships').insert({ requester_id: viewerId, addressee_id: p.id }));
    } else {
      ({ error } = await sb.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', btn.dataset.friendshipId));
    }
    btn.disabled = false;
    if (error) { showToast(error.message, true); return; }
    showToast(btn.dataset.action === 'request' ? 'Friend request sent!' : 'Friend request accepted!');
    loadSocialActions(p, viewerId, false);
  });
}

function renderProfile(p, crew, isOwnProfile) {
  const title = rankTitleForLevel(p.level);
  const progress = xpProgress(p.xp, p.level);
  const social = p.social_links || {};
  const name = displayNameFor(p);
  const showHandle = name !== p.username;
  const socialLinks = [
    { key: 'youtube', label: 'YouTube' },
    { key: 'twitch', label: 'Twitch' },
    { key: 'twitter', label: 'X' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'discord', label: 'Discord' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'kick', label: 'Kick' },
  ].filter(s => social[s.key]);
  const buildFields = [
    { key: 'fruit', label: 'Fruit', value: p.build_fruit, sub: p.build_fruit_skin },
    { key: 'race', label: 'Race', value: p.build_race },
    { key: 'sword', label: 'Sword', value: p.build_sword },
    { key: 'gun', label: 'Gun', value: p.build_gun },
    { key: 'melee', label: 'Style', value: p.build_melee },
    { key: 'accessory', label: 'Accessory', value: p.build_accessory },
  ].filter(f => f.value);

  const avatarBlock = avatarHtml(p, 130, 'border-radius:50%;');
  const presence = presenceStatus(p.last_active_at);
  const presenceColor = { online: 'var(--sea)', idle: 'var(--brass-bright)', offline: 'var(--ash)' }[presence];

  return `
    <div class="profile-hero">
      <div class="profile-hero-banner-wrap">
        ${p.banner_url ? `<img src="${p.banner_url}" alt="" loading="lazy" onerror="this.remove();">` : ''}
        <div class="profile-hero-actions">
          ${socialLinks.map(s => `<a href="${safeUrl(social[s.key])}" target="_blank" rel="noopener noreferrer" class="profile-hero-icon-btn" title="${s.label}" aria-label="${s.label}">${SOCIAL_ICONS[s.key] || ''}</a>`).join('')}
          ${p.roblox_username ? `
            <a href="https://www.roblox.com/users/profile?username=${encodeURIComponent(p.roblox_username)}" target="_blank" rel="noopener noreferrer" class="profile-hero-icon-btn profile-hero-roblox-btn" title="Roblox: ${escapeHtml(p.roblox_username)}${p.roblox_verified ? ' (verified)' : ''}" aria-label="View on Roblox">
              ${SOCIAL_ICONS.roblox}
              ${p.roblox_verified ? '<i data-lucide="badge-check" class="icon-sm profile-hero-verified-badge"></i>' : ''}
            </a>
          ` : ''}
          <button type="button" id="profile-copy-link" class="profile-hero-icon-btn" title="Copy profile link" aria-label="Copy profile link"><i data-lucide="link" class="icon-sm"></i></button>
          ${!isOwnProfile ? `<button type="button" id="profile-report" class="profile-hero-icon-btn" title="Report this profile" aria-label="Report this profile"><i data-lucide="flag" class="icon-sm"></i></button>` : ''}
        </div>
        <div class="profile-hero-overlay-info">
          <div class="profile-hero-name-row">
            <h1 class="profile-hero-name" style="${p.name_gradient ? titleColorStyle(p.name_gradient) : ''}">${escapeHtml(name)}</h1>
            ${titleBadge(p)}
          </div>
          <p class="profile-hero-rank-title">${title}${showHandle ? ` <span class="profile-hero-handle">· @${escapeHtml(p.username)}</span>` : ''}</p>
          ${p.status_line ? `<span class="profile-hero-status"><i data-lucide="message-circle" class="icon-sm"></i>${escapeHtml(p.status_line)}</span>` : ''}
          <div class="profile-hero-meta">
            <span class="profile-hero-meta-dot" style="background:${presenceColor};"></span>
            <span>${escapeHtml(lastSeenLabel(p.last_active_at))}</span>
            <span id="follow-counts"></span>
            ${p.region ? `<span class="profile-hero-sep">·</span><span>${escapeHtml(p.region)}</span>` : ''}
            <span class="profile-hero-sep">·</span><span>Member since ${formatDate(p.created_at)}</span>
            ${p.current_streak > 0 ? `<span class="profile-hero-sep">·</span><span><i data-lucide="flame" class="icon-sm icon-inline" style="color:var(--brass-bright);"></i>${p.current_streak}-day streak</span>` : ''}
          </div>
        </div>
      </div>
      <div class="profile-hero-body">
        <div class="profile-hero-avatar-wrap">
          ${avatarBlock}
          <span class="profile-hero-level-pill">Lv${p.level}</span>
        </div>
        <div class="profile-hero-body-content">
          <div id="social-actions" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
          ${crew ? `<a href="/crew/?name=${encodeURIComponent(crew.name)}" class="profile-hero-crew-chip">
            ${crew.logo_url ? `<img src="${crew.logo_url}" alt="" loading="lazy" style="width:20px; height:20px; border-radius:5px; object-fit:cover;" onerror="this.style.display='none';">` : '<i data-lucide=\"shield\" class=\"icon-sm\" style=\"color:var(--ash);\"></i>'}
            <span class="info-chip-label">Crew</span><span class="info-chip-value">${crew.tag ? `[${escapeHtml(crew.tag)}] ` : ''}${escapeHtml(crew.name)}</span>
            <i data-lucide="chevron-right" class="icon-sm"></i>
          </a>` : ''}
          <div class="profile-hero-xp-row">
            <span class="profile-hero-xp-level">LEVEL ${p.level}</span>
            <div class="xp-bar"><div class="xp-bar-fill" style="width:${progress.pct}%;"></div></div>
            <span class="profile-hero-xp-label">${progress.current}/${progress.needed} XP</span>
          </div>
        </div>
      </div>
    </div>

    ${p.bio ? `
      <div class="panel" style="margin-top:20px;">
        <p style="margin:0; white-space:pre-wrap;">${escapeHtml(p.bio)}</p>
      </div>
    ` : ''}

    <div class="grid" style="margin-top:20px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Pirate Bounty</p>
        <p class="stat-number" style="margin:0; font-family:var(--font-stamp); font-size:1.3rem; color:var(--brass-bright);">${formatBounty(p.pirate_bounty)}</p>
      </div>
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Marine Bounty</p>
        <p class="stat-number" style="margin:0; font-family:var(--font-stamp); font-size:1.3rem; color:var(--brass-bright);">${formatBounty(p.marine_bounty)}</p>
      </div>
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Likes Received</p>
        <p style="margin:0; font-family:var(--font-stamp); font-size:1.3rem; color:var(--brass-bright);" id="player-likes-total"><span class="skeleton" style="display:inline-block; width:40px; height:18px;"></span></p>
      </div>
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Reputation</p>
        <p style="margin:0; font-size:1.1rem;" id="player-reputation-stat"><span class="skeleton" style="display:inline-block; width:40px; height:18px;"></span></p>
      </div>
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">PvP Record</p>
        <p style="margin:0; font-family:var(--font-stamp); font-size:1.3rem;"><span style="color:#34d399;">${p.pvp_wins ?? 0}W</span> <span class="muted" style="font-size:0.9rem;">—</span> <span style="color:var(--blood-dim);">${p.pvp_losses ?? 0}L</span></p>
        ${(p.pvp_wins ?? 0) + (p.pvp_losses ?? 0) >= 3 ? `<p class="muted" style="margin:2px 0 0; font-size:0.76rem;">${p.pvp_rating ?? 1000} rating</p>` : ''}
      </div>
    </div>

    <div id="player-pvp-history-section" style="display:none; margin-top:20px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="crosshair" class="icon-sm icon-inline"></i>Combat Record</p>
      <div id="player-pvp-history-list" style="display:flex; flex-direction:column; gap:6px;"></div>
    </div>

    ${buildFields.length ? `
      <div style="margin-top:20px;">
        <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Build</p>
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));">
          ${buildFields.map(f => renderBuildItem(f)).join('')}
        </div>
      </div>
    ` : ''}

    <div id="player-achievements-section" style="display:none; margin-top:20px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="award" class="icon-sm icon-inline"></i>Achievements</p>
      <div id="player-achievements" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap:14px;"></div>
    </div>

    <div style="margin-top:20px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="shield-check" class="icon-sm icon-inline"></i>Reputation & Vouches</p>
      <p class="muted" style="margin:-6px 0 12px; font-size:0.78rem;">Left by other traders after a deal. Not verified against an actual trade — use judgment, not just the number.</p>
      ${!isOwnProfile ? `
        <div class="panel panel-plain" id="vouch-form-panel" style="padding:14px 16px; margin-bottom:14px; display:none;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div class="tp-vote-widget" id="vouch-direction-widget">
              <button type="button" class="tp-vote-btn" data-vouch-dir="1" aria-label="Positive vouch"><i data-lucide="thumbs-up" class="icon-sm"></i></button>
              <button type="button" class="tp-vote-btn" data-vouch-dir="-1" aria-label="Negative vouch"><i data-lucide="thumbs-down" class="icon-sm"></i></button>
            </div>
            <input type="text" id="vouch-comment" placeholder="Optional note, e.g. 'smooth trade, fast'" maxlength="120" style="flex:1; min-width:180px; margin:0;">
            <button type="button" class="btn btn-primary btn-sm" id="vouch-submit-btn" disabled>Submit</button>
          </div>
        </div>
      ` : ''}
      <div id="vouch-list" style="display:flex; flex-direction:column; gap:10px;"></div>
    </div>

    <div id="player-trades-section" style="display:none; margin-top:28px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="repeat" class="icon-sm icon-inline"></i>Active Trade Listings</p>
      <div id="player-trades" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));"></div>
    </div>

    <div id="player-combos-section" style="display:none; margin-top:28px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="flame" class="icon-sm icon-inline"></i>Combos</p>
      <div id="player-combos" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));"></div>
    </div>

    <div id="player-services-section" style="display:none; margin-top:28px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="swords" class="icon-sm icon-inline"></i>Services</p>
      <div id="player-services" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));"></div>
    </div>

    <div id="player-sea-events-section" style="display:none; margin-top:28px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="waves" class="icon-sm icon-inline"></i>Sea Events</p>
      <div id="player-sea-events" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));"></div>
    </div>

    <div id="player-giveaways-section" style="display:none; margin-top:28px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="gift" class="icon-sm icon-inline"></i>Giveaways Created</p>
      <div id="player-giveaways" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));"></div>
    </div>

    <div id="player-activity-section" style="display:none; margin-top:28px;">
      <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;"><i data-lucide="activity" class="icon-sm icon-inline"></i>Activity</p>
      <div class="panel panel-plain" style="padding:20px 20px 4px;">
        <div id="player-activity-list" class="activity-timeline"></div>
        <button type="button" id="player-activity-more" class="btn btn-ghost btn-sm btn-block" style="display:none; margin:4px 0 16px;">Load More</button>
      </div>
    </div>
  `;
}

async function loadPlayerTradeListings(userId) {
  const section = document.getElementById('player-trades-section');
  const container = document.getElementById('player-trades');
  const { data } = await sb.from('trade_listings').select('id, offering_item_ids, requesting_item_ids, created_at').eq('user_id', userId).eq('active', true).order('created_at', { ascending: false });

  if (!data || !data.length) return;
  section.style.display = 'block';

  const allIds = [...new Set(data.flatMap(t => [...t.offering_item_ids, ...t.requesting_item_ids]).map(e => e.id))];
  const { data: items } = await sb.from('bf_items').select('id, name, icon_url').in('id', allIds);
  const tinyTile = entry => {
    const item = (items || []).find(i => i.id === entry.id);
    return item ? `<img src="${item.icon_url}" alt="${escapeHtml(item.name)}" title="${escapeHtml(item.name)} (${entry.valueType})" loading="lazy" style="width:32px; height:32px; object-fit:contain; background:var(--navy); border-radius:6px; padding:3px; border:1px solid var(--glass-border);">` : '';
  };

  container.innerHTML = data.map(t => `
    <a href="/trading/#${t.id}" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between" style="align-items:center;">
        <div style="display:flex; gap:4px;">${t.offering_item_ids.map(tinyTile).join('')}</div>
        <i data-lucide="arrow-right" class="icon-sm muted"></i>
        <div style="display:flex; gap:4px;">${t.requesting_item_ids.map(tinyTile).join('')}</div>
      </div>
      <p class="muted" style="margin:10px 0 0; font-size:0.72rem;">${timeAgo(t.created_at)}</p>
    </a>
  `).join('');
  refreshIcons();
}

async function loadPlayerCombos(userId) {
  const section = document.getElementById('player-combos-section');
  const container = document.getElementById('player-combos');
  const { data } = await sb.from('combos').select('id, title, difficulty, steps, created_at').eq('created_by', userId).order('created_at', { ascending: false });

  if (!data || !data.length) return;
  section.style.display = 'block';

  container.innerHTML = data.map(c => `
    <div class="panel">
      <div class="flex-between">
        <h3 style="margin:0; font-size:0.95rem;">${escapeHtml(c.title)}</h3>
        <span class="tag tag-${c.difficulty}">${c.difficulty}</span>
      </div>
      <div style="display:flex; gap:4px; margin-top:10px;">
        ${(c.steps || []).map(s => {
          const opt = (BUILD_OPTIONS[s.category] || []).find(o => o.value === s.item);
          return opt ? `<img src="${opt.icon}" alt="${escapeHtml(s.item)}" title="${escapeHtml(s.item)}" loading="lazy" style="width:30px; height:30px; object-fit:contain; background:var(--navy); border-radius:6px; padding:3px; border:1px solid var(--glass-border);">` : '';
        }).join('')}
      </div>
    </div>
  `).join('');
}

async function loadPlayerServices(userId) {
  const section = document.getElementById('player-services-section');
  const container = document.getElementById('player-services');
  const { data } = await sb.from('service_listings').select('id, category, title, status, created_at').eq('user_id', userId).order('created_at', { ascending: false });

  if (!data || !data.length) return;
  section.style.display = 'block';

  container.innerHTML = data.map(s => `
    <a href="/services/#${s.id}" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span class="muted" style="font-size:0.72rem; text-transform:capitalize;">${escapeHtml(s.category)}</span>
        <span class="tag" style="text-transform:capitalize;">${escapeHtml(s.status)}</span>
      </div>
      <h3 style="margin:8px 0 0; font-size:0.95rem;">${escapeHtml(s.title)}</h3>
      <p class="muted" style="margin:6px 0 0; font-size:0.72rem;">${timeAgo(s.created_at)}</p>
    </a>
  `).join('');
}

async function loadPlayerSeaEvents(userId) {
  const section = document.getElementById('player-sea-events-section');
  const container = document.getElementById('player-sea-events');
  const { data } = await sb.from('sea_events').select('id, type, created_at, expires_at').eq('host_id', userId).order('created_at', { ascending: false });

  if (!data || !data.length) return;
  section.style.display = 'block';

  container.innerHTML = data.map(e => `
    <a href="/sea-events/" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span style="font-size:0.95rem; font-weight:600; text-transform:capitalize;">${escapeHtml((e.type || '').replace(/_/g, ' '))}</span>
        <span class="muted" style="font-size:0.72rem;">${new Date(e.expires_at) > new Date() ? 'Live' : 'Expired'}</span>
      </div>
      <p class="muted" style="margin:8px 0 0; font-size:0.72rem;">${timeAgo(e.created_at)}</p>
    </a>
  `).join('');
}

async function loadPlayerGiveaways(userId, viewerId) {
  const section = document.getElementById('player-giveaways-section');
  const container = document.getElementById('player-giveaways');
  const { data } = await sb.from('giveaways').select('id, title, status, created_at').eq('created_by', userId).order('created_at', { ascending: false });

  if (!data || !data.length) return;
  section.style.display = 'block';

  container.innerHTML = data.map(g => `
    <a href="/giveaways/" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <h3 style="margin:0; font-size:0.95rem;">${escapeHtml(g.title)}</h3>
        <span class="tag" style="text-transform:capitalize;">${escapeHtml(g.status)}</span>
      </div>
      <p class="muted" style="margin:8px 0 0; font-size:0.72rem;">${timeAgo(g.created_at)}</p>
    </a>
  `).join('');
}

async function loadPlayerLikesTotal(userId) {
  const el = document.getElementById('player-likes-total');
  const { data: myCombos } = await sb.from('combos').select('id').eq('created_by', userId);
  const comboIds = (myCombos || []).map(c => c.id);
  let total = 0;
  if (comboIds.length) {
    const { count } = await sb.from('combo_votes').select('*', { count: 'exact', head: true }).in('combo_id', comboIds).eq('vote', 1);
    total = count || 0;
  }
  if (el) el.textContent = total;
}

function renderBuildItem(field) {
  const icon = (field.key === 'fruit' && field.sub && fruitSkinIconMap[field.sub]) || findBuildIcon(field.key, field.value);
  return `
    <div class="panel" style="padding:14px; text-align:center;">
      ${icon ? `<img src="${icon}" alt="${escapeHtml(field.value)}" loading="lazy" style="width:48px; height:48px; object-fit:contain; margin-bottom:8px;">` : ''}
      <p class="muted" style="margin:0 0 2px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">${field.label}</p>
      <p style="margin:0; font-size:0.85rem; font-weight:600;">${escapeHtml(field.value)}</p>
      ${field.sub ? `<p class="muted" style="margin:2px 0 0; font-size:0.72rem;">${escapeHtml(field.sub)} skin</p>` : ''}
    </div>
  `;
}

function findBuildIcon(key, value) {
  const match = (BUILD_OPTIONS[key] || []).find(opt => opt.value === value);
  return match ? match.icon : null;
}

const ACHIEVEMENT_TIER_COLORS = {
  // hex + matching r,g,b triple — this site avoids CSS relative-color syntax (rgb(from ...))
  // for browser-support reasons, using the same "var(--x-rgb) / alpha" pattern everywhere else.
  bronze: { hex: '#c9885f', rgb: '201, 136, 95' },
  silver: { hex: '#b8c2cc', rgb: '184, 194, 204' },
  gold: { hex: '#d4af6a', rgb: '212, 175, 106' },
  platinum: { hex: '#8fd6e8', rgb: '143, 214, 232' },
};

async function loadPlayerAchievements(userId) {
  const section = document.getElementById('player-achievements-section');
  const container = document.getElementById('player-achievements');

  const { data } = await sb
    .from('user_achievements')
    .select('earned_at, achievements(name, description, icon, tier)')
    .eq('user_id', userId)
    .order('earned_at', { ascending: true });

  if (!data?.length) return; // no badge shelf at all for a player with none yet — not an error state
  section.style.display = 'block';

  container.innerHTML = data.map(({ achievements: a, earned_at }) => {
    const color = ACHIEVEMENT_TIER_COLORS[a.tier] || { hex: 'var(--brass-bright)', rgb: 'var(--brass-rgb)' };
    return `
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center;" title="${escapeHtml(a.description)} — earned ${new Date(earned_at).toLocaleDateString()}">
        <div style="width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgb(${color.rgb} / 0.14); border:2px solid ${color.hex};">
          <i data-lucide="${a.icon}" class="icon-md" style="color:${color.hex};"></i>
        </div>
        <span style="font-size:0.72rem; color:var(--ash); line-height:1.2;">${escapeHtml(a.name)}</span>
      </div>
    `;
  }).join('');
  refreshIcons();
}

const ACTIVITY_PAGE_SIZE = 12;
const ACTIVITY_TYPE_META = {
  challenge_approved: { icon: 'check-circle', color: 'var(--sea)', verb: 'Completed' },
  rank_up: { icon: 'star', color: 'var(--brass-bright)', verb: 'Ranked up to' },
  giveaway_win: { icon: 'gift', color: 'var(--gold)', verb: 'Won' },
};
let _activityUserId = null;
let _activityOffset = 0;

async function loadPlayerActivity(userId) {
  _activityUserId = userId;
  _activityOffset = 0;
  document.getElementById('player-activity-list').innerHTML = '';
  document.getElementById('player-activity-more').addEventListener('click', () => loadActivityPage());
  await loadActivityPage();
}

async function loadActivityPage() {
  const section = document.getElementById('player-activity-section');
  const list = document.getElementById('player-activity-list');
  const moreBtn = document.getElementById('player-activity-more');

  const { data } = await sb
    .from('activity_log')
    .select('id, type, detail, xp_awarded, created_at')
    .eq('user_id', _activityUserId)
    .order('created_at', { ascending: false })
    .range(_activityOffset, _activityOffset + ACTIVITY_PAGE_SIZE - 1);

  if (!data?.length) {
    moreBtn.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  list.insertAdjacentHTML('beforeend', data.map(renderActivityTimelineRow).join(''));
  refreshIcons();

  _activityOffset += data.length;
  moreBtn.style.display = data.length === ACTIVITY_PAGE_SIZE ? 'block' : 'none';
}

function renderActivityTimelineRow(a) {
  const meta = ACTIVITY_TYPE_META[a.type] || { icon: 'circle', color: 'var(--ash)', verb: 'Did something with' };
  return `
    <div class="activity-timeline-row">
      <span class="activity-timeline-dot" style="background:${meta.color};"><i data-lucide="${meta.icon}" class="icon-sm"></i></span>
      <div class="activity-timeline-content">
        <p style="margin:0; font-size:0.86rem;">${meta.verb} <span style="color:var(--brass-bright); font-weight:600;">${escapeHtml(a.detail)}</span>${a.xp_awarded ? ` <span class="muted">· +${a.xp_awarded} XP</span>` : ''}</p>
        <span class="muted" style="font-size:0.74rem; font-family:var(--font-mono);">${timeAgo(a.created_at)}</span>
      </div>
    </div>
  `;
}

// --- Reputation / vouches -------------------------------------------------

async function loadPlayerVouches(profileId, viewerId, isOwnProfile) {
  const [{ data: rep }, { data: vouches }] = await Promise.all([
    sb.rpc('get_reputation', { p_user_id: profileId }),
    sb.from('vouches').select('id, direction, comment, created_at, voucher_id, profiles!vouches_voucher_id_fkey(username, display_name, avatar_url)').eq('target_id', profileId).order('created_at', { ascending: false }).limit(30),
  ]);

  const positive = rep?.[0]?.positive || 0;
  const negative = rep?.[0]?.negative || 0;
  const statEl = document.getElementById('player-reputation-stat');
  if (statEl) {
    statEl.innerHTML = (positive + negative) === 0
      ? `<span class="muted" style="font-size:0.85rem;">No vouches yet</span>`
      : `<span style="color:var(--gold-bright);"><i data-lucide="thumbs-up" class="icon-sm icon-inline"></i>${positive}</span> &nbsp; <span style="color:${negative ? 'var(--blood-dim)' : 'var(--ash)'};"><i data-lucide="thumbs-down" class="icon-sm icon-inline"></i>${negative}</span>`;
    refreshIcons();
  }

  const listEl = document.getElementById('vouch-list');
  if (listEl) {
    listEl.innerHTML = (vouches && vouches.length)
      ? vouches.map(v => {
          const voucher = v.profiles || {};
          return `
            <div class="panel panel-plain" style="padding:10px 14px; display:flex; align-items:flex-start; gap:10px;">
              ${avatarHtml(voucher, 26)}
              <div style="flex:1; min-width:0;">
                <p style="margin:0; font-size:0.85rem;">
                  <a href="/player/?u=${encodeURIComponent(voucher.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(displayNameFor(voucher))}</a>
                  <i data-lucide="${v.direction === 1 ? 'thumbs-up' : 'thumbs-down'}" class="icon-sm icon-inline" style="color:${v.direction === 1 ? 'var(--gold-bright)' : 'var(--blood-dim)'};"></i>
                </p>
                ${v.comment ? `<p class="muted" style="margin:2px 0 0; font-size:0.82rem;">${escapeHtml(v.comment)}</p>` : ''}
              </div>
              <span class="muted" style="font-size:0.72rem; flex-shrink:0;">${timeAgo(v.created_at)}</span>
              ${viewerId && viewerId !== v.voucher_id ? `<button class="btn btn-ghost btn-sm" data-report-vouch="${v.id}" title="Report this vouch" aria-label="Report this vouch" style="flex-shrink:0;"><i data-lucide="flag" class="icon-sm"></i></button>` : ''}
            </div>
          `;
        }).join('')
      : `<p class="muted" style="font-size:0.85rem;">No vouches yet.</p>`;
    refreshIcons();
    listEl.querySelectorAll('[data-report-vouch]').forEach(btn => {
      btn.addEventListener('click', () => reportContent('vouch', btn.dataset.reportVouch));
    });
  }

  if (isOwnProfile || !viewerId) return;

  const formPanel = document.getElementById('vouch-form-panel');
  if (!formPanel) return;
  formPanel.style.display = 'block';

  const { data: mine } = await sb.from('vouches').select('direction, comment').eq('voucher_id', viewerId).eq('target_id', profileId).maybeSingle();
  let dir = mine?.direction || null;
  const commentInput = document.getElementById('vouch-comment');
  const submitBtn = document.getElementById('vouch-submit-btn');
  commentInput.value = mine?.comment || '';

  const widget = document.getElementById('vouch-direction-widget');
  const syncButtons = () => {
    widget.querySelectorAll('[data-vouch-dir]').forEach(btn => {
      const btnDir = Number(btn.dataset.vouchDir);
      btn.classList.toggle('active-up', dir === 1 && btnDir === 1);
      btn.classList.toggle('active-down', dir === -1 && btnDir === -1);
    });
    submitBtn.disabled = !dir;
    submitBtn.textContent = mine ? 'Update Vouch' : 'Submit';
  };
  syncButtons();

  widget.querySelectorAll('[data-vouch-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      dir = Number(btn.dataset.vouchDir);
      syncButtons();
    });
  });

  submitBtn.addEventListener('click', async () => {
    if (!dir) return;
    if (dir === -1 && !commentInput.value.trim()) {
      showToast('Negative vouches need a short note explaining why.', true);
      commentInput.focus();
      return;
    }
    submitBtn.disabled = true;
    const { error } = await sb.from('vouches').upsert({
      voucher_id: viewerId,
      target_id: profileId,
      direction: dir,
      comment: commentInput.value.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'voucher_id,target_id' });
    submitBtn.disabled = false;
    if (error) {
      const msg = error.message.includes('24 hours old')
        ? "Your account needs to be at least 24 hours old to leave a vouch."
        : error.message.includes('5 vouches per day')
          ? "You've hit the daily limit of 5 vouches — try again tomorrow."
          : error.message;
      showToast(msg, true);
      return;
    }
    showToast('Vouch saved.');
    loadPlayerVouches(profileId, viewerId, isOwnProfile);
  });
}

async function loadPlayerPvpHistory(userId) {
  const section = document.getElementById('player-pvp-history-section');
  const list = document.getElementById('player-pvp-history-list');

  const [{ data: matches }, { data: championships }, { data: finalsLosses }] = await Promise.all([
    sb.from('pvp_results')
      .select('id, match_type, host_id, opponent_id, host_won, created_at, host:profiles!pvp_results_host_id_fkey(username, display_name), opponent:profiles!pvp_results_opponent_id_fkey(username, display_name)')
      .eq('status', 'approved')
      .or(`host_id.eq.${userId},opponent_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(10),
    // Tournaments this player won outright.
    sb.from('tournaments').select('id, name, created_at').eq('winner_id', userId).order('created_at', { ascending: false }).limit(10),
    // Tournaments this player made the final of but lost (single-elim final, or a
    // double-elim grand final — both are identifiable as "the match with no next_match_id").
    sb.from('tournament_matches')
      .select('id, winner_id, tournaments(id, name, created_at)')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .is('next_match_id', null)
      .eq('status', 'confirmed')
      .not('winner_id', 'is', null)
      .neq('winner_id', userId)
      .limit(10),
  ]);

  const feed = [
    ...(matches || []).map(r => ({ type: 'pvp', sortAt: r.created_at, data: r })),
    ...(championships || []).map(t => ({ type: 'champion', sortAt: t.created_at, data: t })),
    ...(finalsLosses || []).filter(m => m.tournaments).map(m => ({ type: 'runner_up', sortAt: m.tournaments.created_at, data: m.tournaments })),
  ].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt)).slice(0, 12);

  if (!feed.length) return; // section stays hidden — no history yet, nothing to show

  section.style.display = 'block';
  list.innerHTML = feed.map(entry => {
    if (entry.type === 'champion') {
      return `
        <div class="flex-between" style="padding:8px 10px; background:rgb(var(--brass-rgb) / 0.08); border-radius:6px; font-size:0.84rem;">
          <span><i data-lucide="crown" class="icon-sm icon-inline" style="color:var(--brass-bright);"></i><span style="font-weight:700; color:var(--brass-bright);">CHAMPION</span><span class="muted"> — ${escapeHtml(entry.data.name)}</span></span>
          <span class="muted" style="font-size:0.76rem;">${timeAgo(entry.sortAt)}</span>
        </div>
      `;
    }
    if (entry.type === 'runner_up') {
      return `
        <div class="flex-between" style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:6px; font-size:0.84rem;">
          <span><i data-lucide="medal" class="icon-sm icon-inline" style="color:var(--ash);"></i><span style="font-weight:700;">RUNNER-UP</span><span class="muted"> — ${escapeHtml(entry.data.name)}</span></span>
          <span class="muted" style="font-size:0.76rem;">${timeAgo(entry.sortAt)}</span>
        </div>
      `;
    }
    const r = entry.data;
    const isHost = r.host_id === userId;
    const won = isHost ? r.host_won : !r.host_won;
    const opponentProfile = isHost ? r.opponent : r.host;
    const opponentLabel = opponentProfile ? displayNameFor(opponentProfile) : 'a team';
    return `
      <div class="flex-between" style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:6px; font-size:0.84rem;">
        <span>
          <span style="font-weight:700; color:${won ? '#34d399' : 'var(--blood-dim)'};">${won ? 'WIN' : 'LOSS'}</span>
          <span class="muted"> vs ${escapeHtml(opponentLabel)} · ${escapeHtml(r.match_type)}</span>
        </span>
        <span class="muted" style="font-size:0.76rem;">${timeAgo(r.created_at)}</span>
      </div>
    `;
  }).join('');
  refreshIcons();
}
