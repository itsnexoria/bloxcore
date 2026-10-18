// BloxCore — feed/index.html logic (public Twitter-like post feed)

let currentUser = null;
let currentProfile = null;
let pendingImageFile = null;
let pendingItemId = null;
let followingIds = new Set();
let blockedMap = new Map(); // user_id -> 'block' | 'mute' (anyone I've hidden from my feed)
let pendingPoll = null;     // { options: [], hours } while the poll builder is open
let myCrewId = null;
let feedTag = null;
let feedItemCategory = 'fruit';
let allFeedTagItems = [];

const FEED_PAGE_SIZE = 20;
const CHAR_RING_CIRCUMFERENCE = 2 * Math.PI * 9; // r=9, matches the SVG in feed/index.html

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;

  if (currentUser) {
    document.getElementById('feed-compose').style.display = 'block';
    document.getElementById('feed-compose-avatar').innerHTML = avatarHtml(currentProfile, 44);
    document.getElementById('feed-tab-saved').style.display = 'inline-flex';

    const [{ data: followData }, { data: membership }, { data: relData }] = await Promise.all([
      sb.from('follows').select('followed_id').eq('follower_id', currentUser.id),
      sb.from('crew_members').select('crew_id').eq('user_id', currentUser.id).maybeSingle(),
      sb.from('blocked_users').select('blocked_id, kind').eq('blocker_id', currentUser.id),
    ]);
    followingIds = new Set((followData || []).map(r => r.followed_id));
    blockedMap = new Map((relData || []).map(r => [r.blocked_id, r.kind]));
    if (membership) {
      myCrewId = membership.crew_id;
      document.getElementById('feed-tab-crew').style.display = 'inline-flex';
      document.getElementById('feed-compose-visibility').style.display = 'block';
    }
  } else {
    document.getElementById('feed-signed-out').style.display = 'block';
    document.getElementById('feed-tab-following').disabled = true;
    document.getElementById('feed-tab-following').title = 'Sign in to see posts from people you follow';
  }

  document.getElementById('feed-post-input').addEventListener('input', updateCharCount);
  document.getElementById('feed-attach-btn').addEventListener('click', () => document.getElementById('feed-image-input').click());
  document.getElementById('feed-image-input').addEventListener('change', handleImageSelect);
  document.getElementById('feed-image-remove-btn').addEventListener('click', clearImageSelection);
  document.getElementById('feed-attach-item-btn').addEventListener('click', openFeedItemPicker);
  document.getElementById('feed-poll-btn').addEventListener('click', () => (pendingPoll ? closePollBuilder() : openPollBuilder()));
  document.getElementById('feed-item-picker-close').addEventListener('click', () => {
    document.getElementById('feed-item-picker-modal').classList.remove('open');
  });
  document.getElementById('feed-item-chip-remove').addEventListener('click', clearItemSelection);
  document.getElementById('feed-item-picker-search').addEventListener('input', renderFeedItemPickerGrid);
  document.querySelectorAll('#feed-item-category-tabs [data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      feedItemCategory = btn.dataset.category;
      document.querySelectorAll('#feed-item-category-tabs [data-category]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.category === feedItemCategory ? 'btn-primary' : 'btn-ghost'}`;
      });
      renderFeedItemPickerGrid();
    });
  });
  document.getElementById('feed-post-btn').addEventListener('click', handlePost);

  document.querySelectorAll('#feed-tabs [data-feed-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchFeedTab(btn.dataset.feedTab));
  });
  document.getElementById('feed-tag-clear-btn').addEventListener('click', clearTagFilter);

  loadPulseStats();
  loadSidebarTrending();
  loadSidebarTopPlayers();
  if (currentUser) loadSidebarSuggestions();
  else document.getElementById('feed-sidebar-suggestions-card').style.display = 'none';

  if (currentUser) await loadPendingRepostFromUrl();

  const urlTag = new URLSearchParams(window.location.search).get('tag');
  if (urlTag) applyTagFilter(urlTag, false);

  await loadFeed();
});

let pendingRepost = null; // { type: 'trade_listing'|'crew_war', id }

async function loadPendingRepostFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tradeId = params.get('repost_trade');
  const warId = params.get('repost_war');
  if (!tradeId && !warId) return;

  const preview = document.getElementById('feed-repost-preview');
  preview.style.display = 'block';
  preview.innerHTML = `<div class="skeleton" style="height:70px;"></div>`;
  let embedHtml = '';

  if (tradeId) {
    const { data: listing } = await sb.from('trade_listings').select('*, profiles(username, display_name, avatar_url, avatar_frame)').eq('id', tradeId).maybeSingle();
    if (!listing) { preview.style.display = 'none'; return; }
    pendingRepost = { type: 'trade_listing', id: tradeId };
    const adapted = {
      repost_trade_listing_id: listing.id,
      rt_offering_item_ids: listing.offering_item_ids, rt_requesting_item_ids: listing.requesting_item_ids,
      rt_active: listing.active, rt_username: listing.profiles?.username, rt_display_name: listing.profiles?.display_name,
      rt_avatar_url: listing.profiles?.avatar_url, rt_avatar_frame: listing.profiles?.avatar_frame,
    };
    await hydrateRepostItemCache([adapted]);
    embedHtml = buildTradeEmbedHtml(adapted);
  } else if (warId) {
    const { data: war } = await sb.from('crew_wars').select('*, challenger:challenger_crew_id(id, name, tag, logo_url), defender:defender_crew_id(id, name, tag, logo_url)').eq('id', warId).maybeSingle();
    if (!war) { preview.style.display = 'none'; return; }
    pendingRepost = { type: 'crew_war', id: warId };
    const adapted = {
      cw_status: war.status, cw_winner_crew_id: war.winner_crew_id,
      cw_challenger_id: war.challenger?.id, cw_challenger_name: war.challenger?.name, cw_challenger_tag: war.challenger?.tag, cw_challenger_logo: war.challenger?.logo_url,
      cw_defender_id: war.defender?.id, cw_defender_name: war.defender?.name, cw_defender_tag: war.defender?.tag, cw_defender_logo: war.defender?.logo_url,
    };
    embedHtml = buildWarEmbedHtml(adapted);
  }

  preview.innerHTML = `
    <div style="position:relative;">
      <button type="button" id="feed-repost-remove-btn" class="btn btn-ghost btn-sm" style="position:absolute; top:8px; right:8px; z-index:1;" aria-label="Remove"><i data-lucide="x" class="icon-sm"></i></button>
      ${embedHtml}
    </div>
  `;
  document.getElementById('feed-repost-remove-btn').addEventListener('click', () => {
    pendingRepost = null;
    preview.style.display = 'none';
    preview.innerHTML = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('repost_trade');
    url.searchParams.delete('repost_war');
    window.history.replaceState({}, '', url);
  });
  refreshIcons();
}

