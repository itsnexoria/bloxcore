// BloxCore — giveaways/index.html logic

let currentUser = null;
let enteredGiveawayIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    const { data: entries } = await sb.from('giveaway_entries').select('giveaway_id').eq('user_id', currentUser.id);
    enteredGiveawayIds = new Set((entries || []).map(e => e.giveaway_id));
  }

  await loadGiveaways();
});

async function loadGiveaways() {
  const activeEl = document.getElementById('active-giveaways');
  const endedEl = document.getElementById('ended-giveaways');

  const [{ data: giveaways, error }, { data: counts }] = await Promise.all([
    sb.from('giveaways').select('*, profiles!giveaways_winner_user_id_fkey(username, display_name)').order('ends_at', { ascending: true }),
    sb.rpc('get_giveaway_entry_counts'),
  ]);

  if (error) {
    activeEl.innerHTML = `<p class="muted">Couldn't load giveaways right now.</p>`;
    console.error(error);
    return;
  }

  const countMap = new Map((counts || []).map(c => [c.giveaway_id, c.entry_count]));
  const active = giveaways.filter(g => g.status === 'active');
  const ended = giveaways.filter(g => g.status === 'ended');

  activeEl.innerHTML = active.length
    ? active.map(g => renderActiveCard(g, countMap.get(g.id) || 0)).join('')
    : `<div class="empty-state" style="grid-column:1/-1;">No active giveaways right now — check back soon.</div>`;

  endedEl.innerHTML = ended.length
    ? ended.map(renderEndedRow).join('')
    : `<div class="empty-state">No giveaways have ended yet.</div>`;

  document.querySelectorAll('[data-enter-id]').forEach(btn => {
    btn.addEventListener('click', () => enterGiveaway(btn.dataset.enterId, btn));
  });
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
    actionHtml = `<button class="btn btn-ghost btn-block" disabled>✓ Entered</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-block" data-enter-id="${g.id}">Enter Giveaway</button>`;
  }

  return `
    <div class="panel">
      ${g.image_url ? `<img src="${g.image_url}" alt="" style="width:56px; height:56px; object-fit:contain; margin-bottom:12px;">` : ''}
      <h3 style="font-size:1.1rem; margin-bottom:4px;">${escapeHtml(g.title)}</h3>
      <p class="rank-title" style="font-size:1.1rem; margin:0 0 10px;">${escapeHtml(g.prize)}</p>
      <p class="muted" style="font-size:0.88rem; margin:0 0 14px;">${escapeHtml(g.description)}</p>
      <p class="muted" style="font-size:0.8rem; font-family:var(--font-mono); margin:0 0 14px;">
        ${entryCount} entered · ${timeRemaining(g.ends_at)}
      </p>
      ${actionHtml}
    </div>
  `;
}

function renderEndedRow(g) {
  const winnerName = g.winner_user_id ? displayNameFor(g.profiles) : 'No entries';
  return `
    <div class="panel flex-between" style="margin-bottom:12px;">
      <div>
        <p style="margin:0; font-weight:700;">${escapeHtml(g.title)}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.82rem;">${escapeHtml(g.prize)}</p>
      </div>
      <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">
        ${g.winner_user_id ? `🏆 ${escapeHtml(winnerName)}` : winnerName}
      </p>
    </div>
  `;
}

function timeRemaining(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Ending soon';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `Ends in ${hours}h ${minutes}m`;
  return `Ends in ${minutes}m`;
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
