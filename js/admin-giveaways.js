// BloxCore — admin/giveaways/index.html logic

const GIVEAWAYS_PAGE_SIZE = 20;
let giveawaysPage = 0;
let selectedGiveawayIds = new Set();

let _giveawaysManageTabInit = false;

async function initGiveawaysManageTab() {
  if (_giveawaysManageTabInit) return;
  _giveawaysManageTabInit = true;

  try {
    await loadGiveaways(0);
    wireGiveawayBulkBar();

    document.getElementById('new-giveaway-btn').addEventListener('click', openGiveawayModal);
    document.getElementById('giveaway-modal-cancel').addEventListener('click', closeGiveawayModal);
    document.getElementById('giveaway-form').addEventListener('submit', handleCreate);

    document.getElementById('giveaways-table').addEventListener('click', (e) => {
      if (e.target.id === 'gv-prev') loadGiveaways(giveawaysPage - 1);
      if (e.target.id === 'gv-next') loadGiveaways(giveawaysPage + 1);
    });
  } catch (e) {
    console.error('Failed to init Giveaways tab:', e);
    _giveawaysManageTabInit = false;
    showToast('Something went wrong loading giveaways. Try again.', true);
  }
}

function wireGiveawayBulkBar() {
  document.getElementById('gv-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('[data-gv-select]').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) selectedGiveawayIds.add(cb.dataset.gvSelect);
      else selectedGiveawayIds.delete(cb.dataset.gvSelect);
    });
    updateGiveawayBulkBar();
  });
  document.getElementById('gv-bulk-delete-btn').addEventListener('click', bulkDeleteGiveaways);
}

function updateGiveawayBulkBar() {
  const count = selectedGiveawayIds.size;
  document.getElementById('gv-select-count').textContent = count ? `${count} selected` : 'Select giveaways below';
  document.getElementById('gv-bulk-delete-btn').disabled = count === 0;
}

async function bulkDeleteGiveaways() {
  const ids = Array.from(selectedGiveawayIds);
  if (!ids.length) return;
  if (!window.confirm(`Delete ${ids.length} giveaway${ids.length > 1 ? 's' : ''}? This also removes their entries and can't be undone.`)) return;

  const { error } = await sb.from('giveaways').delete().in('id', ids);
  if (error) { showToast(error.message, true); return; }
  showToast(`Deleted ${ids.length} giveaway${ids.length > 1 ? 's' : ''}.`);
  selectedGiveawayIds = new Set();
  await loadGiveaways(giveawaysPage);
}

