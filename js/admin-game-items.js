// BloxCore — admin/manage/#game-items logic (admin only)
// Unified catalog for every kind of game item (fruits, swords, guns, fighting styles,
// races, accessories, and whatever categories get added later) — all living in bf_items,
// categorized via item_categories instead of a fixed list. Adding a whole new category
// is one row in item_categories (via the "New Category" button below), not a schema
// change or a code edit — every filter/dropdown/tab here reads that table live.

let allCategories = [];
let allItems = [];
let currentCategory = null; // null = "All"
let currentRarityFilter = '';
let searchQuery = '';
let selectedItemIds = new Set();
let itemEditId = null;
const ITEM_IMAGE_ALLOWED_TYPES = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

let _gameItemsTabInit = false;

async function initGameItemsTab() {
  if (_gameItemsTabInit) return;
  _gameItemsTabInit = true;

  try {
    await loadCategories();
    await loadItems();

    document.getElementById('gi-search').addEventListener('input', debounce(() => {
      searchQuery = document.getElementById('gi-search').value.trim().toLowerCase();
      applyFiltersAndRender();
    }, 200));
    document.getElementById('gi-rarity-filter').addEventListener('change', (e) => {
      currentRarityFilter = e.target.value;
      applyFiltersAndRender();
    });

    document.getElementById('gi-add-item-btn').addEventListener('click', () => openItemModal());
    document.getElementById('gi-item-modal-close').addEventListener('click', closeItemModal);
    document.getElementById('gi-item-form-cancel').addEventListener('click', closeItemModal);
    document.getElementById('gi-item-form').addEventListener('submit', handleSubmitItem);
    document.getElementById('gi-item-category').addEventListener('change', updateTradeFieldsVisibility);
    document.getElementById('gi-item-image-file').addEventListener('change', handleItemImagePreview);

    document.getElementById('gi-add-category-btn').addEventListener('click', openCategoryModal);
    document.getElementById('gi-category-modal-close').addEventListener('click', closeCategoryModal);
    document.getElementById('gi-category-form-cancel').addEventListener('click', closeCategoryModal);
    document.getElementById('gi-category-form').addEventListener('submit', handleCreateCategory);

    document.getElementById('gi-bulk-import-btn').addEventListener('click', openBulkImportModal);
    document.getElementById('gi-bulk-import-close').addEventListener('click', closeBulkImportModal);
    document.getElementById('gi-bulk-import-submit').addEventListener('click', handleBulkImportSubmit);

    document.getElementById('gi-bulk-recategorize-btn').addEventListener('click', handleBulkRecategorize);
    document.getElementById('gi-bulk-delete-btn').addEventListener('click', handleBulkDelete);
    document.getElementById('gi-bulk-clear-btn').addEventListener('click', () => {
      selectedItemIds.clear();
      applyFiltersAndRender();
    });
  } catch (e) {
    logError('Failed to init Game Items tab:', e);
    _gameItemsTabInit = false;
    showToast('Something went wrong loading the game items manager. Try again.', true);
  }
}

// Small helper so search-as-you-type doesn't re-render on every keystroke.
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function categoryByKey(key) {
  return allCategories.find(c => c.key === key);
}

async function loadCategories() {
  const { data, error } = await sb.from('item_categories').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  allCategories = data || [];
  renderCategoryTabs();
  renderCategorySelects();
}

function renderCategoryTabs() {
  const container = document.getElementById('gi-category-tabs');
  const tabs = [{ key: null, label: 'All', icon: 'layout-grid' }, ...allCategories];
  container.innerHTML = tabs.map(c => `
    <button type="button" class="btn btn-sm gi-category-tab ${currentCategory === c.key ? 'active' : ''}" data-category-key="${c.key ?? ''}">
      <i data-lucide="${c.icon}" class="icon-sm icon-inline"></i>${escapeHtml(c.label)}
    </button>
  `).join('');
  refreshIcons();
  container.querySelectorAll('.gi-category-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.categoryKey || null;
      container.querySelectorAll('.gi-category-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFiltersAndRender();
    });
  });
}

