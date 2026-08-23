// BloxCore — roblox-callback/index.html logic
// Roblox redirects here with ?code=...&state=... after the user approves the connection.

onReady(async () => {
  const statusEl = document.getElementById('roblox-callback-status');
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const oauthError = params.get('error');

  const returnTo = sessionStorage.getItem('bc_roblox_oauth_return') || '/profile/';
  const expectedState = sessionStorage.getItem('bc_roblox_oauth_state');
  sessionStorage.removeItem('bc_roblox_oauth_state');
  sessionStorage.removeItem('bc_roblox_oauth_return');

  const bounce = (delay = 1800) => setTimeout(() => { location.href = returnTo; }, delay);

  if (oauthError) {
    statusEl.textContent = 'Roblox login was cancelled — heading back.';
    bounce();
    return;
  }
  if (!code || !state || state !== expectedState) {
    statusEl.textContent = "That link looks invalid or expired — try connecting again.";
    bounce();
    return;
  }

  const auth = await requireAuth();
  if (!auth) {
    statusEl.textContent = 'Sign in to BloxCore first, then connect Roblox.';
    setTimeout(() => { location.href = '/auth/'; }, 1500);
    return;
  }

  const redirectUri = `${location.origin}/roblox-callback/`;
  const { data, error } = await sb.functions.invoke('roblox-oauth-callback', { body: { code, redirect_uri: redirectUri } });

  if (error || data?.error) {
    statusEl.textContent = data?.error || "Something went wrong connecting your Roblox account.";
    bounce(2200);
    return;
  }

  statusEl.textContent = `Connected as ${data.roblox_username}!`;
  invalidateProfileCache();
  bounce(1000);
});
