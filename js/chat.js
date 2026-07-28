// BloxCore — chat/index.html logic

const CHAT_HISTORY_LIMIT = 50;
let currentUser = null;
let isAdmin = false;
let lastSendAt = 0;
const SEND_COOLDOWN_MS = 2000;

document.addEventListener('DOMContentLoaded', async () => {
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  isAdmin = !!profile?.is_admin;

  document.getElementById('chat-compose').style.display = currentUser ? 'block' : 'none';
  document.getElementById('chat-signed-out').style.display = currentUser ? 'none' : 'block';

  await loadHistory();
  subscribeToChat();

  document.getElementById('chat-form').addEventListener('submit', handleSend);
});

async function loadHistory() {
  const container = document.getElementById('chat-messages');

  const { data, error } = await sb
    .from('chat_messages')
    .select('id, user_id, message, created_at, profiles(username, display_name, avatar_url, is_admin)')
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);

  if (error) {
    container.innerHTML = `<p class="muted">Couldn't load chat right now.</p>`;
    console.error(error);
    return;
  }

  const ordered = [...data].reverse();
  container.innerHTML = ordered.map(renderMessage).join('') || `<p class="muted">No messages yet — say hi!</p>`;
  scrollToBottom(container);

  wireDeleteButtons();
}

function renderMessage(m) {
  const profile = m.profiles || {};
  const name = displayNameFor(profile);
  const isMine = currentUser && m.user_id === currentUser.id;
  const avatar = profile.avatar_url
    ? `<img src="${profile.avatar_url}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
    : `<div style="width:32px; height:32px; border-radius:50%; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0; color:var(--ash);">${escapeHtml((name[0] || '?').toUpperCase())}</div>`;

  return `
    <div class="chat-row" data-message-id="${m.id}" style="display:flex; gap:10px; margin-bottom:14px; ${isMine ? 'flex-direction:row-reverse; text-align:right;' : ''}">
      ${avatar}
      <div style="max-width:75%;">
        <p style="margin:0 0 3px; font-size:0.78rem; color:var(--ash);">
          <a href="/player/?u=${encodeURIComponent(profile.username || '')}" style="color:${profile.is_admin ? 'var(--blood-dim)' : 'var(--ash)'}; text-decoration:none; font-weight:600;">${escapeHtml(name)}</a>
          <span style="font-family:var(--font-mono); margin-left:6px;">${timeAgo(m.created_at)}</span>
          ${isAdmin ? `<button class="chat-delete-btn" data-delete-id="${m.id}" title="Delete message">✕</button>` : ''}
        </p>
        <div class="panel" style="display:inline-block; padding:9px 13px; margin:0; animation:none;">
          <p style="margin:0; font-size:0.92rem; white-space:pre-wrap; word-break:break-word; text-align:left;">${escapeHtml(m.message)}</p>
        </div>
      </div>
    </div>
  `;
}

function wireDeleteButtons() {
  document.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => deleteMessage(btn.dataset.deleteId));
  });
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
        .select('username, display_name, avatar_url, is_admin')
        .eq('id', payload.new.user_id)
        .single();
      appendMessage({ ...payload.new, profiles: profile });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
      document.querySelector(`[data-message-id="${payload.old.id}"]`)?.remove();
    })
    .subscribe();
}

function appendMessage(m) {
  const container = document.getElementById('chat-messages');
  if (container.querySelector('.skeleton')) container.innerHTML = '';
  const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  container.insertAdjacentHTML('beforeend', renderMessage(m));
  wireDeleteButtons();
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
    showToast('Slow down a little — one message every couple seconds.', true);
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
