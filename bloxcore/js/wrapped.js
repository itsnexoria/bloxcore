// BloxCore — /wrapped/ page logic. Renders a shareable recap card to <canvas> using
// the current season's (or account-lifetime, if no active season) stats, then lets the
// user download it as a PNG or use the native share sheet on mobile.

const CARD_W = 1080;
const CARD_H = 1350;

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  if (!user) {
    window.location.href = '/auth/?next=/wrapped/';
    return;
  }

  const { data, error } = await sb.rpc('get_wrapped_stats', { p_user_id: user.id });
  const stats = data?.[0];

  if (error || !stats) {
    document.getElementById('wrapped-status').textContent = "Couldn't load your stats right now — try again in a bit.";
    return;
  }

  document.getElementById('wrapped-loading').style.display = 'none';
  document.getElementById('wrapped-card-wrap').style.display = 'block';

  await drawCard(profile, stats);

  document.getElementById('wrapped-download-btn').addEventListener('click', downloadCard);
  if (navigator.share) {
    document.getElementById('wrapped-share-btn').style.display = 'inline-flex';
    document.getElementById('wrapped-share-btn').addEventListener('click', shareCard);
  }
});

function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // graceful — card still renders without the avatar
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawCard(profile, stats) {
  const canvas = document.getElementById('wrapped-canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  if (document.fonts?.ready) await document.fonts.ready;

  // Background
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0a0e17');
  bg.addColorStop(1, '#131c2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Brass glow accents
  const glow1 = ctx.createRadialGradient(CARD_W * 0.85, 100, 20, CARD_W * 0.85, 100, 420);
  glow1.addColorStop(0, 'rgba(214,168,65,0.22)');
  glow1.addColorStop(1, 'rgba(214,168,65,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Header
  ctx.fillStyle = '#d6a841';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('BLOXCORE', 60, 100);
  ctx.fillStyle = '#8892a6';
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.fillText('bloxcores.com', 60, 136);

  ctx.fillStyle = '#f4f2ea';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText(stats.season_name ? `${stats.season_name} Wrapped` : 'Your BloxCore Wrapped', 60, 230);

  // Avatar + name
  const avatarImg = await loadImage(profile?.avatar_url);
  const ax = 60, ay = 270, asize = 120;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + asize / 2, ay + asize / 2, asize / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, ax, ay, asize, asize);
  } else {
    ctx.fillStyle = '#1c2740';
    ctx.fillRect(ax, ay, asize, asize);
  }
  ctx.restore();
  ctx.strokeStyle = '#d6a841';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ax + asize / 2, ay + asize / 2, asize / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f4f2ea';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(profile?.display_name || profile?.username || 'Pirate', ax + asize + 30, ay + 55);
  ctx.fillStyle = '#8892a6';
  ctx.font = '400 30px system-ui, sans-serif';
  ctx.fillText(stats.crew_name ? `${stats.crew_tag ? `[${stats.crew_tag}] ` : ''}${stats.crew_name}` : 'No crew yet', ax + asize + 30, ay + 95);

  // Big XP hero number
  const heroY = 560;
  ctx.fillStyle = '#8892a6';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText('XP EARNED', 60, heroY);
  ctx.fillStyle = '#d6a841';
  ctx.font = '800 140px system-ui, sans-serif';
  ctx.fillText(fmt(stats.xp_earned), 56, heroY + 130);

  // Stat tiles grid
  const tiles = [
    { label: 'Quests Completed', value: fmt(stats.quests_completed) },
    { label: 'Rank Ups', value: fmt(stats.rank_ups) },
    { label: 'Current Level', value: fmt(stats.current_level) },
    { label: 'Trades Completed', value: fmt(stats.trades_completed) },
    { label: 'Friends Referred', value: fmt(stats.referrals) },
    { label: 'Giveaways Won', value: fmt(stats.giveaways_won) },
  ];

  const gridY = 800;
  const tileW = (CARD_W - 60 * 2 - 24 * 2) / 3;
  const tileH = 190;
  tiles.forEach((t, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 60 + col * (tileW + 24);
    const y = gridY + row * (tileH + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, x, y, tileW, tileH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,168,65,0.25)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, tileW, tileH, 18);
    ctx.stroke();

    ctx.fillStyle = '#f4f2ea';
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.fillText(t.value, x + 24, y + 90);
    ctx.fillStyle = '#8892a6';
    ctx.font = '500 22px system-ui, sans-serif';
    wrapText(ctx, t.label, x + 24, y + 130, tileW - 40, 26);
  });

  // Footer CTA
  ctx.fillStyle = '#8892a6';
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Track your own bounty at bloxcores.com', CARD_W / 2, CARD_H - 50);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, curY);
      line = word + ' ';
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, curY);
}

function downloadCard() {
  const canvas = document.getElementById('wrapped-canvas');
  const link = document.createElement('a');
  link.download = 'bloxcore-wrapped.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function shareCard() {
  const canvas = document.getElementById('wrapped-canvas');
  canvas.toBlob(async (blob) => {
    const file = new File([blob], 'bloxcore-wrapped.png', { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: 'My BloxCore Wrapped', text: 'Check out my BloxCore Wrapped!' });
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  }, 'image/png');
}