async function loadGiveaways(page) {
  const table = document.getElementById('giveaways-table');
  giveawaysPage = page;
  const from = page * GIVEAWAYS_PAGE_SIZE;
  const to = from + GIVEAWAYS_PAGE_SIZE - 1;

  const [{ data: giveaways, error, count }, { data: counts }] = await Promise.all([
    sb.from('giveaways').select('*, profiles!giveaways_winner_user_id_fkey(username, display_name), submitter:profiles!giveaways_created_by_fkey(username, display_name)', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to),
    sb.rpc('get_giveaway_entry_counts'),
  ]);

  if (error) {
    table.innerHTML = `<p class="muted">Couldn't load giveaways right now.</p>`;
    document.getElementById('giveaway-bulk-bar').style.display = 'none';
    console.error(error);
    return;
  }

  if (!giveaways.length) {
    table.innerHTML = `<div class="empty-state">No giveaways yet — create the first one.</div>`;
    document.getElementById('giveaway-bulk-bar').style.display = 'none';
    return;
  }

  document.getElementById('giveaway-bulk-bar').style.display = 'flex';

  const countMap = new Map((counts || []).map(c => [c.giveaway_id, c.entry_count]));

  table.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    giveaways.map((g, i) => renderGiveawayRow(g, countMap.get(g.id) || 0, i === giveaways.length - 1)).join('') +
    `</div>` + renderGiveawaysPager(count);

  document.querySelectorAll('[data-gv-select]').forEach(cb => {
    cb.checked = selectedGiveawayIds.has(cb.dataset.gvSelect);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedGiveawayIds.add(cb.dataset.gvSelect);
      else selectedGiveawayIds.delete(cb.dataset.gvSelect);
      updateGiveawayBulkBar();
    });
  });
  updateGiveawayBulkBar();

  document.querySelectorAll('[data-pick-winner]').forEach(btn => {
    btn.addEventListener('click', () => pickWinner(btn.dataset.pickWinner, btn));
  });
  document.querySelectorAll('[data-delete-giveaway]').forEach(btn => {
    btn.addEventListener('click', () => deleteGiveaway(btn.dataset.deleteGiveaway, btn.dataset.title));
  });
  document.querySelectorAll('[data-approve-giveaway]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.rpc('review_giveaway', { p_giveaway_id: btn.dataset.approveGiveaway, p_approve: true });
      if (error) { showToast(error.message, true); return; }
      showToast('Giveaway approved and live.');
      loadGiveaways(giveawaysPage);
    });
  });
  document.querySelectorAll('[data-reject-giveaway]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const note = window.prompt('Reason for rejecting (shown to the submitter, optional):');
      if (note === null) return;
      const { error } = await sb.rpc('review_giveaway', { p_giveaway_id: btn.dataset.rejectGiveaway, p_approve: false, p_note: note.trim() || null });
      if (error) { showToast(error.message, true); return; }
      showToast('Giveaway rejected.');
      loadGiveaways(giveawaysPage);
    });
  });
  document.querySelectorAll('[data-approve-proof]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('giveaways').update({ proof_status: 'approved' }).eq('id', btn.dataset.approveProof);
      if (error) { showToast(error.message, true); return; }
      showToast('Proof approved.');
      loadGiveaways(giveawaysPage);
    });
  });
  document.querySelectorAll('[data-reject-proof]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('giveaways').update({ proof_status: 'rejected' }).eq('id', btn.dataset.rejectProof);
      if (error) { showToast(error.message, true); return; }
      showToast('Proof rejected.');
      loadGiveaways(giveawaysPage);
    });
  });
  refreshIcons();
}

function renderGiveawaysPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / GIVEAWAYS_PAGE_SIZE));
  return `
    <div class="flex-between" style="padding:14px 0;">
      <button class="btn btn-ghost btn-sm" id="gv-prev" ${giveawaysPage === 0 ? 'disabled' : ''}><i data-lucide="chevron-left" class="icon-sm"></i> Prev</button>
      <span class="muted" style="font-size:0.82rem;">Page ${giveawaysPage + 1} of ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" id="gv-next" ${giveawaysPage + 1 >= totalPages ? 'disabled' : ''}>Next <i data-lucide="chevron-right" class="icon-sm"></i></button>
    </div>
  `;
}

