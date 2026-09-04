// BloxCore — chat/index.html logic

const CHAT_HISTORY_LIMIT = 50;
let currentUser = null;
let currentProfile = null;
let isStaff = false;
let lastSendAt = 0;
let SEND_COOLDOWN_MS = 10000;
let MIN_CHAT_MESSAGE_LENGTH = 2;
const REACTION_PRESET = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

// message_id -> Map(emoji -> Set(user_id))
const reactionsByMessage = new Map();
const messagesById = new Map(); // for reply-quote lookups without a re-fetch
let replyingTo = null; // { id, name, message } | null
let chatParticipants = []; // recent chatters, for the @mention autocomplete

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;
  isStaff = profile?.role === 'mod' || profile?.role === 'admin';

  const settings = await getSiteSettings();
  SEND_COOLDOWN_MS = settings.chatCooldownSeconds * 1000;
  MIN_CHAT_MESSAGE_LENGTH = settings.minChatMessageLength;
  document.getElementById('chat-input').maxLength = settings.maxChatMessageLength;

  document.getElementById('chat-compose').style.display = currentUser ? 'block' : 'none';
  document.getElementById('chat-signed-out').style.display = currentUser ? 'none' : 'block';

  try {
    await loadHistory();
  } catch (e) {
    logError('Failed to load chat history:', e);
  }
  subscribeToChat();

  document.getElementById('chat-form').addEventListener('submit', handleSend);
  document.getElementById('chat-attach-btn').addEventListener('click', () => document.getElementById('chat-image-input').click());
  document.getElementById('chat-image-input').addEventListener('change', handleImageSelect);
  document.getElementById('chat-image-remove-btn').addEventListener('click', clearImageSelection);
  wireMentionAutocomplete();
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.reaction-popover') && !e.target.closest('[data-add-reaction]')) {
      document.querySelectorAll('.reaction-popover.open').forEach(p => p.classList.remove('open'));
    }
  });
});

async function loadHistory() {
  const container = document.getElementById('chat-messages');

  const { data, error } = await sb
    .from('chat_messages')
    .select('id, user_id, message, image_url, created_at, reply_to_id, profiles(id, username, display_name, avatar_url, avatar_frame, role, title_color_override, chat_name_color, titles(name, color)), reply_to:reply_to_id(id, message, profiles(username, display_name))')
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);

  if (error) {
    container.innerHTML = errorStateHtml("Couldn't load chat right now.", 'loadHistory()');
    refreshIcons();
    logError(error);
    return;
  }

  const ordered = [...data].reverse();
  messagesById.clear();
  ordered.forEach(m => messagesById.set(m.id, m));

  const seen = new Set();
  chatParticipants = [];
  ordered.forEach(m => {
    const u = m.profiles?.username;
    if (u && !seen.has(u)) { seen.add(u); chatParticipants.push(m.profiles); }
  });

  reactionsByMessage.clear();
  if (ordered.length) {
    const { data: reactions } = await sb.from('chat_reactions').select('message_id, user_id, emoji').in('message_id', ordered.map(m => m.id));
    (reactions || []).forEach(r => addReactionToState(r.message_id, r.emoji, r.user_id));
  }

  container.innerHTML = ordered.map(renderMessage).join('') || `<p class="muted">No messages yet — say hi!</p>`;
  scrollToBottom(container);

  wireMessageActions();
}

function addReactionToState(messageId, emoji, userId) {
  if (!reactionsByMessage.has(messageId)) reactionsByMessage.set(messageId, new Map());
  const byEmoji = reactionsByMessage.get(messageId);
  if (!byEmoji.has(emoji)) byEmoji.set(emoji, new Set());
  byEmoji.get(emoji).add(userId);
}

function removeReactionFromState(messageId, emoji, userId) {
  const byEmoji = reactionsByMessage.get(messageId);
  if (!byEmoji || !byEmoji.has(emoji)) return;
  byEmoji.get(emoji).delete(userId);
  if (byEmoji.get(emoji).size === 0) byEmoji.delete(emoji);
}

