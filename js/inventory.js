// BloxCore — /inventory/ : private inventory + net-worth tracker ("the vault").
// Writes go through the set_inventory_item RPC (validates, rate-limits, refreshes today's snapshot);
// a daily cron also snapshots everyone so the chart moves when values do.

let invUserId = null;
let invCatalog = [];
const invItemById = new Map();
let invRows = [];       // [{ item_id, value_type, qty }]
let invSnapshots = [];  // [{ snapshot_date, total_value }] oldest first
let invPickerCategory = 'fruit';
let invAddType = 'physical';
let invFilter = 'all';
let invSort = 'value';
let invSearchText = '';
let invChartPts = [];
let invChartNote = '';
let invFirstRender = true;
// chart geometry (viewBox units) — the line lives between INV_Y_TOP and INV_Y_BOT so the number above
// and the note below stay readable; the scrub cursor uses the same mapping
const INV_H = 300, INV_Y_TOP = 114, INV_Y_BOT = 250;

const invMoney = (n) => (n ? formatValue(n) : '0');
const invFmtFull = (n) => Number(n || 0).toLocaleString();
const invReduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const invRowValue = (r) => {
  const item = invItemById.get(r.item_id);
  return item ? r.qty * (valueFor(item, r.value_type) || 0) : 0;
};
const INV_PALETTE = ['var(--brass-bright)', 'var(--purple)', 'var(--gold)', 'var(--sea)', 'var(--blue)', '#d946ef'];

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  invUserId = auth.user.id;

  invCatalog = await fetchBfItemCatalog(['fruit', 'limited', 'gamepass']);
  invCatalog.forEach(i => invItemById.set(i.id, i));
  await Promise.all([invLoadRows(), invLoadSnapshots()]);

  document.getElementById('inv-loading').style.display = 'none';
  document.getElementById('inv-app').hidden = false;
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

  const totalEl = el('inv-total');
  totalEl.title = invFmtFull(total);
  if (invFirstRender && total && !invReduceMotion()) invCountUp(totalEl, total);
  else totalEl.textContent = invMoney(total);
  invFirstRender = false;

  el('inv-physical').textContent = invMoney(physical);
  el('inv-permanent').textContent = invMoney(permanent);
  el('inv-count').textContent = String(invRows.reduce((s, r) => s + r.qty, 0));

  const has = invRows.length > 0;
  el('inv-toolbar').hidden = !has;
  el('inv-compose').hidden = !has;
  invRenderDelta(total);
  invRenderChart(total);
  if (has) invRenderCompose(total);
  invRenderList(total);
  refreshIcons();
}

// 0 → total over ~0.8s, once, on first paint. Final frame is always the exact formatted value.
function invCountUp(el, to) {
  const start = performance.now(), dur = 800;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = invMoney(Math.round(to * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(tick); else el.textContent = invMoney(to);
  };
  requestAnimationFrame(tick);
}

// Change vs. the snapshot closest to 7 days ago (or the oldest one if history is shorter).
function invRenderDelta(total) {
  const el = document.getElementById('inv-delta');
  const today = new Date().toISOString().slice(0, 10);
  const past = invSnapshots.filter(s => s.snapshot_date < today);
  if (!past.length || !total) { el.textContent = ''; el.className = 'inv-vault-delta'; return; }
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const base = [...past].reverse().find(s => s.snapshot_date <= cutoff) || past[0];
  const diff = total - Number(base.total_value);
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(base.snapshot_date)) / 86400000));
  if (!diff) { el.textContent = `No change in ${days} day${days === 1 ? '' : 's'}`; el.className = 'inv-vault-delta'; return; }
  const pct = Number(base.total_value) ? Math.round((diff / Number(base.total_value)) * 1000) / 10 : 0;
  el.textContent = `${diff > 0 ? '▲ +' : '▼ −'}${formatValue(Math.abs(diff))} (${pct > 0 ? '+' : ''}${pct}%) in ${days} day${days === 1 ? '' : 's'}`;
  el.className = 'inv-vault-delta ' + (diff > 0 ? 'is-up' : 'is-down');
}

