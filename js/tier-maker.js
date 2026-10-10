// BloxCore — /tier-maker/ : drag-and-drop tier list builder + community average.
// DB: tier_lists (public, one row per saved list; trigger validates shape), get_community_tiers(category) RPC
// (average of each player's most recent list, S=5 … D=1). Works with drag & drop or tap-an-item-then-tap-a-tier.

const TM_TIERS = ['S', 'A', 'B', 'C', 'D'];
const TM_COLORS = { S: '#f472b6', A: '#fbbf24', B: '#60a5fa', C: '#34d399', D: '#94a3b8' };
const TM_CATS = { fruit: 'Fruits', sword: 'Swords', gun: 'Guns', accessory: 'Accessories', fighting_style: 'Fighting styles', limited: 'Limited' };

let tmCat = 'fruit';
let tmMode = 'mine';            // mine | community | view
let tmItems = [];
let tmById = new Map();
let tmPlacement = new Map();    // item id -> tier letter (absent = unranked)
let tmCommunity = new Map();    // item id -> { tier, score, votes }
let tmCommunityLists = 0;
let tmSelected = null;
let tmEditingId = null;
let tmViewer = null;
let tmSearch = '';
let tmViewMeta = null;

onReady(async () => {
  const { user } = await getCurrentProfile();
  tmViewer = user;
  document.querySelectorAll('[data-tm-cat]').forEach(b => b.addEventListener('click', () => switchCategory(b.dataset.tmCat)));
  document.querySelectorAll('[data-tm-mode]').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.tmMode)));
  document.getElementById('tm-search').addEventListener('input', (e) => { tmSearch = e.target.value.trim().toLowerCase(); renderPool(); });
  document.getElementById('tm-save').addEventListener('click', saveList);
  document.getElementById('tm-reset').addEventListener('click', () => { if (confirm('Clear all placements?')) { tmPlacement.clear(); tmEditingId = null; document.getElementById('tm-title').value = ''; persistDraft(); renderAll(); } });
  ['tm-export', 'tm-export-view', 'tm-export-community'].forEach(id => document.getElementById(id)?.addEventListener('click', exportImage));
  document.getElementById('tm-saved').addEventListener('change', (e) => { if (e.target.value) loadSavedList(e.target.value); });
  document.getElementById('tm-delete').addEventListener('click', deleteList);
  document.getElementById('tm-remix').addEventListener('click', remixView);
  document.getElementById('tm-copy-link').addEventListener('click', copyShareLink);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { tmSelected = null; renderAll(); } });

  const shared = new URLSearchParams(location.search).get('l');
  if (shared) await openSharedList(shared); else await switchCategory('fruit');
});

