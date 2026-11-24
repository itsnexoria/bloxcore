// BloxCore — small canvas helpers shared by the trade result card, tier list export and build card.
// Everything is drawn client-side; item icons are loaded with crossOrigin so a host that doesn't send CORS
// headers simply fails to load (placeholder tile) instead of tainting the canvas and breaking export.

const SC = {
  bg1: '#0a0e17', bg2: '#13213d', panel: 'rgba(255,255,255,0.05)', text: '#f4f6fb', muted: '#8d98ad',
  win: '#34d399', lose: '#f87171', fair: '#fbbf24', accent: '#60a5fa',
};

const _scImgCache = new Map();
function scLoadImage(url, timeoutMs = 3000) {
  if (!url) return Promise.resolve(null);
  if (_scImgCache.has(url)) return _scImgCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    const done = (v) => { clearTimeout(t); resolve(v); };
    const t = setTimeout(() => done(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = url;
  });
  _scImgCache.set(url, p);
  return p;
}

function scRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function scBackground(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, SC.bg1); g.addColorStop(1, SC.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.85, -h * 0.1, 10, w * 0.85, -h * 0.1, w * 0.6);
  glow.addColorStop(0, 'rgba(96,165,250,0.22)'); glow.addColorStop(1, 'rgba(96,165,250,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
}

async function scBrandHeader(ctx, w, subtitle) {
  const logo = await scLoadImage('/assets/logo.png', 2500);
  if (logo) ctx.drawImage(logo, 36, 26, 44, 44);
  ctx.fillStyle = SC.text; ctx.font = '700 28px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('BloxCore', logo ? 90 : 36, 48);
  if (subtitle) { ctx.fillStyle = SC.muted; ctx.font = '600 20px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(subtitle, w - 36, 48); ctx.textAlign = 'left'; }
}

function scFit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// Draws an item icon (or a lettered placeholder) into a rounded square.
function scIconTile(ctx, img, name, x, y, size, color = SC.accent) {
  scRoundRect(ctx, x, y, size, size, size * 0.22);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  if (img) {
    ctx.save(); scRoundRect(ctx, x, y, size, size, size * 0.22); ctx.clip();
    ctx.drawImage(img, x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84);
    ctx.restore();
  } else {
    ctx.fillStyle = color; ctx.font = `700 ${Math.round(size * 0.46)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name || '?').trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2 + 1);
    ctx.textAlign = 'left';
  }
}

function scCanvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}

async function scDownload(canvas, filename) {
  const blob = await scCanvasToBlob(canvas);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

async function scCopy(canvas) {
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error('Copying images isn\'t supported in this browser — use Download.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': scCanvasToBlob(canvas) })]);
}

async function scShare(canvas, filename, text) {
  const blob = await scCanvasToBlob(canvas);
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return true; }
  return false;
}

// Reusable preview modal: `render(canvas)` draws the card; buttons: download / copy / share.
async function scOpenPreview({ title, filename, shareText, render }) {
  let modal = document.getElementById('sc-preview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sc-preview-modal';
    modal.className = 'build-modal-overlay';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="panel build-modal" style="max-width:760px; width:94vw;">
        <div class="flex-between" style="margin-bottom:10px;">
          <h2 id="sc-preview-title" style="font-size:1.05rem; margin:0;"></h2>
          <button type="button" class="btn btn-ghost btn-sm" id="sc-preview-close" aria-label="Close"><i data-lucide="x" class="icon-md"></i></button>
        </div>
        <div id="sc-preview-stage" style="border-radius:12px; overflow:hidden; background:#0a0e17; min-height:120px; display:grid; place-items:center;"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:14px;">
          <button type="button" class="btn btn-primary btn-sm" id="sc-btn-download"><i data-lucide="download" class="icon-sm icon-inline"></i>Download PNG</button>
          <button type="button" class="btn btn-ghost btn-sm" id="sc-btn-copy"><i data-lucide="copy" class="icon-sm icon-inline"></i>Copy image</button>
          <button type="button" class="btn btn-ghost btn-sm" id="sc-btn-share" style="display:none;"><i data-lucide="share-2" class="icon-sm icon-inline"></i>Share…</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.remove('open');
    modal.querySelector('#sc-preview-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
  modal.querySelector('#sc-preview-title').textContent = title;
  const stage = modal.querySelector('#sc-preview-stage');
  stage.innerHTML = '<div class="skeleton" style="width:100%; height:260px;"></div>';
  modal.classList.add('open');
  if (typeof refreshIcons === 'function') refreshIcons();

  const canvas = document.createElement('canvas');
  await render(canvas);
  canvas.style.cssText = 'width:100%; height:auto; display:block;';
  stage.innerHTML = ''; stage.appendChild(canvas);

  // fresh handlers each time (the modal is reused)
  const rebind = (id, fn) => { const old = modal.querySelector(id); const b = old.cloneNode(true); old.replaceWith(b); b.addEventListener('click', fn); return b; };
  rebind('#sc-btn-download', async () => { try { await scDownload(canvas, filename); } catch (e) { showToast(e.message, true); } });
  rebind('#sc-btn-copy', async () => { try { await scCopy(canvas); showToast('Image copied — paste it into Discord.'); } catch (e) { showToast(e.message, true); } });
  const shareBtn = rebind('#sc-btn-share', async () => { try { const ok = await scShare(canvas, filename, shareText); if (!ok) showToast('Sharing isn\'t supported here — use Download.', true); } catch (e) { if (e.name !== 'AbortError') showToast(e.message, true); } });
  shareBtn.style.display = (navigator.canShare && navigator.share) ? '' : 'none';
  if (typeof refreshIcons === 'function') refreshIcons();
}
