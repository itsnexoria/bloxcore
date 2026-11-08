// BloxCore — Supabase client
// Loaded as a plain <script> (via CDN UMD build) on every page, before other /js files.

var SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';

// `supabase` global comes from the CDN script tag included in each HTML page.
var sb = window.sb || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Top-level declarations in this file use `var` on purpose: if a browser/in-app webview ever executes the
// script twice, `const` would throw "Identifier ... has already been declared" and break the whole page.

// Client-side crash reporting — best-effort, fire-and-forget, capped per page load so a
// crash loop can't hammer the DB. Never awaited, never blocks, never throws.
var _clientErrorCount = 0;
var _THIRD_PARTY_RE = /(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;
function reportClientError(message, stack, source) {
  if (_THIRD_PARTY_RE.test(`${stack || ''} ${source || ''} ${message || ''}`) || /^Script error\.?$/i.test(String(message || ''))) return;
  if (_clientErrorCount >= 5) return;
  _clientErrorCount++;
  sb.from('client_errors').insert({
    user_id: window._bcCurrentUserId || null,
    message: String(message || 'Unknown error').slice(0, 500),
    stack: stack ? String(stack).slice(0, 3000) : null,
    page_url: location.pathname + location.search,
    user_agent: navigator.userAgent,
  }).then(() => {}, () => {}); // swallow — logging a failure to log isn't worth it
}
window.addEventListener('error', (e) => reportClientError(e.message, e.error?.stack, e.filename));
window.addEventListener('unhandledrejection', (e) => reportClientError(e.reason?.message || String(e.reason), e.reason?.stack));

// Flip to true locally for full error objects/stack traces in the console. Left false in
// production: these ~66 call sites are all genuine error-path logs (catch blocks, failed
// queries), not debug noise, so they still print — just trimmed to the message only, so a
// live bug report's console output stays short and readable instead of dumping full
// PostgrestError/Error objects.
var DEBUG = false;
function logError(...args) {
  if (DEBUG) { console.error(...args); return; }
  console.error(...args.map(a => (a && typeof a === 'object' && 'message' in a) ? a.message : a));
}

var RANK_THRESHOLDS = [
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

// DB rate limits (check_rate_limit / trg_rate_limit) raise plain-English exceptions. Turn them into a
// friendly "slow down" toast instead of showing the raw server message as an error.
var RATE_LIMIT_RE = /too many attempts|slow down|rate limit|too often/i;

function showToast(message, isError = false) {
  const slow = isError && RATE_LIMIT_RE.test(String(message || ''));
  if (slow) { message = "⏳ Slow down — you're doing that too fast. Give it a few minutes and try again."; isError = false; }
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '') + (slow ? ' toast-slow' : '');
  toast.textContent = message;
  // Screen readers otherwise never announce a toast at all — role="alert" for errors
  // (interrupts immediately, since it's often the only feedback a failed action gets)
  // vs role="status" for success (announced politely, doesn't interrupt).
  toast.setAttribute('role', isError ? 'alert' : 'status');
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 250);
  }, 3750);
}

// --- Scam signals (shared: DMs today; usable for offer notes / listing notes) -------------------
// Client-side hints only — they warn the reader, they never block or censor a message.
var SAFE_LINK_HOSTS = ['bloxcores.com', 'roblox.com', 'discord.com', 'discord.gg', 'youtube.com', 'youtu.be', 'twitch.tv', 'tiktok.com', 'x.com', 'twitter.com'];
var LINK_SHORTENERS = ['bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy', 'is.gd', 't.co', 'shorturl.at', 'goo.gl'];

// Consistent "couldn't load" state — was previously ~50 near-identical plain-text <p>
// tags copy-pasted across every list/grid on the site. retryFn, when given, must be the
// name of a globally-accessible function (all the load*() functions here are declared
// with `function`, not a local const, so they're callable by name) — call refreshIcons()
// after inserting this into the DOM so the icon actually renders.
function errorStateHtml(message, retryFn) {
  return `
    <div class="empty-state" style="padding:20px; text-align:center;">
      <i data-lucide="alert-triangle" class="icon-md" style="color:var(--blood-dim); margin-bottom:6px;"></i>
      <p class="muted" style="margin:0 0 ${retryFn ? '10px' : '0'};">${escapeHtml(message)}</p>
      ${retryFn ? `<button type="button" class="btn btn-ghost btn-sm" onclick="${retryFn}"><i data-lucide="refresh-cw" class="icon-sm icon-inline"></i>Retry</button>` : ''}
    </div>
  `;
}

