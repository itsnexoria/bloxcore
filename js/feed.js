// BloxCore — feed/index.html logic (public Twitter-like post feed)

let currentUser = null;
let currentProfile = null;
let pendingImageFile = null;
let followingIds = new Set();

const FEED_PAGE_SIZE = 20;
const CHAR_RING_CIRCUMFERENCE = 2 * Math.PI * 9; // r=9, matches the SVG in feed/index.html

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;

  if (currentUser) {
    document.getElementById('feed-compose').style.display = 'block';
    document.getElementById('feed-compose-avatar').innerHTML = avatarHtml(currentProfile, 44);
    const { data } = await sb.from('follows').select('followed_id').eq('follower_id', currentUser.id);
    followingIds = new Set((data || []).map(r => r.followed_id));
  } else {
    document.getElementById('feed-signed-out').style.display = 'block';
    document.getElementById('feed-tab-following').disabled = true;
    document.getElementById('feed-tab-following').title = 'Sign in to see posts from people you follow';
  }

  document.getElementById('feed-post-input').addEventListener('input', updateCharCount);
  document.getElementById('feed-attach-btn').addEventListener('click', () => document.getElementById('feed-image-input').click());
  document.getElementById('feed-image-input').addEventListener('change', handleImageSelect);
  document.getElementById('feed-image-remove-btn').addEventListener('click', clearImageSelection);
  document.getElementById('feed-post-btn').addEventListener('click', handlePost);

  document.querySelectorAll('#feed-tabs [data-feed-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchFeedTab(btn.dataset.feedTab));
  });

  loadPulseStats();
  loadSidebarTrending();
  if (currentUser) loadSidebarSuggestions();
  else document.getElementById('feed-sidebar-suggestions-card').style.display = 'none';

  await loadFeed();
});

let feedTab = 'latest';

function switchFeedTab(tab) {
  if (tab === feedTab || (tab === 'following' && !currentUser)) return;
  feedTab = tab;
  document.querySelectorAll('#feed-tabs [data-feed-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.feedTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  refreshIcons();
  loadFeed();
}

// --- Composer -------------------------------------------------------------

function updateCharCount() {
  const input = document.getElementById('feed-post-input');
  const remaining = 280 - input.value.length;
  const ring = document.getElementById('feed-char-ring-progress');
  const pct = Math.min(1, input.value.length / 280);
  ring.setAttribute('stroke-dashoffset', String(CHAR_RING_CIRCUMFERENCE * (1 - pct)));
  ring.style.stroke = remaining < 0 ? '#f87171' : remaining < 30 ? '#fbbf24' : 'var(--brass-bright)';
}

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('feed-image-preview-img').src = reader.result;
    document.getElementById('feed-image-preview').style.display = 'block';
    refreshIcons();
  };
  reader.readAsDataURL(file);
}

function clearImageSelection() {
  pendingImageFile = null;
  document.getElementById('feed-image-input').value = '';
  document.getElementById('feed-image-preview').style.display = 'none';
}

