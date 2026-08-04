// BloxCore — admin/site/index.html logic (admin only): broadcasts + XP events

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;

  await loadBroadcasts();
  await loadEvents();

  document.getElementById('broadcast-form').addEventListener('submit', handleCreateBroadcast);
  document.getElementById('event-form').addEventListener('submit', handleCreateEvent);
});

const SEVERITY_COLOR = { info: 'var(--blue)', success: 'var(--sea)', warning: 'var(--gold)', danger: 'var(--blood)' };

async function loadBroadcasts() {
  const list = document.getElementById('broadcast-list');
  const { data } = await sb.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(10);
  if (!data || !data.length) { list.innerHTML = `<p class="muted" style="font-size:0.85rem;">No broadcasts yet.</p>`; return; }

  list.innerHTML = data.map(b => `
    <div class="flex-between" style="padding:10px 14px; border:1px solid var(--glass-border); border-radius:var(--radius-sm); ${b.active ? '' : 'opacity:0.5;'}">
      <div style="min-width:0;">
        <p style="margin:0; font-size:0.85rem; border-left:3px solid ${SEVERITY_COLOR[b.severity]}; padding-left:8px;">${escapeHtml(b.message)}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.72rem;">${timeAgo(b.created_at)} · ${b.severity}</p>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-toggle-broadcast="${b.id}" data-active="${b.active}">${b.active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn btn-danger btn-sm" data-delete-broadcast="${b.id}"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-toggle-broadcast]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('broadcasts').update({ active: btn.dataset.active !== 'true' }).eq('id', btn.dataset.toggleBroadcast);
      loadBroadcasts();
    });
  });
  document.querySelectorAll('[data-delete-broadcast]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('broadcasts').delete().eq('id', btn.dataset.deleteBroadcast);
      loadBroadcasts();
    });
  });
  refreshIcons();
}

async function handleCreateBroadcast(e) {
  e.preventDefault();
  const message = document.getElementById('broadcast-message').value.trim();
  const severity = document.getElementById('broadcast-severity').value;
  if (!message) return;
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('broadcasts').insert({ message, severity, created_by: user.id });
  if (error) { showToast(error.message, true); return; }
  document.getElementById('broadcast-form').reset();
  loadBroadcasts();
}

async function loadEvents() {
  const list = document.getElementById('event-list');
  const { data } = await sb.from('events').select('*').order('created_at', { ascending: false }).limit(10);
  if (!data || !data.length) { list.innerHTML = `<p class="muted" style="font-size:0.85rem;">No events yet.</p>`; return; }

  list.innerHTML = data.map(ev => `
    <div class="flex-between" style="padding:10px 14px; border:1px solid var(--glass-border); border-radius:var(--radius-sm); ${ev.active ? '' : 'opacity:0.5;'}">
      <div style="min-width:0;">
        <p style="margin:0; font-size:0.85rem; font-weight:700;">${escapeHtml(ev.name)} <span style="color:var(--gold-bright); font-family:var(--font-mono);">${ev.xp_multiplier}x</span></p>
        <p class="muted" style="margin:2px 0 0; font-size:0.72rem;">${ev.ends_at ? `Ends ${formatDate(ev.ends_at)}` : 'No end date set'}</p>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-toggle-event="${ev.id}" data-active="${ev.active}">${ev.active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn btn-danger btn-sm" data-delete-event="${ev.id}"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-toggle-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const activating = btn.dataset.active !== 'true';
      // Only one event multiplier applies at a time — turn the others off first.
      if (activating) await sb.from('events').update({ active: false }).eq('active', true);
      await sb.from('events').update({ active: activating }).eq('id', btn.dataset.toggleEvent);
      loadEvents();
    });
  });
  document.querySelectorAll('[data-delete-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('events').delete().eq('id', btn.dataset.deleteEvent);
      loadEvents();
    });
  });
  refreshIcons();
}

async function handleCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById('event-name').value.trim();
  const xp_multiplier = parseFloat(document.getElementById('event-multiplier').value);
  const endsRaw = document.getElementById('event-ends').value;
  if (!name) return;

  // Starting a new event deactivates any other active one, so multipliers never stack unexpectedly.
  await sb.from('events').update({ active: false }).eq('active', true);
  const { error } = await sb.from('events').insert({
    name, xp_multiplier, active: true,
    starts_at: new Date().toISOString(),
    ends_at: endsRaw ? new Date(endsRaw).toISOString() : null,
  });
  if (error) { showToast(error.message, true); return; }
  document.getElementById('event-form').reset();
  loadEvents();
}
