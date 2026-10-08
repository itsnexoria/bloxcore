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
let myWatchlistAlerts = new Map(); // item_id -> { direction, target_value, triggered_at }
let watchlistCategory = 'fruit';
let viewerIsAdmin = false;
let listingLookup = new Map(); // id -> full listing row, for the Relist quick-duplicate action
let reportingListingId = null;
let valueHistoryCategory = 'fruit';

onReady(async () => {
  initFirstVisitBanner('trading-tips-banner', 'trading-tips-dismiss', 'bc_seen_tips_trading');
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  viewerIsAdmin = profile?.role === 'admin';
  addNoExpiryOption('trade-duration', profile);
  initPinButtons(loadListings);

  const settings = await getSiteSettings();
  maxActiveTrades = settings.maxActiveTrades;

  if (currentUser) {
    document.getElementById('new-listing-btn').style.display = 'inline-flex';
    document.getElementById('new-listing-btn').addEventListener('click', openComposeModal);
    document.getElementById('watchlist-btn').style.display = 'inline-flex';
    document.getElementById('watchlist-btn').addEventListener('click', openWatchlistModal);
    document.getElementById('card-theme-btn').style.display = 'inline-flex';
    document.getElementById('card-theme-btn').addEventListener('click', openThemePicker);
    document.getElementById('theme-picker-close').addEventListener('click', () => {
      document.getElementById('theme-picker-modal').classList.remove('open');
    });
    document.getElementById('theme-picker-modal').addEventListener('click', (e) => {
      if (e.target.id === 'theme-picker-modal') document.getElementById('theme-picker-modal').classList.remove('open');
    });
    document.getElementById('alert-modal-close').addEventListener('click', () => {
      document.getElementById('alert-modal').classList.remove('open');
    });
    document.getElementById('alert-modal').addEventListener('click', (e) => {
      if (e.target.id === 'alert-modal') document.getElementById('alert-modal').classList.remove('open');
    });
    document.getElementById('alert-modal-save-btn').addEventListener('click', saveAlert);
    document.getElementById('report-listing-close').addEventListener('click', () => {
      document.getElementById('report-listing-modal').classList.remove('open');
    });
    document.getElementById('report-listing-modal').addEventListener('click', (e) => {
      if (e.target.id === 'report-listing-modal') document.getElementById('report-listing-modal').classList.remove('open');
    });
    document.getElementById('report-listing-submit').addEventListener('click', submitListingReport);
    document.getElementById('alert-modal-clear-btn').addEventListener('click', clearAlert);
    document.getElementById('trading-tab-btn-browse').addEventListener('click', () => switchTradingTab('browse'));
    document.getElementById('trading-tab-btn-values').addEventListener('click', () => switchTradingTab('values'));
    document.getElementById('value-history-search').addEventListener('input', renderValueHistoryGrid);
    document.getElementById('value-history-sort').addEventListener('change', renderValueHistoryGrid);
    document.querySelectorAll('#value-history-category-tabs [data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        valueHistoryCategory = btn.dataset.category;
        document.querySelectorAll('#value-history-category-tabs [data-category]').forEach(b => {
          b.className = `btn btn-sm ${b.dataset.category === valueHistoryCategory ? 'btn-primary' : 'btn-ghost'}`;
        });
        renderValueHistoryGrid();
      });
    });
  } else {
    document.getElementById('trade-signed-out').style.display = 'block';
  }

  allTradeItems = await fetchBfItemCatalog(['fruit', 'limited', 'gamepass', 'other']);

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
  document.getElementById('trade-complete-close').addEventListener('click', closeCompleteModal);
  document.getElementById('trade-complete-submit').addEventListener('click', submitCompleteModal);
  document.getElementById('trade-complete-modal').addEventListener('click', (e) => { if (e.target.id === 'trade-complete-modal') closeCompleteModal(); });
  if (currentUser) await loadTradeConfirmations();
});

