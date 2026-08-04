// BloxCore — trading/index.html logic (backed by the bf_items reference table)

let currentUser = null;
let allTradeItems = [];
let pickerTarget = null; // 'offering' | 'requesting'
let pickerCategory = 'fruit';
let offeringIds = [];
let requestingIds = [];

const TREND_COLOR = { stable: 'var(--glass-border)', overpaid: 'var(--blood)', underpaid: 'var(--sea)' };

document.addEventListener('DOMContentLoaded', async () => {
  const { user } = await getCurrentProfile();
  currentUser = user;

  if (currentUser) {
    document.getElementById('new-listing-btn').style.display = 'inline-flex';
    document.getElementById('new-listing-btn').addEventListener('click', openComposeModal);
  } else {
    document.getElementById('trade-signed-out').style.display = 'block';
  }

  const { data } = await sb.from('bf_items').select('*').in('category', ['fruit', 'limited']).order('name');
  allTradeItems = data || [];

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

function itemValue(item) {
  return item.permanent_value || item.regular_value || 0;
}

function formatValue(n) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return String(n);
}

function itemTileHtml(item) {
  const value = itemValue(item);
  return `
    <div class="trade-item-tile" style="border-color:${TREND_COLOR[item.trend] || 'var(--glass-border)'};" title="${escapeHtml(item.name)} — ${formatValue(value)} — demand ${item.demand || '?'}/10 — ${item.trend || 'stable'}">
      ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-lg"></i>`}
      <div class="trade-item-footer"><span>${formatValue(value)}</span></div>
    </div>
  `;
}

// --- Compose modal -----------------------------------------------------

function openComposeModal() {
  offeringIds = [];
  requestingIds = [];
  document.getElementById('trade-note').value = '';
  renderSlotList('offering');
  renderSlotList('requesting');
  document.getElementById('trade-compose-modal').classList.add('open');
}
function closeComposeModal() {
  document.getElementById('trade-compose-modal').classList.remove('open');
}

function renderSlotList(side) {
  const ids = side === 'offering' ? offeringIds : requestingIds;
  const container = document.getElementById(`${side}-items`);
  container.innerHTML = ids.map((id, i) => {
    const item = itemById(id);
    if (!item) return '';
    return `
      <div class="trade-slot-tile">
        ${itemTileHtml(item)}
        <button type="button" class="trade-slot-remove" data-remove-index="${i}" data-remove-side="${side}">×</button>
      </div>
    `;
  }).join('');
  container.querySelectorAll('[data-remove-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const arr = btn.dataset.removeSide === 'offering' ? offeringIds : requestingIds;
      arr.splice(Number(btn.dataset.removeIndex), 1);
      renderSlotList(btn.dataset.removeSide);
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
    ? items.map(item => `<div class="build-modal-tile" data-pick-item="${item.id}" style="padding:6px;">${itemTileHtml(item)}<span style="font-size:0.72rem; margin-top:4px;">${escapeHtml(item.name)}</span></div>`).join('')
    : `<p class="muted" style="grid-column:1/-1;">No items found${query ? ' matching your search' : ''}.</p>`;

  grid.querySelectorAll('[data-pick-item]').forEach(tile => {
    tile.addEventListener('click', () => {
      const id = Number(tile.dataset.pickItem);
      const arr = pickerTarget === 'offering' ? offeringIds : requestingIds;
      if (arr.length >= 6) { showToast('You can add up to 6 items per side.', true); return; }
      arr.push(id);
      renderSlotList(pickerTarget);
      document.getElementById('item-picker-modal').classList.remove('open');
    });
  });
  refreshIcons();
}

async function handlePost() {
  if (!offeringIds.length || !requestingIds.length) {
    showToast('Add at least one item to both sides.', true);
    return;
  }
  const note = document.getElementById('trade-note').value.trim();
  const btn = document.getElementById('trade-post-btn');
  btn.disabled = true;

  const { error } = await sb.from('trade_listings').insert({
    user_id: currentUser.id,
    offering_item_ids: offeringIds,
    requesting_item_ids: requestingIds,
    note: note || null,
  });
  btn.disabled = false;

  if (error) { showToast(error.message, true); return; }
  closeComposeModal();
  showToast('Listing posted.');
  loadListings();
}

// --- Listing feed --------------------------------------------------------

async function loadListings() {
  const container = document.getElementById('trade-listings');
  const { data, error } = await sb
    .from('trade_listings')
    .select('id, user_id, offering_item_ids, requesting_item_ids, note, created_at, profiles(username, display_name, avatar_url, title_color_override, titles(name, color))')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    container.innerHTML = `<p class="muted">Couldn't load listings right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    container.innerHTML = `<div class="empty-state">No trade listings yet — be the first to post one.</div>`;
    return;
  }

  // If the catalog hasn't loaded yet for some reason, still show something reasonable.
  container.innerHTML = data.map(renderListing).join('');
  wireListingActions();
  refreshIcons();
}

function sideSummary(ids) {
  const items = ids.map(itemById).filter(Boolean);
  const total = items.reduce((sum, i) => sum + itemValue(i), 0);
  return { total, items };
}

function renderListing(t) {
  const profile = t.profiles || {};
  const canDelete = currentUser && t.user_id === currentUser.id;
  const offer = sideSummary(t.offering_item_ids || []);
  const request = sideSummary(t.requesting_item_ids || []);

  return `
    <div class="panel trade-card" data-listing-id="${t.id}">
      <div class="flex-between">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(profile, 30)}
          <div>
            <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.9rem;">${titleBadge(profile)} ${escapeHtml(displayNameFor(profile))}</a>
            <p class="muted" style="margin:0; font-size:0.75rem;">${timeAgo(t.created_at)}</p>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <a href="/chat/" class="btn btn-ghost btn-sm"><i data-lucide="message-circle" class="icon-sm icon-inline"></i>Chat</a>
          <a href="/player/?u=${encodeURIComponent(profile.username || '')}" class="btn btn-primary btn-sm"><i data-lucide="repeat" class="icon-sm icon-inline"></i>Trade</a>
          ${canDelete ? `<button class="btn btn-ghost btn-sm" data-delete-listing="${t.id}"><i data-lucide="x" class="icon-sm"></i></button>` : ''}
        </div>
      </div>

      ${t.note ? `<p class="muted" style="margin:12px 0 0; font-size:0.85rem;">${escapeHtml(t.note)}</p>` : ''}

      <div class="trade-columns">
        <div>
          <div class="trade-side-header" style="color:var(--sea);">
            <i data-lucide="sparkles" class="icon-sm"></i>Offering
            <span class="trade-side-total">${formatValue(offer.total)}</span>
          </div>
          <div class="trade-item-grid">${offer.items.map(itemTileHtml).join('')}</div>
        </div>
        <div class="trade-arrow"><i data-lucide="arrow-right" class="icon-sm"></i></div>
        <div>
          <div class="trade-side-header" style="color:var(--gold-bright);">
            <i data-lucide="sparkles" class="icon-sm"></i>Requesting
            <span class="trade-side-total">${formatValue(request.total)}</span>
          </div>
          <div class="trade-item-grid">${request.items.map(itemTileHtml).join('')}</div>
        </div>
      </div>
    </div>
  `;
}

function wireListingActions() {
  document.querySelectorAll('[data-delete-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('trade_listings').delete().eq('id', btn.dataset.deleteListing);
      if (error) { showToast(error.message, true); return; }
      document.querySelector(`[data-listing-id="${btn.dataset.deleteListing}"]`)?.remove();
    });
  });
}
