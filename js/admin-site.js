// BloxCore — admin/site/index.html logic (admin only): broadcasts + XP events

let _siteTabInit = false;

async function initSiteTab() {
  if (_siteTabInit) return;
  _siteTabInit = true;

  try {
    await loadBroadcasts();
    await loadEvents();
    await loadSettingsForm();
    await loadMaintenanceList();
    await loadPageBlockList();
    await loadChatDomainList();
    await loadDiscordWebhooks();

    document.getElementById('broadcast-form').addEventListener('submit', handleCreateBroadcast);
    document.getElementById('event-form').addEventListener('submit', handleCreateEvent);
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
    document.getElementById('maintenance-form').addEventListener('submit', handleEnableMaintenance);
    document.getElementById('page-block-form').addEventListener('submit', handleAddPageBlock);
    document.getElementById('chat-domain-form').addEventListener('submit', handleAddChatDomain);

    document.querySelectorAll('.site-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateSiteSubtab(btn.dataset.siteSubtab));
    });
  } catch (e) {
    logError('Failed to init Site Controls tab:', e);
    _siteTabInit = false;
    showToast('Something went wrong loading site controls. Try again.', true);
  }
}

function activateSiteSubtab(name) {
  document.querySelectorAll('.site-subtab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.siteSubtab === name);
  });
  document.querySelectorAll('[data-site-subpanel]').forEach(panel => {
    panel.style.display = panel.dataset.siteSubpanel === name ? '' : 'none';
  });
}

async function loadSettingsForm() {
  const { data } = await sb.from('site_settings').select('key, value');
  const map = {};
  (data || []).forEach(row => { map[row.key] = row.value; });

  document.getElementById('setting-chat-cooldown').value = map.chat_cooldown_seconds ?? 10;
  document.getElementById('setting-chat-length').value = map.max_chat_message_length ?? 500;
  document.getElementById('setting-min-chat-length').value = map.min_chat_message_length ?? 2;
  document.getElementById('setting-min-crew-name').value = map.min_crew_name_length ?? 3;
  document.getElementById('setting-min-crew-description').value = map.min_crew_description_length ?? 15;
  document.getElementById('setting-min-service-title').value = map.min_service_title_length ?? 5;
  document.getElementById('setting-min-service-description').value = map.min_service_description_length ?? 15;
  document.getElementById('setting-min-combo-title').value = map.min_combo_title_length ?? 3;
  document.getElementById('setting-min-combo-description').value = map.min_combo_description_length ?? 10;
  document.getElementById('setting-min-sea-event-note').value = map.min_sea_event_note_length ?? 5;
  document.getElementById('setting-max-trades').value = map.max_active_trades ?? 3;
  document.getElementById('setting-max-services').value = map.max_active_services ?? 5;
  document.getElementById('setting-max-combos').value = map.max_combos_per_user ?? 10;
  document.getElementById('setting-xp-combo').value = map.xp_per_combo ?? 10;
  document.getElementById('setting-xp-sea-event').value = map.xp_per_sea_event ?? 5;
  document.getElementById('setting-xp-service').value = map.xp_per_service_listing ?? 5;
  document.getElementById('setting-xp-trade').value = map.xp_per_trade_listing ?? 5;
  document.getElementById('setting-xp-chat').value = map.xp_per_chat_message ?? 1;
  document.getElementById('setting-xp-giveaway-entry').value = map.xp_per_giveaway_entry ?? 2;
  document.getElementById('setting-xp-vouch').value = map.xp_per_vouch_given ?? 3;
  document.getElementById('setting-xp-pvp').value = map.xp_per_pvp_match_posted ?? 3;
  document.getElementById('setting-trust-enabled').checked = map.trust_auto_approve_enabled ?? true;
  document.getElementById('setting-trust-min-approved').value = map.trust_min_approved ?? 10;
  document.getElementById('setting-trust-max-reject-rate').value = Math.round((map.trust_max_reject_rate ?? 0.1) * 100);
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const updates = [
    { key: 'chat_cooldown_seconds', value: Number(document.getElementById('setting-chat-cooldown').value) },
    { key: 'max_chat_message_length', value: Number(document.getElementById('setting-chat-length').value) },
    { key: 'min_chat_message_length', value: Number(document.getElementById('setting-min-chat-length').value) },
    { key: 'min_crew_name_length', value: Number(document.getElementById('setting-min-crew-name').value) },
    { key: 'min_crew_description_length', value: Number(document.getElementById('setting-min-crew-description').value) },
    { key: 'min_service_title_length', value: Number(document.getElementById('setting-min-service-title').value) },
    { key: 'min_service_description_length', value: Number(document.getElementById('setting-min-service-description').value) },
    { key: 'min_combo_title_length', value: Number(document.getElementById('setting-min-combo-title').value) },
    { key: 'min_combo_description_length', value: Number(document.getElementById('setting-min-combo-description').value) },
    { key: 'min_sea_event_note_length', value: Number(document.getElementById('setting-min-sea-event-note').value) },
    { key: 'max_active_trades', value: Number(document.getElementById('setting-max-trades').value) },
    { key: 'max_active_services', value: Number(document.getElementById('setting-max-services').value) },
    { key: 'max_combos_per_user', value: Number(document.getElementById('setting-max-combos').value) },
    { key: 'xp_per_combo', value: Number(document.getElementById('setting-xp-combo').value) },
    { key: 'xp_per_sea_event', value: Number(document.getElementById('setting-xp-sea-event').value) },
    { key: 'xp_per_service_listing', value: Number(document.getElementById('setting-xp-service').value) },
    { key: 'xp_per_trade_listing', value: Number(document.getElementById('setting-xp-trade').value) },
    { key: 'xp_per_chat_message', value: Number(document.getElementById('setting-xp-chat').value) },
    { key: 'xp_per_giveaway_entry', value: Number(document.getElementById('setting-xp-giveaway-entry').value) },
    { key: 'xp_per_vouch_given', value: Number(document.getElementById('setting-xp-vouch').value) },
    { key: 'xp_per_pvp_match_posted', value: Number(document.getElementById('setting-xp-pvp').value) },
    { key: 'trust_auto_approve_enabled', value: document.getElementById('setting-trust-enabled').checked },
    { key: 'trust_min_approved', value: Number(document.getElementById('setting-trust-min-approved').value) },
    { key: 'trust_max_reject_rate', value: Number(document.getElementById('setting-trust-max-reject-rate').value) / 100 },
  ];

  const { error } = await sb.from('site_settings').upsert(updates, { onConflict: 'key' });
  if (error) { showToast(error.message, true); return; }
  showToast('Settings saved.');
}

