// BloxCore — /inventory/ : private inventory + net-worth tracker.
// Writes go through the set_inventory_item RPC (validates, rate-limits, and refreshes today's
// snapshot); a daily cron also snapshots everyone so the chart moves when values do.

let invUserId = null;
let invCatalog = [];
const invItemById = new Map();
let invRows = [];       // [{ item_id, value_type, qty }]
let invSnapshots = [];  // [{ snapshot_date, total_value }] oldest first
let invPickerCategory = 'fruit';
let invAddType = 'physical';

const invFmtFull = (n) => Number(n || 0).toLocaleString();
const invRowKey = (r) => `${r.item_id}:${r.value_type}`;
const invRowValue = (r) => {
  const item = invItemById.get(r.item_id);
  return item ? r.qty * (valueFor(item, r.value_type) || 0) : 0;
};

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  invUserId = auth.user.id;

  invCatalog = await fetchBfItemCatalog(['fruit', 'limited', 'gamepass']);
  invCatalog.forEach(i => invItemById.set(i.id, i));
  await Promise.all([invLoadRows(), invLoadSnapshots()]);

  document.getElementById('inv-loading').style.display = 'none';
  document.getElementById('inv-app').style.display = 'block';
  invRender();
  invWire();
});

async function invLoadRows() {
  const { data, error } = await sb.from('user_inventory').select('item_id, value_type, qty').eq('user_id', invUserId);
  if (error) { logError(error); showToast('Couldn\'t load your inventory.', true); return; }
  invRows = data || [];
}

async function invLoadSnapshots() {
  const { data, error } = await sb.from('net_worth_snapshots').select('snapshot_date, total_value')
    .eq('user_id', invUserId).order('snapshot_date', { ascending: true }).limit(400);
  if (error) { logError(error); return; }
  invSnapshots = data || [];
}

// ---- rendering -------------------------------------------------------------------------

function invRender() {
  const physical = invRows.filter(r => r.value_type === 'physical').reduce((s, r) => s + invRowValue(r), 0);
  const permanent = invRows.filter(r => r.value_type === 'permanent').reduce((s, r) => s + invRowValue(r), 0);
  const total = physical + permanent;
  const el = (id) => document.getElementById(id);
  el('inv-total').textContent = formatValue(total) === '—' ? '0' : formatValue(total);
  el('inv-total').title = invFmtFull(total);
  el('inv-physical').textContent = formatValue(physical) === '—' ? '0' : formatValue(physical);
  el('inv-permanent').textContent = formatValue(permanent) === '—' ? '0' : formatValue(permanent);
  el('inv-count').textContent = String(invRows.reduce((s, r) => s + r.qty, 0));
  invRenderDelta(total);
  invRenderChart(total);
  invRenderList(total);
  refreshIcons();
}

// Change vs. the snapshot closest to 7 days ago (or the oldest one if history is shorter).
function invRenderDelta(total) {
  const el = document.getElementById('inv-delta');
  const today = new Date().toISOString().slice(0, 10);
  const past = invSnapshots.filter(s => s.snapshot_date < today);
  if (!past.length || !total) { el.textContent = ''; return; }
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const base = [...past].reverse().find(s => s.snapshot_date <= cutoff) || past[0];
  const diff = total - Number(base.total_value);
  if (!diff) { el.textContent = 'No change since ' + base.snapshot_date; el.className = 'inv-stat-delta'; return; }
  const pct = Number(base.total_value) ? Math.round((diff / Number(base.total_value)) * 1000) / 10 : 0;
  el.textContent = `${diff > 0 ? '▲ +' : '▼ −'}${formatValue(Math.abs(diff))} (${pct > 0 ? '+' : ''}${pct}%) since ${base.snapshot_date}`;
  el.className = 'inv-stat-delta ' + (diff > 0 ? 'is-up' : 'is-down');
}

