// Trade calculator — compares the community value of two sides of a trade. Client-side only,
// reads the same bf_items catalog the Trading board uses (fetchBfItemCatalog / valueFor in
// listings.js). Supports deep links: /trading/?tab=calculator&give=Kitsune:p,Dough&get=Buddha
// (":p" = permanent value; names are matched case-insensitively).

const calcSides = { give: [], get: [] };
let calcCatalog = [];

const FAIR_THRESHOLD_PCT = 8; // same threshold as the Trading board's "Roughly Fair" badge

function calcFindByName(name) {
  const n = name.trim().toLowerCase();
  return calcCatalog.find(i => i.name.toLowerCase() === n);
}

function calcTotal(side) {
  return calcSides[side].reduce((sum, e) => sum + (valueFor(e.item, e.valueType) || 0), 0);
}

function calcRarity(item) { return (item.rarity || '').toLowerCase(); }

function calcIconTile(item) {
  const icon = safeImgUrl(item.icon_url);
  return icon ? `<img src="${icon}" alt="" loading="lazy" onerror="this.style.display='none';">` : '<i data-lucide="sparkles" class="icon-md"></i>';
}

function calcRenderSide(side) {
  const list = document.getElementById(`calc-${side}-list`);
  const entries = calcSides[side];
  list.innerHTML = entries.length ? entries.map((e, i) => `
    <div class="calc-row" data-rarity="${escapeHtml(calcRarity(e.item))}">
      <div class="calc-row-art">${calcIconTile(e.item)}</div>
      <div class="calc-row-main">
        <p class="calc-row-name">${escapeHtml(e.item.name)}</p>
        <p class="calc-row-value">${formatValue(valueFor(e.item, e.valueType))}</p>
      </div>
      ${e.item.category === 'fruit' ? `
        <div class="calc-seg" role="group" aria-label="Value type for ${escapeHtml(e.item.name)}">
          <button type="button" class="${e.valueType === 'physical' ? 'is-on' : ''}" data-toggle="${side}:${i}:physical">Physical</button>
          <button type="button" class="${e.valueType === 'permanent' ? 'is-on is-perm' : ''}" data-toggle="${side}:${i}:permanent">Permanent</button>
        </div>` : ''}
      <button type="button" class="calc-row-remove" data-remove="${side}:${i}" aria-label="Remove ${escapeHtml(e.item.name)}"><i data-lucide="x" class="icon-sm"></i></button>
    </div>`).join('') : `<div class="calc-empty"><i data-lucide="plus-circle" class="icon-md"></i><span>Search above or tap a popular item below.</span></div>`;
  const total = calcTotal(side);
  document.getElementById(`calc-${side}-total`).textContent = total ? formatValue(total) : '—';
  document.querySelector(`.calc-side-${side}`)?.classList.toggle('has-items', entries.length > 0);

  list.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const [, idx, type] = btn.dataset.toggle.split(':');
    entries[+idx].valueType = type;
    calcUpdate();
  }));
  list.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
    const [, idx] = btn.dataset.remove.split(':');
    entries.splice(+idx, 1);
    calcUpdate();
  }));
}

function calcSetVerdictIcon(name) {
  const wrap = document.getElementById('calc-verdict-icon');
  if (wrap.dataset.icon === name) return;
  wrap.dataset.icon = name;
  wrap.innerHTML = `<i data-lucide="${name}" class="icon-lg"></i>`;
  if (typeof refreshIcons === 'function') refreshIcons();
}