// Escapes quotes too, so it is safe inside attribute values (title="...", data-x="...", href="...").
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

// For user-supplied image/background URLs placed in src="", href="" or CSS url('') contexts:
// http(s) only (see safeUrl) AND quote/paren/whitespace characters percent-encoded, because
// escapeHtml() does not escape quotes and a stray ' or " would let a URL break out of the
// attribute or CSS string. Returns '' for anything unusable.
function safeImgUrl(raw) {
  const u = safeUrl(raw);
  if (u === '#') return '';
  return u.replace(/['"()<>`\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
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

// Lucide icons only render for elements present in the DOM when lucide.createIcons() runs
// (nav.js calls it once on page load) — anything injected afterward via innerHTML (chat
// messages, challenge cards, admin rows, etc.) needs this called again. Every place in this
// codebase that writes HTML containing a <i data-lucide="..."> tag calls this right after.
// Shared across trading/sea-events — a quick reason prompt is enough for an MVP report flow;
// staff review the actual content on the /admin/reports/ page before acting on it.
var REPORT_REASONS = ['Scam / fraud', 'Inappropriate content', 'Spam or ads', 'Harassment', 'Other'];

var VIDEO_PLATFORM_HOSTS = ['youtube.com', 'youtu.be', 'streamable.com', 'medal.tv', 'twitch.tv', 'clips.twitch.tv', 'vimeo.com', 'tiktok.com', 'drive.google.com'];
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
    logError('Icon render failed:', e);
  }
}

// A player's chosen display name if set, otherwise their (unique, unchangeable) username.
function displayNameFor(profile) {
  return profile?.display_name || profile?.username || 'Unknown';
}

// A poster who's both brand new (<72h old) and has zero vouches either way is exactly
// the profile scam listings tend to have — flag it inline so buyers/sellers notice
// before they DM someone with no track record at all.
var NEW_ACCOUNT_WINDOW_MS = 72 * 60 * 60 * 1000;

// Shared circular avatar renderer. Discord CDN avatar URLs can go stale when a user changes
// their pfp (the old hash 404s), which otherwise shows the browser's broken-image icon —
// onerror swaps it for an initials placeholder instead, site-wide, from one place.
// Admin-managed avatar frames (avatar_frames table) — replaces the old hardcoded
// 6-preset CSS-ring system. Frames are images now, uploaded/gated by level in
// /admin/manage/, so this fetches the catalog once per page load and caches it:
// avatarHtml() needs synchronous access (it's called inline in dozens of template
// literals throughout the site), and a small, rarely-changing table is safe to
// front with a plain module-level cache rather than threading an async fetch
// through every single caller.
var _avatarFrames = {};
var _avatarFramesList = [];
var _avatarFramesLoaded = (async () => {
  try {
    const { data, error } = await sb.from('avatar_frames').select('id, key, name, image_url, min_level, exclusive').order('sort_order', { ascending: true });
    if (error) throw error;
    _avatarFramesList = data || [];
    _avatarFramesList.forEach(f => { _avatarFrames[f.key] = f; });
  } catch (e) {
    // Network-level failure (not just a query error, which the branch above already
    // handles) — never let this promise reject. A rejected promise here would be
    // cached forever and break every future getAvatarFramesCatalog() caller on this
    // page load, not just avatar frames, so fail soft: no frames render, nothing else breaks.
    logError('Failed to load avatar frames catalog:', e);
  }
  return _avatarFramesList;
})();
// For pickers (profile-edit) that want the full catalog, not just a sync lookup —
// awaits the same fetch above rather than firing a second query.
async function getAvatarFramesCatalog() {
  return _avatarFramesLoaded;
}

// Initials avatar background: a stable colour per name, so a missing/stale profile picture still looks
// intentional (and different people are easy to tell apart) instead of being a grey circle.
var _AVATAR_HUES = [262, 199, 38, 160, 350, 221, 330, 172];
function avatarFallbackBg(name) {
  let h = 0;
  for (const ch of String(name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = _AVATAR_HUES[h % _AVATAR_HUES.length];
  return `linear-gradient(150deg, hsl(${hue} 68% 48%), hsl(${(hue + 40) % 360} 62% 28%))`;
}

function avatarHtml(profile, size, extraStyle = '', presence = null) {
  const name = displayNameFor(profile);
  const initial = escapeHtml((name[0] || '?').toUpperCase());
  const frame = _avatarFrames[profile?.avatar_frame];
  const ring = frame ? '' : `box-shadow:0 0 0 3px var(--ink), 0 0 0 4px rgb(var(--brass-rgb) / 0.5), 0 4px 18px rgb(var(--shadow-rgb) / 0.4);`;
  // When a frame is equipped, extraStyle (stacking margins etc.) moves to the wrapper
  // span below instead of the avatar element itself, since the frame overlay needs
  // that wrapper anyway. Behavior for the unframed/no-presence case is unchanged.
  const avatarExtra = (frame || presence) ? '' : extraStyle;
  const wrapExtra = (frame && !presence) ? extraStyle : '';

  const fallback = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${avatarFallbackBg(name)};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.4)}px;flex-shrink:0;color:#fff;text-shadow:0 1px 3px rgb(0 0 0 / 0.45);font-weight:700;font-family:var(--font-stamp);${ring}${avatarExtra}">${initial}</div>`;
  const avatarInner = (!profile?.avatar_url) ? fallback : (() => {
    const escapedFallback = fallback.replace(/"/g, '&quot;');
    return `<img src="${safeImgUrl(profile.avatar_url)}" alt="" loading="lazy" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;${ring}${avatarExtra}" onerror="this.onerror=null; if (this.parentNode) this.outerHTML='${escapedFallback}';">`;
  })();

  // Image-based frame: an oversized decorative PNG centered over the avatar,
  // Discord-style — needs a positioning wrapper since the frame art extends past
  // the avatar's own circular box.
  const inner = frame
    ? `<span style="position:relative; display:inline-flex; width:${size}px; height:${size}px; flex-shrink:0; ${wrapExtra}">${avatarInner}<img src="${safeImgUrl(frame.image_url)}" alt="" loading="lazy" style="position:absolute; top:50%; left:50%; width:${Math.round(size * 1.35)}px; height:${Math.round(size * 1.35)}px; transform:translate(-50%,-50%); pointer-events:none;"></span>`
    : avatarInner;

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

// Shared "how many pirates are online right now" count — used by the homepage hero
// and the nav drawer. Matches the same 5-minute window presenceStatus() uses for a
// single profile's dot, just counted across the whole table.
async function getOnlineCount() {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).gte('last_active_at', since);
  return count || 0;
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
var CHAT_NAME_COLOR_PALETTE = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee',
  '#60a5fa', '#a78bfa', '#e879f9', '#f472b6', '#fb7185', '#2dd4bf',
];

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
var SOCIAL_ICONS = {
  roblox: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5.5 3 3 18.5 18.5 21 21 5.5 5.5 3zm7.9 6.1 1.5 5.8-5.8 1.5-1.5-5.8 5.8-1.5z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="1" y="5" width="22" height="14" rx="4"/><path d="M10 8.5v7l6-3.5z" fill="var(--ink)"/></svg>',
  twitch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 2 2 6v14h6v2h3l2-2h4l4-4V2H4zm14 12-3 3h-4l-2 2v-2H6V4h12v10z"/><rect x="9" y="7" width="2" height="5" fill="var(--ink)"/><rect x="14" y="7" width="2" height="5" fill="var(--ink)"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4l7 8.5L4.5 20H7l5-5.5L16 20h4l-7.5-9L19.5 4H17l-4.5 5L8 4z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 2h3c.2 2 1.6 3.6 4 3.9V9c-1.5 0-2.9-.4-4-1.2V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.2a2.8 2.8 0 1 0 2 2.7z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5C6 6 4.5 6.8 4.5 6.8S3 9.5 3 15c0 0 1.4 2.2 5 2.3l.8-1.2c-1.4-.4-2.2-1-2.2-1s.2.1.5.3c0 0 1.6 1 5.4 1s5.4-1 5.4-1l.5-.3s-.8.6-2.2 1l.8 1.2c3.6-.1 5-2.3 5-2.3 0-5.5-1.5-8.2-1.5-8.2S17.5 5.8 16 5.5l-.5 1c-.8-.2-1.7-.3-2.5-.3s-1.7.1-2.5.3l-.5-1zM9.3 11c.7 0 1.3.7 1.3 1.5S10 14 9.3 14s-1.3-.7-1.3-1.5S8.6 11 9.3 11zm5.4 0c.7 0 1.3.7 1.3 1.5s-.6 1.5-1.3 1.5-1.3-.7-1.3-1.5.6-1.5 1.3-1.5z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  kick: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 3h5v5.5l4.5-5.5H19l-6 7 6.5 8.5h-5.8L9 12.5V18H4z"/></svg>',
};

// A notification's meta.actions row: Discord/Roblox profile links render as small
// icon-only buttons (the platform is obvious from the glyph, no need for a long "HOST
// DISCORD: username" text pill) — anything else (e.g. a link to someone's BloxCore
// profile) keeps its text label, since there's no icon that would make sense there.
// Shared between the header dropdown (nav.js) and the /notifications/ page.
function renderNotifActions(n) {
  if (!n.meta?.actions?.length) return '';
  return `<span class="notif-actions">${n.meta.actions.map(a => {
    const url = a.url || '';
    const isDiscord = url.includes('discord.com/');
    const isRoblox = url.includes('roblox.com/');
    if (isDiscord || isRoblox) {
      return `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer" class="notif-action-icon-btn" data-notif-action-id="${n.id}" title="${escapeHtml(a.label)}" aria-label="${escapeHtml(a.label)}">${isDiscord ? SOCIAL_ICONS.discord : SOCIAL_ICONS.roblox}</a>`;
    }
    return `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" data-notif-action-id="${n.id}">${escapeHtml(a.label)}</a>`;
  }).join('')}</span>`;
}

// Resolve the current session + profile row together. Returns { user, profile } or nulls.
// Memoized per page load: nav.js and every page's own requireAuth() call both need this,
// and were previously firing two separate profiles queries on every authenticated page —
// this caches the in-flight/resolved promise so the second caller reuses the first fetch
// instead of re-querying. Deliberately not time-based (no TTL) — a page load is short-lived
// enough that the profile isn't expected to change under it.
var _profileFetchPromise = null;
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
    window._bcCurrentUserId = session.user.id;
    const { data: profile, error } = await sb
      .from('profiles')
      .select('*, titles(name, color)')
      .eq('id', session.user.id)
      .single();
    if (error) {
      logError('Failed to load profile', error);
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
  const cur = profile?.avatar_url || '';
  const prefix = `/avatars/${user.id}/`;
  const isHosted = cur.includes('/storage/v1/object/public' + prefix);
  const isMirror = isHosted && cur.includes(prefix + 'discord-');
  // A manually uploaded avatar (hosted by us, not a Discord mirror) is never overwritten.
  if (isHosted && !isMirror) return;

  // Hotlinked Discord CDN URLs are what go stale/break, so migrate those immediately (no throttle).
  const needsMigration = /cdn\.discordapp\.com|discord\.com\/embed/.test(cur);
  const key = 'bc_avatar_sync_' + user.id;
  const last = Number(localStorage.getItem(key) || 0);
  if (!needsMigration && Date.now() - last < 5 * 60 * 1000) return;
  localStorage.setItem(key, String(Date.now()));

  const { data: { user: freshUser } } = await sb.auth.getUser();
  const discordIdentity = freshUser?.identities?.find(i => i.provider === 'discord');
  if (!discordIdentity && !needsMigration) return;
  const idData = discordIdentity?.identity_data || freshUser?.user_metadata || {};
  const discordId = idData.provider_id || idData.sub;
  let src = idData.avatar_url || idData.picture;
  if (!src && idData.avatar && discordId) src = `https://cdn.discordapp.com/avatars/${discordId}/${idData.avatar}.png`;
  if (!src) return;

  // Stable name derived from Discord's avatar hash: same pfp => same file, new pfp => new file.
  const m = src.match(/\/avatars\/\d+\/([a-z0-9_]+)\.\w+/i);
  const hash = m ? m[1] : (src.match(/\/avatars\/(\d+)\.\w+/i)?.[1] ? 'default' + src.match(/\/avatars\/(\d+)\.\w+/i)[1] : null);
  if (!hash) return;
  if (isMirror && cur.includes(`discord-${hash}.`)) return;

  const animated = hash.startsWith('a_');
  const base = m ? `https://cdn.discordapp.com/avatars/${discordId}/${hash}` : src.replace(/\.\w+(\?.*)?$/, '');
  const candidates = m ? (animated ? [`${base}.gif?size=512`, `${base}.png?size=512`] : [`${base}.png?size=512`]) : [`${base}.png`];

  let blob = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const b = await res.blob();
      if (b.size && b.size <= 5 * 1024 * 1024 && /^image\/(png|gif|webp|jpeg)$/.test(b.type)) { blob = b; break; }
    } catch (e) { /* try next */ }
  }
  if (!blob) return;

  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1];
  const path = `${user.id}/discord-${hash}.${ext}`;
  const { error: upErr } = await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type });
  if (upErr && !/exist|duplicate|409/i.test(upErr.message + (upErr.statusCode || ''))) return;

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
  const { error } = await sb.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', user.id);
  if (!error) profile.avatar_url = urlData.publicUrl;
}

