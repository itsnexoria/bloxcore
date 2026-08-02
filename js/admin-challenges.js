// BloxCore — admin/challenges/index.html logic

const ROTATION_COUNTS = { daily: 3, weekly: 3, monthly: 2 };
const PAGE_SIZE = 20;
let allChallenges = [];
let currentPage = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;

  await loadChallenges(0);
  await populateRewardTitleSelect();

  document.getElementById('new-challenge-btn').addEventListener('click', () => openModal());
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('challenge-form').addEventListener('submit', handleSave);

  document.querySelectorAll('[data-rotate]').forEach(btn => {
    btn.addEventListener('click', () => triggerRotation(btn.dataset.rotate, btn));
  });

  document.getElementById('challenges-table').addEventListener('click', (e) => {
    if (e.target.id === 'ch-prev') loadChallenges(currentPage - 1);
    if (e.target.id === 'ch-next') loadChallenges(currentPage + 1);
  });

  document.getElementById('repeatable').addEventListener('change', (e) => {
    document.getElementById('cooldown-field').style.display = e.target.checked ? 'block' : 'none';
  });
});

async function loadChallenges(page) {
  const table = document.getElementById('challenges-table');
  currentPage = page;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await sb
    .from('challenges')
    .select('*, titles(name)', { count: 'exact' })
    .order('rotation', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    table.innerHTML = `<p class="muted">Couldn't load challenges right now.</p>`;
    console.error(error);
    return;
  }

  allChallenges = data;

  if (!data.length) {
    table.innerHTML = `<div class="empty-state">No challenges yet — create the first one.</div>`;
    return;
  }

  table.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    data.map((c, i) => renderRow(c, i === data.length - 1)).join('') +
    `</div>` + renderPager(count);

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(allChallenges.find(c => c.id === btn.dataset.edit)));
  });
  document.querySelectorAll('[data-toggle-active]').forEach(btn => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.toggleActive, btn.dataset.nextState === 'true'));
  });
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteChallenge(btn.dataset.delete, btn.dataset.title));
  });
  refreshIcons();
}

async function populateRewardTitleSelect() {
  const select = document.getElementById('reward_title_id');
  const { data: titles } = await sb.from('titles').select('id, name').order('name');
  (titles || []).forEach(t => {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.name;
    select.appendChild(option);
  });
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 0;">
      <button class="btn btn-ghost btn-sm" id="ch-prev" ${currentPage === 0 ? 'disabled' : ''}><i data-lucide="chevron-left" class="icon-sm"></i> Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${currentPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="ch-next" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Next <i data-lucide="chevron-right" class="icon-sm"></i></button>
    </div>
  `;
}

function renderRow(c, isLast) {
  const rotationLabel = c.rotation === 'none' ? 'Standing' : c.rotation.charAt(0).toUpperCase() + c.rotation.slice(1);
  const featuredTag = c.rotation !== 'none' ? (c.currently_featured
    ? `<span class="tag tag-easy">Featured now</span>`
    : `<span class="tag" style="background:rgba(138,148,166,0.15); color:var(--ash);">In pool</span>`) : '';

  return `
    <div class="flex-between" style="padding:16px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'} ${c.active ? '' : 'opacity:0.5;'}">
      <div style="min-width:0;">
        <p style="margin:0; font-weight:700;">${escapeHtml(c.title)}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
          <span class="tag tag-${c.difficulty}">${c.difficulty}</span>
          +${c.xp_reward} XP · ${rotationLabel} ${featuredTag} ${c.repeatable ? `· <span style="color:var(--brass-bright);">Repeatable${c.cooldown_hours > 0 ? ` (${c.cooldown_hours}h cooldown)` : ''}</span>` : ''} ${c.titles ? `· <i data-lucide="tag" class="icon-sm"></i> ${escapeHtml(c.titles.name)}` : ''} ${c.active ? '' : '· <span style="color:var(--blood);">Archived</span>'}
        </p>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
        <button class="btn ${c.active ? 'btn-danger' : 'btn-ghost'} btn-sm" data-toggle-active="${c.id}" data-next-state="${!c.active}">
          ${c.active ? 'Archive' : 'Restore'}
        </button>
        <button class="btn btn-danger btn-sm" data-delete="${c.id}" data-title="${escapeHtml(c.title)}">Delete</button>
      </div>
    </div>
  `;
}

function openModal(challenge = null) {
  const modal = document.getElementById('challenge-modal');
  const errorEl = document.getElementById('challenge-error');
  errorEl.style.display = 'none';
  document.getElementById('challenge-form').reset();

  document.getElementById('modal-title').textContent = challenge ? 'Edit Challenge' : 'New Challenge';
  document.getElementById('challenge-id').value = challenge?.id || '';
  document.getElementById('title').value = challenge?.title || '';
  document.getElementById('description').value = challenge?.description || '';
  document.getElementById('difficulty').value = challenge?.difficulty || 'easy';
  document.getElementById('xp_reward').value = challenge?.xp_reward ?? 20;
  document.getElementById('rotation').value = challenge?.rotation || 'none';
  document.getElementById('active').checked = challenge ? challenge.active : true;
  document.getElementById('repeatable').checked = challenge ? challenge.repeatable : false;
  document.getElementById('cooldown_hours').value = challenge?.cooldown_hours ?? 0;
  document.getElementById('cooldown-field').style.display = (challenge ? challenge.repeatable : false) ? 'block' : 'none';
  document.getElementById('reward_title_id').value = challenge?.reward_title_id || '';

  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('challenge-modal').style.display = 'none';
}

async function handleSave(e) {
  e.preventDefault();
  const errorEl = document.getElementById('challenge-error');
  const saveBtn = document.getElementById('save-btn');
  errorEl.style.display = 'none';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const id = document.getElementById('challenge-id').value;
  const rotation = document.getElementById('rotation').value;

  const payload = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    difficulty: document.getElementById('difficulty').value,
    xp_reward: parseInt(document.getElementById('xp_reward').value, 10),
    rotation,
    in_rotation_pool: rotation !== 'none',
    active: document.getElementById('active').checked,
    repeatable: document.getElementById('repeatable').checked,
    cooldown_hours: parseInt(document.getElementById('cooldown_hours').value, 10) || 0,
    reward_title_id: document.getElementById('reward_title_id').value || null,
  };

  // A brand-new rotating challenge starts unfeatured until the next rotation picks it;
  // a brand-new standing challenge is visible immediately.
  if (!id) payload.currently_featured = rotation === 'none';

  const { error } = id
    ? await sb.from('challenges').update(payload).eq('id', id)
    : await sb.from('challenges').insert(payload);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Challenge';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  closeModal();
  showToast('Challenge saved.');
  await loadChallenges(currentPage);
}

async function toggleActive(id, nextState) {
  const { error } = await sb.from('challenges').update({ active: nextState }).eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast(nextState ? 'Challenge restored.' : 'Challenge archived.');
  await loadChallenges(currentPage);
}

async function deleteChallenge(id, title) {
  const confirmed = window.confirm(
    `Permanently delete "${title}"? This can't be undone and will also delete any submissions tied to it. ` +
    `If you just want to hide it from players, use Archive instead.`
  );
  if (!confirmed) return;

  const { error } = await sb.from('challenges').delete().eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('Challenge deleted.');
  await loadChallenges(currentPage);
}

async function triggerRotation(period, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Rotating…';

  const { error } = await sb.rpc('rotate_bounties', { p_rotation: period, p_count: ROTATION_COUNTS[period] });

  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast(`${period[0].toUpperCase()}${period.slice(1)} bounties rotated.`);
  await loadChallenges(currentPage);
}
