// BloxCore — Supabase client
// Loaded as a plain <script> (via CDN UMD build) on every page, before other /js files.

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';

// `supabase` global comes from the CDN script tag included in each HTML page.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RANK_THRESHOLDS = [
  { level: 250, title: 'Eternal One' },
  { level: 200, title: 'Reaper of the Grand Line' },
  { level: 175, title: 'God of the Sea' },
  { level: 150, title: 'World Ender' },
  { level: 130, title: 'Living Legend' },
  { level: 110, title: 'True Pirate King' },
  { level: 100, title: 'Pirate King' },
  { level: 80, title: 'Legend' },
  { level: 65, title: 'Emperor' },
  { level: 50, title: 'Warlord' },
  { level: 40, title: 'Notorious Captain' },
  { level: 30, title: 'Captain' },
  { level: 20, title: 'First Mate' },
  { level: 15, title: 'Bounty Hunter' },
  { level: 10, title: 'Deckhand' },
  { level: 5, title: 'Cabin Hand' },
  { level: 1, title: 'Rookie' },
];

function rankTitleForLevel(level) {
  const match = RANK_THRESHOLDS.find(r => level >= r.level);
  return match ? match.title : 'Rookie';
}

function xpForLevel(level) {
  // Matches the DB rule (xp_to_level): level 1→2 costs 100 xp, and each subsequent level
  // costs 20 more than the last (120, 140, 160…). This is the closed-form total xp needed
  // to REACH `level` (i.e. the sum of those growing per-level costs).
  return 100 * (level - 1) + 10 * (level - 1) * (level - 2);
}

function xpProgress(xp, level) {
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const pct = Math.min(100, Math.max(0, ((xp - base) / (next - base)) * 100));
  return { current: xp - base, needed: next - base, pct };
}

function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 250);
  }, 3750);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Guards against javascript:/data:/vbscript: URIs in user-supplied link fields
