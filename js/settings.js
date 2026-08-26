// BloxCore — settings/index.html logic

function wireSettingsTabs() {
  const buttons = document.querySelectorAll('[data-settings-tab]');
  const panels = document.querySelectorAll('[data-settings-panel]');
  const activate = (tab) => {
    if (!document.querySelector(`[data-settings-panel="${tab}"]`)) return;
    buttons.forEach(b => b.classList.toggle('active', b.dataset.settingsTab === tab));
    panels.forEach(p => p.classList.toggle('active', p.dataset.settingsPanel === tab));
    history.replaceState(null, '', `#${tab}`);
  };
  buttons.forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.settingsTab)));
  const initial = location.hash.replace('#', '');
  if (initial) activate(initial);
}

onReady(async () => {
  wireSettingsTabs();
  wirePushNotifToggle();

  const currentAccent = localStorage.getItem('bc_accent') || 'blue';
  highlightAccentSwatch(currentAccent);
  toggleCustomThemePanel(currentAccent === 'custom');
  if (currentAccent === 'custom') prefillCustomThemeInputs();

  document.querySelectorAll('[data-accent-choice]').forEach(swatch => {
    swatch.addEventListener('click', () => selectAccent(swatch.dataset.accentChoice));
  });

  ['ink', 'navy', 'navy-light', 'brass', 'brass-bright'].forEach(key => {
    document.getElementById(`custom-color-${key}`).addEventListener('input', previewCustomTheme);
  });
  document.getElementById('custom-theme-save-btn').addEventListener('click', saveCustomTheme);
  document.getElementById('custom-theme-reset-btn').addEventListener('click', resetToDefaultTheme);

  const motionToggle = document.getElementById('reduce-motion-toggle');
  motionToggle.checked = localStorage.getItem('bc_reduce_motion') === '1';
  motionToggle.addEventListener('change', () => {
    if (motionToggle.checked) {
      localStorage.setItem('bc_reduce_motion', '1');
      document.documentElement.classList.add('reduce-motion');
    } else {
      localStorage.removeItem('bc_reduce_motion');
      document.documentElement.classList.remove('reduce-motion');
    }
  });

  const compactToggle = document.getElementById('compact-mode-toggle');
  compactToggle.checked = localStorage.getItem('bc_compact_mode') === '1';
  compactToggle.addEventListener('change', () => {
    if (compactToggle.checked) {
      localStorage.setItem('bc_compact_mode', '1');
      document.documentElement.classList.add('compact-mode');
    } else {
      localStorage.removeItem('bc_compact_mode');
      document.documentElement.classList.remove('compact-mode');
    }
  });

  const { user, profile } = await getCurrentProfile();
  if (!user) {
    document.getElementById('account-panel').innerHTML = `<p class="muted">Sign in to manage your account.</p>`;
    document.getElementById('hide-leaderboard-toggle').disabled = true;
    document.getElementById('settings-signout-btn').disabled = true;
    document.getElementById('delete-account-btn').disabled = true;
    document.getElementById('referral-copy-btn').disabled = true;
    document.getElementById('referral-link').placeholder = 'Sign in to get your link';
    document.getElementById('notify-giveaways-toggle').disabled = true;
    document.getElementById('notify-sea-events-toggle').disabled = true;
    document.getElementById('notify-chat-mentions-toggle').disabled = true;
    document.getElementById('notify-sea-event-joins-toggle').disabled = true;
    document.getElementById('notify-crew-wars-toggle').disabled = true;
    document.getElementById('notify-new-messages-toggle').disabled = true;
    document.getElementById('notify-new-followers-toggle').disabled = true;
    document.getElementById('connections-list').innerHTML = `<span class="muted" style="font-size:0.85rem;">Sign in to view.</span>`;
    return;
  }

  renderAccountPanel(profile);
  renderConnectionsPanel(user, profile);
  setupChatColorPanel(user.id, profile);
  setupReferralPanel(profile.username, user.id);
  loadBlockedUsersList(user.id);

  const hideToggle = document.getElementById('hide-leaderboard-toggle');
  hideToggle.checked = !!profile?.hide_from_leaderboard;
  hideToggle.addEventListener('change', async () => {
    hideToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ hide_from_leaderboard: hideToggle.checked }).eq('id', user.id);
    hideToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      hideToggle.checked = !hideToggle.checked;
      return;
    }
    showToast(hideToggle.checked ? "You're hidden from the leaderboard." : "You're visible on the leaderboard again.");
  });

  const unlistedToggle = document.getElementById('profile-unlisted-toggle');
  unlistedToggle.checked = profile?.profile_visibility === 'unlisted';
  unlistedToggle.addEventListener('change', async () => {
    unlistedToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ profile_visibility: unlistedToggle.checked ? 'unlisted' : 'public' }).eq('id', user.id);
    unlistedToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      unlistedToggle.checked = !unlistedToggle.checked;
      return;
    }
    showToast(unlistedToggle.checked ? "Your profile is unlisted from search." : "Your profile is listed in search again.");
  });

  const notifyGiveawaysToggle = document.getElementById('notify-giveaways-toggle');
  notifyGiveawaysToggle.checked = profile?.notify_new_giveaways !== false;
  notifyGiveawaysToggle.addEventListener('change', async () => {
    notifyGiveawaysToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ notify_new_giveaways: notifyGiveawaysToggle.checked }).eq('id', user.id);
    notifyGiveawaysToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      notifyGiveawaysToggle.checked = !notifyGiveawaysToggle.checked;
      return;
    }
    showToast(notifyGiveawaysToggle.checked ? "You'll be notified about new giveaways." : 'Giveaway notifications turned off.');
  });

  const notifySeaEventsToggle = document.getElementById('notify-sea-events-toggle');
  notifySeaEventsToggle.checked = profile?.notify_new_sea_events !== false;
  notifySeaEventsToggle.addEventListener('change', async () => {
    notifySeaEventsToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ notify_new_sea_events: notifySeaEventsToggle.checked }).eq('id', user.id);
    notifySeaEventsToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      notifySeaEventsToggle.checked = !notifySeaEventsToggle.checked;
      return;
    }
    showToast(notifySeaEventsToggle.checked ? "You'll be notified about new sea events." : 'Sea event notifications turned off.');
  });

  const notifyChatMentionsToggle = document.getElementById('notify-chat-mentions-toggle');
  notifyChatMentionsToggle.checked = profile?.notify_chat_mentions !== false;
  notifyChatMentionsToggle.addEventListener('change', async () => {
    notifyChatMentionsToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ notify_chat_mentions: notifyChatMentionsToggle.checked }).eq('id', user.id);
    notifyChatMentionsToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      notifyChatMentionsToggle.checked = !notifyChatMentionsToggle.checked;
      return;
    }
    showToast(notifyChatMentionsToggle.checked ? "You'll be notified about chat replies and mentions." : 'Chat reply and mention notifications turned off.');
  });

  const notifySeaEventJoinsToggle = document.getElementById('notify-sea-event-joins-toggle');
  notifySeaEventJoinsToggle.checked = profile?.notify_sea_event_joins !== false;
  notifySeaEventJoinsToggle.addEventListener('change', async () => {
    notifySeaEventJoinsToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ notify_sea_event_joins: notifySeaEventJoinsToggle.checked }).eq('id', user.id);
    notifySeaEventJoinsToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      notifySeaEventJoinsToggle.checked = !notifySeaEventJoinsToggle.checked;
      return;
    }
    showToast(notifySeaEventJoinsToggle.checked ? "You'll be notified when someone joins your sea events." : 'Sea event join notifications turned off.');
  });

  const notifyCrewWarsToggle = document.getElementById('notify-crew-wars-toggle');
  notifyCrewWarsToggle.checked = profile?.notify_crew_wars !== false;
  notifyCrewWarsToggle.addEventListener('change', async () => {
    notifyCrewWarsToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ notify_crew_wars: notifyCrewWarsToggle.checked }).eq('id', user.id);
    notifyCrewWarsToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      notifyCrewWarsToggle.checked = !notifyCrewWarsToggle.checked;
      return;
    }
    showToast(notifyCrewWarsToggle.checked ? "You'll be notified about crew war calls and results." : 'Crew war notifications turned off.');
  });

  wireSimpleNotifyToggle('notify-new-messages-toggle', 'notify_new_messages', user.id, profile,
    "You'll be notified about new messages.", 'New message notifications turned off.');
  wireSimpleNotifyToggle('notify-new-followers-toggle', 'notify_new_followers', user.id, profile,
    "You'll be notified about new followers.", 'New follower notifications turned off.');

  document.getElementById('settings-signout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/';
  });

  document.getElementById('delete-account-btn').addEventListener('click', async () => {
    const typed = window.prompt('This permanently deletes your account and everything tied to it. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;

    const btn = document.getElementById('delete-account-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    const { error } = await sb.rpc('delete_my_account');
    if (error) {
      showToast(error.message, true);
      btn.disabled = false;
      btn.textContent = 'Delete My Account';
      return;
    }

    await sb.auth.signOut();
    window.location.href = '/';
  });
});

