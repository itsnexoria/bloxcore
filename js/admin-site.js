// BloxCore — admin/site/index.html logic (admin only): broadcasts + XP events

// Populates the maintenance-mode and page-block "which page" dropdowns from the
// site_pages registry table instead of a hardcoded <option> list — adding a page to that
// table (or flipping its maintenance_eligible/block_eligible flag) makes it available in
// both places immediately, no HTML edit needed. This is what previously went stale (both
// dropdowns were missing /notifications/, /status/, and even /pvp/, an existing page).
async function loadSitePagesDropdowns() {
  const { data, error } = await sb.from('site_pages').select('*').order('sort_order', { ascending: true });
  if (error) { logError('Failed to load site pages registry:', error); return; }

  const pages = data || [];
  document.getElementById('maintenance-page').innerHTML = pages
    .filter(p => p.maintenance_eligible)
    .map(p => `<option value="${p.path}">${escapeHtml(p.label)}</option>`)
    .join('');
  document.getElementById('page-block-page').innerHTML = pages
    .filter(p => p.block_eligible)
    .map(p => `<option value="${p.path}">${escapeHtml(p.label)}</option>`)
    .join('');
}

let _siteTabInit = false;

async function initSiteTab() {
  if (_siteTabInit) return;
  _siteTabInit = true;

  try {
    await loadBroadcasts();
    await loadEvents();
    await loadSettingsForm();
    await loadSitePagesDropdowns();
    await loadMaintenanceList();
    await loadPageBlockList();
    await loadKeywordFilter();
    await loadFlaggedPosts();
    await loadDuplicateAccountChecks();
    await loadClientErrors();
    initWebhookPanel();

    document.getElementById('broadcast-form').addEventListener('submit', handleCreateBroadcast);
    document.getElementById('event-form').addEventListener('submit', handleCreateEvent);
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
    document.getElementById('maintenance-form').addEventListener('submit', handleEnableMaintenance);
    document.getElementById('page-block-form').addEventListener('submit', handleAddPageBlock);
    document.getElementById('keyword-filter-form').addEventListener('submit', handleSaveKeywordFilter);

    document.querySelectorAll('.site-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateSiteSubtab(btn.dataset.siteSubtab));
    });
  } catch (e) {
    logError('Failed to init Site Controls tab:', e);
    _siteTabInit = false;
    showToast('Something went wrong loading site controls. Try again.', true);
  }
}

async function loadKeywordFilter() {
  const { data } = await sb.from('site_settings').select('value').eq('key', 'banned_keywords').maybeSingle();
  document.getElementById('keyword-filter-textarea').value = (data?.value || []).join('\n');
}

async function handleSaveKeywordFilter(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const keywords = document.getElementById('keyword-filter-textarea').value
    .split('\n').map(k => k.trim()).filter(Boolean);
  const { error } = await sb.from('site_settings').upsert({ key: 'banned_keywords', value: keywords }, { onConflict: 'key' });
  btn.disabled = false;
  if (error) { showToast(error.message, true); return; }
  showToast('Keyword filter updated.');
}

