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
    .select('*')
    .eq('username', username)
    .single();

  if (error || !profile) {
    content.innerHTML = `<div class="empty-state">Couldn't find a pirate named "${escapeHtml(username)}".</div>`;
    return;
  }

  document.title = `${profile.username} — BloxCore`;
  content.innerHTML = renderProfile(profile);
}

function renderProfile(p) {
  const title = rankTitleForLevel(p.level);
  const progress = xpProgress(p.xp, p.level);
  const social = p.social_links || {};
  const socialLinks = [
    { key: 'youtube', label: 'YouTube' },
    { key: 'twitch', label: 'Twitch' },
    { key: 'twitter', label: 'X' },
    { key: 'tiktok', label: 'TikTok' },
  ].filter(s => social[s.key]);

  const avatarHtml = p.avatar_url
    ? `<img src="${p.avatar_url}" alt="${escapeHtml(p.username)}" style="width:84px; height:84px; border-radius:50%; object-fit:cover; border:2px solid var(--brass);">`
    : `<div class="stamp" style="width:84px; height:84px; transform:none;"><span style="font-size:1.8rem;">${escapeHtml(p.username[0]?.toUpperCase() || '?')}</span></div>`;

  return `
    <div class="panel" style="display:flex; gap:22px; align-items:center; flex-wrap:wrap;">
      ${avatarHtml}
      <div style="flex:1; min-width:220px;">
        <div class="flex-between" style="align-items:baseline;">
          <div>
            <h1 style="font-size:1.5rem; margin-bottom:2px;">${escapeHtml(p.username)}</h1>
            <p class="rank-title" style="margin:0 0 8px;">${title} · Lv. ${p.level}</p>
          </div>
        </div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${progress.pct}%;"></div></div>
        <p class="muted" style="margin:8px 0 0; font-size:0.82rem;">
          ${p.region ? `${escapeHtml(p.region)} · ` : ''}Member since ${formatDate(p.created_at)}
          ${p.current_streak > 0 ? ` · 🔥 ${p.current_streak}-day streak` : ''}
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

    ${socialLinks.length ? `
      <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
        ${socialLinks.map(s => `<a href="${escapeHtml(social[s.key])}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">${s.label}</a>`).join('')}
      </div>
    ` : ''}
  `;
}