// --- Watchlist -----------------------------------------------------------

async function openThemePicker() {
  const grid = document.getElementById('theme-picker-grid');
  grid.innerHTML = `<div class="skeleton" style="height:80px; grid-column:1/-1;"></div>`;
  document.getElementById('theme-picker-modal').classList.add('open');

  const [{ data: unlocked }, { data: allThemes }, { data: myProfile }] = await Promise.all([
    sb.rpc('get_unlocked_trade_themes', { p_user_id: currentUser.id }),
    sb.from('trade_card_themes').select('*').order('sort_order'),
    sb.from('profiles').select('active_trade_theme_id').eq('id', currentUser.id).single(),
  ]);

  const unlockedIds = new Set((unlocked || []).map(t => t.id));
  const activeId = myProfile?.active_trade_theme_id || null;

  const noneTile = `
    <div class="build-modal-tile" data-theme-id="" style="cursor:pointer; ${!activeId ? 'box-shadow:0 0 0 2px var(--brass-bright);' : ''}">
      <i data-lucide="ban" class="icon-lg"></i>
      <span style="font-size:0.78rem;">Default</span>
    </div>
  `;
  const tiles = (allThemes || []).map(t => {
    const isUnlocked = unlockedIds.has(t.id);
    return `
      <div class="build-modal-tile ${isUnlocked ? '' : 'locked'}" ${isUnlocked ? `data-theme-id="${t.id}"` : ''} style="${isUnlocked ? 'cursor:pointer;' : ''} ${activeId === t.id ? 'box-shadow:0 0 0 2px var(--brass-bright);' : ''} background:${isUnlocked ? `linear-gradient(135deg, ${t.gradient_from}33, var(--navy) 70%)` : ''}; border-color:${isUnlocked ? t.gradient_from : ''};">
        ${isUnlocked ? '' : '<i data-lucide="lock" class="icon-sm lock-icon"></i>'}
        <span style="font-size:0.78rem; ${isUnlocked ? `color:${t.gradient_from};` : 'color:var(--ash);'}">${escapeHtml(t.name)}</span>
        ${!isUnlocked ? `<span class="muted" style="font-size:0.66rem;">${t.min_completed_trades} trades</span>` : ''}
      </div>
    `;
  }).join('');

  grid.innerHTML = noneTile + tiles;
  refreshIcons();

  grid.querySelectorAll('[data-theme-id]').forEach(tile => {
    tile.addEventListener('click', async () => {
      const themeId = tile.dataset.themeId || null;
      const { error } = await sb.from('profiles').update({ active_trade_theme_id: themeId }).eq('id', currentUser.id);
      if (error) { showToast(error.message, true); return; }
      showToast('Card theme updated.');
      document.getElementById('theme-picker-modal').classList.remove('open');
      loadListings();
    });
  });
}