async function loadFlaggedPosts() {
  const list = document.getElementById('flagged-posts-list');
  const { data, error } = await sb
    .from('feed_posts')
    .select('id, content, auto_flag_matched, created_at, profiles(username, display_name)')
    .eq('auto_flagged', true)
    .order('created_at', { ascending: false });

  if (error) { list.innerHTML = errorStateHtml("Couldn't load flagged posts.", 'loadFlaggedPosts()'); return; }
  if (!data.length) { list.innerHTML = `<p class="muted" style="font-size:0.85rem;">Nothing flagged right now.</p>`; return; }

  list.innerHTML = data.map(p => `
    <div class="panel" style="margin:0; padding:12px 14px;" data-flagged-post="${p.id}">
      <div class="flex-between" style="align-items:flex-start; gap:10px;">
        <div style="min-width:0;">
          <p class="muted" style="margin:0 0 4px; font-size:0.75rem;">@${escapeHtml(p.profiles?.username || 'unknown')} · matched "<strong>${escapeHtml(p.auto_flag_matched || '')}</strong>" · ${timeAgo(p.created_at)}</p>
          <p style="margin:0; font-size:0.86rem; overflow-wrap:anywhere;">${escapeHtml(p.content || '')}</p>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-ghost btn-sm" data-approve-flagged="${p.id}" title="Clear flag, keep post"><i data-lucide="check" class="icon-sm"></i></button>
          <button type="button" class="btn btn-danger btn-sm" data-delete-flagged="${p.id}" title="Delete post"><i data-lucide="trash-2" class="icon-sm"></i></button>
        </div>
      </div>
    </div>
  `).join('');
  refreshIcons();

  list.querySelectorAll('[data-approve-flagged]').forEach(btn => {
    btn.addEventListener('click', () => resolveFlaggedPost(btn.dataset.approveFlagged, 'approve'));
  });
  list.querySelectorAll('[data-delete-flagged]').forEach(btn => {
    btn.addEventListener('click', () => resolveFlaggedPost(btn.dataset.deleteFlagged, 'delete'));
  });
}

async function resolveFlaggedPost(postId, action) {
  const { error } = action === 'delete'
    ? await sb.from('feed_posts').delete().eq('id', postId)
    : await sb.from('feed_posts').update({ auto_flagged: false }).eq('id', postId);
  if (error) { showToast(error.message, true); return; }
  document.querySelector(`[data-flagged-post="${postId}"]`)?.remove();
  showToast(action === 'delete' ? 'Post deleted.' : 'Flag cleared — post is public again.');
}

async function loadDuplicateAccountChecks() {
  const [{ data: roblox, error: robloxErr }, { data: bursts, error: burstsErr }] = await Promise.all([
    sb.rpc('get_duplicate_roblox_accounts'),
    sb.rpc('get_referral_burst_clusters'),
  ]);

  const robloxList = document.getElementById('duplicate-roblox-list');
  if (robloxErr) {
    robloxList.innerHTML = errorStateHtml("Couldn't load this.", 'loadDuplicateAccountChecks()');
  } else if (!roblox.length) {
    robloxList.innerHTML = `<p class="muted" style="font-size:0.85rem;">No shared Roblox accounts found.</p>`;
  } else {
    robloxList.innerHTML = roblox.map(row => `
      <div class="panel" style="margin:0; padding:12px 14px;">
        <p style="margin:0 0 4px; font-size:0.86rem;"><strong>${escapeHtml(row.roblox_username || 'Unknown Roblox user')}</strong> <span class="muted">(Roblox ID ${row.roblox_user_id})</span> — linked to ${row.account_count} BloxCore accounts</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${row.usernames.map(u => `@${escapeHtml(u)}`).join(', ')}</p>
      </div>
    `).join('');
  }

  const burstsList = document.getElementById('referral-bursts-list');
  if (burstsErr) {
    burstsList.innerHTML = errorStateHtml("Couldn't load this.", 'loadDuplicateAccountChecks()');
  } else if (!bursts.length) {
    burstsList.innerHTML = `<p class="muted" style="font-size:0.85rem;">No referral bursts found.</p>`;
  } else {
    burstsList.innerHTML = bursts.map(row => `
      <div class="panel" style="margin:0; padding:12px 14px;">
        <p style="margin:0 0 4px; font-size:0.86rem;"><strong>@${escapeHtml(row.referrer_username || 'unknown')}</strong> — ${row.burst_count} referrals in one burst</p>
        <p class="muted" style="margin:0; font-size:0.78rem;">${row.referred_usernames.map(u => `@${escapeHtml(u)}`).join(', ')} · ${timeAgo(row.window_start)} → ${timeAgo(row.window_end)}</p>
      </div>
    `).join('');
  }
}

