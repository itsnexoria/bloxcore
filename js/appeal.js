// BloxCore — appeal/index.html logic

onReady(async () => {
  const { user, profile } = await getCurrentProfile();
  if (!user) {
    window.location.href = '/auth/';
    return;
  }
  if (!profile?.banned) {
    window.location.href = '/dashboard/';
    return;
  }

  document.getElementById('appeal-signout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/';
  });

  const { data: appeals } = await sb.from('ban_appeals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
  const latest = appeals?.[0];

  render(profile, latest);
});

function render(profile, latest) {
  const container = document.getElementById('appeal-content');

  const reasonBlock = `
    <div class="panel" style="border-color:rgba(255,77,109,0.35); margin-bottom:20px;">
      <h1 style="font-size:1.4rem; margin-bottom:8px; color:var(--blood-dim);"><i data-lucide="shield-off" class="icon-md icon-inline"></i>Your account is banned</h1>
      ${profile.banned_reason ? `<p class="muted" style="margin:0;">Reason given: "${escapeHtml(profile.banned_reason)}"</p>` : `<p class="muted" style="margin:0;">No reason was given.</p>`}
    </div>
  `;

  if (latest?.status === 'pending') {
    container.innerHTML = reasonBlock + `
      <div class="panel">
        <p style="margin:0 0 6px; font-weight:700;"><i data-lucide="clock" class="icon-sm icon-inline"></i>Appeal submitted</p>
        <p class="muted" style="margin:0 0 12px; font-size:0.85rem;">Submitted ${timeAgo(latest.created_at)}. A staff member will review it — you'll get a notification either way.</p>
        <p style="margin:0; padding:12px; background:rgba(255,255,255,0.03); border-radius:var(--radius-sm); font-size:0.9rem;">${escapeHtml(latest.message)}</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  if (latest?.status === 'denied') {
    container.innerHTML = reasonBlock + `
      <div class="panel">
        <p style="margin:0 0 6px; font-weight:700; color:var(--blood-dim);"><i data-lucide="x-circle" class="icon-sm icon-inline"></i>Your last appeal was denied</p>
        ${latest.admin_response ? `<p class="muted" style="margin:0 0 12px; font-size:0.85rem;">Staff response: "${escapeHtml(latest.admin_response)}"</p>` : ''}
      </div>
      <h2 style="font-size:1rem; margin:24px 0 10px;">Submit another appeal</h2>
      ${appealFormHtml()}
    `;
    refreshIcons();
    wireForm();
    return;
  }

  container.innerHTML = reasonBlock + `
    <h2 style="font-size:1rem; margin:0 0 10px;">Appeal this ban</h2>
    <p class="muted" style="margin:0 0 14px; font-size:0.85rem;">Explain why you think this was a mistake, or what's changed. Staff will read it and get back to you.</p>
    ${appealFormHtml()}
  `;
  refreshIcons();
  wireForm();
}

function appealFormHtml() {
  return `
    <form id="appeal-form" class="panel">
      <textarea id="appeal-message" rows="5" maxlength="1000" placeholder="Your appeal…" required></textarea>
      <p class="field-error" id="appeal-error" style="display:none;"></p>
      <button type="submit" class="btn btn-primary btn-block">Submit Appeal</button>
    </form>
  `;
}

function wireForm() {
  document.getElementById('appeal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('appeal-error');
    errorEl.style.display = 'none';

    const { data: { session } } = await sb.auth.getSession();
    const { error } = await sb.from('ban_appeals').insert({
      user_id: session.user.id,
      message: document.getElementById('appeal-message').value.trim(),
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }
    showToast('Appeal submitted.');
    const { data: appeals } = await sb.from('ban_appeals').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1);
    render((await getCurrentProfile()).profile, appeals?.[0]);
  });
}
