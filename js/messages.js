// BloxCore — chat/index.html Messages + Friends tabs logic (loaded alongside chat.js, which
// declares the shared currentUser/currentProfile globals used here)

let friends = []; // [{ friendshipId, profile, lastMessage, lastMessageAt, unread }]
let incomingRequests = []; // [{ friendshipId, profile }]
let outgoingRequestIds = new Set(); // profile ids we've already sent a request to
let friendIds = new Set();
let activeFriendId = null;
let activeFriendshipId = null;
let dmChannel = null;
let searchDebounce = null;

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  if (!user) {
    document.getElementById('messages-signed-out').style.display = 'block';
    document.getElementById('friends-tab-signed-out').style.display = 'block';
    return;
  }
  currentUser = user;
  currentProfile = profile;
  document.getElementById('messages-app').style.display = 'grid';
  document.getElementById('friends-tab-app').style.display = 'block';

  document.getElementById('friend-search-input').addEventListener('input', handleSearchInput);
  document.getElementById('thread-back-btn').addEventListener('click', closeThread);
  document.getElementById('thread-send-form').addEventListener('submit', handleSendMessage);
  document.getElementById('thread-unfriend-btn').addEventListener('click', handleUnfriend);
  document.getElementById('thread-more-btn').addEventListener('click', () => {
    const menu = document.getElementById('thread-more-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#thread-more-btn') && !e.target.closest('#thread-more-menu')) {
      document.getElementById('thread-more-menu').style.display = 'none';
    }
  });
  document.getElementById('thread-mute-btn').addEventListener('click', toggleMute);
  document.getElementById('thread-block-btn').addEventListener('click', toggleBlock);
  document.querySelectorAll('[data-goto-friends-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchHubTab('friends'));
  });

  await loadFriendData();
  subscribeToIncomingMessages();

  const params = new URLSearchParams(window.location.search);
  const targetUsername = params.get('u');
  if (targetUsername) {
    const target = friends.find(f => f.profile.username === targetUsername);
    if (target) openThread(target.profile, target.friendshipId);
  }
});

async function loadFriendData() {
  const [{ data: asRequester }, { data: asAddressee }] = await Promise.all([
    sb.from('friendships').select('id, status, addressee:addressee_id(id, username, display_name, avatar_url, avatar_frame, title_color_override, last_active_at, titles(name, color))').eq('requester_id', currentUser.id),
    sb.from('friendships').select('id, status, requester:requester_id(id, username, display_name, avatar_url, avatar_frame, title_color_override, last_active_at, titles(name, color))').eq('addressee_id', currentUser.id),
  ]);

  const accepted = [];
  incomingRequests = [];
  outgoingRequestIds = new Set();

  (asRequester || []).forEach(row => {
    if (row.status === 'accepted') accepted.push({ friendshipId: row.id, profile: row.addressee });
    else outgoingRequestIds.add(row.addressee.id);
  });
  (asAddressee || []).forEach(row => {
    if (row.status === 'accepted') accepted.push({ friendshipId: row.id, profile: row.requester });
    else incomingRequests.push({ friendshipId: row.id, profile: row.requester });
  });

  friendIds = new Set(accepted.map(f => f.profile.id));

  // Pull the latest message + unread count per friend for previews/sorting/badges.
  let previews = new Map();
  if (accepted.length) {
    const ids = accepted.map(f => f.profile.id);
    const { data: recent } = await sb
      .from('direct_messages')
      .select('sender_id, recipient_id, message, created_at, read_at')
      .or(`and(sender_id.eq.${currentUser.id},recipient_id.in.(${ids.join(',')})),and(recipient_id.eq.${currentUser.id},sender_id.in.(${ids.join(',')}))`)
      .order('created_at', { ascending: false });

    (recent || []).forEach(m => {
      const otherId = m.sender_id === currentUser.id ? m.recipient_id : m.sender_id;
      if (!previews.has(otherId)) previews.set(otherId, { message: m.message, at: m.created_at, unread: 0 });
      if (m.recipient_id === currentUser.id && !m.read_at) previews.get(otherId).unread++;
    });
  }

  friends = accepted.map(f => ({
    ...f,
    lastMessage: previews.get(f.profile.id)?.message || null,
    lastMessageAt: previews.get(f.profile.id)?.at || null,
    unread: previews.get(f.profile.id)?.unread || 0,
  })).sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return displayNameFor(a.profile).localeCompare(displayNameFor(b.profile));
  });

  renderFriendRequests();
  renderFriendsList();
}

