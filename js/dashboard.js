// BloxCore — dashboard.html logic

async function claimPendingReferral(profile) {
  let ref;
  try { ref = localStorage.getItem('bc_pending_ref'); } catch { return; }
  if (!ref) return;

  // Clear immediately regardless of outcome — an invalid/self/already-used code
  // should not keep re-prompting a retry on every future page load.
  try { localStorage.removeItem('bc_pending_ref'); } catch {}
  if (ref === profile.username) return; // can't self-refer

  await sb.rpc('apply_referral', { p_ref_username: ref });
  // Errors (bad code, already referred) are expected/silent here — this runs on
  // every dashboard load, not just right after signup, so it shouldn't surface
  // a toast for something the player never explicitly asked about.
}

function checkRankUpCelebration(profile, userId) {
  const key = `bc_last_seen_level_${userId}`;
  let lastSeen;
  try { lastSeen = localStorage.getItem(key); } catch { return; }

  // No cached value yet — first visit we've tracked this on (new account, or existing
  // account on a new browser). Just start tracking from here rather than celebrating,
  // since we have no real "before" to compare against.
  if (lastSeen === null) {
    try { localStorage.setItem(key, String(profile.level)); } catch {}
    return;
  }

  if (profile.level > Number(lastSeen)) {
    showRankUpCelebration(profile.level);
  }
  try { localStorage.setItem(key, String(profile.level)); } catch {}
}