function switchTradingTab(tab) {
  document.getElementById('trading-tab-btn-browse').className = `btn btn-sm ${tab === 'browse' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('trading-tab-btn-values').className = `btn btn-sm ${tab === 'values' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('trading-tab-browse').style.display = tab === 'browse' ? '' : 'none';
  document.getElementById('trading-tab-values').style.display = tab === 'values' ? '' : 'none';
  if (tab === 'values') renderValueHistoryGrid();
}

function renderValueHistoryGrid() {
  const query = document.getElementById('value-history-search').value.trim().toLowerCase();
  const grid = document.getElementById('value-history-grid');
  const sortMode = document.getElementById('value-history-sort')?.value || 'value';
  const items = allTradeItems
    .filter(i => i.category === valueHistoryCategory && i.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const byValue = (valueFor(b, 'regular') || 0) - (valueFor(a, 'regular') || 0);
      if (sortMode === 'value') return byValue;
      // Rising (up/underpaid) → steady → falling (overpaid/unstable); value breaks ties.
      const rank = t => t === 'up' || t === 'underpaid' ? 0 : t === 'overpaid' || t === 'unstable' ? 2 : 1;
      const diff = rank(a.trend) - rank(b.trend);
      return (sortMode === 'trend-down' ? -diff : diff) || byValue;
    });

  grid.innerHTML = items.length
    ? items.map(item => {
        const rarity = (item.rarity || '').toLowerCase();
        const trendColor = item.trend === 'up' || item.trend === 'underpaid' ? 'var(--sea)' : item.trend === 'overpaid' || item.trend === 'unstable' ? '#f87171' : 'var(--ash)';
        return `
          <div class="panel hover-lift-card" data-view-value-history="${item.id}" style="cursor:pointer; padding:14px; display:flex; align-items:center; gap:12px;" data-rarity="${rarity}">
            ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" style="width:40px; height:40px; object-fit:contain; flex-shrink:0;" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-lg" style="flex-shrink:0;"></i>`}
            <div style="min-width:0;">
              <p style="margin:0; font-weight:700; font-size:0.86rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</p>
              <p style="margin:2px 0 0; font-family:var(--font-mono); font-size:0.82rem; color:${trendColor};">${formatValue(valueFor(item, 'regular'))}</p>
            </div>
          </div>
        `;
      }).join('')
    : `<p class="muted" style="grid-column:1/-1;">No items found${query ? ' matching your search' : ''}.</p>`;

  grid.querySelectorAll('[data-view-value-history]').forEach(tile => {
    tile.addEventListener('click', () => openItemHistoryModal(Number(tile.dataset.viewValueHistory)));
  });
  refreshIcons();
}

async function openWatchlistModal() {
  const { data } = await sb.from('item_watchlist').select('item_id, alert_direction, alert_target_value, alert_triggered_at').eq('user_id', currentUser.id);
  myWatchlist = new Set((data || []).map(r => r.item_id));
  myWatchlistAlerts = new Map((data || []).filter(r => r.alert_direction).map(r => [r.item_id, r]));
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
        const alert = myWatchlistAlerts.get(item.id);
        const rarity = (item.rarity || '').toLowerCase();
        return `
          <div class="build-modal-tile" data-rarity="${rarity}" data-watch-item="${item.id}" style="padding:8px; position:relative; ${isWatched ? 'box-shadow:0 0 0 2px var(--brass-bright);' : ''}">
            ${isWatched ? `<i data-lucide="eye" class="icon-sm" style="position:absolute; top:4px; right:4px; color:var(--brass-bright);"></i>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-view-item-history="${item.id}" title="Value history" aria-label="Value history" style="position:absolute; top:2px; left:2px; padding:3px;"><i data-lucide="line-chart" style="width:12px;height:12px;"></i></button>
            ${isWatched ? `<button type="button" class="btn btn-ghost btn-sm" data-set-alert="${item.id}" title="${alert ? `Alert set: ${alert.alert_direction} ${formatValue(alert.alert_target_value)}` : 'Set a price alert'}" aria-label="Set price alert" style="position:absolute; bottom:2px; right:2px; padding:3px;"><i data-lucide="bell${alert && !alert.alert_triggered_at ? '-ring' : ''}" style="width:12px;height:12px; ${alert && !alert.alert_triggered_at ? 'color:var(--brass-bright);' : ''}"></i></button>` : ''}
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
  grid.querySelectorAll('[data-set-alert]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAlertModal(Number(btn.dataset.setAlert));
    });
  });
  refreshIcons();
}

async function openAlertModal(itemId) {
  const item = allTradeItems.find(i => i.id === itemId);
  if (!item) return;
  const alert = myWatchlistAlerts.get(itemId);

  document.getElementById('alert-modal-item-name').textContent = item.name;
  document.getElementById('alert-modal-direction').value = alert?.alert_direction || 'above';
  document.getElementById('alert-modal-target').value = alert?.alert_target_value || '';
  document.getElementById('alert-modal-clear-btn').style.display = alert ? 'inline-flex' : 'none';
  document.getElementById('alert-modal').dataset.itemId = itemId;
  document.getElementById('alert-modal').classList.add('open');
}

async function saveAlert() {
  const itemId = Number(document.getElementById('alert-modal').dataset.itemId);
  const direction = document.getElementById('alert-modal-direction').value;
  const target = Number(document.getElementById('alert-modal-target').value);
  if (!target || target <= 0) { showToast('Enter a target value above 0.', true); return; }

  const { error } = await sb.from('item_watchlist')
    .update({ alert_direction: direction, alert_target_value: target, alert_triggered_at: null })
    .eq('user_id', currentUser.id).eq('item_id', itemId);
  if (error) { showToast(error.message, true); return; }

  myWatchlistAlerts.set(itemId, { item_id: itemId, alert_direction: direction, alert_target_value: target, alert_triggered_at: null });
  document.getElementById('alert-modal').classList.remove('open');
  renderWatchlistGrid();
  showToast('Price alert set.');
}

async function clearAlert() {
  const itemId = Number(document.getElementById('alert-modal').dataset.itemId);
  const { error } = await sb.from('item_watchlist')
    .update({ alert_direction: null, alert_target_value: null, alert_triggered_at: null })
    .eq('user_id', currentUser.id).eq('item_id', itemId);
  if (error) { showToast(error.message, true); return; }

  myWatchlistAlerts.delete(itemId);
  document.getElementById('alert-modal').classList.remove('open');
  renderWatchlistGrid();
  showToast('Price alert cleared.');
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

function openComposeModal(prefill) {
  if (myActiveListingCount >= maxActiveTrades) {
    showToast(`You've hit the ${maxActiveTrades} active listing limit — close one first.`, true);
    return;
  }
  offeringEntries = prefill?.offering ? prefill.offering.map(e => ({ ...e })) : [];
  requestingEntries = prefill?.requesting ? prefill.requesting.map(e => ({ ...e })) : [];
  document.getElementById('trade-note').value = prefill?.note || '';
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
// Viewer-aware verdict. Taker gives the requested items and gets the offered ones; owner is the reverse.
function fairValueBadgeHtml(offerTotal, requestTotal, isOwner = false) {
  if (!offerTotal || !requestTotal) return '';
  const takerGainPct = Math.round(((offerTotal - requestTotal) / requestTotal) * 100); // + = taker wins
  if (Math.abs(takerGainPct) <= 8) {
    return `<span class="tag tag-easy" title="Both sides are within ~8% of each other by community value"><i data-lucide="scale" class="icon-sm icon-inline"></i>Fair trade</span>`;
  }
  const pct = Math.abs(takerGainPct);
  if (isOwner) {
    return takerGainPct > 0
      ? `<span class="tag tag-medium" title="You're offering more value than you're asking for"><i data-lucide="trending-down" class="icon-sm icon-inline"></i>You're overpaying ${pct}%</span>`
      : `<span class="tag tag-hard" title="You're asking for more value than you're offering — may be slow to fill"><i data-lucide="trending-up" class="icon-sm icon-inline"></i>You're asking +${pct}%</span>`;
  }
  return takerGainPct > 0
    ? `<span class="tag tag-easy" title="You'd receive more value than you give"><i data-lucide="thumbs-up" class="icon-sm icon-inline"></i>W for you +${pct}%</span>`
    : `<span class="tag tag-hard" title="You'd give more value than you receive"><i data-lucide="thumbs-down" class="icon-sm icon-inline"></i>L for you -${pct}%</span>`;
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
    duration_hours: readDurationHours('trade-duration', 24),
  });
  btn.disabled = false;

  if (error) { showToast(error.message, true); return; }
  closeComposeModal();
  showToast('Listing posted.');
  loadListings();
}

