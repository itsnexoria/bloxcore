// BloxCore — combos/index.html logic

let isStaff = false;
let currentUserId = null;
let allCombos = [];
let activeFilter = 'all';

const CATEGORY_LABEL = { fruit: 'Fruit', melee: 'Melee', sword: 'Sword', gun: 'Gun' };
const CATEGORY_COLOR = { fruit: 'var(--brass-bright)', melee: 'var(--gold)', sword: 'var(--blue)', gun: 'var(--purple)' };
const COMBO_SELECT_IDS = { melee: 'combo-melee', fruit: 'combo-fruit', sword: 'combo-sword', gun: 'combo-gun' };

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  isStaff = profile?.role === 'mod' || profile?.role === 'admin';
  currentUserId = user?.id || null;

  getSiteSettings().then(settings => {
    const el = document.getElementById('combos-limit-blurb');
    if (el) el.textContent = `Community-written combo guides — up to ${settings.maxCombosPerUser} per player.`;
  });

  if (currentUserId) {
    document.getElementById('new-combo-btn').style.display = 'inline-flex';
    document.getElementById('new-combo-btn').addEventListener('click', () => {
      document.getElementById('combo-compose').style.display = 'block';
    });
    document.getElementById('combo-cancel-btn').addEventListener('click', closeComposeForm);
    document.getElementById('combo-form').addEventListener('submit', handleCreateCombo);
    document.querySelectorAll('[data-picker-for]').forEach(btn => {
      btn.addEventListener('click', () => openComboItemModal(btn.dataset.pickerFor));
    });
    document.getElementById('combo-item-modal-close').addEventListener('click', () => {
      document.getElementById('combo-item-modal').classList.remove('open');
    });
    document.getElementById('combo-item-modal-search').addEventListener('input', (e) => {
      renderComboItemGrid(activeComboPickerCategory, e.target.value);
    });
  }

  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.difficulty));
  });

  await loadCombos();
});

function iconFor(category, itemName) {
  const opt = (BUILD_OPTIONS[category] || []).find(o => o.value === itemName);
  return opt?.icon || null;
}

let activeComboPickerCategory = null;

function openComboItemModal(category) {
  activeComboPickerCategory = category;
  document.getElementById('combo-item-modal-title').textContent = `Choose ${CATEGORY_LABEL[category]}`;
  document.getElementById('combo-item-modal-search').value = '';
  renderComboItemGrid(category, '');
  document.getElementById('combo-item-modal').classList.add('open');
}

function renderComboItemGrid(category, filter) {
  const grid = document.getElementById('combo-item-modal-grid');
  const currentValue = document.getElementById(COMBO_SELECT_IDS[category]).value;
  const query = filter.trim().toLowerCase();
  const options = (BUILD_OPTIONS[category] || []).filter(opt => opt.value.toLowerCase().includes(query));

  const noneTile = `
    <div class="build-modal-tile ${currentValue === '' ? 'selected' : ''}" data-item-value="">
      <i data-lucide="ban" class="icon-lg"></i>
      <span>None</span>
    </div>
  `;
  const tiles = options.map(opt => `
    <div class="build-modal-tile ${currentValue === opt.value ? 'selected' : ''}" ${opt.rarity ? `data-rarity="${opt.rarity}"` : ''} data-item-value="${escapeHtml(opt.value)}">
      <img src="${opt.icon}" alt="${escapeHtml(opt.value)}" loading="lazy">
      <span>${escapeHtml(opt.value)}</span>
    </div>
  `).join('');

  grid.innerHTML = noneTile + tiles;
  refreshIcons();

  grid.querySelectorAll('[data-item-value]').forEach(tile => {
    tile.addEventListener('click', () => {
      setComboItem(category, tile.dataset.itemValue);
      document.getElementById('combo-item-modal').classList.remove('open');
    });
  });
}

let currentSkins = { fruit: '' };