async function loadClientErrors() {
  const list = document.getElementById('client-errors-list');
  const { data, error } = await sb.rpc('get_client_errors');

  if (error) {
    list.innerHTML = errorStateHtml("Couldn't load client errors.", 'loadClientErrors()');
    return;
  }
  if (!data.length) {
    list.innerHTML = `<p class="muted" style="font-size:0.85rem;">No client errors reported in the last 14 days.</p>`;
    return;
  }

  list.innerHTML = data.map(e => `
    <details class="panel" style="margin:0; padding:10px 14px;">
      <summary style="cursor:pointer; font-size:0.85rem;">
        <strong>${escapeHtml(e.message)}</strong>
        <span class="muted" style="font-size:0.75rem;"> — ${escapeHtml(e.page_url || 'unknown page')} · ${e.username ? `@${escapeHtml(e.username)}` : 'signed out'} · ${timeAgo(e.created_at)}</span>
      </summary>
      ${e.stack ? `<pre style="margin:8px 0 0; font-size:0.72rem; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--ash);">${escapeHtml(e.stack)}</pre>` : ''}
      <p class="muted" style="margin:6px 0 0; font-size:0.7rem;">${escapeHtml(e.user_agent || '')}</p>
    </details>
  `).join('');
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

  document.getElementById('setting-min-crew-name').value = map.min_crew_name_length ?? 3;
  document.getElementById('setting-min-crew-description').value = map.min_crew_description_length ?? 15;
  document.getElementById('setting-min-service-title').value = map.min_service_title_length ?? 5;
  document.getElementById('setting-min-service-description').value = map.min_service_description_length ?? 15;
  document.getElementById('setting-min-combo-title').value = map.min_combo_title_length ?? 3;
  document.getElementById('setting-min-combo-description').value = map.min_combo_description_length ?? 10;
  document.getElementById('setting-min-sea-event-note').value = map.min_sea_event_note_length ?? 5;
  document.getElementById('setting-min-giveaway-title').value = map.min_giveaway_title_length ?? 5;
  document.getElementById('setting-min-giveaway-description').value = map.min_giveaway_description_length ?? 15;
  document.getElementById('setting-min-combo-instructions').value = map.min_combo_instructions_length ?? 10;
  document.getElementById('setting-max-crew-name').value = map.max_crew_name_length ?? 30;
  document.getElementById('setting-max-crew-description').value = map.max_crew_description_length ?? 200;
  document.getElementById('setting-max-service-title').value = map.max_service_title_length ?? 60;
  document.getElementById('setting-max-service-description').value = map.max_service_description_length ?? 300;
  document.getElementById('setting-max-combo-title').value = map.max_combo_title_length ?? 60;
  document.getElementById('setting-max-combo-description').value = map.max_combo_description_length ?? 150;
  document.getElementById('setting-max-combo-instructions').value = map.max_combo_instructions_length ?? 800;
  document.getElementById('setting-max-sea-event-note').value = map.max_sea_event_note_length ?? 300;
  document.getElementById('setting-max-giveaway-title').value = map.max_giveaway_title_length ?? 60;
  document.getElementById('setting-max-giveaway-description').value = map.max_giveaway_description_length ?? 500;
  document.getElementById('setting-max-trades').value = map.max_active_trades ?? 3;
  document.getElementById('setting-max-services').value = map.max_active_services ?? 5;
  document.getElementById('setting-max-combos').value = map.max_combos_per_user ?? 10;
  document.getElementById('setting-xp-combo').value = map.xp_per_combo ?? 10;
  document.getElementById('setting-xp-sea-event').value = map.xp_per_sea_event ?? 5;
  document.getElementById('setting-xp-service').value = map.xp_per_service_listing ?? 5;
  document.getElementById('setting-xp-trade').value = map.xp_per_trade_listing ?? 5;
  document.getElementById('setting-xp-giveaway-entry').value = map.xp_per_giveaway_entry ?? 2;
  document.getElementById('setting-xp-vouch').value = map.xp_per_vouch_given ?? 3;
  document.getElementById('setting-xp-pvp').value = map.xp_per_pvp_match_posted ?? 3;
  document.getElementById('setting-xp-tournament-prediction').value = map.xp_per_correct_tournament_prediction ?? 10;
  document.getElementById('setting-trust-enabled').checked = map.trust_auto_approve_enabled ?? true;
  document.getElementById('setting-trust-min-approved').value = map.trust_min_approved ?? 10;
  document.getElementById('setting-trust-max-reject-rate').value = Math.round((map.trust_max_reject_rate ?? 0.1) * 100);
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const updates = [
    { key: 'min_crew_name_length', value: Number(document.getElementById('setting-min-crew-name').value) },
    { key: 'min_crew_description_length', value: Number(document.getElementById('setting-min-crew-description').value) },
    { key: 'min_service_title_length', value: Number(document.getElementById('setting-min-service-title').value) },
    { key: 'min_service_description_length', value: Number(document.getElementById('setting-min-service-description').value) },
    { key: 'min_combo_title_length', value: Number(document.getElementById('setting-min-combo-title').value) },
    { key: 'min_combo_description_length', value: Number(document.getElementById('setting-min-combo-description').value) },
    { key: 'min_sea_event_note_length', value: Number(document.getElementById('setting-min-sea-event-note').value) },
    { key: 'min_giveaway_title_length', value: Number(document.getElementById('setting-min-giveaway-title').value) },
    { key: 'min_giveaway_description_length', value: Number(document.getElementById('setting-min-giveaway-description').value) },
    { key: 'min_combo_instructions_length', value: Number(document.getElementById('setting-min-combo-instructions').value) },
    { key: 'max_crew_name_length', value: Number(document.getElementById('setting-max-crew-name').value) },
    { key: 'max_crew_description_length', value: Number(document.getElementById('setting-max-crew-description').value) },
    { key: 'max_service_title_length', value: Number(document.getElementById('setting-max-service-title').value) },
    { key: 'max_service_description_length', value: Number(document.getElementById('setting-max-service-description').value) },
    { key: 'max_combo_title_length', value: Number(document.getElementById('setting-max-combo-title').value) },
    { key: 'max_combo_description_length', value: Number(document.getElementById('setting-max-combo-description').value) },
    { key: 'max_combo_instructions_length', value: Number(document.getElementById('setting-max-combo-instructions').value) },
    { key: 'max_sea_event_note_length', value: Number(document.getElementById('setting-max-sea-event-note').value) },
    { key: 'max_giveaway_title_length', value: Number(document.getElementById('setting-max-giveaway-title').value) },
    { key: 'max_giveaway_description_length', value: Number(document.getElementById('setting-max-giveaway-description').value) },
    { key: 'max_active_trades', value: Number(document.getElementById('setting-max-trades').value) },
    { key: 'max_active_services', value: Number(document.getElementById('setting-max-services').value) },
    { key: 'max_combos_per_user', value: Number(document.getElementById('setting-max-combos').value) },
    { key: 'xp_per_combo', value: Number(document.getElementById('setting-xp-combo').value) },
    { key: 'xp_per_sea_event', value: Number(document.getElementById('setting-xp-sea-event').value) },
    { key: 'xp_per_service_listing', value: Number(document.getElementById('setting-xp-service').value) },
    { key: 'xp_per_trade_listing', value: Number(document.getElementById('setting-xp-trade').value) },
    { key: 'xp_per_giveaway_entry', value: Number(document.getElementById('setting-xp-giveaway-entry').value) },
    { key: 'xp_per_vouch_given', value: Number(document.getElementById('setting-xp-vouch').value) },
    { key: 'xp_per_pvp_match_posted', value: Number(document.getElementById('setting-xp-pvp').value) },
    { key: 'xp_per_correct_tournament_prediction', value: Number(document.getElementById('setting-xp-tournament-prediction').value) },
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
  '/friends/': 'Friends (Messages, Friends)', '/sea-events/': 'Sea Events',
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
// Removed along with Live Chat — the chat_allowed_domains table, the /chat/ page, and
// this admin panel were only ever used to moderate links inside global chat messages.



// --- Webhooks (multi-endpoint fan-out + delivery log) ----------------------
// See webhook_endpoints / webhook_deliveries in the DB. Discord embeds are built
// server-side by the event triggers; this panel only manages *where* they go.

const WEBHOOK_CHANNEL_LABELS = {
  updates: 'General Updates', giveaways: 'Giveaways', trading: 'Trading',
  services: 'Services (Raids/Trials)', crews: 'Crews', crew_wars: 'Crew Wars',
  events: 'Sea Events', pvp: 'PvP Matches', tournaments: 'Tournaments',
};
const WEBHOOK_CHANNEL_ORDER = ['updates', 'giveaways', 'trading', 'services', 'crews', 'crew_wars', 'events', 'pvp', 'tournaments'];

async function loadWebhookEndpoints() {
  const wrap = document.getElementById('webhook-endpoint-groups');
  const { data, error } = await sb.from('webhook_endpoints').select('*').order('channel').order('created_at');
  if (error) { wrap.innerHTML = errorStateHtml("Couldn't load webhooks.", 'loadWebhookEndpoints()'); refreshIcons(); return; }

  const byChannel = new Map();
  (data || []).forEach(row => {
    if (!byChannel.has(row.channel)) byChannel.set(row.channel, []);
    byChannel.get(row.channel).push(row);
  });

  const orderedChannels = [...WEBHOOK_CHANNEL_ORDER.filter(c => byChannel.has(c)), ...[...byChannel.keys()].filter(c => !WEBHOOK_CHANNEL_ORDER.includes(c))];

  if (!orderedChannels.length) {
    wrap.innerHTML = `<p class="muted" style="margin:0;">No endpoints configured yet — add one to start sending notifications.</p>`;
    return;
  }

  wrap.innerHTML = orderedChannels.map(channel => `
    <div>
      <p style="margin:0 0 8px; font-size:0.82rem; font-weight:700; color:var(--bone); text-transform:uppercase; letter-spacing:0.04em;">${escapeHtml(WEBHOOK_CHANNEL_LABELS[channel] || channel)}</p>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${byChannel.get(channel).map(renderWebhookEndpointRow).join('')}
      </div>
    </div>
  `).join('');

  wireWebhookRowActions(wrap);
  refreshIcons();
}

function renderWebhookEndpointRow(row) {
  const providerIcon = row.provider === 'discord' ? 'message-circle' : 'code-2';
  return `
    <div class="webhook-row" data-endpoint-row="${row.id}" style="flex-wrap:wrap; ${row.enabled ? '' : 'opacity:0.55;'}">
      <div class="webhook-row-label" style="min-width:160px;">
        <strong><i data-lucide="${providerIcon}" class="icon-sm icon-inline"></i>${escapeHtml(row.label || row.provider)}</strong>
        <span class="muted" style="font-size:0.72rem; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">${escapeHtml(row.url)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
        <label class="toggle-switch" title="${row.enabled ? 'Enabled' : 'Disabled'}">
          <input type="checkbox" data-toggle-endpoint="${row.id}" ${row.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" data-test-endpoint="${row.id}" title="Send test"><i data-lucide="send" class="icon-sm"></i></button>
        <button type="button" class="btn btn-ghost btn-sm" data-edit-endpoint="${row.id}" title="Edit"><i data-lucide="pencil" class="icon-sm"></i></button>
        <button type="button" class="btn btn-ghost btn-sm" data-delete-endpoint="${row.id}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
      </div>
    </div>
  `;
}

function wireWebhookRowActions(root) {
  root.querySelectorAll('[data-toggle-endpoint]').forEach(input => {
    input.addEventListener('change', async () => {
      const { error } = await sb.from('webhook_endpoints').update({ enabled: input.checked, updated_at: new Date().toISOString() }).eq('id', input.dataset.toggleEndpoint);
      if (error) { showToast(error.message, true); input.checked = !input.checked; return; }
      showToast(input.checked ? 'Endpoint enabled.' : 'Endpoint disabled.');
      loadWebhookEndpoints();
    });
  });
  root.querySelectorAll('[data-test-endpoint]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await sb.rpc('admin_test_webhook', { p_endpoint_id: btn.dataset.testEndpoint });
      btn.disabled = false;
      if (error) { showToast(error.message, true); return; }
      showToast('Test sent — check the Delivery Log below in a few seconds.');
      setTimeout(loadWebhookDeliveryLog, 2500);
    });
  });
  root.querySelectorAll('[data-edit-endpoint]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data } = await sb.from('webhook_endpoints').select('*').eq('id', btn.dataset.editEndpoint).single();
      if (data) openWebhookModal(data);
    });
  });
  root.querySelectorAll('[data-delete-endpoint]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this endpoint? This cannot be undone.')) return;
      const { error } = await sb.from('webhook_endpoints').delete().eq('id', btn.dataset.deleteEndpoint);
      if (error) { showToast(error.message, true); return; }
      showToast('Endpoint deleted.');
      loadWebhookEndpoints();
    });
  });
}