// (social links, crew Discord invites, broadcast links). escapeHtml() only
// neutralizes HTML syntax — it does nothing to stop a malicious *scheme*, so
// any href built from user input needs to go through this first. Returns
// '#' (a safe no-op) for anything that isn't a plain http(s) URL.
function safeUrl(raw) {
  const str = (raw ?? '').trim();
  if (!str) return '#';
  try {
    const url = new URL(str, window.location.origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '#';
  } catch {
    return '#';
  }
}

// Small, dependency-free markdown -> HTML for admin-authored content (changelog posts). Escapes
// first, then only ever adds tags itself — so even if something raw-HTML-shaped is in the
// source text, it's already neutralized before any markdown syntax is applied. Supports the
// common subset: headers, bold/italic, links, inline code, code blocks, lists, quotes.
function markdownToHtml(raw) {
  const escaped = escapeHtml(raw ?? '');
  const codeBlocks = [];
  let text = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre style="background:rgba(255,255,255,0.04); border:1px solid var(--glass-border); border-radius:var(--radius-sm); padding:10px; overflow-x:auto;"><code>${code.trim()}</code></pre>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });

  // Bullet lists — group consecutive "- item" or "* item" lines into one <ul>. Runs
  // before bold/italic so a bullet's leading "* " is stripped first; otherwise a lone
  // leading asterisk on a list line can get mistaken for the start of an *italic* span.
  text = text.replace(/(^[-*] .*(?:\n[-*] .*)*)/gm, block =>
    `<ul style="margin:8px 0; padding-left:20px;">${block.split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('')}</ul>`
  );

  text = text
    .replace(/^### (.*)$/gm, '<h4 style="margin:14px 0 4px; font-size:1rem; font-family:var(--font-body); text-transform:none; letter-spacing:normal;">$1</h4>')
    .replace(/^## (.*)$/gm, '<h3 style="margin:16px 0 6px; font-size:1.05rem; font-family:var(--font-body); text-transform:none; letter-spacing:normal;">$1</h3>')
    .replace(/^&gt; (.*)$/gm, '<blockquote style="margin:8px 0; padding-left:12px; border-left:2px solid var(--brass); color:var(--ash);">$1</blockquote>')
    .replace(/^(?:---|\*\*\*|___)$/gm, '\u0000HR\u0000')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:4px; font-size:0.9em;">$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--brass-bright);">$1</a>');

  text = text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed === '\u0000HR\u0000') return '<hr style="margin:16px 0; border:none; border-top:1px solid var(--glass-border);">';
      return /^<(h3|h4|ul|blockquote)/.test(trimmed) ? line : line ? `<p style="margin:6px 0;">${line}</p>` : '';
    })
    .join('');

  return text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => codeBlocks[i]);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function formatBounty(n) {
  const num = Number(n) || 0;
  if (num <= 0) return 'Unranked';
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${label}M`;
  }
  return num.toLocaleString('en-US');
}

// Fixed bounty tiers (2.5M steps, 2.5M-30M) — used for both Pirate and Marine Bounty selects.
const BOUNTY_TIERS = [
  { value: 2500000, label: '2.5M' },
  { value: 5000000, label: '5M+' },
  { value: 7500000, label: '7.5M+' },
  { value: 10000000, label: '10M+' },
  { value: 12500000, label: '12.5M+' },
  { value: 15000000, label: '15M+' },
  { value: 17500000, label: '17.5M+' },
  { value: 20000000, label: '20M+' },
  { value: 22500000, label: '22.5M+' },
  { value: 25000000, label: '25M+' },
  { value: 27500000, label: '27.5M+' },
  { value: 30000000, label: '30M' },
];

// Lucide icons only render for elements present in the DOM when lucide.createIcons() runs
// (nav.js calls it once on page load) — anything injected afterward via innerHTML (chat
// messages, challenge cards, admin rows, etc.) needs this called again. Every place in this
// codebase that writes HTML containing a <i data-lucide="..."> tag calls this right after.
// Shared across trading/sea-events — a quick reason prompt is enough for an MVP report flow;
// staff review the actual content on the /admin/reports/ page before acting on it.
async function reportContent(targetType, targetId) {
  const reason = window.prompt('What\'s wrong with this? (scam, inappropriate link, etc.)');
  if (!reason || !reason.trim()) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showToast('Sign in to report content.', true); return; }
  const { error } = await sb.from('reports').insert({ target_type: targetType, target_id: targetId, reason: reason.trim(), reporter_id: session.user.id });
  if (error) { showToast(error.message, true); return; }
  showToast('Reported — staff will take a look.');
}

const VIDEO_PLATFORM_HOSTS = ['youtube.com', 'youtu.be', 'streamable.com', 'medal.tv', 'twitch.tv', 'clips.twitch.tv', 'vimeo.com', 'tiktok.com', 'drive.google.com'];
function isVideoPlatformLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return VIDEO_PLATFORM_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function refreshIcons() {
  if (!window.lucide) return;
  try {
    lucide.createIcons();
  } catch (e) {
    // An icon render failure must never block whatever ran right after this call —
    // e.g. nav.js wires up the hamburger menu click handler after its own icon call,
    // and an uncaught throw here would silently kill that wiring for the whole page.
    console.error('Icon render failed:', e);
  }
}

// A player's chosen display name if set, otherwise their (unique, unchangeable) username.
function displayNameFor(profile) {
  return profile?.display_name || profile?.username || 'Unknown';
}

// A poster who's both brand new (<72h old) and has zero vouches either way is exactly
// the profile scam listings tend to have — flag it inline so buyers/sellers notice
// before they DM someone with no track record at all.
const NEW_ACCOUNT_WINDOW_MS = 72 * 60 * 60 * 1000;
function newAccountBadge(profile, repPositive, repNegative) {
  if (!profile?.created_at) return '';
  const isNew = (Date.now() - new Date(profile.created_at).getTime()) < NEW_ACCOUNT_WINDOW_MS;
  const hasNoVouches = !repPositive && !repNegative;
  if (!isNew || !hasNoVouches) return '';
  return `<span class="new-account-badge" title="Account created within the last 3 days and has no vouches yet — take extra care."><i data-lucide="triangle-alert" class="icon-sm icon-inline"></i>New account</span>`;
}

// Batches a reputation lookup for a set of posters (e.g. everyone shown on a page of
// listings) into one query instead of one round-trip per card, then drops a small badge
// into every element carrying data-rep-for="<userId>" found under container. Also flags
// posters whose account is new and has no vouches yet (see newAccountBadge above) into
// any matching data-new-account-for="<userId>" element.
async function loadReputationBadges(container, posters) {
  const list = posters.map(p => (typeof p === 'string' ? { id: p, createdAt: null } : { id: p.id, createdAt: p.createdAt }));
  const ids = [...new Set(list.map(p => p.id))].filter(Boolean);
  if (!ids.length) return;
  const createdAtById = new Map(list.map(p => [p.id, p.createdAt]));

  const { data } = await sb.from('vouches').select('target_id, direction').in('target_id', ids);
  const scores = {};
  (data || []).forEach(v => {
    scores[v.target_id] = scores[v.target_id] || { positive: 0, negative: 0 };
    scores[v.target_id][v.direction === 1 ? 'positive' : 'negative']++;
  });

  container.querySelectorAll('[data-rep-for]').forEach(el => {
    const s = scores[el.dataset.repFor];
    if (!s || (!s.positive && !s.negative)) return;
    el.innerHTML = `<span class="rep-badge" title="${s.positive} positive, ${s.negative} negative vouch${s.positive + s.negative === 1 ? '' : 'es'}"><i data-lucide="thumbs-up" class="icon-sm icon-inline"></i>${s.positive}${s.negative ? ` <i data-lucide="thumbs-down" class="icon-sm icon-inline" style="margin-left:4px;"></i>${s.negative}` : ''}</span>`;
  });

  container.querySelectorAll('[data-new-account-for]').forEach(el => {
    const userId = el.dataset.newAccountFor;
    const s = scores[userId] || { positive: 0, negative: 0 };
    el.innerHTML = newAccountBadge({ created_at: createdAtById.get(userId) }, s.positive, s.negative);
  });

  refreshIcons();
}

// Shared circular avatar renderer. Discord CDN avatar URLs can go stale when a user changes
// their pfp (the old hash 404s), which otherwise shows the browser's broken-image icon —
// onerror swaps it for an initials placeholder instead, site-wide, from one place.
function avatarHtml(profile, size, extraStyle = '', presence = null) {
  const name = displayNameFor(profile);
  const initial = escapeHtml((name[0] || '?').toUpperCase());
  const ring = `box-shadow:0 0 0 3px var(--ink), 0 0 0 4px rgb(var(--brass-rgb) / 0.5), 0 4px 18px rgb(var(--shadow-rgb) / 0.4);`;
  const fallback = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(150deg, var(--navy-light), var(--navy));display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.4)}px;flex-shrink:0;color:var(--ash);font-family:var(--font-stamp);${ring}${presence ? '' : extraStyle}">${initial}</div>`;
  const inner = (!profile?.avatar_url) ? fallback : (() => {
    const escapedFallback = fallback.replace(/"/g, '&quot;');
    return `<img src="${profile.avatar_url}" alt="" loading="lazy" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;${ring}${presence ? '' : extraStyle}" onerror="this.outerHTML='${escapedFallback}';">`;
  })();

  if (!presence) return inner;

  // Presence dot is opt-in via this 4th param — existing callers that don't pass it
  // get byte-identical output to before. When used, extraStyle (e.g. the negative
  // margin avatar-stacking trick) moves to this wrapper instead of the inner
  // img/div, so stacking/positioning still behaves the same from the outside.
  const dotColor = { online: 'var(--sea)', idle: 'var(--brass-bright)', offline: 'var(--ash)' }[presence] || 'var(--ash)';
  const dotSize = Math.max(8, Math.round(size * 0.28));
  return `<span style="position:relative; display:inline-flex; flex-shrink:0; ${extraStyle}"><span style="display:inline-flex;">${inner}</span><span style="position:absolute; bottom:0; right:0; width:${dotSize}px; height:${dotSize}px; border-radius:50%; background:${dotColor}; border:2px solid var(--ink);" title="${presence[0].toUpperCase()}${presence.slice(1)}"></span></span>`;
}

// Shared thresholds/labels for last_active_at → a presence status, used everywhere a
// status dot or "last seen" text is shown (chat, profiles) — admin-users.js has its own
// copy of the same logic for its user-management table.
function presenceStatus(lastActiveAt) {
  if (!lastActiveAt) return 'offline';
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (ms <= 5 * 60 * 1000) return 'online';
  if (ms <= 30 * 60 * 1000) return 'idle';
  return 'offline';
}
function lastSeenLabel(lastActiveAt) {
  const status = presenceStatus(lastActiveAt);
  if (status === 'online') return 'Online now';
  if (!lastActiveAt) return 'Offline';
  return `Last seen ${timeAgo(lastActiveAt)}`;
}

// Renders a small colored title badge if the profile has an active title equipped
// (expects the query to have joined titles(name, color) via active_title_id).
// Returns the right inline style for rendering a title's name in its color — handles a
// plain hex color, the literal 'rainbow' preset, or an admin-defined custom CSS gradient
// (e.g. 'linear-gradient(90deg, #f00, #00f)') the same way, since `color:` can never
// directly hold a gradient — those need the background-clip:text trick instead.
function titleColorStyle(c) {
  if (!c) return '';
  if (c === 'rainbow') {
    return `background-image:linear-gradient(90deg, #ef4444, #fbbf24, #34d399, #38bdf8, #a78bfa, #ef4444); background-size:300% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent; animation: rainbowShift 4s linear infinite;`;
  }
  if (c.includes('gradient(')) {
    return `background-image:${c}; -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent;`;
  }
  return `color:${c};`;
}

// Curated so every option stays readable on the site's dark background — no colors dark
// enough to disappear against navy panels.
const CHAT_NAME_COLOR_PALETTE = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee',
  '#60a5fa', '#a78bfa', '#e879f9', '#f472b6', '#fb7185', '#2dd4bf',
];