// --- Listing feed --------------------------------------------------------

const TRADE_LISTINGS_PAGE_SIZE = 40;

const TRADE_LISTING_SELECT = 'id, user_id, offering_item_ids, requesting_item_ids, note, created_at, expires_at, pinned, profiles(username, display_name, avatar_url, avatar_frame, title_color_override, titles(name, color), created_at, trade_card_themes(gradient_from, gradient_to))';

async function fetchTradeListingsPage(offset, pageSize) {
  const { data, error } = await sb
    .from('trade_listings')
    .select(TRADE_LISTING_SELECT)
    .eq('active', true)
    .eq('pinned', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { logError(error); return null; }
  return data;
}

// Admin-pinned listings sit above the paged feed (the feed itself excludes them).
async function fetchPinnedTradeListings() {
  const { data, error } = await sb
    .from('trade_listings')
    .select(TRADE_LISTING_SELECT)
    .eq('active', true)
    .eq('pinned', true)
    .gt('expires_at', new Date().toISOString())
    .order('pinned_at', { ascending: false });
  if (error) { logError(error); return []; }
  return data || [];
}

async function loadListings() {
  const container = document.getElementById('trade-listings');
  const page = await fetchTradeListingsPage(0, TRADE_LISTINGS_PAGE_SIZE);
  const pinned = page === null ? [] : await fetchPinnedTradeListings();
  const data = page === null ? null : [...pinned, ...page];

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
  data.forEach(t => listingLookup.set(t.id, t));
  wireListingActions(container);
  refreshIcons();
  loadReputationBadges(container, data.map(t => ({ id: t.user_id, createdAt: t.profiles?.created_at })));
  scrollToHashTarget('data-listing-id');
  scrollToQueryTarget('listing', 'data-listing-id');

  if (page.length === TRADE_LISTINGS_PAGE_SIZE) {
    attachLoadMore(container, {
      wrapId: 'trade-listings-load-more-wrap',
      pageSize: TRADE_LISTINGS_PAGE_SIZE,
      initialOffset: page.length,
      fetchPage: async (offset, pageSize) => (await fetchTradeListingsPage(offset, pageSize)) || [],
      renderItem: renderListing,
      onAppend: (rows) => {
        const ids = new Set(rows.map(r => String(r.id)));
        rows.forEach(t => listingLookup.set(t.id, t));
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
  const theme = profile.trade_card_themes;
  const themeStyle = theme
    ? `border-image: linear-gradient(135deg, ${theme.gradient_from}, ${theme.gradient_to}) 1; border-width: 2px; border-style: solid;`
    : '';

  return `
    <div class="panel trade-card hover-lift-card${t.pinned ? ' is-pinned' : ''}" data-listing-id="${t.id}" style="${themeStyle}">
      ${t.pinned ? `<div style="margin-bottom:8px;">${pinnedTagHtml()}</div>` : ''}
      <div class="flex-between">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(profile, 34)}
          <div>
            <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${escapeHtml(displayNameFor(profile))}</a> ${titleBadge(profile)} <span data-rep-for="${t.user_id}"></span> <span data-verified-trader-for="${t.user_id}"></span>
            <span data-confirmed-trades-for="${t.user_id}"></span>
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(t.created_at)} · ${expiryLabel(t.expires_at)}</p>
            <span data-rep-for="${t.user_id}"></span>
            <span data-verified-trader-for="${t.user_id}"></span>
            <span data-new-account-for="${t.user_id}"></span>
          </div>
        </div>
        ${adminPinButtonHtml('trade', t, viewerIsAdmin)}
        <button class="btn btn-ghost btn-sm" data-share-listing="${t.id}" title="Copy link to this listing" aria-label="Copy link"><i data-lucide="link" class="icon-sm"></i></button>
        ${isOwner ? `<div style="display:flex; gap:6px;"><button class="btn btn-ghost btn-sm" data-relist-listing="${t.id}" title="Relist (duplicate as a fresh listing)" aria-label="Relist"><i data-lucide="repeat" class="icon-sm"></i></button><button class="btn btn-ghost btn-sm" data-complete-listing="${t.id}" title="Mark completed" aria-label="Mark completed"><i data-lucide="check" class="icon-sm"></i></button><button class="btn btn-ghost btn-sm" data-delete-listing="${t.id}" aria-label="Delete listing"><i data-lucide="x" class="icon-sm"></i></button></div>` : (currentUser ? `<button class="btn btn-ghost btn-sm" data-report-listing="${t.id}" title="Report" aria-label="Report listing"><i data-lucide="flag" class="icon-sm"></i></button>` : '')}
      </div>

      ${t.note ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem;">${escapeHtml(t.note)}</p>` : ''}
      ${fairValueBadgeHtml(offer.total, request.total, isOwner) ? `<div style="margin-top:10px;">${fairValueBadgeHtml(offer.total, request.total, isOwner)}</div>` : ''}

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
        ${!isOwner ? `<button type="button" class="btn btn-ghost btn-sm" data-report-listing="${t.id}" title="Report this listing" aria-label="Report"><i data-lucide="flag" class="icon-sm"></i></button>` : ''}
        <a href="/player/?u=${encodeURIComponent(profile.username || '')}" class="btn btn-primary btn-sm"><i data-lucide="repeat" class="icon-sm icon-inline"></i>Trade</a>
      </div>
    </div>
  `;
}

function wireListingActions(root) {
  root = root || document;
  root.querySelectorAll('[data-report-listing]').forEach(btn => {
    btn.addEventListener('click', () => openReportModal(btn.dataset.reportListing));
  });
  root.querySelectorAll('[data-relist-listing]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = listingLookup.get(btn.dataset.relistListing);
      if (!t) return;
      openComposeModal({ offering: t.offering_item_ids, requesting: t.requesting_item_ids, note: t.note });
    });
  });
  root.querySelectorAll('[data-complete-listing]').forEach(btn => {
    btn.addEventListener('click', () => openCompleteModal(btn.dataset.completeListing));
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
  root.querySelectorAll('[data-share-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const shareUrl = `${location.origin}/trading/?listing=${btn.dataset.shareListing}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied — sharing it shows a snapshot of this trade.');
      } catch {
        showToast(shareUrl);
      }
    });
  });
  root.querySelectorAll('[data-repost-trade]').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = `/feed/?repost_trade=${btn.dataset.repostTrade}`; });
  });
}

