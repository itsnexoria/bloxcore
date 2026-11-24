// BloxCore — feed inline comments panel
// Lazy-loaded by js/feed.js (loadFeedModule); runs in the same global scope as feed.js.

async function toggleCommentsPanel(postId) {
  const panel = document.querySelector(`[data-comments-panel="${postId}"]`);
  if (!panel) return;

  const isOpen = panel.style.display !== 'none';
  if (isOpen) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  await renderCommentsPanel(postId, panel);
}

function commentHtml(c, { isReply = false, parentId = null } = {}) {
  const canReply = !!currentUser;
  return `
    <div class="feed-comment-row${isReply ? ' is-reply' : ''}" data-comment-id="${c.id}">
      ${avatarHtml({ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url, avatar_frame: c.avatar_frame }, isReply ? 26 : 30)}
      <div class="fc-main">
        <div class="fc-bubble">
          <div class="fc-top"><a href="/player/?u=${encodeURIComponent(c.username || '')}" class="fc-name">${escapeHtml(displayNameFor(c))}</a><span class="fc-time">${timeAgo(c.created_at)}</span></div>
          <p class="fc-text">${linkifyHashtags(c.content)}</p>
        </div>
        ${canReply ? `<button type="button" class="fc-reply-btn" data-reply-parent="${parentId || c.id}" data-reply-name="${escapeHtml(c.username || '')}">Reply</button>` : ''}
      </div>
    </div>`;
}

async function renderCommentsPanel(postId, panel) {
  panel.innerHTML = `<div class="skeleton" style="height:40px;"></div>`;

  const { data, error } = await sb.rpc('get_feed_post_comments', { p_post_id: postId });
  const all = (error || !data ? [] : data).filter(c => !blockedMap.has(c.user_id));
  const top = all.filter(c => !c.parent_id);
  const repliesByParent = new Map();
  all.filter(c => c.parent_id).forEach(c => {
    if (!repliesByParent.has(c.parent_id)) repliesByParent.set(c.parent_id, []);
    repliesByParent.get(c.parent_id).push(c);
  });
  // Replies whose parent got filtered out (muted/blocked author) are hidden with it.

  panel.innerHTML = `
    <div data-comments-list>
      ${top.length
        ? top.map(c => `
          <div class="fc-thread">
            ${commentHtml(c)}
            ${(repliesByParent.get(c.id) || []).length ? `<div class="fc-replies">${repliesByParent.get(c.id).map(r => commentHtml(r, { isReply: true, parentId: c.id })).join('')}</div>` : ''}
          </div>`).join('')
        : `<p class="muted" style="margin:0 0 10px; font-size:0.8rem;">No comments yet — say something first.</p>`}
    </div>
    ${currentUser ? `
      <div class="fc-replying" data-replying hidden><span data-replying-label></span><button type="button" class="fc-replying-x" data-replying-cancel aria-label="Cancel reply">✕</button></div>
      <form data-comment-form="${postId}" class="fc-form">
        <input type="text" maxlength="280" placeholder="Write a comment…" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">Send</button>
      </form>
    ` : `<p class="muted" style="margin:8px 0 0; font-size:0.78rem;"><a href="/auth/">Sign in</a> to comment.</p>`}
  `;

  const form = panel.querySelector(`[data-comment-form="${postId}"]`);
  form?.addEventListener('submit', (e) => handleAddComment(e, postId, panel));
  attachMentionAutocomplete(form?.querySelector('input'));
  const replyBar = panel.querySelector('[data-replying]');
  const clearReply = () => { panel._replyTo = null; if (replyBar) replyBar.hidden = true; };
  panel.querySelector('[data-replying-cancel]')?.addEventListener('click', clearReply);
  panel.querySelectorAll('[data-reply-parent]').forEach(btn => btn.addEventListener('click', () => {
    panel._replyTo = { parentId: btn.dataset.replyParent, name: btn.dataset.replyName };
    replyBar.querySelector('[data-replying-label]').textContent = `Replying to @${btn.dataset.replyName}`;
    replyBar.hidden = false;
    const input = form.querySelector('input');
    input.value = `@${btn.dataset.replyName} `;
    input.focus();
  }));
  refreshIcons();
}

async function handleAddComment(e, postId, panel) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const content = input.value.trim();
  if (!content) return;

  const reply = panel._replyTo;
  const { error } = await sb.from('feed_comments').insert({ post_id: postId, user_id: currentUser.id, content, parent_id: reply ? reply.parentId : null });
  if (error) { showToast(error.message, true); return; }

  panel._replyTo = null;
  await renderCommentsPanel(postId, panel);

  const countEl = document.querySelector(`[data-post-id="${postId}"] [data-comment-count]`);
  if (countEl) countEl.textContent = Number(countEl.textContent) + 1;
}