const SEVERITY_COLOR = { info: 'var(--blue)', success: 'var(--sea)', warning: 'var(--gold)', danger: 'var(--blood)' };

async function loadBroadcasts() {
  const list = document.getElementById('broadcast-list');
  const { data } = await sb.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(10);
  if (!data || !data.length) { list.innerHTML = `<p class="muted" style="font-size:0.85rem;">No broadcasts yet.</p>`; return; }

  const now = Date.now();
  list.innerHTML = data.map(b => {
    const expired = b.expires_at && new Date(b.expires_at).getTime() < now;
    return `
    <div class="flex-between" style="padding:10px 14px; border:1px solid var(--glass-border); border-radius:var(--radius-sm); ${(b.active && !expired) ? '' : 'opacity:0.5;'}">
      <div style="min-width:0;">
        <p style="margin:0; font-size:0.85rem; border-left:3px solid ${SEVERITY_COLOR[b.severity]}; padding-left:8px;">${b.title ? `<strong>${escapeHtml(b.title)}</strong> — ` : ''}${escapeHtml(b.message)}${b.link ? ` <span class="muted">(${escapeHtml(b.link_label || 'link')})</span>` : ''}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.72rem;">${timeAgo(b.created_at)} · ${b.severity}${b.expires_at ? ` · ${expired ? 'expired' : 'expires'} ${formatDate(b.expires_at)}` : ''}</p>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-toggle-broadcast="${b.id}" data-active="${b.active}" title="${b.active ? 'Deactivate' : 'Activate'}"><i data-lucide="${b.active ? 'eye-off' : 'eye'}" class="icon-sm"></i></button>
        <button class="btn btn-danger btn-sm" data-delete-broadcast="${b.id}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `;
  }).join('');

  document.querySelectorAll('[data-toggle-broadcast]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('broadcasts').update({ active: btn.dataset.active !== 'true' }).eq('id', btn.dataset.toggleBroadcast);
      loadBroadcasts();
    });
  });
  document.querySelectorAll('[data-delete-broadcast]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this broadcast?')) return;
      await sb.from('broadcasts').delete().eq('id', btn.dataset.deleteBroadcast);
      loadBroadcasts();
    });
  });
  refreshIcons();
}