// Downscales + recompresses an image file before upload — avatars/banners already get
// this via the crop tool's own canvas export, but crew logos, chat images, and proof
// screenshots (challenges/pvp/giveaways, via uploadScreenshot() below) previously
// uploaded the raw file straight through, letting a full-res phone photo or screenshot
// bloat storage and slow every page that has to load it back down. Falls back to the
// original file untouched on any failure (unsupported type, canvas error, etc.) or if
// the file is already small enough that compressing it wouldn't help — never blocks
// an upload over this.
async function compressImage(file, { maxDimension = 1600, quality = 0.85 } = {}) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size < 150 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) { bitmap.close?.(); return file; }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (e) {
    logError('Image compression failed, uploading original:', e);
    return file;
  }
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

var _siteSettingsCache = null;

async function getSiteSettings() {
  if (_siteSettingsCache) return _siteSettingsCache;
  // A network-level failure here (not just a query error) must never reject — 5+ pages
  // call this before wiring up their own event listeners, so a rejection would abort
  // each of those pages' entire init sequence rather than just this one lookup. Fall
  // back to defaults on failure; the page still works, just without custom site config.
  let data = null;
  try {
    ({ data } = await sb.from('site_settings').select('key, value'));
  } catch (e) {
    logError('Failed to load site settings, using defaults:', e);
  }
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
    minGiveawayTitleLength: map.min_giveaway_title_length ?? 5,
    minGiveawayDescriptionLength: map.min_giveaway_description_length ?? 15,
    minComboInstructionsLength: map.min_combo_instructions_length ?? 10,
    maxCrewNameLength: map.max_crew_name_length ?? 30,
    maxCrewDescriptionLength: map.max_crew_description_length ?? 200,
    maxServiceTitleLength: map.max_service_title_length ?? 60,
    maxServiceDescriptionLength: map.max_service_description_length ?? 300,
    maxComboTitleLength: map.max_combo_title_length ?? 60,
    maxComboDescriptionLength: map.max_combo_description_length ?? 150,
    maxComboInstructionsLength: map.max_combo_instructions_length ?? 800,
    maxSeaEventNoteLength: map.max_sea_event_note_length ?? 300,
    maxGiveawayTitleLength: map.max_giveaway_title_length ?? 60,
    maxGiveawayDescriptionLength: map.max_giveaway_description_length ?? 500,
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
      logError('Unhandled error during page init:', e);
      if (typeof showToast === 'function') {
        showToast('Something went wrong loading this page. Try refreshing.', true);
      }
    }
  });
}