function renderGiveawayRow(g, entryCount, isLast) {
  const statusTag = g.status === 'active'
    ? `<span class="tag tag-easy">Active</span>`
    : g.status === 'pending'
    ? `<span class="tag tag-medium">Pending Review</span>`
    : g.status === 'rejected'
    ? `<span class="tag" style="background:rgb(var(--brass-rgb) / 0.16); color:var(--brass-bright);">Rejected</span>`
    : `<span class="tag" style="background:rgba(138,148,166,0.15); color:var(--ash);">Ended</span>`;
  const winnerLabel = g.winner_user_id ? `<i data-lucide="trophy" class="icon-sm" style="color:var(--brass-bright);"></i> ${escapeHtml(displayNameFor(g.profiles))}` : '';
  const image = g.image_url ? `<img src="${g.image_url}" alt="" loading="lazy" style="width:36px; height:36px; object-fit:contain; flex-shrink:0;">` : '';
  const submittedBy = g.submitter ? `<span class="muted"> · submitted by ${escapeHtml(displayNameFor(g.submitter))}</span>` : '';

  return `
    <div class="flex-between" style="padding:16px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        <input type="checkbox" data-gv-select="${g.id}" style="width:auto; margin:0; flex-shrink:0;">
        ${image}
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(g.title)} <span class="muted" style="font-weight:400;">— ${escapeHtml(g.prize)}</span>${submittedBy}</p>
          <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
            ${statusTag} ${g.proof_status === 'pending' ? `<span class="tag tag-medium">Proof Pending</span>` : ''} ${entryCount} entered · ends ${formatDate(g.ends_at)} ${winnerLabel ? `· ${winnerLabel}` : ''}
          </p>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0; align-items:center;">
        ${g.proof_status === 'pending' ? `
          <a href="${g.proof_url}" target="_blank" rel="noopener noreferrer" title="View proof screenshot">
            <img src="${g.proof_url}" alt="Proof" loading="lazy" style="width:36px; height:36px; object-fit:cover; border-radius:6px; border:1px solid var(--glass-border);">
          </a>
          <button class="btn btn-primary btn-sm" data-approve-proof="${g.id}">Approve Proof</button>
          <button class="btn btn-ghost btn-sm" data-reject-proof="${g.id}">Reject</button>
        ` : ''}
        ${g.status === 'pending' ? `
          <button class="btn btn-primary btn-sm" data-approve-giveaway="${g.id}">Approve</button>
          <button class="btn btn-ghost btn-sm" data-reject-giveaway="${g.id}">Reject</button>
        ` : ''}
        ${g.status === 'active' ? `<button class="btn btn-primary btn-sm" data-pick-winner="${g.id}">Pick Winner</button>` : ''}
        <button class="btn btn-danger btn-sm" data-delete-giveaway="${g.id}" data-title="${escapeHtml(g.title)}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `;
}

let prizeItems = [];
let prizeCategory = 'fruit';
let selectedPrize = null;
let selectedPrizeValueType = 'physical';
const PRIZE_RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4, limited: 5 };
const PRIZE_FRUIT_ORDER_MAP = new Map(BUILD_OPTIONS.fruit.map((f, i) => [f.value.toLowerCase(), i]));

async function openGiveawayModal() {
  document.getElementById('giveaway-error').style.display = 'none';
  document.getElementById('giveaway-form').reset();
  selectedPrize = null;
  selectedPrizeValueType = 'physical';
  document.getElementById('gv-prize-value-toggle').style.display = 'none';
  const valueEl = document.getElementById('gv-prize-picker-value');
  valueEl.classList.add('is-empty');
  valueEl.textContent = '— Choose a fruit or limited —';

  if (!prizeItems.length) {
    const { data: items } = await sb.from('bf_items').select('*').in('category', ['fruit', 'limited', 'gamepass']);
    prizeItems = (items || []).slice().sort((a, b) => {
      if (a.category === 'fruit' && b.category === 'fruit') {
        const ai = PRIZE_FRUIT_ORDER_MAP.get(a.name.toLowerCase());
        const bi = PRIZE_FRUIT_ORDER_MAP.get(b.name.toLowerCase());
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
      }
      const rarityDiff = (PRIZE_RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 9) - (PRIZE_RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 9);
      return rarityDiff !== 0 ? rarityDiff : a.name.localeCompare(b.name);
    });
  }

  document.getElementById('giveaway-modal').style.display = 'flex';
}

function closeGiveawayModal() {
  document.getElementById('giveaway-modal').style.display = 'none';
}