let feedTab = 'latest';

function switchFeedTab(tab) {
  if (tab === feedTab || (tab === 'following' && !currentUser)) return;
  feedTab = tab;
  if (feedTag) clearTagFilter(false);
  document.querySelectorAll('#feed-tabs [data-feed-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.feedTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  refreshIcons();
  loadFeed();
}

function applyTagFilter(tag, shouldLoad = true) {
  feedTag = tag.toLowerCase();
  document.getElementById('feed-tag-banner').style.display = 'flex';
  document.getElementById('feed-tag-banner-text').textContent = `#${feedTag}`;
  document.querySelectorAll('#feed-tabs [data-feed-tab]').forEach(btn => { btn.className = 'btn btn-sm btn-ghost'; });
  const url = new URL(window.location.href);
  url.searchParams.set('tag', feedTag);
  window.history.replaceState({}, '', url);
  if (shouldLoad) loadFeed();
}

function clearTagFilter(shouldLoad = true) {
  feedTag = null;
  document.getElementById('feed-tag-banner').style.display = 'none';
  const url = new URL(window.location.href);
  url.searchParams.delete('tag');
  window.history.replaceState({}, '', url);
  if (shouldLoad) {
    document.querySelectorAll('#feed-tabs [data-feed-tab]').forEach(btn => {
      btn.className = `btn btn-sm ${btn.dataset.feedTab === feedTab ? 'btn-primary' : 'btn-ghost'}`;
    });
    loadFeed();
  }
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

async function openFeedItemPicker() {
  if (!allFeedTagItems.length) allFeedTagItems = await fetchBfItemCatalog(['fruit', 'limited', 'gamepass']);
  document.getElementById('feed-item-picker-search').value = '';
  renderFeedItemPickerGrid();
  document.getElementById('feed-item-picker-modal').classList.add('open');
}

function renderFeedItemPickerGrid() {
  const query = document.getElementById('feed-item-picker-search').value.trim().toLowerCase();
  const grid = document.getElementById('feed-item-picker-grid');
  const items = allFeedTagItems.filter(i => i.category === feedItemCategory && (!query || i.name.toLowerCase().includes(query)));
  grid.innerHTML = items.length
    ? items.map(pickerTileHtml).join('')
    : `<p class="muted" style="grid-column:1/-1; text-align:center; font-size:0.82rem;">No items match.</p>`;
  refreshIcons();
  grid.querySelectorAll('[data-pick-item]').forEach(tile => {
    tile.addEventListener('click', () => setItemSelection(Number(tile.dataset.pickItem)));
  });
}

function setItemSelection(itemId) {
  const item = allFeedTagItems.find(i => i.id === itemId);
  if (!item) return;
  pendingItemId = itemId;
  document.getElementById('feed-item-chip-icon').src = item.icon_url || '';
  document.getElementById('feed-item-chip-name').textContent = item.name;
  document.getElementById('feed-item-chip').style.display = 'flex';
  document.getElementById('feed-item-picker-modal').classList.remove('open');
}

function clearItemSelection() {
  pendingItemId = null;
  document.getElementById('feed-item-chip').style.display = 'none';
}

async function handlePost() {
  const auth = await requireAuth();
  if (!auth) return;

  const input = document.getElementById('feed-post-input');
  const content = input.value.trim();
  if (!content && !pendingImageFile && !pendingRepost && !pendingItemId) return;
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

  let pollOptions = null;
  if (pendingPoll) {
    pollOptions = [...new Set(pendingPoll.options.map(o => o.trim()).filter(Boolean))];
    if (!content) { showToast('Write your poll question in the post box first.', true); btn.disabled = false; return; }
    if (pollOptions.length < 2) { showToast('A poll needs at least two different options.', true); btn.disabled = false; return; }
  }

  const { data: newPost, error } = await sb.from('feed_posts').insert({
    user_id: auth.user.id,
    content: content || (pendingRepost ? '' : pendingItemId ? '' : '📷'),
    image_url,
    tagged_item_id: pendingItemId,
    repost_trade_listing_id: pendingRepost?.type === 'trade_listing' ? pendingRepost.id : null,
    repost_crew_war_id: pendingRepost?.type === 'crew_war' ? pendingRepost.id : null,
    visibility: myCrewId && document.getElementById('feed-post-visibility').value === 'crew' ? 'crew' : 'public',
    crew_id: myCrewId && document.getElementById('feed-post-visibility').value === 'crew' ? myCrewId : null,
  }).select('id').single();
  if (error) { btn.disabled = false; showToast(error.message, true); return; }

  if (pollOptions) {
    const { error: pollError } = await sb.from('feed_polls').insert({
      post_id: newPost.id, options: pollOptions, ends_at: new Date(Date.now() + pendingPoll.hours * 3600 * 1000).toISOString(),
    });
    if (pollError) {
      await sb.from('feed_posts').delete().eq('id', newPost.id); // don't leave a question with no options behind
      btn.disabled = false;
      showToast(pollError.message, true);
      return;
    }
  }
  btn.disabled = false;
  closePollBuilder();

  input.value = '';
  updateCharCount();
  clearImageSelection();
  clearItemSelection();
  if (pendingRepost) {
    pendingRepost = null;
    document.getElementById('feed-repost-preview').style.display = 'none';
    document.getElementById('feed-repost-preview').innerHTML = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('repost_trade');
    url.searchParams.delete('repost_war');
    window.history.replaceState({}, '', url);
  }
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

// --- Feed list ---------------------------------------------------------------

async function loadFeed() {
  const container = document.getElementById('feed-list');
  const empty = document.getElementById('feed-empty');
  empty.style.display = 'none';
  container.innerHTML = `<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div>`;

  const data = await fetchFeedPage(0, FEED_PAGE_SIZE);
  if (data === null || !data.length) {
    container.innerHTML = '';
    empty.textContent = feedTag
      ? `No posts tagged #${feedTag} yet.`
      : feedTab === 'trending'
      ? 'Nothing trending in the last 24 hours yet.'
      : feedTab === 'following'
      ? "No posts yet from people you follow — go follow some pirates."
      : feedTab === 'saved'
      ? "You haven't saved any posts yet — tap the bookmark icon on a post to save it."
      : feedTab === 'crew'
      ? "No crew-only posts yet — start the conversation."
      : 'No posts yet — be the first to share something.';
    empty.style.display = 'block';
    return;
  }

  container.innerHTML = data.map(renderPost).join('');
  wirePostActions(container);
  refreshIcons();
  renderTikTokEmbeds(container);
  loadLinkPreviews(container);
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
        const newEls = [...container.querySelectorAll('[data-post-id]')].filter(el => ids.has(el.dataset.postId));
        newEls.forEach(el => wirePostActions(el));
        refreshIcons();
        newEls.forEach(el => { renderTikTokEmbeds(el); loadLinkPreviews(el); });
      },
    });
  }
}