async function handlePost() {
  const auth = await requireAuth();
  if (!auth) return;

  const input = document.getElementById('feed-post-input');
  const content = input.value.trim();
  if (!content && !pendingImageFile) return;
  if (content.length > 280) { showToast('Posts are capped at 280 characters.', true); return; }

  const btn = document.getElementById('feed-post-btn');
  btn.disabled = true;

  let image_url = null;
  if (pendingImageFile) {
    const compressed = await compressImage(pendingImageFile, { maxDimension: 1600, quality: 0.82 });
    const ext = compressed.name ? compressed.name.split('.').pop() : pendingImageFile.name.split('.').pop();
    const path = `${auth.user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('feed-media').upload(path, compressed);
    if (uploadError) { showToast(uploadError.message, true); btn.disabled = false; return; }
    const { data: urlData } = sb.storage.from('feed-media').getPublicUrl(path);
    image_url = urlData.publicUrl;
  }

  const { error } = await sb.from('feed_posts').insert({
    user_id: auth.user.id,
    content: content || '📷',
    image_url,
  });
  btn.disabled = false;
  if (error) { showToast(error.message, true); return; }

  input.value = '';
  updateCharCount();
  clearImageSelection();
  showToast('Posted!');
  loadFeed();
  loadPulseStats();
}

// --- Sidebar ---------------------------------------------------------------

async function loadPulseStats() {
  const el = document.getElementById('feed-pulse-stats');
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ count: todayCount }, { count: weekCount }] = await Promise.all([
    sb.from('feed_posts').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    sb.from('feed_posts').select('id', { count: 'exact', head: true }).gte('created_at', since7d),
  ]);

  el.innerHTML = `
    <p style="margin:0 0 8px; font-size:0.85rem;"><span class="feed-pulse-number">${todayCount ?? 0}</span> post${todayCount === 1 ? '' : 's'} in the last 24h</p>
    <p style="margin:0; font-size:0.85rem;"><span class="feed-pulse-number">${weekCount ?? 0}</span> post${weekCount === 1 ? '' : 's'} this week</p>
  `;
}

async function loadSidebarTrending() {
  const el = document.getElementById('feed-sidebar-trending');
  const { data } = await sb.rpc('get_feed_page', { p_limit: 3, p_offset: 0, p_trending: true });

  if (!data || !data.length) {
    el.innerHTML = `<p class="muted" style="margin:0; font-size:0.8rem;">Nothing trending yet.</p>`;
    return;
  }

  el.innerHTML = data.map(p => `
    <a href="/feed/#post-${p.id}" class="feed-sidebar-trending-row" style="text-decoration:none; color:inherit;">
      ${avatarHtml({ username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, avatar_frame: p.avatar_frame }, 28)}
      <div style="min-width:0;">
        <p style="margin:0; font-size:0.78rem; color:var(--bone); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.content)}</p>
        <p class="muted" style="margin:0; font-size:0.68rem;"><i data-lucide="heart" class="icon-sm icon-inline"></i>${p.like_count} · <i data-lucide="message-square" class="icon-sm icon-inline"></i>${p.comment_count}</p>
      </div>
    </a>
  `).join('');
  refreshIcons();
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
    <div class="feed-sidebar-suggestion-row">
      <a href="/player/?u=${encodeURIComponent(p.username || '')}" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit; min-width:0; flex:1;">
        ${avatarHtml(p, 30)}
        <span style="font-size:0.82rem; color:var(--bone); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(displayNameFor(p))}</span>
      </a>
      <button type="button" class="btn btn-ghost btn-sm" data-follow-user="${p.id}" style="flex-shrink:0; padding:4px 8px; font-size:0.72rem;">Follow</button>
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

// --- Feed list ---------------------------------------------------------------

async function loadFeed() {
  const container = document.getElementById('feed-list');
  const empty = document.getElementById('feed-empty');
  empty.style.display = 'none';
  container.innerHTML = `<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div>`;

  const data = await fetchFeedPage(0, FEED_PAGE_SIZE);
  if (data === null || !data.length) {
    container.innerHTML = '';
    empty.textContent = feedTab === 'trending'
      ? 'Nothing trending in the last 24 hours yet.'
      : feedTab === 'following'
      ? "No posts yet from people you follow — go follow some pirates."
      : 'No posts yet — be the first to share something.';
    empty.style.display = 'block';
    return;
  }

  container.innerHTML = data.map(renderPost).join('');
  wirePostActions(container);
  refreshIcons();
  loadReputationBadges(container, data.map(p => ({ id: p.user_id, createdAt: null })));
  scrollToHashTarget('data-post-id');

  if (data.length === FEED_PAGE_SIZE) {
    attachLoadMore(container, {
      wrapId: 'feed-load-more-wrap',
      pageSize: FEED_PAGE_SIZE,
      initialOffset: data.length,
      fetchPage: async (offset, pageSize) => (await fetchFeedPage(offset, pageSize)) || [],
      renderItem: renderPost,
      onAppend: (rows) => {
        const ids = new Set(rows.map(r => String(r.id)));
        [...container.querySelectorAll('[data-post-id]')].filter(el => ids.has(el.dataset.postId)).forEach(el => wirePostActions(el));
        refreshIcons();
      },
    });
  }
}

async function fetchFeedPage(offset, pageSize) {
  const { data, error } = await sb.rpc('get_feed_page', { p_limit: pageSize, p_offset: offset, p_trending: feedTab === 'trending', p_following: feedTab === 'following' });
  if (error) { logError('Failed to load feed', error); return null; }
  return data;
}

function renderPost(p) {
  const profile = {
    username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, avatar_frame: p.avatar_frame,
    title_color_override: p.title_color_override, titles: p.title_name ? { name: p.title_name, color: p.title_color } : null,
  };
  const isOwner = currentUser && currentUser.id === p.user_id;
  const isPinned = currentProfile && currentProfile.pinned_feed_post_id === p.id;

  return `
    <div class="panel feed-post-card hover-lift-card" data-post-id="${p.id}">
      <div class="flex-between">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(profile, 38)}
          <div>
            <a href="/player/?u=${encodeURIComponent(p.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.92rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)}
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(p.created_at)}</p>
          </div>
        </div>
        <div style="display:flex; gap:4px;">
          ${isOwner
            ? `<button class="services-card-icon-btn" data-pin-post="${p.id}" aria-label="${isPinned ? 'Unpin from profile' : 'Pin to profile'}" title="${isPinned ? 'Unpin from profile' : 'Pin to profile'}"><i data-lucide="pin" class="icon-sm" style="${isPinned ? 'color:var(--brass-bright); fill:var(--brass-bright);' : ''}"></i></button>
               <button class="services-card-icon-btn" data-delete-post="${p.id}" aria-label="Delete post" title="Delete"><i data-lucide="x" class="icon-sm"></i></button>`
            : (currentUser ? `<button class="services-card-icon-btn" data-report-post="${p.id}" aria-label="Report post" title="Report"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
        </div>
      </div>
      ${isPinned ? `<p class="muted" style="margin:10px 0 0; font-size:0.72rem;"><i data-lucide="pin" class="icon-sm icon-inline"></i>Pinned to profile</p>` : ''}
      <p style="margin:12px 0 0; white-space:pre-wrap; font-size:0.94rem;">${escapeHtml(p.content)}</p>
      ${p.image_url ? `<a href="${p.image_url}" target="_blank" rel="noopener noreferrer"><img src="${p.image_url}" alt="" loading="lazy" style="max-width:100%; border-radius:var(--radius-sm,8px); margin-top:12px; border:1px solid var(--glass-border);"></a>` : ''}
      <div style="display:flex; align-items:center; gap:18px; margin-top:14px; padding-top:12px; border-top:1px solid var(--glass-border);">
        <button class="feed-action-btn ${p.liked_by_me ? 'is-active' : ''}" data-like-post="${p.id}" ${!currentUser ? 'disabled' : ''}>
          <i data-lucide="heart" class="icon-sm"></i><span data-like-count>${p.like_count}</span>
        </button>
        <button class="feed-action-btn" data-toggle-comments="${p.id}">
          <i data-lucide="message-square" class="icon-sm"></i><span data-comment-count>${p.comment_count}</span>
        </button>
      </div>
      <div class="feed-comments-panel" data-comments-panel="${p.id}" style="display:none;"></div>
    </div>
  `;
}

function wirePostActions(root) {
  root = root || document;
  root.querySelectorAll('[data-pin-post]').forEach(btn => {
    btn.addEventListener('click', () => togglePinPost(btn.dataset.pinPost));
  });
  root.querySelectorAll('[data-delete-post]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this post?')) return;
      const { error } = await sb.from('feed_posts').delete().eq('id', btn.dataset.deletePost);
      if (error) { showToast(error.message, true); return; }
      loadFeed();
      loadPulseStats();
    });
  });
  root.querySelectorAll('[data-report-post]').forEach(btn => {
    btn.addEventListener('click', () => reportContent('feed_post', btn.dataset.reportPost));
  });
  root.querySelectorAll('[data-like-post]').forEach(btn => {
    btn.addEventListener('click', () => toggleLike(btn));
  });
  root.querySelectorAll('[data-toggle-comments]').forEach(btn => {
    btn.addEventListener('click', () => toggleCommentsPanel(btn.dataset.toggleComments));
  });
}