function renderReactionBar(messageId) {
  const byEmoji = reactionsByMessage.get(messageId);
  const pills = byEmoji ? [...byEmoji.entries()].map(([emoji, users]) => {
    const mine = currentUser && users.has(currentUser.id);
    return `<button type="button" class="reaction-pill ${mine ? 'mine' : ''}" data-toggle-reaction="${emoji}">${emoji} <span>${users.size}</span></button>`;
  }).join('') : '';

  const addBtn = currentUser ? `
    <div style="position:relative; display:inline-block;">
      <button type="button" class="reaction-pill" data-add-reaction title="Add reaction"><i data-lucide="smile-plus" class="icon-sm"></i></button>
      <div class="reaction-popover">
        ${REACTION_PRESET.map(e => `<button type="button" data-toggle-reaction="${e}">${e}</button>`).join('')}
      </div>
    </div>
  ` : '';

  return `<div class="reaction-bar" data-reaction-bar="${messageId}">${pills}${addBtn}</div>`;
}

function highlightMentions(escapedText) {
  return escapedText.replace(/(^|\s)@([a-zA-Z0-9_.]{2,32})/g, (match, pre, name) => `${pre}<span class="chat-mention">@${name}</span>`);
}

function renderMessage(m) {
  const profile = m.profiles || {};
  const name = displayNameFor(profile);
  const avatar = avatarHtml(profile, 32);
  const canDelete = isStaff || m.user_id === currentUser?.id;
  const mine = m.user_id === currentUser?.id;

  const replyQuote = m.reply_to ? `
    <div class="chat-reply-quote">
      <i data-lucide="corner-up-left" class="icon-sm"></i>
      <span><strong>${escapeHtml(displayNameFor(m.reply_to.profiles || {}))}</strong>: ${escapeHtml((m.reply_to.message || '').slice(0, 80))}</span>
    </div>
  ` : '';

  return `
    <div class="chat-row ${mine ? 'mine' : ''}" data-message-id="${m.id}">
      ${avatar}
      <div class="chat-row-body">
        <p class="chat-row-meta">
          <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:${chatNameColor(profile)}; text-decoration:none; font-weight:600;">${escapeHtml(name)}</a> ${titleBadge(profile)}
          <span style="font-family:var(--font-mono); margin-left:6px;">${timeAgo(m.created_at)}</span>
        </p>
        <div class="chat-bubble">
          ${replyQuote}
          ${m.message ? `<p style="margin:0; font-size:0.92rem; white-space:pre-wrap; word-break:break-word; text-align:left;">${highlightMentions(escapeHtml(m.message))}</p>` : ''}
          ${m.image_url ? `<a href="${m.image_url}" target="_blank" rel="noopener noreferrer"><img src="${m.image_url}" alt="" loading="lazy" class="chat-bubble-image"></a>` : ''}
          <div class="chat-bubble-actions">
            ${currentUser ? `<button class="chat-action-btn" data-reply-id="${m.id}" title="Reply"><i data-lucide="corner-up-left" class="icon-sm"></i></button>` : ''}
            ${canDelete ? `<button class="chat-action-btn" data-delete-id="${m.id}" title="Delete message"><i data-lucide="x" class="icon-sm"></i></button>` : ''}
          </div>
        </div>
        ${renderReactionBar(m.id)}
      </div>
    </div>
  `;
}

function wireMessageActions() {
  document.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => deleteMessage(btn.dataset.deleteId));
  });
  document.querySelectorAll('[data-reply-id]').forEach(btn => {
    btn.addEventListener('click', () => startReply(btn.dataset.replyId));
  });
  document.querySelectorAll('[data-add-reaction]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = btn.nextElementSibling;
      document.querySelectorAll('.reaction-popover.open').forEach(p => { if (p !== popover) p.classList.remove('open'); });
      popover.classList.toggle('open');
    });
  });
  document.querySelectorAll('[data-toggle-reaction]').forEach(btn => {
    btn.addEventListener('click', () => {
      const bar = btn.closest('[data-reaction-bar]');
      if (bar) toggleReaction(bar.dataset.reactionBar, btn.dataset.toggleReaction);
    });
  });
  refreshIcons();
}

