// BloxCore — combos/index.html logic

let isStaff = false;
let allCombos = [];
let activeFilter = 'all';
let activeCategoryFilter = 'all';
let currentSteps = [];

const CATEGORY_LABEL = { fruit: 'Fruit', melee: 'Melee', sword: 'Sword', gun: 'Gun', race: 'Race' };
const CATEGORY_COLOR = { fruit: 'var(--brass-bright)', melee: 'var(--gold)', sword: 'var(--blue)', gun: 'var(--purple)', race: 'var(--sea)' };

document.addEventListener('DOMContentLoaded', async () => {
  const { profile } = await getCurrentProfile();
  isStaff = profile?.role === 'mod' || profile?.role === 'admin';

  if (isStaff) {
    document.getElementById('new-combo-btn').style.display = 'inline-flex';
    document.getElementById('new-combo-btn').addEventListener('click', openCompose);
    document.getElementById('combo-cancel-btn').addEventListener('click', closeCompose);
    document.getElementById('combo-form').addEventListener('submit', handleCreateCombo);
    document.getElementById('step-category').addEventListener('change', populateStepItemSelect);
    document.getElementById('add-step-btn').addEventListener('click', addStep);
    populateStepItemSelect();
  }

  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.difficulty));
  });
  document.querySelectorAll('#combo-category-filters [data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => setCategoryFilter(btn.dataset.catFilter));
  });

  await loadCombos();
});

function openCompose() {
  currentSteps = [];
  renderStepsList();
  document.getElementById('combo-compose').style.display = 'block';
}
function closeCompose() {
  document.getElementById('combo-compose').style.display = 'none';
}

function populateStepItemSelect() {
  const category = document.getElementById('step-category').value;
  const select = document.getElementById('step-item');
  select.innerHTML = (BUILD_OPTIONS[category] || []).map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.value)}</option>`).join('');
}

function addStep() {
  const category = document.getElementById('step-category').value;
  const item = document.getElementById('step-item').value;
  const key = document.getElementById('step-key').value.trim();
  if (!item) return;
  currentSteps.push({ category, item, key: key || null });
  document.getElementById('step-key').value = '';
  renderStepsList();
}

function renderStepsList() {
  const list = document.getElementById('combo-steps-list');
  if (!currentSteps.length) {
    list.innerHTML = `<p class="muted" style="font-size:0.82rem; margin:0;">No steps added yet — add at least one below.</p>`;
    return;
  }
  list.innerHTML = currentSteps.map((s, i) => `
    <div class="flex-between" style="padding:8px 12px; border:1px solid var(--glass-border); border-radius:var(--radius-sm);">
      <span style="font-size:0.85rem;">
        <span class="muted" style="font-family:var(--font-mono); margin-right:8px;">${i + 1}.</span>
        <span style="color:${CATEGORY_COLOR[s.category]}; font-weight:700;">${CATEGORY_LABEL[s.category]}</span>
        — ${escapeHtml(s.item)}
        ${s.key ? `<span class="tag tag-medium" style="margin-left:8px;">${escapeHtml(s.key)}</span>` : ''}
      </span>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-step="${i}"><i data-lucide="x" class="icon-sm"></i></button>
    </div>
  `).join('');
  document.querySelectorAll('[data-remove-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSteps.splice(Number(btn.dataset.removeStep), 1);
      renderStepsList();
    });
  });
  refreshIcons();
}

function setFilter(difficulty) {
  activeFilter = difficulty;
  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.difficulty === difficulty ? 'btn-primary' : 'btn-ghost'}`;
  });
  renderCombos();
}

function setCategoryFilter(category) {
  activeCategoryFilter = category;
  document.querySelectorAll('#combo-category-filters [data-cat-filter]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.catFilter === category ? 'btn-primary' : 'btn-ghost'}`;
  });
  renderCombos();
}

async function loadCombos() {
  const { data, error } = await sb.from('combos').select('*').order('created_at', { ascending: false });
  const list = document.getElementById('combo-list');
  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load combos right now.</p>`;
    console.error(error);
    return;
  }
  allCombos = data || [];
  renderCombos();
}

function renderCombos() {
  const list = document.getElementById('combo-list');
  const items = allCombos.filter(c =>
    (activeFilter === 'all' || c.difficulty === activeFilter) &&
    (activeCategoryFilter === 'all' || (c.steps || []).some(s => s.category === activeCategoryFilter))
  );

  if (!items.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No combos here yet.</div>`;
    return;
  }

  list.innerHTML = items.map(c => `
    <div class="panel" data-combo-id="${c.id}">
      <div class="flex-between" style="align-items:flex-start;">
        <h3 style="margin:0; font-size:1.05rem;">${escapeHtml(c.title)}</h3>
        <span class="tag tag-${c.difficulty}">${c.difficulty}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:12px;">
        ${(c.steps || []).map((s, i) => `
          ${i > 0 ? '<i data-lucide="chevron-right" class="icon-sm muted"></i>' : ''}
          <span style="font-size:0.78rem; padding:4px 9px; border-radius:999px; border:1px solid ${CATEGORY_COLOR[s.category]}; color:${CATEGORY_COLOR[s.category]};">
            ${escapeHtml(s.item)}${s.key ? ` <span class="muted">(${escapeHtml(s.key)})</span>` : ''}
          </span>
        `).join('')}
      </div>
      ${c.description ? `<p style="margin:14px 0 0; font-size:0.88rem; white-space:pre-wrap; color:var(--ash);">${escapeHtml(c.description)}</p>` : ''}
      ${c.video_url ? `<a href="${escapeHtml(c.video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:14px;"><i data-lucide="play" class="icon-sm icon-inline"></i>Watch</a>` : ''}
      ${isStaff ? `<button class="btn btn-danger btn-sm" data-delete-combo="${c.id}" style="margin-top:14px; margin-left:8px;"><i data-lucide="trash-2" class="icon-sm"></i></button>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('[data-delete-combo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('combos').delete().eq('id', btn.dataset.deleteCombo);
      loadCombos();
    });
  });
  refreshIcons();
}

async function handleCreateCombo(e) {
  e.preventDefault();
  if (!currentSteps.length) { showToast('Add at least one step to the combo.', true); return; }

  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    title: document.getElementById('combo-title').value.trim(),
    difficulty: document.getElementById('combo-difficulty').value,
    description: document.getElementById('combo-description').value.trim() || null,
    video_url: document.getElementById('combo-video').value.trim() || null,
    steps: currentSteps,
    created_by: user.id,
  };
  if (!payload.title) return;

  const { error } = await sb.from('combos').insert(payload);
  if (error) { showToast(error.message, true); return; }

  document.getElementById('combo-form').reset();
  currentSteps = [];
  closeCompose();
  loadCombos();
}