function chatNameColor(profile) {
  if (profile?.chat_name_color) return profile.chat_name_color;
  if (profile?.role === 'mod' || profile?.role === 'admin') return 'var(--blood-dim)';
  // Deterministic so the same person always lands on the same color without storing one —
  // simple string hash over their (stable) user id, not their display name.
  const id = profile?.id || profile?.username || '';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CHAT_NAME_COLOR_PALETTE[hash % CHAT_NAME_COLOR_PALETTE.length];
}

function titleBadge(profile) {
  if (!profile?.titles?.name) return '';
  const c = profile.title_color_override || profile.titles.color;
  if (c === 'rainbow') {
    return `<span class="title-badge-rainbow">${escapeHtml(profile.titles.name)}</span>`;
  }
  if (c && c.includes('gradient(')) {
    return `<span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:3px 10px; border-radius:999px; border:1px solid rgba(255,255,255,0.25); ${titleColorStyle(c)}">${escapeHtml(profile.titles.name)}</span>`;
  }
  return `<span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:3px 10px; border-radius:999px; border:1px solid ${c}; color:${c}; background:${c}1a;">${escapeHtml(profile.titles.name)}</span>`;
}

// A curated set of colors users can recolor their equipped title with — not a free color
// picker, so every combination still fits the site's palette. 'default' means "use the
// title's own color" (title_color_override = null); 'rainbow' is the special animated style.
const TITLE_COLOR_PRESETS = [
  { key: 'default', label: 'Default', swatch: null },
  { key: '#ef4444', label: 'Red', swatch: '#ef4444' },
  { key: '#fbbf24', label: 'Gold', swatch: '#fbbf24' },
  { key: '#a78bfa', label: 'Purple', swatch: '#a78bfa' },
  { key: '#38bdf8', label: 'Blue', swatch: '#38bdf8' },
  { key: '#34d399', label: 'Green', swatch: '#34d399' },
  { key: '#fb7185', label: 'Rose', swatch: '#fb7185' },
  { key: '#f5f5f7', label: 'White', swatch: '#f5f5f7' },
  { key: 'rainbow', label: 'Rainbow', swatch: 'rainbow' },
];

