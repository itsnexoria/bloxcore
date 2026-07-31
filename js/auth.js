// BloxCore — auth/index.html logic (Discord-only sign in)

document.addEventListener('DOMContentLoaded', async () => {
  // If already signed in, skip straight to dashboard
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = '/dashboard/';
    return;
  }

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