function renderAccountPanel(profile) {
  const panel = document.getElementById('account-panel');
  if (!profile) {
    panel.innerHTML = `<p class="muted">Couldn't load your account details.</p>`;
    return;
  }
  const roleTag = profile.role === 'admin'
    ? `<span class="tag" style="background:rgba(255,77,109,0.16); color:var(--blood-dim); margin-left:8px;">Admin</span>`
    : profile.role === 'mod'
    ? `<span class="tag" style="background:rgb(var(--brass-rgb) / 0.16); color:var(--brass-bright); margin-left:8px;">Mod</span>`
    : '';

  panel.innerHTML = `
    <div class="flex-between" style="flex-wrap:wrap; gap:14px;">
      <div>
        <p style="margin:0; font-weight:700;">${escapeHtml(displayNameFor(profile))}${roleTag}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.85rem;">@${escapeHtml(profile.username)} · joined ${formatDate(profile.created_at)}</p>
      </div>
      <a href="/profile/" class="btn btn-ghost btn-sm">Edit Profile</a>
    </div>
  `;
}

function highlightAccentSwatch(accent) {
  document.querySelectorAll('[data-accent-choice]').forEach(s => {
    s.classList.toggle('selected', s.dataset.accentChoice === accent);
  });
}

async function selectAccent(accent) {
  highlightAccentSwatch(accent);
  toggleCustomThemePanel(accent === 'custom');

  if (accent === 'custom') {
    // Picking "Custom" just opens the editor with today's colors pre-filled — it doesn't
    // save or apply anything on its own until the user hits Save.
    prefillCustomThemeInputs();
    return;
  }

  applyAccent(accent);
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await sb.from('profiles').update({ accent_color: accent }).eq('id', session.user.id);
  }
  showToast('Accent color updated.');
}

