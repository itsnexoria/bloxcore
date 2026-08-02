// BloxCore — index.html activity feed

const ACTIVITY_LIMIT = 15;

document.addEventListener('DOMContentLoaded', async () => {
  await loadActivity();
  subscribeToActivity();
  initHeroPosterRotation();
});

async function initHeroPosterRotation() {
  const poster = document.getElementById('hero-poster');
  if (!poster) return;

  const { data, error } = await sb
    .from('challenges')
    .select('title, description, xp_reward, difficulty')
    .eq('active', true)
    .or('rotation.eq.none,currently_featured.eq.true')
    .limit(20);

  if (error || !data || !data.length) return;

  // Shuffle so it doesn't cycle in the same DB order every page load
  const pool = data.sort(() => Math.random() - 0.5);
  let index = 0;
  showHeroChallenge(pool[index]);

  setInterval(() => {
    index = (index + 1) % pool.length;
    poster.style.opacity = '0';
    setTimeout(() => {
      showHeroChallenge(pool[index]);
      poster.style.opacity = '1';
    }, 400);
  }, 12000);
}

function showHeroChallenge(c) {
  document.getElementById('hero-poster-title').textContent = c.title;
  document.getElementById('hero-poster-body').textContent = c.description;
  document.getElementById('hero-poster-reward').textContent = `+${c.xp_reward} XP`;
  const tag = document.getElementById('hero-poster-tag');
  tag.className = `tag tag-${c.difficulty}`;
  tag.textContent = c.difficulty;
}

async function loadActivity() {
  const feed = document.getElementById('activity-feed');

  const { data, error } = await sb
    .from('activity_log')
    .select('id, user_id, username, type, detail, xp_awarded, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    feed.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load recent activity right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    feed.innerHTML = `<div class="empty-state">No activity yet — be the first to claim a bounty.</div>`;
    return;
  }

  feed.innerHTML = data.map((a, i) => renderActivityRow(withDisplayName(a), i === data.length - 1)).join('');
  refreshIcons();
}

function withDisplayName(a) {
  return { ...a, displayName: a.profiles?.display_name || a.username };
}

function renderActivityRow(a, isLast) {
  const icon = a.type === 'rank_up'
    ? '<i data-lucide="star" class="icon-md" style="color:var(--brass-bright);"></i>'
    : '<i data-lucide="check-circle" class="icon-md" style="color:var(--sea);"></i>';
  const text = a.type === 'rank_up'
    ? `ranked up to <span style="color:var(--brass-bright);">${escapeHtml(a.detail)}</span>`
    : `completed <span style="color:var(--brass-bright);">${escapeHtml(a.detail)}</span>${a.xp_awarded ? ` · +${a.xp_awarded} XP` : ''}`;

  return `
    <div class="flex-between" data-activity-id="${a.id}" style="padding:14px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        <span style="font-size:1.1rem;">${icon}</span>
        <p style="margin:0; font-size:0.9rem;">
          <a href="/player/?u=${encodeURIComponent(a.username)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(a.displayName)}</a>
          ${text}
        </p>
      </div>
      <span class="muted" style="font-size:0.78rem; flex-shrink:0; font-family:var(--font-mono);">${timeAgo(a.created_at)}</span>
    </div>
  `;
}

function subscribeToActivity() {
  const dot = document.getElementById('activity-live-dot');

  sb.channel('public:activity_log')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, async (payload) => {
      const { data: profile } = await sb.from('profiles').select('display_name').eq('id', payload.new.user_id).single();
      prependActivity({ ...payload.new, displayName: profile?.display_name || payload.new.username });
      if (dot) {
        dot.style.transform = 'scale(1.6)';
        setTimeout(() => { dot.style.transform = 'scale(1)'; }, 300);
      }
    })
    .subscribe();
}

function prependActivity(a) {
  const feed = document.getElementById('activity-feed');
  if (feed.querySelector('.empty-state') || feed.querySelector('.skeleton')) {
    feed.innerHTML = '';
  }

  const rows = feed.querySelectorAll('[data-activity-id]');
  rows.forEach((row, i) => {
    if (i === rows.length - 1) row.style.borderBottom = '1px solid var(--navy-light)';
  });

  feed.insertAdjacentHTML('afterbegin', renderActivityRow(a, false));
  refreshIcons();

  // Trim to the display limit
  const all = feed.querySelectorAll('[data-activity-id]');
  if (all.length > ACTIVITY_LIMIT) {
    for (let i = ACTIVITY_LIMIT; i < all.length; i++) all[i].remove();
  }
  const remaining = feed.querySelectorAll('[data-activity-id]');
  if (remaining.length) remaining[remaining.length - 1].style.borderBottom = 'none';
}