// Theme: localStorage is the source of truth for instant, flash-free application (every
// page has an inline script in <head> that applies it before paint). For signed-in users,
// profiles.theme lets the preference follow them to a new device — synced here on load.

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bc_theme', theme);
}

async function syncThemeFromProfile(profile) {
  if (!profile?.theme) return;
  if (profile.theme === localStorage.getItem('bc_theme')) return;
  applyTheme(profile.theme);
}

function applyAccent(accent) {
  if (accent === 'blue') {
    document.documentElement.removeAttribute('data-accent');
    localStorage.setItem('bc_accent', 'blue');
    return;
  }
  document.documentElement.setAttribute('data-accent', accent);
  localStorage.setItem('bc_accent', accent);
}

// Custom themes aren't a CSS class — the colors are per-user, so they're applied as inline
// custom properties directly on <html>, which override any class-based rule automatically.
function applyCustomTheme(colors) {
  document.documentElement.setAttribute('data-accent', 'custom');
  document.documentElement.style.setProperty('--ink', colors.ink);
  document.documentElement.style.setProperty('--navy', colors.navy);
  document.documentElement.style.setProperty('--navy-light', colors['navy-light']);
  document.documentElement.style.setProperty('--brass', colors.brass);
  document.documentElement.style.setProperty('--brass-bright', colors['brass-bright']);
  document.documentElement.style.setProperty('--brass-rgb', hexToRgbTriplet(colors.brass));
  document.documentElement.style.setProperty('--ink-glow', colors.navy);
  localStorage.setItem('bc_accent', 'custom');
  localStorage.setItem('bc_custom_theme', JSON.stringify(colors));
}