// ---- Roblox OAuth connect (used by /profile/ and /roblox-callback/) ----

var ROBLOX_OAUTH_CLIENT_ID = '3264730958979795688';

// ---- Keyboard accessibility for .build-modal-tile picker grids -------------------------
// This class is used site-wide (trading/services item pickers, giveaway prize pickers,
// profile build pickers, combo pickers, title pickers — 6+ files) as a clickable <div>
// "tile" with no tabindex/role, which made every one of those grids mouse-only. Rather
// than touch each render call site individually, a single MutationObserver here patches
// any tile as soon as it appears in the DOM, so this fixes all current and future picker
// grids at once.
function makeTileKeyboardAccessible(tile) {
  if (tile.hasAttribute('tabindex')) return;
  tile.setAttribute('tabindex', '0');
  if (!tile.hasAttribute('role')) tile.setAttribute('role', 'button');
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tile.click();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.build-modal-tile').forEach(makeTileKeyboardAccessible);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('.build-modal-tile')) makeTileKeyboardAccessible(node);
        node.querySelectorAll?.('.build-modal-tile').forEach(makeTileKeyboardAccessible);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
});

// ---- Focus management for [role="dialog"] modals ----------------------------------------
// Modals across the site (15+ files) already carry correct role="dialog" aria-modal="true"
// markup, but none of them ever moved focus into the dialog on open or restored it on
// close — a keyboard or screen-reader user had no way to know a modal had opened, and
// tabbing would silently continue through the page behind it. Centralized here (same
// MutationObserver technique as the picker-tile fix above) rather than touching every
// individual openXModal()/closeXModal() function across the codebase.
function isDialogVisible(el) {
  return getComputedStyle(el).display !== 'none';
}