function renderCategorySelects() {
  const options = allCategories.map(c => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  document.getElementById('gi-item-category').innerHTML = options;
  document.getElementById('gi-bulk-category-select').innerHTML = `<option value="">Move to…</option>` + options;
}

async function loadItems() {
  const grid = document.getElementById('gi-items-grid');
  const { data, error } = await sb.from('bf_items').select('*').order('category', { ascending: true }).order('name', { ascending: true });
  if (error) {
    grid.innerHTML = errorStateHtml("Couldn't load game items right now.", 'loadItems()');
    refreshIcons();
    logError(error);
    return;
  }
  allItems = data || [];
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  const grid = document.getElementById('gi-items-grid');
  let filtered = allItems;
  if (currentCategory) filtered = filtered.filter(i => i.category === currentCategory);
  if (currentRarityFilter) filtered = filtered.filter(i => i.rarity === currentRarityFilter);
  if (searchQuery) filtered = filtered.filter(i => i.name.toLowerCase().includes(searchQuery));

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No items match.</div>`;
    updateBulkBar();
    return;
  }

  grid.innerHTML = filtered.map(renderItemCard).join('');
  refreshIcons();

  grid.querySelectorAll('[data-item-select]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.itemSelect;
      if (cb.checked) selectedItemIds.add(id); else selectedItemIds.delete(id);
      updateBulkBar();
    });
  });
  grid.querySelectorAll('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', () => openItemModal(allItems.find(i => String(i.id) === btn.dataset.editItem)));
  });
  grid.querySelectorAll('[data-delete-item]').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.deleteItem, btn.dataset.name));
  });

  updateBulkBar();
}

function renderItemCard(item) {
  const cat = categoryByKey(item.category);
  const isSelected = selectedItemIds.has(String(item.id));
  return `
    <div class="panel hover-lift-card" style="padding:14px;">
      <div class="flex-between" style="align-items:flex-start;">
        <input type="checkbox" data-item-select="${item.id}" ${isSelected ? 'checked' : ''} style="width:auto; margin-top:2px;">
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-item="${item.id}" title="Edit"><i data-lucide="pencil" class="icon-sm"></i></button>
          <button type="button" class="btn btn-danger btn-sm" data-delete-item="${item.id}" data-name="${escapeHtml(item.name)}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
        </div>
      </div>
      <div style="text-align:center; margin-top:6px;">
        ${item.icon_url ? `<img src="${item.icon_url}" alt="${escapeHtml(item.name)}" loading="lazy" style="width:56px; height:56px; object-fit:contain; margin-bottom:6px;">` : ''}
        <p style="margin:0; font-weight:700; font-size:0.9rem;">${escapeHtml(item.name)}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.74rem;">${cat ? escapeHtml(cat.label) : item.category}${item.rarity ? ' · ' + escapeHtml(item.rarity) : ''}</p>
        ${cat?.is_tradeable ? `<p class="muted" style="margin:4px 0 0; font-size:0.72rem;">${item.regular_value != null ? `Value: ${item.regular_value}` : 'No value set'}${item.demand != null ? ` · Demand ${item.demand}/5` : ''}</p>` : ''}
      </div>
    </div>
  `;
}

function updateBulkBar() {
  const bar = document.getElementById('gi-bulk-bar');
  const count = selectedItemIds.size;
  bar.style.display = count ? 'flex' : 'none';
  document.getElementById('gi-bulk-count').textContent = `${count} selected`;
}

// ---- Add / edit item ----
function updateTradeFieldsVisibility() {
  const cat = categoryByKey(document.getElementById('gi-item-category').value);
  document.getElementById('gi-item-trade-fields').style.display = cat?.is_tradeable ? 'grid' : 'none';
}

function openItemModal(item = null) {
  itemEditId = item ? item.id : null;
  document.getElementById('gi-item-modal-title').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('gi-item-form-submit').textContent = item ? 'Save Changes' : 'Add Item';
  document.getElementById('gi-item-form').reset();
  document.getElementById('gi-item-image-preview').style.display = 'none';

  document.getElementById('gi-item-name').value = item?.name || '';
  document.getElementById('gi-item-category').value = item?.category || allCategories[0]?.key || '';
  document.getElementById('gi-item-rarity').value = item?.rarity || '';
  document.getElementById('gi-item-regular-value').value = item?.regular_value ?? '';
  document.getElementById('gi-item-permanent-value').value = item?.permanent_value ?? '';
  document.getElementById('gi-item-demand').value = item?.demand ?? '';
  document.getElementById('gi-item-trend').value = item?.trend || '';
  document.getElementById('gi-item-image-url').value = item?.icon_url || '';
  if (item?.icon_url) {
    document.getElementById('gi-item-image-preview').src = item.icon_url;
    document.getElementById('gi-item-image-preview').style.display = 'block';
  }
  updateTradeFieldsVisibility();

  document.getElementById('gi-item-modal').classList.add('open');
}

function closeItemModal() {
  document.getElementById('gi-item-modal').classList.remove('open');
}

function handleItemImagePreview(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('gi-item-image-preview');
  if (!file) return;
  if (!ITEM_IMAGE_ALLOWED_TYPES[file.type]) {
    showToast('Image must be PNG, WEBP, JPEG, or GIF.', true);
    e.target.value = '';
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
}

async function handleSubmitItem(e) {
  e.preventDefault();
  const btn = document.getElementById('gi-item-form-submit');
  btn.disabled = true;

  try {
    let iconUrl = document.getElementById('gi-item-image-url').value.trim() || null;
    const file = document.getElementById('gi-item-image-file').files[0];
    if (file) {
      const compressed = await compressImage(file, { maxDimension: 400, quality: 0.88 });
      const ext = compressed.name ? compressed.name.split('.').pop() : (ITEM_IMAGE_ALLOWED_TYPES[file.type] || 'png');
      const path = `${document.getElementById('gi-item-category').value}/${Date.now()}.${ext}`;
      const { error: uploadError } = await sb.storage.from('game-items').upload(path, compressed);
      if (uploadError) throw uploadError;
      const { data: urlData } = sb.storage.from('game-items').getPublicUrl(path);
      iconUrl = urlData.publicUrl;
    }

    const category = document.getElementById('gi-item-category').value;
    const cat = categoryByKey(category);
    const payload = {
      name: document.getElementById('gi-item-name').value.trim(),
      category,
      rarity: document.getElementById('gi-item-rarity').value || null,
      icon_url: iconUrl,
      regular_value: cat?.is_tradeable && document.getElementById('gi-item-regular-value').value ? Number(document.getElementById('gi-item-regular-value').value) : null,
      permanent_value: cat?.is_tradeable && document.getElementById('gi-item-permanent-value').value ? Number(document.getElementById('gi-item-permanent-value').value) : null,
      demand: cat?.is_tradeable && document.getElementById('gi-item-demand').value ? Number(document.getElementById('gi-item-demand').value) : null,
      trend: cat?.is_tradeable ? (document.getElementById('gi-item-trend').value || null) : null,
    };

    if (itemEditId) {
      const { error } = await sb.from('bf_items').update(payload).eq('id', itemEditId);
      if (error) throw error;
      showToast('Item updated.');
    } else {
      const { error } = await sb.from('bf_items').insert(payload);
      if (error) throw error;
      showToast('Item added.');
    }

    closeItemModal();
    await loadItems();
  } catch (err) {
    logError(err);
    showToast(err.message || 'Could not save item.', true);
  } finally {
    btn.disabled = false;
  }
}

async function deleteItem(id, name) {
  if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
  const { error } = await sb.from('bf_items').delete().eq('id', id);
  if (error) { showToast(error.message, true); return; }
  showToast('Item deleted.');
  await loadItems();
}

// ---- Bulk actions ----
async function handleBulkDelete() {
  if (!selectedItemIds.size) return;
  if (!window.confirm(`Delete ${selectedItemIds.size} item(s)? This can't be undone.`)) return;
  const { error } = await sb.from('bf_items').delete().in('id', [...selectedItemIds]);
  if (error) { showToast(error.message, true); return; }
  showToast(`${selectedItemIds.size} item(s) deleted.`);
  selectedItemIds.clear();
  await loadItems();
}

async function handleBulkRecategorize() {
  const newCategory = document.getElementById('gi-bulk-category-select').value;
  if (!newCategory) { showToast('Choose a category to move to first.', true); return; }
  if (!selectedItemIds.size) return;
  const { error } = await sb.from('bf_items').update({ category: newCategory }).in('id', [...selectedItemIds]);
  if (error) { showToast(error.message, true); return; }
  showToast(`${selectedItemIds.size} item(s) moved.`);
  selectedItemIds.clear();
  await loadItems();
}

// ---- New category ----
function openCategoryModal() {
  document.getElementById('gi-category-form').reset();
  document.getElementById('gi-category-icon').value = 'box';
  document.getElementById('gi-category-modal').classList.add('open');
}
function closeCategoryModal() {
  document.getElementById('gi-category-modal').classList.remove('open');
}

function slugifyCategoryKey(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || `category_${Date.now()}`;
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const label = document.getElementById('gi-category-label').value.trim();
  const icon = document.getElementById('gi-category-icon').value.trim() || 'box';
  const isTradeable = document.getElementById('gi-category-tradeable').checked;
  const key = slugifyCategoryKey(label);

  const maxSort = allCategories.reduce((m, c) => Math.max(m, c.sort_order), -1);
  const { error } = await sb.from('item_categories').insert({ key, label, icon, is_tradeable: isTradeable, sort_order: maxSort + 1 });
  if (error) { showToast(error.message, true); return; }

  showToast(`"${label}" category created.`);
  closeCategoryModal();
  await loadCategories();
}

// ---- Bulk import (JSON array or CSV with header row) ----
function openBulkImportModal() {
  document.getElementById('gi-bulk-import-text').value = '';
  document.getElementById('gi-bulk-import-status').textContent = '';
  document.getElementById('gi-bulk-import-modal').classList.add('open');
}
function closeBulkImportModal() {
  document.getElementById('gi-bulk-import-modal').classList.remove('open');
}

// Handles quoted fields (so a value can safely contain a comma) — simple but correct
// for the flat, single-line-per-row shape this import expects.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

function normalizeImportRow(raw) {
  const name = (raw.name || '').toString().trim();
  const category = (raw.category || '').toString().trim();
  if (!name || !category) return null;
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    name,
    category,
    rarity: raw.rarity ? String(raw.rarity).trim() : null,
    icon_url: raw.icon_url ? String(raw.icon_url).trim() : null,
    regular_value: num(raw.regular_value),
    permanent_value: num(raw.permanent_value),
    demand: num(raw.demand),
    trend: raw.trend ? String(raw.trend).trim() : null,
  };
}

