// BloxCore — dashboard.html logic

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAuth();
  if (!auth) return;
  const { user, profile } = auth;

  const { data: membership } = await sb.from('crew_members').select('crews(name, tag)').eq('user_id', user.id).maybeSingle();

  renderProfileCard(profile, membership?.crews);
  await loadSubmissions(user.id);
});

function renderProfileCard(profile, crew) {
  const card = document.getElementById('profile-card');
  const title = rankTitleForLevel(profile.level);
  const progress = xpProgress(profile.xp, profile.level);
  const streak = profile.current_streak || 0;
  const avatarHtmlStr = avatarHtml(profile, 76, 'border:2px solid var(--brass);');

  card.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; flex-shrink:0;">
      <div style="position:relative;">
        ${avatarHtmlStr}
        <span style="position:absolute; bottom:-4px; right:-4px; background:linear-gradient(135deg, var(--brass), var(--gold)); color:#1a0a06; font-family:var(--font-stamp); font-weight:700; font-size:0.72rem; padding:2px 7px; border-radius:999px; border:2px solid var(--ink); box-shadow:0 2px 8px rgb(var(--shadow-rgb) / 0.4);">Lv${profile.level}</span>
      </div>
      <p class="rank-title" style="margin:2px 0 0; font-size:1.1rem;">${title}</p>
    </div>
    <div style="flex:1; min-width:220px; padding-bottom:38px;">
      <div class="flex-between" style="align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${titleBadge(profile)}
          <p style="margin:0; font-size:1.5rem; font-weight:700; color:var(--bone);">${escapeHtml(displayNameFor(profile))}</p>
        </div>
        <div style="display:flex; gap:8px;">
          <a href="/player/?u=${encodeURIComponent(profile.username)}" class="btn btn-ghost btn-sm">View Public</a>
          <a href="/profile/" class="btn btn-primary btn-sm">Edit Profile</a>
        </div>
      </div>
      <div class="flex-between" style="align-items:baseline; margin-top:16px;">
        <span class="muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em;">Experience</span>
        <p class="muted" style="font-family:var(--font-mono); font-size:0.85rem; margin:0;">
          ${progress.current} / ${progress.needed} XP
        </p>
      </div>
      <div class="xp-bar" style="margin-top:4px;"><div class="xp-bar-fill" style="width:${progress.pct}%;"></div></div>
      <div class="flex-between" style="margin-top:16px; padding-top:14px; border-top:1px solid var(--glass-border);">
        <p class="muted" style="margin:0; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
          <i data-lucide="users" class="icon-sm"></i>
          ${crew ? `<a href="/crew/?name=${encodeURIComponent(crew.name)}" style="color:var(--brass-bright); font-weight:600;">${crew.tag ? `[${escapeHtml(crew.tag)}] ` : ''}${escapeHtml(crew.name)}</a>` : "You're not in a crew yet."}
        </p>
        ${crew ? '' : `<a href="/crews/" class="btn btn-ghost btn-sm">Find a Crew</a>`}
      </div>
      <div style="position:absolute; bottom:20px; right:28px; text-align:right;">
        <span class="info-chip">
          <i data-lucide="flame" class="icon-sm" style="color:${streak > 0 ? 'var(--brass-bright)' : 'var(--ash)'};"></i>
          <span class="info-chip-value" style="color:${streak > 0 ? 'var(--brass-bright)' : 'var(--ash)'};">${streak}-day streak</span>
          ${streakBonusLabel(streak) ? `<span style="color:var(--gold); font-size:0.72rem; font-weight:700;">${streakBonusLabel(streak)}</span>` : ''}
        </span>
        <p class="muted" style="margin:2px 6px 0 0; font-size:0.72rem;">Best: ${profile.longest_streak || 0} days</p>
      </div>
    </div>
  `;
  refreshIcons();
}

function streakBonusLabel(streak) {
  if (streak >= 30) return '+50% XP';
  if (streak >= 7) return '+25% XP';
  if (streak >= 3) return '+10% XP';
  return '';
}

async function loadSubmissions(userId) {
  const list = document.getElementById('submissions-list');

  const { data, error } = await sb
    .from('submissions')
    .select('id, status, submitted_at, admin_note, challenges(title, xp_reward, difficulty)')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load your submissions right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>No bounties claimed yet.</p>
        <a href="/challenges/" class="btn btn-primary" style="margin-top:12px;">Browse Challenges</a>
      </div>`;
    return;
  }

  list.innerHTML = data.map(renderSubmissionCard).join('');
  refreshIcons();
}

function renderSubmissionCard(sub) {
  const statusClass = sub.status === 'approved' ? 'stamp-approved' : sub.status === 'rejected' ? 'stamp-rejected' : '';
  const statusColor = sub.status === 'approved' ? 'var(--sea)' : sub.status === 'rejected' ? 'var(--blood)' : 'var(--brass)';
  return `
    <div class="panel" style="display:flex; gap:16px; align-items:flex-start;">
      <div class="stamp ${statusClass}" style="width:56px; height:56px; transform: rotate(-6deg);">
        <span class="stamp-label" style="font-size:0.52rem;">${sub.status.toUpperCase()}</span>
      </div>
      <div style="flex:1;">
        <p style="margin:0 0 4px; font-weight:700;">${escapeHtml(sub.challenges?.title || 'Challenge')}</p>
        <p class="muted" style="margin:0 0 6px; font-size:0.82rem;">${formatDate(sub.submitted_at)} · +${sub.challenges?.xp_reward ?? 0} XP</p>
        ${sub.admin_note ? `<p style="margin:0; font-size:0.85rem; color:${statusColor};">"${escapeHtml(sub.admin_note)}"</p>` : ''}
      </div>
    </div>
  `;
}
