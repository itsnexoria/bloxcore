// BloxCore — challenges.html logic

let currentUser = null;
let activeChallengeId = null;
let completionMap = new Map();
let pendingChallengeIds = new Set();
const MAX_SCREENSHOTS = 5;
const MAX_SCREENSHOT_MB = 8;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
let selectedFiles = [];

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    const [{ data: completions }, { data: pending }] = await Promise.all([
      sb.from('completions').select('challenge_id, completed_at').eq('user_id', currentUser.id),
      sb.from('submissions').select('challenge_id').eq('user_id', currentUser.id).eq('status', 'pending'),
    ]);
    completionMap = new Map((completions || []).map(c => [c.challenge_id, c.completed_at]));
    pendingChallengeIds = new Set((pending || []).map(s => s.challenge_id));
  }

  try {
    await loadChallenges();
  } catch (e) {
    logError('Failed to load challenges:', e);
  }
  initDropzone();

  document.getElementById('difficulty-filter').addEventListener('change', loadChallenges);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('submit-form').addEventListener('submit', handleSubmit);
});

async function loadChallenges() {
  const grid = document.getElementById('challenges-grid');
  const difficulty = document.getElementById('difficulty-filter').value;

  let query = sb
    .from('challenges')
    .select('*')
    .eq('active', true)
    .or('rotation.eq.none,currently_featured.eq.true')
    .order('xp_reward', { ascending: true });
  if (difficulty) query = query.eq('difficulty', difficulty);

  const { data, error } = await query;

  if (error) {
    grid.innerHTML = errorStateHtml("Couldn't load quests right now.", 'loadChallenges()');
    refreshIcons();
    logError(error);
    return;
  }

  if (!data.length) {
    grid.innerHTML = `<div class="empty-state">No quests match that filter yet.</div>`;
    return;
  }

  const sections = [
    { key: 'daily', label: 'Daily Bounties', hint: 'Resets every day' },
    { key: 'weekly', label: 'Weekly Bounties', hint: 'Resets every Monday' },
    { key: 'monthly', label: 'Monthly Bounties', hint: 'Resets on the 1st' },
    { key: 'none', label: 'Standing Bounties', hint: 'Always available' },
  ];

  const PERIOD_UNIT_FOR_KEY = { daily: 'day', weekly: 'week', monthly: 'month' };

  grid.innerHTML = sections.map(section => {
    const items = data.filter(c => c.rotation === section.key);
    if (!items.length) return '';
    const periodUnit = PERIOD_UNIT_FOR_KEY[section.key];
    return `
      <div class="bounty-section">
        <div class="flex-between" style="margin-bottom:16px;">
          <h2 style="font-size:1.15rem; margin:0;">${section.label}</h2>
          <span class="muted" style="font-size:0.8rem; font-family:var(--font-mono); text-align:right;">
            ${section.hint}${section.key !== 'none' ? `<br><span data-countdown="${section.key}" style="color:var(--brass-bright); font-weight:700;"></span>` : ''}
          </span>
        </div>
        <div class="grid">${items.map(renderChallengeCard).join('')}</div>
        ${periodUnit && currentUser ? renderPeriodCompletionFooter(items, periodUnit) : ''}
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-claim-id]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.claimId, btn.dataset.claimTitle));
  });
  refreshIcons();
  startResetCountdowns();
}

// A "how many of this period's bounties have you cleared" readout — there's no backend
// concept of a milestone/bonus reward for finishing all of them, so this only ever shows
// real completion counts, not an invented bonus. Works for daily, weekly, and monthly
// rotations alike (periodKey() already supported all three units; this just needed to stop
// being hardcoded to 'day').
const PERIOD_FOOTER_COPY = {
  day: { icon: 'skull', cadence: 'New bounties every day. Don\'t miss out!', noun: 'Bount' },
  week: { icon: 'flame', cadence: 'New bounties every Monday. Don\'t miss out!', noun: 'Bount' },
  month: { icon: 'crown', cadence: 'New bounties on the 1st. Don\'t miss out!', noun: 'Bount' },
};
// Beyond this many items, individual step-dots get too cramped to read (weekly/monthly
// pools can run larger than daily's), so fall back to a plain "X of Y done" line instead.
const PERIOD_FOOTER_STEP_DOT_LIMIT = 10;

function renderPeriodCompletionFooter(items, period) {
  const doneCount = items.filter(c => {
    const completedAt = completionMap.get(c.id);
    return completedAt && periodKey(new Date(completedAt), period) === periodKey(new Date(), period);
  }).length;
  const total = items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const copy = PERIOD_FOOTER_COPY[period] || PERIOD_FOOTER_COPY.day;

  const steps = total > PERIOD_FOOTER_STEP_DOT_LIMIT
    ? `<p class="muted" style="margin:0; font-size:0.78rem; text-align:center;">${doneCount} of ${total} completed</p>`
    : items.map((_, i) => {
      const n = i + 1;
      const done = n <= doneCount;
      return `
        <div class="quest-progress-step-wrap">
          <span class="quest-progress-step ${done ? 'done' : ''}">${done ? '<i data-lucide="check" style="width:13px;height:13px;"></i>' : n}</span>
          <span class="quest-progress-step-label">${n} ${copy.noun}${n === 1 ? 'y' : 'ies'}</span>
        </div>
      `;
    }).join('');

  return `
    <div class="quest-daily-footer">
      <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:220px;">
        <span class="quest-daily-footer-icon"><i data-lucide="${copy.icon}" class="icon-sm"></i></span>
        <div class="quest-daily-footer-text">
          <p>Complete bounties to earn XP and progress your legend.</p>
          <p class="muted">${copy.cadence}</p>
        </div>
      </div>
      <div class="quest-progress-wrap">
        <div class="quest-progress-line"><div class="quest-progress-line-fill" style="width:${pct}%;"></div></div>
        <div class="quest-progress-steps">${steps}</div>
      </div>
    </div>
  `;
}

function formatRemaining(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// No per-quest artwork exists in the data model, so the card's "hero" icon is inferred
// from a few keywords in the title/description instead — close enough to read as themed
// without needing a real image field admins would have to fill in for every quest.
const QUEST_ICON_RULES = [
  { icon: 'anchor', words: ['sea beast', 'sea', 'shark', 'ocean', 'fish'] },
  { icon: 'swords', words: ['raid', 'dungeon', 'boss', 'trial'] },
  { icon: 'crosshair', words: ['pvp', 'duel', 'kill', 'defeat player'] },
  { icon: 'crown', words: ['bounty', 'wanted level'] },
  { icon: 'circle-dollar-sign', words: ['beli', 'money', 'earn', 'cash'] },
  { icon: 'users', words: ['crew', 'team'] },
  { icon: 'gift', words: ['giveaway'] },
];
function questIconFor(c) {
  const text = `${c.title} ${c.description}`.toLowerCase();
  for (const rule of QUEST_ICON_RULES) {
    if (rule.words.some(w => text.includes(w))) return rule.icon;
  }
  return 'target';
}

function renderChallengeCard(c) {
  const completedAt = completionMap.get(c.id);
  const isPending = pendingChallengeIds.has(c.id);

  let isDone = false;
  let onCooldown = false;
  let cooldownLabel = '';

  if (completedAt) {
    if (c.rotation === 'daily' || c.rotation === 'weekly' || c.rotation === 'monthly') {
      // Resets once per calendar period rather than a rolling cooldown.
      const unit = c.rotation === 'daily' ? 'day' : c.rotation === 'weekly' ? 'week' : 'month';
      if (periodKey(new Date(completedAt), unit) === periodKey(new Date(), unit)) {
        onCooldown = true;
        cooldownLabel = c.rotation === 'daily' ? 'Resets tomorrow' : c.rotation === 'weekly' ? 'Resets next week' : 'Resets next month';
      }
    } else if (!c.repeatable) {
      isDone = true;
    } else if (c.cooldown_hours > 0) {
      const readyAt = new Date(completedAt).getTime() + c.cooldown_hours * 3600 * 1000;
      if (Date.now() < readyAt) {
        onCooldown = true;
        cooldownLabel = formatRemaining(readyAt - Date.now());
      }
    }
    // repeatable with cooldown_hours === 0 (PvP-style): no restriction, always resubmittable.
  }

  const actionHtml = isPending
    ? `<button class="quest-card-claim-btn" disabled><i data-lucide="clock" class="icon-sm"></i> Pending Review</button>`
    : isDone
    ? `<button class="quest-card-claim-btn" disabled><i data-lucide="check" class="icon-sm"></i> Completed</button>`
    : onCooldown
    ? `<button class="quest-card-claim-btn" disabled>${cooldownLabel}</button>`
    : `<button class="quest-card-claim-btn" data-claim-id="${c.id}" data-claim-title="${escapeHtml(c.title)}">Claim Bounty <i data-lucide="chevron-right" class="icon-sm"></i></button>`;

  return `
    <div class="quest-card ${isDone || onCooldown || isPending ? 'is-inactive' : ''}" data-difficulty="${c.difficulty}">
      <div class="quest-card-hero">
        <i data-lucide="${questIconFor(c)}" class="quest-card-hero-icon"></i>
        <span class="quest-card-wanted-pill"><i data-lucide="star" style="width:10px;height:10px;"></i> WANTED <i data-lucide="star" style="width:10px;height:10px;"></i></span>
        <span class="quest-card-badge"><i data-lucide="${questIconFor(c)}" class="icon-md"></i></span>
      </div>
      <div class="quest-card-body">
        <h3 class="quest-card-title">${escapeHtml(c.title)}</h3>
        <p class="quest-card-desc">${escapeHtml(c.description)}</p>
        <div class="quest-card-divider"></div>
        <p class="quest-card-reward-label">Reward</p>
        <p class="quest-card-reward-value">+${c.xp_reward} XP</p>
        <p class="quest-card-meta-row"><span class="quest-card-meta-dot"></span>${c.difficulty}</p>
        <p class="quest-card-meta-sub">${c.rotation !== 'none' ? `${c.rotation.charAt(0).toUpperCase()}${c.rotation.slice(1)} Quest` : c.repeatable ? `Repeatable${c.cooldown_hours > 0 ? ` · ${c.cooldown_hours}h cooldown` : ''}` : 'One-Time Quest'}</p>
        ${actionHtml}
      </div>
    </div>
  `;
}

// UTC-based period key so "once per day/week/month" resets on a calendar boundary,
// matching how the rest of the site's daily/weekly/monthly rotation already works.
function periodKey(date, unit) {
  if (unit === 'day') return date.toISOString().slice(0, 10);
  if (unit === 'month') return date.toISOString().slice(0, 7);
  // ISO week number
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function openModal(challengeId, title) {
  if (!currentUser) {
    window.location.href = '/auth/';
    return;
  }
  activeChallengeId = challengeId;
  document.getElementById('modal-challenge-title').textContent = `Submit Proof — ${title}`;
  document.getElementById('submit-error').style.display = 'none';
  document.getElementById('submit-form').reset();
  selectedFiles = [];
  renderPreviews();
  document.getElementById('submit-modal').style.display = 'flex';
}

function closeModal() {
  hideModalById('submit-modal');
  activeChallengeId = null;
}

// ---- Screenshot dropzone ----

function initDropzone() {
  const dropzone = document.getElementById('screenshot-dropzone');
  const input = document.getElementById('screenshot');

  input.addEventListener('change', () => {
    addFiles(Array.from(input.files));
    input.value = ''; // let the same file be re-picked after being removed
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, () => dropzone.classList.remove('drag-over'));
  });
}

function addFiles(files) {
  const room = Math.max(0, MAX_SCREENSHOTS - selectedFiles.length);
  const maxBytes = MAX_SCREENSHOT_MB * 1024 * 1024;

  const tooBig = files.some(f => ALLOWED_IMAGE_TYPES.includes(f.type) && f.size > maxBytes);
  const wrongType = files.some(f => !ALLOWED_IMAGE_TYPES.includes(f.type));

  const images = files.filter(f => ALLOWED_IMAGE_TYPES.includes(f.type) && f.size <= maxBytes);

  if (tooBig) {
    showToast(`Screenshots must be under ${MAX_SCREENSHOT_MB}MB — skipped the oversized ones.`, true);
  } else if (wrongType) {
    showToast('Only PNG, JPG, WEBP, or GIF images are allowed.', true);
  }
  if (images.length > room) {
    showToast(`Only ${MAX_SCREENSHOTS} screenshots max — added the first ${room || 0}.`, room === 0);
  }
  selectedFiles = selectedFiles.concat(images.slice(0, room));
  renderPreviews();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderPreviews();
}

function renderPreviews() {
  const previews = document.getElementById('dropzone-previews');
  const promptText = document.getElementById('dropzone-prompt').children[1];

  previews.innerHTML = selectedFiles.map((f, i) => `
    <div class="dropzone-thumb">
      <img src="${URL.createObjectURL(f)}" alt="">
      <button type="button" class="thumb-remove" data-remove-index="${i}" title="Remove"><i data-lucide="x" style="width:10px;height:10px;"></i></button>
    </div>
  `).join('');

  promptText.innerHTML = selectedFiles.length
    ? `<strong>${selectedFiles.length}/${MAX_SCREENSHOTS} added</strong> — click to add more`
    : `<strong>Click to upload</strong> or drag screenshots here`;

  previews.querySelectorAll('[data-remove-index]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(Number(btn.dataset.removeIndex));
    });
  });
  refreshIcons();
}

async function handleSubmit(e) {
  e.preventDefault();
  const videoInput = document.getElementById('video-url');
  const errorEl = document.getElementById('submit-error');
  const submitBtn = document.getElementById('submit-proof-btn');
  const files = selectedFiles.slice(0, MAX_SCREENSHOTS);
  const videoUrl = videoInput.value.trim();

  errorEl.style.display = 'none';

  if (!files.length && !videoUrl) {
    errorEl.textContent = 'Add at least one screenshot or a video link.';
    errorEl.style.display = 'block';
    return;
  }
  if (videoUrl && !isVideoPlatformLink(videoUrl)) {
    errorEl.textContent = 'Video link must be from YouTube, Twitch, Streamable, Medal, Vimeo, TikTok, or a Google Drive link — other sites aren\'t allowed.';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = files.length ? `Uploading ${files.length} image${files.length > 1 ? 's' : ''}…` : 'Submitting…';

  try {
    const screenshotUrls = [];
    for (const file of files) {
      const url = await uploadScreenshot(currentUser.id, file, `${activeChallengeId}-${Date.now()}-${screenshotUrls.length}`);
      screenshotUrls.push(url);
    }

    const { error: insertError } = await sb.from('submissions').insert({
      user_id: currentUser.id,
      challenge_id: activeChallengeId,
      screenshot_urls: screenshotUrls,
      video_url: videoUrl || null,
    });
    if (insertError) throw insertError;

    closeModal();
    showToast('Submitted! The crew will review it soon.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    logError(err);
    errorEl.textContent = err.message || 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit for Review';
  }
}

// --- Live reset countdowns for the daily/weekly/monthly bounty sections -----------------

let resetCountdownTimer = null;

function nextResetFor(type) {
  const now = new Date();
  if (type === 'daily') {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return next;
  }
  if (type === 'weekly') {
    // Resets every Monday 00:00 UTC.
    const day = now.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    const daysUntilMonday = (8 - day) % 7 || 7;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
    return next;
  }
  if (type === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'resetting…';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function tickResetCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const type = el.dataset.countdown;
    const next = nextResetFor(type);
    if (!next) return;
    el.textContent = formatCountdown(next.getTime() - Date.now());
  });
}

function startResetCountdowns() {
  if (resetCountdownTimer) clearInterval(resetCountdownTimer);
  tickResetCountdowns();
  resetCountdownTimer = setInterval(tickResetCountdowns, 1000);
}
