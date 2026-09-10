// BloxCore — feed/index.html logic (public Twitter-like post feed)

let currentUser = null;
let currentProfile = null;
let pendingImageFile = null;
let activeCommentsPostId = null;

const FEED_PAGE_SIZE = 20;

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;

  if (currentUser) {
    document.getElementById('feed-compose').style.display = 'block';
    document.getElementById('feed-compose-avatar').innerHTML = avatarHtml(currentProfile, 44);
  } else {
    document.getElementById('feed-signed-out').style.display = 'block';
  }

  document.getElementById('feed-post-input').addEventListener('input', updateCharCount);
  document.getElementById('feed-attach-btn').addEventListener('click', () => document.getElementById('feed-image-input').click());
  document.getElementById('feed-image-input').addEventListener('change', handleImageSelect);
  document.getElementById('feed-image-remove-btn').addEventListener('click', clearImageSelection);
  document.getElementById('feed-post-btn').addEventListener('click', handlePost);

  document.getElementById('feed-comments-modal-close').addEventListener('click', closeCommentsModal);
  document.getElementById('feed-comments-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('feed-comments-modal')) closeCommentsModal();
  });
  document.getElementById('feed-comment-form').addEventListener('submit', handleAddComment);

  await loadFeed();
});

function updateCharCount() {
  const input = document.getElementById('feed-post-input');
  document.getElementById('feed-char-count').textContent = 280 - input.value.length;
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
}

async function loadFeed() {
  const container = document.getElementById('feed-list');
  const empty = document.getElementById('feed-empty');
  empty.style.display = 'none';

  const data = await fetchFeedPage(0, FEED_PAGE_SIZE);
  if (data === null) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  if (!data.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }

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
  const { data, error } = await sb.rpc('get_feed_page', { p_limit: pageSize, p_offset: offset });
  if (error) { logError('Failed to load feed', error); return null; }
  return data;
}

function renderPost(p) {
  const profile = {
    username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, avatar_frame: p.avatar_frame,
    title_color_override: p.title_color_override, titles: p.title_name ? { name: p.title_name, color: p.title_color } : null,
  };
  const isOwner = currentUser && currentUser.id === p.user_id;
  const likeIcon = p.liked_by_me ? 'heart' : 'heart';

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
        ${isOwner
          ? `<button class="services-card-icon-btn" data-delete-post="${p.id}" aria-label="Delete post" title="Delete"><i data-lucide="x" class="icon-sm"></i></button>`
          : (currentUser ? `<button class="services-card-icon-btn" data-report-post="${p.id}" aria-label="Report post" title="Report"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
      </div>
      <p style="margin:12px 0 0; white-space:pre-wrap; font-size:0.94rem;">${escapeHtml(p.content)}</p>
      ${p.image_url ? `<a href="${p.image_url}" target="_blank" rel="noopener noreferrer"><img src="${p.image_url}" alt="" loading="lazy" style="max-width:100%; border-radius:var(--radius-sm,8px); margin-top:12px; border:1px solid var(--glass-border);"></a>` : ''}
      <div style="display:flex; align-items:center; gap:18px; margin-top:14px; padding-top:12px; border-top:1px solid var(--glass-border);">
        <button class="feed-action-btn ${p.liked_by_me ? 'is-active' : ''}" data-like-post="${p.id}" ${!currentUser ? 'disabled' : ''}>
          <i data-lucide="${likeIcon}" class="icon-sm"></i><span data-like-count>${p.like_count}</span>
        </button>
        <button class="feed-action-btn" data-open-comments="${p.id}">
          <i data-lucide="message-square" class="icon-sm"></i><span>${p.comment_count}</span>
        </button>
      </div>
    </div>
  `;
}

function wirePostActions(root) {
  root = root || document;
  root.querySelectorAll('[data-delete-post]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this post?')) return;
      const { error } = await sb.from('feed_posts').delete().eq('id', btn.dataset.deletePost);
      if (error) { showToast(error.message, true); return; }
      loadFeed();
    });
  });
  root.querySelectorAll('[data-report-post]').forEach(btn => {
    btn.addEventListener('click', () => reportContent('feed_post', btn.dataset.reportPost));
  });
  root.querySelectorAll('[data-like-post]').forEach(btn => {
    btn.addEventListener('click', () => toggleLike(btn));
  });
  root.querySelectorAll('[data-open-comments]').forEach(btn => {
    btn.addEventListener('click', () => openCommentsModal(btn.dataset.openComments));
  });
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

async function openCommentsModal(postId) {
  activeCommentsPostId = postId;
  document.getElementById('feed-comments-modal').classList.add('open');
  const list = document.getElementById('feed-comments-list');
  list.innerHTML = `<div class="skeleton" style="height:50px;"></div>`;

  const { data, error } = await sb.rpc('get_feed_post_comments', { p_post_id: postId });
  if (error || !data) { list.innerHTML = `<p class="muted">Couldn't load comments.</p>`; return; }
  if (!data.length) { list.innerHTML = `<p class="muted">No comments yet — say something first.</p>`; return; }

  list.innerHTML = data.map(c => `
    <div style="display:flex; gap:10px;">
      ${avatarHtml({ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url, avatar_frame: c.avatar_frame }, 30)}
      <div style="min-width:0;">
        <a href="/player/?u=${encodeURIComponent(c.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.85rem;">${escapeHtml(displayNameFor(c))}</a>
        <span class="muted" style="font-size:0.72rem; margin-left:6px;">${timeAgo(c.created_at)}</span>
        <p style="margin:2px 0 0; font-size:0.86rem; white-space:pre-wrap;">${escapeHtml(c.content)}</p>
      </div>
    </div>
  `).join('');
  refreshIcons();
}

function closeCommentsModal() {
  document.getElementById('feed-comments-modal').classList.remove('open');
  document.getElementById('feed-comment-form').reset();
  activeCommentsPostId = null;
}

async function handleAddComment(e) {
  e.preventDefault();
  const auth = await requireAuth();
  if (!auth) return;
  const input = document.getElementById('feed-comment-input');
  const content = input.value.trim();
  if (!content) return;

  const { error } = await sb.from('feed_comments').insert({ post_id: activeCommentsPostId, user_id: auth.user.id, content });
  if (error) { showToast(error.message, true); return; }
  input.value = '';
  await openCommentsModal(activeCommentsPostId);

  const card = document.querySelector(`[data-post-id="${activeCommentsPostId}"] [data-open-comments]`);
  if (card) card.querySelector('span:last-child').textContent = Number(card.querySelector('span:last-child').textContent) + 1;
}