// Feeds the existing admin Reports queue (reports table, already fully built on the admin
// side — target_type 'trade_listing' already has a recognized label/deep-link there). This
// was the missing half: nothing anywhere on the site actually created a report row before.
function openReportModal(listingId) {
  if (!currentUser) { window.location.href = '/auth/'; return; }
  reportingListingId = listingId;
  document.getElementById('report-listing-reason').value = 'Scam attempt';
  document.getElementById('report-listing-details').value = '';
  document.getElementById('report-listing-error').style.display = 'none';
  document.getElementById('report-listing-modal').classList.add('open');
}

async function submitListingReport() {
  const errorEl = document.getElementById('report-listing-error');
  errorEl.style.display = 'none';
  const listing = listingLookup.get(reportingListingId);
  const reason = document.getElementById('report-listing-reason').value;
  const details = document.getElementById('report-listing-details').value.trim();

  // Trade listings auto-expire/delete, so bake in enough context (poster + items) now —
  // the report should still make sense to a mod even after the listing itself is gone.
  const posterName = listing?.profiles?.username ? `@${listing.profiles.username}` : 'unknown poster';
  const summary = `Reported listing by ${posterName} (id ${reportingListingId}). Reason: ${reason}.${details ? ` Details: ${details}` : ''}`;

  const btn = document.getElementById('report-listing-submit');
  btn.disabled = true;
  const { error } = await sb.rpc('submit_report', { p_target_type: 'trade_listing', p_target_id: reportingListingId, p_reason: summary });
  btn.disabled = false;
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  document.getElementById('report-listing-modal').classList.remove('open');
  showToast('Report submitted — a mod will take a look.');
}

