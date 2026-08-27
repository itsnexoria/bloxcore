// BloxCore — giveaways/index.html logic

let currentUser = null;
let enteredGiveawayIds = new Set();
let prizeItems = [];
let prizeCategory = 'fruit';
let selectedPrize = null;
let selectedPrizeValueType = 'physical';

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4, limited: 5 };
const FRUIT_ORDER_MAP = new Map(BUILD_OPTIONS.fruit.map((f, i) => [f.value.toLowerCase(), i]));

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    const { data: entries } = await sb.from('giveaway_entries').select('giveaway_id').eq('user_id', currentUser.id);
    enteredGiveawayIds = new Set((entries || []).map(e => e.giveaway_id));

    const { data: items } = await sb.from('bf_items').select('*').in('category', ['fruit', 'limited', 'gamepass']);
    prizeItems = (items || []).slice().sort((a, b) => {
      if (a.category === 'fruit' && b.category === 'fruit') {
        const ai = FRUIT_ORDER_MAP.get(a.name.toLowerCase());
        const bi = FRUIT_ORDER_MAP.get(b.name.toLowerCase());
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
      }
      const rarityDiff = (RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 9) - (RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 9);
      return rarityDiff !== 0 ? rarityDiff : a.name.localeCompare(b.name);
    });

    document.getElementById('submit-giveaway-btn').style.display = 'inline-flex';
    document.getElementById('submit-giveaway-btn').addEventListener('click', () => {
      document.getElementById('giveaway-submit-modal').classList.add('open');
    });
    document.getElementById('giveaway-submit-close').addEventListener('click', () => {
      document.getElementById('giveaway-submit-modal').classList.remove('open');
    });
    document.getElementById('giveaway-submit-form').addEventListener('submit', handleSubmitGiveaway);

    document.getElementById('gv-proof-close').addEventListener('click', () => {
      document.getElementById('gv-proof-modal').classList.remove('open');
    });
    document.getElementById('gv-proof-form').addEventListener('submit', handleSubmitProof);

    document.getElementById('gv-prize-picker-btn').addEventListener('click', () => {
      document.getElementById('gv-prize-picker-modal').classList.add('open');
      renderPrizePickerGrid();
    });
    document.getElementById('gv-prize-picker-close').addEventListener('click', () => {
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
    document.getElementById('gv-prize-picker-search').addEventListener('input', renderPrizePickerGrid);
    document.getElementById('gv-prize-value-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!selectedPrize || selectedPrize.category !== 'fruit') return;
      selectedPrizeValueType = selectedPrizeValueType === 'permanent' ? 'physical' : 'permanent';
      renderSelectedPrizeValue();
    });
  }

  await loadGiveaways();
});

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
      // Only fruits can be given as a physical (dupeable) drop vs. a permanent (gamepass-bought)
      // copy — limiteds and gamepasses are always permanent, same rule as trading.js.
      selectedPrizeValueType = selectedPrize.category === 'fruit' ? 'physical' : 'permanent';
      document.getElementById('gv-prize-item').value = selectedPrize.id;
      renderSelectedPrizeValue();
      document.getElementById('gv-prize-picker-modal').classList.remove('open');
    });
  });
  refreshIcons();
}

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

async function handleSubmitGiveaway(e) {
  e.preventDefault();
  if (!selectedPrize) { showToast('Pick a prize first.', true); return; }

  const payload = {
    title: document.getElementById('gv-title').value.trim(),
    prize: selectedPrizeValueType === 'permanent' && selectedPrize.category === 'fruit' ? `${selectedPrize.name} (Permanent)` : selectedPrize.name,
    image_url: selectedPrize.icon_url,
    description: document.getElementById('gv-description').value.trim(),
    ends_at: new Date(document.getElementById('gv-ends').value).toISOString(),
    status: 'pending',
    created_by: currentUser.id,
  };
  if (!payload.title || !payload.description) return;

  const { error } = await sb.from('giveaways').insert(payload);
  if (error) { showToast(error.message, true); return; }

  document.getElementById('giveaway-submit-form').reset();
  selectedPrize = null;
  selectedPrizeValueType = 'physical';
  document.getElementById('gv-prize-value-toggle').style.display = 'none';
  const valueEl = document.getElementById('gv-prize-picker-value');
  valueEl.classList.add('is-empty');
  valueEl.textContent = '— Choose a prize —';
  document.getElementById('giveaway-submit-modal').classList.remove('open');
  showToast("Submitted — staff will review it before it goes live.");
}