function setComboItem(category, value) {
  document.getElementById(COMBO_SELECT_IDS[category]).value = value;
  if (category === 'fruit' && !value) currentSkins.fruit = '';

  const renderLabel = () => {
    const btn = document.querySelector(`[data-picker-for="${category}"]`);
    const valueEl = btn.querySelector(`[data-picker-value="${category}"]`);
    const icon = iconFor(category, value);
    const skinSuffix = category === 'fruit' && currentSkins.fruit ? ` <span class="muted" style="font-weight:400;">(${escapeHtml(currentSkins.fruit)})</span>` : '';
    if (value) {
      valueEl.classList.remove('is-empty');
      valueEl.innerHTML = `${icon ? `<img src="${icon}" alt="" style="width:18px; height:18px; object-fit:contain; vertical-align:-4px; margin-right:6px;">` : ''}${escapeHtml(value)}${skinSuffix}`;
    } else {
      valueEl.classList.add('is-empty');
      valueEl.textContent = '— None —';
    }
  };
  renderLabel();

  if (category === 'fruit' && value) {
    maybePromptFruitSkin(value, currentSkins.fruit, (skin) => {
      currentSkins.fruit = skin || '';
      renderLabel();
    });
  }
}

function setFilter(difficulty) {
  activeFilter = difficulty;
  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.difficulty === difficulty ? 'btn-primary' : 'btn-ghost'}`;
  });
  renderCombos();
}

const COMBOS_PAGE_SIZE = 24;
let combosOffset = 0;
let combosHasMore = true;

async function fetchCombosPage(offset, pageSize) {
  const { data, error } = await sb
    .from('combos')
    .select('*, profiles:created_by(username, display_name, avatar_url, title_color_override, titles(name, color))')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) {
    console.error(error);
    return null;
  }
  return attachVoteData(data || []);
}

async function attachVoteData(rows) {
  if (!rows.length) return rows;
  const ids = rows.map(c => c.id);

  const { data: scores } = await sb.from('combo_scores').select('combo_id, score').in('combo_id', ids);
  const scoreMap = new Map((scores || []).map(s => [s.combo_id, s.score]));

  let myVoteMap = new Map();
  if (currentUserId) {
    const { data: myVotes } = await sb.from('combo_votes').select('combo_id, vote').eq('user_id', currentUserId).in('combo_id', ids);
    myVoteMap = new Map((myVotes || []).map(v => [v.combo_id, v.vote]));
  }

  rows.forEach(c => {
    c.score = scoreMap.get(c.id) || 0;
    c.myVote = myVoteMap.get(c.id) || 0;
  });
  return rows;
}

async function loadCombos() {
  const list = document.getElementById('combo-list');
  const rows = await fetchCombosPage(0, COMBOS_PAGE_SIZE);
  if (rows === null) {
    list.innerHTML = `<p class="muted">Couldn't load combos right now.</p>`;
    return;
  }
  allCombos = rows;
  combosOffset = rows.length;
  combosHasMore = rows.length === COMBOS_PAGE_SIZE;
  renderCombos();
  scrollToHashTarget('data-combo-id');
}

async function loadMoreCombos() {
  if (!combosHasMore) return;
  const rows = await fetchCombosPage(combosOffset, COMBOS_PAGE_SIZE);
  if (rows === null) return;
  allCombos = allCombos.concat(rows);
  combosOffset += rows.length;
  combosHasMore = rows.length === COMBOS_PAGE_SIZE;
  renderCombos();
}

async function handleComboVote(comboId, dir) {
  const auth = await requireAuth();
  if (!auth) return;

  const combo = allCombos.find(c => c.id === comboId);
  if (!combo) return;

  const removing = combo.myVote === dir;
  const { error } = removing
    ? await sb.from('combo_votes').delete().eq('combo_id', comboId).eq('user_id', auth.user.id)
    : await sb.from('combo_votes').upsert({ combo_id: comboId, user_id: auth.user.id, vote: dir });

  if (error) { showToast(error.message, true); return; }

  combo.score = combo.score - combo.myVote + (removing ? 0 : dir);
  combo.myVote = removing ? 0 : dir;
  renderCombos();
}

function scrollToHashTarget(attr) {
  const id = location.hash.slice(1);
  if (!id) return;
  const el = document.querySelector(`[${attr}="${id}"]`);
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('deep-link-highlight');
  }, 150);
}

