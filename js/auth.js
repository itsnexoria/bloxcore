// BloxCore — auth/index.html logic (Discord-only sign in)

onReady(async () => {
  // Referral capture: a ref code only ever arrives as a query param here, but the
  // Discord OAuth redirect can't carry it through to /dashboard/ — stash it in
  // localStorage now, dashboard.js claims it once the user (and their profile row)
  // actually exists.
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) {
    try { localStorage.setItem('bc_pending_ref', ref); } catch {}
  }

  // If already signed in, skip straight to dashboard
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = '/dashboard/';
    return;
  }

  sb.from('profiles').select('id', { count: 'exact', head: true }).then(({ count }) => {
    if (count) document.getElementById('auth-pirate-count').textContent = `Join ${count.toLocaleString()} pirate${count === 1 ? '' : 's'} already aboard.`;
  });

  document.getElementById('discord-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('signin-error');
    errorEl.style.display = 'none';

    const { error } = await sb.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin + '/dashboard/' }
    });
    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    }
  });
});