// --- Two-sided trade confirmation ------------------------------------------------------
// Owner marks a listing done and (optionally) names who they traded with; that person gets a
// notification + a "confirm" card here. Both sides then count as a confirmed trade.
let completingListingId = null;

function openCompleteModal(listingId) {
  completingListingId = listingId;
  document.getElementById('trade-complete-partner').value = '';
  document.getElementById('trade-complete-modal').classList.add('open');
  document.getElementById('trade-complete-partner').focus();
}
function closeCompleteModal() {
  document.getElementById('trade-complete-modal').classList.remove('open');
  completingListingId = null;
}

async function submitCompleteModal() {
  const id = completingListingId;
  if (!id) return;
  const partner = document.getElementById('trade-complete-partner').value.trim().replace(/^@/, '');
  const btn = document.getElementById('trade-complete-submit');
  btn.disabled = true;
  let error;
  if (partner) {
    ({ error } = await sb.rpc('propose_trade_confirmation', { p_listing_id: id, p_partner_username: partner }));
  } else {
    ({ error } = await sb.from('trade_listings').update({ active: false }).eq('id', id));
  }
  btn.disabled = false;
  if (error) { showToast(error.message, true); return; }
  showToast(partner ? `Marked completed — ${partner} will be asked to confirm.` : 'Marked as completed.');
  document.querySelector(`[data-listing-id="${id}"]`)?.remove();
  closeCompleteModal();
}