function renderFriendRequests() {
  const section = document.getElementById('friend-requests-section');
  const list = document.getElementById('friend-requests-list');
  if (!incomingRequests.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  list.innerHTML = incomingRequests.map(r => `
    <div class="friend-request-row" data-request-id="${r.friendshipId}">
      ${avatarHtml(r.profile, 34)}
      <span class="friend-row-name" style="flex:1;">${escapeHtml(displayNameFor(r.profile))}</span>
      <button type="button" class="btn btn-primary btn-sm" data-accept="${r.friendshipId}"><i data-lucide="check" class="icon-sm"></i></button>
      <button type="button" class="btn btn-ghost btn-sm" data-decline="${r.friendshipId}"><i data-lucide="x" class="icon-sm"></i></button>
    </div>
  `).join('');

  list.querySelectorAll('[data-accept]').forEach(btn => {
    btn.addEventListener('click', () => respondToRequest(btn.dataset.accept, 'accepted'));
  });
  list.querySelectorAll('[data-decline]').forEach(btn => {
    btn.addEventListener('click', () => respondToRequest(btn.dataset.decline, 'declined'));
  });
  refreshIcons();
}

async function respondToRequest(friendshipId, action) {
  const { error } = action === 'accepted'
    ? await sb.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', friendshipId)
    : await sb.from('friendships').delete().eq('id', friendshipId);

  if (error) { showToast(error.message, true); return; }
  showToast(action === 'accepted' ? 'Friend request accepted!' : 'Request declined.');
  await loadFriendData();
}

function renderFriendsList() {
  const list = document.getElementById('friends-list');
  const empty = document.getElementById('friends-empty');

  if (!friends.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';

    list.innerHTML = friends.map(f => `
      <div class="friend-row ${f.profile.id === activeFriendId ? 'active' : ''}" data-friend-id="${f.profile.id}">
        ${avatarHtml(f.profile, 38, '', presenceStatus(f.profile.last_active_at))}
        <div style="min-width:0; flex:1;">
          <div class="friend-row-name">${escapeHtml(displayNameFor(f.profile))}</div>
          <div class="friend-row-preview">${f.lastMessage ? escapeHtml(f.lastMessage) : 'Say hi!'}</div>
        </div>
        ${f.unread ? `<span class="friend-row-unread">${f.unread > 9 ? '9+' : f.unread}</span>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('[data-friend-id]').forEach(row => {
      row.addEventListener('click', () => {
        const f = friends.find(x => x.profile.id === row.dataset.friendId);
        if (f) openThread(f.profile, f.friendshipId);
      });
    });
  }

  renderFriendsManagementList();
  refreshIcons();
}

function renderFriendsManagementList() {
  const list = document.getElementById('friends-management-list');
  const empty = document.getElementById('friends-management-empty');
  if (!list) return; // Friends tab markup not on this page

  if (!friends.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = friends.map(f => `
    <div class="friend-row" data-manage-friend-id="${f.profile.id}" style="cursor:default;">
      ${avatarHtml(f.profile, 38)}
      <div style="min-width:0; flex:1;">
        <div class="friend-row-name">${escapeHtml(displayNameFor(f.profile))}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-message-friend="${f.profile.id}" title="Message"><i data-lucide="mail" class="icon-sm"></i></button>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-friend="${f.friendshipId}" title="Remove friend"><i data-lucide="user-minus" class="icon-sm"></i></button>
    </div>
  `).join('');

  list.querySelectorAll('[data-message-friend]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = friends.find(x => x.profile.id === btn.dataset.messageFriend);
      if (!f) return;
      switchHubTab('messages');
      openThread(f.profile, f.friendshipId);
    });
  });
  list.querySelectorAll('[data-remove-friend]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Remove this friend?')) return;
      const { error } = await sb.from('friendships').delete().eq('id', btn.dataset.removeFriend);
      if (error) { showToast(error.message, true); return; }
      showToast('Friend removed.');
      await loadFriendData();
    });
  });
  refreshIcons();
}

// ---- Friend search ----

function handleSearchInput() {
  clearTimeout(searchDebounce);
  const query = document.getElementById('friend-search-input').value.trim();
  const results = document.getElementById('friend-search-results');
  if (!query) { results.innerHTML = ''; return; }
  searchDebounce = setTimeout(() => searchPlayers(query), 300);
}

async function searchPlayers(query) {
  const { data } = await sb.from('profiles').select('id, username, display_name, avatar_url, avatar_frame').ilike('username', `%${query}%`).limit(8);
  const results = document.getElementById('friend-search-results');
  const list = (data || []).filter(p => p.id !== currentUser.id);

  if (!list.length) { results.innerHTML = `<p class="muted" style="font-size:0.8rem; padding:6px 4px;">No players found.</p>`; return; }

  results.innerHTML = list.map(p => {
    let actionHtml;
    if (friendIds.has(p.id)) actionHtml = `<span class="tag tag-easy">Friends</span>`;
    else if (outgoingRequestIds.has(p.id)) actionHtml = `<span class="tag tag-medium">Requested</span>`;
    else actionHtml = `<button type="button" class="btn btn-primary btn-sm" data-add-friend="${p.id}">Add</button>`;

    return `
      <div class="friend-search-row">
        <a href="/player/?u=${encodeURIComponent(p.username)}" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; text-decoration:none; color:var(--bone);">
          ${avatarHtml(p, 28)}<span style="font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(displayNameFor(p))}</span>
        </a>
        ${actionHtml}
      </div>
    `;
  }).join('');

  results.querySelectorAll('[data-add-friend]').forEach(btn => {
    btn.addEventListener('click', () => sendFriendRequest(btn.dataset.addFriend));
  });
}