function hexToRgbTriplet(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

async function syncAccentFromProfile(profile) {
  if (!profile?.accent_color) return;
  if (profile.accent_color === 'custom') {
    if (profile.custom_theme_colors) applyCustomTheme(profile.custom_theme_colors);
    return;
  }
  if (profile.accent_color === (localStorage.getItem('bc_accent') || 'blue')) return;
  applyAccent(profile.accent_color);
}

// Removes the inline custom-theme overrides applyCustomTheme() set directly on <html> —
// without this, those inline styles (highest specificity) would keep winning over any
// preset class even after switching away from "Custom".
function clearCustomTheme() {
  const props = ['--ink', '--navy', '--navy-light', '--brass', '--brass-bright', '--brass-rgb', '--ink-glow'];
  props.forEach(p => document.documentElement.style.removeProperty(p));
  localStorage.removeItem('bc_custom_theme');
}

// Simple, generic glyphs for each platform (not pixel-exact brand logos) — used instead
// of plain text labels on social links.
const SOCIAL_ICONS = {
  roblox: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5.5 3 3 18.5 18.5 21 21 5.5 5.5 3zm7.9 6.1 1.5 5.8-5.8 1.5-1.5-5.8 5.8-1.5z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="1" y="5" width="22" height="14" rx="4"/><path d="M10 8.5v7l6-3.5z" fill="var(--ink)"/></svg>',
  twitch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 2 2 6v14h6v2h3l2-2h4l4-4V2H4zm14 12-3 3h-4l-2 2v-2H6V4h12v10z"/><rect x="9" y="7" width="2" height="5" fill="var(--ink)"/><rect x="14" y="7" width="2" height="5" fill="var(--ink)"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4l7 8.5L4.5 20H7l5-5.5L16 20h4l-7.5-9L19.5 4H17l-4.5 5L8 4z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 2h3c.2 2 1.6 3.6 4 3.9V9c-1.5 0-2.9-.4-4-1.2V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.2a2.8 2.8 0 1 0 2 2.7z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5C6 6 4.5 6.8 4.5 6.8S3 9.5 3 15c0 0 1.4 2.2 5 2.3l.8-1.2c-1.4-.4-2.2-1-2.2-1s.2.1.5.3c0 0 1.6 1 5.4 1s5.4-1 5.4-1l.5-.3s-.8.6-2.2 1l.8 1.2c3.6-.1 5-2.3 5-2.3 0-5.5-1.5-8.2-1.5-8.2S17.5 5.8 16 5.5l-.5 1c-.8-.2-1.7-.3-2.5-.3s-1.7.1-2.5.3l-.5-1zM9.3 11c.7 0 1.3.7 1.3 1.5S10 14 9.3 14s-1.3-.7-1.3-1.5S8.6 11 9.3 11zm5.4 0c.7 0 1.3.7 1.3 1.5s-.6 1.5-1.3 1.5-1.3-.7-1.3-1.5.6-1.5 1.3-1.5z"/></svg>',
};

// Resolve the current session + profile row together. Returns { user, profile } or nulls.
// Memoized per page load: nav.js and every page's own requireAuth() call both need this,
// and were previously firing two separate profiles queries on every authenticated page —
// this caches the in-flight/resolved promise so the second caller reuses the first fetch
// instead of re-querying. Deliberately not time-based (no TTL) — a page load is short-lived
// enough that the profile isn't expected to change under it.
let _profileFetchPromise = null;
// Call this immediately after writing to the current user's own profiles row, before
// re-calling getCurrentProfile() to render the fresh result — otherwise the memoized
// cache below would keep serving the pre-save data for the rest of the page's life.
function invalidateProfileCache() {
  _profileFetchPromise = null;
}
async function getCurrentProfile() {
  if (_profileFetchPromise) return _profileFetchPromise;
  _profileFetchPromise = (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { user: null, profile: null };
    const { data: profile, error } = await sb
      .from('profiles')
      .select('*, titles(name, color)')
      .eq('id', session.user.id)
      .single();
    if (error) {
      console.error('Failed to load profile', error);
      return { user: session.user, profile: null };
    }
    await syncDiscordAvatar(session.user, profile);
    return { user: session.user, profile };
  })();
  return _profileFetchPromise;
}

