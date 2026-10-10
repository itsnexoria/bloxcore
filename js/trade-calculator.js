// Trade calculator — compares the community value of two sides of a trade. Client-side only,
// reads the same bf_items catalog the Trading board uses (fetchBfItemCatalog / valueFor in
// listings.js). Supports deep links: /trade-calculator/?give=Kitsune:p,Dough&get=Buddha
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

function calcRenderSide(side) {
  const list = document.getElementById(`calc-${side}-list`);
  const entries = calcSides[side];
  list.innerHTML = entries.length ? entries.map((e, i) => `
    <div class="calc-row">
      ${e.item.icon_url ? `<img src="${escapeHtml(e.item.icon_url)}" alt="" loading="lazy" onerror="this.style.display='none';">` : ''}
      <span class="calc-row-name">${escapeHtml(e.item.name)}</span>
      ${e.item.category === 'fruit' ? `<button type="button" class="btn btn-ghost btn-sm" data-toggle="${side}:${i}">${e.valueType === 'permanent' ? 'Permanent' : 'Physical'}</button>` : ''}
      <span class="calc-row-value">${formatValue(valueFor(e.item, e.valueType))}</span>
      <button type="button" class="calc-row-remove" data-remove="${side}:${i}" aria-label="Remove ${escapeHtml(e.item.name)}">×</button>
    </div>`).join('') : `<p class="muted" style="margin:8px 0; font-size:0.85rem;">Nothing added yet.</p>`;
  document.getElementById(`calc-${side}-total`).textContent = formatValue(calcTotal(side));

  list.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const [, idx] = btn.dataset.toggle.split(':');
    const e = entries[+idx];
    e.valueType = e.valueType === 'permanent' ? 'physical' : 'permanent';
    calcUpdate();
  }));
  list.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
    const [, idx] = btn.dataset.remove.split(':');
    entries.splice(+idx, 1);
    calcUpdate();
  }));
}

function calcUpdate() {
  calcRenderSide('give');
  calcRenderSide('get');
  const give = calcTotal('give');
  const get = calcTotal('get');
  const el = document.getElementById('calc-verdict');
  if (!give || !get) {
    el.className = 'panel calc-verdict';
    el.innerHTML = '<p class="muted" style="margin:0;">Add items to both sides to see how the trade compares.</p>';
  } else {
    const diff = Math.round(((get - give) / give) * 100);
    let icon, tone, text;
    if (Math.abs(diff) <= FAIR_THRESHOLD_PCT) {
      icon = 'scale'; tone = 'fair';
      text = `<strong>Roughly fair.</strong> You give ${formatValue(give)} and get ${formatValue(get)}.`;
    } else if (diff > 0) {
      icon = 'trending-up'; tone = 'win';
      text = `<strong>In your favor by ${diff}%.</strong> You give ${formatValue(give)} and get ${formatValue(get)}.`;
    } else {
      icon = 'trending-down'; tone = 'loss';
      text = `<strong>You'd be overpaying by ${Math.abs(diff)}%.</strong> You give ${formatValue(give)} and get ${formatValue(get)}.`;
    }
    el.className = `panel calc-verdict calc-verdict-${tone}`;
    el.innerHTML = `<p style="margin:0;"><i data-lucide="${icon}" class="icon-sm icon-inline"></i>${text}</p>`;
    if (typeof refreshIcons === 'function') refreshIcons();
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
  const params = new URLSearchParams();
  if (calcSides.give.length) params.set('give', calcSides.give.map(e => e.item.name + (e.valueType === 'permanent' ? ':p' : '')).join(','));
  if (calcSides.get.length) params.set('get', calcSides.get.map(e => e.item.name + (e.valueType === 'permanent' ? ':p' : '')).join(','));
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
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
      <button type="button" class="calc-result" data-id="${i.id}">
        ${i.icon_url ? `<img src="${escapeHtml(i.icon_url)}" alt="" loading="lazy" onerror="this.style.display='none';">` : ''}
        <span>${escapeHtml(i.name)}</span><small class="muted">${formatValue(i.regular_value)}</small>
      </button>`).join('') : '<p class="muted" style="margin:6px 0; font-size:0.85rem;">No matches.</p>';
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

document.addEventListener('DOMContentLoaded', async () => {
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
    document.getElementById('calc-verdict').innerHTML = `<p class="muted" style="margin:0;">Couldn't load item values right now — try refreshing.${detail}</p>`;
    return;
  }
  calcSetupSearch('give');
  calcSetupSearch('get');
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
});
