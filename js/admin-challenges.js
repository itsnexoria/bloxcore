// BloxCore — admin/challenges/index.html logic

const ROTATION_COUNTS = { daily: 3, weekly: 3, monthly: 2 };
const CHALLENGES_PAGE_SIZE = 20;
let allChallenges = [];
let challengesPage = 0;

let _challengesTabInit = false;

// tab name -> its lazy init function. Every one of these already guards itself with its
// own _xTabInit flag, so calling one more than once is safe/cheap.
const MANAGE_TAB_INIT = {
  challenges: () => initChallengesTab(),
  giveaways: () => initGiveawaysManageTab(),
  pvp: () => initPvpResultsTab(),
  tournaments: () => initTournamentsTab(),
  'crews-wars': () => initCrewsWarsTab(),
  users: () => initUsersTab(),
  titles: () => initTitlesTab(),
  analytics: () => initAnalyticsTab(),
  site: () => initSiteTab(),
};

// Wires the Manage page's tabs together. Giveaways is the only tab mods can reach
// (matching the old standalone /admin/giveaways/ page, which used requireMod() while
// the other four used requireAdmin()) — everything else is admin-only, both visually
// (button hidden via data-requires-role) and functionally (activateTab refuses to
// switch to it for a non-admin, so a typed-in #hash can't bypass the button hiding).
onReady(async () => {
  const auth = await requireMod();
  if (!auth) return;
  const role = auth.profile?.role;
  const isAdmin = role === 'admin';

  const tabButtons = document.querySelectorAll('[data-manage-tab]');
  const panels = document.querySelectorAll('[data-manage-panel]');

  tabButtons.forEach(btn => {
    if (btn.dataset.requiresRole === 'admin' && !isAdmin) btn.style.display = 'none';
  });

  function activateTab(name) {
    // Giveaways and PvP Results are both mod-reachable (mods handle day-to-day review
    // work); everything else here is admin-only, same as the button-hiding above.
    if (!MANAGE_TAB_INIT[name] || (!isAdmin && name !== 'giveaways' && name !== 'pvp' && name !== 'tournaments')) name = 'giveaways';
    tabButtons.forEach(btn => {
      btn.className = `btn btn-sm ${btn.dataset.manageTab === name ? 'btn-primary' : 'btn-ghost'}`;
    });
    panels.forEach(panel => {
      panel.style.display = panel.dataset.managePanel === name ? '' : 'none';
    });
    MANAGE_TAB_INIT[name]();
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      history.replaceState(null, '', `#${btn.dataset.manageTab}`);
      activateTab(btn.dataset.manageTab);
    });
  });

  window.addEventListener('hashchange', () => activateTab(location.hash.slice(1)));

  // Supports deep links like /admin/manage/#users — including the old
  // /admin/challenges/, /admin/giveaways/, /admin/users/, /admin/titles/,
  // /admin/site/ URLs, which now redirect here with that hash.
  activateTab(location.hash.slice(1) || (isAdmin ? 'challenges' : 'giveaways'));
});