async function sendFriendRequest(addresseeId) {
  const { error } = await sb.from('friendships').insert({ requester_id: currentUser.id, addressee_id: addresseeId });
  if (error) { showToast(error.message, true); return; }
  showToast('Friend request sent!');
  outgoingRequestIds.add(addresseeId);
  handleSearchInput();
}

// ---- Thread ----

function openThread(profile, friendshipId) {
  activeFriendId = profile.id;
  activeFriendshipId = friendshipId;

  document.getElementById('thread-empty-state').style.display = 'none';
  document.getElementById('thread-view').style.display = 'flex';
  document.getElementById('messages-app').classList.add('thread-active');

  document.getElementById('thread-header-info').innerHTML = `
    ${avatarHtml(profile, 32, '', presenceStatus(profile.last_active_at))}
    <div style="min-width:0;">
      <a href="/player/?u=${encodeURIComponent(profile.username)}" style="color:var(--bone); font-weight:700; text-decoration:none; font-size:0.92rem; display:block;">${escapeHtml(displayNameFor(profile))}</a>
      <span class="muted" style="font-size:0.72rem;">${escapeHtml(lastSeenLabel(profile.last_active_at))}</span>
    </div>
  `;
  renderFriendsList();
  refreshIcons();
  loadThreadMessages();
  loadThreadBlockMuteState();
}

async function loadThreadBlockMuteState() {
  const { data } = await sb.from('blocked_users').select('kind').eq('blocker_id', currentUser.id).eq('blocked_id', activeFriendId).maybeSingle();
  document.getElementById('thread-mute-label').textContent = data?.kind === 'mute' ? 'Unmute' : 'Mute';
  document.getElementById('thread-block-label').textContent = data?.kind === 'block' ? 'Unblock' : 'Block';
}

async function toggleMute() {
  document.getElementById('thread-more-menu').style.display = 'none';
  const { data: existing } = await sb.from('blocked_users').select('id, kind').eq('blocker_id', currentUser.id).eq('blocked_id', activeFriendId).maybeSingle();

  if (existing?.kind === 'mute') {
    await sb.from('blocked_users').delete().eq('id', existing.id);
    showToast('Unmuted.');
  } else if (existing?.kind === 'block') {
    showToast('Unblock them first to change mute settings.', true);
    return;
  } else {
    const { error } = await sb.from('blocked_users').insert({ blocker_id: currentUser.id, blocked_id: activeFriendId, kind: 'mute' });
    if (error) { showToast(error.message, true); return; }
    showToast('Muted — you won\'t get notifications for their messages, but can still see them here.');
  }
  loadThreadBlockMuteState();
}

async function toggleBlock() {
  document.getElementById('thread-more-menu').style.display = 'none';
  const { data: existing } = await sb.from('blocked_users').select('id, kind').eq('blocker_id', currentUser.id).eq('blocked_id', activeFriendId).maybeSingle();

  if (existing?.kind === 'block') {
    if (!window.confirm('Unblock this person? They\'ll be able to message you again.')) return;
    await sb.from('blocked_users').delete().eq('id', existing.id);
    showToast('Unblocked.');
  } else {
    if (!window.confirm('Block this person? Neither of you will be able to send messages until you unblock them.')) return;
    if (existing) await sb.from('blocked_users').delete().eq('id', existing.id);
    const { error } = await sb.from('blocked_users').insert({ blocker_id: currentUser.id, blocked_id: activeFriendId, kind: 'block' });
    if (error) { showToast(error.message, true); return; }
    showToast('Blocked.');
  }
  loadThreadBlockMuteState();
}

function closeThread() {
  document.getElementById('messages-app').classList.remove('thread-active');
}

async function loadThreadMessages() {
  const container = document.getElementById('thread-messages');
  container.innerHTML = `<div class="skeleton" style="height:80px;"></div>`;

  const { data, error } = await sb
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${activeFriendId}),and(sender_id.eq.${activeFriendId},recipient_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) { container.innerHTML = errorStateHtml("Couldn't load messages.", 'loadThreadMessages()'); refreshIcons(); return; }

  container.innerHTML = data.length
    ? data.map(renderMessageBubble).join('')
    : `<p class="muted" style="text-align:center; margin-top:24px;">This is the start of your conversation. Messages here auto-delete after 7 days.</p>`;
  container.scrollTop = container.scrollHeight;

  const unreadIds = data.filter(m => m.recipient_id === currentUser.id && !m.read_at).map(m => m.id);
  if (unreadIds.length) {
    await sb.from('direct_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    const f = friends.find(x => x.profile.id === activeFriendId);
    if (f) f.unread = 0;
    renderFriendsList();
  }
}

