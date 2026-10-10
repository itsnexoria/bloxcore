// BloxCore — /build-planner/ : plan Blox Fruits stat points + a loadout, share by link or image, save to your account.
// Stat maths: points = level × POINTS_PER_LEVEL, each stat capped at `cap`. Defaults match the 2550 level / 2550 stat cap;
// both caps are editable on the page in case the game changes. Saved builds live in saved_builds (public by default).

const BP_POINTS_PER_LEVEL = 3;
const BP_STATS = [
  { key: 'melee', label: 'Melee', color: '#f87171' },
  { key: 'defense', label: 'Defense', color: '#60a5fa' },
  { key: 'sword', label: 'Sword', color: '#a78bfa' },
  { key: 'gun', label: 'Gun', color: '#fbbf24' },
  { key: 'fruit', label: 'Blox Fruit', color: '#34d399' },
];
const BP_SLOTS = [
  { key: 'race', label: 'Race', category: 'race' },
  { key: 'fighting_style', label: 'Fighting style', category: 'fighting_style' },
  { key: 'fruit', label: 'Fruit', category: 'fruit' },
  { key: 'sword', label: 'Sword', category: 'sword' },
  { key: 'gun', label: 'Gun', category: 'gun' },
  { key: 'accessory', label: 'Accessory', category: 'accessory' },
];
const BP_PRESETS = [
  { id: 'fruit_sword', label: 'Fruit + Sword', order: ['fruit', 'sword', 'defense'] },
  { id: 'fruit_melee', label: 'Fruit + Melee', order: ['fruit', 'melee', 'defense'] },
  { id: 'fruit_gun', label: 'Fruit + Gun', order: ['fruit', 'gun', 'defense'] },
  { id: 'sword_tank', label: 'Sword tank', order: ['sword', 'defense', 'fruit'] },
  { id: 'balanced', label: 'Balanced', order: null },
];
const BP_FALLBACK = ['fruit', 'defense', 'sword', 'gun', 'melee'];

let bp = { name: '', level: 2550, cap: 2550, stats: { melee: 0, defense: 0, sword: 0, gun: 0, fruit: 0 }, loadout: {} };
let bpCatalog = [];
let bpById = new Map();
let bpViewer = null;
let bpEditingId = null;

onReady(async () => {
  const { user } = await getCurrentProfile();
  bpViewer = user;
  const { data, error } = await sb.from('bf_items').select('id, name, category, icon_url, regular_value').in('category', BP_SLOTS.map(s => s.category)).order('name');
  if (error) { logError('build planner catalog failed:', error); showToast('Couldn\'t load items.', true); }
  bpCatalog = data || [];
  bpById = new Map(bpCatalog.map(i => [i.id, i]));

  buildStaticUi();
  const params = new URLSearchParams(location.search);
  if (params.get('b')) await loadSavedBuild(params.get('b')); else loadFromUrl(params);
  await loadMyBuilds();
  renderAll();
});

function bpTotalPoints() { return bp.level * BP_POINTS_PER_LEVEL; }
function bpUsed() { return Object.values(bp.stats).reduce((a, b) => a + b, 0); }
function bpLeft() { return bpTotalPoints() - bpUsed(); }