let feedItemsCache = new Map(); // bf_items rows, keyed by id — shared across repost embeds

async function fetchFeedPage(offset, pageSize) {
  const { data, error } = await sb.rpc('get_feed_page', {
    p_limit: pageSize, p_offset: offset,
    p_trending: !feedTag && feedTab === 'trending',
    p_following: !feedTag && feedTab === 'following',
    p_tag: feedTag,
    p_bookmarked_only: !feedTag && feedTab === 'saved',
    p_crew_only: !feedTag && feedTab === 'crew',
  });
  if (error) { logError('Failed to load feed', error); return null; }
  await hydrateRepostItemCache(data);
  return data;
}

async function hydrateRepostItemCache(rows) {
  const ids = new Set();
  (rows || []).forEach(p => {
    if (!p.repost_trade_listing_id) return;
    (p.rt_offering_item_ids || []).forEach(e => { if (!feedItemsCache.has(e.id)) ids.add(e.id); });
    (p.rt_requesting_item_ids || []).forEach(e => { if (!feedItemsCache.has(e.id)) ids.add(e.id); });
  });
  if (!ids.size) return;
  const { data: items } = await sb.from('bf_items').select('*').in('id', [...ids]);
  (items || []).forEach(item => feedItemsCache.set(item.id, item));
}

function summarizeRepostSide(entries) {
  let total = 0;
  const tiles = (entries || []).map(e => {
    const item = feedItemsCache.get(e.id);
    if (!item) return '';
    total += valueFor(item, e.valueType) || 0;
    return valueTileHtml(item, e.valueType, { editable: false });
  }).join('');
  return { total, tiles };
}

function feedFairBadge(offerTotal, requestTotal) {
  if (!offerTotal || !requestTotal) return '';
  const diffPct = Math.round(((requestTotal - offerTotal) / offerTotal) * 100);
  if (Math.abs(diffPct) <= 8) return `<span class="tag tag-easy" style="font-size:0.65rem;"><i data-lucide="scale" class="icon-sm icon-inline"></i>Roughly Fair</span>`;
  if (diffPct > 0) return `<span class="tag tag-hard" style="font-size:0.65rem;"><i data-lucide="trending-up" class="icon-sm icon-inline"></i>Requesting +${diffPct}%</span>`;
  return `<span class="tag tag-medium" style="font-size:0.65rem;"><i data-lucide="trending-down" class="icon-sm icon-inline"></i>Offering +${Math.abs(diffPct)}%</span>`;
}

function buildTradeEmbedHtml(p) {
  const offer = summarizeRepostSide(p.rt_offering_item_ids);
  const request = summarizeRepostSide(p.rt_requesting_item_ids);
  const profile = { username: p.rt_username, display_name: p.rt_display_name, avatar_url: p.rt_avatar_url, avatar_frame: p.rt_avatar_frame };
  return `
    <a href="/trading/#${p.repost_trade_listing_id}" class="panel feed-repost-embed" style="display:block; text-decoration:none; color:inherit;">
      <div style="display:flex; align-items:center; gap:8px;">
        ${avatarHtml(profile, 24)}
        <span style="font-size:0.78rem; color:var(--bone); font-weight:700;">${escapeHtml(displayNameFor(profile))}</span>
        <span class="muted" style="font-size:0.7rem;">trade listing</span>
        ${!p.rt_active ? `<span class="tag tag-medium" style="font-size:0.62rem;">Closed</span>` : ''}
      </div>
      <div class="trade-columns-wrap" style="margin-top:8px;">
        <div class="trade-columns">
          <div><div class="trade-side-header" style="color:var(--sea); font-size:0.72rem;">Offering <span class="trade-side-total">${formatValue(offer.total)}</span></div><div class="trade-item-grid">${offer.tiles}</div></div>
          <div class="trade-arrow"><i data-lucide="arrow-right" class="icon-sm"></i></div>
          <div><div class="trade-side-header" style="color:var(--gold-bright); font-size:0.72rem;">Requesting <span class="trade-side-total">${formatValue(request.total)}</span></div><div class="trade-item-grid">${request.tiles}</div></div>
        </div>
      </div>
      <div style="margin-top:8px;">${feedFairBadge(offer.total, request.total)}</div>
    </a>
  `;
}

