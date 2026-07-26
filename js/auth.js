// BloxCore — auth.html logic

document.addEventListener('DOMContentLoaded', async () => {
  // If already signed in, skip straight to dashboard
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = '/dashboard/';
    return;
  }

  const tabSignIn = document.getElementById('tab-signin');
  const tabSignUp = document.getElementById('tab-signup');
  const signInForm = document.getElementById('signin-form');
  const signUpForm = document.getElementById('signup-form');

  tabSignIn.addEventListener('click', () => setTab(true));
  tabSignUp.addEventListener('click', () => setTab(false));

  function setTab(showSignIn) {
    signInForm.style.display = showSignIn ? 'block' : 'none';
    signUpForm.style.display = showSignIn ? 'none' : 'block';
    tabSignIn.style.borderColor = showSignIn ? 'var(--brass)' : 'var(--navy-light)';
    tabSignIn.style.color = showSignIn ? 'var(--brass-bright)' : 'var(--bone)';
    tabSignUp.style.borderColor = showSignIn ? 'var(--navy-light)' : 'var(--brass)';
    tabSignUp.style.color = showSignIn ? 'var(--bone)' : 'var(--brass-bright)';
  }

  document.getElementById('discord-btn').addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin + '/dashboard/' }
    });
    if (error) showToast(error.message, true);
  });

  signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    const errorEl = document.getElementById('signin-error');
    errorEl.style.display = 'none';

    const submitBtn = signInForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    const { error } = await sb.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }
    window.location.href = '/dashboard/';
  });

  signUpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('signup-error');
    errorEl.style.display = 'none';

    const submitBtn = signUpForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { user_name: username } }
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }

    // If the profile row was created with a fallback username (race with the trigger),
    // patch it once the session exists.
    if (data.session) {
      await sb.from('profiles').update({ username }).eq('id', data.user.id);
      window.location.href = '/dashboard/';
    } else {
      showToast('Check your email to confirm your account, then sign in.');
      document.getElementById('tab-signin').click();
    }
  });
});
