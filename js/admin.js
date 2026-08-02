// BloxCore — admin.html logic (Review Board — mod + admin)
//
// Reviewed submissions (approved or rejected) are deleted immediately after review —
// along with their screenshots in storage — to keep the database and bucket lean.
// The XP/streak/rank effects of an approval are already permanently recorded on the
// player's profile, and a public record of the completion lives on in activity_log,
// so nothing about the *outcome* is lost — only the screenshots + the submission row itself.

let pendingSubs = [];
let selectedIds = new Set();
let lightboxUrls = [];
let lightboxIndex = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireMod();
  if (!auth) return;
  await loadPending();
  wireBulkBar();
  wireLightbox();
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

  pendingSubs = data;
  selectedIds = new Set();
  updateBulkBar();

  if (!data.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nothing pending — the board is clear.</div>`;
    document.getElementById('bulk-bar').style.display = 'none';
    return;
  }

  document.getElementById('bulk-bar').style.display = 'flex';
  list.innerHTML = data.map(renderPendingCard).join('');
  wireCardEvents();
}

function wireCardEvents() {
  document.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', () => reviewSubmission(btn.dataset.approve, 'approve'));
  });
  document.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', () => reviewSubmission(btn.dataset.reject, 'reject'));
  });
  document.querySelectorAll('[data-select]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(cb.dataset.select);
      else selectedIds.delete(cb.dataset.select);
      updateBulkBar();
    });
  });
  document.querySelectorAll('[data-lightbox-open]').forEach(img => {
    img.addEventListener('click', () => openLightbox(JSON.parse(img.dataset.lightboxOpen), Number(img.dataset.lightboxIndex)));
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
  const urlsJson = escapeHtml(JSON.stringify(urls));
  const gallery = urls.length
    ? `<div style="display:grid; grid-template-columns:repeat(${Math.min(urls.length, 2)}, 1fr); gap:8px; margin-bottom:14px;">
        ${urls.map((u, i) => `<img src="${u}" alt="Submission proof" data-lightbox-open='${urlsJson}' data-lightbox-index="${i}" style="width:100%; border-radius:var(--radius); max-height:260px; object-fit:cover; cursor:zoom-in;">`).join('')}
      </div>`
    : '';
  const videoLink = sub.video_url
    ? `<a href="${escapeHtml(sub.video_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-bottom:14px; display:inline-block;">▶ Watch video proof</a>`
    : '';

  return `
    <div class="panel" id="sub-${sub.id}">
      <label style="display:flex; align-items:center; gap:8px; text-transform:none; font-weight:600; margin-bottom:12px;">
        <input type="checkbox" data-select="${sub.id}" style="width:auto; margin:0;">
        <span class="muted" style="font-size:0.8rem;">Select for bulk action</span>
      </label>
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

// ---- Bulk bar ----

function wireBulkBar() {
  document.getElementById('select-all').addEventListener('change', (e) => {
    document.querySelectorAll('[data-select]').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) selectedIds.add(cb.dataset.select);
      else selectedIds.delete(cb.dataset.select);
    });
    updateBulkBar();
  });
  document.getElementById('bulk-approve-btn').addEventListener('click', () => bulkReview('approve'));
  document.getElementById('bulk-reject-btn').addEventListener('click', () => bulkReview('reject'));
}

function updateBulkBar() {
  const count = selectedIds.size;
  document.getElementById('select-count').textContent = count ? `${count} selected` : 'Select all';
  document.getElementById('bulk-approve-btn').disabled = count === 0;
  document.getElementById('bulk-reject-btn').disabled = count === 0;
  const selectAll = document.getElementById('select-all');
  selectAll.checked = count > 0 && count === pendingSubs.length;
  selectAll.indeterminate = count > 0 && count < pendingSubs.length;
}

async function bulkReview(action) {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;

  const verb = action === 'approve' ? 'approve' : 'reject';
  if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Reject'} ${ids.length} submission${ids.length > 1 ? 's' : ''}?`)) return;

  const bar = document.getElementById('bulk-bar');
  bar.querySelectorAll('button').forEach(b => b.disabled = true);

  let failed = 0;
  for (const id of ids) {
    const ok = await reviewSubmission(id, action, true);
    if (!ok) failed++;
  }

  showToast(failed
    ? `Done, but ${failed} submission${failed > 1 ? 's' : ''} couldn't be ${verb}d.`
    : `${ids.length} submission${ids.length > 1 ? 's' : ''} ${verb}d.`, failed > 0);
}

// silent=true suppresses the per-item toast/cleanup call sequence noise during a bulk run;
// returns true/false so bulkReview can count failures.
async function reviewSubmission(id, action, silent = false) {
  const card = document.getElementById(`sub-${id}`);
  const buttons = card?.querySelectorAll('button, input');
  buttons?.forEach(b => b.disabled = true);

  const rpcName = action === 'approve' ? 'approve_submission' : 'reject_submission';
  const { error } = await sb.rpc(rpcName, { submission_id: id, note: null });

  if (error) {
    if (!silent) showToast(error.message, true);
    buttons?.forEach(b => b.disabled = false);
    return false;
  }

  if (!silent) showToast(action === 'approve' ? 'Approved and XP awarded.' : 'Rejected.');

  const urls = card ? Array.from(card.querySelectorAll('img')).map(img => img.src) : [];
  card?.remove();
  pendingSubs = pendingSubs.filter(s => s.id !== id);
  selectedIds.delete(id);
  updateBulkBar();
  if (!pendingSubs.length) {
    document.getElementById('pending-list').innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nothing pending — the board is clear.</div>`;
    document.getElementById('bulk-bar').style.display = 'none';
  }
  cleanupReviewedSubmission(id, urls).catch(err => console.error('Cleanup failed:', err));
  return true;
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

// ---- Lightbox ----

function wireLightbox() {
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => stepLightbox(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => stepLightbox(1));
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });
}

function openLightbox(urls, index) {
  lightboxUrls = urls;
  lightboxIndex = index;
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

function stepLightbox(delta) {
  lightboxIndex = (lightboxIndex + delta + lightboxUrls.length) % lightboxUrls.length;
  renderLightbox();
}

function renderLightbox() {
  document.getElementById('lightbox-img').src = lightboxUrls[lightboxIndex];
  document.getElementById('lightbox-count').textContent = lightboxUrls.length > 1
    ? `${lightboxIndex + 1} / ${lightboxUrls.length}` : '';
  const multi = lightboxUrls.length > 1;
  document.getElementById('lightbox-prev').style.display = multi ? 'flex' : 'none';
  document.getElementById('lightbox-next').style.display = multi ? 'flex' : 'none';
}
