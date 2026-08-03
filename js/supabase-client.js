// BloxCore — Supabase client
// Loaded as a plain <script> (via CDN UMD build) on every page, before other /js files.

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';

// `supabase` global comes from the CDN script tag included in each HTML page.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RANK_THRESHOLDS = [
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

// Shared circular avatar renderer. Discord CDN avatar URLs can go stale when a user changes
// their pfp (the old hash 404s), which otherwise shows the browser's broken-image icon —
// onerror swaps it for an initials placeholder instead, site-wide, from one place.
function avatarHtml(profile, size, extraStyle = '') {
  const name = displayNameFor(profile);
  const initial = escapeHtml((name[0] || '?').toUpperCase());
  const ring = `box-shadow:0 0 0 3px var(--ink), 0 0 0 4px rgb(var(--brass-rgb) / 0.5), 0 4px 18px rgb(var(--shadow-rgb) / 0.4);`;
  const fallback = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(150deg, var(--navy-light), var(--navy));display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.4)}px;flex-shrink:0;color:var(--ash);font-family:var(--font-stamp);${ring}${extraStyle}">${initial}</div>`;
  if (!profile?.avatar_url) return fallback;
  const escapedFallback = fallback.replace(/"/g, '&quot;');
  return `<img src="${profile.avatar_url}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;${ring}${extraStyle}" onerror="this.outerHTML='${escapedFallback}';">`;
}

// Renders a small colored title badge if the profile has an active title equipped
// (expects the query to have joined titles(name, color) via active_title_id).
function titleBadge(profile) {
  if (!profile?.titles?.name) return '';
  const c = profile.titles.color;
  return ` <span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:3px 10px; border-radius:999px; border:1px solid ${c}; color:${c}; background:${c}1a;">${escapeHtml(profile.titles.name)}</span>`;
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

// Simple, generic glyphs for each platform (not pixel-exact brand logos) — used instead
// of plain text labels on social links.
const SOCIAL_ICONS = {
  youtube: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="1" y="5" width="22" height="14" rx="4"/><path d="M10 8.5v7l6-3.5z" fill="var(--ink)"/></svg>',
  twitch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 2 2 6v14h6v2h3l2-2h4l4-4V2H4zm14 12-3 3h-4l-2 2v-2H6V4h12v10z"/><rect x="9" y="7" width="2" height="5" fill="var(--ink)"/><rect x="14" y="7" width="2" height="5" fill="var(--ink)"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4l7 8.5L4.5 20H7l5-5.5L16 20h4l-7.5-9L19.5 4H17l-4.5 5L8 4z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 2h3c.2 2 1.6 3.6 4 3.9V9c-1.5 0-2.9-.4-4-1.2V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.2a2.8 2.8 0 1 0 2 2.7z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5C6 6 4.5 6.8 4.5 6.8S3 9.5 3 15c0 0 1.4 2.2 5 2.3l.8-1.2c-1.4-.4-2.2-1-2.2-1s.2.1.5.3c0 0 1.6 1 5.4 1s5.4-1 5.4-1l.5-.3s-.8.6-2.2 1l.8 1.2c3.6-.1 5-2.3 5-2.3 0-5.5-1.5-8.2-1.5-8.2S17.5 5.8 16 5.5l-.5 1c-.8-.2-1.7-.3-2.5-.3s-1.7.1-2.5.3l-.5-1zM9.3 11c.7 0 1.3.7 1.3 1.5S10 14 9.3 14s-1.3-.7-1.3-1.5S8.6 11 9.3 11zm5.4 0c.7 0 1.3.7 1.3 1.5s-.6 1.5-1.3 1.5-1.3-.7-1.3-1.5.6-1.5 1.3-1.5z"/></svg>',
};

// Resolve the current session + profile row together. Returns { user, profile } or nulls.
async function getCurrentProfile() {
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
  if (profile?.banned) {
    const reason = profile.banned_reason ? ` Reason given: "${profile.banned_reason}"` : '';
    await sb.auth.signOut();
    alert(`Your account has been banned.${reason}`);
    window.location.href = '/';
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