function calcUpdate() {
  calcRenderSide('give');
  calcRenderSide('get');
  if (typeof refreshIcons === 'function') refreshIcons();
  const give = calcTotal('give');
  const get = calcTotal('get');
  const el = document.getElementById('calc-verdict');
  const title = document.getElementById('calc-verdict-title');
  const sub = document.getElementById('calc-verdict-sub');
  const pctEl = document.getElementById('calc-verdict-pct');
  const needle = document.getElementById('calc-needle');
  if (!el || !title) { calcSyncUrl(); return; }
  if (!give || !get) {
    el.className = 'calc-verdict is-idle';
    calcSetVerdictIcon('scale');
    title.textContent = 'Add items to both sides';
    sub.textContent = 'The verdict appears as soon as each side has something.';
    pctEl.textContent = '';
    needle.style.left = '50%';
  } else {
    const diff = Math.round(((get - give) / give) * 100);
    const gap = Math.abs(get - give);
    let tone, icon, head, line;
    if (Math.abs(diff) <= FAIR_THRESHOLD_PCT) {
      tone = 'fair'; icon = 'scale'; head = 'Roughly fair';
      line = `You give ${formatValue(give)} and get ${formatValue(get)}.`;
    } else if (diff > 0) {
      tone = 'win'; icon = 'trending-up'; head = 'In your favor';
      line = `You give ${formatValue(give)} and get ${formatValue(get)} — ${formatValue(gap)} more than you put in.`;
    } else {
      tone = 'loss'; icon = 'trending-down'; head = 'You\'d be overpaying';
      line = `You give ${formatValue(give)} and get ${formatValue(get)} — ${formatValue(gap)} less than you put in.`;
    }
    el.className = `calc-verdict is-${tone}`;
    calcSetVerdictIcon(icon);
    title.textContent = head;
    sub.textContent = line;
    pctEl.textContent = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)}%`;
    const clamped = Math.max(-60, Math.min(60, diff));
    needle.style.left = `${50 + (clamped / 60) * 50}%`; // ±60% pins to the ends of the gauge
  }
  calcSyncUrl();
}

// Plain-text summary for pasting into Discord or a trade chat — a link only works for people
// already on BloxCore; this works anywhere the deal is actually being discussed.
function buildShareText() {
  const give = calcTotal('give'), get = calcTotal('get');
  if (!calcSides.give.length || !calcSides.get.length) return null;
  const side = s => calcSides[s].map(e => `${e.item.name}${e.item.category === 'fruit' ? ` (${e.valueType === 'permanent' ? 'Permanent' : 'Physical'})` : ''}`).join(', ');
  let verdict;
  if (!give || !get) verdict = 'Unpriced item(s) included — can\'t judge fairness.';
  else {
    const diff = Math.round(((get - give) / give) * 100);
    verdict = Math.abs(diff) <= FAIR_THRESHOLD_PCT ? 'Roughly fair.'
      : diff > 0 ? `In your favor by ${diff}%.` : `You'd be overpaying by ${Math.abs(diff)}%.`;
  }
  return `BloxCore Trade Check\nGive: ${side('give')} (${formatValue(give)})\nGet: ${side('get')} (${formatValue(get)})\nVerdict: ${verdict}\n${location.href}`;
}

// ---- Shareable result card (1200x630 PNG for Discord / Reddit) ------------------------------------
function calcVerdict() {
  const give = calcTotal('give'), get = calcTotal('get');
  if (!give || !get) return { tone: 'fair', label: 'UNPRICED', pct: 0, color: SC.muted };
  const diff = Math.round(((get - give) / give) * 100);
  if (Math.abs(diff) <= FAIR_THRESHOLD_PCT) return { tone: 'fair', label: 'FAIR TRADE', pct: diff, color: SC.fair };
  return diff > 0 ? { tone: 'win', label: `WIN  +${diff}%`, pct: diff, color: SC.win } : { tone: 'loss', label: `LOSS  ${diff}%`, pct: diff, color: SC.lose };
}

