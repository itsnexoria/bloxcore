// BloxCore — lightweight PWA install prompt banner.
// Chrome/Edge/Android fire `beforeinstallprompt` once the manifest + service-worker
// installability criteria are met. We hold onto that event and show a small dismissible
// banner after a few visits instead of nagging on someone's very first page load. Safari/
// iOS don't fire this event at all (no native install-prompt API there), so this is
// naturally a no-op on those browsers — nothing extra needed to handle them.

let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  maybeShowInstallBanner();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  document.getElementById('install-banner')?.remove();
  try { localStorage.setItem('bc_install_dismissed', '1'); } catch (e) {}
});

function maybeShowInstallBanner() {
  if (!_deferredInstallPrompt) return;
  if (document.getElementById('install-banner')) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  try {
    if (localStorage.getItem('bc_install_dismissed') === '1') return;
    const visits = Number(localStorage.getItem('bc_visit_count') || '0');
    if (visits < 3) return;
  } catch (e) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'install-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <img src="/assets/icon-192.png" alt="" class="install-banner-icon">
    <div class="install-banner-text">
      <p>Install BloxCore</p>
      <p class="muted">Add it to your home screen for quick access.</p>
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="install-banner-install">Install</button>
    <button type="button" class="install-banner-close" aria-label="Dismiss"><i data-lucide="x" class="icon-sm"></i></button>
  `;
  document.body.appendChild(banner);
  if (window.lucide) lucide.createIcons();

  document.getElementById('install-banner-install').addEventListener('click', async () => {
    banner.remove();
    if (!_deferredInstallPrompt) return;
    _deferredInstallPrompt.prompt();
    await _deferredInstallPrompt.userChoice;
    _deferredInstallPrompt = null;
  });
  banner.querySelector('.install-banner-close').addEventListener('click', () => {
    banner.remove();
    try { localStorage.setItem('bc_install_dismissed', '1'); } catch (e) {}
  });
}

// Bump a lightweight visit counter once per page load — used above so the banner
// doesn't show up on someone's very first visit to the site.
try {
  const visits = Number(localStorage.getItem('bc_visit_count') || '0');
  localStorage.setItem('bc_visit_count', String(visits + 1));
} catch (e) {}