function renderCombos() {
  const list = document.getElementById('combo-list');
  const items = activeFilter === 'all' ? allCombos : allCombos.filter(c => c.difficulty === activeFilter);

  if (!items.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No combos here yet.</div>`;
    return;
  }

  list.innerHTML = items.map(c => {
    const poster = c.profiles || {};
    return `
    <div class="panel combo-card" data-combo-id="${c.id}">
      <div class="flex-between" style="align-items:flex-start;">
        <a href="/player/?u=${encodeURIComponent(poster.username || '')}" style="display:flex; align-items:center; gap:10px; text-decoration:none; min-width:0;">
          ${avatarHtml(poster, 34)}
          <div style="min-width:0;">
            <span style="color:var(--bone); font-weight:700; font-size:0.88rem; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(displayNameFor(poster))} ${titleBadge(poster)}</span>
            <span class="muted" style="font-size:0.72rem;">${timeAgo(c.created_at)}</span>
          </div>
        </a>
        <span class="tag tag-${c.difficulty}" style="flex-shrink:0;">${c.difficulty}</span>
      </div>

      <h3 style="margin:16px 0 0; font-size:1.2rem; display:flex; align-items:flex-start; gap:8px;">
        <i data-lucide="swords" class="icon-sm" style="color:var(--brass-bright); flex-shrink:0; margin-top:3px;"></i><span style="min-width:0; overflow-wrap:break-word;">${escapeHtml(c.title)}</span>
      </h3>

      <div class="combo-step-chain">
        ${(c.steps || []).map((s, i) => `
          ${i > 0 ? '<i data-lucide="chevron-right" class="icon-md combo-step-arrow"></i>' : ''}
          <div class="combo-step-tile" style="--step-color:${CATEGORY_COLOR[s.category]};" title="${CATEGORY_LABEL[s.category]}: ${escapeHtml(s.item)}${s.skin ? ` (${escapeHtml(s.skin)})` : ''}">
            ${iconFor(s.category, s.item) ? `<img src="${iconFor(s.category, s.item)}" alt="" loading="lazy">` : `<i data-lucide="sparkles" class="icon-md"></i>`}
          </div>
        `).join('')}
      </div>

      ${c.description ? `<p class="muted" style="margin:16px 0 0; font-size:0.86rem; white-space:pre-wrap; padding-left:12px; border-left:2px solid var(--glass-border);">${escapeHtml(c.description)}</p>` : ''}

      ${c.instructions ? `
        <div style="margin-top:16px;">
          <p style="margin:0 0 6px; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ash);"><i data-lucide="list-ordered" class="icon-sm icon-inline"></i>How to Perform</p>
          <p style="margin:0; font-size:0.85rem; white-space:pre-wrap; padding:10px 12px; background:rgb(var(--shadow-rgb) / 0.25); border-radius:var(--radius-sm, 8px); font-family:var(--font-mono, monospace);">${escapeHtml(c.instructions)}</p>
        </div>
      ` : ''}

      <div class="flex-between" style="margin-top:16px; padding-top:14px; border-top:1px solid var(--glass-border);">
        <div style="display:flex; align-items:center; gap:2px;" class="combo-vote-widget" data-vote-combo="${c.id}">
          <button type="button" class="btn btn-ghost btn-sm combo-vote-btn ${c.myVote === 1 ? 'active-up' : ''}" data-vote-dir="1" aria-label="Upvote"><i data-lucide="thumbs-up" class="icon-sm"></i></button>
          <span class="combo-vote-score" style="min-width:20px; text-align:center; font-weight:700; font-size:0.85rem; color:${c.score > 0 ? 'var(--gold-bright)' : c.score < 0 ? 'var(--blood-dim)' : 'var(--ash)'};">${c.score}</span>
          <button type="button" class="btn btn-ghost btn-sm combo-vote-btn ${c.myVote === -1 ? 'active-down' : ''}" data-vote-dir="-1" aria-label="Downvote"><i data-lucide="thumbs-down" class="icon-sm"></i></button>
        </div>
        ${c.video_url ? `<a href="${escapeHtml(c.video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm"><i data-lucide="play" class="icon-sm icon-inline"></i>Watch Clip</a>` : '<span></span>'}
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" data-copy-combo="${c.id}" title="Copy link"><i data-lucide="link" class="icon-sm"></i></button>
          ${c.created_by === currentUserId ? `<button class="btn btn-ghost btn-sm" data-edit-combo="${c.id}" title="Edit"><i data-lucide="pencil" class="icon-sm"></i></button>` : ''}
          ${(isStaff || c.created_by === currentUserId) ? `<button class="btn btn-ghost btn-sm" data-delete-combo="${c.id}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

  document.querySelectorAll('[data-delete-combo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this combo?')) return;
      await sb.from('combos').delete().eq('id', btn.dataset.deleteCombo);
      loadCombos();
    });
  });
  document.querySelectorAll('[data-vote-combo]').forEach(widget => {
    widget.querySelectorAll('[data-vote-dir]').forEach(btn => {
      btn.addEventListener('click', () => handleComboVote(widget.dataset.voteCombo, Number(btn.dataset.voteDir)));
    });
  });
  document.querySelectorAll('[data-edit-combo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const combo = allCombos.find(c => c.id === btn.dataset.editCombo);
      if (combo) openComposeForEdit(combo);
    });
  });
  document.querySelectorAll('[data-copy-combo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/combos/#${btn.dataset.copyCombo}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied.');
      } catch {
        showToast(url);
      }
    });
  });
  refreshIcons();

  const existingBtn = document.getElementById('combos-load-more-wrap');
  if (existingBtn) existingBtn.remove();
  if (combosHasMore) {
    list.insertAdjacentHTML('afterend', `
      <div id="combos-load-more-wrap" style="text-align:center; margin-top:16px;">
        <button id="combos-load-more-btn" class="btn btn-ghost btn-sm">Load more</button>
      </div>
    `);
    document.getElementById('combos-load-more-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Loading…';
      await loadMoreCombos();
    });
  }
}

let editingComboId = null;

async function handleCreateCombo(e) {
  e.preventDefault();

  const steps = Object.entries(COMBO_SELECT_IDS)
    .map(([category, id]) => ({ category, item: document.getElementById(id).value, skin: category === 'fruit' ? (currentSkins.fruit || null) : null }))
    .filter(s => s.item);

  if (!steps.length) { showToast('Pick at least one of Melee, Fruit, Sword, or Gun.', true); return; }

  const title = document.getElementById('combo-title').value.trim();
  const description = document.getElementById('combo-description').value.trim();
  const settings = await getSiteSettings();
  if (title.length < settings.minComboTitleLength) {
    showToast(`Title must be at least ${settings.minComboTitleLength} characters.`, true);
    return;
  }
  if (description && description.length < settings.minComboDescriptionLength) {
    showToast(`Description must be at least ${settings.minComboDescriptionLength} characters, or left blank.`, true);
    return;
  }

  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    title,
    difficulty: document.getElementById('combo-difficulty').value,
    description: description || null,
    instructions: document.getElementById('combo-instructions').value.trim() || null,
    video_url: document.getElementById('combo-video').value.trim() || null,
    steps,
  };

  const { error } = editingComboId
    ? await sb.from('combos').update(payload).eq('id', editingComboId)
    : await sb.from('combos').insert({ ...payload, created_by: user.id });
  if (error) { showToast(error.message, true); return; }

  closeComposeForm();
  showToast(editingComboId ? 'Combo updated.' : 'Combo posted.');
  loadCombos();
}

function closeComposeForm() {
  document.getElementById('combo-form').reset();
  currentSkins.fruit = '';
  editingComboId = null;
  document.getElementById('combo-form-submit-btn').textContent = 'Publish Combo';
  Object.keys(COMBO_SELECT_IDS).forEach(category => setComboItem(category, ''));
  document.getElementById('combo-compose').style.display = 'none';
}

function openComposeForEdit(combo) {
  editingComboId = combo.id;
  document.getElementById('combo-title').value = combo.title;
  document.getElementById('combo-difficulty').value = combo.difficulty;
  document.getElementById('combo-description').value = combo.description || '';
  document.getElementById('combo-instructions').value = combo.instructions || '';
  document.getElementById('combo-video').value = combo.video_url || '';
  currentSkins.fruit = '';
  Object.keys(COMBO_SELECT_IDS).forEach(category => {
    const step = (combo.steps || []).find(s => s.category === category);
    setComboItem(category, step?.item || '');
    if (step?.category === 'fruit' && step.skin) currentSkins.fruit = step.skin;
  });
  document.getElementById('combo-form-submit-btn').textContent = 'Save Changes';
  document.getElementById('combo-compose').style.display = 'block';
  document.getElementById('combo-compose').scrollIntoView({ behavior: 'smooth' });
}