function invRenderChart(total) {
  const box = document.getElementById('inv-chart');
  const note = document.getElementById('inv-chart-note');
  const today = new Date().toISOString().slice(0, 10);
  const pts = invSnapshots.filter(s => s.snapshot_date !== today).map(s => ({ t: Date.parse(s.snapshot_date), v: Number(s.total_value) }));
  if (invRows.length) pts.push({ t: Date.parse(today), v: total });
  if (pts.length < 2) {
    note.textContent = '';
    box.innerHTML = `<p class="muted" style="margin:8px 0 4px; font-size:0.85rem;">${invRows.length ? 'Your chart appears after the first daily snapshot — check back tomorrow.' : 'Add items to start tracking your net worth.'}</p>`;
    return;
  }
  const W = 640, H = 150, PX = 8, PY = 14;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const x = t => PX + ((t - t0) / Math.max(1, t1 - t0)) * (W - PX * 2);
  const y = v => hi === lo ? H / 2 : H - PY - ((v - lo) / (hi - lo)) * (H - PY * 2);
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L${x(pts[i].t).toFixed(1)},${y(pts[i].v).toFixed(1)}`;
  const area = `${d} V${H - 2} H${x(t0).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  note.textContent = `${new Date(t0).toISOString().slice(0, 10)} → today · low ${formatValue(lo)} · high ${formatValue(hi)}`;
  box.innerHTML = `<svg class="value-history-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net worth history, now ${formatValue(last.v)}">`
    + `<path d="${area}" fill="var(--brass-bright)" opacity="0.12"/>`
    + `<path d="${d}" fill="none" stroke="var(--brass-bright)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
    + `<circle cx="${x(last.t).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4" fill="var(--brass-bright)"/></svg>`;
}

function invRenderList(total) {
  const list = document.getElementById('inv-list');
  if (!invRows.length) {
    list.innerHTML = '<div class="panel" style="text-align:center; padding:28px 16px;"><p style="margin:0 0 6px;">Your inventory is empty.</p><p class="muted" style="margin:0; font-size:0.85rem;">Use <strong>Add item</strong> to list the fruits, limiteds and gamepasses you own.</p></div>';
    return;
  }
  const rows = invRows.filter(r => invItemById.has(r.item_id)).sort((a, b) => invRowValue(b) - invRowValue(a));
  list.innerHTML = rows.map(r => {
    const item = invItemById.get(r.item_id);
    const unit = valueFor(item, r.value_type) || 0;
    const sub = r.qty * unit;
    const share = total ? Math.max(1, Math.round((sub / total) * 100)) : 0;
    const rarity = (item.rarity || '').toLowerCase();
    const icon = safeImgUrl(item.icon_url);
    return `
      <div class="panel inv-row" data-inv-item="${item.id}" data-inv-type="${r.value_type}">
        <div class="build-modal-tile inv-row-icon" data-rarity="${rarity}">
          ${icon ? `<img src="${icon}" alt="" loading="lazy" onerror="this.style.display='none';">` : '<i data-lucide="sparkles" class="icon-md"></i>'}
        </div>
        <div class="inv-row-main">
          <p class="inv-row-name">${escapeHtml(item.name)} <span class="tag tag-${r.value_type === 'permanent' ? 'legendary' : 'medium'}">${r.value_type === 'permanent' ? 'Permanent' : 'Physical'}</span></p>
          <p class="muted inv-row-sub">${formatValue(unit)} each · ${share}% of net worth</p>
          <div class="inv-share"><span style="width:${share}%"></span></div>
        </div>
        <div class="inv-qty">
          <button type="button" class="btn btn-ghost btn-sm" data-act="dec" aria-label="Decrease quantity">−</button>
          <input type="number" min="1" max="999" value="${r.qty}" data-act="qty" aria-label="Quantity of ${escapeHtml(item.name)}">
          <button type="button" class="btn btn-ghost btn-sm" data-act="inc" aria-label="Increase quantity">+</button>
        </div>
        <p class="inv-row-total" title="${invFmtFull(sub)}">${formatValue(sub)}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-act="remove" aria-label="Remove ${escapeHtml(item.name)}"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>`;
  }).join('');
}

// ---- editing ---------------------------------------------------------------------------

async function invSet(itemId, type, qty) {
  qty = Math.max(0, Math.min(999, Math.floor(Number(qty) || 0)));
  const prev = invRows.map(r => ({ ...r }));
  const row = invRows.find(r => r.item_id === itemId && r.value_type === type);
  if (qty === 0) invRows = invRows.filter(r => r !== row);
  else if (row) row.qty = qty;
  else invRows.push({ item_id: itemId, value_type: type, qty });
  invRender();
  const { error } = await sb.rpc('set_inventory_item', { p_item_id: itemId, p_value_type: type, p_qty: qty });
  if (error) {
    invRows = prev; // roll back the optimistic change
    invRender();
    showToast(error.message, true);
    return;
  }
  invLoadSnapshots().then(invRender); // today's snapshot was just refreshed server-side
}

function invWire() {
  const list = document.getElementById('inv-list');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('[data-inv-item]');
    if (!btn || !row || btn.dataset.act === 'qty') return;
    const itemId = Number(row.dataset.invItem), type = row.dataset.invType;
    const cur = invRows.find(r => r.item_id === itemId && r.value_type === type)?.qty || 0;
    if (btn.dataset.act === 'inc') invSet(itemId, type, cur + 1);
    else if (btn.dataset.act === 'dec') invSet(itemId, type, cur - 1);
    else if (btn.dataset.act === 'remove') invSet(itemId, type, 0);
  });
  list.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-act="qty"]');
    const row = e.target.closest('[data-inv-item]');
    if (input && row) invSet(Number(row.dataset.invItem), row.dataset.invType, input.value);
  });

  // add-item picker
  const modal = document.getElementById('inv-picker-modal');
  const grid = document.getElementById('inv-picker-grid');
  const search = document.getElementById('inv-picker-search');
  const renderGrid = () => {
    const q = search.value.trim().toLowerCase();
    const items = invCatalog.filter(i => i.category === invPickerCategory && i.regular_value != null && (!q || i.name.toLowerCase().includes(q)));
    grid.innerHTML = items.length ? items.map(pickerTileHtml).join('') : '<p class="muted" style="grid-column:1/-1;">Nothing matches.</p>';
    refreshIcons();
  };
  const syncTypeRow = () => {
    document.getElementById('inv-type-row').style.display = invPickerCategory === 'fruit' ? 'flex' : 'none';
    document.querySelectorAll('[data-add-type]').forEach(b => {
      const on = b.dataset.addType === invAddType;
      b.className = `tag ${on ? (b.dataset.addType === 'permanent' ? 'tag-legendary' : 'tag-medium') : ''}`;
      b.style.opacity = on ? '1' : '0.55';
    });
  };
  document.getElementById('inv-add').addEventListener('click', () => { modal.classList.add('open'); syncTypeRow(); renderGrid(); search.focus(); });
  document.getElementById('inv-picker-close').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.remove('open'); });
  search.addEventListener('input', renderGrid);
  document.getElementById('inv-category-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    invPickerCategory = b.dataset.category;
    document.querySelectorAll('#inv-category-tabs [data-category]').forEach(x => { x.className = `btn btn-sm ${x === b ? 'btn-primary' : 'btn-ghost'}`; });
    syncTypeRow(); renderGrid();
  });
  document.getElementById('inv-type-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add-type]');
    if (b) { invAddType = b.dataset.addType; syncTypeRow(); }
  });
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-pick-item]');
    if (!tile) return;
    const item = invItemById.get(Number(tile.dataset.pickItem));
    if (!item) return;
    const type = item.category === 'fruit' ? invAddType : 'physical';
    const cur = invRows.find(r => r.item_id === item.id && r.value_type === type)?.qty || 0;
    invSet(item.id, type, cur + 1);
    showToast(`Added ${item.name}${cur ? ` (×${cur + 1})` : ''}`);
  });

  document.getElementById('inv-copy').addEventListener('click', async () => {
    const lines = invRows.filter(r => invItemById.has(r.item_id)).sort((a, b) => invRowValue(b) - invRowValue(a))
      .map(r => `${r.qty}× ${invItemById.get(r.item_id).name}${r.value_type === 'permanent' ? ' (perm)' : ''}`);
    const total = invRows.reduce((s, r) => s + invRowValue(r), 0);
    try {
      await navigator.clipboard.writeText(`My Blox Fruits inventory — net worth ${formatValue(total)}\n${lines.join('\n')}\nbloxcores.com/inventory/`);
      showToast('Copied.');
    } catch { showToast('Couldn\'t copy — your browser blocked it.', true); }
  });
}
