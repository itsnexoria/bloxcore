// BloxCore — trading/index.html logic (backed by the bf_items reference table)

let currentUser = null;
let allTradeItems = [];
let myActiveListingCount = 0;
let pickerTarget = null; // 'offering' | 'requesting'
let pickerCategory = 'fruit';
let offeringEntries = []; // [{ id, valueType: 'physical' | 'permanent' }]
let requestingEntries = [];

let maxActiveTrades = 3;
let myWatchlist = new Set(); // item ids
let watchlistCategory = 'fruit';

onReady(async () => {
  initFirstVisitBanner('trading-tips-banner', 'trading-tips-dismiss', 'bc_seen_tips_trading');
  const { user } = await getCurrentProfile();
  currentUser = user;

  const settings = await getSiteSettings();
  maxActiveTrades = settings.maxActiveTrades;

  if (currentUser) {
    document.getElementById('new-listing-btn').style.display = 'inline-flex';
    document.getElementById('new-listing-btn').addEventListener('click', openComposeModal);
    document.getElementById('watchlist-btn').style.display = 'inline-flex';
    document.getElementById('watchlist-btn').addEventListener('click', openWatchlistModal);
  } else {
    document.getElementById('trade-signed-out').style.display = 'block';
  }

  allTradeItems = await fetchBfItemCatalog();

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

  document.getElementById('watchlist-close').addEventListener('click', () => {
    document.getElementById('watchlist-modal').classList.remove('open');
  });
  document.getElementById('item-history-close').addEventListener('click', () => {
    document.getElementById('item-history-modal').classList.remove('open');
  });
  document.getElementById('item-history-modal').addEventListener('click', (e) => {
    if (e.target.id === 'item-history-modal') document.getElementById('item-history-modal').classList.remove('open');
  });
  document.querySelectorAll('#watchlist-category-tabs [data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      watchlistCategory = btn.dataset.category;
      document.querySelectorAll('#watchlist-category-tabs [data-category]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.category === watchlistCategory ? 'btn-primary' : 'btn-ghost'}`;
      });
      renderWatchlistGrid();
    });
  });
  document.getElementById('watchlist-search').addEventListener('input', renderWatchlistGrid);

  await loadListings();
});

// --- Watchlist -----------------------------------------------------------

