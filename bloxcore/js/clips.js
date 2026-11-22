// BloxCore — /clips/ : submit a clip, vote weekly, Clip of the Week hall of fame.
// DB: clips (links validated to YouTube/Medal/Streamable/Twitch by a trigger), clip_votes, clip_winners,
// get_clips / toggle_clip_vote / get_clip_hall RPCs; a cron job picks the winner every Monday 00:10 UTC.

let clipsScope = 'week';
let clipsViewer = null;
let clipsViewerIsStaff = false;

const CLIP_PLATFORM = {
  youtube: { label: 'YouTube', icon: 'youtube' },
  medal: { label: 'Medal', icon: 'clapperboard' },
  streamable: { label: 'Streamable', icon: 'play-circle' },
  twitch: { label: 'Twitch', icon: 'twitch' },
};

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  clipsViewer = user;
  clipsViewerIsStaff = profile?.role === 'admin' || profile?.role === 'mod';
  document.getElementById('clip-submit-wrap').style.display = user ? '' : 'none';
  document.getElementById('clip-signin-hint').style.display = user ? 'none' : '';

  document.getElementById('clip-form').addEventListener('submit', submitClip);
  document.querySelectorAll('[data-clip-scope]').forEach(b => b.addEventListener('click', () => {
    clipsScope = b.dataset.clipScope;
    document.querySelectorAll('[data-clip-scope]').forEach(x => { x.classList.toggle('btn-primary', x === b); x.classList.toggle('btn-ghost', x !== b); });
    loadClips();
  }));
  updateWeekCountdown();
  setInterval(updateWeekCountdown, 60000);
  await Promise.all([loadHall(), loadClips()]);
});

function updateWeekCountdown() {
  const now = new Date();
  const day = now.getUTCDay() || 7; // Mon=1..Sun=7
  const nextMon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day));
  const ms = nextMon - now.getTime();
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  const el = document.getElementById('clip-countdown');
  if (el) el.textContent = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function clipThumbHtml(c) {
  const p = CLIP_PLATFORM[c.platform] || CLIP_PLATFORM.youtube;
  if (c.platform === 'youtube') {
    return `<button type="button" class="clip-thumb" data-clip-play="${c.id}" style="background-image:url('https://i.ytimg.com/vi/${encodeURIComponent(c.video_id)}/hqdefault.jpg');" aria-label="Play ${escapeHtml(c.title)}">
      <span class="clip-play"><i data-lucide="play" class="icon-lg"></i></span></button>`;
  }
  return `<a class="clip-thumb clip-thumb-ext" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="Watch ${escapeHtml(c.title)} on ${p.label}">
    <span class="clip-play"><i data-lucide="${p.icon}" class="icon-lg"></i></span><span class="clip-ext-label">Watch on ${p.label}</span></a>`;
}

function clipCardHtml(c, rank) {
  const mine = clipsViewer && c.user_id === clipsViewer.id;
  const canVote = clipsViewer && !mine && clipsScope === 'week';
  return `
    <article class="panel clip-card${rank === 0 && c.votes > 0 && clipsScope === 'week' ? ' is-leading' : ''}" data-clip-id="${c.id}">
      ${clipThumbHtml(c)}
      <div class="clip-body">
        <h3 class="clip-title">${rank === 0 && c.votes > 0 && clipsScope === 'week' ? '<span class="tag tag-pinned" style="margin-right:6px;"><i data-lucide="crown" class="icon-sm icon-inline"></i>Leading</span>' : ''}${escapeHtml(c.title)}</h3>
        <div class="clip-meta">
          <a href="/player/?u=${encodeURIComponent(c.username)}" class="clip-author">${avatarHtml(c, 22)}<span>${escapeHtml(displayNameFor(c))}</span></a>
          <span class="muted">${timeAgo(c.created_at)}</span>
        </div>
        <div class="clip-actions">
          <button type="button" class="btn btn-sm ${c.voted ? 'btn-primary' : 'btn-ghost'}" data-clip-vote="${c.id}" ${canVote ? '' : 'disabled'} title="${mine ? 'You can\'t vote for your own clip' : clipsViewer ? (clipsScope === 'week' ? 'Vote' : 'Voting closed') : 'Sign in to vote'}">
            <i data-lucide="thumbs-up" class="icon-sm icon-inline"></i><span data-vote-count>${c.votes}</span>
          </button>
          ${mine ? `<button type="button" class="btn btn-ghost btn-sm" data-clip-delete="${c.id}" aria-label="Delete clip"><i data-lucide="trash-2" class="icon-sm"></i></button>` : ''}
          ${clipsViewerIsStaff && !mine ? `<button type="button" class="btn btn-ghost btn-sm" data-clip-remove="${c.id}" title="Remove (staff)" aria-label="Remove clip"><i data-lucide="shield-x" class="icon-sm"></i></button>` : ''}
        </div>
      </div>
    </article>`;
}