function crewChipMini(crew) {
  if (!crew || !crew.name) return `<span class="muted" style="font-size:0.8rem;">Unknown crew</span>`;
  return `
    ${crew.logo_url ? `<img src="${safeImgUrl(crew.logo_url)}" alt="" style="width:32px; height:32px; border-radius:8px; object-fit:cover;">` : `<div style="width:32px; height:32px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; color:var(--ash); margin:0 auto;">${escapeHtml((crew.name[0] || '?').toUpperCase())}</div>`}
    <p style="margin:4px 0 0; font-size:0.76rem; color:var(--bone);">${crew.tag ? `[${escapeHtml(crew.tag)}] ` : ''}${escapeHtml(crew.name)}</p>
  `;
}

function buildWarEmbedHtml(p) {
  const challenger = { id: p.cw_challenger_id, name: p.cw_challenger_name, tag: p.cw_challenger_tag, logo_url: p.cw_challenger_logo };
  const defender = { id: p.cw_defender_id, name: p.cw_defender_name, tag: p.cw_defender_tag, logo_url: p.cw_defender_logo };
  const winnerName = p.cw_status === 'completed' && p.cw_winner_crew_id
    ? (p.cw_winner_crew_id === challenger.id ? challenger.name : defender.name)
    : null;
  return `
    <div class="panel feed-repost-embed">
      <p class="muted" style="margin:0 0 10px; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.04em;">Crew War Result</p>
      <div style="display:flex; align-items:center; justify-content:center; gap:16px; text-align:center;">
        <div style="flex:1;">${crewChipMini(challenger)}</div>
        <span class="muted" style="font-size:0.75rem; font-family:var(--font-mono);">VS</span>
        <div style="flex:1;">${crewChipMini(defender)}</div>
      </div>
      ${winnerName ? `<p style="text-align:center; margin:10px 0 0; color:var(--gold-bright); font-weight:700; font-size:0.82rem;"><i data-lucide="trophy" class="icon-sm icon-inline"></i>${escapeHtml(winnerName)} won</p>` : ''}
    </div>
  `;
}

function linkifyHashtags(content) {
  const withHashtags = escapeHtml(content).replace(/(^|[\s])#([a-zA-Z][a-zA-Z0-9_]{1,30})/g, (match, pre, tag) =>
    `${pre}<a href="/feed/?tag=${encodeURIComponent(tag.toLowerCase())}" data-hashtag-link="${escapeHtml(tag.toLowerCase())}" style="color:var(--blue); text-decoration:none;">#${escapeHtml(tag)}</a>`
  );
  // @username → profile link (the DB trigger notifies the mentioned player)
  const withMentions = withHashtags.replace(/(^|[\s])@([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)/g, (match, pre, name) =>
    `${pre}<a href="/player/?u=${encodeURIComponent(name)}" class="fp-mention">@${escapeHtml(name)}</a>`
  );
  // Bare URLs pasted into a post (e.g. a YouTube/TikTok link) aren't clickable by default —
  // linkify them too, on top of the embed card rendered separately below the post.
  // `withHashtags` is already HTML-escaped (quotes included), so `url` can't break out of the attribute.
  return withMentions.replace(/(^|[\s])(https?:\/\/[^\s<]+)/g, (match, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" style="color:var(--sea); text-decoration:underline; word-break:break-all;">${url}</a>`
  );
}

// Finds the first http(s) link in a post's raw text and classifies it so the post can
// render an inline embed: a native YouTube player, TikTok's official embed widget, or a
// generic Open-Graph link-preview card (fetched server-side via an edge function).
function detectEmbed(content) {
  const m = content.match(/https?:\/\/[^\s<]+/);
  if (!m) return null;
  const url = m[0].replace(/[.,)]+$/, ''); // trim trailing punctuation caught by the match
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const idMatch =
      url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/);
    if (idMatch) return { type: 'youtube', url, videoId: idMatch[1] };
  }
  if (host.endsWith('tiktok.com')) {
    return { type: 'tiktok', url };
  }
  return { type: 'link', url };
}

function embedHtml(embed) {
  if (!embed) return '';
  if (embed.type === 'youtube') {
    return `<div class="feed-embed-video" style="margin-top:12px; position:relative; padding-top:56.25%; border-radius:8px; overflow:hidden; background:#000;">
      <iframe src="https://www.youtube-nocookie.com/embed/${embed.videoId}" style="position:absolute; inset:0; width:100%; height:100%; border:0;"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded YouTube video"></iframe>
    </div>`;
  }
  if (embed.type === 'tiktok') {
    return `<blockquote class="tiktok-embed" cite="${escapeHtml(embed.url)}" style="max-width:605px; min-width:280px; margin:12px auto 0;"><section></section></blockquote>`;
  }
  // Generic link preview: filled in asynchronously by loadLinkPreviews() after mount.
  return `<div class="feed-link-preview-slot" data-preview-url="${escapeHtml(embed.url)}"></div>`;
}

