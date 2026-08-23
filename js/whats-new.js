// BloxCore — whats-new/index.html logic

let isAdmin = false;

const TAG_COLOR = { feature: 'var(--purple)', update: 'var(--blue)', fix: 'var(--sea)', event: 'var(--gold)' };

onReady(async () => {
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

const ENTRIES_PAGE_SIZE = 20;
let entryListDelegated = false;

function renderEntry(entry) {
  return `
    <div class="panel" data-entry-id="${entry.id}">
      <div class="flex-between" style="align-items:flex-start;">
        <div>
          <span style="font-size:0.66rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${TAG_COLOR[entry.tag]};">${entry.tag}</span>
          <h3 style="margin:2px 0 0; font-size:1.1rem;">${escapeHtml(entry.title)}</h3>
        </div>
        <span class="muted" style="font-size:0.78rem; white-space:nowrap;">${formatDate(entry.created_at)}</span>
      </div>
      <div style="margin:10px 0 0; color:var(--ash);">${markdownToHtml(entry.description)}</div>
      ${isAdmin ? `<button class="btn btn-ghost btn-sm" data-delete-entry="${entry.id}" style="margin-top:12px;" aria-label="Delete entry"><i data-lucide="trash-2" class="icon-sm"></i></button>` : ''}
    </div>
  `;
}

async function loadEntries() {
  const list = document.getElementById('entry-list');
  const { data, error } = await sb.from('changelog_entries').select('*').order('created_at', { ascending: false }).range(0, ENTRIES_PAGE_SIZE - 1);

  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load updates right now.</p>`;
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty-state">Nothing posted yet — check back soon.</div>`;
    return;
  }

  list.innerHTML = data.map(renderEntry).join('');
  refreshIcons();

  // Delegate delete clicks once so newly-appended (Load More) entries work without rewiring.
  if (!entryListDelegated) {
    entryListDelegated = true;
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-entry]');
      if (!btn) return;
      if (!window.confirm('Delete this changelog entry?')) return;
      await sb.from('changelog_entries').delete().eq('id', btn.dataset.deleteEntry);
      btn.closest('[data-entry-id]')?.remove();
    });
  }

  const oldWrap = document.getElementById('entries-load-more-wrap');
  if (oldWrap) oldWrap.remove();
  if (data.length === ENTRIES_PAGE_SIZE) {
    attachLoadMore(list, {
      wrapId: 'entries-load-more-wrap',
      pageSize: ENTRIES_PAGE_SIZE,
      initialOffset: data.length,
      fetchPage: async (offset, pageSize) => {
        const { data: rows } = await sb.from('changelog_entries').select('*').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
        return rows || [];
      },
      renderItem: renderEntry,
      onAppend: refreshIcons,
    });
  }
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
