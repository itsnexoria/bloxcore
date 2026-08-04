// BloxCore — trading/index.html logic

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { user } = await getCurrentProfile();
  currentUser = user;

  document.getElementById('trade-compose').style.display = currentUser ? 'block' : 'none';
  document.getElementById('trade-signed-out').style.display = currentUser ? 'none' : 'block';

  await loadListings();
  document.getElementById('trade-form').addEventListener('submit', handlePost);
});

async function loadListings() {
  const container = document.getElementById('trade-listings');
  const { data, error } = await sb
    .from('trade_listings')
    .select('id, user_id, offering, seeking, note, created_at, profiles(username, display_name, avatar_url, title_color_override, titles(name, color))')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    container.innerHTML = `<p class="muted">Couldn't load listings right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No trade listings yet — be the first to post one.</div>`;
    return;
  }

  container.innerHTML = data.map(renderListing).join('');
  wireDeleteButtons();
  refreshIcons();
}

function renderListing(t) {
  const profile = t.profiles || {};
  const canDelete = currentUser && t.user_id === currentUser.id;

  return `
    <div class="panel" data-listing-id="${t.id}">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
        ${avatarHtml(profile, 30)}
        <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:var(--bone); font-weight:600; text-decoration:none; font-size:0.88rem;">${titleBadge(profile)} ${escapeHtml(displayNameFor(profile))}</a>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div>
          <p class="muted" style="margin:0; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.05em;">Offering</p>
          <p style="margin:0; color:var(--sea); font-weight:600;">${escapeHtml(t.offering)}</p>
        </div>
        <div>
          <p class="muted" style="margin:0; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.05em;">Seeking</p>
          <p style="margin:0; color:var(--gold-bright); font-weight:600;">${escapeHtml(t.seeking)}</p>
        </div>
        ${t.note ? `<p class="muted" style="margin:4px 0 0; font-size:0.82rem;">${escapeHtml(t.note)}</p>` : ''}
      </div>
      <div class="flex-between" style="margin-top:14px; padding-top:12px; border-top:1px solid var(--glass-border);">
        <span class="muted" style="font-size:0.75rem;">${timeAgo(t.created_at)}</span>
        ${canDelete ? `<button class="btn btn-ghost btn-sm" data-delete-listing="${t.id}"><i data-lucide="x" class="icon-sm"></i></button>` : ''}
      </div>
    </div>
  `;
}

function wireDeleteButtons() {
  document.querySelectorAll('[data-delete-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('trade_listings').delete().eq('id', btn.dataset.deleteListing);
      if (error) { showToast(error.message, true); return; }
      document.querySelector(`[data-listing-id="${btn.dataset.deleteListing}"]`)?.remove();
    });
  });
}

async function handlePost(e) {
  e.preventDefault();
  const offering = document.getElementById('trade-offering').value.trim();
  const seeking = document.getElementById('trade-seeking').value.trim();
  const note = document.getElementById('trade-note').value.trim();
  if (!offering || !seeking) return;

  const btn = document.getElementById('trade-submit-btn');
  btn.disabled = true;
  const { error } = await sb.from('trade_listings').insert({ user_id: currentUser.id, offering, seeking, note: note || null });
  btn.disabled = false;

  if (error) { showToast(error.message, true); return; }
  document.getElementById('trade-form').reset();
  showToast('Listing posted.');
  loadListings();
}