// Mini item card for a post tagged with a bf_items entry via the composer's "Tag an item"
// button — same value/rarity data source as /trading/, just a compact single-item flex card.
function taggedItemEmbedHtml(p) {
  const rarity = (p.ti_rarity || '').toLowerCase();
  const value = p.ti_permanent_value ?? p.ti_regular_value;
  return `
    <a href="/trading/" class="panel feed-tagged-item-card" data-rarity="${rarity}" style="display:flex; align-items:center; gap:12px; text-decoration:none; color:inherit; margin-top:12px; padding:10px 14px;">
      ${p.ti_icon_url ? `<img src="${escapeHtml(p.ti_icon_url)}" alt="" loading="lazy" style="width:44px; height:44px; object-fit:contain; flex-shrink:0;">` : `<i data-lucide="gem" class="icon-lg" style="flex-shrink:0;"></i>`}
      <div style="min-width:0;">
        <p class="muted" style="margin:0 0 2px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.04em;">${escapeHtml(p.ti_category || 'Item')}${rarity ? ` · ${escapeHtml(rarity)}` : ''}</p>
        <p style="margin:0; font-weight:700; font-size:0.9rem;">${escapeHtml(p.ti_name || 'Item')}</p>
        ${value ? `<p class="muted" style="margin:2px 0 0; font-size:0.78rem;"><i data-lucide="coins" class="icon-sm icon-inline"></i>${formatValue(value)}</p>` : ''}
      </div>
    </a>`;
}