function toggleCustomThemePanel(show) {
  document.getElementById('custom-theme-panel').style.display = show ? 'block' : 'none';
}

function prefillCustomThemeInputs() {
  const saved = JSON.parse(localStorage.getItem('bc_custom_theme') || 'null');
  const computed = getComputedStyle(document.documentElement);
  const current = {
    ink: saved?.ink || rgbStringToHex(computed.getPropertyValue('--ink')) || '#08080c',
    navy: saved?.navy || rgbStringToHex(computed.getPropertyValue('--navy')) || '#16161f',
    'navy-light': saved?.['navy-light'] || rgbStringToHex(computed.getPropertyValue('--navy-light')) || '#2b2b38',
    brass: saved?.brass || rgbStringToHex(computed.getPropertyValue('--brass')) || '#2563eb',
    'brass-bright': saved?.['brass-bright'] || rgbStringToHex(computed.getPropertyValue('--brass-bright')) || '#60a5fa',
  };
  Object.entries(current).forEach(([key, value]) => {
    document.getElementById(`custom-color-${key}`).value = value;
  });
}

// getComputedStyle returns colors as rgb(...) strings, not hex — <input type="color"> only
// accepts hex, so this converts back for pre-filling the pickers from whatever's active now.
function rgbStringToHex(rgbStr) {
  const match = rgbStr.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgbStr.trim().startsWith('#') ? rgbStr.trim() : null;
  return '#' + match.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

function currentCustomThemeColors() {
  return {
    ink: document.getElementById('custom-color-ink').value,
    navy: document.getElementById('custom-color-navy').value,
    'navy-light': document.getElementById('custom-color-navy-light').value,
    brass: document.getElementById('custom-color-brass').value,
    'brass-bright': document.getElementById('custom-color-brass-bright').value,
  };
}

function previewCustomTheme() {
  applyCustomTheme(currentCustomThemeColors());
}

async function saveCustomTheme() {
  const colors = currentCustomThemeColors();
  applyCustomTheme(colors);
  highlightAccentSwatch('custom');

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await sb.from('profiles').update({ accent_color: 'custom', custom_theme_colors: colors }).eq('id', session.user.id);
  }
  showToast('Custom theme saved.');
}

