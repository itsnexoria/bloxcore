// BloxCore — whats-new/index.html logic

let isAdmin = false;

const TAG_COLOR = { feature: 'var(--purple)', update: 'var(--blue)', fix: 'var(--sea)', event: 'var(--gold)' };

document.addEventListener('DOMContentLoaded', async () => {
  const { profile } = await getCurrentProfile();
  isAdmin = profile?.role === 'admin';

  if (isAdmin) {
    document.getElementById('new-entry-btn').style.display = 'inline-flex';
    document.getElementById('new-entry-btn').addEventListener('click', () => {
      document.getElementById('entry-compose').style.display = 'block';
    });
    document.getElementById('entry-cancel-btn').addEventListener('click', () => {
      document.getElementById('entry-compose').style.display = 'none';
    });
    document.getElementById('entry-form').addEventListener('submit', handleCreateEntry);
  }

  await loadEntries();
});

async function loadEntries() {
  const list = document.getElementById('entry-list');
  const { data, error } = await sb.from('changelog_entries').select('*').order('created_at', { ascending: false }).limit(50);

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load updates right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty-state">Nothing posted yet — check back soon.</div>`;
    return;
  }

  list.innerHTML = data.map(entry => `
    <div class="panel" data-entry-id="${entry.id}">
      <div class="flex-between" style="align-items:flex-start;">
        <div>
          <span style="font-size:0.66rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${TAG_COLOR[entry.tag]};">${entry.tag}</span>
          <h3 style="margin:2px 0 0; font-size:1.1rem;">${escapeHtml(entry.title)}</h3>
        </div>
        <span class="muted" style="font-size:0.78rem; white-space:nowrap;">${formatDate(entry.created_at)}</span>
      </div>
      <p style="margin:10px 0 0; color:var(--ash); white-space:pre-wrap;">${escapeHtml(entry.description)}</p>
      ${isAdmin ? `<button class="btn btn-ghost btn-sm" data-delete-entry="${entry.id}" style="margin-top:12px;"><i data-lucide="trash-2" class="icon-sm"></i></button>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('[data-delete-entry]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('changelog_entries').delete().eq('id', btn.dataset.deleteEntry);
      loadEntries();
    });
  });
  refreshIcons();
}

async function handleCreateEntry(e) {
  e.preventDefault();
  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    title: document.getElementById('entry-title').value.trim(),
    tag: document.getElementById('entry-tag').value,
    description: document.getElementById('entry-description').value.trim(),
    created_by: user.id,
  };
  if (!payload.title || !payload.description) return;

  const { error } = await sb.from('changelog_entries').insert(payload);
  if (error) { showToast(error.message, true); return; }

  document.getElementById('entry-form').reset();
  document.getElementById('entry-compose').style.display = 'none';
  loadEntries();
}