async function openWatchlistModal() {
  const { data } = await sb.from('item_watchlist').select('item_id').eq('user_id', currentUser.id);
  myWatchlist = new Set((data || []).map(r => r.item_id));
  watchlistCategory = 'fruit';
  document.querySelectorAll('#watchlist-category-tabs [data-category]').forEach(b => {
    b.className = `btn btn-sm ${b.dataset.category === 'fruit' ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('watchlist-search').value = '';
  renderWatchlistGrid();
  document.getElementById('watchlist-modal').classList.add('open');
}

function renderWatchlistGrid() {
  const query = document.getElementById('watchlist-search').value.trim().toLowerCase();
  const items = allTradeItems.filter(i => i.category === watchlistCategory && i.name.toLowerCase().includes(query));
  const grid = document.getElementById('watchlist-grid');

  grid.innerHTML = items.length
    ? items.map(item => {
        const isWatched = myWatchlist.has(item.id);
        const rarity = (item.rarity || '').toLowerCase();
        return `
          <div class="build-modal-tile" data-rarity="${rarity}" data-watch-item="${item.id}" style="padding:8px; position:relative; ${isWatched ? 'box-shadow:0 0 0 2px var(--brass-bright);' : ''}">
            ${isWatched ? `<i data-lucide="eye" class="icon-sm" style="position:absolute; top:4px; right:4px; color:var(--brass-bright);"></i>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-view-item-history="${item.id}" title="Value history" aria-label="Value history" style="position:absolute; top:2px; left:2px; padding:3px;"><i data-lucide="line-chart" style="width:12px;height:12px;"></i></button>
            ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-lg"></i>`}
            <span style="font-size:0.72rem;">${escapeHtml(item.name)}</span>
          </div>
        `;
      }).join('')
    : `<p class="muted" style="grid-column:1/-1;">No items found${query ? ' matching your search' : ''}.</p>`;

  grid.querySelectorAll('[data-watch-item]').forEach(tile => {
    tile.addEventListener('click', () => toggleWatchItem(Number(tile.dataset.watchItem)));
  });
  grid.querySelectorAll('[data-view-item-history]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also trigger the tile's watch-toggle click
      openItemHistoryModal(Number(btn.dataset.viewItemHistory));
    });
  });
  refreshIcons();
}

async function openItemHistoryModal(itemId) {
  const item = allTradeItems.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('item-history-icon').src = item.icon_url || '';
  document.getElementById('item-history-title').textContent = item.name;
  document.getElementById('item-history-rarity').textContent = item.rarity || '';
  document.getElementById('item-history-current-value').textContent = formatValue(valueFor(item, 'regular'));
  document.getElementById('item-history-chart-wrap').innerHTML = `<div class="skeleton" style="height:90px;"></div>`;
  document.getElementById('item-history-modal').classList.add('open');

  const { data } = await sb
    .from('bf_item_price_history')
    .select('regular_value, recorded_at')
    .eq('item_id', itemId)
    .order('recorded_at', { ascending: true })
    .limit(90);

  document.getElementById('item-history-chart-wrap').innerHTML = sparklineHtml(data || []);
}

// Dependency-free inline SVG line chart — the site loads no charting library, and a value
// history sparkline is simple enough (a handful of points) not to need one.
function sparklineHtml(points) {
  if (points.length < 2) {
    return `<p class="muted" style="font-size:0.8rem; text-align:center; padding:30px 0;">Not enough history yet — check back after the next value update.</p>`;
  }
  const w = 340, h = 90, pad = 8;
  const values = points.map(p => p.regular_value ?? 0);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;
  const first = new Date(points[0].recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const last = new Date(points[points.length - 1].recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const changed = values[values.length - 1] - values[0];
  const changeColor = changed > 0 ? 'var(--sea)' : changed < 0 ? '#f87171' : 'var(--ash)';

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px; display:block;">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brass-bright)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--brass-bright)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sparkFill)"></path>
      <path d="${path}" fill="none" stroke="var(--brass-bright)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
    </svg>
    <div class="flex-between muted" style="font-size:0.7rem; margin-top:2px;">
      <span>${first}</span>
      <span style="color:${changeColor}; font-weight:700;">${changed > 0 ? '+' : ''}${formatValue(changed)}</span>
      <span>${last}</span>
    </div>
  `;
}

async function toggleWatchItem(itemId) {
  if (myWatchlist.has(itemId)) {
    const { error } = await sb.from('item_watchlist').delete().eq('user_id', currentUser.id).eq('item_id', itemId);
    if (error) { showToast(error.message, true); return; }
    myWatchlist.delete(itemId);
  } else {
    const { error } = await sb.from('item_watchlist').insert({ user_id: currentUser.id, item_id: itemId });
    if (error) { showToast(error.message, true); return; }
    myWatchlist.add(itemId);
  }
  renderWatchlistGrid();
}

function itemById(id) {
  return allTradeItems.find(i => i.id === id);
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
  updateFairValueIndicator();
}

// Live "is this a fair trade" readout — pure client-side math against the bf_items
// catalog already loaded for the picker, so it updates instantly as items are added,
// removed, or toggled physical/permanent. Not a recommendation, just a value comparison;
// demand/trend aren't priced in since those are judgment calls, not hard numbers.
function fairValueBadgeHtml(offerTotal, requestTotal) {
  if (!offerTotal || !requestTotal) return '';
  const diffPct = Math.round(((requestTotal - offerTotal) / offerTotal) * 100);
  if (Math.abs(diffPct) <= 8) {
    return `<span class="tag tag-easy"><i data-lucide="scale" class="icon-sm icon-inline"></i>Roughly Fair</span>`;
  } else if (diffPct > 0) {
    return `<span class="tag tag-hard"><i data-lucide="trending-up" class="icon-sm icon-inline"></i>Requesting +${diffPct}%</span>`;
  }
  return `<span class="tag tag-medium"><i data-lucide="trending-down" class="icon-sm icon-inline"></i>Offering +${Math.abs(diffPct)}%</span>`;
}

function updateFairValueIndicator() {
  const el = document.getElementById('trade-fair-value');
  if (!offeringEntries.length || !requestingEntries.length) { el.style.display = 'none'; return; }

  const offerTotal = offeringEntries.reduce((sum, e) => sum + (valueFor(itemById(e.id), e.valueType) || 0), 0);
  const requestTotal = requestingEntries.reduce((sum, e) => sum + (valueFor(itemById(e.id), e.valueType) || 0), 0);
  if (!offerTotal || !requestTotal) { el.style.display = 'none'; return; }

  const diffPct = Math.round(((requestTotal - offerTotal) / offerTotal) * 100);
  el.style.display = 'block';

  if (Math.abs(diffPct) <= 8) {
    el.innerHTML = `<i data-lucide="scale" class="icon-sm icon-inline" style="color:var(--gold-bright);"></i>Roughly fair — ${formatValue(offerTotal)} for ${formatValue(requestTotal)}`;
  } else if (diffPct > 0) {
    el.innerHTML = `<i data-lucide="trending-up" class="icon-sm icon-inline" style="color:#34d399;"></i>You're asking for ${diffPct}% more value than you're offering (${formatValue(offerTotal)} → ${formatValue(requestTotal)})`;
  } else {
    el.innerHTML = `<i data-lucide="trending-down" class="icon-sm icon-inline" style="color:#f87171;"></i>You're offering ${Math.abs(diffPct)}% more value than you're requesting (${formatValue(offerTotal)} → ${formatValue(requestTotal)})`;
  }
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
  if (error) { logError(error); return null; }
  return data;
}

async function loadListings() {
  const container = document.getElementById('trade-listings');
  const data = await fetchTradeListingsPage(0, TRADE_LISTINGS_PAGE_SIZE);

  if (data === null) {
    container.innerHTML = errorStateHtml("Couldn't load listings right now.", 'loadListings()');
    refreshIcons();
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
            <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)} <span data-rep-for="${t.user_id}"></span> <span data-verified-trader-for="${t.user_id}"></span>
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(t.created_at)} · expires in ${hoursLeft(t.expires_at)}</p>
            <span data-new-account-for="${t.user_id}"></span>
          </div>
        </div>
        ${isOwner ? `<div style="display:flex; gap:6px;"><button class="btn btn-ghost btn-sm" data-complete-listing="${t.id}" title="Mark completed" aria-label="Mark completed"><i data-lucide="check" class="icon-sm"></i></button><button class="btn btn-ghost btn-sm" data-delete-listing="${t.id}" aria-label="Delete listing"><i data-lucide="x" class="icon-sm"></i></button></div>` : (currentUser ? `<button class="btn btn-ghost btn-sm" data-report-listing="${t.id}" title="Report" aria-label="Report listing"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
      </div>

      ${t.note ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem;">${escapeHtml(t.note)}</p>` : ''}
      ${fairValueBadgeHtml(offer.total, request.total) ? `<div style="margin-top:10px;">${fairValueBadgeHtml(offer.total, request.total)}</div>` : ''}

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
        <a href="/friends/?tab=messages&u=${encodeURIComponent(profile.username || '')}" class="btn btn-ghost btn-sm"><i data-lucide="mail" class="icon-sm icon-inline"></i>Message</a>
        <button type="button" class="btn btn-ghost btn-sm" data-repost-trade="${t.id}" title="Share to Feed" aria-label="Share to Feed"><i data-lucide="share-2" class="icon-sm icon-inline"></i></button>
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
  root.querySelectorAll('[data-repost-trade]').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = `/feed/?repost_trade=${btn.dataset.repostTrade}`; });
  });
}