async function togglePinPost(postId) {
  const isPinned = currentProfile.pinned_feed_post_id === postId;
  const { error } = await sb.rpc('set_pinned_feed_post', { p_post_id: isPinned ? null : postId });
  if (error) { showToast(error.message, true); return; }
  currentProfile.pinned_feed_post_id = isPinned ? null : postId;
  showToast(isPinned ? 'Unpinned.' : 'Pinned to your profile!');
  loadFeed();
}

async function toggleLike(btn) {
  const auth = await requireAuth();
  if (!auth) return;
  const postId = btn.dataset.likePost;
  const countEl = btn.querySelector('[data-like-count]');
  const wasActive = btn.classList.contains('is-active');

  // Optimistic update — instant feedback, matches the site's other tap-to-react patterns.
  btn.classList.toggle('is-active', !wasActive);
  countEl.textContent = Number(countEl.textContent) + (wasActive ? -1 : 1);

  const { error } = wasActive
    ? await sb.from('feed_likes').delete().eq('post_id', postId).eq('user_id', auth.user.id)
    : await sb.from('feed_likes').insert({ post_id: postId, user_id: auth.user.id });

  if (error) {
    btn.classList.toggle('is-active', wasActive);
    countEl.textContent = Number(countEl.textContent) + (wasActive ? 1 : -1);
    showToast(error.message, true);
  }
}

