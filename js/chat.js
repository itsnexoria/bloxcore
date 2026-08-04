// BloxCore — chat/index.html logic

const CHAT_HISTORY_LIMIT = 50;
let currentUser = null;
let isStaff = false;
let lastSendAt = 0;
const SEND_COOLDOWN_MS = 10000;
const REACTION_PRESET = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

// message_id -> Map(emoji -> Set(user_id))
const reactionsByMessage = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  isStaff = profile?.role === 'mod' || profile?.role === 'admin';

  document.getElementById('chat-compose').style.display = currentUser ? 'block' : 'none';
  document.getElementById('chat-signed-out').style.display = currentUser ? 'none' : 'block';

  await loadHistory();
  subscribeToChat();

  document.getElementById('chat-form').addEventListener('submit', handleSend);
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
    .select('id, user_id, message, created_at, profiles(username, display_name, avatar_url, role, title_color_override, titles(name, color))')
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);

  if (error) {
    container.innerHTML = `<p class="muted">Couldn't load chat right now.</p>`;
    console.error(error);
    return;
  }

  const ordered = [...data].reverse();

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

function renderMessage(m) {
  const profile = m.profiles || {};
  const name = displayNameFor(profile);
  const avatar = avatarHtml(profile, 32);
  const canDelete = isStaff || m.user_id === currentUser?.id;
  const mine = m.user_id === currentUser?.id;

  return `
    <div class="chat-row ${mine ? 'mine' : ''}" data-message-id="${m.id}">
      ${avatar}
      <div class="chat-row-body">
        <p class="chat-row-meta">
          ${titleBadge(profile)} <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:${(profile.role === 'mod' || profile.role === 'admin') ? 'var(--blood-dim)' : 'var(--ash)'}; text-decoration:none; font-weight:600;">${escapeHtml(name)}</a>
          <span style="font-family:var(--font-mono); margin-left:6px;">${timeAgo(m.created_at)}</span>
          ${canDelete ? `<button class="chat-delete-btn" data-delete-id="${m.id}" title="Delete message"><i data-lucide="x" class="icon-sm"></i></button>` : ''}
        </p>
        <div class="chat-bubble">
          <p style="margin:0; font-size:0.92rem; white-space:pre-wrap; word-break:break-word; text-align:left;">${escapeHtml(m.message)}</p>
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
  const { error } = await sb.from('chat_messages').delete().eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  document.querySelector(`[data-message-id="${id}"]`)?.remove();
}

function subscribeToChat() {
  sb.channel('public:chat_messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
      const { data: profile } = await sb
        .from('profiles')
        .select('username, display_name, avatar_url, role, title_color_override, titles(name, color)')
        .eq('id', payload.new.user_id)
        .single();
      appendMessage({ ...payload.new, profiles: profile });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
      document.querySelector(`[data-message-id="${payload.old.id}"]`)?.remove();
    })
    .subscribe();

  sb.channel('public:chat_reactions')
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

function appendMessage(m) {
  const container = document.getElementById('chat-messages');
  if (container.querySelector('.skeleton')) container.innerHTML = '';
  const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  container.insertAdjacentHTML('beforeend', renderMessage(m));
  wireMessageActions();
  if (wasNearBottom) scrollToBottom(container);
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

async function handleSend(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const text = input.value.trim();
  if (!text) return;

  const now = Date.now();
  if (now - lastSendAt < SEND_COOLDOWN_MS) {
    showToast('Slow down a little — you can send another message every 10 seconds.', true);
    return;
  }

  sendBtn.disabled = true;
  const { error } = await sb.from('chat_messages').insert({ user_id: currentUser.id, message: text });
  sendBtn.disabled = false;

  if (error) {
    showToast(error.message, true);
    return;
  }

  lastSendAt = now;
  input.value = '';
}