async function resetToDefaultTheme() {
  clearCustomTheme();
  applyAccent('blue');
  highlightAccentSwatch('blue');
  toggleCustomThemePanel(false);

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await sb.from('profiles').update({ accent_color: 'blue', custom_theme_colors: null }).eq('id', session.user.id);
  }
  showToast('Reset to the default theme.');
}

function wireSimpleNotifyToggle(elId, column, userId, profile, onMsg, offMsg) {
  const toggle = document.getElementById(elId);
  toggle.checked = profile?.[column] !== false;
  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    const { error } = await sb.from('profiles').update({ [column]: toggle.checked }).eq('id', userId);
    toggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      toggle.checked = !toggle.checked;
      return;
    }
    showToast(toggle.checked ? onMsg : offMsg);
  });
}

function setupChatColorPanel(userId, profile) {
  const picker = document.getElementById('chat-color-picker');
  picker.value = profile?.chat_name_color || chatNameColorHexFallback(profile);

  picker.addEventListener('change', async () => {
    const { error } = await sb.from('profiles').update({ chat_name_color: picker.value }).eq('id', userId);
    if (error) { showToast(error.message, true); return; }
    showToast('Chat name color updated.');
  });

  document.getElementById('chat-color-auto-btn').addEventListener('click', async () => {
    const { error } = await sb.from('profiles').update({ chat_name_color: null }).eq('id', userId);
    if (error) { showToast(error.message, true); return; }
    picker.value = chatNameColorHexFallback(profile);
    showToast('Back to an automatic color.');
  });
}

// chatNameColor() in supabase-client.js can return a var(--blood-dim) string for staff, which
// <input type="color"> can't display — this resolves it to a real hex for the picker only.
function chatNameColorHexFallback(profile) {
  const c = chatNameColor({ ...profile, chat_name_color: null });
  return c.startsWith('var(') ? '#e11d48' : c;
}

async function renderConnectionsPanel(user, profile) {
  const list = document.getElementById('connections-list');

  const { data: identitiesData } = await sb.auth.getUserIdentities();
  const identities = identitiesData?.identities || [];
  const hasDiscordIdentity = identities.some(i => i.provider === 'discord');
  const hasRobloxIdentity = identities.some(i => i.provider === 'custom:roblox');

  // Discord row — every account has a Discord identity from signup in the common case, so try
  // a silent username sync first; a real "Connect" button only shows up if that comes up empty
  // (e.g. someone who originally signed up with Roblox and has no Discord identity at all).
  let discordConnected = !!profile?.discord_username;
  let discordName = profile?.discord_username;

  if (!discordConnected && hasDiscordIdentity) {
    const { data: { user: freshUser } } = await sb.auth.getUser();
    const discordIdentity = freshUser?.identities?.find(i => i.provider === 'discord');
    const idData = discordIdentity?.identity_data || {};
    const metaData = freshUser?.user_metadata || {};
    const username = idData.user_name || idData.preferred_username || idData.username || idData.global_name || idData.full_name || idData.name
      || metaData.user_name || metaData.preferred_username || metaData.username || metaData.global_name || metaData.full_name || metaData.name;
    const discordId = idData.provider_id || idData.sub || metaData.provider_id || metaData.sub || null;
    if (username) {
      const { error } = await sb.rpc('sync_discord_identity', { p_username: username, p_discord_id: discordId });
      if (!error) { discordConnected = true; discordName = username; }
    }
  }

  const buildRow = (label, iconName, connected, name, onConnect) => {
    const id = `connect-${label.toLowerCase()}-btn`;
    return {
      html: `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <span style="display:flex; align-items:center; gap:8px; font-size:0.9rem; font-weight:600;"><i data-lucide="${iconName}" class="icon-sm"></i>${label}</span>
          ${connected
            ? `<span class="tag tag-easy"><i data-lucide="check" class="icon-sm icon-inline"></i>Connected${name ? ` as ${escapeHtml(name)}` : ''}</span>`
            : `<button type="button" class="btn btn-primary btn-sm" id="${id}"><i data-lucide="link" class="icon-sm icon-inline"></i>Connect ${label}</button>`}
        </div>
      `,
      id,
      connected,
      onConnect,
    };
  };

  const discordRow = buildRow('Discord', 'message-circle', discordConnected, discordName, async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin + '/settings/#account' } });
    if (error) showToast(error.message, true);
  });
  const robloxRow = buildRow('Roblox', 'gamepad-2', hasRobloxIdentity || !!profile?.roblox_verified, profile?.roblox_username, () => {
    startRobloxOAuthConnect(window.location.origin + '/settings/#account');
  });

  list.innerHTML = discordRow.html + robloxRow.html;
  refreshIcons();

  if (!discordRow.connected) document.getElementById(discordRow.id).addEventListener('click', discordRow.onConnect);
  if (!robloxRow.connected) document.getElementById(robloxRow.id).addEventListener('click', robloxRow.onConnect);
}