// --- Inline comments (expand under the post, no modal) ----------------------

async function toggleCommentsPanel(postId) {
  const panel = document.querySelector(`[data-comments-panel="${postId}"]`);
  if (!panel) return;

  const isOpen = panel.style.display !== 'none';
  if (isOpen) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  await renderCommentsPanel(postId, panel);
}

async function renderCommentsPanel(postId, panel) {
  panel.innerHTML = `<div class="skeleton" style="height:40px;"></div>`;

  const { data, error } = await sb.rpc('get_feed_post_comments', { p_post_id: postId });
  const comments = error || !data ? [] : data;

  panel.innerHTML = `
    <div data-comments-list>
      ${comments.length
        ? comments.map(c => `
          <div class="feed-comment-row">
            ${avatarHtml({ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url, avatar_frame: c.avatar_frame }, 28)}
            <div style="min-width:0;">
              <a href="/player/?u=${encodeURIComponent(c.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.83rem;">${escapeHtml(displayNameFor(c))}</a>
              <span class="muted" style="font-size:0.7rem; margin-left:6px;">${timeAgo(c.created_at)}</span>
              <p style="margin:2px 0 0; font-size:0.84rem; white-space:pre-wrap;">${escapeHtml(c.content)}</p>
            </div>
          </div>
        `).join('')
        : `<p class="muted" style="margin:0 0 10px; font-size:0.8rem;">No comments yet — say something first.</p>`}
    </div>
    ${currentUser ? `
      <form data-comment-form="${postId}" style="display:flex; gap:8px; margin-top:10px; align-items:flex-end;">
        <input type="text" maxlength="280" placeholder="Write a comment…" style="margin:0; flex:1; font-size:0.85rem;" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">Reply</button>
      </form>
    ` : `<p class="muted" style="margin:8px 0 0; font-size:0.78rem;"><a href="/auth/">Sign in</a> to comment.</p>`}
  `;

  panel.querySelector(`[data-comment-form="${postId}"]`)?.addEventListener('submit', (e) => handleAddComment(e, postId, panel));
  refreshIcons();
}

async function handleAddComment(e, postId, panel) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const content = input.value.trim();
  if (!content) return;

  const { error } = await sb.from('feed_comments').insert({ post_id: postId, user_id: currentUser.id, content });
  if (error) { showToast(error.message, true); return; }

  await renderCommentsPanel(postId, panel);

  const countEl = document.querySelector(`[data-post-id="${postId}"] [data-comment-count]`);
  if (countEl) countEl.textContent = Number(countEl.textContent) + 1;
}