async function handleBulkImportSubmit() {
  const btn = document.getElementById('gi-bulk-import-submit');
  const statusEl = document.getElementById('gi-bulk-import-status');
  const raw = document.getElementById('gi-bulk-import-text').value.trim();
  if (!raw) return;

  let rows;
  try {
    const trimmed = raw.trimStart();
    const parsed = trimmed.startsWith('[') ? JSON.parse(raw) : parseCsv(raw);
    rows = parsed.map(normalizeImportRow).filter(Boolean);
  } catch (e) {
    statusEl.textContent = 'Could not parse that as JSON or CSV — check the format.';
    statusEl.style.color = 'var(--blood)';
    return;
  }

  if (!rows.length) {
    statusEl.textContent = 'No valid rows found (need at least name + category per row).';
    statusEl.style.color = 'var(--blood)';
    return;
  }

  const knownCategories = new Set(allCategories.map(c => c.key));
  const unknownCategories = [...new Set(rows.map(r => r.category).filter(c => !knownCategories.has(c)))];
  if (unknownCategories.length) {
    statusEl.textContent = `Unknown categories: ${unknownCategories.join(', ')} — create them first with "New Category".`;
    statusEl.style.color = 'var(--blood)';
    return;
  }

  btn.disabled = true;
  statusEl.style.color = '';
  statusEl.textContent = `Importing ${rows.length} item(s)…`;
  try {
    const { error } = await sb.from('bf_items').insert(rows);
    if (error) throw error;
    showToast(`Imported ${rows.length} item(s).`);
    closeBulkImportModal();
    await loadItems();
  } catch (e) {
    logError(e);
    statusEl.textContent = e.message || 'Import failed.';
    statusEl.style.color = 'var(--blood)';
  } finally {
    btn.disabled = false;
  }
}