// Discord's OAuth metadata always reflects the user's *current* pfp, but our profiles.avatar_url
// is only a snapshot from whenever it was last written. Two gotchas made the old version of this
// never actually catch an updated pfp: (1) supabase.auth session.user.user_metadata is a snapshot
// from the user's *first* sign-in and Supabase does not refresh it on later logins — the live data
// instead lands in user.identities[].identity_data, and (2) getSession() can hand back a locally
// cached user object, so we call getUser() here to force a round-trip to the Auth server for the
// current identity. Throttled like touchLastActive so it's not a write on every single page view.
async function syncDiscordAvatar(user, profile) {
  const key = 'bc_avatar_sync_' + user.id;
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < 5 * 60 * 1000) return;
  localStorage.setItem(key, String(Date.now()));

  const { data: { user: freshUser } } = await sb.auth.getUser();
  const discordIdentity = freshUser?.identities?.find(i => i.provider === 'discord');
  const idData = discordIdentity?.identity_data || freshUser?.user_metadata || {};
  let discordAvatar = idData.avatar_url || idData.picture;
  if (!discordAvatar && idData.avatar && (idData.provider_id || idData.sub)) {
    discordAvatar = `https://cdn.discordapp.com/avatars/${idData.provider_id || idData.sub}/${idData.avatar}.png`;
  }
  if (!discordAvatar || discordAvatar === profile?.avatar_url) return;

  const { error } = await sb.from('profiles').update({ avatar_url: discordAvatar }).eq('id', user.id);
  if (!error) profile.avatar_url = discordAvatar;
}

// Redirect helpers used by pages that require (or forbid) auth
async function requireAuth() {
  const { user, profile } = await getCurrentProfile();
  if (!user) {
    window.location.href = '/auth/';
    return null;
  }
  if (profile?.banned && window.location.pathname !== '/appeal/') {
    window.location.href = '/appeal/';
    return null;
  }
  touchLastActive(user.id);
  return { user, profile };
}

// Throttled so it's not a write on every single page view — once per 5 minutes is plenty
// for an "active users" admin view.
function touchLastActive(userId) {
  const key = 'bc_last_active_touch';
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < 5 * 60 * 1000) return;
  localStorage.setItem(key, String(Date.now()));
  sb.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId).then(() => {});
}

async function requireMod() {
  const result = await requireAuth();
  if (!result) return null;
  if (!result.profile || (result.profile.role !== 'mod' && result.profile.role !== 'admin')) {
    window.location.href = '/dashboard/';
    return null;
  }
  return result;
}

async function requireAdmin() {
  const result = await requireAuth();
  if (!result) return null;
  if (!result.profile || result.profile.role !== 'admin') {
    window.location.href = '/dashboard/';
    return null;
  }
  return result;
}