function buildLinkPreviewCardHtml(url, data) {
  let hostname = url;
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return `
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow" class="panel feed-link-preview-card" style="display:flex; gap:12px; text-decoration:none; color:inherit; overflow:hidden; padding:0; margin-top:12px;">
      ${data.image ? `<img src="${escapeHtml(data.image)}" alt="" loading="lazy" style="width:110px; height:110px; object-fit:cover; flex-shrink:0;">` : ''}
      <div style="padding:10px 12px 10px 0; min-width:0; align-self:center;">
        <p class="muted" style="margin:0 0 2px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.04em;">${escapeHtml(data.site_name || hostname)}</p>
        <p style="margin:0 0 4px; font-weight:700; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(data.title || url)}</p>
        ${data.description ? `<p class="muted" style="margin:0; font-size:0.75rem; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(data.description)}</p>` : ''}
      </div>
    </a>`;
}

// TikTok's own embed.js only auto-renders blockquote.tiktok-embed elements present in the
// DOM the moment it executes. Since feed posts render dynamically (initial load + infinite
// scroll), re-inject a fresh copy of the script whenever new TikTok embeds appear so it
// re-scans and picks up the ones it hasn't processed yet.
function renderTikTokEmbeds(root) {
  if (!root.querySelector('blockquote.tiktok-embed')) return;
  const old = document.getElementById('tiktok-embed-script');
  if (old) old.remove();
  const script = document.createElement('script');
  script.id = 'tiktok-embed-script';
  script.async = true;
  script.src = 'https://www.tiktok.com/embed.js';
  document.body.appendChild(script);
}

// Twitter/X's widgets.js exposes a proper re-scan API (unlike TikTok's), so it only needs
// loading once — after that, calling twttr.widgets.load() picks up any new tweet
// blockquotes without re-injecting the script.
function renderTwitterEmbeds(root) {
  if (!root.querySelector('blockquote.twitter-tweet')) return;
  if (window.twttr && window.twttr.widgets) {
    window.twttr.widgets.load(root);
    return;
  }
  if (document.getElementById('twitter-embed-script')) return; // already loading
  const script = document.createElement('script');
  script.id = 'twitter-embed-script';
  script.async = true;
  script.src = 'https://platform.twitter.com/widgets.js';
  document.body.appendChild(script);
}

async function loadLinkPreviews(root) {
  const slots = [...root.querySelectorAll('[data-preview-url]')];
  if (!slots.length) return;
  // Dedupe: several posts could link the same URL in one batch — fetch it once.
  const urls = [...new Set(slots.map(el => el.dataset.previewUrl))];
  const results = await Promise.all(urls.map(async url => {
    try {
      const { data, error } = await sb.functions.invoke('fetch-link-preview', { body: { url } });
      if (error || !data || data.fetch_failed) return [url, null];
      return [url, data];
    } catch {
      return [url, null];
    }
  }));
  const byUrl = new Map(results);
  slots.forEach(el => {
    // The feed can re-render (new post, filter change) while these previews were in flight,
    // detaching `el` from the document — writing outerHTML to a detached node throws
    // NoModificationAllowedError, so skip anything that's no longer actually on the page.
    if (!el.isConnected) return;
    const data = byUrl.get(el.dataset.previewUrl);
    if (data && data.embed_html) {
      el.outerHTML = `<div class="feed-tweet-embed" style="margin-top:12px;">${data.embed_html}</div>`;
    } else if (data && (data.title || data.image || data.description)) {
      el.outerHTML = buildLinkPreviewCardHtml(el.dataset.previewUrl, data);
    } else {
      el.remove(); // no usable preview data — the URL is still clickable in the post text itself
    }
  });
  renderTwitterEmbeds(root);
}

function renderPost(p) {
  const profile = {
    username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, avatar_frame: p.avatar_frame,
    title_color_override: p.title_color_override, titles: p.title_name ? { name: p.title_name, color: p.title_color } : null,
  };
  const isOwner = currentUser && currentUser.id === p.user_id;
  const isPinned = currentProfile && currentProfile.pinned_feed_post_id === p.id;
  const embed = detectEmbed(p.content || '');
  const profileUrl = `/player/?u=${encodeURIComponent(p.username || '')}`;
  const img = p.image_url ? safeImgUrl(p.image_url) : '';

  const tools = isOwner
    ? `<button class="fp-tool${isPinned ? ' is-on' : ''}" data-pin-post="${p.id}" aria-label="${isPinned ? 'Unpin from profile' : 'Pin to profile'}" title="${isPinned ? 'Unpin from profile' : 'Pin to profile'}"><i data-lucide="pin" class="icon-sm"></i></button>
       <button class="fp-tool fp-tool-bad" data-delete-post="${p.id}" aria-label="Delete post" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>`
    : (currentUser ? `<div class="fp-menu-wrap">
         <button class="fp-tool" data-post-menu aria-haspopup="menu" aria-expanded="false" aria-label="More actions" title="More"><i data-lucide="more-horizontal" class="icon-sm"></i></button>
         <div class="fp-menu" role="menu" hidden>
           <button type="button" role="menuitem" data-report-post="${p.id}"><i data-lucide="flag" class="icon-sm"></i>Report post</button>
           <button type="button" role="menuitem" data-hide-user="${p.user_id}" data-hide-kind="mute" data-username="${escapeHtml(p.username || '')}"><i data-lucide="volume-x" class="icon-sm"></i>Mute @${escapeHtml(p.username || '')}</button>
           <button type="button" role="menuitem" class="is-danger" data-hide-user="${p.user_id}" data-hide-kind="block" data-username="${escapeHtml(p.username || '')}"><i data-lucide="ban" class="icon-sm"></i>Block @${escapeHtml(p.username || '')}</button>
         </div>
       </div>` : '');

  return `
    <article class="panel feed-post-card hover-lift-card${isPinned ? ' is-pinned-post' : ''}" data-post-id="${p.id}" data-author="${p.user_id}" id="post-${p.id}">
      <header class="fp-head">
        <a href="${profileUrl}" class="fp-avatar" aria-label="${escapeHtml(displayNameFor(profile))}">${avatarHtml(profile, 44)}</a>
        <div class="fp-who">
          <div class="fp-name-line"><a href="${profileUrl}" class="fp-name">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)}</div>
          <p class="fp-meta">${timeAgo(p.created_at)}${p.visibility === 'crew' ? `<span class="fp-chip fp-chip-crew"><i data-lucide="shield" class="icon-sm icon-inline"></i>${escapeHtml(p.crew_name || 'Crew')} only</span>` : ''}${isPinned ? `<span class="fp-chip fp-chip-pin"><i data-lucide="pin" class="icon-sm icon-inline"></i>Pinned</span>` : ''}</p>
        </div>
        <div class="fp-tools">${tools}</div>
      </header>
      ${(p.content || '').trim() ? `<div class="fp-text">${linkifyHashtags(p.content)}</div>` : ''}
      <div class="fp-poll" data-poll-for="${p.id}" hidden></div>
      ${img ? `<a href="${img || '#'}" target="_blank" rel="noopener noreferrer" class="fp-media"><img src="${img}" alt="" loading="lazy"></a>` : ''}
      ${!p.image_url ? embedHtml(embed) : ''}
      ${p.tagged_item_id ? taggedItemEmbedHtml(p) : ''}
      ${p.repost_trade_listing_id ? `<div class="fp-embed">${buildTradeEmbedHtml(p)}</div>` : ''}
      ${p.repost_crew_war_id ? `<div class="fp-embed">${buildWarEmbedHtml(p)}</div>` : ''}
      <footer class="fp-actions">
        <button class="feed-action-btn ${p.liked_by_me ? 'is-active' : ''}" data-like-post="${p.id}" ${!currentUser ? 'disabled' : ''} title="Like">
          <i data-lucide="heart" class="icon-sm"></i><span data-like-count>${p.like_count}</span>
        </button>
        <button class="feed-action-btn" data-toggle-comments="${p.id}" title="Comments">
          <i data-lucide="message-square" class="icon-sm"></i><span data-comment-count>${p.comment_count}</span>
        </button>
        <button class="feed-action-btn" data-copy-post="${p.id}" title="Copy link to this post" aria-label="Copy link">
          <i data-lucide="link" class="icon-sm"></i>
        </button>
        <button class="feed-action-btn fp-save ${p.bookmarked_by_me ? 'is-active' : ''}" data-bookmark-post="${p.id}" ${!currentUser ? 'disabled' : ''} title="${p.bookmarked_by_me ? 'Remove from saved' : 'Save privately'}">
          <i data-lucide="bookmark" class="icon-sm"></i>
        </button>
      </footer>
      <div class="feed-comments-panel" data-comments-panel="${p.id}" style="display:none;"></div>
    </article>
  `;
}

// --- Block / mute (reuses blocked_users, same table the DMs use) ---------------------------

function applyBlockFilter(root) {
  if (!blockedMap.size) return;
  const nodes = [...(root.matches && root.matches('[data-author]') ? [root] : []), ...root.querySelectorAll('[data-author]')];
  nodes.forEach(el => { if (blockedMap.has(el.dataset.author)) el.style.display = 'none'; });
}

function wirePostMenus(root) {
  root.querySelectorAll('[data-post-menu]').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.parentElement.querySelector('.fp-menu');
      const willOpen = menu.hidden;
      closePostMenus();
      menu.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    });
  });
  root.querySelectorAll('[data-hide-user]').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      const { hideUser: userId, hideKind: kind, username } = btn.dataset;
      if (kind === 'block' && !window.confirm(`Block @${username}? You won't see their posts or comments, and they can't message you.`)) return;
      const { error } = await sb.from('blocked_users').upsert({ blocker_id: currentUser.id, blocked_id: userId, kind }, { onConflict: 'blocker_id,blocked_id' });
      if (error) { showToast(error.message, true); return; }
      blockedMap.set(userId, kind);
      document.querySelectorAll(`[data-author="${userId}"]`).forEach(el => { el.style.display = 'none'; });
      showToast(kind === 'block' ? `Blocked @${username}. You can undo this in Settings.` : `Muted @${username}. You can undo this in Settings.`);
    });
  });
}

function closePostMenus() {
  document.querySelectorAll('.fp-menu:not([hidden])').forEach(m => {
    m.hidden = true;
    m.parentElement.querySelector('[data-post-menu]')?.setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('click', closePostMenus);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePostMenus(); });

// --- Polls ----------------------------------------------------------------------------------

function pollTimeLeft(endsAt) {
  const ms = new Date(endsAt) - Date.now();
  if (ms <= 0) return 'Final results';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h left` : `${Math.round(h / 24)}d left`;
}