var _lastFocusedBeforeDialog = null;

function handleDialogOpened(dialog) {
  _lastFocusedBeforeDialog = document.activeElement;
  const focusable = dialog.querySelector('input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])');
  if (focusable) {
    focusable.focus();
  } else {
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    dialog.focus();
  }
}

function handleDialogClosed() {
  if (_lastFocusedBeforeDialog && document.body.contains(_lastFocusedBeforeDialog)) {
    _lastFocusedBeforeDialog.focus();
  }
  _lastFocusedBeforeDialog = null;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[role="dialog"]').forEach(dialog => {
    let wasVisible = isDialogVisible(dialog);
    new MutationObserver(() => {
      const nowVisible = isDialogVisible(dialog);
      if (nowVisible === wasVisible) return;
      wasVisible = nowVisible;
      if (nowVisible) handleDialogOpened(dialog); else handleDialogClosed();
    }).observe(dialog, { attributes: true, attributeFilter: ['style', 'class'] });
  });
});

// Daily login streak — claims once per UTC calendar day. Guarded client-side with
// localStorage first so a logged-in user browsing multiple pages in one day doesn't
// fire the RPC on every single page load; the RPC itself is also safely idempotent
// same-day if the guard ever gets out of sync (new device, cleared storage, etc.).
async function claimDailyLoginIfNeeded() {
  try {
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('bc_login_streak_date') === todayUtc) return null;

    const { data, error } = await sb.rpc('claim_daily_login');
    if (error) { logError('claim_daily_login failed:', error); return null; }
    localStorage.setItem('bc_login_streak_date', todayUtc);

    const row = data?.[0];
    window.dispatchEvent(new CustomEvent('bc:login-claimed', { detail: row || null }));
    if (row && !row.already_claimed && row.xp_awarded > 0) {
      showToast(`Day ${row.streak} login streak — +${row.xp_awarded} XP!`);
    }
    return row || null;
  } catch (e) {
    logError('claimDailyLoginIfNeeded failed:', e);
    return null;
  }
}