function invRenderChart(total) {
  const box = document.getElementById('inv-chart');
  const note = document.getElementById('inv-chart-note');
  const today = new Date().toISOString().slice(0, 10);
  const pts = invSnapshots.filter(s => s.snapshot_date !== today).map(s => ({ t: Date.parse(s.snapshot_date), v: Number(s.total_value) }));
  if (invRows.length) pts.push({ t: Date.parse(today), v: total });
  invChartPts = pts;
  const W = 1000, H = INV_H;
  if (pts.length < 2) {
    invChartNote = invRows.length ? 'Your chart starts drawing after the first daily snapshot. Check back tomorrow.' : '';
    note.textContent = invChartNote;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${H * 0.78}" x2="${W}" y2="${H * 0.78}" stroke="var(--brass-bright)" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="6 8" vector-effect="non-scaling-stroke"/></svg>`;
    return;
  }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const yTop = INV_Y_TOP, yBot = INV_Y_BOT;
  const x = t => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = v => hi === lo ? (yTop + yBot) / 2 : yBot - ((v - lo) / (hi - lo)) * (yBot - yTop);
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L${x(pts[i].t).toFixed(1)},${y(pts[i].v).toFixed(1)}`;
  const last = pts[pts.length - 1];
  invChartNote = `${new Date(t0).toISOString().slice(0, 10)} to today. Low ${formatValue(lo)}, high ${formatValue(hi)}. Move over the chart to see a day.`;
  note.textContent = invChartNote;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net worth history, now ${formatValue(last.v)}">`
    + `<defs><linearGradient id="invFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brass-bright);stop-opacity:.38"/><stop offset="1" style="stop-color:var(--brass-bright);stop-opacity:0"/></linearGradient></defs>`
    + `<path d="${d} V${H} H0 Z" fill="url(#invFill)"/>`
    + `<path d="${d}" fill="none" style="stroke:var(--brass-bright)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
    + `<div class="inv-chart-cursor" hidden><span></span></div>`;
  box.dataset.t0 = t0; box.dataset.t1 = t1; box.dataset.lo = lo; box.dataset.hi = hi;
}

// What the net worth is made of: top holdings (physical + permanent combined per item) + "other".
function invRenderCompose(total) {
  const bar = document.getElementById('inv-compose-bar');
  const legend = document.getElementById('inv-compose-legend');
  const byItem = new Map();
  invRows.forEach(r => byItem.set(r.item_id, (byItem.get(r.item_id) || 0) + invRowValue(r)));
  const parts = [...byItem].map(([id, v]) => ({ name: invItemById.get(id)?.name || 'Unknown', v })).filter(p => p.v > 0).sort((a, b) => b.v - a.v);
  if (!parts.length || !total) { bar.innerHTML = ''; legend.innerHTML = ''; return; }
  const top = parts.slice(0, 5);
  const otherV = parts.slice(5).reduce((s, p) => s + p.v, 0);
  if (otherV) top.push({ name: 'Everything else', v: otherV, other: true });
  const pct = (v) => Math.round((v / total) * 1000) / 10;
  bar.innerHTML = top.map((p, i) => `<span style="flex:${p.v}; background:${p.other ? 'var(--ash)' : INV_PALETTE[i]}" title="${escapeHtml(p.name)}: ${pct(p.v)}%"></span>`).join('');
  legend.innerHTML = top.map((p, i) => `<li><i style="background:${p.other ? 'var(--ash)' : INV_PALETTE[i]}"></i>${escapeHtml(p.name)} <b>${pct(p.v)}%</b></li>`).join('');
}

function invVisibleRows() {
  const q = invSearchText.trim().toLowerCase();
  let rows = invRows.filter(r => invItemById.has(r.item_id));
  if (invFilter !== 'all') rows = rows.filter(r => r.value_type === invFilter);
  if (q) rows = rows.filter(r => invItemById.get(r.item_id).name.toLowerCase().includes(q));
  const byName = (a, b) => invItemById.get(a.item_id).name.localeCompare(invItemById.get(b.item_id).name);
  if (invSort === 'name') rows.sort(byName);
  else if (invSort === 'qty') rows.sort((a, b) => b.qty - a.qty || invRowValue(b) - invRowValue(a));
  else rows.sort((a, b) => invRowValue(b) - invRowValue(a));
  return rows;
}

function invRenderList(total) {
  const list = document.getElementById('inv-list');
  if (!invRows.length) {
    const quick = invCatalog.filter(i => i.category === 'fruit' && i.regular_value != null)
      .sort((a, b) => b.regular_value - a.regular_value).slice(0, 8);
    list.className = 'inv-empty';
    list.innerHTML = `
      <h2>Start your vault</h2>
      <p>Add the fruits, limiteds and gamepasses you own and BloxCore will track what they're worth, every day.</p>
      <div class="inv-quick">${quick.map(i => `<button type="button" class="inv-quick-chip" data-quick-add="${i.id}">${escapeHtml(i.name)}<span>${formatValue(i.regular_value)}</span></button>`).join('')}</div>
      <button type="button" class="btn btn-primary" id="inv-empty-add"><i data-lucide="plus" class="icon-sm icon-inline"></i>Browse all items</button>`;
    return;
  }
  list.className = 'inv-grid';
  const rows = invVisibleRows();
  if (!rows.length) { list.innerHTML = '<p class="inv-nomatch">Nothing matches that filter.</p>'; return; }
  list.innerHTML = rows.map(r => {
    const item = invItemById.get(r.item_id);
    const unit = valueFor(item, r.value_type) || 0;
    const sub = r.qty * unit;
    const share = total ? Math.max(1, Math.round((sub / total) * 100)) : 0;
    const icon = safeImgUrl(item.icon_url);
    const perm = r.value_type === 'permanent';
    return `
      <article class="inv-card" data-rarity="${escapeHtml((item.rarity || '').toLowerCase())}" data-inv-item="${item.id}" data-inv-type="${r.value_type}">
        <div class="inv-card-art">
          ${icon ? `<img src="${icon}" alt="" loading="lazy" onerror="this.style.display='none';">` : '<i data-lucide="sparkles" class="icon-lg"></i>'}
          <span class="inv-card-qty">×${r.qty}</span>
          <span class="inv-pill ${perm ? 'is-perm' : ''}">${perm ? 'Permanent' : 'Physical'}</span>
        </div>
        <div class="inv-card-body">
          <h3 class="inv-card-name">${escapeHtml(item.name)}</h3>
          <p class="inv-card-value" title="${invFmtFull(sub)}">${invMoney(sub)}</p>
          <p class="inv-card-sub">${formatValue(unit)} each, ${share}% of your total</p>
        </div>
        <div class="inv-card-actions">
          <div class="inv-qty">
            <button type="button" data-act="dec" aria-label="One fewer ${escapeHtml(item.name)}">−</button>
            <input type="number" min="1" max="999" value="${r.qty}" data-act="qty" aria-label="Quantity of ${escapeHtml(item.name)}">
            <button type="button" data-act="inc" aria-label="One more ${escapeHtml(item.name)}">+</button>
          </div>
          <button type="button" class="inv-remove" data-act="remove" aria-label="Remove ${escapeHtml(item.name)}"><i data-lucide="trash-2" class="icon-sm"></i></button>
        </div>
        <div class="inv-card-share" aria-hidden="true"><span style="width:${share}%"></span></div>
      </article>`;
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
    const quick = e.target.closest('[data-quick-add]');
    if (quick) { invSet(Number(quick.dataset.quickAdd), 'physical', 1); return; }
    if (e.target.closest('#inv-empty-add')) { document.getElementById('inv-add').click(); return; }
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('[data-inv-item]');
    if (!btn || !card || btn.dataset.act === 'qty') return;
    const itemId = Number(card.dataset.invItem), type = card.dataset.invType;
    const cur = invRows.find(r => r.item_id === itemId && r.value_type === type)?.qty || 0;
    if (btn.dataset.act === 'inc') invSet(itemId, type, cur + 1);
    else if (btn.dataset.act === 'dec') invSet(itemId, type, cur - 1);
    else if (btn.dataset.act === 'remove') invSet(itemId, type, 0);
  });
  list.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-act="qty"]');
    const card = e.target.closest('[data-inv-item]');
    if (input && card) invSet(Number(card.dataset.invItem), card.dataset.invType, input.value);
  });

  // toolbar: search / filter / sort re-render the grid only
  const reList = () => { invRenderList(invRows.reduce((s, r) => s + invRowValue(r), 0)); refreshIcons(); };
  document.getElementById('inv-search').addEventListener('input', (e) => { invSearchText = e.target.value; reList(); });
  document.getElementById('inv-sort').addEventListener('change', (e) => { invSort = e.target.value; reList(); });
  document.getElementById('inv-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    invFilter = b.dataset.filter;
    document.querySelectorAll('#inv-filter [data-filter]').forEach(x => x.classList.toggle('is-on', x === b));
    reList();
  });

  // chart scrubbing: show the value for the day under the pointer
  const chart = document.getElementById('inv-chart');
  const note = document.getElementById('inv-chart-note');
  const scrub = (e) => {
    if (invChartPts.length < 2) return;
    const rect = chart.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = invChartPts[0].t + ratio * (invChartPts[invChartPts.length - 1].t - invChartPts[0].t);
    const p = invChartPts.reduce((best, c) => Math.abs(c.t - t) < Math.abs(best.t - t) ? c : best);
    const lo = Number(chart.dataset.lo), hi = Number(chart.dataset.hi);
    const cur = chart.querySelector('.inv-chart-cursor');
    if (cur) {
      cur.hidden = false;
      cur.style.left = `${((p.t - invChartPts[0].t) / Math.max(1, invChartPts[invChartPts.length - 1].t - invChartPts[0].t)) * 100}%`;
      const r = hi === lo ? 0.5 : (p.v - lo) / (hi - lo);
      cur.firstElementChild.style.top = `${((INV_Y_BOT - r * (INV_Y_BOT - INV_Y_TOP)) / INV_H) * 100}%`;
    }
    note.textContent = `${new Date(p.t).toISOString().slice(0, 10)}: ${formatValue(p.v)}`;
  };
  chart.addEventListener('pointermove', scrub);
  chart.addEventListener('pointerleave', () => {
    note.textContent = invChartNote;
    const cur = chart.querySelector('.inv-chart-cursor');
    if (cur) cur.hidden = true;
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
      await navigator.clipboard.writeText(`My Blox Fruits inventory, net worth ${formatValue(total)}\n${lines.join('\n')}\nbloxcores.com/inventory/`);
      showToast('Copied.');
    } catch { showToast('Couldn\'t copy. Your browser blocked it.', true); }
  });
}