async function loadTradeConfirmations() {
  const section = document.getElementById('trade-confirmations');
  const list = document.getElementById('trade-confirmations-list');
  if (!section || !list || !currentUser) return;
  const { data, error } = await sb
    .from('trade_confirmations')
    .select('id, offering_item_ids, requesting_item_ids, created_at, owner:profiles!trade_confirmations_owner_id_fkey(username, display_name, avatar_url, avatar_frame)')
    .eq('partner_id', currentUser.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error || !data || !data.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  list.innerHTML = data.map(c => {
    const gave = sideSummary(c.requesting_item_ids); // what the owner requested = what you handed over
    const got = sideSummary(c.offering_item_ids);
    return `
      <div class="panel confirm-card" data-confirm-id="${c.id}">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(c.owner || {}, 34)}
          <div style="flex:1; min-width:0;">
            <p style="margin:0; font-weight:700;">${escapeHtml(displayNameFor(c.owner || {}))} says you traded with them</p>
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(c.created_at)}</p>
          </div>
        </div>
        <div class="confirm-card-items">
          <div><span class="muted" style="font-size:0.72rem;">You gave</span><div class="confirm-card-tiles">${gave.tiles || '<span class="muted">—</span>'}</div></div>
          <div><span class="muted" style="font-size:0.72rem;">You got</span><div class="confirm-card-tiles">${got.tiles || '<span class="muted">—</span>'}</div></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn btn-primary btn-sm" data-confirm-trade="${c.id}"><i data-lucide="check" class="icon-sm icon-inline"></i>Yes, that was me</button>
          <button class="btn btn-ghost btn-sm" data-decline-trade="${c.id}">Not me</button>
        </div>
      </div>`;
  }).join('');
  refreshIcons();
  list.querySelectorAll('[data-confirm-trade],[data-decline-trade]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accept = !!btn.dataset.confirmTrade;
      const id = btn.dataset.confirmTrade || btn.dataset.declineTrade;
      btn.closest('.confirm-card').querySelectorAll('button').forEach(b => { b.disabled = true; });
      const { error: err } = await sb.rpc('respond_trade_confirmation', { p_id: id, p_accept: accept });
      if (err) { showToast(err.message, true); loadTradeConfirmations(); return; }
      showToast(accept ? 'Trade confirmed — thanks!' : 'Got it, marked as not you.');
      loadTradeConfirmations();
    });
  });
  if (location.hash === '#confirmations') section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
