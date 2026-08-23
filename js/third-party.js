// BloxCore — third-party/index.html logic (fast flags / macros / AHK / launchers)

let currentUser = null;
let currentProfile = null;
let activeTab = 'fastflag';
let minTitleLength = 4;
let maxTitleLength = 60;
let minDescriptionLength = 0;
let maxDescriptionLength = 300;
let loadToken = 0;
let currentPosts = [];

const TAB_LABELS = { fastflag: 'Fast Flags', macro: 'Macros', ahk: 'AHK', launcher: 'Launchers' };
const ALLOWED_EXTENSIONS = { fastflag: ['.txt', '.json', '.tmacroproj'], macro: ['.txt', '.json', '.tmacroproj'], ahk: ['.ahk'] };
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function isStaff(profile) {
  return profile?.role === 'mod' || profile?.role === 'admin';
}

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;

  const settings = await getSiteSettings();
  minTitleLength = settings.minThirdPartyTitleLength;
  maxTitleLength = settings.maxThirdPartyTitleLength;
  minDescriptionLength = settings.minThirdPartyDescriptionLength;
  maxDescriptionLength = settings.maxThirdPartyDescriptionLength;
  document.getElementById('third-party-title').maxLength = maxTitleLength;
  document.getElementById('third-party-description').maxLength = maxDescriptionLength;

  if (currentUser) {
    document.getElementById('new-post-btn').addEventListener('click', openComposeModal);
  } else {
    document.getElementById('third-party-signed-out').style.display = 'block';
  }
  updateComposeButtonVisibility();

  document.querySelectorAll('#third-party-tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('third-party-compose-close').addEventListener('click', closeComposeModal);
  document.getElementById('third-party-compose-form').addEventListener('submit', handlePost);
  document.getElementById('third-party-view-close').addEventListener('click', closeViewModal);
  document.getElementById('third-party-view-close-btn').addEventListener('click', closeViewModal);

  const initialTab = new URLSearchParams(window.location.search).get('tab');
  if (initialTab && TAB_LABELS[initialTab]) switchTab(initialTab, { skipReload: true });

  await loadList();
});

function updateComposeButtonVisibility() {
  const btn = document.getElementById('new-post-btn');
  if (!currentUser) return;
  const canPost = activeTab !== 'launcher' || isStaff(currentProfile);
  btn.style.display = canPost ? 'inline-flex' : 'none';
}

