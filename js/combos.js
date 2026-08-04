// BloxCore — combos/index.html logic

let isStaff = false;
let allCombos = [];
let activeFilter = 'all';
let activeCategoryFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const { profile } = await getCurrentProfile();
  isStaff = profile?.role === 'mod' || profile?.role === 'admin';

  if (isStaff) {
    document.getElementById('new-combo-btn').style.display = 'inline-flex';
    document.getElementById('new-combo-btn').addEventListener('click', () => {
      document.getElementById('combo-compose').style.display = 'block';
    });
    document.getElementById('combo-cancel-btn').addEventListener('click', () => {
      document.getElementById('combo-compose').style.display = 'none';
    });
    document.getElementById('combo-form').addEventListener('submit', handleCreateCombo);
    document.getElementById('combo-category').addEventListener('change', populateComboItemSelect);
    populateComboItemSelect();
  }

  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.difficulty));
  });
  document.querySelectorAll('#combo-category-filters [data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => setCategoryFilter(btn.dataset.catFilter));
  });

  await loadCombos();
});

function populateComboItemSelect() {
  const category = document.getElementById('combo-category').value;
  const select = document.getElementById('combo-fruit');
  select.innerHTML = (BUILD_OPTIONS[category] || []).map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.value)}</option>`).join('');
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
    (activeCategoryFilter === 'all' || c.category === activeCategoryFilter)
  );

  if (!items.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No combos here yet.</div>`;
    return;
  }

  list.innerHTML = items.map(c => `
    <div class="panel" data-combo-id="${c.id}">
      <div class="flex-between" style="align-items:flex-start;">
        <div>
          <span class="muted" style="font-size:0.68rem; text-transform:uppercase; letter-spacing:0.05em;">${c.category}</span>
          <h3 style="margin:2px 0 0; font-size:1.05rem;">${escapeHtml(c.title)}</h3>
          ${c.fruit ? `<p class="muted" style="margin:2px 0 0; font-size:0.82rem;">${escapeHtml(c.fruit)}</p>` : ''}
        </div>
        <span class="tag tag-${c.difficulty}">${c.difficulty}</span>
      </div>
      <p style="margin:14px 0 0; font-size:0.9rem; white-space:pre-wrap; color:var(--ash);">${escapeHtml(c.description)}</p>
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
  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    title: document.getElementById('combo-title').value.trim(),
    category: document.getElementById('combo-category').value,
    fruit: document.getElementById('combo-fruit').value || null,
    difficulty: document.getElementById('combo-difficulty').value,
    description: document.getElementById('combo-description').value.trim(),
    video_url: document.getElementById('combo-video').value.trim() || null,
    created_by: user.id,
  };
  if (!payload.title || !payload.description) return;

  const { error } = await sb.from('combos').insert(payload);
  if (error) { showToast(error.message, true); return; }

  document.getElementById('combo-form').reset();
  populateComboItemSelect();
  document.getElementById('combo-compose').style.display = 'none';
  loadCombos();
}