async function initChallengesTab() {
  if (_challengesTabInit) return;
  _challengesTabInit = true;

  try {
    await loadChallenges(0);
    await populateRewardTitleSelect();

    document.getElementById('new-challenge-btn').addEventListener('click', () => openChallengeModal());
    document.getElementById('modal-cancel').addEventListener('click', closeChallengeModal);
    document.getElementById('challenge-form').addEventListener('submit', handleSave);

    document.querySelectorAll('[data-rotate]').forEach(btn => {
      btn.addEventListener('click', () => triggerRotation(btn.dataset.rotate, btn));
    });

    document.getElementById('challenges-table').addEventListener('click', (e) => {
      if (e.target.id === 'ch-prev') loadChallenges(challengesPage - 1);
      if (e.target.id === 'ch-next') loadChallenges(challengesPage + 1);
    });

    document.getElementById('repeatable').addEventListener('change', (e) => {
      document.getElementById('cooldown-field').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('rotation').addEventListener('change', updateRepeatableFieldVisibility);
  } catch (e) {
    logError('Failed to init Challenges tab:', e);
    _challengesTabInit = false;
    showToast('Something went wrong loading challenges. Try again.', true);
  }
}

async function loadChallenges(page) {
  const table = document.getElementById('challenges-table');
  challengesPage = page;
  const from = page * CHALLENGES_PAGE_SIZE;
  const to = from + CHALLENGES_PAGE_SIZE - 1;

  const { data, error, count } = await sb
    .from('challenges')
    .select('*, titles!challenges_reward_title_id_fkey(name), titles2:titles!challenges_reward_title_id_2_fkey(name)', { count: 'exact' })
    .order('rotation', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    table.innerHTML = errorStateHtml("Couldn't load quests right now.", 'loadChallenges(challengesPage)');
    refreshIcons();
    logError(error);
    return;
  }

  allChallenges = data;

  if (!data.length) {
    table.innerHTML = `<div class="empty-state">No quests yet — create the first one.</div>`;
    return;
  }

  table.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    data.map((c, i) => renderChallengeRow(c, i === data.length - 1)).join('') +
    `</div>` + renderChallengesPager(count);

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openChallengeModal(allChallenges.find(c => c.id === btn.dataset.edit)));
  });
  document.querySelectorAll('[data-toggle-active]').forEach(btn => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.toggleActive, btn.dataset.nextState === 'true'));
  });
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteChallenge(btn.dataset.delete, btn.dataset.title));
  });
  refreshIcons();
}

let allTitlesForRewardPicker = [];
let rewardTitleId = '';
let rewardTitleId2 = '';
let rewardTitleModalSlot = 1;
const CHALLENGE_TITLE_RARITY_ORDER = { divine: 6, mythical: 5, legendary: 4, epic: 3, rare: 2, common: 0 };

async function populateRewardTitleSelect() {
  const { data: titles } = await sb.from('titles').select('id, name, color, rarity').order('name');
  allTitlesForRewardPicker = (titles || []).slice().sort((a, b) => {
    const rarityDiff = (CHALLENGE_TITLE_RARITY_ORDER[b.rarity] ?? 0) - (CHALLENGE_TITLE_RARITY_ORDER[a.rarity] ?? 0);
    return rarityDiff !== 0 ? rarityDiff : a.name.localeCompare(b.name);
  });

  document.getElementById('reward-title-picker-btn').addEventListener('click', () => openRewardTitleModal(1));
  document.getElementById('reward-title-picker-btn-2').addEventListener('click', () => openRewardTitleModal(2));
  document.getElementById('reward-title-modal-close').addEventListener('click', closeRewardTitleModal);
  document.getElementById('reward-title-picker-modal').addEventListener('click', (e) => {
    if (e.target.id === 'reward-title-picker-modal') closeRewardTitleModal();
  });
}

function setRewardTitleId(id) {
  rewardTitleId = id || '';
  document.getElementById('reward_title_id').value = rewardTitleId;
  const valueEl = document.getElementById('reward-title-picker-value');
  const picked = allTitlesForRewardPicker.find(t => t.id === rewardTitleId);
  if (picked) {
    valueEl.classList.remove('is-empty');
    valueEl.innerHTML = `<span style="${titleColorStyle(picked.color)}">${escapeHtml(picked.name)}</span>`;
  } else {
    valueEl.classList.add('is-empty');
    valueEl.textContent = '— None —';
  }
}

function setRewardTitleId2(id) {
  rewardTitleId2 = id || '';
  document.getElementById('reward_title_id_2').value = rewardTitleId2;
  const valueEl = document.getElementById('reward-title-picker-value-2');
  const picked = allTitlesForRewardPicker.find(t => t.id === rewardTitleId2);
  if (picked) {
    valueEl.classList.remove('is-empty');
    valueEl.innerHTML = `<span style="${titleColorStyle(picked.color)}">${escapeHtml(picked.name)}</span>`;
  } else {
    valueEl.classList.add('is-empty');
    valueEl.textContent = '— None —';
  }
}