async function handleSubmitProof(e) {
  e.preventDefault();
  const giveawayId = document.getElementById('gv-proof-giveaway-id').value;
  const file = document.getElementById('gv-proof-file').files[0];
  const errorEl = document.getElementById('gv-proof-error');
  const submitBtn = document.getElementById('gv-proof-submit-btn');
  errorEl.style.display = 'none';

  if (!file) { errorEl.textContent = 'Add a screenshot.'; errorEl.style.display = 'block'; return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading…';

  try {
    const proofUrl = await uploadScreenshot(currentUser.id, file, `giveaway-${giveawayId}-${Date.now()}`);

    const { error: rpcError } = await sb.rpc('submit_giveaway_proof', {
      p_giveaway_id: giveawayId,
      p_proof_url: proofUrl,
    });
    if (rpcError) throw rpcError;

    document.getElementById('gv-proof-modal').classList.remove('open');
    showToast('Submitted — staff will review your proof.');
    loadGiveaways();
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit for Review';
  }
}

const ENDED_GIVEAWAYS_PAGE_SIZE = 20;

async function loadGiveaways() {
  const activeEl = document.getElementById('active-giveaways');
  const endedEl = document.getElementById('ended-giveaways');

  // Active giveaways are naturally bounded (they end automatically), so they're fetched
  // in full; the ended history keeps growing forever, so that one is paginated.
  const [{ data: active, error }, { data: counts }, endedFirstPage] = await Promise.all([
    sb.from('giveaways').select('*, profiles!giveaways_winner_user_id_fkey(username, display_name)').eq('status', 'active').order('ends_at', { ascending: true }),
    sb.rpc('get_giveaway_entry_counts'),
    fetchEndedGiveawaysPage(0, ENDED_GIVEAWAYS_PAGE_SIZE),
  ]);

  if (error) {
    activeEl.innerHTML = `<p class="muted">Couldn't load giveaways right now.</p>`;
    console.error(error);
    return;
  }

  const countMap = new Map((counts || []).map(c => [c.giveaway_id, c.entry_count]));

  activeEl.innerHTML = active.length
    ? active.map(g => renderActiveCard(g, countMap.get(g.id) || 0)).join('')
    : `<div class="empty-state" style="grid-column:1/-1;">No active giveaways right now — check back soon.</div>`;

  const ended = endedFirstPage || [];
  endedEl.innerHTML = ended.length
    ? ended.map(renderEndedRow).join('')
    : `<div class="empty-state">No giveaways have ended yet.</div>`;

  document.querySelectorAll('[data-enter-id]').forEach(btn => {
    btn.addEventListener('click', () => enterGiveaway(btn.dataset.enterId, btn));
  });
  document.querySelectorAll('[data-mark-complete]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('gv-proof-giveaway-id').value = btn.dataset.markComplete;
      document.getElementById('gv-proof-form').reset();
      document.getElementById('gv-proof-error').style.display = 'none';
      document.getElementById('gv-proof-modal').classList.add('open');
    });
  });
  refreshIcons();

  if (ended.length === ENDED_GIVEAWAYS_PAGE_SIZE) {
    attachLoadMore(endedEl, {
      wrapId: 'ended-giveaways-load-more-wrap',
      pageSize: ENDED_GIVEAWAYS_PAGE_SIZE,
      initialOffset: ended.length,
      fetchPage: async (offset, pageSize) => (await fetchEndedGiveawaysPage(offset, pageSize)) || [],
      renderItem: renderEndedRow,
    });
  }
}

