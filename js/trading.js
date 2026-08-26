// BloxCore — trading/index.html logic (backed by the bf_items reference table)

let currentUser = null;
let allTradeItems = [];
let myActiveListingCount = 0;
let pickerTarget = null; // 'offering' | 'requesting'
let pickerCategory = 'fruit';
let offeringEntries = []; // [{ id, valueType: 'physical' | 'permanent' }]
let requestingEntries = [];

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4, limited: 5 };
const FRUIT_ORDER_MAP = new Map(BUILD_OPTIONS.fruit.map((f, i) => [f.value.toLowerCase(), i]));

let maxActiveTrades = 3;

onReady(async () => {
  const { user } = await getCurrentProfile();
  currentUser = user;

  const settings = await getSiteSettings();
  maxActiveTrades = settings.maxActiveTrades;

  if (currentUser) {
    document.getElementById('new-listing-btn').style.display = 'inline-flex';
    document.getElementById('new-listing-btn').addEventListener('click', openComposeModal);
  } else {
    document.getElementById('trade-signed-out').style.display = 'block';
  }

  const { data } = await sb.from('bf_items').select('*').in('category', ['fruit', 'limited', 'gamepass']);
  allTradeItems = (data || []).slice().sort((a, b) => {
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

  document.getElementById('trade-compose-close').addEventListener('click', closeComposeModal);
  document.getElementById('trade-post-btn').addEventListener('click', handlePost);
  document.querySelectorAll('[data-open-item-picker]').forEach(btn => {
    btn.addEventListener('click', () => openItemPicker(btn.dataset.openItemPicker));
  });
  document.getElementById('item-picker-close').addEventListener('click', () => {
    document.getElementById('item-picker-modal').classList.remove('open');
  });
  document.querySelectorAll('#item-category-tabs [data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      pickerCategory = btn.dataset.category;
      document.querySelectorAll('#item-category-tabs [data-category]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.category === pickerCategory ? 'btn-primary' : 'btn-ghost'}`;
      });
      renderItemPickerGrid();
    });
  });
  document.getElementById('item-picker-search').addEventListener('input', renderItemPickerGrid);

  await loadListings();
});

function itemById(id) {
  return allTradeItems.find(i => i.id === id);
}

function hoursLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  return `${hrs}h`;
}

function valueFor(item, valueType) {
  // Skins and gamepasses only ever have a regular_value in bf_items (they're always account-bound,
  // never a "physical" dupeable drop like a fruit can be), so permanent_value is null for them —
  // fall back to regular_value rather than showing a blank/zero value.
  return valueType === 'permanent' ? (item.permanent_value ?? item.regular_value) : item.regular_value;
}

function formatValue(n) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return String(n);
}

// Picker grid tile — icon only, tinted by rarity. No value shown here: which value applies
// (physical vs. permanent) isn't decided until the item is actually added to a side.
function pickerTileHtml(item) {
  const rarity = (item.rarity || '').toLowerCase();
  return `
    <div class="build-modal-tile" data-rarity="${rarity}" data-pick-item="${item.id}" style="padding:8px;">
      ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-lg"></i>`}
      <span style="font-size:0.72rem;">${escapeHtml(item.name)}</span>
    </div>
  `;
}

// Slot / listing tile — shows the value for whichever type is set, and (when editable) a
// small toggle to flip between physical and permanent.
function valueTileHtml(item, valueType, { editable = false } = {}) {
  const rarity = (item.rarity || '').toLowerCase();
  const value = valueFor(item, valueType);
  // Only fruits can be a "physical" drop vs. a permanent (gamepass-bought) copy — skins and
  // gamepasses are always permanent, so don't offer a toggle that has nothing to toggle to.
  const canToggle = editable && item.category === 'fruit';
  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
      <div class="build-modal-tile" data-rarity="${rarity}" style="width:56px; height:56px; padding:4px; cursor:default;" title="${escapeHtml(item.name)} — ${item.trend || 'stable'} trend, demand ${item.demand ?? '?'}/10">
        ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-md"></i>`}
      </div>
      <span style="font-size:0.66rem; font-family:var(--font-mono); color:var(--gold-bright);">${formatValue(value)}</span>
      ${canToggle
        ? `<button type="button" class="tag tag-${valueType === 'permanent' ? 'legendary' : 'medium'}" data-toggle-value-type style="border:none; cursor:pointer;">${valueType === 'permanent' ? 'Permanent' : 'Physical'}</button>`
        : `<span class="tag tag-${valueType === 'permanent' ? 'legendary' : 'medium'}">${valueType === 'permanent' ? 'Permanent' : 'Physical'}</span>`}
    </div>
  `;
}

// --- Compose modal -----------------------------------------------------

function openComposeModal() {
  if (myActiveListingCount >= maxActiveTrades) {
    showToast(`You've hit the ${maxActiveTrades} active listing limit — close one first.`, true);
    return;
  }
  offeringEntries = [];
  requestingEntries = [];
  document.getElementById('trade-note').value = '';
  renderSlotList('offering');
  renderSlotList('requesting');
  document.getElementById('trade-compose-modal').classList.add('open');
}
function closeComposeModal() {
  document.getElementById('trade-compose-modal').classList.remove('open');
}