// --- Performance: keep Lucide + the ad network off the critical path -------------------------------
// Lucide is loaded with `defer` on every page, so it executes after parsing but before DOMContentLoaded.
// Anything that calls refreshIcons() earlier safely no-ops (see its window.lucide guard) — this renders
// the icons that were in the HTML as soon as the library is ready.
document.addEventListener('DOMContentLoaded', () => refreshIcons());

// The ad script is injected after the page has fully loaded and the browser is idle, instead of being a
// <script async> in the middle of the page that competes with first paint / LCP.
(function loadAdAfterPaint() {
  const ID = '1dd0069cb22b02f6884ad8e7e72afcb2';
  const inject = () => {
    const container = document.getElementById(`container-${ID}`);
    if (!container || document.querySelector('script[data-bc-ad]')) return;
    const s = document.createElement('script');
    s.async = true;
    s.setAttribute('data-cfasync', 'false');
    s.dataset.bcAd = '1';
    s.src = `https://pl31528379.profitableratecpmnetwork.com/${ID}/invoke.js`;
    container.parentNode.insertBefore(s, container);
  };
  const schedule = () => ('requestIdleCallback' in window ? requestIdleCallback(inject, { timeout: 4000 }) : setTimeout(inject, 2000));
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();

// ---- Live visitors + visit counts (feeds /admin/overview/) ----------------------------------------
// Anonymous random id in localStorage, pageview on load + a heartbeat every 45 s while the tab is visible.
// No IP, no query string. Skipped for /admin, bots, webdrivers and Do-Not-Track.
(function trackVisit() {
  try {
    const path = location.pathname;
    if (path.startsWith('/admin') || navigator.webdriver || navigator.doNotTrack === '1') return;
    if (/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i.test(navigator.userAgent)) return;
    let vid = localStorage.getItem('bc_vid');
    if (!vid || !/^[0-9a-f-]{36}$/i.test(vid)) {
      vid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
      localStorage.setItem('bc_vid', vid);
    }
    const send = (fn) => sb.rpc(fn, { p_visitor: vid, p_path: path }).then(() => {}, () => {});
    const start = () => {
      send('track_pageview');
      setInterval(() => { if (!document.hidden) send('track_heartbeat'); }, 45000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) send('track_heartbeat'); });
    };
    if (document.hidden) document.addEventListener('visibilitychange', function once() { if (document.hidden) return; document.removeEventListener('visibilitychange', once); start(); });
    else start();
  } catch (e) { /* tracking must never break a page */ }
})();