function openWebhookModal(existing = null) {
  const form = document.getElementById('webhook-endpoint-form');
  form.reset();
  document.getElementById('webhook-endpoint-error').style.display = 'none';
  document.getElementById('webhook-endpoint-modal-title').textContent = existing ? 'Edit Endpoint' : 'Add Endpoint';
  document.getElementById('webhook-endpoint-id').value = existing?.id || '';

  const channelSelect = document.getElementById('webhook-endpoint-channel');
  const customInput = document.getElementById('webhook-endpoint-channel-custom');
  if (existing) {
    const knownOption = [...channelSelect.options].some(o => o.value === existing.channel);
    channelSelect.value = knownOption ? existing.channel : '__custom';
    customInput.style.display = knownOption ? 'none' : 'block';
    customInput.value = knownOption ? '' : existing.channel;
  } else {
    channelSelect.value = 'updates';
    customInput.style.display = 'none';
  }

  document.getElementById('webhook-endpoint-provider').value = existing?.provider || 'discord';
  document.getElementById('webhook-endpoint-label').value = existing?.label || '';
  document.getElementById('webhook-endpoint-url').value = existing?.url || '';
  document.getElementById('webhook-endpoint-role').value = existing?.ping_role_id || '';
  document.getElementById('webhook-endpoint-secret').value = existing?.secret || '';
  document.getElementById('webhook-endpoint-enabled').checked = existing ? existing.enabled : true;
  toggleWebhookProviderFields();

  document.getElementById('webhook-endpoint-modal').classList.add('open');
}

