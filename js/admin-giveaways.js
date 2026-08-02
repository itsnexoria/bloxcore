// BloxCore — admin/giveaways/index.html logic

const PAGE_SIZE = 20;
let currentPage = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireMod();
  if (!auth) return;

  await loadGiveaways(0);

  document.getElementById('new-giveaway-btn').addEventListener('click', openModal);
  document.getElementById('giveaway-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('giveaway-form').addEventListener('submit', handleCreate);

  document.getElementById('giveaways-table').addEventListener('click', (e) => {
    if (e.target.id === 'gv-prev') loadGiveaways(currentPage - 1);
    if (e.target.id === 'gv-next') loadGiveaways(currentPage + 1);
  });
});

async function loadGiveaways(page) {
  const table = document.getElementById('giveaways-table');
  currentPage = page;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ data: giveaways, error, count }, { data: counts }] = await Promise.all([
    sb.from('giveaways').select('*, profiles!giveaways_winner_user_id_fkey(username, display_name)', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to),
    sb.rpc('get_giveaway_entry_counts'),
  ]);

  if (error) {
    table.innerHTML = `<p class="muted">Couldn't load giveaways right now.</p>`;
    console.error(error);
    return;
  }

  if (!giveaways.length) {
    table.innerHTML = `<div class="empty-state">No giveaways yet — create the first one.</div>`;
    return;
  }

  const countMap = new Map((counts || []).map(c => [c.giveaway_id, c.entry_count]));

  table.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    giveaways.map((g, i) => renderRow(g, countMap.get(g.id) || 0, i === giveaways.length - 1)).join('') +
    `</div>` + renderPager(count);

  document.querySelectorAll('[data-pick-winner]').forEach(btn => {
    btn.addEventListener('click', () => pickWinner(btn.dataset.pickWinner, btn));
  });
  document.querySelectorAll('[data-delete-giveaway]').forEach(btn => {
    btn.addEventListener('click', () => deleteGiveaway(btn.dataset.deleteGiveaway, btn.dataset.title));
  });
  refreshIcons();
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 0;">
      <button class="btn btn-ghost btn-sm" id="gv-prev" ${currentPage === 0 ? 'disabled' : ''}><i data-lucide="chevron-left" class="icon-sm"></i> Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${currentPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="gv-next" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Next <i data-lucide="chevron-right" class="icon-sm"></i></button>
    </div>
  `;
}

function renderRow(g, entryCount, isLast) {
  const statusTag = g.status === 'active'
    ? `<span class="tag tag-easy">Active</span>`
    : `<span class="tag" style="background:rgba(138,148,166,0.15); color:var(--ash);">Ended</span>`;
  const winnerLabel = g.winner_user_id ? `<i data-lucide="trophy" class="icon-sm" style="color:var(--brass-bright);"></i> ${escapeHtml(displayNameFor(g.profiles))}` : '';
  const image = g.image_url ? `<img src="${g.image_url}" alt="" style="width:36px; height:36px; object-fit:contain; flex-shrink:0;">` : '';

  return `
    <div class="flex-between" style="padding:16px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        ${image}
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(g.title)} <span class="muted" style="font-weight:400;">— ${escapeHtml(g.prize)}</span></p>
          <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
            ${statusTag} ${entryCount} entered · ends ${formatDate(g.ends_at)} ${winnerLabel ? `· ${winnerLabel}` : ''}
          </p>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        ${g.status === 'active' ? `<button class="btn btn-primary btn-sm" data-pick-winner="${g.id}">Pick Winner</button>` : ''}
        <button class="btn btn-danger btn-sm" data-delete-giveaway="${g.id}" data-title="${escapeHtml(g.title)}">Delete</button>
      </div>
    </div>
  `;
}

function openModal() {
  document.getElementById('giveaway-error').style.display = 'none';
  document.getElementById('giveaway-form').reset();
  const itemSelect = document.getElementById('gv-icon-item');
  itemSelect.innerHTML = '<option value="">— None —</option>' +
    BUILD_OPTIONS.fruit.map(opt => `<option value="${escapeHtml(opt.icon)}">${escapeHtml(opt.value)}</option>`).join('');
  document.getElementById('gv-icon-preview').style.display = 'none';
  document.getElementById('giveaway-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('giveaway-modal').style.display = 'none';
}

document.getElementById('gv-icon-item')?.addEventListener('change', (e) => {
  const preview = document.getElementById('gv-icon-preview');
  if (e.target.value) {
    preview.src = e.target.value;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
});

async function handleCreate(e) {
  e.preventDefault();
  const errorEl = document.getElementById('giveaway-error');
  const saveBtn = e.target.querySelector('button[type="submit"]');
  errorEl.style.display = 'none';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Creating…';

  const { data: { session } } = await sb.auth.getSession();

  const payload = {
    title: document.getElementById('gv-title').value.trim(),
    prize: document.getElementById('gv-prize').value.trim(),
    description: document.getElementById('gv-description').value.trim(),
    ends_at: new Date(document.getElementById('gv-ends').value).toISOString(),
    image_url: document.getElementById('gv-icon-item').value || null,
    created_by: session.user.id,
  };

  const { error } = await sb.from('giveaways').insert(payload);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Create Giveaway';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  closeModal();
  showToast('Giveaway created.');
  await loadGiveaways(currentPage);
}

async function pickWinner(id, btn) {
  const confirmed = window.confirm('Pick a random winner now? This ends the giveaway immediately — new entries will stop.');
  if (!confirmed) return;

  btn.disabled = true;
  btn.textContent = 'Picking…';

  const { error } = await sb.rpc('pick_giveaway_winner', { p_giveaway_id: id });

  if (error) {
    showToast(error.message, true);
    btn.disabled = false;
    btn.textContent = 'Pick Winner';
    return;
  }

  showToast('Winner picked!');
  await loadGiveaways(currentPage);
}

async function deleteGiveaway(id, title) {
  const confirmed = window.confirm(`Delete "${title}"? This also removes all its entries and can't be undone.`);
  if (!confirmed) return;

  const { error } = await sb.from('giveaways').delete().eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('Giveaway deleted.');
  await loadGiveaways(currentPage);
}