function showRankUpCelebration(level) {
  const overlay = document.createElement('div');
  overlay.className = 'rankup-overlay';
  overlay.innerHTML = `
    <div class="rankup-card">
      <div class="rankup-burst" aria-hidden="true"></div>
      <p class="rankup-eyebrow">Rank Up</p>
      <p class="rankup-level">Lv. ${level}</p>
      <h2 class="rankup-title">${escapeHtml(rankTitleForLevel(level))}</h2>
      <button type="button" class="btn btn-primary" id="rankup-dismiss">Nice!</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.querySelector('#rankup-dismiss').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  const { user, profile } = auth;

  claimPendingReferral(profile);
  checkRankUpCelebration(profile, user.id);

  if (!profile.onboarded) {
    window.location.href = '/onboarding/';
    return;
  }

  const { data: membership } = await sb.from('crew_members').select('crews(name, tag, logo_url)').eq('user_id', user.id).maybeSingle();
  const settings = await getSiteSettings();

  renderProfileCard(profile, membership?.crews);
  initMyListingsTabs(profile.role);
  await loadSubmissions(user.id);
  await loadMyTradeListings(user.id, settings.maxActiveTrades);
  await loadMyCombos(user.id, settings.maxCombosPerUser);
  await loadMyServices(user.id);
  await loadMySeaEvents(user.id);
  await loadMyPvpMatches(user.id);
  await loadMyTournaments(user.id);
  await loadMyGiveaways(user.id, profile.role);
});

function initMyListingsTabs(role) {
  if (role === 'mod' || role === 'admin') {
    document.getElementById('my-giveaways-tab-btn').style.display = '';
  }
  document.querySelectorAll('#my-listings-tabs [data-my-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#my-listings-tabs [data-my-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-my-panel]').forEach(panel => {
        panel.style.display = panel.dataset.myPanel === btn.dataset.myTab ? '' : 'none';
      });
    });
  });
}

async function loadMyPvpMatches(userId) {
  const container = document.getElementById('my-pvp-list');
  const { data, error } = await sb.from('pvp_matches').select('id, match_type, created_at, expires_at').eq('host_id', userId).order('created_at', { ascending: false });

  if (error || !data) {
    container.innerHTML = `<p class="muted">Couldn't load your matches right now.</p>`;
    return;
  }
  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No matches posted yet. <a href="/pvp/" style="color:var(--brass-bright);">Post one</a>.</div>`;
    return;
  }
  container.innerHTML = data.map(m => `
    <a href="/pvp/" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span style="font-size:0.95rem; font-weight:600;">${escapeHtml(m.match_type)}</span>
        <span class="muted" style="font-size:0.72rem;">${timeAgo(m.created_at)}</span>
      </div>
      <p class="muted" style="margin:8px 0 0; font-size:0.78rem;">${new Date(m.expires_at) > new Date() ? 'Still live' : 'Expired'}</p>
    </a>
  `).join('');
  refreshIcons();
}

async function loadMyTournaments(userId) {
  const container = document.getElementById('my-tournaments-list');
  const { data: regs, error } = await sb.from('tournament_participants')
    .select('joined_at, tournaments(id, name, match_type, status, bracket_size, elimination_type)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="muted">Couldn't load your tournaments right now.</p>`;
    return;
  }
  const regsWithTournament = (regs || []).filter(r => r.tournaments);
  if (!regsWithTournament.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Not registered in any tournaments yet. <a href="/pvp/?tab=tournaments" style="color:var(--brass-bright);">Browse tournaments</a>.</div>`;
    return;
  }

  const TN_LABEL = { registration_open: 'Registration Open', in_progress: 'In Progress', completed: 'Completed' };
  container.innerHTML = regsWithTournament.map(r => `
    <a href="/pvp/?tab=tournaments" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span style="font-size:0.95rem; font-weight:600;">${escapeHtml(r.tournaments.name)}</span>
        <span class="tag tag-medium" style="font-size:0.68rem;">${TN_LABEL[r.tournaments.status]}</span>
      </div>
      <p class="muted" style="margin:8px 0 0; font-size:0.78rem;">${escapeHtml(r.tournaments.match_type)} · ${r.tournaments.bracket_size}-player · ${r.tournaments.elimination_type === 'double' ? 'Double' : 'Single'} Elim</p>
    </a>
  `).join('');
  refreshIcons();
}

async function loadMyServices(userId) {
  const container = document.getElementById('my-services-list');
  const { data, error } = await sb.from('service_listings').select('id, category, title, status, created_at').eq('user_id', userId).order('created_at', { ascending: false });

  if (error || !data) {
    container.innerHTML = `<p class="muted">Couldn't load your services right now.</p>`;
    return;
  }
  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No services posted yet. <a href="/services/" style="color:var(--brass-bright);">Post one</a>.</div>`;
    return;
  }
  container.innerHTML = data.map(s => `
    <a href="/services/#${s.id}" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span class="muted" style="font-size:0.72rem; text-transform:capitalize;">${escapeHtml(s.category)}</span>
        <span class="muted" style="font-size:0.72rem;">${timeAgo(s.created_at)}</span>
      </div>
      <h3 style="margin:8px 0 0; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.title)}</h3>
      <span class="tag" style="margin-top:8px; display:inline-block;">${escapeHtml(s.status)}</span>
    </a>
  `).join('');
  refreshIcons();
}

async function loadMySeaEvents(userId) {
  const container = document.getElementById('my-sea-events-list');
  const { data, error } = await sb.from('sea_events').select('id, type, created_at, expires_at').eq('host_id', userId).order('created_at', { ascending: false });

  if (error || !data) {
    container.innerHTML = `<p class="muted">Couldn't load your sea events right now.</p>`;
    return;
  }
  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No sea events posted yet. <a href="/sea-events/" style="color:var(--brass-bright);">Post one</a>.</div>`;
    return;
  }
  container.innerHTML = data.map(e => `
    <a href="/sea-events/" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span style="font-size:0.95rem; font-weight:600; text-transform:capitalize;">${escapeHtml((e.type || '').replace(/_/g, ' '))}</span>
        <span class="muted" style="font-size:0.72rem;">${timeAgo(e.created_at)}</span>
      </div>
      <p class="muted" style="margin:8px 0 0; font-size:0.78rem;">${new Date(e.expires_at) > new Date() ? 'Still live' : 'Expired'}</p>
    </a>
  `).join('');
  refreshIcons();
}

async function loadMyGiveaways(userId, role) {
  const section = document.getElementById('my-giveaways-section');
  const container = document.getElementById('my-giveaways-list');
  if (role !== 'mod' && role !== 'admin') { section.style.display = 'none'; return; }

  const { data, error } = await sb.from('giveaways').select('id, title, status, created_at').eq('created_by', userId).order('created_at', { ascending: false });

  if (error || !data) {
    container.innerHTML = `<p class="muted">Couldn't load your giveaways right now.</p>`;
    return;
  }
  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No giveaways created yet. <a href="/giveaways/" style="color:var(--brass-bright);">Go create one</a>.</div>`;
    return;
  }
  container.innerHTML = data.map(g => `
    <a href="/giveaways/" class="panel" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <h3 style="margin:0; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(g.title)}</h3>
        <span class="muted" style="font-size:0.72rem;">${timeAgo(g.created_at)}</span>
      </div>
      <span class="tag" style="margin-top:8px; display:inline-block; text-transform:capitalize;">${escapeHtml(g.status)}</span>
    </a>
  `).join('');
  refreshIcons();
}

async function loadMyTradeListings(userId, maxActiveTrades = 3) {
  const container = document.getElementById('my-trade-listings');
  const { data, error } = await sb
    .from('trade_listings')
    .select('id, offering_item_ids, requesting_item_ids, created_at')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error || !data) {
    container.innerHTML = `<p class="muted">Couldn't load your listings right now.</p>`;
    return;
  }

  document.getElementById('my-trades-subtitle').textContent = `${data.length}/${maxActiveTrades} active — up to ${maxActiveTrades} at a time.`;

  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No active listings. <a href="/trading/" style="color:var(--brass-bright);">Post one</a>.</div>`;
    return;
  }

  const allIds = [...new Set(data.flatMap(t => [...t.offering_item_ids, ...t.requesting_item_ids]).map(e => e.id))];
  const { data: items } = await sb.from('bf_items').select('id, name, icon_url').in('id', allIds);
  const tinyTile = entry => {
    const item = (items || []).find(i => i.id === entry.id);
    return item ? `<img src="${item.icon_url}" alt="${escapeHtml(item.name)}" title="${escapeHtml(item.name)} (${entry.valueType})" loading="lazy" style="width:32px; height:32px; object-fit:contain; background:var(--navy); border-radius:6px; padding:3px; border:1px solid var(--glass-border);">` : '';
  };

  container.innerHTML = data.map(t => `
    <a href="/trading/#${t.id}" class="panel" data-my-listing="${t.id}" style="display:block; text-decoration:none; color:inherit;">
      <div class="flex-between">
        <span class="muted" style="font-size:0.72rem;">${timeAgo(t.created_at)}</span>
        <button class="btn btn-ghost btn-sm" data-delete-my-listing="${t.id}" onclick="event.preventDefault();" aria-label="Delete listing"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
      <div class="flex-between" style="margin-top:10px; align-items:center;">
        <div style="display:flex; gap:4px;">${t.offering_item_ids.map(tinyTile).join('')}</div>
        <i data-lucide="arrow-right" class="icon-sm muted"></i>
        <div style="display:flex; gap:4px;">${t.requesting_item_ids.map(tinyTile).join('')}</div>
      </div>
    </a>
  `).join('');

  document.querySelectorAll('[data-delete-my-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this trade listing?')) return;
      await sb.from('trade_listings').delete().eq('id', btn.dataset.deleteMyListing);
      loadMyTradeListings(userId, maxActiveTrades);
    });
  });
  refreshIcons();
}

async function loadMyCombos(userId, maxCombosPerUser = 10) {
  const container = document.getElementById('my-combos-list');
  const { data, error } = await sb.from('combos').select('id, title, difficulty, steps, created_at').eq('created_by', userId).order('created_at', { ascending: false });

  if (error || !data) {
    container.innerHTML = `<p class="muted">Couldn't load your combos right now.</p>`;
    return;
  }

  document.getElementById('my-combos-subtitle').textContent = `${data.length}/${maxCombosPerUser} posted.`;

  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No combos yet. <a href="/combos/" style="color:var(--brass-bright);">Post one</a>.</div>`;
    return;
  }

  container.innerHTML = data.map(c => `
    <div class="panel" data-my-combo="${c.id}">
      <div class="flex-between">
        <a href="/combos/#${c.id}" style="color:inherit; text-decoration:none; flex:1; min-width:0;">
          <h3 style="margin:0; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title)}</h3>
        </a>
        <div style="display:flex; gap:4px; flex-shrink:0;">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-my-combo="${c.id}" aria-label="Edit combo" title="Edit"><i data-lucide="pencil" class="icon-sm"></i></button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete-my-combo="${c.id}" aria-label="Delete combo" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
        </div>
      </div>
      <a href="/combos/#${c.id}" style="display:block; text-decoration:none;">
        <div style="display:flex; gap:4px; margin-top:10px;">
          ${(c.steps || []).map(s => {
            const opt = (BUILD_OPTIONS[s.category] || []).find(o => o.value === s.item);
            return opt ? `<img src="${opt.icon}" alt="${escapeHtml(s.item)}" title="${escapeHtml(s.item)}" loading="lazy" style="width:30px; height:30px; object-fit:contain; background:var(--navy); border-radius:6px; padding:3px; border:1px solid var(--glass-border);">` : '';
          }).join('')}
        </div>
      </a>
    </div>
  `).join('');

  document.querySelectorAll('[data-edit-my-combo]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `/combos/?edit=${btn.dataset.editMyCombo}#${btn.dataset.editMyCombo}`;
    });
  });
  document.querySelectorAll('[data-delete-my-combo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this combo?')) return;
      const { error } = await sb.from('combos').delete().eq('id', btn.dataset.deleteMyCombo);
      if (error) { showToast(error.message, true); return; }
      loadMyCombos(userId, maxCombosPerUser);
    });
  });
  refreshIcons();
}

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
          <p style="margin:0; font-size:1.5rem; font-weight:700; color:var(--bone);">${escapeHtml(displayNameFor(profile))}</p>
          ${titleBadge(profile)}
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
        ${crew ? `<a href="/crew/?name=${encodeURIComponent(crew.name)}" class="info-chip" style="text-decoration:none;">
          ${crew.logo_url ? `<img src="${crew.logo_url}" alt="" loading="lazy" style="width:16px; height:16px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none';">` : '<i data-lucide="users" class="icon-sm"></i>'}
          <span class="info-chip-label">Crew</span><span class="info-chip-value">${crew.tag ? `[${escapeHtml(crew.tag)}] ` : ''}${escapeHtml(crew.name)}</span>
        </a>` : `<p class="muted" style="margin:0; font-size:0.85rem;">You're not in a crew yet.</p>`}
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
    logError(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>No bounties claimed yet.</p>
        <a href="/challenges/" class="btn btn-primary" style="margin-top:12px;">Browse Quests</a>
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
        <p style="margin:0 0 4px; font-weight:700;">${escapeHtml(sub.challenges?.title || 'Quest')}</p>
        <p class="muted" style="margin:0 0 6px; font-size:0.82rem;">${formatDate(sub.submitted_at)} · +${sub.challenges?.xp_reward ?? 0} XP</p>
        ${sub.admin_note ? `<p style="margin:0; font-size:0.85rem; color:${statusColor};">"${escapeHtml(sub.admin_note)}"</p>` : ''}
      </div>
    </div>
  `;
}
