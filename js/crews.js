// BloxCore — crews/index.html logic

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  await loadCrews();
  await guardCreateButton();

  document.getElementById('create-crew-btn').addEventListener('click', openModal);
  document.getElementById('crew-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('crew-form').addEventListener('submit', handleCreate);
});

// Every player can only ever be in one crew at a time (the DB enforces this with a unique
// constraint), so hide the confusing "you're already in a crew" error at submit time —
// just tell them up front and point them at the crew they're already in.
async function guardCreateButton() {
  const btn = document.getElementById('create-crew-btn');
  if (!currentUser) {
    btn.disabled = true;
    btn.title = 'Sign in to create a crew';
    return;
  }

  const { data } = await sb.from('crew_members').select('crews(name)').eq('user_id', currentUser.id).maybeSingle();
  if (data?.crews) {
    btn.textContent = 'Already in a Crew';
    btn.disabled = true;
    btn.title = `You're already in ${data.crews.name} — leave it first to create a new one.`;
  }
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
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:12px;">
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" style="width:52px; height:52px; border-radius:var(--radius-sm); object-fit:cover; flex-shrink:0; box-shadow:0 0 0 1px var(--glass-border), 0 0 18px rgb(var(--purple-rgb) / 0.25);" onerror="this.style.display='none';">`
          : `<div style="width:52px; height:52px; border-radius:var(--radius-sm); background:linear-gradient(150deg, var(--navy-light), var(--navy)); display:flex; align-items:center; justify-content:center; color:var(--ash); font-family:var(--font-stamp); font-size:1.2rem; flex-shrink:0;">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <div style="min-width:0;">
          <h3 style="font-size:1.05rem; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.name)}</h3>
          ${c.tag ? `<span class="tag tag-legendary" style="margin-top:4px; display:inline-block;">${escapeHtml(c.tag)}</span>` : ''}
        </div>
      </div>
      <p class="muted" style="font-size:0.88rem; margin:0 0 16px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(c.description)}</p>
      <a href="/crew/?name=${encodeURIComponent(c.name)}" class="btn btn-primary btn-sm btn-block">View Crew</a>
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

  const logoUrl = document.getElementById('crew-logo').value.trim();
  if (!error && logoUrl) {
    await sb.from('crews').update({ logo_url: logoUrl }).eq('id', crewId);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Create';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  window.location.href = `/crew/?name=${encodeURIComponent(document.getElementById('crew-name').value.trim())}`;
}