async function handleCreateBroadcast(e) {
  e.preventDefault();
  const message = document.getElementById('broadcast-message').value.trim();
  const title = document.getElementById('broadcast-title').value.trim();
  const link = document.getElementById('broadcast-link').value.trim();
  const linkLabel = document.getElementById('broadcast-link-label').value.trim();
  const severity = document.getElementById('broadcast-severity').value;
  const expiresInput = document.getElementById('broadcast-expires').value;
  if (!message) return;
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('broadcasts').insert({
    message,
    title: title || null,
    link: link || null,
    link_label: link ? (linkLabel || 'Learn more') : null,
    severity,
    expires_at: expiresInput ? new Date(expiresInput).toISOString() : null,
    created_by: user.id,
  });
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
      if (!window.confirm('Delete this XP event?')) return;
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

// ---- Page maintenance ----

const PAGE_LABELS = {
  '/': 'Home', '/auth/': 'Sign In / Sign Up', '/onboarding/': 'Onboarding', '/dashboard/': 'Dashboard',
  '/chat/': 'Chat (Live Chat, Messages, Friends)', '/sea-events/': 'Sea Events',
  '/giveaways/': 'Giveaways', '/challenges/': 'Challenges', '/leaderboard/': 'Leaderboard',
  '/crews/': 'Crews (incl. Crew Wars)', '/crew/': 'Individual Crew Pages', '/trading/': 'Trading',
  '/services/': 'Services', '/combos/': 'Combos',
  '/player/': 'Player Profiles', '/profile/': 'Edit Profile',
  '/whats-new/': "What's New", '/settings/': 'Settings',
};

async function loadMaintenanceList() {
  const { data } = await sb.from('page_maintenance').select('*').eq('enabled', true).order('updated_at', { ascending: false });
  const list = document.getElementById('maintenance-list');
  if (!data || !data.length) { list.innerHTML = `<p class="muted" style="font-size:0.82rem;">No pages under maintenance.</p>`; return; }

  list.innerHTML = data.map(row => `
    <div class="flex-between" style="padding:8px 10px; background:var(--glass-bg); border-radius:var(--radius-sm, 8px);">
      <div>
        <span class="tag" style="background:rgba(220,38,38,0.16); color:var(--blood-dim);">${escapeHtml(PAGE_LABELS[row.page_path] || row.page_path)}</span>
        ${row.message ? `<p class="muted" style="margin:4px 0 0; font-size:0.78rem;">${escapeHtml(row.message)}</p>` : ''}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-disable-maintenance="${row.page_path}">Disable</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-disable-maintenance]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('page_maintenance').update({ enabled: false }).eq('page_path', btn.dataset.disableMaintenance);
      if (error) { showToast(error.message, true); return; }
      showToast('Maintenance disabled.');
      loadMaintenanceList();
    });
  });
}

async function handleEnableMaintenance(e) {
  e.preventDefault();
  const page_path = document.getElementById('maintenance-page').value;
  const message = document.getElementById('maintenance-message').value.trim() || null;
  const { data: { session } } = await sb.auth.getSession();

  const { error } = await sb.from('page_maintenance').upsert({
    page_path, message, enabled: true, updated_at: new Date().toISOString(), updated_by: session.user.id,
  });
  if (error) { showToast(error.message, true); return; }
  showToast(`${PAGE_LABELS[page_path] || page_path} is now under maintenance.`);
  document.getElementById('maintenance-form').reset();
  loadMaintenanceList();
}

// ---- Per-user page blocks ----

async function loadPageBlockList() {
  const { data } = await sb.from('user_page_blocks').select('id, page_path, reason, created_at, profiles!user_page_blocks_user_id_fkey(username, display_name)').order('created_at', { ascending: false });
  const list = document.getElementById('page-block-list');
  if (!data || !data.length) { list.innerHTML = `<p class="muted" style="font-size:0.82rem;">No active page blocks.</p>`; return; }

  list.innerHTML = data.map(row => `
    <div class="flex-between" style="padding:8px 10px; background:var(--glass-bg); border-radius:var(--radius-sm, 8px);">
      <div>
        <p style="margin:0; font-size:0.85rem; font-weight:600;">${escapeHtml(displayNameFor(row.profiles || {}))} <span class="muted" style="font-weight:400;">— ${escapeHtml(PAGE_LABELS[row.page_path] || row.page_path)}</span></p>
        ${row.reason ? `<p class="muted" style="margin:2px 0 0; font-size:0.78rem;">${escapeHtml(row.reason)}</p>` : ''}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-block="${row.id}">Unblock</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-remove-block]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('user_page_blocks').delete().eq('id', btn.dataset.removeBlock);
      if (error) { showToast(error.message, true); return; }
      showToast('User unblocked.');
      loadPageBlockList();
    });
  });
}