function switchTab(tab, { skipReload = false } = {}) {
  activeTab = tab;
  document.querySelectorAll('#third-party-tabs [data-tab]').forEach(b => {
    b.className = `btn btn-sm ${b.dataset.tab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  updateComposeButtonVisibility();
  if (!skipReload) loadList();
}

const THIRD_PARTY_PAGE_SIZE = 30;
let currentOffset = 0;

async function fetchThirdPartyPage(offset, pageSize) {
  const { data, error } = await sb
    .from('third_party_posts')
    .select('*, profiles!third_party_posts_user_id_fkey(username, display_name, avatar_url, title_color_override, titles(name, color), role)')
    .eq('category', activeTab)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { console.error('third_party_posts query failed:', error.message, error.code, error.details, error.hint); return null; }
  return data;
}

async function attachScoresAndVotes(posts) {
  if (!posts.length) return posts;
  const ids = posts.map(p => p.id);
  const { data: scores } = await sb.from('third_party_post_scores').select('post_id, score').in('post_id', ids);
  const scoreMap = new Map((scores || []).map(s => [s.post_id, s.score]));

  let myVoteMap = new Map();
  if (currentUser) {
    const { data: myVotes } = await sb.from('third_party_post_votes').select('post_id, vote').eq('user_id', currentUser.id).in('post_id', ids);
    myVoteMap = new Map((myVotes || []).map(v => [v.post_id, v.vote]));
  }

  posts.forEach(p => {
    p.score = scoreMap.get(p.id) || 0;
    p.myVote = myVoteMap.get(p.id) || 0;
  });
  return posts;
}

async function loadList() {
  const myToken = ++loadToken;
  const container = document.getElementById('third-party-list');
  const empty = document.getElementById('third-party-empty');
  container.innerHTML = `<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div>`;
  empty.style.display = 'none';
  currentOffset = 0;

  const data = await fetchThirdPartyPage(0, THIRD_PARTY_PAGE_SIZE);

  // Another tab switch happened while this request was in flight — its result is stale, drop it.
  if (myToken !== loadToken) return;

  if (!data || !data.length) {
    container.innerHTML = '';
    document.getElementById('third-party-empty-text').textContent = activeTab === 'launcher'
      ? 'No launchers shared yet — only mods and admins can post these.'
      : "Nothing shared here yet — be the first to post one.";
    empty.style.display = 'block';
    currentPosts = [];
    return;
  }

  await attachScoresAndVotes(data);
  if (myToken !== loadToken) return;

  currentOffset = data.length;
  currentPosts = data;
  renderList();
  scrollToHashTarget('data-post-id');

  if (data.length === THIRD_PARTY_PAGE_SIZE) {
    attachLoadMore(container, {
      wrapId: 'third-party-load-more-wrap',
      pageSize: THIRD_PARTY_PAGE_SIZE,
      initialOffset: currentOffset,
      fetchPage: async (offset, pageSize) => (await fetchThirdPartyPage(offset, pageSize)) || [],
      renderItem: () => '', // renderList() below does the actual rendering, in one pass with the rest
      onAppend: async (rows) => {
        if (myToken !== loadToken) return;
        await attachScoresAndVotes(rows);
        if (myToken !== loadToken) return;
        currentOffset += rows.length;
        currentPosts = currentPosts.concat(rows);
        renderList();
      },
    });
  }
}

function scrollToHashTarget(attr) {
  const id = location.hash.slice(1);
  if (!id) return;
  const el = document.querySelector(`[${attr}="${id}"]`);
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('deep-link-highlight');
  }, 150);
}

function renderList() {
  const container = document.getElementById('third-party-list');
  container.innerHTML = currentPosts.map(p => p.category === 'launcher' ? renderLauncherCard(p) : renderFileCard(p)).join('');
  wirePostActions();
  refreshIcons();
}

function fileExtIcon(name) {
  if (name.endsWith('.json')) return 'braces';
  if (name.endsWith('.tmacroproj')) return 'mouse-pointer-click';
  if (name.endsWith('.ahk')) return 'terminal';
  return 'file-text';
}

function voteWidgetHtml(p) {
  return `
    <div class="tp-vote-widget" data-vote-post="${p.id}">
      <button type="button" class="tp-vote-btn ${p.myVote === 1 ? 'active-up' : ''}" data-vote-dir="1" aria-label="Like"><i data-lucide="thumbs-up" class="icon-sm"></i></button>
      <span class="tp-vote-score" style="color:${p.score > 0 ? 'var(--gold-bright)' : p.score < 0 ? 'var(--blood-dim)' : 'var(--ash)'};">${p.score}</span>
      <button type="button" class="tp-vote-btn ${p.myVote === -1 ? 'active-down' : ''}" data-vote-dir="-1" aria-label="Dislike"><i data-lucide="thumbs-down" class="icon-sm"></i></button>
    </div>
  `;
}

function postHeaderHtml(p, canDelete) {
  const profile = p.profiles || {};
  return `
    <div style="display:flex; align-items:center; gap:10px;">
      ${avatarHtml(profile, 30)}
      <div>
        <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)}
        ${profile.role === 'admin' || profile.role === 'mod' ? `<span class="tag" style="margin-left:4px; text-transform:capitalize;">${escapeHtml(profile.role)}</span>` : ''}
        <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(p.created_at)}</p>
      </div>
    </div>
    ${canDelete ? `<button class="btn btn-ghost btn-sm" data-delete-post="${p.id}" aria-label="Delete post"><i data-lucide="trash-2" class="icon-sm"></i></button>` : ''}
  `;
}

const GITHUB_SVG = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" style="display:inline-block; vertical-align:-2px; margin-right:6px;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

function renderFileCard(p) {
  const isOwner = currentUser && p.user_id === currentUser.id;
  const canDelete = isOwner || isStaff(currentProfile);
  const canReport = currentUser && !canDelete;

  return `
    <div class="panel tp-file-card" data-post-id="${p.id}">
      <div class="flex-between">${postHeaderHtml(p, canDelete)}${!canDelete ? (canReport ? `<button class="btn btn-ghost btn-sm" data-report-post="${p.id}" title="Report" aria-label="Report post"><i data-lucide="flag" class="icon-sm"></i></button>` : '') : ''}</div>

      <div class="tp-file-body">
        <span class="tag" style="align-self:flex-start;">${escapeHtml(TAB_LABELS[p.category] || p.category)}</span>
        <h3 class="tp-file-title">${escapeHtml(p.title)}</h3>
        ${p.description ? `<p class="muted tp-file-desc">${escapeHtml(p.description)}</p>` : ''}
      </div>

      <button type="button" class="tp-file-chip" data-view-file="${p.id}">
        <i data-lucide="${fileExtIcon(p.file_name)}" class="icon-sm"></i><span>${escapeHtml(p.file_name)}</span>
      </button>

      <div class="tp-file-footer">
        ${voteWidgetHtml(p)}
        <a href="${p.file_url}" download="${escapeHtml(p.file_name)}" class="btn btn-primary btn-sm"><i data-lucide="download" class="icon-sm icon-inline"></i>Download</a>
      </div>
    </div>
  `;
}

function renderLauncherCard(p) {
  const isOwner = currentUser && p.user_id === currentUser.id;
  const canDelete = isOwner || isStaff(currentProfile);
  const canReport = currentUser && !canDelete;

  return `
    <div class="panel" data-post-id="${p.id}" style="display:flex; flex-direction:column;">
      <div class="flex-between" style="align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
          <img src="${p.icon_url}" alt="${escapeHtml(p.title)}" style="width:52px; height:52px; border-radius:var(--radius-sm); object-fit:cover; border:1px solid var(--glass-border); flex-shrink:0;">
          <div style="min-width:0;">
            <h3 style="margin:0 0 2px; font-size:1.05rem; font-family:var(--font-body); text-transform:none; letter-spacing:normal; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.title)}</h3>
            <div style="display:flex; align-items:center; gap:6px;">
              ${avatarHtml(p.profiles || {}, 18)}
              <span class="muted" style="font-size:0.75rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(displayNameFor(p.profiles || {}))} · ${timeAgo(p.created_at)}</span>
            </div>
          </div>
        </div>
        ${canDelete ? `<button class="btn btn-ghost btn-sm" data-delete-post="${p.id}" aria-label="Delete post" style="flex-shrink:0;"><i data-lucide="trash-2" class="icon-sm"></i></button>` : (canReport ? `<button class="btn btn-ghost btn-sm" data-report-post="${p.id}" title="Report" aria-label="Report post" style="flex-shrink:0;"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
      </div>

      ${p.description ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem; white-space:pre-wrap;">${escapeHtml(p.description)}</p>` : ''}

      <div class="flex-between" style="margin-top:auto; padding-top:14px; flex-wrap:wrap; gap:10px; border-top:1px solid var(--glass-border);">
        ${voteWidgetHtml(p)}
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${p.github_url ? `<a href="${p.github_url}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">${GITHUB_SVG}GitHub</a>` : ''}
          <a href="${p.download_url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm"><i data-lucide="download" class="icon-sm icon-inline"></i>Download</a>
        </div>
      </div>
    </div>
  `;
}

function wirePostActions() {
  document.querySelectorAll('[data-delete-post]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this post?')) return;
      const { error } = await sb.from('third_party_posts').delete().eq('id', btn.dataset.deletePost);
      if (error) { showToast(error.message, true); return; }
      loadList();
    });
  });
  document.querySelectorAll('[data-report-post]').forEach(btn => {
    btn.addEventListener('click', () => reportContent('third_party_post', btn.dataset.reportPost));
  });
  document.querySelectorAll('[data-view-file]').forEach(btn => {
    btn.addEventListener('click', () => openViewModal(btn.dataset.viewFile));
  });
  document.querySelectorAll('[data-vote-post]').forEach(widget => {
    widget.querySelectorAll('[data-vote-dir]').forEach(btn => {
      btn.addEventListener('click', () => handleVote(widget.dataset.votePost, Number(btn.dataset.voteDir)));
    });
  });
}

async function handleVote(postId, dir) {
  const auth = await requireAuth();
  if (!auth) return;

  const post = currentPosts.find(p => p.id === postId);
  if (!post) return;

  const removing = post.myVote === dir;
  const { error } = removing
    ? await sb.from('third_party_post_votes').delete().eq('post_id', postId).eq('user_id', auth.user.id)
    : await sb.from('third_party_post_votes').upsert({ post_id: postId, user_id: auth.user.id, vote: dir });

  if (error) { showToast(error.message, true); return; }

  post.score = post.score - post.myVote + (removing ? 0 : dir);
  post.myVote = removing ? 0 : dir;
  renderList();
}

async function openViewModal(postId) {
  const post = currentPosts.find(p => p.id === postId);
  if (!post) return;

  document.getElementById('third-party-view-title').textContent = post.file_name;
  document.getElementById('third-party-view-download').href = post.file_url;
  document.getElementById('third-party-view-download').setAttribute('download', post.file_name);
  const content = document.getElementById('third-party-view-content');
  content.textContent = 'Loading…';
  document.getElementById('third-party-view-modal').classList.add('open');

  try {
    const res = await fetch(post.file_url);
    content.textContent = await res.text();
  } catch {
    content.textContent = "Couldn't load a preview — use Download instead.";
  }
}

function closeViewModal() {
  document.getElementById('third-party-view-modal').classList.remove('open');
}

function openComposeModal() {
  if (activeTab === 'launcher' && !isStaff(currentProfile)) {
    showToast('Only mods and admins can post launchers.', true);
    return;
  }
  const isLauncher = activeTab === 'launcher';
  document.getElementById('third-party-file-field').style.display = isLauncher ? 'none' : 'block';
  document.getElementById('third-party-launcher-fields').style.display = isLauncher ? 'block' : 'none';
  document.getElementById('third-party-file').required = !isLauncher;
  if (!isLauncher) document.getElementById('third-party-file').accept = ALLOWED_EXTENSIONS[activeTab].join(',');
  document.getElementById('third-party-icon').required = isLauncher;
  document.getElementById('third-party-download-url').required = isLauncher;
  document.getElementById('third-party-compose-hint').innerHTML = isLauncher
    ? `Posting to <strong id="third-party-compose-category-label">Launchers</strong>. Add an icon, name, description, and links.`
    : `Posting to <strong id="third-party-compose-category-label">${TAB_LABELS[activeTab]}</strong>. Accepted files: ${ALLOWED_EXTENSIONS[activeTab].join(', ')} (up to 5MB).`;
  document.getElementById('third-party-compose-modal').classList.add('open');
}

function closeComposeModal() {
  document.getElementById('third-party-compose-modal').classList.remove('open');
  document.getElementById('third-party-compose-form').reset();
}

function fileExtensionOf(name) {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

async function handlePost(e) {
  e.preventDefault();
  const auth = await requireAuth();
  if (!auth) return;

  const isLauncher = activeTab === 'launcher';
  if (isLauncher && !isStaff(currentProfile)) {
    showToast('Only mods and admins can post launchers.', true);
    return;
  }

  const title = document.getElementById('third-party-title').value.trim();
  const description = document.getElementById('third-party-description').value.trim();
  if (title.length < minTitleLength) {
    showToast(`Title must be at least ${minTitleLength} characters.`, true);
    return;
  }
  if (title.length > maxTitleLength) {
    showToast(`Title must be ${maxTitleLength} characters or fewer.`, true);
    return;
  }
  if (description.length < minDescriptionLength) {
    showToast(`Description must be at least ${minDescriptionLength} characters, or left blank.`, true);
    return;
  }
  if (description.length > maxDescriptionLength) {
    showToast(`Description must be ${maxDescriptionLength} characters or fewer.`, true);
    return;
  }

  const submitBtn = document.getElementById('third-party-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading…';

  try {
    if (isLauncher) {
      const icon = document.getElementById('third-party-icon').files[0];
      const downloadUrl = document.getElementById('third-party-download-url').value.trim();
      const githubUrl = document.getElementById('third-party-github-url').value.trim();
      if (!icon) { showToast('Add an icon.', true); return; }
      if (icon.size > MAX_FILE_BYTES) { showToast('Icon must be 5MB or smaller.', true); return; }
      if (!downloadUrl) { showToast('Add a download link.', true); return; }

      const path = `launcher-icons/${auth.user.id}/${Date.now()}-${icon.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const { error: uploadError } = await sb.storage.from('third-party-files').upload(path, icon);
      if (uploadError) { showToast(uploadError.message, true); return; }
      const { data: urlData } = sb.storage.from('third-party-files').getPublicUrl(path);

      const { error } = await sb.from('third_party_posts').insert({
        user_id: auth.user.id,
        category: 'launcher',
        title,
        description: description || null,
        icon_url: urlData.publicUrl,
        download_url: downloadUrl,
        github_url: githubUrl || null,
      });
      if (error) { showToast(error.message, true); return; }
    } else {
      const file = document.getElementById('third-party-file').files[0];
      if (!file) { showToast('Choose a file to share.', true); return; }
      const ext = fileExtensionOf(file.name);
      if (!ALLOWED_EXTENSIONS[activeTab].includes(ext)) {
        showToast(`Only ${ALLOWED_EXTENSIONS[activeTab].join(', ')} files are accepted.`, true);
        return;
      }
      if (file.size > MAX_FILE_BYTES) { showToast('File must be 5MB or smaller.', true); return; }

      const path = `${activeTab}/${auth.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const { error: uploadError } = await sb.storage.from('third-party-files').upload(path, file);
      if (uploadError) { showToast(uploadError.message, true); return; }
      const { data: urlData } = sb.storage.from('third-party-files').getPublicUrl(path);

      const { error } = await sb.from('third_party_posts').insert({
        user_id: auth.user.id,
        category: activeTab,
        title,
        description: description || null,
        file_url: urlData.publicUrl,
        file_name: file.name,
      });
      if (error) { showToast(error.message, true); return; }
    }

    showToast('Shared!');
    closeComposeModal();
    loadList();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Share File';
  }
}