function renderMessageBubble(m) {
  const mine = m.sender_id === currentUser.id;
  // WhatsApp-style receipts: one check = sent, two (highlighted) = the recipient has
  // actually opened the thread and it got marked read. Only shown on my own messages —
  // there's nothing useful to tell the other person about messages they sent me.
  const receipt = mine
    ? (m.read_at
        ? `<i data-lucide="check-check" class="icon-sm" style="color:var(--sea); vertical-align:-2px;" title="Read"></i>`
        : `<i data-lucide="check" class="icon-sm" style="color:var(--ash); vertical-align:-2px;" title="Sent"></i>`)
    : '';
  return `
    <div class="chat-row ${mine ? 'mine' : ''}" data-message-id="${m.id}">
      <div class="chat-row-body">
        <div class="chat-bubble">${escapeHtml(m.message)}</div>
        <p class="chat-row-meta">${timeAgo(m.created_at)}${receipt ? ` ${receipt}` : ''}</p>
      </div>
    </div>
  `;
}

async function handleSendMessage(e) {
  e.preventDefault();
  if (!activeFriendId) return;
  const input = document.getElementById('thread-input');
  const text = input.value.trim();
  if (!text) return;

  const sendBtn = document.getElementById('thread-send-btn');
  sendBtn.disabled = true;
  const { data, error } = await sb.from('direct_messages').insert({
    sender_id: currentUser.id,
    recipient_id: activeFriendId,
    message: text,
  }).select().single();
  sendBtn.disabled = false;

  if (error) {
    // RLS blocks the insert silently as a generic policy violation — give a message that
    // actually explains why, since "new row violates row-level security policy" means
    // nothing to a player who just got blocked (or blocked the other person themselves).
    showToast(error.message.includes('row-level security') ? 'This message couldn\'t be sent — one of you has the other blocked.' : error.message, true);
    return;
  }

  input.value = '';
  const container = document.getElementById('thread-messages');
  if (container.querySelector('.empty-state, p.muted')) container.innerHTML = '';
  container.insertAdjacentHTML('beforeend', renderMessageBubble(data));
  container.scrollTop = container.scrollHeight;

  const f = friends.find(x => x.profile.id === activeFriendId);
  if (f) { f.lastMessage = text; f.lastMessageAt = data.created_at; }
  friends.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  renderFriendsList();
}

function subscribeToIncomingMessages() {
  if (dmChannel) return;
  dmChannel = sb
    .channel(`dm-inbox:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${currentUser.id}` }, async (payload) => {
      const m = payload.new;
      if (m.sender_id === activeFriendId) {
        const container = document.getElementById('thread-messages');
        if (container.querySelector('.empty-state, p.muted')) container.innerHTML = '';
        container.insertAdjacentHTML('beforeend', renderMessageBubble(m));
        container.scrollTop = container.scrollHeight;
        await sb.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', m.id);
      } else {
        const f = friends.find(x => x.profile.id === m.sender_id);
        if (f) { f.unread++; f.lastMessage = m.message; f.lastMessageAt = m.created_at; }
        else { await loadFriendData(); return; }
        friends.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
        renderFriendsList();
      }
    })
    // Messages I sent getting marked read by the other person — swap that bubble's
    // single check to a double check live, without needing to reopen the thread.
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${currentUser.id}` }, (payload) => {
      const m = payload.new;
      if (!m.read_at || m.recipient_id !== activeFriendId) return;
      const row = document.querySelector(`[data-message-id="${m.id}"] .chat-row-meta`);
      if (row) row.innerHTML = `${timeAgo(m.created_at)} <i data-lucide="check-check" class="icon-sm" style="color:var(--sea); vertical-align:-2px;" title="Read"></i>`;
      refreshIcons();
    })
    .subscribe();
}

async function handleUnfriend() {
  if (!activeFriendshipId) return;
  if (!window.confirm('Remove this friend? Your message history will no longer be reachable.')) return;
  const { error } = await sb.from('friendships').delete().eq('id', activeFriendshipId);
  if (error) { showToast(error.message, true); return; }
  showToast('Friend removed.');
  closeThread();
  document.getElementById('thread-empty-state').style.display = 'flex';
  document.getElementById('thread-view').style.display = 'none';
  activeFriendId = null;
  activeFriendshipId = null;
  await loadFriendData();
}