function renderPollHtml(r) {
  const counts = r.counts || [];
  const total = counts.reduce((a, b) => a + b, 0);
  const ended = new Date(r.ends_at) <= Date.now();
  const showResults = ended || r.my_vote != null || !currentUser;
  const body = (r.options || []).map((label, i) => {
    if (!showResults) return `<button type="button" class="fp-poll-vote" data-poll-vote="${i}">${escapeHtml(label)}</button>`;
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    return `<div class="fp-poll-bar${r.my_vote === i ? ' is-mine' : ''}" style="--pct:${pct}%;"><span class="fp-poll-label">${r.my_vote === i ? '✓ ' : ''}${escapeHtml(label)}</span><b>${pct}%</b></div>`;
  }).join('');
  return `${body}<p class="fp-poll-foot">${total} vote${total === 1 ? '' : 's'} · ${pollTimeLeft(r.ends_at)}${!currentUser ? ' · <a href="/auth/">Sign in</a> to vote' : ''}</p>`;
}

async function hydratePolls(root) {
  const holders = [...root.querySelectorAll('[data-poll-for]')];
  if (!holders.length) return;
  const ids = holders.map(h => h.dataset.pollFor);
  const { data, error } = await sb.rpc('get_feed_poll_results', { p_post_ids: ids });
  if (error || !data) return;
  const byId = new Map(data.map(r => [r.post_id, r]));
  holders.forEach(h => {
    const r = byId.get(h.dataset.pollFor);
    if (r) paintPoll(h, r);
  });
}

function paintPoll(holder, r) {
  holder.innerHTML = renderPollHtml(r);
  holder.hidden = false;
  holder.querySelectorAll('[data-poll-vote]').forEach(btn => btn.addEventListener('click', async () => {
    holder.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const { error } = await sb.from('feed_poll_votes').insert({ post_id: holder.dataset.pollFor, user_id: currentUser.id, option_idx: Number(btn.dataset.pollVote) });
    if (error) { showToast(error.message, true); holder.querySelectorAll('button').forEach(b => { b.disabled = false; }); return; }
    const { data } = await sb.rpc('get_feed_poll_results', { p_post_ids: [holder.dataset.pollFor] });
    if (data && data[0]) paintPoll(holder, data[0]);
  }));
}

