// BloxCore — challenges.html logic

let currentUser = null;
let activeChallengeId = null;
let completedChallengeIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    const { data: completions } = await sb.from('completions').select('challenge_id').eq('user_id', currentUser.id);
    completedChallengeIds = new Set((completions || []).map(c => c.challenge_id));
  }

  await loadChallenges();

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

function renderChallengeCard(c) {
  const rotate = (Math.random() * 4 - 2).toFixed(1);
  const isDone = completedChallengeIds.has(c.id) && !c.repeatable;

  const actionHtml = isDone
    ? `<button class="btn btn-ghost btn-sm" disabled>✓ Completed</button>`
    : `<button class="btn btn-primary btn-sm" data-claim-id="${c.id}" data-claim-title="${escapeHtml(c.title)}">Claim Bounty</button>`;

  return `
    <div class="poster" style="transform: rotate(${rotate}deg); ${isDone ? 'opacity:0.6;' : ''}">
      <p class="poster-eyebrow">★ WANTED ★</p>
      <p class="poster-title">${escapeHtml(c.title)}</p>
      <p class="poster-body">${escapeHtml(c.description)}</p>
      <p class="poster-reward">+${c.xp_reward} XP</p>
      <div class="center" style="margin-top:10px; display:flex; flex-direction:column; gap:10px; align-items:center;">
        <div style="display:flex; gap:6px;">
          <span class="tag tag-${c.difficulty}">${c.difficulty}</span>
          ${c.repeatable ? `<span class="tag" style="background:rgba(41,182,246,0.16); color:var(--brass-bright);">Repeatable</span>` : ''}
        </div>
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
  document.getElementById('submit-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('submit-modal').style.display = 'none';
  activeChallengeId = null;
}

async function handleSubmit(e) {
  e.preventDefault();
  const fileInput = document.getElementById('screenshot');
  const errorEl = document.getElementById('submit-error');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const file = fileInput.files[0];

  if (!file) return;

  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading…';

  try {
    const ext = file.name.split('.').pop();
    const path = `${currentUser.id}/${activeChallengeId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await sb.storage.from('screenshots').upload(path, file);
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('screenshots').getPublicUrl(path);

    const { error: insertError } = await sb.from('submissions').insert({
      user_id: currentUser.id,
      challenge_id: activeChallengeId,
      screenshot_url: urlData.publicUrl,
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