function setActive(selector, attr, value) {
  document.querySelectorAll(selector).forEach(b => {
    const on = b.dataset[attr] === value;
    b.classList.toggle('btn-primary', on); b.classList.toggle('btn-ghost', !on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

async function loadItems(cat) {
  const { data, error } = await sb.from('bf_items').select('id, name, category, icon_url, regular_value').eq('category', cat).order('name');
  if (error) { logError('tier-maker items failed:', error); showToast('Couldn\'t load items.', true); return false; }
  tmItems = data || [];
  tmById = new Map(tmItems.map(i => [i.id, i]));
  return true;
}

async function switchCategory(cat) {
  tmCat = cat; tmSelected = null; tmEditingId = null; tmViewMeta = null;
  if (location.search.includes('l=')) history.replaceState(null, '', location.pathname);
  setActive('[data-tm-cat]', 'tmCat', cat);
  document.getElementById('tm-title').value = '';
  if (!(await loadItems(cat))) return;
  tmPlacement = new Map();
  if (tmMode === 'view') tmMode = 'mine';
  if (tmMode === 'community') await loadCommunity(); else restoreDraft();
  await loadMyLists();
  renderAll();
}

async function switchMode(mode) {
  if (mode === tmMode) return;
  tmMode = mode; tmSelected = null;
  if (mode === 'community') await loadCommunity();
  else { tmViewMeta = null; tmPlacement = new Map(); restoreDraft(); }
  renderAll();
}

// ---- persistence -------------------------------------------------------------------------------
function draftKey() { return `bc_tm_draft_${tmCat}`; }
function persistDraft() {
  if (tmMode !== 'mine') return;
  try { localStorage.setItem(draftKey(), JSON.stringify({ placement: [...tmPlacement.entries()], title: document.getElementById('tm-title').value })); } catch { /* storage blocked */ }
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return;
    const d = JSON.parse(raw);
    tmPlacement = new Map((d.placement || []).filter(([id, t]) => tmById.has(id) && TM_TIERS.includes(t)));
    if (d.title) document.getElementById('tm-title').value = d.title;
  } catch { /* ignore bad draft */ }
}

async function loadMyLists() {
  const sel = document.getElementById('tm-saved');
  const wrap = document.getElementById('tm-saved-wrap');
  if (!tmViewer) { wrap.style.display = 'none'; return; }
  const { data } = await sb.from('tier_lists').select('id, title, updated_at').eq('user_id', tmViewer.id).eq('category', tmCat).order('updated_at', { ascending: false });
  wrap.style.display = data?.length ? '' : 'none';
  sel.innerHTML = '<option value="">Load a saved list…</option>' + (data || []).map(l => `<option value="${l.id}"${l.id === tmEditingId ? ' selected' : ''}>${escapeHtml(l.title)}</option>`).join('');
}

async function loadSavedList(id) {
  const { data, error } = await sb.from('tier_lists').select('id, title, category, tiers').eq('id', id).maybeSingle();
  if (error || !data) { showToast('Couldn\'t load that list.', true); return; }
  applyTiers(data.tiers);
  tmEditingId = data.id;
  document.getElementById('tm-title').value = data.title;
  showShareLink(data.id);
  renderAll();
}

function applyTiers(tiers) {
  tmPlacement = new Map();
  Object.entries(tiers || {}).forEach(([tier, ids]) => (ids || []).forEach(id => { if (tmById.has(id)) tmPlacement.set(id, tier); }));
}

async function saveList() {
  if (!tmViewer) { showToast('Sign in to save and share your tier list.', true); return; }
  const title = document.getElementById('tm-title').value.trim();
  if (title.length < 3) { showToast('Give your list a title (3+ characters).', true); return; }
  if (tmPlacement.size < 3) { showToast('Place at least 3 items first.', true); return; }
  const tiers = {};
  TM_TIERS.forEach(t => { tiers[t] = [...tmPlacement.entries()].filter(([, tier]) => tier === t).map(([id]) => id); });
  const btn = document.getElementById('tm-save');
  btn.disabled = true;
  const row = { title, category: tmCat, tiers };
  const { data, error } = tmEditingId
    ? await sb.from('tier_lists').update(row).eq('id', tmEditingId).select('id').single()
    : await sb.from('tier_lists').insert({ ...row, user_id: tmViewer.id }).select('id').single();
  btn.disabled = false;
  if (error) { showToast(error.message, true); return; }
  tmEditingId = data.id;
  showToast('Saved! Your list now counts toward the community average.');
  showShareLink(data.id);
  loadMyLists();
}

async function deleteList() {
  if (!tmEditingId || !confirm('Delete this saved tier list?')) return;
  const { error } = await sb.from('tier_lists').delete().eq('id', tmEditingId);
  if (error) { showToast(error.message, true); return; }
  tmEditingId = null; document.getElementById('tm-share').style.display = 'none';
  showToast('Deleted.'); loadMyLists(); renderAll();
}

function shareUrl(id) { return `${location.origin}/tier-maker/?l=${id}`; }
function showShareLink(id) {
  const box = document.getElementById('tm-share');
  box.style.display = '';
  box.dataset.url = shareUrl(id);
  document.getElementById('tm-share-url').textContent = shareUrl(id);
  document.getElementById('tm-delete').style.display = '';
}
async function copyShareLink() {
  const url = document.getElementById('tm-share').dataset.url;
  try { await navigator.clipboard.writeText(url); showToast('Link copied!'); } catch { showToast('Copy the link manually.', true); }
}

async function openSharedList(id) {
  const { data, error } = await sb.from('tier_lists').select('id, title, category, tiers, updated_at, profiles(username, display_name)').eq('id', id).maybeSingle();
  if (error || !data) { showToast('That tier list wasn\'t found.', true); await switchCategory('fruit'); return; }
  tmCat = data.category; tmMode = 'view'; tmViewMeta = data;
  setActive('[data-tm-cat]', 'tmCat', tmCat);
  if (!(await loadItems(tmCat))) return;
  applyTiers(data.tiers);
  document.title = `${data.title} — Blox Fruits Tier List | BloxCore`;
  renderAll();
}

function remixView() {
  tmMode = 'mine'; tmEditingId = null;
  document.getElementById('tm-title').value = tmViewMeta ? `${tmViewMeta.title} (remix)`.slice(0, 60) : '';
  tmViewMeta = null;
  history.replaceState(null, '', location.pathname);
  persistDraft(); loadMyLists(); renderAll();
}

async function loadCommunity() {
  const { data, error } = await sb.rpc('get_community_tiers', { p_category: tmCat });
  if (error) { logError('get_community_tiers failed:', error); showToast('Couldn\'t load the community list.', true); return; }
  tmCommunity = new Map((data || []).map(r => [Number(r.item_id), { tier: r.tier, score: Number(r.score), votes: r.votes }]));
  tmCommunityLists = data?.[0]?.lists || 0;
  tmPlacement = new Map([...tmCommunity.entries()].filter(([id]) => tmById.has(id)).map(([id, v]) => [id, v.tier]));
}

// ---- rendering ---------------------------------------------------------------------------------
function readOnly() { return tmMode !== 'mine'; }

function itemChip(item) {
  const sel = tmSelected === item.id;
  const c = tmMode === 'community' ? tmCommunity.get(item.id) : null;
  return `<button type="button" class="tm-item${sel ? ' selected' : ''}" data-item="${item.id}" draggable="${readOnly() ? 'false' : 'true'}" title="${escapeHtml(item.name)}${c ? ` — ${c.score.toFixed(1)}/5 from ${c.votes} list${c.votes === 1 ? '' : 's'}` : ''}">
    ${item.icon_url ? `<img src="${escapeHtml(item.icon_url)}" alt="" loading="lazy" draggable="false" width="44" height="44">` : '<span class="tm-noicon"><i data-lucide="sparkles"></i></span>'}
    <span class="tm-item-name">${escapeHtml(item.name)}</span>
  </button>`;
}

function renderAll() {
  setActive('[data-tm-mode]', 'tmMode', tmMode === 'view' ? 'mine' : tmMode);
  const viewing = tmMode === 'view', community = tmMode === 'community';
  document.getElementById('tm-editor-bar').style.display = readOnly() ? 'none' : '';
  document.getElementById('tm-view-bar').style.display = viewing ? '' : 'none';
  document.getElementById('tm-community-note').style.display = community ? '' : 'none';
  document.getElementById('tm-pool-wrap').style.display = readOnly() ? 'none' : '';
  document.getElementById('tm-hint').style.display = (!readOnly() && tmSelected) ? '' : 'none';
  if (tmSelected) document.getElementById('tm-hint-name').textContent = tmById.get(tmSelected)?.name || '';
  if (viewing && tmViewMeta) {
    document.getElementById('tm-view-title').textContent = tmViewMeta.title;
    const a = tmViewMeta.profiles;
    document.getElementById('tm-view-by').innerHTML = a ? `by <a href="/player/?u=${encodeURIComponent(a.username)}">${escapeHtml(a.display_name || a.username)}</a> · ${TM_CATS[tmCat]}` : TM_CATS[tmCat];
  }
  if (community) {
    document.getElementById('tm-community-count').textContent = tmCommunityLists === 1 ? '1 player\'s list' : `${tmCommunityLists} players' lists`;
    document.getElementById('tm-community-empty').style.display = tmCommunityLists < 2 ? '' : 'none';
  }
  renderTiers();
  renderPool();
  refreshIcons();
}

function renderTiers() {
  const wrap = document.getElementById('tm-tiers');
  wrap.innerHTML = TM_TIERS.map(t => {
    const ids = [...tmPlacement.entries()].filter(([, tier]) => tier === t).map(([id]) => id);
    const items = ids.map(id => tmById.get(id)).filter(Boolean);
    if (tmMode === 'community') items.sort((a, b) => (tmCommunity.get(b.id)?.score || 0) - (tmCommunity.get(a.id)?.score || 0));
    return `<div class="tm-row" style="--tier:${TM_COLORS[t]};">
      <div class="tm-label">${t}</div>
      <div class="tm-zone" data-tier="${t}" ${readOnly() ? '' : 'role="button" tabindex="0" aria-label="Place selected item in tier ' + t + '"'}>${items.map(itemChip).join('') || (readOnly() ? '' : '<span class="tm-empty">Drop items here</span>')}</div>
    </div>`;
  }).join('');
  wireInteractions(wrap);
}

function renderPool() {
  if (readOnly()) return;
  const pool = document.getElementById('tm-pool');
  const items = tmItems.filter(i => !tmPlacement.has(i.id) && (!tmSearch || i.name.toLowerCase().includes(tmSearch)));
  pool.innerHTML = items.map(itemChip).join('') || `<span class="tm-empty">${tmItems.length && tmPlacement.size === tmItems.length ? 'Everything is ranked — nice.' : 'No matches.'}</span>`;
  pool.dataset.tier = '';
  document.getElementById('tm-pool-count').textContent = `${tmItems.length - tmPlacement.size} unranked`;
  wireInteractions(pool.parentElement);
  refreshIcons();
}

function placeItem(id, tier) {
  if (readOnly()) return;
  if (tier) tmPlacement.set(id, tier); else tmPlacement.delete(id);
  tmSelected = null;
  persistDraft();
  renderAll();
}

function wireInteractions(root) {
  if (readOnly()) return;
  root.querySelectorAll('.tm-item').forEach(el => {
    const id = Number(el.dataset.item);
    el.addEventListener('click', (e) => { e.stopPropagation(); tmSelected = tmSelected === id ? null : id; renderAll(); });
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(id)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });
  root.querySelectorAll('[data-tier]').forEach(zone => {
    const tier = zone.dataset.tier || null;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); const id = Number(e.dataTransfer.getData('text/plain')); if (tmById.has(id)) placeItem(id, tier); });
    zone.addEventListener('click', () => { if (tmSelected) placeItem(tmSelected, tier); });
    zone.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && tmSelected) { e.preventDefault(); placeItem(tmSelected, tier); } });
  });
}