function closeWebhookModal() {
  document.getElementById('webhook-endpoint-modal').classList.remove('open');
}

function toggleWebhookProviderFields() {
  const isDiscord = document.getElementById('webhook-endpoint-provider').value === 'discord';
  document.getElementById('webhook-endpoint-discord-fields').style.display = isDiscord ? 'block' : 'none';
  document.getElementById('webhook-endpoint-generic-fields').style.display = isDiscord ? 'none' : 'block';
}

async function handleSaveWebhookEndpoint(e) {
  e.preventDefault();
  const errEl = document.getElementById('webhook-endpoint-error');
  errEl.style.display = 'none';

  const id = document.getElementById('webhook-endpoint-id').value || null;
  const channelSelectVal = document.getElementById('webhook-endpoint-channel').value;
  const channel = channelSelectVal === '__custom' ? document.getElementById('webhook-endpoint-channel-custom').value.trim() : channelSelectVal;
  const roleId = document.getElementById('webhook-endpoint-role').value.trim();

  if (!channel) { errEl.textContent = 'Enter a custom channel key.'; errEl.style.display = 'block'; return; }
  if (roleId && !/^\d+$/.test(roleId)) { errEl.textContent = 'Role ID must be numbers only.'; errEl.style.display = 'block'; return; }

  const row = {
    channel,
    provider: document.getElementById('webhook-endpoint-provider').value,
    label: document.getElementById('webhook-endpoint-label').value.trim(),
    url: document.getElementById('webhook-endpoint-url').value.trim(),
    ping_role_id: roleId || null,
    secret: document.getElementById('webhook-endpoint-secret').value.trim() || null,
    enabled: document.getElementById('webhook-endpoint-enabled').checked,
    updated_at: new Date().toISOString(),
  };

  const btn = document.getElementById('webhook-endpoint-save-btn');
  btn.disabled = true;
  const { error } = id
    ? await sb.from('webhook_endpoints').update(row).eq('id', id)
    : await sb.from('webhook_endpoints').insert(row);
  btn.disabled = false;

  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  showToast(id ? 'Endpoint updated.' : 'Endpoint added.');
  closeWebhookModal();
  loadWebhookEndpoints();
}

