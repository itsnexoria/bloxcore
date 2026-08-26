// BloxCore — services/index.html logic (Raids / Trials paid-help listings)

let currentUser = null;
let currentProfile = null;
let activeTab = 'raid';
let myActiveListingCount = 0;
let maxActiveServices = 5;
let allServiceItems = [];
let priceEntries = []; // [{ id, valueType: 'physical' | 'permanent' }]

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4, limited: 5 };
const FRUIT_ORDER_MAP = new Map(BUILD_OPTIONS.fruit.map((f, i) => [f.value.toLowerCase(), i]));
const TAB_LABELS = { raid: 'Raids', trial: 'Trials', dungeon: 'Dungeons' };

function hoursLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  return `${hrs}h`;
}

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;

  const settings = await getSiteSettings();
  maxActiveServices = settings.maxActiveServices;

  const { data } = await sb.from('bf_items').select('*').in('category', ['fruit', 'limited', 'gamepass']);
  allServiceItems = (data || []).slice().sort((a, b) => {
    if (a.category === 'fruit' && b.category === 'fruit') {
      const ai = FRUIT_ORDER_MAP.get(a.name.toLowerCase());
      const bi = FRUIT_ORDER_MAP.get(b.name.toLowerCase());
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
    }
    const rarityDiff = (RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 9) - (RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 9);
    return rarityDiff !== 0 ? rarityDiff : a.name.localeCompare(b.name);
  });

  if (currentUser) {
    document.getElementById('new-listing-btn').style.display = 'inline-flex';
    document.getElementById('new-listing-btn').addEventListener('click', openComposeModal);
  } else {
    document.getElementById('services-signed-out').style.display = 'block';
  }

  document.querySelectorAll('#service-tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('service-compose-close').addEventListener('click', closeComposeModal);
  document.getElementById('service-compose-form').addEventListener('submit', handlePost);
  document.querySelector('[data-open-item-picker]').addEventListener('click', openItemPicker);
  document.getElementById('item-picker-close').addEventListener('click', () => {
    document.getElementById('item-picker-modal').classList.remove('open');
  });
  document.querySelectorAll('#item-category-tabs [data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#item-category-tabs [data-category]').forEach(b => {
        b.className = `btn btn-sm ${b === btn ? 'btn-primary' : 'btn-ghost'}`;
      });
      renderItemPickerGrid(btn.dataset.category);
    });
  });
  document.getElementById('item-picker-search').addEventListener('input', () => {
    const activeCat = document.querySelector('#item-category-tabs .btn-primary')?.dataset.category || 'fruit';
    renderItemPickerGrid(activeCat);
  });

  await refreshMyListingCount();
  const initialTab = new URLSearchParams(window.location.search).get('tab');
  if (initialTab && TAB_LABELS[initialTab]) switchTab(initialTab, { skipReload: true });

  await loadListings();
});

function itemById(id) {
  return allServiceItems.find(i => i.id === id);
}

function valueFor(item, valueType) {
  return valueType === 'permanent' ? (item.permanent_value ?? item.regular_value) : item.regular_value;
}

function formatValue(n) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return String(n);
}

function pickerTileHtml(item) {
  const rarity = (item.rarity || '').toLowerCase();
  return `
    <div class="build-modal-tile" data-rarity="${rarity}" data-pick-item="${item.id}" style="padding:8px;">
      ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-lg"></i>`}
      <span style="font-size:0.72rem;">${escapeHtml(item.name)}</span>
    </div>
  `;
}

function valueTileHtml(item, valueType, { editable = false } = {}) {
  const rarity = (item.rarity || '').toLowerCase();
  const value = valueFor(item, valueType);
  const canToggle = editable && item.category === 'fruit';
  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
      <div class="build-modal-tile" data-rarity="${rarity}" style="width:56px; height:56px; padding:4px; cursor:default;" title="${escapeHtml(item.name)}">
        ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-md"></i>`}
      </div>
      <span style="font-size:0.66rem; font-family:var(--font-mono); color:var(--gold-bright);">${formatValue(value)}</span>
      ${canToggle
        ? `<button type="button" class="tag tag-${valueType === 'permanent' ? 'legendary' : 'medium'}" data-toggle-value-type style="border:none; cursor:pointer;">${valueType === 'permanent' ? 'Permanent' : 'Physical'}</button>`
        : `<span class="tag tag-legendary">Permanent</span>`}
    </div>
  `;
}

function renderPriceSlotList() {
  const container = document.getElementById('price-items');
  container.innerHTML = priceEntries.map((entry, i) => {
    const item = itemById(entry.id);
    if (!item) return '';
    return `
      <div class="trade-slot-tile">
        ${valueTileHtml(item, entry.valueType, { editable: true })}
        <button type="button" class="trade-slot-remove" data-remove-index="${i}">×</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.trade-slot-tile').forEach((tile, i) => {
    tile.querySelector('[data-toggle-value-type]')?.addEventListener('click', () => {
      priceEntries[i].valueType = priceEntries[i].valueType === 'permanent' ? 'physical' : 'permanent';
      renderPriceSlotList();
    });
    tile.querySelector('[data-remove-index]')?.addEventListener('click', () => {
      priceEntries.splice(i, 1);
      renderPriceSlotList();
    });
  });
  refreshIcons();
}