async function fetchEndedGiveawaysPage(offset, pageSize) {
  const { data, error } = await sb
    .from('giveaways')
    .select('*, profiles!giveaways_winner_user_id_fkey(username, display_name)')
    .eq('status', 'ended')
    .order('ends_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) { console.error(error); return null; }
  return data;
}

function renderActiveCard(g, entryCount) {
  const alreadyEntered = enteredGiveawayIds.has(g.id);
  const ended = new Date(g.ends_at).getTime() < Date.now();

  let actionHtml;
  if (!currentUser) {
    actionHtml = `<a href="/auth/" class="btn btn-primary btn-block">Sign in to Enter</a>`;
  } else if (ended) {
    actionHtml = `<button class="btn btn-ghost btn-block" disabled>Ending soon…</button>`;
  } else if (alreadyEntered) {
    actionHtml = `<button class="btn btn-ghost btn-block" disabled><i data-lucide="check" class="icon-sm"></i> Entered</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-block" data-enter-id="${g.id}">Enter Giveaway</button>`;
  }

  return `
    <div class="panel">
      ${g.image_url ? `<img src="${g.image_url}" alt="" loading="lazy" style="width:56px; height:56px; object-fit:contain; margin-bottom:12px;">` : ''}
      <h3 style="font-size:1.1rem; margin-bottom:4px;">${escapeHtml(g.title)}</h3>
      <p class="rank-title" style="font-size:1.1rem; margin:0 0 10px;">${escapeHtml(g.prize)}</p>
      <p class="muted" style="font-size:0.88rem; margin:0 0 14px;">${escapeHtml(g.description)}</p>
      <p class="muted" style="font-size:0.8rem; font-family:var(--font-mono); margin:0 0 14px;">
        ${entryCount} entered · ${timeRemaining(g.ends_at)}
      </p>
      ${actionHtml}
      ${currentUser && g.created_by === currentUser.id ? `<button type="button" class="btn btn-ghost btn-block" style="margin-top:8px;" data-mark-complete="${g.id}"><i data-lucide="camera" class="icon-sm icon-inline"></i>Mark Completed</button>` : ''}
    </div>
  `;
}

function renderEndedRow(g) {
  const winnerName = g.winner_user_id ? displayNameFor(g.profiles) : 'No entries';
  const proofTag = g.proof_status === 'approved'
    ? `<span class="tag tag-easy">Proof Verified</span>`
    : g.proof_status === 'pending'
    ? `<span class="tag tag-medium">Proof Pending Review</span>`
    : g.proof_status === 'rejected'
    ? `<span class="tag" style="background:rgba(220,38,38,0.16); color:var(--blood-dim);">Proof Rejected</span>`
    : '';
  return `
    <div class="panel flex-between" style="margin-bottom:12px; flex-wrap:wrap; gap:10px;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${g.image_url ? `<img src="${g.image_url}" alt="" loading="lazy" style="width:40px; height:40px; object-fit:contain; border-radius:var(--radius-sm, 8px); border:1px solid var(--glass-border); background:rgba(255,255,255,0.03); padding:4px; flex-shrink:0;">` : ''}
        <div>
          <p style="margin:0; font-weight:700;">${escapeHtml(g.title)}</p>
          <p class="muted" style="margin:2px 0 0; font-size:0.82rem;">${escapeHtml(g.prize)}</p>
          ${proofTag ? `<div style="margin-top:4px; display:flex; align-items:center; gap:8px;">${proofTag}${g.proof_url ? `<a href="${g.proof_url}" target="_blank" rel="noopener noreferrer" style="font-size:0.76rem; color:var(--brass-bright); text-decoration:underline;">View delivery proof</a>` : ''}</div>` : ''}
        </div>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">
        ${g.winner_user_id ? `<i data-lucide="trophy" class="icon-sm" style="color:var(--brass-bright);"></i> ${escapeHtml(winnerName)}` : winnerName}
      </p>
    </div>
  `;
}

async function enterGiveaway(giveawayId, btn) {
  btn.disabled = true;
  btn.textContent = 'Entering…';

  const { error } = await sb.from('giveaway_entries').insert({ giveaway_id: giveawayId, user_id: currentUser.id });

  if (error) {
    showToast(error.message, true);
    btn.disabled = false;
    btn.textContent = 'Enter Giveaway';
    return;
  }

  enteredGiveawayIds.add(giveawayId);
  showToast('Entered! Good luck.');
  await loadGiveaways();
}