async function setupReferralPanel(username, userId) {
  const input = document.getElementById('referral-link');
  const countEl = document.getElementById('referral-count');
  const url = `${location.origin}/auth/?ref=${encodeURIComponent(username)}`;
  input.value = url;

  document.getElementById('referral-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Referral link copied.');
    } catch {
      input.select();
      showToast('Select and copy the link above.');
    }
  });

  const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', userId);
  countEl.textContent = count
    ? `${count} friend${count === 1 ? '' : 's'} joined with your link so far.`
    : 'No referrals yet — share your link to start earning XP.';
}

async function wirePushNotifToggle() {
  const panel = document.getElementById('push-notif-panel');
  const btn = document.getElementById('push-notif-btn');
  const desc = document.getElementById('push-notif-desc');
  if (!panel || !btn) return;

  const state = await getPushSubscriptionState();
  if (state === 'unsupported') {
    desc.textContent = "Push notifications aren't supported in this browser.";
    btn.style.display = 'none';
    return;
  }

  const render = (subscribed) => {
    btn.textContent = subscribed ? 'Disable' : 'Enable';
    btn.className = `btn btn-sm ${subscribed ? 'btn-ghost' : 'btn-primary'}`;
    desc.textContent = subscribed
      ? "You'll get push notifications on this device."
      : "Get notified on this device even when BloxCore isn't open — giveaway wins, trade replies, and more.";
  };
  render(state === 'subscribed');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if ((await getPushSubscriptionState()) === 'subscribed') {
        await unsubscribeFromPush();
        render(false);
      } else {
        await subscribeToPush();
        render(true);
        showToast('Push notifications enabled on this device.');
      }
    } catch (e) {
      showToast(e.message || 'Something went wrong.', true);
    }
    btn.disabled = false;
  });
}

async function loadBlockedUsersList(userId) {
  const container = document.getElementById('blocked-users-list');
  const { data, error } = await sb.from('blocked_users')
    .select('id, kind, blocked_id, profiles!blocked_users_blocked_id_fkey(username, display_name, avatar_url, avatar_frame)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<p class="muted">Couldn't load this right now.</p>`; return; }
  if (!data.length) { container.innerHTML = `<p class="muted" style="font-size:0.85rem;">You haven't blocked or muted anyone.</p>`; return; }

  container.innerHTML = data.map(row => `
    <div class="flex-between" style="padding:12px 0; border-bottom:1px solid var(--glass-border);" data-blocked-row="${row.id}">
      <div style="display:flex; align-items:center; gap:10px;">
        ${avatarHtml(row.profiles || {}, 30)}
        <a href="/player/?u=${encodeURIComponent(row.profiles?.username || '')}" style="color:var(--bone); text-decoration:none; font-weight:600; font-size:0.88rem;">${escapeHtml(displayNameFor(row.profiles || {}))}</a>
        <span class="tag ${row.kind === 'block' ? '' : 'tag-medium'}" style="${row.kind === 'block' ? 'background:rgba(220,38,38,0.15); color:var(--blood-dim);' : ''}">${row.kind === 'block' ? 'Blocked' : 'Muted'}</span>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-unblock="${row.id}">${row.kind === 'block' ? 'Unblock' : 'Unmute'}</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-unblock]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error: delError } = await sb.from('blocked_users').delete().eq('id', btn.dataset.unblock);
      if (delError) { showToast(delError.message, true); btn.disabled = false; return; }
      document.querySelector(`[data-blocked-row="${btn.dataset.unblock}"]`)?.remove();
      showToast('Removed.');
      if (!container.querySelector('[data-blocked-row]')) {
        container.innerHTML = `<p class="muted" style="font-size:0.85rem;">You haven't blocked or muted anyone.</p>`;
      }
    });
  });
}