function openItemPicker() {
  document.querySelectorAll('#item-category-tabs [data-category]').forEach(b => {
    b.className = `btn btn-sm ${b.dataset.category === 'fruit' ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('item-picker-search').value = '';
  renderItemPickerGrid('fruit');
  document.getElementById('item-picker-modal').classList.add('open');
}

function renderItemPickerGrid(category) {
  const query = document.getElementById('item-picker-search').value.trim().toLowerCase();
  const items = allServiceItems.filter(i => i.category === category && i.name.toLowerCase().includes(query));
  const grid = document.getElementById('item-picker-grid');

  grid.innerHTML = items.length
    ? items.map(pickerTileHtml).join('')
    : `<p class="muted" style="grid-column:1/-1;">No items found${query ? ' matching your search' : ''}.</p>`;

  grid.querySelectorAll('[data-pick-item]').forEach(tile => {
    tile.addEventListener('click', () => {
      const id = Number(tile.dataset.pickItem);
      if (priceEntries.length >= 4) { showToast('You can add up to 4 items to the price.', true); return; }
      const item = itemById(id);
      priceEntries.push({ id, valueType: item?.category === 'fruit' ? 'physical' : 'permanent' });
      renderPriceSlotList();
      document.getElementById('item-picker-modal').classList.remove('open');
    });
  });
  refreshIcons();
}

function contactPreviewHtml(profile) {
  const roblox = profile?.roblox_username ? escapeHtml(profile.roblox_username) : null;
  const robloxVerified = !!profile?.roblox_verified;
  const discord = profile?.discord_username ? escapeHtml(profile.discord_username) : null;

  if (!roblox && !discord) {
    return `<span class="muted">No Roblox username or linked Discord found. Add your Roblox username or sign in with Discord in <a href="/profile/">Edit Profile</a> so buyers can reach you.</span>`;
  }
  return `
    ${roblox
      ? `<span><i data-lucide="gamepad-2" class="icon-sm icon-inline"></i>Roblox${robloxVerified ? ' (verified)' : ' (unverified)'}: <strong>${roblox}</strong></span>`
      : `<span class="muted"><i data-lucide="gamepad-2" class="icon-sm icon-inline"></i>No Roblox username set — add one in <a href="/profile/">Edit Profile</a></span>`}
    ${discord ? `<span><i data-lucide="message-circle" class="icon-sm icon-inline"></i>Discord: <strong>${discord}</strong></span>` : `<span class="muted"><i data-lucide="message-circle" class="icon-sm icon-inline"></i>No Discord linked — sign in with Discord to show it here</span>`}
  `;
}

function switchTab(tab, { skipReload = false } = {}) {
  activeTab = tab;
  document.querySelectorAll('#service-tabs [data-tab]').forEach(b => {
    b.className = `btn btn-sm ${b.dataset.tab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  if (!skipReload) loadListings();
}

async function refreshMyListingCount() {
  if (!currentUser) return;
  const { count } = await sb
    .from('service_listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('status', 'open');
  myActiveListingCount = count || 0;
  const btn = document.getElementById('new-listing-btn');
  if (btn.style.display !== 'none') {
    btn.innerHTML = `<i data-lucide="plus" class="icon-sm icon-inline"></i>Post a Listing (${myActiveListingCount}/${maxActiveServices})`;
    refreshIcons();
  }
}

async function loadListings() {
  const container = document.getElementById('service-listings');
  const empty = document.getElementById('service-empty');
  container.innerHTML = `<div class="skeleton" style="height:140px;"></div><div class="skeleton" style="height:140px;"></div>`;
  empty.style.display = 'none';

  const data = await fetchServiceListingsPage(0, SERVICE_LISTINGS_PAGE_SIZE);

  if (data === null) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  if (!data.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  const participantsByListing = await fetchDungeonParticipants(data);

  container.innerHTML = data.map(s => renderListing(s, participantsByListing[s.id] || [])).join('');
  wireListingActions(container);
  refreshIcons();
  loadReputationBadges(container, data.map(s => ({ id: s.user_id, createdAt: s.profiles?.created_at })));
  scrollToHashTarget('data-listing-id');

  if (data.length === SERVICE_LISTINGS_PAGE_SIZE) {
    attachLoadMore(container, {
      wrapId: 'service-listings-load-more-wrap',
      pageSize: SERVICE_LISTINGS_PAGE_SIZE,
      initialOffset: data.length,
      fetchPage: async (offset, pageSize) => (await fetchServiceListingsPage(offset, pageSize)) || [],
      renderItem: (s) => renderListing(s, []), // dungeon participants for load-more pages fetched separately below
      onAppend: async (rows) => {
        const participants = await fetchDungeonParticipants(rows);
        if (Object.keys(participants).length) {
          rows.forEach(s => {
            const el = container.querySelector(`[data-listing-id="${s.id}"]`);
            if (el && participants[s.id]) el.outerHTML = renderListing(s, participants[s.id]);
          });
        }
        const ids = new Set(rows.map(r => String(r.id)));
        const newEls = [...container.querySelectorAll('[data-listing-id]')].filter(el => ids.has(el.dataset.listingId));
        newEls.forEach(el => wireListingActions(el));
        refreshIcons();
        loadReputationBadges(container, rows.map(s => ({ id: s.user_id, createdAt: s.profiles?.created_at })));
      },
    });
  }
}

const SERVICE_LISTINGS_PAGE_SIZE = 30;

async function fetchServiceListingsPage(offset, pageSize) {
  const { data, error } = await sb
    .from('service_listings')
    .select('*, profiles(username, display_name, avatar_url, avatar_frame, title_color_override, titles(name, color), roblox_username, roblox_verified, roblox_user_id, discord_username, created_at)')
    .eq('category', activeTab)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { console.error('Failed to load service listings', error); return null; }
  return data;
}

async function fetchDungeonParticipants(listings) {
  const participantsByListing = {};
  if (activeTab !== 'dungeon' || !listings.length) return participantsByListing;
  const { data: participants } = await sb
    .from('service_dungeon_participants')
    .select('listing_id, user_id, profiles(username, display_name, avatar_url, avatar_frame)')
    .in('listing_id', listings.map(s => s.id));
  (participants || []).forEach(p => {
    (participantsByListing[p.listing_id] ||= []).push(p);
  });
  return participantsByListing;
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

function priceSummary(entries) {
  let total = 0;
  const tiles = (entries || []).map(entry => {
    const item = itemById(entry.id);
    if (!item) return '';
    total += valueFor(item, entry.valueType) || 0;
    return valueTileHtml(item, entry.valueType);
  }).join('');
  return { total, tiles };
}

function renderListing(s, participants) {
  const profile = s.profiles || {};
  const isOwner = currentUser && s.user_id === currentUser.id;

  if (s.category === 'dungeon') return renderDungeonListing(s, profile, isOwner, participants || []);

  const price = priceSummary(s.price_item_ids);
  const roblox = profile.roblox_username || null;
  const robloxVerified = !!profile.roblox_verified;
  const robloxUserId = profile.roblox_user_id || null;
  const discord = profile.discord_username || null;

  return `
    <div class="panel" data-listing-id="${s.id}">
      <div class="flex-between">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(profile, 30)}
          <div>
            <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)} <span data-rep-for="${s.user_id}"></span>
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(s.created_at)} · expires in ${hoursLeft(s.expires_at)}</p>
            <span data-new-account-for="${s.user_id}"></span>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          ${isOwner
            ? `<button class="btn btn-ghost btn-sm" data-close-listing="${s.id}" aria-label="Mark closed"><i data-lucide="check" class="icon-sm"></i></button>
               <button class="btn btn-ghost btn-sm" data-delete-listing="${s.id}" aria-label="Delete listing"><i data-lucide="x" class="icon-sm"></i></button>`
            : (currentUser ? `<button class="btn btn-ghost btn-sm" data-report-listing="${s.id}" title="Report" aria-label="Report listing"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
        </div>
      </div>

      <h3 style="margin:14px 0 4px; font-size:1rem;">${escapeHtml(s.title)}</h3>
      ${s.description ? `<p class="muted" style="margin:0 0 10px; font-size:0.85rem; white-space:pre-wrap;">${escapeHtml(s.description)}</p>` : ''}

      <div class="trade-side-header" style="color:var(--gold-bright); margin-top:6px;">
        <i data-lucide="sparkles" class="icon-sm"></i>Price
        <span class="trade-side-total">${formatValue(price.total)}</span>
      </div>
      <div class="trade-item-grid">${price.tiles}</div>

      <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:0.82rem; margin-top:14px; padding-top:12px; border-top:1px solid var(--glass-border);">
        ${roblox ? `<div><span class="muted"><i data-lucide="gamepad-2" class="icon-sm icon-inline"></i>Roblox${robloxVerified ? '' : ' (unverified)'}</span><br>${robloxUserId ? `<a href="https://www.roblox.com/users/${robloxUserId}/profile" target="_blank" rel="noopener noreferrer" style="color:var(--bone); font-weight:700;">${escapeHtml(roblox)}</a>` : `<strong>${escapeHtml(roblox)}</strong>`}</div>` : ''}
        ${discord ? `<div><span class="muted"><i data-lucide="message-circle" class="icon-sm icon-inline"></i>Discord</span><br><strong>${escapeHtml(discord)}</strong></div>` : ''}
        ${!roblox && !discord ? `<span class="muted">No contact on file — see their profile.</span>` : ''}
      </div>
    </div>
  `;
}

const DUNGEON_MODE_COLORS = { normal: 'easy', hard: 'hard', extreme: 'legendary' };

function renderDungeonListing(s, profile, isOwner, participants) {
  const joinedCount = participants.length + 1; // +1 for the host
  const isFull = joinedCount >= s.max_players;
  const hasJoined = currentUser && participants.some(p => p.user_id === currentUser.id);
  const roster = [{ username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, avatar_frame: profile.avatar_frame, isHost: true }]
    .concat(participants.map(p => ({ ...(p.profiles || {}), isHost: false })));

  const joinAction = !currentUser
    ? ''
    : isOwner
    ? `<button class="btn btn-ghost btn-sm" data-close-listing="${s.id}" aria-label="Mark closed"><i data-lucide="check" class="icon-sm"></i></button>
       <button class="btn btn-ghost btn-sm" data-delete-listing="${s.id}" aria-label="Delete listing"><i data-lucide="x" class="icon-sm"></i></button>`
    : hasJoined
    ? `<button class="btn btn-ghost btn-sm" data-leave-dungeon="${s.id}">Leave</button>`
    : isFull
    ? `<button class="btn btn-ghost btn-sm" disabled>Full</button>`
    : `<button class="btn btn-primary btn-sm" data-join-dungeon="${s.id}">Join</button>`;

  return `
    <div class="panel" data-listing-id="${s.id}">
      <div class="flex-between">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(profile, 30)}
          <div>
            <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)}
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(s.created_at)} · Host · expires in ${hoursLeft(s.expires_at)}</p>
            <span data-new-account-for="${s.user_id}"></span>
          </div>
        </div>
        <div style="display:flex; gap:8px;">${joinAction}</div>
      </div>

      <h3 style="margin:14px 0 4px; font-size:1rem;">${escapeHtml(s.title)}</h3>
      ${s.description ? `<p class="muted" style="margin:0 0 10px; font-size:0.85rem; white-space:pre-wrap;">${escapeHtml(s.description)}</p>` : ''}

      <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
        <span class="tag tag-${DUNGEON_MODE_COLORS[s.mode] || 'medium'}" style="text-transform:capitalize;">${escapeHtml(s.mode)}</span>
        <span class="muted" style="font-size:0.82rem;"><i data-lucide="users" class="icon-sm icon-inline"></i>${joinedCount}/${s.max_players} joined</span>
      </div>

      <div style="display:flex; gap:6px; margin-top:12px; padding-top:12px; border-top:1px solid var(--glass-border); flex-wrap:wrap;">
        ${roster.map(r => `
          <a href="/player/?u=${encodeURIComponent(r.username || '')}" title="${escapeHtml(displayNameFor(r))}${r.isHost ? ' (Host)' : ''}" style="text-decoration:none;">
            ${avatarHtml(r, 26, r.isHost ? 'border:2px solid var(--brass);' : '')}
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function wireListingActions(root) {
  root = root || document;
  root.querySelectorAll('[data-delete-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this listing?')) return;
      const { error } = await sb.from('service_listings').delete().eq('id', btn.dataset.deleteListing);
      if (error) { showToast(error.message, true); return; }
      await refreshMyListingCount();
      loadListings();
    });
  });
  root.querySelectorAll('[data-close-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('service_listings').update({ status: 'closed' }).eq('id', btn.dataset.closeListing);
      if (error) { showToast(error.message, true); return; }
      showToast('Listing marked closed.');
      await refreshMyListingCount();
      loadListings();
    });
  });
  root.querySelectorAll('[data-report-listing]').forEach(btn => {
    btn.addEventListener('click', () => reportContent('service_listing', btn.dataset.reportListing));
  });
  root.querySelectorAll('[data-join-dungeon]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const auth = await requireAuth();
      if (!auth) return;
      const { error } = await sb.rpc('join_dungeon', { p_listing_id: btn.dataset.joinDungeon });
      if (error) { showToast(error.message, true); return; }
      showToast('Joined the dungeon!');
      loadListings();
    });
  });
  root.querySelectorAll('[data-leave-dungeon]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.rpc('leave_dungeon', { p_listing_id: btn.dataset.leaveDungeon });
      if (error) { showToast(error.message, true); return; }
      loadListings();
    });
  });
}

function openComposeModal() {
  if (myActiveListingCount >= maxActiveServices) {
    showToast(`You've hit the ${maxActiveServices} active listing limit — close one first.`, true);
    return;
  }
  const isDungeon = activeTab === 'dungeon';
  document.getElementById('service-dungeon-fields').style.display = isDungeon ? 'block' : 'none';
  document.getElementById('service-price-fields').style.display = isDungeon ? 'none' : 'block';
  priceEntries = [];
  renderPriceSlotList();
  const preview = document.getElementById('service-contact-preview');
  preview.innerHTML = contactPreviewHtml(currentProfile);
  refreshIcons();
  document.getElementById('service-compose-category-label').textContent = TAB_LABELS[activeTab];
  document.getElementById('service-compose-modal').classList.add('open');
}

function closeComposeModal() {
  document.getElementById('service-compose-modal').classList.remove('open');
  document.getElementById('service-compose-form').reset();
}

async function handlePost(e) {
  e.preventDefault();
  const auth = await requireAuth();
  if (!auth) return;

  const title = document.getElementById('service-title').value.trim();
  const description = document.getElementById('service-description').value.trim();
  const settings = await getSiteSettings();
  if (title.length < settings.minServiceTitleLength) {
    showToast(`Title must be at least ${settings.minServiceTitleLength} characters.`, true);
    return;
  }
  if (description && description.length < settings.minServiceDescriptionLength) {
    showToast(`Description must be at least ${settings.minServiceDescriptionLength} characters, or left blank.`, true);
    return;
  }
  if (activeTab === 'dungeon') {
    const mode = document.getElementById('dungeon-mode').value;
    const maxPlayers = Number(document.getElementById('dungeon-max-players').value);
    const { error } = await sb.from('service_listings').insert({
      user_id: auth.user.id,
      category: 'dungeon',
      title,
      description: description || null,
      price_item_ids: [],
      mode,
      max_players: maxPlayers,
      duration_hours: Number(document.getElementById('service-duration').value) || 24,
    });
    if (error) { showToast(error.message, true); return; }
    showToast('Dungeon posted!');
    closeComposeModal();
    await refreshMyListingCount();
    loadListings();
    return;
  }

  if (!priceEntries.length) { showToast('Add at least one item as the price.', true); return; }
  if (!currentProfile?.roblox_username && !currentProfile?.discord_username) {
    showToast("Add a Roblox username or make sure Discord is linked so buyers can reach you.", true);
    return;
  }

  const { error } = await sb.from('service_listings').insert({
    user_id: auth.user.id,
    category: activeTab,
    title,
    description: description || null,
    price_item_ids: priceEntries,
    duration_hours: Number(document.getElementById('service-duration').value) || 24,
  });
  if (error) { showToast(error.message, true); return; }

  showToast('Listing posted!');
  closeComposeModal();
  await refreshMyListingCount();
  loadListings();
}
