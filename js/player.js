// BloxCore — player/index.html logic (public profile view)

document.addEventListener('DOMContentLoaded', loadPlayer);

async function loadPlayer() {
  const content = document.getElementById('player-content');
  const params = new URLSearchParams(window.location.search);
  const username = params.get('u');

  if (!username) {
    content.innerHTML = `<div class="empty-state">No player specified. Try a link from the leaderboard instead.</div>`;
    return;
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*, titles(name, color)')
    .eq('username', username)
    .single();

  if (error || !profile) {
    content.innerHTML = `<div class="empty-state">Couldn't find a pirate named "${escapeHtml(username)}".</div>`;
    return;
  }

  const { data: membership } = await sb.from('crew_members').select('crews(name, tag, logo_url)').eq('user_id', profile.id).maybeSingle();

  document.title = `${displayNameFor(profile)} — BloxCore`;
  content.innerHTML = renderProfile(profile, membership?.crews);
  refreshIcons();
}

function renderProfile(p, crew) {
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
  ].filter(s => social[s.key]);

  const buildFields = [
    { key: 'fruit', label: 'Fruit', value: p.build_fruit },
    { key: 'race', label: 'Race', value: p.build_race },
    { key: 'sword', label: 'Sword', value: p.build_sword },
    { key: 'gun', label: 'Gun', value: p.build_gun },
    { key: 'melee', label: 'Style', value: p.build_melee },
    { key: 'accessory', label: 'Accessory', value: p.build_accessory },
  ].filter(f => f.value);

  const avatarBlock = avatarHtml(p, 76, 'border:2px solid var(--brass);');

  return `
    <div class="panel" style="display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap;">
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px; flex-shrink:0;">
        <div style="position:relative;">
          ${avatarBlock}
          <span style="position:absolute; bottom:-4px; right:-4px; background:linear-gradient(135deg, var(--brass), var(--gold)); color:#1a0a06; font-family:var(--font-stamp); font-weight:700; font-size:0.72rem; padding:2px 7px; border-radius:999px; border:2px solid var(--ink); box-shadow:0 2px 8px rgb(var(--shadow-rgb) / 0.4);">Lv${p.level}</span>
        </div>
        <p class="rank-title" style="margin:2px 0 0; font-size:1.1rem;">${title}</p>
      </div>
      <div style="flex:1; min-width:220px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${titleBadge(p)}
          <p style="margin:0; font-size:1.5rem; font-weight:700; color:var(--bone);">${escapeHtml(name)}</p>
        </div>
        ${showHandle ? `<p class="muted" style="margin:2px 0 0; font-size:0.8rem;">@${escapeHtml(p.username)}</p>` : ''}
        ${crew ? `<a href="/crew/?name=${encodeURIComponent(crew.name)}" class="info-chip" style="text-decoration:none; margin-top:10px;">
          ${crew.logo_url ? `<img src="${crew.logo_url}" alt="" style="width:16px; height:16px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none';">` : ''}
          <span class="info-chip-label">Crew</span><span class="info-chip-value">${crew.tag ? `[${escapeHtml(crew.tag)}] ` : ''}${escapeHtml(crew.name)}</span>
        </a>` : ''}
        <div class="xp-bar" style="margin-top:16px;"><div class="xp-bar-fill" style="width:${progress.pct}%;"></div></div>
        <p class="muted" style="margin:8px 0 0; font-size:0.82rem;">
          ${p.region ? `${escapeHtml(p.region)} · ` : ''}Member since ${formatDate(p.created_at)}
          ${p.current_streak > 0 ? ` · <i data-lucide="flame" class="icon-sm" style="color:var(--brass-bright);"></i> ${p.current_streak}-day streak` : ''}
        </p>
      </div>
    </div>

    ${p.bio ? `
      <div class="panel" style="margin-top:20px;">
        <p style="margin:0; white-space:pre-wrap;">${escapeHtml(p.bio)}</p>
      </div>
    ` : ''}

    <div class="grid" style="margin-top:20px;">
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Pirate Bounty</p>
        <p style="margin:0; font-family:var(--font-stamp); font-size:1.3rem; color:var(--brass-bright);">${formatBounty(p.pirate_bounty)}</p>
      </div>
      <div class="panel">
        <p class="muted" style="margin:0 0 6px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Marine Bounty</p>
        <p style="margin:0; font-family:var(--font-stamp); font-size:1.3rem; color:var(--brass-bright);">${formatBounty(p.marine_bounty)}</p>
      </div>
    </div>

    ${buildFields.length ? `
      <div style="margin-top:20px;">
        <p class="muted" style="margin:0 0 10px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Build</p>
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));">
          ${buildFields.map(f => renderBuildItem(f)).join('')}
        </div>
      </div>
    ` : ''}

    ${socialLinks.length ? `
      <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
        ${socialLinks.map(s => `<a href="${escapeHtml(social[s.key])}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="padding:9px 14px; gap:8px;" title="${s.label}" aria-label="${s.label}">${SOCIAL_ICONS[s.key] || ''}${escapeHtml(s.label)}</a>`).join('')}
      </div>
    ` : ''}
  `;
}

function renderBuildItem(field) {
  const icon = findBuildIcon(field.key, field.value);
  return `
    <div class="panel" style="padding:14px; text-align:center;">
      ${icon ? `<img src="${icon}" alt="${escapeHtml(field.value)}" style="width:48px; height:48px; object-fit:contain; margin-bottom:8px;">` : ''}
      <p class="muted" style="margin:0 0 2px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">${field.label}</p>
      <p style="margin:0; font-size:0.85rem; font-weight:600;">${escapeHtml(field.value)}</p>
    </div>
  `;
}

function findBuildIcon(key, value) {
  const match = (BUILD_OPTIONS[key] || []).find(opt => opt.value === value);
  return match ? match.icon : null;
}