async function renderTradeCard(canvas) {
  const W = 1200, H = 630;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const imgs = new Map();
  await Promise.all([...calcSides.give, ...calcSides.get].map(async (e) => imgs.set(e.item.id, await scLoadImage(e.item.icon_url))));

  scBackground(ctx, W, H);
  await scBrandHeader(ctx, W, 'Trade Check');

  const v = calcVerdict();
  const colW = 480, topY = 104;
  const maxN = Math.min(6, Math.max(calcSides.give.length, calcSides.get.length, 1));
  const rowH = maxN <= 2 ? 92 : maxN <= 4 ? 72 : 46;          // fewer items → bigger rows so the card never looks empty
  const iconS = rowH - 12, nameFont = rowH >= 90 ? 28 : rowH >= 70 ? 24 : 20, valFont = rowH >= 90 ? 24 : 18;
  const drawSide = (heading, entries, x, accent) => {
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = accent; ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText(heading, x, topY + 10);
    entries.slice(0, 6).forEach((e, i) => {
      const y = topY + 36 + i * (rowH + 8);
      scRoundRect(ctx, x, y, colW, rowH, 14); ctx.fillStyle = SC.panel; ctx.fill();
      scIconTile(ctx, imgs.get(e.item.id), e.item.name, x + 6, y + 6, iconS, accent);
      ctx.fillStyle = SC.text; ctx.font = `600 ${nameFont}px system-ui, sans-serif`;
      const label = e.item.name + (e.item.category === 'fruit' && e.valueType === 'permanent' ? ' (Perm)' : '');
      ctx.fillText(scFit(ctx, label, colW - iconS - 120), x + iconS + 18, y + rowH / 2);
      ctx.fillStyle = SC.muted; ctx.font = `600 ${valFont}px ui-monospace, monospace`; ctx.textAlign = 'right';
      ctx.fillText(formatValue(valueFor(e.item, e.valueType)), x + colW - 16, y + rowH / 2);
      ctx.textAlign = 'left';
    });
    if (entries.length > 6) { ctx.fillStyle = SC.muted; ctx.font = '600 17px system-ui, sans-serif'; ctx.fillText(`+${entries.length - 6} more`, x + 6, topY + 36 + 6 * (rowH + 8) + 6); }
  };
  drawSide('YOU GIVE', calcSides.give, 36, SC.lose);
  drawSide('YOU GET', calcSides.get, W - 36 - colW, SC.win);

  // centre swap badge
  const midY = topY + 36 + (maxN * (rowH + 8) - 8) / 2;
  ctx.beginPath(); ctx.arc(W / 2, midY, 30, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  ctx.fillStyle = SC.text; ctx.font = '700 28px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⇄', W / 2, midY + 1);

  // verdict bar
  const barY = 508, barH = 88;
  scRoundRect(ctx, 36, barY, W - 72, barH, 18);
  const g = ctx.createLinearGradient(36, 0, W - 36, 0);
  g.addColorStop(0, v.color + '33'); g.addColorStop(1, v.color + '11');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = v.color + '88'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = v.color; ctx.font = '800 42px system-ui, sans-serif';
  ctx.fillText(v.label, 66, barY + 36);
  ctx.fillStyle = SC.muted; ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(`${formatValue(calcTotal('give'))} given  →  ${formatValue(calcTotal('get'))} received`, 66, barY + 68);
  ctx.textAlign = 'right'; ctx.fillStyle = SC.text; ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText('bloxcores.com/trade-calculator', W - 66, barY + 36);
  ctx.fillStyle = SC.muted; ctx.font = '500 16px system-ui, sans-serif';
  ctx.fillText('Community values, not official prices', W - 66, barY + 66);
  ctx.textAlign = 'left';
}

function calcSyncUrl() {
  const params = new URLSearchParams({ tab: 'calculator' });
  if (calcSides.give.length) params.set('give', calcSides.give.map(e => e.item.name + (e.valueType === 'permanent' ? ':p' : '')).join(','));
  if (calcSides.get.length) params.set('get', calcSides.get.map(e => e.item.name + (e.valueType === 'permanent' ? ':p' : '')).join(','));
  history.replaceState(null, '', `?${params.toString()}`);
}

function calcAdd(side, item) {
  calcSides[side].push({ item, valueType: 'physical' });
  calcUpdate();
}