// ---- image export ------------------------------------------------------------------------------
async function exportImage() {
  if (tmPlacement.size === 0) { showToast('Place some items first.', true); return; }
  const title = (tmMode === 'view' && tmViewMeta ? tmViewMeta.title : document.getElementById('tm-title').value.trim()) || (tmMode === 'community' ? `Community ${TM_CATS[tmCat]} Tier List` : `My ${TM_CATS[tmCat]} Tier List`);
  scOpenPreview({
    title: 'Tier list image', filename: `bloxcore-tier-list-${tmCat}.png`, shareText: `${title} — made on BloxCore`,
    render: async (canvas) => {
      const W = 1200, labelW = 120, icon = 64, gap = 8, pad = 36;
      const perLine = Math.floor((W - pad * 2 - labelW - 24) / (icon + gap));
      const tiers = TM_TIERS.map(t => ({ t, items: [...tmPlacement.entries()].filter(([, x]) => x === t).map(([id]) => tmById.get(id)).filter(Boolean) }));
      const rowH = (n) => Math.max(96, 24 + Math.ceil(Math.max(n, 1) / perLine) * (icon + gap));
      const headerH = 100, footerH = 56;
      const H = headerH + tiers.reduce((s, x) => s + rowH(x.items.length) + 6, 0) + footerH;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const imgs = new Map();
      await Promise.all(tiers.flatMap(x => x.items).map(async (i) => imgs.set(i.id, await scLoadImage(i.icon_url))));
      scBackground(ctx, W, H);
      await scBrandHeader(ctx, W, TM_CATS[tmCat] + ' tier list');
      ctx.fillStyle = SC.text; ctx.font = '800 30px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(scFit(ctx, title, W - pad * 2), pad, 84);
      let y = headerH;
      tiers.forEach(({ t, items }) => {
        const h = rowH(items.length);
        scRoundRect(ctx, pad, y, W - pad * 2, h, 14); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        scRoundRect(ctx, pad, y, labelW, h, 14); ctx.fillStyle = TM_COLORS[t]; ctx.fill();
        ctx.fillStyle = '#10131c'; ctx.font = '800 54px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t, pad + labelW / 2, y + h / 2 + 2); ctx.textAlign = 'left';
        items.forEach((it, i) => {
          const cx = pad + labelW + 14 + (i % perLine) * (icon + gap), cy = y + 12 + Math.floor(i / perLine) * (icon + gap);
          scIconTile(ctx, imgs.get(it.id), it.name, cx, cy, icon, TM_COLORS[t]);
        });
        y += h + 6;
      });
      ctx.fillStyle = SC.muted; ctx.font = '600 18px system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('Make yours at bloxcores.com/tier-maker', W - pad, H - 28);
    },
  });
}
