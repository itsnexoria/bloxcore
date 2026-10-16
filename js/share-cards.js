// BloxCore — share images for the inventory vault and the public profile (1200×630, the size social
// platforms use for link previews). Built on the helpers in share-canvas.js; everything is drawn
// client-side, and avatar/icon hosts that don't send CORS headers just fall back to a lettered tile.

const SCC_RARITY = {
  common: '#9aa4b5', uncommon: '#60a5fa', rare: '#a78bfa', epic: '#a78bfa', limited: '#a78bfa',
  legendary: '#e879f9', mythical: '#60a5fa', divine: '#ffffff',
};
const scDisplay = (px) => `700 ${px}px Oswald, "Arial Narrow", system-ui, sans-serif`;
const scMono = (px, wt = 600) => `${wt} ${px}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
const scBody = (px, wt = 500) => `${wt} ${px}px Sora, system-ui, -apple-system, "Segoe UI", sans-serif`;

async function scEnsureFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 100px Oswald'), document.fonts.load('500 20px Sora'),
      document.fonts.load('600 20px Sora'), document.fonts.load('600 20px "JetBrains Mono"'),
    ]);
  } catch { /* system fonts are fine */ }
}

// Shrinks the font until the text fits in maxWidth.
function scFitFont(ctx, text, maxWidth, startPx, makeFont, minPx = 28) {
  let px = startPx;
  ctx.font = makeFont(px);
  while (px > minPx && ctx.measureText(text).width > maxWidth) { px -= 4; ctx.font = makeFont(px); }
  return px;
}

function scPill(ctx, x, y, text, { bg, fg, font = scBody(20, 600), padX = 16, h = 38 } = {}) {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  scRoundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}

function scGlow(ctx, cx, cy, r, color) {
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
  g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

// ---- Inventory vault card ---------------------------------------------------------------
// d: { owner, total, physical, permanent, count, deltaText, deltaTone, holdings:[{name, iconUrl, rarity, qty, type, value}], parts:[{v,color}] }
async function scRenderInventoryCard(canvas, d) {
  await scEnsureFonts();
  const W = 1200, H = 630;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  scBackground(ctx, W, H);
  await scBrandHeader(ctx, W, 'Vault');

  // left: owner + net worth
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = SC.muted; ctx.font = scBody(26, 500);
  ctx.fillText(scFit(ctx, `${d.owner}'s net worth`, 520), 60, 150);
  const px = scFitFont(ctx, d.total, 520, 170, scDisplay, 80);
  ctx.fillStyle = SC.text; ctx.font = scDisplay(px);
  ctx.fillText(d.total, 56, 150 + px * 0.92);
  let y = 150 + px * 0.92 + 26;
  if (d.deltaText) {
    const tone = d.deltaTone === 'up' ? SC.win : d.deltaTone === 'down' ? SC.lose : SC.muted;
    scPill(ctx, 60, y, d.deltaText, { bg: tone + '2a', fg: tone, font: scBody(20, 600) });
    y += 62;
  } else y += 14;
  // meta trio
  const meta = [['Physical', d.physical], ['Permanent', d.permanent], ['Items', String(d.count)]];
  meta.forEach(([k, v], i) => {
    const x = 60 + i * 175;
    ctx.fillStyle = SC.muted; ctx.font = scBody(18, 500); ctx.textBaseline = 'alphabetic';
    ctx.fillText(k, x, y + 14);
    ctx.fillStyle = SC.text; ctx.font = scMono(30, 600);
    ctx.fillText(v, x, y + 52);
  });

  // right: top holdings grid (3 × 2)
  const icons = await Promise.all(d.holdings.map(h => scLoadImage(h.iconUrl, 3000)));
  const cw = 166, ch = 214, gap = 16, gx = 650, gy = 108;
  d.holdings.slice(0, 6).forEach((h, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = gx + col * (cw + gap), yy = gy + row * (ch + gap);
    const rar = SCC_RARITY[(h.rarity || '').toLowerCase()] || SC.muted;
    scRoundRect(ctx, x, yy, cw, ch, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.save(); scRoundRect(ctx, x, yy, cw, ch, 20); ctx.clip();
    scGlow(ctx, x + cw / 2, yy + 80, 110, rar);
    ctx.restore();
    scRoundRect(ctx, x, yy, cw, ch, 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 2; ctx.stroke();
    if (icons[i]) ctx.drawImage(icons[i], x + cw / 2 - 52, yy + 30, 104, 104);
    else scIconTile(ctx, null, h.name, x + cw / 2 - 44, yy + 38, 88, rar);
    // qty badge
    scPill(ctx, x + 10, yy + 10, `×${h.qty}`, { bg: 'rgba(0,0,0,0.55)', fg: SC.text, font: scDisplay(22), padX: 10, h: 32 });
    if (h.type === 'permanent') {
      ctx.font = scBody(14, 700); const w = ctx.measureText('PERM').width + 16;
      scPill(ctx, x + cw - w - 10, yy + 10, 'PERM', { bg: 'rgba(251,191,36,0.2)', fg: SC.fair, font: scBody(14, 700), padX: 8, h: 26 });
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = SC.text; ctx.font = scBody(19, 600);
    ctx.fillText(scFit(ctx, h.name, cw - 24), x + 14, yy + 162);
    ctx.fillStyle = SC.accent; ctx.font = scMono(22, 600);
    ctx.fillText(h.value, x + 14, yy + 195);
  });

  // composition bar + footer
  const total = d.parts.reduce((s, p) => s + p.v, 0) || 1;
  let bx = 60; const bw = W - 120, by = 572;
  scRoundRect(ctx, 60, by, bw, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.save(); scRoundRect(ctx, 60, by, bw, 12, 6); ctx.clip();
  d.parts.forEach(p => { const w = (p.v / total) * bw; ctx.fillStyle = p.color; ctx.fillRect(bx, by, Math.max(2, w - 2), 12); bx += w; });
  ctx.restore();
  ctx.fillStyle = SC.muted; ctx.font = scBody(17, 500); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('bloxcores.com', W - 60, 612);
  ctx.textAlign = 'left';
}

// ---- Public profile card ------------------------------------------------------------------
// d: { name, handle, avatarUrl, level, rankTitle, xpPct, stats:[[label,value]], netWorth, holdings:[...] }
async function scRenderProfileCard(canvas, d) {
  await scEnsureFonts();
  const W = 1200, H = 630;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  scBackground(ctx, W, H);
  await scBrandHeader(ctx, W, 'Pirate profile');

  // avatar with a glowing ring
  const [avatar] = await Promise.all([scLoadImage(d.avatarUrl, 3500)]);
  const ax = 70, ay = 128, as = 280;
  scGlow(ctx, ax + as / 2, ay + as / 2, 230, '#60a5fa');
  ctx.save(); ctx.beginPath(); ctx.arc(ax + as / 2, ay + as / 2, as / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#16243f'; ctx.fillRect(ax, ay, as, as);
  if (avatar) ctx.drawImage(avatar, ax, ay, as, as);
  else { ctx.fillStyle = SC.accent; ctx.font = scDisplay(150); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((d.name || '?').charAt(0).toUpperCase(), ax + as / 2, ay + as / 2 + 6); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(ax + as / 2, ay + as / 2, as / 2 + 6, 0, Math.PI * 2);
  ctx.strokeStyle = SC.accent; ctx.lineWidth = 6; ctx.stroke();

  // name block
  const tx = 410;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const px = scFitFont(ctx, d.name, W - tx - 60, 92, scDisplay, 48);
  ctx.fillStyle = SC.text; ctx.font = scDisplay(px);
  ctx.fillText(d.name, tx, 200);
  if (d.handle) { ctx.fillStyle = SC.muted; ctx.font = scBody(26, 500); ctx.fillText(`@${d.handle}`, tx, 244); }
  const pw = scPill(ctx, tx, 268, `Level ${d.level}`, { bg: 'rgba(96,165,250,0.2)', fg: SC.accent, font: scBody(22, 700) });
  scPill(ctx, tx + pw + 12, 268, d.rankTitle, { bg: 'rgba(255,255,255,0.08)', fg: SC.text, font: scBody(22, 600) });
  // xp bar
  scRoundRect(ctx, tx, 326, W - tx - 60, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  const barW = (W - tx - 60) * Math.min(1, Math.max(0, d.xpPct || 0));
  if (barW > 4) { scRoundRect(ctx, tx, 326, barW, 12, 6); const g = ctx.createLinearGradient(tx, 0, tx + barW, 0); g.addColorStop(0, '#3b82f6'); g.addColorStop(1, '#fbbf24'); ctx.fillStyle = g; ctx.fill(); }

  // stat tiles
  const n = d.stats.length, gapT = 14, tw = (W - tx - 60 - gapT * (n - 1)) / n;
  d.stats.forEach(([k, v], i) => {
    const x = tx + i * (tw + gapT), y = 368;
    scRoundRect(ctx, x, y, tw, 104, 18); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = SC.muted; ctx.font = scBody(17, 500); ctx.fillText(k, x + 18, y + 34);
    const spx = scFitFont(ctx, v, tw - 36, 34, scMono, 18);
    ctx.fillStyle = SC.text; ctx.font = scMono(spx, 600); ctx.fillText(v, x + 18, y + 78);
  });

  // bottom strip: net worth + top holdings (only when the owner made their inventory public)
  if (d.netWorth) {
    const icons = await Promise.all(d.holdings.slice(0, 5).map(h => scLoadImage(h.iconUrl, 3000)));
    scRoundRect(ctx, 60, 500, W - 120, 92, 20); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.fillStyle = SC.muted; ctx.font = scBody(17, 500); ctx.fillText('Inventory net worth', 90, 534);
    ctx.fillStyle = SC.accent; ctx.font = scDisplay(46); ctx.fillText(d.netWorth, 88, 578);
    d.holdings.slice(0, 5).forEach((h, i) => {
      const x = W - 90 - (5 - i) * 76;
      scIconTile(ctx, icons[i], h.name, x, 512, 68, SCC_RARITY[(h.rarity || '').toLowerCase()] || SC.accent);
    });
  } else {
    ctx.fillStyle = SC.muted; ctx.font = scBody(20, 500); ctx.fillText('Join the Blox Fruits community on BloxCore', 70, 572);
  }
  ctx.fillStyle = SC.muted; ctx.font = scBody(16, 500); ctx.textAlign = 'right'; ctx.fillText('bloxcores.com', W - 60, 614); ctx.textAlign = 'left';
}
