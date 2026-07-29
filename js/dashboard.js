// BloxCore — dashboard.html logic

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAuth();
  if (!auth) return;
  const { user, profile } = auth;

  renderProfileCard(profile);
  await loadTitlePicker(user.id, profile.active_title_id);
  await loadSubmissions(user.id);
});

function renderProfileCard(profile) {
  const card = document.getElementById('profile-card');
  const title = rankTitleForLevel(profile.level);
  const progress = xpProgress(profile.xp, profile.level);
  const streak = profile.current_streak || 0;

  card.innerHTML = `
    <div class="stamp">
      <span class="stamp-level">${profile.level}</span>
      <span class="stamp-label">Level</span>
    </div>
    <div style="flex:1; min-width:220px;">
      <div class="flex-between" style="align-items:baseline;">
        <div>
          <p class="muted" style="margin:0; font-size:0.85rem;">${escapeHtml(displayNameFor(profile))}${titleBadge(profile)}</p>
          <p class="rank-title" style="margin:2px 0 10px;">${title}</p>
        </div>
        <div style="display:flex; gap:8px;">
          <a href="/player/?u=${encodeURIComponent(profile.username)}" class="btn btn-ghost btn-sm">View Public</a>
          <a href="/profile/" class="btn btn-primary btn-sm">Edit Profile</a>
        </div>
      </div>
      <div class="flex-between" style="align-items:baseline; margin-top:4px;">
        <span></span>
        <p class="muted" style="font-family:var(--font-mono); font-size:0.85rem; margin:0;">
          ${progress.current} / ${progress.needed} XP
        </p>
      </div>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${progress.pct}%;"></div></div>
      <div class="flex-between" style="margin-top:14px;">
        <p style="margin:0; font-family:var(--font-mono); font-size:0.85rem; color:${streak > 0 ? 'var(--brass-bright)' : 'var(--ash)'};">
          🔥 ${streak}-day streak${streakBonusLabel(streak) ? ` · ${streakBonusLabel(streak)}` : ''}
        </p>
        <p class="muted" style="margin:0; font-size:0.78rem;">Best: ${profile.longest_streak || 0} days</p>
      </div>
    </div>
  `;
}

async function loadTitlePicker(userId, activeTitleId) {
  const { data: owned } = await sb.from('user_titles').select('titles(id, name, color)').eq('user_id', userId);
  if (!owned || !owned.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';
  wrapper.style.marginTop = '20px';
  wrapper.innerHTML = `
    <h3 style="font-size:1rem; margin-bottom:12px;">Equipped Title</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap;" id="title-picker-chips"></div>
  `;
  document.getElementById('profile-card').insertAdjacentElement('afterend', wrapper);

  const chips = document.getElementById('title-picker-chips');
  const noneChip = makeChip('None', '#8a94a6', !activeTitleId, () => equipTitle(userId, null));
  chips.appendChild(noneChip);
  owned.forEach(o => {
    const t = o.titles;
    chips.appendChild(makeChip(t.name, t.color, t.id === activeTitleId, () => equipTitle(userId, t.id)));
  });
}

function makeChip(label, color, selected, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm';
  btn.style.border = `1px solid ${color}`;
  btn.style.color = selected ? '#04141d' : color;
  btn.style.background = selected ? color : 'transparent';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function equipTitle(userId, titleId) {
  const { error } = await sb.from('profiles').update({ active_title_id: titleId }).eq('id', userId);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast(titleId ? 'Title equipped.' : 'Title cleared.');
  window.location.reload();
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