async function toggleReaction(messageId, emoji) {
  if (!currentUser) { showToast('Sign in to react.', true); return; }
  const byEmoji = reactionsByMessage.get(messageId);
  const alreadyReacted = byEmoji?.get(emoji)?.has(currentUser.id);

  if (alreadyReacted) {
    await sb.from('chat_reactions').delete().eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji);
    removeReactionFromState(messageId, emoji, currentUser.id);
  } else {
    await sb.from('chat_reactions').insert({ message_id: messageId, user_id: currentUser.id, emoji });
    addReactionToState(messageId, emoji, currentUser.id);
  }

  const bar = document.querySelector(`[data-reaction-bar="${messageId}"]`);
  if (bar) { bar.outerHTML = renderReactionBar(messageId); wireMessageActions(); }
}

async function deleteMessage(id) {
  if (!window.confirm('Delete this message?')) return;
  const { error } = await sb.from('chat_messages').delete().eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  document.querySelector(`[data-message-id="${id}"]`)?.remove();
}

let _chatChannel = null;
let _reactionsChannel = null;

function subscribeToChat() {
  _chatChannel = sb.channel('public:chat_messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
      const { data: profile } = await sb
        .from('profiles')
        .select('id, username, display_name, avatar_url, avatar_frame, role, title_color_override, chat_name_color, titles(name, color)')
        .eq('id', payload.new.user_id)
        .single();

      let replyTo = null;
      if (payload.new.reply_to_id) {
        const { data } = await sb.from('chat_messages').select('id, message, profiles(username, display_name)').eq('id', payload.new.reply_to_id).single();
        replyTo = data;
      }

      appendMessage({ ...payload.new, profiles: profile, reply_to: replyTo });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
      document.querySelector(`[data-message-id="${payload.old.id}"]`)?.remove();
    })
    .subscribe();

  _reactionsChannel = sb.channel('public:chat_reactions')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_reactions' }, (payload) => {
      addReactionToState(payload.new.message_id, payload.new.emoji, payload.new.user_id);
      const bar = document.querySelector(`[data-reaction-bar="${payload.new.message_id}"]`);
      if (bar) { bar.outerHTML = renderReactionBar(payload.new.message_id); wireMessageActions(); }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_reactions' }, (payload) => {
      removeReactionFromState(payload.old.message_id, payload.old.emoji, payload.old.user_id);
      const bar = document.querySelector(`[data-reaction-bar="${payload.old.message_id}"]`);
      if (bar) { bar.outerHTML = renderReactionBar(payload.old.message_id); wireMessageActions(); }
    })
    .subscribe();
}

window.addEventListener('pagehide', () => {
  if (_chatChannel) sb.removeChannel(_chatChannel);
  if (_reactionsChannel) sb.removeChannel(_reactionsChannel);
});

function appendMessage(m) {
  const container = document.getElementById('chat-messages');
  if (container.querySelector('.skeleton')) container.innerHTML = '';
  const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  messagesById.set(m.id, m);
  if (m.profiles?.username && !chatParticipants.some(p => p.username === m.profiles.username)) {
    chatParticipants.unshift(m.profiles);
  }
  container.insertAdjacentHTML('beforeend', renderMessage(m));
  wireMessageActions();
  if (wasNearBottom) scrollToBottom(container);
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

let pendingImageFile = null;
const CHAT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    showToast('Images must be 3MB or smaller.', true);
    e.target.value = '';
    return;
  }
  pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('chat-image-preview-img').src = reader.result;
    document.getElementById('chat-image-preview').style.display = 'block';
    refreshIcons();
  };
  reader.readAsDataURL(file);
}

function clearImageSelection() {
  pendingImageFile = null;
  document.getElementById('chat-image-input').value = '';
  document.getElementById('chat-image-preview').style.display = 'none';
}