// --- Delivery log ---

let webhookLogFilter = '';

async function loadWebhookDeliveryLog() {
  const log = document.getElementById('webhook-delivery-log');
  let query = sb.from('webhook_deliveries')
    .select('id, channel, provider, event_summary, success, http_status, error_message, retry_count, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (webhookLogFilter === 'success') query = query.eq('success', true);
  else if (webhookLogFilter === 'failed') query = query.eq('success', false);
  else if (webhookLogFilter === 'pending') query = query.is('success', null);

  const { data, error } = await query;
  if (error) { log.innerHTML = errorStateHtml("Couldn't load delivery log.", 'loadWebhookDeliveryLog()'); refreshIcons(); return; }
  if (!data || !data.length) { log.innerHTML = `<p class="muted" style="margin:0;">No deliveries yet.</p>`; return; }

  log.innerHTML = data.map(d => {
    const statusTag = d.success === null
      ? `<span class="tag tag-medium">Pending</span>`
      : d.success
      ? `<span class="tag tag-easy">${d.http_status || 200}</span>`
      : `<span class="tag tag-hard">Failed${d.http_status ? ' · ' + d.http_status : ''}</span>`;
    return `
      <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--navy-light); gap:12px;">
        <div style="min-width:0;">
          <p style="margin:0; font-size:0.85rem;"><strong>${escapeHtml(WEBHOOK_CHANNEL_LABELS[d.channel] || d.channel)}</strong> <span class="muted">${escapeHtml(d.event_summary || '')}</span></p>
          <p class="muted" style="margin:2px 0 0; font-size:0.72rem;">${timeAgo(d.created_at)}${d.retry_count ? ` · retried ${d.retry_count}×` : ''}${d.error_message ? ` · ${escapeHtml(d.error_message)}` : ''}</p>
        </div>
        ${statusTag}
      </div>
    `;
  }).join('');
}

function initWebhookPanel() {
  loadWebhookEndpoints();
  loadWebhookDeliveryLog();

  document.getElementById('webhook-add-btn').addEventListener('click', () => openWebhookModal());
  document.getElementById('webhook-endpoint-modal-close').addEventListener('click', closeWebhookModal);
  document.getElementById('webhook-endpoint-form').addEventListener('submit', handleSaveWebhookEndpoint);
  document.getElementById('webhook-endpoint-provider').addEventListener('change', toggleWebhookProviderFields);
  document.getElementById('webhook-endpoint-channel').addEventListener('change', (e) => {
    document.getElementById('webhook-endpoint-channel-custom').style.display = e.target.value === '__custom' ? 'block' : 'none';
  });
  document.getElementById('webhook-log-filter').addEventListener('change', (e) => {
    webhookLogFilter = e.target.value;
    loadWebhookDeliveryLog();
  });
}