// Poll builder (compose box)
function openPollBuilder() {
  pendingPoll = { options: ['', ''], hours: 24 };
  renderPollBuilder();
}
function closePollBuilder() {
  pendingPoll = null;
  const el = document.getElementById('feed-poll-builder');
  el.hidden = true; el.innerHTML = '';
  document.getElementById('feed-poll-btn')?.classList.remove('is-on');
}
function renderPollBuilder() {
  const el = document.getElementById('feed-poll-builder');
  if (!pendingPoll) return;
  el.hidden = false;
  document.getElementById('feed-poll-btn')?.classList.add('is-on');
  el.innerHTML = `
    <div class="fpb-head"><strong>Poll</strong><span class="muted">The post text is your question.</span><button type="button" class="btn btn-ghost btn-sm" id="fpb-remove" aria-label="Remove poll"><i data-lucide="x" class="icon-sm"></i></button></div>
    ${pendingPoll.options.map((o, i) => `<input type="text" class="fpb-opt" data-opt="${i}" maxlength="40" placeholder="Option ${i + 1}" value="${escapeHtml(o)}">`).join('')}
    <div class="fpb-foot">
      ${pendingPoll.options.length < 4 ? `<button type="button" class="btn btn-ghost btn-sm" id="fpb-add"><i data-lucide="plus" class="icon-sm icon-inline"></i>Add option</button>` : '<span></span>'}
      <label class="fpb-dur">Ends in
        <select id="fpb-hours">${[[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '7 days']].map(([h, l]) => `<option value="${h}" ${h === pendingPoll.hours ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
    </div>`;
  el.querySelectorAll('.fpb-opt').forEach(inp => inp.addEventListener('input', () => { pendingPoll.options[Number(inp.dataset.opt)] = inp.value; }));
  el.querySelector('#fpb-hours').addEventListener('change', (e) => { pendingPoll.hours = Number(e.target.value); });
  el.querySelector('#fpb-remove').addEventListener('click', closePollBuilder);
  el.querySelector('#fpb-add')?.addEventListener('click', () => { pendingPoll.options.push(''); renderPollBuilder(); });
  refreshIcons();
}

function wirePostActions(root) {
  root = root || document;
  applyBlockFilter(root);
  hydratePolls(root);
  wirePostMenus(root);
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
  root.querySelectorAll('[data-copy-post]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/feed/#post-${btn.dataset.copyPost}`;
      try { await navigator.clipboard.writeText(url); showToast('Link copied.'); } catch { showToast(url); }
    });
  });
  // Deep link (/feed/#post-<id>, used by the sidebar's Trending Now): scroll to + flash the post once it renders.
  const hashId = location.hash.startsWith('#post-') ? location.hash.slice(1) : '';
  if (hashId && !window.__feedHashHandled) {
    const target = root.querySelector ? root.querySelector('#' + CSS.escape(hashId)) : null;
    if (target) {
      window.__feedHashHandled = true;
      setTimeout(() => { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('is-flash'); }, 150);
    }
  }
  root.querySelectorAll('[data-like-post]').forEach(btn => {
    btn.addEventListener('click', () => toggleLike(btn));
  });
  root.querySelectorAll('[data-bookmark-post]').forEach(btn => {
    btn.addEventListener('click', () => toggleBookmark(btn));
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
  if (!wasActive) { btn.classList.add('is-pop'); setTimeout(() => btn.classList.remove('is-pop'), 500); }

  const { error } = wasActive
    ? await sb.from('feed_likes').delete().eq('post_id', postId).eq('user_id', auth.user.id)
    : await sb.from('feed_likes').insert({ post_id: postId, user_id: auth.user.id });

  if (error) {
    btn.classList.toggle('is-active', wasActive);
    countEl.textContent = Number(countEl.textContent) + (wasActive ? 1 : -1);
    showToast(error.message, true);
  }
}

async function toggleBookmark(btn) {
  const auth = await requireAuth();
  if (!auth) return;
  const postId = btn.dataset.bookmarkPost;
  const wasActive = btn.classList.contains('is-active');

  btn.classList.toggle('is-active', !wasActive);

  const { error } = wasActive
    ? await sb.from('feed_bookmarks').delete().eq('post_id', postId).eq('user_id', auth.user.id)
    : await sb.from('feed_bookmarks').insert({ post_id: postId, user_id: auth.user.id });

  if (error) {
    btn.classList.toggle('is-active', wasActive);
    showToast(error.message, true);
    return;
  }
  showToast(wasActive ? 'Removed from saved.' : 'Saved!');
  if (feedTab === 'saved' && wasActive) btn.closest('[data-post-id]')?.remove();
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

function commentHtml(c, { isReply = false, parentId = null } = {}) {
  const canReply = !!currentUser;
  return `
    <div class="feed-comment-row${isReply ? ' is-reply' : ''}" data-comment-id="${c.id}">
      ${avatarHtml({ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url, avatar_frame: c.avatar_frame }, isReply ? 26 : 30)}
      <div class="fc-main">
        <div class="fc-bubble">
          <div class="fc-top"><a href="/player/?u=${encodeURIComponent(c.username || '')}" class="fc-name">${escapeHtml(displayNameFor(c))}</a><span class="fc-time">${timeAgo(c.created_at)}</span></div>
          <p class="fc-text">${linkifyHashtags(c.content)}</p>
        </div>
        ${canReply ? `<button type="button" class="fc-reply-btn" data-reply-parent="${parentId || c.id}" data-reply-name="${escapeHtml(c.username || '')}">Reply</button>` : ''}
      </div>
    </div>`;
}

async function renderCommentsPanel(postId, panel) {
  panel.innerHTML = `<div class="skeleton" style="height:40px;"></div>`;

  const { data, error } = await sb.rpc('get_feed_post_comments', { p_post_id: postId });
  const all = (error || !data ? [] : data).filter(c => !blockedMap.has(c.user_id));
  const top = all.filter(c => !c.parent_id);
  const repliesByParent = new Map();
  all.filter(c => c.parent_id).forEach(c => {
    if (!repliesByParent.has(c.parent_id)) repliesByParent.set(c.parent_id, []);
    repliesByParent.get(c.parent_id).push(c);
  });
  // Replies whose parent got filtered out (muted/blocked author) are hidden with it.

  panel.innerHTML = `
    <div data-comments-list>
      ${top.length
        ? top.map(c => `
          <div class="fc-thread">
            ${commentHtml(c)}
            ${(repliesByParent.get(c.id) || []).length ? `<div class="fc-replies">${repliesByParent.get(c.id).map(r => commentHtml(r, { isReply: true, parentId: c.id })).join('')}</div>` : ''}
          </div>`).join('')
        : `<p class="muted" style="margin:0 0 10px; font-size:0.8rem;">No comments yet — say something first.</p>`}
    </div>
    ${currentUser ? `
      <div class="fc-replying" data-replying hidden><span data-replying-label></span><button type="button" class="fc-replying-x" data-replying-cancel aria-label="Cancel reply">✕</button></div>
      <form data-comment-form="${postId}" class="fc-form">
        <input type="text" maxlength="280" placeholder="Write a comment…" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">Send</button>
      </form>
    ` : `<p class="muted" style="margin:8px 0 0; font-size:0.78rem;"><a href="/auth/">Sign in</a> to comment.</p>`}
  `;

  const form = panel.querySelector(`[data-comment-form="${postId}"]`);
  form?.addEventListener('submit', (e) => handleAddComment(e, postId, panel));
  const replyBar = panel.querySelector('[data-replying]');
  const clearReply = () => { panel._replyTo = null; if (replyBar) replyBar.hidden = true; };
  panel.querySelector('[data-replying-cancel]')?.addEventListener('click', clearReply);
  panel.querySelectorAll('[data-reply-parent]').forEach(btn => btn.addEventListener('click', () => {
    panel._replyTo = { parentId: btn.dataset.replyParent, name: btn.dataset.replyName };
    replyBar.querySelector('[data-replying-label]').textContent = `Replying to @${btn.dataset.replyName}`;
    replyBar.hidden = false;
    const input = form.querySelector('input');
    input.value = `@${btn.dataset.replyName} `;
    input.focus();
  }));
  refreshIcons();
}

async function handleAddComment(e, postId, panel) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const content = input.value.trim();
  if (!content) return;

  const reply = panel._replyTo;
  const { error } = await sb.from('feed_comments').insert({ post_id: postId, user_id: currentUser.id, content, parent_id: reply ? reply.parentId : null });
  if (error) { showToast(error.message, true); return; }

  panel._replyTo = null;
  await renderCommentsPanel(postId, panel);

  const countEl = document.querySelector(`[data-post-id="${postId}"] [data-comment-count]`);
  if (countEl) countEl.textContent = Number(countEl.textContent) + 1;
}
