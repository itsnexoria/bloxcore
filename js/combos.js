// BloxCore — combos/index.html logic

let isStaff = false;
let allCombos = [];
let activeFilter = 'all';

const CATEGORY_LABEL = { fruit: 'Fruit', melee: 'Melee', sword: 'Sword', gun: 'Gun' };
const CATEGORY_COLOR = { fruit: 'var(--brass-bright)', melee: 'var(--gold)', sword: 'var(--blue)', gun: 'var(--purple)' };
const COMBO_SELECT_IDS = { melee: 'combo-melee', fruit: 'combo-fruit', sword: 'combo-sword', gun: 'combo-gun' };

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
    Object.entries(COMBO_SELECT_IDS).forEach(([category, id]) => {
      const select = document.getElementById(id);
      select.innerHTML += (BUILD_OPTIONS[category] || []).map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.value)}</option>`).join('');
    });
  }

  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.difficulty));
  });

  await loadCombos();
});

function setFilter(difficulty) {
  activeFilter = difficulty;
  document.querySelectorAll('#combo-filters [data-difficulty]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.difficulty === difficulty ? 'btn-primary' : 'btn-ghost'}`;
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
  const items = activeFilter === 'all' ? allCombos : allCombos.filter(c => c.difficulty === activeFilter);

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
            ${CATEGORY_LABEL[s.category]}: ${escapeHtml(s.item)}
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

  const steps = Object.entries(COMBO_SELECT_IDS)
    .map(([category, id]) => ({ category, item: document.getElementById(id).value }))
    .filter(s => s.item);

  if (!steps.length) { showToast('Pick at least one of Melee, Fruit, Sword, or Gun.', true); return; }

  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    title: document.getElementById('combo-title').value.trim(),
    difficulty: document.getElementById('combo-difficulty').value,
    description: document.getElementById('combo-description').value.trim() || null,
    video_url: document.getElementById('combo-video').value.trim() || null,
    steps,
    created_by: user.id,
  };
  if (!payload.title) return;

  const { error } = await sb.from('combos').insert(payload);
  if (error) { showToast(error.message, true); return; }

  document.getElementById('combo-form').reset();
  document.getElementById('combo-compose').style.display = 'none';
  loadCombos();
}
