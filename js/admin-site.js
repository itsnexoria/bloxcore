// BloxCore — admin/site/index.html logic (admin only): broadcasts + XP events

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAdmin();
  if (!auth) return;

  await loadBroadcasts();
  await loadEvents();
  await loadTradeItems();

  document.getElementById('broadcast-form').addEventListener('submit', handleCreateBroadcast);
  document.getElementById('event-form').addEventListener('submit', handleCreateEvent);
  document.getElementById('trade-item-form').addEventListener('submit', handleUpsertTradeItem);
  document.getElementById('ti-search').addEventListener('input', renderTradeItems);
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

// --- Trade item catalog ---------------------------------------------------

let allTradeItemsAdmin = [];

async function loadTradeItems() {
  const { data } = await sb.from('trade_items').select('*').order('category').order('name');
  allTradeItemsAdmin = data || [];
  renderTradeItems();
}

function renderTradeItems() {
  const query = document.getElementById('ti-search').value.trim().toLowerCase();
  const list = document.getElementById('trade-item-list');
  const items = allTradeItemsAdmin.filter(i => i.name.toLowerCase().includes(query));

  if (!items.length) { list.innerHTML = `<p class="muted" style="font-size:0.85rem;">No items found.</p>`; return; }

  list.innerHTML = items.map(i => `
    <div class="flex-between" style="padding:8px 12px; border:1px solid var(--glass-border); border-radius:var(--radius-sm);">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        ${i.image_url ? `<img src="${i.image_url}" alt="" style="width:28px; height:28px; object-fit:contain;" onerror="this.style.display='none';">` : ''}
        <div style="min-width:0;">
          <p style="margin:0; font-size:0.85rem; font-weight:600;">${escapeHtml(i.name)} <span class="muted" style="font-weight:400;">· ${i.category}</span></p>
          <p class="muted" style="margin:0; font-size:0.72rem;">${i.value_label || 'no value set'} · demand ${i.demand}/10</p>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-edit-item="${i.id}"><i data-lucide="pencil" class="icon-sm"></i></button>
        <button class="btn btn-danger btn-sm" data-delete-item="${i.id}"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = allTradeItemsAdmin.find(i => i.id === btn.dataset.editItem);
      if (!item) return;
      document.getElementById('ti-name').value = item.name;
      document.getElementById('ti-category').value = item.category;
      document.getElementById('ti-value-label').value = item.value_label || '';
      document.getElementById('ti-value-num').value = item.value_num || '';
      document.getElementById('ti-demand').value = item.demand || 5;
      document.getElementById('ti-image').value = item.image_url || '';
      document.getElementById('trade-item-form').scrollIntoView({ behavior: 'smooth' });
    });
  });
  document.querySelectorAll('[data-delete-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('trade_items').delete().eq('id', btn.dataset.deleteItem);
      loadTradeItems();
    });
  });
  refreshIcons();
}

async function handleUpsertTradeItem(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('ti-name').value.trim(),
    category: document.getElementById('ti-category').value,
    value_label: document.getElementById('ti-value-label').value.trim() || null,
    value_num: parseInt(document.getElementById('ti-value-num').value, 10) || 0,
    demand: parseInt(document.getElementById('ti-demand').value, 10) || 5,
    image_url: document.getElementById('ti-image').value.trim() || null,
  };
  if (!payload.name) return;

  const { error } = await sb.from('trade_items').upsert(payload, { onConflict: 'name,category' });
  if (error) { showToast(error.message, true); return; }

  document.getElementById('trade-item-form').reset();
  document.getElementById('ti-demand').value = 5;
  loadTradeItems();
}