// --- Fruit skin/mutation picker -------------------------------------------
// Some fruits have known equippable skins or mutations (e.g. Dragon has Eclipse,
// Tiger has Werewolf). Any fruit selector can call maybePromptFruitSkin() after a
// fruit is chosen — it only prompts when that fruit actually has linked skins in
// bf_items, and injects its own modal into the page the first time it's needed.

function ensureFruitSkinModal() {
  if (document.getElementById('fruit-skin-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'fruit-skin-modal';
  overlay.className = 'build-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'fruit-skin-modal-title');
  overlay.innerHTML = `
    <div class="panel build-modal">
      <div class="flex-between" style="margin-bottom:14px;">
        <h3 style="font-size:1.05rem; margin:0;" id="fruit-skin-modal-title">Choose a Skin</h3>
        <button type="button" class="btn btn-ghost btn-sm" id="fruit-skin-modal-close" aria-label="Close"><i data-lucide="x" class="icon-md"></i></button>
      </div>
      <p class="muted" style="margin:0 0 14px; font-size:0.82rem;">This fruit has known skins/mutations — pick the one you're using in-game, or Base for the plain fruit.</p>
      <div id="fruit-skin-modal-grid" class="build-modal-grid"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('fruit-skin-modal-close').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
}

async function maybePromptFruitSkin(fruitName, currentSkin, onSelect) {
  if (!fruitName) { onSelect(null); return; }

  const { data: skins } = await sb.from('bf_items').select('id, name, icon_url').eq('category', 'limited').eq('base_fruit', fruitName);
  if (!skins || !skins.length) { onSelect(null); return; }

  ensureFruitSkinModal();
  const overlay = document.getElementById('fruit-skin-modal');
  document.getElementById('fruit-skin-modal-title').textContent = `${fruitName} — Choose Your Skin`;
  const grid = document.getElementById('fruit-skin-modal-grid');

  const noneTile = `<div class="build-modal-tile ${!currentSkin ? 'selected' : ''}" data-skin-name=""><i data-lucide="ban" class="icon-lg"></i><span>Base ${escapeHtml(fruitName)}</span></div>`;
  const tiles = skins.map(s => `
    <div class="build-modal-tile ${currentSkin === s.name ? 'selected' : ''}" data-skin-name="${escapeHtml(s.name)}">
      <img src="${s.icon_url}" alt="${escapeHtml(s.name)}" loading="lazy">
      <span>${escapeHtml(s.name)}</span>
    </div>
  `).join('');
  grid.innerHTML = noneTile + tiles;
  refreshIcons();

  grid.querySelectorAll('[data-skin-name]').forEach(tile => {
    tile.addEventListener('click', () => {
      overlay.classList.remove('open');
      const name = tile.dataset.skinName || null;
      const iconUrl = name ? (skins.find(s => s.name === name)?.icon_url || null) : null;
      onSelect(name, iconUrl);
    });
  });
  overlay.classList.add('open');
}

// --- Global Escape-to-close for modals ---------------------------------
// Every modal on the site already closes on a backdrop click via its own
// `overlay.addEventListener('click', e => { if (e.target === overlay) ... })`
// handler. Rather than re-implement each modal's close logic here (and risk
// drifting out of sync with it), Escape just dispatches a synthetic click
// directly on the overlay element — which satisfies `e.target === overlay`
// and triggers that same existing handler.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('[role="dialog"]').forEach(overlay => {
    if (getComputedStyle(overlay).display === 'none') return;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
});

let _siteSettingsCache = null;

async function getSiteSettings() {
  if (_siteSettingsCache) return _siteSettingsCache;
  const { data } = await sb.from('site_settings').select('key, value');
  const map = {};
  (data || []).forEach(row => { map[row.key] = row.value; });
  _siteSettingsCache = {
    chatCooldownSeconds: map.chat_cooldown_seconds ?? 10,
    maxActiveTrades: map.max_active_trades ?? 3,
    maxActiveServices: map.max_active_services ?? 5,
    maxCombosPerUser: map.max_combos_per_user ?? 10,
    maxChatMessageLength: map.max_chat_message_length ?? 500,
    trustAutoApproveEnabled: map.trust_auto_approve_enabled ?? true,
    trustMinApproved: map.trust_min_approved ?? 10,
    trustMaxRejectRate: map.trust_max_reject_rate ?? 0.1,
    minChatMessageLength: map.min_chat_message_length ?? 2,
    minCrewNameLength: map.min_crew_name_length ?? 3,
    minCrewDescriptionLength: map.min_crew_description_length ?? 15,
    minServiceTitleLength: map.min_service_title_length ?? 5,
    minServiceDescriptionLength: map.min_service_description_length ?? 15,
    minComboTitleLength: map.min_combo_title_length ?? 3,
    minComboDescriptionLength: map.min_combo_description_length ?? 10,
    minSeaEventNoteLength: map.min_sea_event_note_length ?? 5,
    minThirdPartyTitleLength: map.min_third_party_title_length ?? 4,
    maxThirdPartyTitleLength: map.max_third_party_title_length ?? 60,
    minThirdPartyDescriptionLength: map.min_third_party_description_length ?? 0,
    maxThirdPartyDescriptionLength: map.max_third_party_description_length ?? 300,
  };
  return _siteSettingsCache;
}

// --- Page-init error safety net --------------------------------------------
// Swap `document.addEventListener('DOMContentLoaded', async () => { ... });` for
// `onReady(async () => { ... });` — same call shape, so it's a one-line drop-in.
// Catches network-level failures (offline, DNS, CORS) that a plain `{ data, error }`
// check can't: those reject the whole await instead of resolving with an error object,
// which otherwise leaves the page stuck on its skeleton/loading state with a silent
// console error and no feedback for the person looking at it.
function onReady(fn) {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await fn();
    } catch (e) {
      console.error('Unhandled error during page init:', e);
      if (typeof showToast === 'function') {
        showToast('Something went wrong loading this page. Try refreshing.', true);
      }
    }
  });
}

// --- Shared "Load More" pagination helper ----------------------------------
// Renders a Load More button under `container`; each click fetches the next
// page via `fetchPage(offset, pageSize)` (must return an array), appends the
// rendered rows via `renderItem`, and hides itself once a short page comes
// back (fewer rows than pageSize means there's nothing left to load).
function attachLoadMore(container, { pageSize = 20, initialOffset = 0, fetchPage, renderItem, onAppend, wrapId } = {}) {
  let offset = initialOffset;
  let loading = false;
  wrapId = wrapId || `load-more-wrap-${Math.random().toString(36).slice(2, 9)}`;
  const existing = document.getElementById(wrapId);
  if (existing) existing.remove();
  const btnId = `${wrapId}-btn`;
  container.insertAdjacentHTML('afterend', `<div id="${wrapId}" style="text-align:center; margin-top:16px;"><button id="${btnId}" class="btn btn-ghost btn-sm" style="display:none;">Load more</button></div>`);
  const btn = document.getElementById(btnId);

  async function loadNext() {
    if (loading) return;
    loading = true;
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      const rows = await fetchPage(offset, pageSize);
      if (rows.length) {
        container.insertAdjacentHTML('beforeend', rows.map(renderItem).join(''));
        offset += rows.length;
        if (onAppend) onAppend(rows);
      }
      btn.style.display = rows.length < pageSize ? 'none' : 'inline-flex';
    } catch (e) {
      console.error('Load more failed:', e);
      btn.textContent = 'Couldn\'t load more — retry';
    } finally {
      loading = false;
      btn.disabled = false;
      if (btn.style.display !== 'none') btn.textContent = 'Load more';
    }
  }

  btn.addEventListener('click', loadNext);
  return { loadNext, reset: () => { offset = initialOffset; btn.style.display = 'none'; } };
}

// ---- Roblox OAuth connect (used by /profile/ and /roblox-callback/) ----

const ROBLOX_OAUTH_CLIENT_ID = '3264730958979795688';

function startRobloxOAuthConnect(returnTo) {
  const state = crypto.randomUUID();
  sessionStorage.setItem('bc_roblox_oauth_state', state);
  sessionStorage.setItem('bc_roblox_oauth_return', returnTo || location.pathname);
  const redirectUri = `${location.origin}/roblox-callback/`;
  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.searchParams.set('client_id', ROBLOX_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  location.href = url.toString();
}