async function handleSend(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const text = input.value.trim();
  if (!text && !pendingImageFile) return;
  if (text && text.length < MIN_CHAT_MESSAGE_LENGTH) {
    showToast(`Messages need to be at least ${MIN_CHAT_MESSAGE_LENGTH} characters.`, true);
    return;
  }

  const now = Date.now();
  if (now - lastSendAt < SEND_COOLDOWN_MS) {
    showToast(`Slow down a little — you can send another message every ${SEND_COOLDOWN_MS / 1000} seconds.`, true);
    return;
  }

  sendBtn.disabled = true;

  let image_url = null;
  if (pendingImageFile) {
    const compressed = await compressImage(pendingImageFile, { maxDimension: 1600, quality: 0.82 });
    const ext = compressed.name ? compressed.name.split('.').pop() : pendingImageFile.name.split('.').pop();
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('chat-media').upload(path, compressed);
    if (uploadError) {
      showToast(uploadError.message, true);
      sendBtn.disabled = false;
      return;
    }
    const { data: urlData } = sb.storage.from('chat-media').getPublicUrl(path);
    image_url = urlData.publicUrl;
  }

  const { error } = await sb.from('chat_messages').insert({
    user_id: currentUser.id,
    message: text || null,
    image_url,
    reply_to_id: replyingTo?.id || null,
  });
  sendBtn.disabled = false;

  if (error) {
    showToast(error.message, true);
    return;
  }

  lastSendAt = now;
  input.value = '';
  clearImageSelection();
  cancelReply();
}

// ---- Replies ----

function startReply(messageId) {
  const m = messagesById.get(messageId);
  if (!m) return;
  replyingTo = { id: messageId, name: displayNameFor(m.profiles || {}), message: m.message };
  renderReplyPreview();
  document.getElementById('chat-input').focus();
}

function cancelReply() {
  replyingTo = null;
  renderReplyPreview();
}

function renderReplyPreview() {
  const el = document.getElementById('chat-reply-preview');
  if (!replyingTo) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  el.className = 'chat-reply-preview-bar';
  el.innerHTML = `
    <i data-lucide="corner-up-left" class="icon-sm"></i>
    <span>Replying to <strong>${escapeHtml(replyingTo.name)}</strong>: ${escapeHtml(replyingTo.message.slice(0, 60))}</span>
    <button type="button" id="chat-cancel-reply" aria-label="Cancel reply"><i data-lucide="x" class="icon-sm"></i></button>
  `;
  refreshIcons();
  document.getElementById('chat-cancel-reply').addEventListener('click', cancelReply);
}

// ---- @mention autocomplete ----

function wireMentionAutocomplete() {
  const input = document.getElementById('chat-input');
  const box = document.getElementById('chat-mention-list');

  input.addEventListener('input', () => {
    const caret = input.selectionStart;
    const uptoCaret = input.value.slice(0, caret);
    const match = uptoCaret.match(/@([a-zA-Z0-9_.]{0,32})$/);
    if (!match) { box.classList.remove('open'); return; }

    const query = match[1].toLowerCase();
    const matches = chatParticipants.filter(p => p.username?.toLowerCase().startsWith(query)).slice(0, 6);
    if (!matches.length) { box.classList.remove('open'); return; }

    box.innerHTML = matches.map(p => `<div class="autocomplete-item" data-mention-username="${escapeHtml(p.username)}">${escapeHtml(displayNameFor(p))} <span class="muted">@${escapeHtml(p.username)}</span></div>`).join('');
    box.classList.add('open');

    box.querySelectorAll('[data-mention-username]').forEach(el => {
      el.addEventListener('click', () => {
        const username = el.dataset.mentionUsername;
        input.value = uptoCaret.replace(/@([a-zA-Z0-9_.]{0,32})$/, `@${username} `) + input.value.slice(caret);
        box.classList.remove('open');
        input.focus();
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) box.classList.remove('open');
  });
}
