// BloxCore — feed sidebar widgets (pulse stats, trending, top players, who to follow)
// Lazy-loaded by js/feed.js (loadFeedModule); runs in the same global scope as feed.js.

async function loadPulseStats() {
  const el = document.getElementById('feed-pulse-stats');
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ count: todayCount }, { count: weekCount }] = await Promise.all([
    sb.from('feed_posts').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    sb.from('feed_posts').select('id', { count: 'exact', head: true }).gte('created_at', since7d),
  ]);

  el.innerHTML = `
    <div class="fs-stats">
      <div class="fs-stat"><strong class="feed-pulse-number">${todayCount ?? 0}</strong><span>post${todayCount === 1 ? '' : 's'} today</span></div>
      <div class="fs-stat"><strong class="feed-pulse-number">${weekCount ?? 0}</strong><span>post${weekCount === 1 ? '' : 's'} this week</span></div>
    </div>
  `;
}

async function loadSidebarTrending() {
  const el = document.getElementById('feed-sidebar-trending');
  const { data } = await sb.rpc('get_feed_page', { p_limit: 3, p_offset: 0, p_trending: true });

  if (!data || !data.length) {
    el.innerHTML = `<div class="fs-empty"><i data-lucide="flame" class="icon-md"></i><p>Nothing trending yet.<br>Like and comment to get things moving.</p></div>`;
    refreshIcons();
    return;
  }

  el.innerHTML = data.map((p, i) => `
    <a href="/feed/#post-${p.id}" class="feed-sidebar-trending-row fs-row">
      <span class="fs-rank">${i + 1}</span>
      ${avatarHtml({ username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, avatar_frame: p.avatar_frame }, 30)}
      <div class="fs-row-main">
        <p class="fs-row-title">${escapeHtml(p.content)}</p>
        <p class="fs-row-sub"><i data-lucide="heart" class="icon-sm icon-inline"></i>${p.like_count} <i data-lucide="message-square" class="icon-sm icon-inline" style="margin-left:6px;"></i>${p.comment_count}</p>
      </div>
    </a>
  `).join('');
  refreshIcons();
}

async function loadSidebarTopPlayers() {
  const el = document.getElementById('feed-sidebar-top-players');
  if (!el) return;
  const { data } = await sb.from('profiles')
    .select('id, username, display_name, avatar_url, avatar_frame, level')
    .eq('hide_from_leaderboard', false)
    .order('level', { ascending: false })
    .order('xp', { ascending: false })
    .limit(5);
  if (!data || !data.length) { el.closest('.feed-sidebar-card').style.display = 'none'; return; }
  el.innerHTML = data.map((p, i) => `
    <div class="feed-sidebar-suggestion-row fs-row">
      <span class="fs-rank fs-rank-${i + 1}">${i + 1}</span>
      <a href="/player/?u=${encodeURIComponent(p.username || '')}" class="fs-row-link">
        ${avatarHtml(p, 30)}
        <span class="fs-row-name">${escapeHtml(displayNameFor(p))}</span>
      </a>
      <span class="fs-lv">Lv ${p.level ?? 1}</span>
    </div>
  `).join('');
}

async function loadSidebarSuggestions() {
  const card = document.getElementById('feed-sidebar-suggestions-card');
  const el = document.getElementById('feed-sidebar-suggestions');

  const { data } = await sb.from('profiles')
    .select('id, username, display_name, avatar_url, avatar_frame')
    .neq('id', currentUser.id)
    .eq('hide_from_leaderboard', false)
    .order('last_active_at', { ascending: false })
    .limit(12);

  const suggestions = (data || []).filter(p => !followingIds.has(p.id)).slice(0, 3);
  if (!suggestions.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  el.innerHTML = suggestions.map(p => `
    <div class="feed-sidebar-suggestion-row fs-row">
      <a href="/player/?u=${encodeURIComponent(p.username || '')}" class="fs-row-link">
        ${avatarHtml(p, 30)}
        <span class="fs-row-name">${escapeHtml(displayNameFor(p))}</span>
      </a>
      <button type="button" class="btn btn-ghost btn-sm fs-follow" data-follow-user="${p.id}">Follow</button>
    </div>
  `).join('');

  el.querySelectorAll('[data-follow-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await sb.from('follows').insert({ follower_id: currentUser.id, followed_id: btn.dataset.followUser });
      if (error) { showToast(error.message, true); btn.disabled = false; return; }
      followingIds.add(btn.dataset.followUser);
      btn.closest('.feed-sidebar-suggestion-row').remove();
      if (!el.children.length) card.style.display = 'none';
    });
  });
}