function openRewardTitleModal(slot) {
  rewardTitleModalSlot = slot;
  const currentId = slot === 2 ? rewardTitleId2 : rewardTitleId;
  const noneTile = `
    <div class="build-modal-tile title-tile ${currentId === '' ? 'selected' : ''}" data-title-id="">
      <i data-lucide="ban" class="icon-lg"></i>
      <span class="title-tile-name">None</span>
    </div>
  `;
  const tiles = allTitlesForRewardPicker.map(t => `
    <div class="build-modal-tile title-tile ${currentId === t.id ? 'selected' : ''}" data-rarity="${t.rarity}" data-title-id="${t.id}">
      <span class="title-tile-name" style="${titleColorStyle(t.color)}">${escapeHtml(t.name)}</span>
      <span class="title-rarity-pill title-rarity-${t.rarity}">${t.rarity}</span>
    </div>
  `).join('');

  document.getElementById('reward-title-modal-grid').innerHTML = noneTile + tiles;
  refreshIcons();

  document.querySelectorAll('#reward-title-modal-grid [data-title-id]').forEach(tile => {
    tile.addEventListener('click', () => {
      if (rewardTitleModalSlot === 2) setRewardTitleId2(tile.dataset.titleId);
      else setRewardTitleId(tile.dataset.titleId);
      closeRewardTitleModal();
    });
  });

  document.getElementById('reward-title-picker-modal').classList.add('open');
}

function closeRewardTitleModal() {
  document.getElementById('reward-title-picker-modal').classList.remove('open');
}

function renderChallengesPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / CHALLENGES_PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 0;">
      <button class="btn btn-ghost btn-sm" id="ch-prev" ${challengesPage === 0 ? 'disabled' : ''}><i data-lucide="chevron-left" class="icon-sm"></i> Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${challengesPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="ch-next" ${challengesPage + 1 >= totalPages ? 'disabled' : ''}>Next <i data-lucide="chevron-right" class="icon-sm"></i></button>
    </div>
  `;
}

function renderChallengeRow(c, isLast) {
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
          +${c.xp_reward} XP · ${rotationLabel} ${featuredTag} ${c.repeatable ? `· <span style="color:var(--brass-bright);">Repeatable${c.cooldown_hours > 0 ? ` (${c.cooldown_hours}h cooldown)` : ''}</span>` : ''} ${c.titles ? `· <i data-lucide="tag" class="icon-sm"></i> ${escapeHtml(c.titles.name)}` : ''} ${c.titles2 ? `· <i data-lucide="tag" class="icon-sm"></i> ${escapeHtml(c.titles2.name)}` : ''} ${c.active ? '' : '· <span style="color:var(--blood);">Archived</span>'}
        </p>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-edit="${c.id}" title="Edit"><i data-lucide="pencil" class="icon-sm"></i></button>
        <button class="btn ${c.active ? 'btn-danger' : 'btn-ghost'} btn-sm" data-toggle-active="${c.id}" data-next-state="${!c.active}">
          ${c.active ? 'Archive' : 'Restore'}
        </button>
        <button class="btn btn-danger btn-sm" data-delete="${c.id}" data-title="${escapeHtml(c.title)}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `;
}

function openChallengeModal(challenge = null) {
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
  updateRepeatableFieldVisibility();
  setRewardTitleId(challenge?.reward_title_id || '');
  setRewardTitleId2(challenge?.reward_title_id_2 || '');

  modal.style.display = 'flex';
}

// Rotation challenges (daily/weekly/monthly) reset on their own calendar-period schedule —
// the Repeatable/Cooldown fields only mean something when Rotation is None, so hide them
// otherwise rather than leaving stale, ignored settings visible in the form.
function updateRepeatableFieldVisibility() {
  const rotation = document.getElementById('rotation').value;
  document.getElementById('repeatable-field').style.display = rotation === 'none' ? '' : 'none';
}

function closeChallengeModal() {
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
    reward_title_id_2: document.getElementById('reward_title_id_2').value || null,
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

  closeChallengeModal();
  showToast('Challenge saved.');
  await loadChallenges(challengesPage);
}

async function toggleActive(id, nextState) {
  const { error } = await sb.from('challenges').update({ active: nextState }).eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast(nextState ? 'Challenge restored.' : 'Challenge archived.');
  await loadChallenges(challengesPage);
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
  await loadChallenges(challengesPage);
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
  await loadChallenges(challengesPage);
}