function calcSetupSearch(side) {
  const input = document.getElementById(`calc-${side}-search`);
  const results = document.getElementById(`calc-${side}-results`);
  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = calcCatalog.filter(i => i.regular_value && i.name.toLowerCase().includes(q)).slice(0, 8);
    results.innerHTML = matches.length ? matches.map(i => `
      <button type="button" class="calc-result" data-id="${i.id}" data-rarity="${escapeHtml(calcRarity(i))}">
        <span class="calc-row-art calc-result-art">${calcIconTile(i)}</span>
        <span class="calc-result-name">${escapeHtml(i.name)}</span><small>${formatValue(i.regular_value)}</small>
      </button>`).join('') : '<p class="calc-no-match">No matches.</p>';
    if (typeof refreshIcons === 'function') refreshIcons();
    results.querySelectorAll('.calc-result').forEach(btn => btn.addEventListener('click', () => {
      calcAdd(side, calcCatalog.find(i => String(i.id) === btn.dataset.id));
      input.value = ''; results.innerHTML = ''; input.focus();
    }));
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { results.querySelector('.calc-result')?.click(); }
  });
}

// "Popular" chips: the highest-value fruits, one tap to add — saves typing and fills an empty board.
function calcSetupQuick() {
  const top = calcCatalog.filter(i => i.category === 'fruit' && i.regular_value).sort((a, b) => b.regular_value - a.regular_value);
  // skip a "<Name> Fruit" twin when the plain name exists
  const names = new Set(top.map(i => i.name.toLowerCase()));
  const chips = top.filter(i => !(i.name.toLowerCase().endsWith(' fruit') && names.has(i.name.toLowerCase().slice(0, -6)))).slice(0, 6);
  for (const side of ['give', 'get']) {
    const box = document.getElementById(`calc-${side}-quick`);
    if (!box) continue;
    box.innerHTML = '<span class="calc-quick-label">Popular</span>' + chips.map(i => `<button type="button" class="calc-quick-chip" data-quick="${i.id}">${escapeHtml(i.name)}</button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quick]');
      if (b) calcAdd(side, calcCatalog.find(i => String(i.id) === b.dataset.quick));
    });
  }
}

function calcLoadFromUrl() {
  const params = new URLSearchParams(location.search);
  for (const side of ['give', 'get']) {
    const raw = params.get(side);
    if (!raw) continue;
    raw.split(',').forEach(token => {
      const permanent = token.endsWith(':p');
      const item = calcFindByName(permanent ? token.slice(0, -2) : token);
      if (item) calcSides[side].push({ item, valueType: permanent ? 'permanent' : 'physical' });
    });
  }
}

window.hubInit = window.hubInit || {};
window.hubInit.calculator = async () => {
  try {
    calcCatalog = await fetchBfItemCatalog();
  } catch (e) {
    logError('Trade calculator failed to load items:', e);
  }
  if (!calcCatalog.length) {
    // Surface the actual reason (RLS, network, etc.) instead of a silent generic message —
    // this is the one report of "not working" I couldn't reproduce statically, so leaving a
    // real diagnostic here in case it happens again.
    const detail = window.__bloxcoreLastCatalogError ? ` (${window.__bloxcoreLastCatalogError})` : '';
    document.getElementById('calc-verdict-title').textContent = `Couldn't load item values right now — try refreshing.${detail}`;
    return;
  }
  calcSetupSearch('give');
  calcSetupSearch('get');
  calcSetupQuick();
  calcLoadFromUrl();
  calcUpdate();

  document.getElementById('calc-swap').addEventListener('click', () => {
    [calcSides.give, calcSides.get] = [calcSides.get, calcSides.give];
    calcUpdate();
  });
  document.getElementById('calc-clear').addEventListener('click', () => {
    calcSides.give = []; calcSides.get = []; calcUpdate();
  });
  document.getElementById('calc-share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); showToast('Link copied!'); }
    catch { showToast('Copy the address bar to share this trade.'); }
  });

  document.getElementById('calc-share-image').addEventListener('click', () => {
    if (!calcSides.give.length || !calcSides.get.length) { showToast('Add items to both sides first.', true); return; }
    scOpenPreview({ title: 'Trade result card', filename: 'bloxcore-trade.png', shareText: buildShareText(), render: renderTradeCard });
  });

  document.getElementById('calc-copy-text').addEventListener('click', async () => {
    const text = buildShareText();
    if (!text) { showToast('Add items to both sides first.', true); return; }
    try { await navigator.clipboard.writeText(text); showToast('Copied — paste it in Discord or a trade chat.'); }
    catch { showToast('Clipboard access blocked — try copying manually.', true); }
  });
};