document.getElementById('gv-prize-picker-btn')?.addEventListener('click', () => {
  document.getElementById('gv-prize-picker-modal').classList.add('open');
  renderPrizePickerGrid();
});
document.getElementById('gv-prize-picker-close')?.addEventListener('click', () => {
  document.getElementById('gv-prize-picker-modal').classList.remove('open');
});
document.querySelectorAll('#gv-prize-category-tabs [data-category]').forEach(btn => {
  btn.addEventListener('click', () => {
    prizeCategory = btn.dataset.category;
    document.querySelectorAll('#gv-prize-category-tabs [data-category]').forEach(b => {
      b.className = `btn btn-sm ${b.dataset.category === prizeCategory ? 'btn-primary' : 'btn-ghost'}`;
    });
    renderPrizePickerGrid();
  });
});
document.getElementById('gv-prize-picker-search')?.addEventListener('input', renderPrizePickerGrid);
document.getElementById('gv-prize-value-toggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedPrize || selectedPrize.category !== 'fruit') return;
  selectedPrizeValueType = selectedPrizeValueType === 'permanent' ? 'physical' : 'permanent';
  renderSelectedPrizeValue();
});

function renderSelectedPrizeValue() {
  const valueEl = document.getElementById('gv-prize-picker-value');
  const toggleEl = document.getElementById('gv-prize-value-toggle');
  valueEl.classList.remove('is-empty');
  valueEl.innerHTML = `<img src="${selectedPrize.icon_url}" alt="" style="width:18px; height:18px; object-fit:contain; vertical-align:-4px; margin-right:6px;">${escapeHtml(selectedPrize.name)}`;

  if (selectedPrize.category === 'fruit') {
    toggleEl.style.display = 'inline-flex';
    toggleEl.className = `tag tag-${selectedPrizeValueType === 'permanent' ? 'legendary' : 'medium'}`;
    toggleEl.textContent = selectedPrizeValueType === 'permanent' ? 'Permanent' : 'Physical';
  } else {
    toggleEl.style.display = 'none';
  }
}

function renderPrizePickerGrid() {
  const query = document.getElementById('gv-prize-picker-search').value.trim().toLowerCase();
  const items = prizeItems.filter(i => i.category === prizeCategory && i.name.toLowerCase().includes(query));
  const grid = document.getElementById('gv-prize-picker-grid');

  grid.innerHTML = items.length
    ? items.map(item => `
        <div class="build-modal-tile" data-rarity="${(item.rarity || '').toLowerCase()}" data-pick-prize="${item.id}">
          ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy">` : `<i data-lucide="sparkles" class="icon-lg"></i>`}
          <span>${escapeHtml(item.name)}</span>
        </div>
      `).join('')
    : `<p class="muted" style="grid-column:1/-1;">No items found${query ? ' matching your search' : ''}.</p>`;

  grid.querySelectorAll('[data-pick-prize]').forEach(tile => {
    tile.addEventListener('click', () => {
      selectedPrize = prizeItems.find(i => i.id === Number(tile.dataset.pickPrize));
      selectedPrizeValueType = selectedPrize.category === 'fruit' ? 'physical' : 'permanent';
      document.getElementById('gv-prize-item').value = selectedPrize.id;
      renderSelectedPrizeValue();
      document.getElementById('gv-prize-picker-modal').classList.remove('open');
    });
  });
  refreshIcons();
}

async function handleCreate(e) {
  e.preventDefault();
  const errorEl = document.getElementById('giveaway-error');
  const saveBtn = e.target.querySelector('button[type="submit"]');
  errorEl.style.display = 'none';

  if (!selectedPrize) {
    errorEl.textContent = 'Pick a prize first.';
    errorEl.style.display = 'block';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Creating…';

  const { data: { session } } = await sb.auth.getSession();

  const payload = {
    title: document.getElementById('gv-title').value.trim(),
    prize: selectedPrizeValueType === 'permanent' && selectedPrize.category === 'fruit' ? `${selectedPrize.name} (Permanent)` : selectedPrize.name,
    description: document.getElementById('gv-description').value.trim(),
    ends_at: new Date(document.getElementById('gv-ends').value).toISOString(),
    image_url: selectedPrize.icon_url,
    status: 'active',
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

  closeGiveawayModal();
  showToast('Giveaway created.');
  await loadGiveaways(giveawaysPage);
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
  await loadGiveaways(giveawaysPage);
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
  await loadGiveaways(giveawaysPage);
}
