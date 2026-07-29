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
  // matches the DB rule: level = floor(xp / 100) + 1
  return (level - 1) * 100;
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

// A player's chosen display name if set, otherwise their (unique, unchangeable) username.
function displayNameFor(profile) {
  return profile?.display_name || profile?.username || 'Unknown';
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
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) {
    console.error('Failed to load profile', error);
    return { user: session.user, profile: null };
  }
  return { user: session.user, profile };
}

// Redirect helpers used by pages that require (or forbid) auth
async function requireAuth() {
  const { user, profile } = await getCurrentProfile();
  if (!user) {
    window.location.href = '/auth/';
    return null;
  }
  return { user, profile };
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