async function handleAddPageBlock(e) {
  e.preventDefault();
  const username = document.getElementById('page-block-username').value.trim();
  const page_path = document.getElementById('page-block-page').value;
  const reason = document.getElementById('page-block-reason').value.trim() || null;

  const { data: profile, error: lookupError } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
  if (lookupError || !profile) { showToast('No player found with that username.', true); return; }

  const { data: { session } } = await sb.auth.getSession();
  const { error } = await sb.from('user_page_blocks').upsert({
    user_id: profile.id, page_path, reason, created_by: session.user.id,
  }, { onConflict: 'user_id,page_path' });
  if (error) { showToast(error.message, true); return; }

  showToast(`Blocked ${username} from ${PAGE_LABELS[page_path] || page_path}.`);
  document.getElementById('page-block-form').reset();
  loadPageBlockList();
}

// ---- Chat link allowlist ----

async function loadChatDomainList() {
  const { data } = await sb.from('chat_allowed_domains').select('domain').order('domain');
  const list = document.getElementById('chat-domain-list');
  if (!data || !data.length) { list.innerHTML = `<p class="muted" style="font-size:0.82rem;">No domains allowed yet — all links are blocked.</p>`; return; }

  list.innerHTML = data.map(row => `
    <div class="flex-between" style="padding:8px 10px; background:var(--glass-bg); border-radius:var(--radius-sm, 8px);">
      <span style="font-size:0.85rem; font-family:var(--font-mono);">${escapeHtml(row.domain)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-domain="${escapeHtml(row.domain)}">Remove</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-remove-domain]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await sb.from('chat_allowed_domains').delete().eq('domain', btn.dataset.removeDomain);
      if (error) { showToast(error.message, true); return; }
      showToast('Domain removed.');
      loadChatDomainList();
    });
  });
}

async function handleAddChatDomain(e) {
  e.preventDefault();
  const input = document.getElementById('chat-domain-input');
  let domain = input.value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!domain) return;

  const { data: { session } } = await sb.auth.getSession();
  const { error } = await sb.from('chat_allowed_domains').upsert({ domain, added_by: session.user.id }, { onConflict: 'domain' });
  if (error) { showToast(error.message, true); return; }

  showToast(`${domain} is now allowed in chat.`);
  input.value = '';
  loadChatDomainList();
}

// --- Discord Webhooks -----------------------------------------------------

async function loadDiscordWebhooks() {
  const { data, error } = await sb.from('discord_webhooks').select('channel, label, url, ping_role_id').order('label');
  const list = document.getElementById('discord-webhook-list');
  if (error) { list.innerHTML = `<p class="muted" style="font-size:0.82rem;">Couldn't load webhooks.</p>`; return; }

  list.innerHTML = (data || []).map(row => `
    <div class="webhook-row" data-webhook-channel="${escapeHtml(row.channel)}" style="flex-wrap:wrap;">
      <div class="webhook-row-label">
        <strong>${escapeHtml(row.label)}</strong>
        <span class="muted" style="font-size:0.72rem;">${escapeHtml(row.channel)}</span>
      </div>
      <input type="url" class="webhook-row-input" placeholder="https://discord.com/api/webhooks/…" value="${escapeHtml(row.url || '')}">
      <input type="text" class="webhook-row-input webhook-role-input" placeholder="Role ID to ping (optional)" value="${escapeHtml(row.ping_role_id || '')}" style="max-width:180px;" inputmode="numeric" pattern="[0-9]*">
      <button type="button" class="btn btn-ghost btn-sm" data-save-webhook="${escapeHtml(row.channel)}">Save</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-save-webhook]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const channel = btn.dataset.saveWebhook;
      const row = list.querySelector(`[data-webhook-channel="${CSS.escape(channel)}"]`);
      const url = row.querySelector('.webhook-row-input').value.trim();
      const roleId = row.querySelector('.webhook-role-input').value.trim();
      if (roleId && !/^\d+$/.test(roleId)) { showToast('Role ID must be numbers only — right-click the role in Discord (Developer Mode on) and Copy Role ID.', true); return; }
      btn.disabled = true;
      const { error } = await sb.from('discord_webhooks').update({ url: url || null, ping_role_id: roleId || null, updated_at: new Date().toISOString() }).eq('channel', channel);
      btn.disabled = false;
      if (error) { showToast(error.message, true); return; }
      showToast(url ? 'Webhook saved.' : 'Webhook cleared — that channel is now silent.');
    });
  });
}
