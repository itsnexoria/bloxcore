// BloxCore — admin/giveaways/index.html logic

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireMod();
  if (!auth) return;

  await loadGiveaways();

  document.getElementById('new-giveaway-btn').addEventListener('click', openModal);
  document.getElementById('giveaway-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('giveaway-form').addEventListener('submit', handleCreate);
});

async function loadGiveaways() {
  const table = document.getElementById('giveaways-table');

  const [{ data: giveaways, error }, { data: counts }] = await Promise.all([
    sb.from('giveaways').select('*, profiles!giveaways_winner_user_id_fkey(username, display_name)').order('created_at', { ascending: false }),
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

  table.innerHTML = `<div class="panel" style="padding:0;">` +
    giveaways.map((g, i) => renderRow(g, countMap.get(g.id) || 0, i === giveaways.length - 1)).join('') +
    `</div>`;

  document.querySelectorAll('[data-pick-winner]').forEach(btn => {
    btn.addEventListener('click', () => pickWinner(btn.dataset.pickWinner, btn));
  });
  document.querySelectorAll('[data-delete-giveaway]').forEach(btn => {
    btn.addEventListener('click', () => deleteGiveaway(btn.dataset.deleteGiveaway, btn.dataset.title));
  });
}

function renderRow(g, entryCount, isLast) {
  const statusTag = g.status === 'active'
    ? `<span class="tag tag-easy">Active</span>`
    : `<span class="tag" style="background:rgba(138,148,166,0.15); color:var(--ash);">Ended</span>`;
  const winnerLabel = g.winner_user_id ? `🏆 ${escapeHtml(displayNameFor(g.profiles))}` : '';

  return `
    <div class="flex-between" style="padding:16px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="min-width:0;">
        <p style="margin:0; font-weight:700;">${escapeHtml(g.title)} <span class="muted" style="font-weight:400;">— ${escapeHtml(g.prize)}</span></p>
        <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">
          ${statusTag} ${entryCount} entered · ends ${formatDate(g.ends_at)} ${winnerLabel ? `· ${winnerLabel}` : ''}
        </p>
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
  document.getElementById('giveaway-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('giveaway-modal').style.display = 'none';
}

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
  await loadGiveaways();
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
  await loadGiveaways();
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
  await loadGiveaways();
}
