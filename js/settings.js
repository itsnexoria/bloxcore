// BloxCore — settings/index.html logic

document.addEventListener('DOMContentLoaded', async () => {
  const currentTheme = localStorage.getItem('bc_theme') || 'ice';
  highlightSwatch(currentTheme);

  document.querySelectorAll('[data-theme-choice]').forEach(swatch => {
    swatch.addEventListener('click', () => selectTheme(swatch.dataset.themeChoice));
  });

  const motionToggle = document.getElementById('reduce-motion-toggle');
  motionToggle.checked = localStorage.getItem('bc_reduce_motion') === '1';
  motionToggle.addEventListener('change', () => {
    if (motionToggle.checked) {
      localStorage.setItem('bc_reduce_motion', '1');
      document.documentElement.classList.add('reduce-motion');
    } else {
      localStorage.removeItem('bc_reduce_motion');
      document.documentElement.classList.remove('reduce-motion');
    }
  });
});

function highlightSwatch(theme) {
  document.querySelectorAll('[data-theme-choice]').forEach(s => {
    s.classList.toggle('selected', s.dataset.themeChoice === theme);
  });
}

async function selectTheme(theme) {
  applyTheme(theme);
  highlightSwatch(theme);

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await sb.from('profiles').update({ theme }).eq('id', session.user.id);
  }
  showToast('Theme updated.');
}
