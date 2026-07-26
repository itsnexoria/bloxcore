// BloxCore — admin.html logic

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  await loadPending();
});

async function loadPending() {
  const list = document.getElementById('pending-list');

  const { data, error } = await sb
    .from('submissions')
    .select('id, screenshot_url, submitted_at, profiles(username), challenges(title, xp_reward, difficulty)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load submissions right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nothing pending — the board is clear.</div>`;
    return;
  }

  list.innerHTML = data.map(renderPendingCard).join('');

  document.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', () => reviewSubmission(btn.dataset.approve, 'approve'));
  });
  document.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', () => reviewSubmission(btn.dataset.reject, 'reject'));
  });
}

function renderPendingCard(sub) {
  return `
    <div class="panel" id="sub-${sub.id}">
      <img src="${sub.screenshot_url}" alt="Submission proof" style="width:100%; border-radius:var(--radius); margin-bottom:14px; max-height:220px; object-fit:cover;">
      <p style="margin:0 0 4px; font-weight:700;">${escapeHtml(sub.challenges?.title || 'Challenge')}</p>
      <p class="muted" style="margin:0 0 4px; font-size:0.85rem;">
        by ${escapeHtml(sub.profiles?.username || 'unknown')} · <span class="tag tag-${sub.challenges?.difficulty}">${sub.challenges?.difficulty}</span> · +${sub.challenges?.xp_reward} XP
      </p>
      <p class="muted" style="margin:0 0 14px; font-size:0.78rem;">${formatDate(sub.submitted_at)}</p>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary btn-sm" data-approve="${sub.id}">Approve</button>
        <button class="btn btn-danger btn-sm" data-reject="${sub.id}">Reject</button>
      </div>
    </div>
  `;
}

async function reviewSubmission(id, action) {
  const card = document.getElementById(`sub-${id}`);
  const buttons = card.querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);

  const rpcName = action === 'approve' ? 'approve_submission' : 'reject_submission';
  const { error } = await sb.rpc(rpcName, { submission_id: id, note: null });

  if (error) {
    showToast(error.message, true);
    buttons.forEach(b => b.disabled = false);
    return;
  }

  showToast(action === 'approve' ? 'Approved and XP awarded.' : 'Rejected.');
  card.remove();
}
