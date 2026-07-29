// BloxCore — crews/index.html logic

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  await loadLeaderboard();
  await loadCrews();

  document.getElementById('create-crew-btn').addEventListener('click', openModal);
  document.getElementById('crew-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('crew-form').addEventListener('submit', handleCreate);
});

async function loadLeaderboard() {
  const el = document.getElementById('crew-leaderboard');
  const { data, error } = await sb.rpc('get_crew_leaderboard');

  if (error) {
    el.innerHTML = `<p class="muted" style="padding:20px;">Couldn't load the team leaderboard right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    el.innerHTML = `<div class="empty-state">No crews yet — be the first to start one.</div>`;
    return;
  }

  el.innerHTML = data.map((c, i) => `
    <div class="flex-between" style="padding:14px 20px; ${i !== data.length - 1 ? 'border-bottom:1px solid var(--navy-light);' : ''}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span style="font-family:var(--font-mono); color:var(--ash); width:24px;">#${i + 1}</span>
        <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">
          ${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}
        </a>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(c.total_xp).toLocaleString()} XP</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${c.member_count} member${c.member_count == 1 ? '' : 's'} · avg Lv. ${Math.round(c.avg_level)}</p>
      </div>
    </div>
  `).join('');
}

async function loadCrews() {
  const grid = document.getElementById('crews-grid');
  const { data, error } = await sb.from('crews').select('*').order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="muted">Couldn't load crews right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No crews yet.</div>`;
    return;
  }

  grid.innerHTML = data.map(c => `
    <div class="panel">
      <h3 style="font-size:1.05rem; margin-bottom:4px;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</h3>
      <p class="muted" style="font-size:0.88rem; margin:0 0 14px;">${escapeHtml(c.description)}</p>
      <a href="/crew/?name=${encodeURIComponent(c.name)}" class="btn btn-ghost btn-sm btn-block">View Crew</a>
    </div>
  `).join('');
}

function openModal() {
  if (!currentUser) {
    window.location.href = '/auth/';
    return;
  }
  document.getElementById('crew-error').style.display = 'none';
  document.getElementById('crew-form').reset();
  document.getElementById('crew-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('crew-modal').style.display = 'none';
}

async function handleCreate(e) {
  e.preventDefault();
  const errorEl = document.getElementById('crew-error');
  const saveBtn = e.target.querySelector('button[type="submit"]');
  errorEl.style.display = 'none';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Creating…';

  const { data: crewId, error } = await sb.rpc('create_crew', {
    p_name: document.getElementById('crew-name').value.trim(),
    p_tag: document.getElementById('crew-tag').value.trim() || null,
    p_description: document.getElementById('crew-description').value.trim(),
    p_roblox_username: document.getElementById('crew-roblox').value.trim() || null,
    p_discord_invite: document.getElementById('crew-discord').value.trim() || null,
  });

  saveBtn.disabled = false;
  saveBtn.textContent = 'Create';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  window.location.href = `/crew/?name=${encodeURIComponent(document.getElementById('crew-name').value.trim())}`;
}
