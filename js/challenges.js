// BloxCore — challenges.html logic

let currentUser = null;
let activeChallengeId = null;
let completionMap = new Map();
const MAX_SCREENSHOTS = 5;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    const { data: completions } = await sb.from('completions').select('challenge_id, completed_at').eq('user_id', currentUser.id);
    completionMap = new Map((completions || []).map(c => [c.challenge_id, c.completed_at]));
  }

  await loadChallenges();
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
    grid.innerHTML = `<p class="muted">Couldn't load challenges right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    grid.innerHTML = `<div class="empty-state">No challenges match that filter yet.</div>`;
    return;
  }

  const sections = [
    { key: 'daily', label: 'Daily Bounties', hint: 'Resets every day' },
    { key: 'weekly', label: 'Weekly Bounties', hint: 'Resets every Monday' },
    { key: 'monthly', label: 'Monthly Bounties', hint: 'Resets on the 1st' },
    { key: 'none', label: 'Standing Bounties', hint: 'Always available' },
  ];

  grid.innerHTML = sections.map(section => {
    const items = data.filter(c => c.rotation === section.key);
    if (!items.length) return '';
    return `
      <div class="bounty-section">
        <div class="flex-between" style="margin-bottom:16px;">
          <h2 style="font-size:1.15rem; margin:0;">${section.label}</h2>
          <span class="muted" style="font-size:0.8rem; font-family:var(--font-mono);">${section.hint}</span>
        </div>
        <div class="grid">${items.map(renderChallengeCard).join('')}</div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-claim-id]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.claimId, btn.dataset.claimTitle));
  });
}

function formatRemaining(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function renderChallengeCard(c) {
  const rotate = (Math.random() * 4 - 2).toFixed(1);
  const completedAt = completionMap.get(c.id);
  const isDone = !!completedAt && !c.repeatable;

  let onCooldown = false;
  let cooldownLabel = '';
  if (completedAt && c.repeatable && c.cooldown_hours > 0) {
    const readyAt = new Date(completedAt).getTime() + c.cooldown_hours * 3600 * 1000;
    if (Date.now() < readyAt) {
      onCooldown = true;
      cooldownLabel = formatRemaining(readyAt - Date.now());
    }
  }

  const actionHtml = isDone
    ? `<button class="btn btn-ghost btn-sm" disabled>✓ Completed</button>`
    : onCooldown
    ? `<button class="btn btn-ghost btn-sm" disabled>On Cooldown · ${cooldownLabel}</button>`
    : `<button class="btn btn-primary btn-sm" data-claim-id="${c.id}" data-claim-title="${escapeHtml(c.title)}">Claim Bounty</button>`;

  return `
    <div class="poster" style="transform: rotate(${rotate}deg); ${isDone || onCooldown ? 'opacity:0.6;' : ''}">
      <p class="poster-eyebrow">★ WANTED ★</p>
      <p class="poster-title">${escapeHtml(c.title)}</p>
      <p class="poster-body">${escapeHtml(c.description)}</p>
      <p class="poster-reward">+${c.xp_reward} XP</p>
      <div class="center" style="margin-top:10px; display:flex; flex-direction:column; gap:8px; align-items:center;">
        <span class="difficulty-label difficulty-${c.difficulty}">${c.difficulty}</span>
        ${c.repeatable ? `<span class="muted" style="font-size:0.72rem;">Repeatable${c.cooldown_hours > 0 ? ` · ${c.cooldown_hours}h cooldown` : ''}</span>` : ''}
        ${actionHtml}
      </div>
    </div>
  `;
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
  document.getElementById('submit-modal').style.display = 'none';
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
  const images = files.filter(f => f.type.startsWith('image/'));
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
      <button type="button" class="thumb-remove" data-remove-index="${i}" title="Remove">✕</button>
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

  submitBtn.disabled = true;
  submitBtn.textContent = files.length ? `Uploading ${files.length} image${files.length > 1 ? 's' : ''}…` : 'Submitting…';

  try {
    const screenshotUrls = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `${currentUser.id}/${activeChallengeId}-${Date.now()}-${screenshotUrls.length}.${ext}`;
      const { error: uploadError } = await sb.storage.from('screenshots').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = sb.storage.from('screenshots').getPublicUrl(path);
      screenshotUrls.push(urlData.publicUrl);
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
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit for Review';
  }
}
