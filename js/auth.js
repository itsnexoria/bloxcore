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

  sb.from('profiles').select('id', { count: 'exact', head: true })
    .gt('last_active_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .then(({ count }) => {
      const el = document.getElementById('auth-online-count');
      if (el && count) el.textContent = `${count.toLocaleString()} online now`;
      else if (el) el.parentElement.style.display = 'none';
    });

  sb.from('profiles').select('username, display_name, avatar_url, avatar_frame')
    .order('created_at', { ascending: false }).limit(6)
    .then(({ data }) => {
      const el = document.getElementById('auth-recent-avatars');
      if (el && data?.length) el.innerHTML = data.map((p, i) => avatarHtml(p, 30, `border:2px solid var(--ink); margin-left:${i ? '-10px' : '0'};`)).join('');
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

  // ---- Email sign in / sign up tabs ----
  const signinForm = document.getElementById('email-signin-form');
  const signupForm = document.getElementById('email-signup-form');
  document.querySelectorAll('#email-auth-tabs [data-email-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.emailTab;
      document.querySelectorAll('#email-auth-tabs [data-email-tab]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.emailTab === tab ? 'btn-primary' : 'btn-ghost'}`;
      });
      signinForm.style.display = tab === 'signin' ? 'flex' : 'none';
      signupForm.style.display = tab === 'signup' ? 'flex' : 'none';
    });
  });

  // ---- Sign in with email ----
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('email-signin-error');
    errorEl.style.display = 'none';
    const btn = document.getElementById('email-signin-btn');
    btn.disabled = true;
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;

    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) {
      errorEl.textContent = error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message;
      errorEl.style.display = 'block';
      return;
    }
    window.location.href = '/dashboard/';
  });

  document.getElementById('forgot-password-btn').addEventListener('click', async () => {
    const email = document.getElementById('signin-email').value.trim();
    const errorEl = document.getElementById('email-signin-error');
    errorEl.style.display = 'none';
    if (!email) {
      errorEl.textContent = 'Enter your email above first, then click "Forgot password?" again.';
      errorEl.style.display = 'block';
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/settings/' });
    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    } else {
      showToast('Password reset link sent — check your email.');
    }
  });

  // ---- Discord Username availability check (debounced) ----
  // Reused as the profiles.discord_username value regardless of whether someone connects
  // Discord for real later — this is a client-side check only; nothing here stops two
  // signups racing in the same instant from both passing it (that needs a DB constraint).
  let discordUsernameOk = false;
  let discordCheckTimer = null;
  const discordInput = document.getElementById('signup-discord-username');
  const discordStatus = document.getElementById('discord-username-status');
  discordInput.addEventListener('input', () => {
    discordUsernameOk = false;
    const value = discordInput.value.trim();
    clearTimeout(discordCheckTimer);
    if (!value) { discordStatus.textContent = ''; return; }
    discordStatus.textContent = 'Checking availability…';
    discordStatus.style.color = '';
    discordCheckTimer = setTimeout(async () => {
      const { data } = await sb.from('profiles').select('id').ilike('discord_username', value).maybeSingle();
      if (discordInput.value.trim() !== value) return; // value changed while we were checking
      if (data) {
        discordStatus.textContent = 'That Discord username is already registered on BloxCore.';
        discordStatus.style.color = '#f87171';
      } else {
        discordUsernameOk = true;
        discordStatus.textContent = 'Available.';
        discordStatus.style.color = '#34d399';
      }
    }, 450);
  });

  // ---- Password strength meter ----
  function passwordStrength(pw) {
    if (!pw) return { score: 0, label: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return { score: 1, label: 'Weak' };
    if (score <= 3) return { score: 2, label: 'Medium' };
    return { score: 3, label: 'Strong' };
  }
  const signupPassword = document.getElementById('signup-password');
  const strengthMeter = document.getElementById('password-strength-meter');
  const strengthLabel = document.getElementById('password-strength-label');
  signupPassword.addEventListener('input', () => {
    const { score, label } = passwordStrength(signupPassword.value);
    strengthMeter.className = score === 1 ? 'password-strength-weak' : score === 2 ? 'password-strength-medium' : score === 3 ? 'password-strength-strong' : '';
    strengthLabel.textContent = label;
    strengthLabel.style.color = score === 1 ? '#f87171' : score === 2 ? '#fbbf24' : score === 3 ? '#34d399' : '';
  });

  // ---- Sign up with email ----
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('email-signup-error');
    errorEl.style.display = 'none';

    const email = document.getElementById('signup-email').value.trim();
    const discordUsername = discordInput.value.trim();
    const password = signupPassword.value;
    const confirm = document.getElementById('signup-password-confirm').value;

    if (!discordUsername) {
      errorEl.textContent = 'Enter your Discord username.';
      errorEl.style.display = 'block';
      return;
    }
    if (password !== confirm) {
      errorEl.textContent = "Passwords don't match.";
      errorEl.style.display = 'block';
      return;
    }
    if (passwordStrength(password).score < 1) {
      errorEl.textContent = 'Password is too weak — use at least 8 characters.';
      errorEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('email-signup-btn');
    btn.disabled = true;

    // Re-check right before signup to shrink (not eliminate) the race window.
    const { data: existing } = await sb.from('profiles').select('id').ilike('discord_username', discordUsername).maybeSingle();
    if (existing) {
      btn.disabled = false;
      errorEl.textContent = 'That Discord username is already registered on BloxCore.';
      errorEl.style.display = 'block';
      discordStatus.textContent = 'That Discord username is already registered on BloxCore.';
      discordStatus.style.color = '#f87171';
      return;
    }

    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { user_name: discordUsername } }
    });
    btn.disabled = false;
    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }
    if (data.session) {
      window.location.href = '/dashboard/';
    } else {
      signupForm.style.display = 'none';
      errorEl.style.display = 'none';
      discordStatus.textContent = '';
      showToast("Almost there — check your email to confirm your account.");
    }
  });
});
