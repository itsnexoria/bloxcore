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
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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

async function requireAdmin() {
  const result = await requireAuth();
  if (!result) return null;
  if (!result.profile || !result.profile.is_admin) {
    window.location.href = '/dashboard/';
    return null;
  }
  return result;
}