async function loadClips() {
  const grid = document.getElementById('clip-grid');
  grid.innerHTML = '<div class="skeleton" style="height:260px;"></div>'.repeat(3);
  const { data, error } = await sb.rpc('get_clips', { p_scope: clipsScope });
  if (error) { logError('get_clips failed:', error); grid.innerHTML = '<div class="panel" style="padding:24px; grid-column:1/-1;"><p class="muted" style="margin:0;">Couldn\'t load clips.</p></div>'; return; }
  if (!data.length) {
    grid.innerHTML = `<div class="panel" style="padding:32px; text-align:center; grid-column:1/-1;"><p style="margin:0 0 4px; font-weight:700;">${clipsScope === 'week' ? 'No clips yet this week' : 'No clips yet'}</p><p class="muted" style="margin:0; font-size:0.85rem;">Be the first — post your best fight, combo or sea event moment.</p></div>`;
    return;
  }
  grid.innerHTML = data.map((c, i) => clipCardHtml(c, i)).join('');
  refreshIcons();
  wireClipActions(grid);
}

function wireClipActions(root) {
  root.querySelectorAll('[data-clip-play]').forEach(btn => btn.addEventListener('click', () => {
    const videoId = btn.style.backgroundImage.match(/vi\/([^/]+)\//)?.[1];
    if (!videoId) return;
    btn.outerHTML = `<div class="clip-embed"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="Clip"></iframe></div>`;
  }));
  root.querySelectorAll('[data-clip-vote]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    const { data, error } = await sb.rpc('toggle_clip_vote', { p_clip_id: btn.dataset.clipVote });
    if (error) { showToast(error.message, true); btn.disabled = false; return; }
    const countEl = btn.querySelector('[data-vote-count]');
    countEl.textContent = Math.max(0, Number(countEl.textContent) + (data ? 1 : -1));
    btn.classList.toggle('btn-primary', data);
    btn.classList.toggle('btn-ghost', !data);
    btn.disabled = false;
  }));
  root.querySelectorAll('[data-clip-delete]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete your clip?')) return;
    const { error } = await sb.from('clips').delete().eq('id', btn.dataset.clipDelete);
    if (error) { showToast(error.message, true); return; }
    showToast('Clip deleted.');
    loadClips();
  }));
  root.querySelectorAll('[data-clip-remove]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remove this clip from the site?')) return;
    const { error } = await sb.from('clips').update({ removed: true }).eq('id', btn.dataset.clipRemove);
    if (error) { showToast(error.message, true); return; }
    showToast('Clip removed.');
    loadClips();
  }));
}

async function submitClip(e) {
  e.preventDefault();
  const url = document.getElementById('clip-url').value.trim();
  const title = document.getElementById('clip-title').value.trim();
  const btn = document.getElementById('clip-submit');
  btn.disabled = true;
  // platform/video_id are placeholders — the validate_clip trigger derives the real values from the URL
  const { error } = await sb.from('clips').insert({ user_id: clipsViewer.id, url, title, platform: 'youtube', video_id: 'pending' });
  btn.disabled = false;
  if (error) { showToast(error.message, true); return; }
  showToast('Clip posted — good luck this week!');
  document.getElementById('clip-form').reset();
  loadClips();
}

async function loadHall() {
  const wrap = document.getElementById('clip-hall');
  const { data, error } = await sb.rpc('get_clip_hall');
  if (error || !data || !data.length) { wrap.style.display = 'none'; return; }
  const [latest, ...older] = data;
  wrap.style.display = '';
  document.getElementById('clip-hall-latest').innerHTML = `
    <div class="panel clip-winner">
      ${clipThumbHtml({ ...latest, id: 'winner', title: latest.title })}
      <div class="clip-body">
        <span class="tag tag-pinned"><i data-lucide="trophy" class="icon-sm icon-inline"></i>Clip of the Week</span>
        <h3 class="clip-title" style="margin-top:8px;">${escapeHtml(latest.title)}</h3>
        <div class="clip-meta"><a href="/player/?u=${encodeURIComponent(latest.username)}" class="clip-author">${avatarHtml(latest, 22)}<span>${escapeHtml(latest.display_name || latest.username)}</span></a><span class="muted">${latest.votes} vote${latest.votes === 1 ? '' : 's'}</span></div>
      </div>
    </div>`;
  document.getElementById('clip-hall-older').innerHTML = older.map(w => `
    <a class="vc-chip" href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer nofollow" style="--vc-color:var(--brass-bright);"><i data-lucide="trophy" class="icon-sm icon-inline"></i>${escapeHtml(w.title)} <span class="muted">— ${escapeHtml(w.display_name || w.username)}</span></a>`).join('');
  refreshIcons();
  const winnerThumb = wrap.querySelector('[data-clip-play]');
  if (winnerThumb) wireClipActions(wrap);
}