function renderSlotList(side) {
  const entries = side === 'offering' ? offeringEntries : requestingEntries;
  const container = document.getElementById(`${side}-items`);
  container.innerHTML = entries.map((entry, i) => {
    const item = itemById(entry.id);
    if (!item) return '';
    return `
      <div class="trade-slot-tile">
        ${valueTileHtml(item, entry.valueType, { editable: true })}
        <button type="button" class="trade-slot-remove" data-remove-index="${i}" data-remove-side="${side}">×</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.trade-slot-tile').forEach((tile, i) => {
    tile.querySelector('[data-toggle-value-type]')?.addEventListener('click', () => {
      entries[i].valueType = entries[i].valueType === 'permanent' ? 'physical' : 'permanent';
      renderSlotList(side);
    });
    tile.querySelector('[data-remove-index]')?.addEventListener('click', () => {
      entries.splice(i, 1);
      renderSlotList(side);
    });
  });
  refreshIcons();
}

function openItemPicker(target) {
  pickerTarget = target;
  pickerCategory = 'fruit';
  document.querySelectorAll('#item-category-tabs [data-category]').forEach(b => {
    b.className = `btn btn-sm ${b.dataset.category === 'fruit' ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('item-picker-search').value = '';
  renderItemPickerGrid();
  document.getElementById('item-picker-modal').classList.add('open');
}

function renderItemPickerGrid() {
  const query = document.getElementById('item-picker-search').value.trim().toLowerCase();
  const items = allTradeItems.filter(i => i.category === pickerCategory && i.name.toLowerCase().includes(query));
  const grid = document.getElementById('item-picker-grid');

  grid.innerHTML = items.length
    ? items.map(pickerTileHtml).join('')
    : `<p class="muted" style="grid-column:1/-1;">No items found${query ? ' matching your search' : ''}.</p>`;

  grid.querySelectorAll('[data-pick-item]').forEach(tile => {
    tile.addEventListener('click', () => {
      const id = Number(tile.dataset.pickItem);
      const arr = pickerTarget === 'offering' ? offeringEntries : requestingEntries;
      if (arr.length >= 4) { showToast('You can add up to 4 items per side — same as in-game.', true); return; }
      const item = itemById(id);
      arr.push({ id, valueType: item?.category === 'fruit' ? 'physical' : 'permanent' });
      renderSlotList(pickerTarget);
      document.getElementById('item-picker-modal').classList.remove('open');
    });
  });
  refreshIcons();
}

async function handlePost() {
  if (!offeringEntries.length || !requestingEntries.length) {
    showToast('Add at least one item to both sides.', true);
    return;
  }
  const note = document.getElementById('trade-note').value.trim();
  const btn = document.getElementById('trade-post-btn');
  btn.disabled = true;

  const { error } = await sb.from('trade_listings').insert({
    user_id: currentUser.id,
    offering_item_ids: offeringEntries,
    requesting_item_ids: requestingEntries,
    note: note || null,
    duration_hours: Number(document.getElementById('trade-duration').value) || 24,
  });
  btn.disabled = false;

  if (error) { showToast(error.message, true); return; }
  closeComposeModal();
  showToast('Listing posted.');
  loadListings();
}

// --- Listing feed --------------------------------------------------------

const TRADE_LISTINGS_PAGE_SIZE = 40;

async function fetchTradeListingsPage(offset, pageSize) {
  const { data, error } = await sb
    .from('trade_listings')
    .select('id, user_id, offering_item_ids, requesting_item_ids, note, created_at, expires_at, profiles(username, display_name, avatar_url, avatar_frame, title_color_override, titles(name, color), created_at)')
    .eq('active', true)
    .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { console.error(error); return null; }
  return data;
}

async function loadListings() {
  const container = document.getElementById('trade-listings');
  const data = await fetchTradeListingsPage(0, TRADE_LISTINGS_PAGE_SIZE);

  if (data === null) {
    container.innerHTML = `<p class="muted">Couldn't load listings right now.</p>`;
    return;
  }

  myActiveListingCount = currentUser ? data.filter(t => t.user_id === currentUser.id).length : 0;
  updateNewListingButton();

  if (!data.length) {
    container.innerHTML = `<div class="empty-state">No trade listings yet — be the first to post one.</div>`;
    return;
  }

  container.innerHTML = data.map(renderListing).join('');
  wireListingActions(container);
  refreshIcons();
  loadReputationBadges(container, data.map(t => ({ id: t.user_id, createdAt: t.profiles?.created_at })));
  scrollToHashTarget('data-listing-id');

  if (data.length === TRADE_LISTINGS_PAGE_SIZE) {
    attachLoadMore(container, {
      wrapId: 'trade-listings-load-more-wrap',
      pageSize: TRADE_LISTINGS_PAGE_SIZE,
      initialOffset: data.length,
      fetchPage: async (offset, pageSize) => (await fetchTradeListingsPage(offset, pageSize)) || [],
      renderItem: renderListing,
      onAppend: (rows) => {
        const ids = new Set(rows.map(r => String(r.id)));
        const newEls = [...container.querySelectorAll('[data-listing-id]')].filter(el => ids.has(el.dataset.listingId));
        newEls.forEach(el => wireListingActions(el));
        refreshIcons();
        loadReputationBadges(container, rows.map(t => ({ id: t.user_id, createdAt: t.profiles?.created_at })));
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

function updateNewListingButton() {
  const btn = document.getElementById('new-listing-btn');
  if (!currentUser || !btn) return;
  btn.innerHTML = `<i data-lucide="plus" class="icon-sm icon-inline"></i>New Listing (${myActiveListingCount}/${maxActiveTrades})`;
  refreshIcons();
}

function sideSummary(entries) {
  let total = 0;
  const tiles = (entries || []).map(entry => {
    const item = itemById(entry.id);
    if (!item) return '';
    total += valueFor(item, entry.valueType) || 0;
    return valueTileHtml(item, entry.valueType);
  }).join('');
  return { total, tiles };
}

function renderListing(t) {
  const profile = t.profiles || {};
  const isOwner = currentUser && t.user_id === currentUser.id;
  const offer = sideSummary(t.offering_item_ids);
  const request = sideSummary(t.requesting_item_ids);

  return `
    <div class="panel trade-card hover-lift-card" data-listing-id="${t.id}">
      <div class="flex-between">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(profile, 34)}
          <div>
            <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)} <span data-rep-for="${t.user_id}"></span>
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(t.created_at)} · expires in ${hoursLeft(t.expires_at)}</p>
            <span data-new-account-for="${t.user_id}"></span>
          </div>
        </div>
        ${isOwner ? `<div style="display:flex; gap:6px;"><button class="btn btn-ghost btn-sm" data-complete-listing="${t.id}" title="Mark completed" aria-label="Mark completed"><i data-lucide="check" class="icon-sm"></i></button><button class="btn btn-ghost btn-sm" data-delete-listing="${t.id}" aria-label="Delete listing"><i data-lucide="x" class="icon-sm"></i></button></div>` : (currentUser ? `<button class="btn btn-ghost btn-sm" data-report-listing="${t.id}" title="Report" aria-label="Report listing"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
      </div>

      ${t.note ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem;">${escapeHtml(t.note)}</p>` : ''}

      <div class="trade-columns-wrap">
        <div class="trade-columns">
          <div>
            <div class="trade-side-header" style="color:var(--sea);">
              <i data-lucide="sparkles" class="icon-sm"></i>Offering
              <span class="trade-side-total">${formatValue(offer.total)}</span>
            </div>
            <div class="trade-item-grid">${offer.tiles}</div>
          </div>
          <div class="trade-arrow"><i data-lucide="arrow-right" class="icon-sm"></i></div>
          <div>
            <div class="trade-side-header" style="color:var(--gold-bright);">
              <i data-lucide="sparkles" class="icon-sm"></i>Requesting
              <span class="trade-side-total">${formatValue(request.total)}</span>
            </div>
            <div class="trade-item-grid">${request.tiles}</div>
          </div>
        </div>
      </div>

      <div class="trade-card-footer">
        <a href="/chat/" class="btn btn-ghost btn-sm"><i data-lucide="message-circle" class="icon-sm icon-inline"></i>Chat</a>
        <a href="/player/?u=${encodeURIComponent(profile.username || '')}" class="btn btn-primary btn-sm"><i data-lucide="repeat" class="icon-sm icon-inline"></i>Trade</a>
      </div>
    </div>
  `;
}

function wireListingActions(root) {
  root = root || document;
  root.querySelectorAll('[data-complete-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('trade_listings').update({ active: false }).eq('id', btn.dataset.completeListing);
      if (error) { showToast(error.message, true); return; }
      showToast('Marked as completed.');
      document.querySelector(`[data-listing-id="${btn.dataset.completeListing}"]`)?.remove();
    });
  });
  root.querySelectorAll('[data-delete-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this trade listing?')) return;
      const { error } = await sb.from('trade_listings').delete().eq('id', btn.dataset.deleteListing);
      if (error) { showToast(error.message, true); return; }
      document.querySelector(`[data-listing-id="${btn.dataset.deleteListing}"]`)?.remove();
    });
  });
  root.querySelectorAll('[data-report-listing]').forEach(btn => {
    btn.addEventListener('click', () => reportContent('trade_listing', btn.dataset.reportListing));
  });
}
