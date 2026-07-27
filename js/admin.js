// BloxCore — admin.html logic
//
// Reviewed submissions (approved or rejected) are deleted immediately after review —
// along with their screenshot in storage — to keep the database and bucket lean.
// The XP/streak/rank effects of an approval are already permanently recorded on the
// player's profile, and a public record of the completion lives on in activity_log,
// so nothing about the *outcome* is lost — only the screenshot + the submission row itself.

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  await loadPending();
});

async function loadPending() {
  const list = document.getElementById('pending-list');

  const { data, error } = await sb
    .from('submissions')
    // profiles!submissions_user_id_fkey disambiguates the join: submissions has two
    // FKs into profiles (user_id and reviewed_by), so an unqualified profiles(...) embed
    // is ambiguous to PostgREST and fails with a 300 error.
    .select('id, screenshot_url, submitted_at, profiles!submissions_user_id_fkey(username), challenges(title, xp_reward, difficulty)')
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
    btn.addEventListener('click', () => reviewSubmission(btn.dataset.approve, 'approve', btn.dataset.screenshot));
  });
  document.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', () => reviewSubmission(btn.dataset.reject, 'reject', btn.dataset.screenshot));
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
        <button class="btn btn-primary btn-sm" data-approve="${sub.id}" data-screenshot="${escapeHtml(sub.screenshot_url)}">Approve</button>
        <button class="btn btn-danger btn-sm" data-reject="${sub.id}" data-screenshot="${escapeHtml(sub.screenshot_url)}">Reject</button>
      </div>
    </div>
  `;
}

async function reviewSubmission(id, action, screenshotUrl) {
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

  // Best-effort cleanup — the review already succeeded above, so a cleanup hiccup
  // here shouldn't surface as an error to the admin, just get logged.
  cleanupReviewedSubmission(id, screenshotUrl).catch(err => console.error('Cleanup failed:', err));
}

async function cleanupReviewedSubmission(id, screenshotUrl) {
  const path = extractStoragePath(screenshotUrl);
  if (path) {
    const { error: storageError } = await sb.storage.from('screenshots').remove([path]);
    if (storageError) console.error('Could not delete screenshot from storage:', storageError);
  }

  const { error: deleteError } = await sb.from('submissions').delete().eq('id', id);
  if (deleteError) console.error('Could not delete submission row:', deleteError);
}

function extractStoragePath(url) {
  const marker = '/object/public/screenshots/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}