// ---- static UI (built once) --------------------------------------------------------------------
function buildStaticUi() {
  document.getElementById('bp-stats').innerHTML = BP_STATS.map(s => `
    <div class="bp-stat" style="--c:${s.color};">
      <label for="bp-n-${s.key}">${s.label}</label>
      <input type="range" id="bp-r-${s.key}" min="0" max="${bp.cap}" step="1" value="0" aria-label="${s.label} slider">
      <input type="number" id="bp-n-${s.key}" min="0" max="${bp.cap}" value="0" inputmode="numeric">
    </div>`).join('');
  BP_STATS.forEach(s => {
    const range = document.getElementById(`bp-r-${s.key}`), num = document.getElementById(`bp-n-${s.key}`);
    const set = (raw) => setStat(s.key, Number(raw));
    range.addEventListener('input', () => set(range.value));
    num.addEventListener('change', () => set(num.value));
  });
  document.getElementById('bp-presets').innerHTML = BP_PRESETS.map(p => `<button type="button" class="btn btn-ghost btn-sm" data-preset="${p.id}">${p.label}</button>`).join('');
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

  document.getElementById('bp-loadout').innerHTML = BP_SLOTS.map(slot => {
    const opts = bpCatalog.filter(i => i.category === slot.category).map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
    return `<div class="bp-slot"><label for="bp-s-${slot.key}">${slot.label}</label><select id="bp-s-${slot.key}"><option value="">— none —</option>${opts}</select></div>`;
  }).join('');
  BP_SLOTS.forEach(slot => document.getElementById(`bp-s-${slot.key}`).addEventListener('change', (e) => {
    bp.loadout[slot.key] = e.target.value ? Number(e.target.value) : null;
    renderAll();
  }));

  const level = document.getElementById('bp-level'), levelR = document.getElementById('bp-level-range');
  const setLevel = (v) => { bp.level = Math.min(3000, Math.max(1, Math.round(Number(v) || 1))); clampStatsToPoints(); renderAll(); };
  level.addEventListener('change', () => setLevel(level.value));
  levelR.addEventListener('input', () => setLevel(levelR.value));
  document.getElementById('bp-cap').addEventListener('change', (e) => { bp.cap = Math.min(3000, Math.max(100, Math.round(Number(e.target.value) || 2550))); Object.keys(bp.stats).forEach(k => { bp.stats[k] = Math.min(bp.stats[k], bp.cap); }); renderAll(); });
  document.getElementById('bp-name').addEventListener('input', (e) => { bp.name = e.target.value.slice(0, 60); renderSummary(); syncUrl(); });
  document.getElementById('bp-save').addEventListener('click', saveBuild);
  document.getElementById('bp-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); showToast('Link copied!'); } catch { showToast('Copy the address bar to share.', true); } });
  document.getElementById('bp-image').addEventListener('click', () => scOpenPreview({ title: 'Build card', filename: 'bloxcore-build.png', shareText: `${bp.name || 'My Blox Fruits build'} — planned on BloxCore`, render: renderBuildCard }));
  document.getElementById('bp-reset').addEventListener('click', () => { bp = { name: '', level: bp.level, cap: bp.cap, stats: { melee: 0, defense: 0, sword: 0, gun: 0, fruit: 0 }, loadout: {} }; bpEditingId = null; document.getElementById('bp-name').value = ''; renderAll(); });
  document.getElementById('bp-delete').addEventListener('click', deleteBuild);
  document.getElementById('bp-saved').addEventListener('change', (e) => { if (e.target.value) loadSavedBuild(e.target.value).then(renderAll); });
}

// ---- stat logic --------------------------------------------------------------------------------
function setStat(key, raw) {
  const others = bpUsed() - bp.stats[key];
  const max = Math.max(0, Math.min(bp.cap, bpTotalPoints() - others));
  bp.stats[key] = Math.min(max, Math.max(0, Math.round(Number.isFinite(raw) ? raw : 0)));
  renderAll();
}

function clampStatsToPoints() {
  let over = bpUsed() - bpTotalPoints();
  if (over <= 0) return;
  for (const k of [...BP_FALLBACK].reverse()) { const cut = Math.min(bp.stats[k], over); bp.stats[k] -= cut; over -= cut; if (over <= 0) break; }
}

function applyPreset(id) {
  const preset = BP_PRESETS.find(p => p.id === id);
  let left = bpTotalPoints();
  const stats = { melee: 0, defense: 0, sword: 0, gun: 0, fruit: 0 };
  if (!preset.order) {
    const each = Math.min(bp.cap, Math.floor(left / 5));
    BP_STATS.forEach(s => { stats[s.key] = each; left -= each; });
  } else {
    for (const k of preset.order) { const give = Math.min(bp.cap, left); stats[k] = give; left -= give; }
  }
  for (const k of BP_FALLBACK) { if (left <= 0) break; const give = Math.min(bp.cap - stats[k], left); stats[k] += give; left -= give; }
  bp.stats = stats;
  renderAll();
}

// ---- rendering ---------------------------------------------------------------------------------
function renderAll() {
  document.getElementById('bp-level').value = bp.level;
  document.getElementById('bp-level-range').value = bp.level;
  document.getElementById('bp-cap').value = bp.cap;
  document.getElementById('bp-name').value = bp.name;
  BP_STATS.forEach(s => {
    const r = document.getElementById(`bp-r-${s.key}`), n = document.getElementById(`bp-n-${s.key}`);
    r.max = bp.cap; n.max = bp.cap; r.value = bp.stats[s.key]; n.value = bp.stats[s.key];
    r.style.setProperty('--fill', `${(bp.stats[s.key] / bp.cap) * 100}%`);
  });
  BP_SLOTS.forEach(slot => { document.getElementById(`bp-s-${slot.key}`).value = bp.loadout[slot.key] || ''; });
  const left = bpLeft();
  const el = document.getElementById('bp-points');
  el.innerHTML = `<strong>${bpUsed().toLocaleString()}</strong> / ${bpTotalPoints().toLocaleString()} points used · <span style="color:${left === 0 ? 'var(--sea)' : 'var(--ash)'};">${left.toLocaleString()} left</span>`;
  const maxed = BP_STATS.filter(s => bp.stats[s.key] >= bp.cap).length;
  document.getElementById('bp-note').textContent = maxed ? `${maxed} stat${maxed === 1 ? '' : 's'} maxed.` : 'No stats maxed yet.';
  document.getElementById('bp-delete').style.display = bpEditingId ? '' : 'none';
  renderSummary();
  syncUrl();
}

function renderSummary() {
  const bars = BP_STATS.map(s => `
    <div class="bp-bar"><span class="bp-bar-label">${s.label}</span>
      <div class="bp-bar-track"><div class="bp-bar-fill" style="width:${(bp.stats[s.key] / bp.cap) * 100}%; background:${s.color};"></div></div>
      <span class="bp-bar-val">${bp.stats[s.key].toLocaleString()}</span></div>`).join('');
  const tiles = BP_SLOTS.map(slot => {
    const it = bpById.get(bp.loadout[slot.key]);
    return `<div class="bp-tile${it ? '' : ' empty'}">
      ${it?.icon_url ? `<img src="${escapeHtml(it.icon_url)}" alt="" loading="lazy" width="40" height="40">` : `<span class="bp-tile-ph">${slot.label.charAt(0)}</span>`}
      <span class="bp-tile-text"><small>${slot.label}</small><strong>${it ? escapeHtml(it.name) : '—'}</strong></span></div>`;
  }).join('');
  const fruit = bpById.get(bp.loadout.fruit);
  document.getElementById('bp-summary').innerHTML = `
    <div class="flex-between" style="gap:10px; flex-wrap:wrap;"><p style="margin:0; font-weight:800; font-size:1.2rem;">${escapeHtml(bp.name || 'Untitled build')}</p><span class="tag tag-easy">Lv ${bp.level.toLocaleString()}</span></div>
    <div class="bp-bars">${bars}</div>
    <div class="bp-tiles">${tiles}</div>
    ${fruit?.regular_value ? `<p class="muted" style="margin:10px 0 0; font-size:0.8rem;">Fruit trade value: <strong>${formatValue(fruit.regular_value)}</strong></p>` : ''}`;
}

// ---- URL state ---------------------------------------------------------------------------------
function syncUrl() {
  if (bpEditingId) { history.replaceState(null, '', `?b=${bpEditingId}`); return; }
  const p = new URLSearchParams();
  p.set('lv', bp.level); if (bp.cap !== 2550) p.set('c', bp.cap);
  p.set('st', BP_STATS.map(s => bp.stats[s.key]).join('.'));
  if (BP_SLOTS.some(s => bp.loadout[s.key])) p.set('lo', BP_SLOTS.map(s => bp.loadout[s.key] || 0).join('.'));
  if (bp.name) p.set('n', bp.name);
  history.replaceState(null, '', `?${p.toString()}`);
}
function loadFromUrl(params) {
  const lv = Number(params.get('lv')); if (lv >= 1 && lv <= 3000) bp.level = Math.round(lv);
  const cap = Number(params.get('c')); if (cap >= 100 && cap <= 3000) bp.cap = Math.round(cap);
  const st = (params.get('st') || '').split('.').map(Number);
  if (st.length === 5 && st.every(n => Number.isFinite(n) && n >= 0)) { BP_STATS.forEach((s, i) => { bp.stats[s.key] = Math.min(bp.cap, st[i]); }); clampStatsToPoints(); }
  const lo = (params.get('lo') || '').split('.').map(Number);
  if (lo.length === BP_SLOTS.length) BP_SLOTS.forEach((s, i) => { bp.loadout[s.key] = bpById.has(lo[i]) ? lo[i] : null; });
  bp.name = (params.get('n') || '').slice(0, 60);
}

// ---- saved builds ------------------------------------------------------------------------------
async function loadMyBuilds() {
  const wrap = document.getElementById('bp-saved-wrap');
  if (!bpViewer) { wrap.style.display = 'none'; return; }
  const { data } = await sb.from('saved_builds').select('id, name').eq('user_id', bpViewer.id).order('updated_at', { ascending: false });
  wrap.style.display = data?.length ? '' : 'none';
  document.getElementById('bp-saved').innerHTML = '<option value="">Load one of my builds…</option>' + (data || []).map(b => `<option value="${b.id}"${b.id === bpEditingId ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
}

async function loadSavedBuild(id) {
  const { data, error } = await sb.from('saved_builds').select('id, user_id, name, level, stats, loadout').eq('id', id).maybeSingle();
  if (error || !data) { showToast('That build wasn\'t found.', true); return; }
  bp.name = data.name; bp.level = data.level;
  BP_STATS.forEach(s => { bp.stats[s.key] = Number(data.stats?.[s.key]) || 0; });
  bp.cap = Math.max(bp.cap, ...Object.values(bp.stats));
  bp.loadout = {}; BP_SLOTS.forEach(s => { const v = data.loadout?.[s.key]; bp.loadout[s.key] = bpById.has(v) ? v : null; });
  bpEditingId = bpViewer && data.user_id === bpViewer.id ? data.id : null; // someone else's build opens as an editable copy
  if (!bpEditingId) history.replaceState(null, '', location.pathname);
}

async function saveBuild() {
  if (!bpViewer) { showToast('Sign in to save builds.', true); return; }
  if ((bp.name || '').trim().length < 3) { showToast('Name your build first (3+ characters).', true); return; }
  const row = { name: bp.name.trim(), level: bp.level, stats: bp.stats, loadout: Object.fromEntries(Object.entries(bp.loadout).filter(([, v]) => v)) };
  const btn = document.getElementById('bp-save'); btn.disabled = true;
  const { data, error } = bpEditingId
    ? await sb.from('saved_builds').update(row).eq('id', bpEditingId).select('id').single()
    : await sb.from('saved_builds').insert({ ...row, user_id: bpViewer.id }).select('id').single();
  btn.disabled = false;
  if (error) { showToast(error.message, true); return; }
  bpEditingId = data.id;
  showToast('Build saved — the link now points at your saved build.');
  await loadMyBuilds(); renderAll();
}

async function deleteBuild() {
  if (!bpEditingId || !confirm('Delete this saved build?')) return;
  const { error } = await sb.from('saved_builds').delete().eq('id', bpEditingId);
  if (error) { showToast(error.message, true); return; }
  bpEditingId = null; showToast('Build deleted.'); await loadMyBuilds(); renderAll();
}

// ---- image card --------------------------------------------------------------------------------
async function renderBuildCard(canvas) {
  const W = 1200, H = 630;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const chosen = BP_SLOTS.map(slot => ({ slot, item: bpById.get(bp.loadout[slot.key]) }));
  const imgs = await Promise.all(chosen.map(c => scLoadImage(c.item?.icon_url)));
  scBackground(ctx, W, H);
  await scBrandHeader(ctx, W, 'Build Planner');

  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = SC.text; ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText(scFit(ctx, bp.name || 'Untitled build', 700), 36, 118);
  ctx.fillStyle = SC.accent; ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText(`Level ${bp.level.toLocaleString()}  ·  ${bpUsed().toLocaleString()} / ${bpTotalPoints().toLocaleString()} points`, 36, 160);

  BP_STATS.forEach((s, i) => {
    const y = 200 + i * 74;
    ctx.fillStyle = SC.muted; ctx.font = '700 20px system-ui, sans-serif'; ctx.fillText(s.label.toUpperCase(), 36, y + 14);
    scRoundRect(ctx, 36, y + 32, 470, 18, 9); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    const w = Math.max(0, (bp.stats[s.key] / bp.cap) * 470);
    if (w > 0) { scRoundRect(ctx, 36, y + 32, Math.max(w, 18), 18, 9); ctx.fillStyle = s.color; ctx.fill(); }
    ctx.textAlign = 'right'; ctx.fillStyle = SC.text; ctx.font = '700 24px ui-monospace, monospace'; ctx.fillText(bp.stats[s.key].toLocaleString(), 506, y + 14); ctx.textAlign = 'left';
  });

  const gx = 560, gy = 112, cw = 290, ch = 130;
  chosen.forEach((c, i) => {
    const x = gx + (i % 2) * (cw + 20), y = gy + Math.floor(i / 2) * (ch + 18);
    scRoundRect(ctx, x, y, cw, ch, 18); ctx.fillStyle = SC.panel; ctx.fill();
    scIconTile(ctx, imgs[i], c.item?.name || c.slot.label, x + 14, y + 22, 84);
    ctx.fillStyle = SC.muted; ctx.font = '600 16px system-ui, sans-serif'; ctx.fillText(c.slot.label.toUpperCase(), x + 112, y + 48);
    ctx.fillStyle = c.item ? SC.text : SC.muted; ctx.font = '700 22px system-ui, sans-serif'; ctx.fillText(scFit(ctx, c.item?.name || '—', cw - 126), x + 112, y + 82);
  });
  ctx.textAlign = 'right'; ctx.fillStyle = SC.muted; ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText('Plan yours at bloxcores.com/build-planner', W - 36, H - 28);
  ctx.textAlign = 'left';
}
