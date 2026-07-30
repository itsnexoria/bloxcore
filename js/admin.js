// BloxCore — admin.html logic (Review Board — mod + admin)
//
// Reviewed submissions (approved or rejected) are deleted immediately after review —
// along with their screenshots in storage — to keep the database and bucket lean.
// The XP/streak/rank effects of an approval are already permanently recorded on the
// player's profile, and a public record of the completion lives on in activity_log,
// so nothing about the *outcome* is lost — only the screenshots + the submission row itself.

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireMod();
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
    .select('id, screenshot_url, screenshot_urls, video_url, submitted_at, profiles!submissions_user_id_fkey(username), challenges(title, xp_reward, difficulty)')
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

// All screenshot URLs for a submission, tolerating older rows that only have the
// single legacy screenshot_url column.
function allScreenshotUrls(sub) {
  const urls = Array.isArray(sub.screenshot_urls) ? sub.screenshot_urls.slice() : [];
  if (sub.screenshot_url && !urls.includes(sub.screenshot_url)) urls.unshift(sub.screenshot_url);
  return urls;
}

function renderPendingCard(sub) {
  const urls = allScreenshotUrls(sub);
  const gallery = urls.length
    ? `<div style="display:grid; grid-template-columns:repeat(${Math.min(urls.length, 3)}, 1fr); gap:6px; margin-bottom:14px;">
        ${urls.map(u => `<img src="${u}" alt="Submission proof" style="width:100%; border-radius:var(--radius); max-height:160px; object-fit:cover;">`).join('')}
      </div>`
    : '';
  const videoLink = sub.video_url
    ? `<a href="${escapeHtml(sub.video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-bottom:14px; display:inline-block;">▶ Watch video proof</a>`
    : '';

  return `
    <div class="panel" id="sub-${sub.id}">
      ${gallery}
      ${videoLink}
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

  // Grab the screenshot URLs from the DOM before removing the card, then clean up
  // best-effort — the review already succeeded above, so a cleanup hiccup here
  // shouldn't surface as an error to the reviewer, just get logged. The submission
  // row itself is kept (not deleted) so the player still sees it in their history —
  // only the now-redundant screenshots get cleared out.
  const urls = Array.from(card.querySelectorAll('img')).map(img => img.src);
  card.remove();
  cleanupReviewedSubmission(id, urls).catch(err => console.error('Cleanup failed:', err));
}

async function cleanupReviewedSubmission(id, urls) {
  const paths = urls.map(extractStoragePath).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await sb.storage.from('screenshots').remove(paths);
    if (storageError) console.error('Could not delete screenshots from storage:', storageError);
  }

  const { error: updateError } = await sb.from('submissions').update({ screenshot_url: null, screenshot_urls: [] }).eq('id', id);
  if (updateError) console.error('Could not clear screenshot references:', updateError);
}

function extractStoragePath(url) {
  const marker = '/object/public/screenshots/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}
