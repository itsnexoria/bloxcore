// BloxCore — shared nav behavior, included on every page after supabase-client.js

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  // Overlay backdrop behind the drawer — created here so no page markup has to carry it.
  const overlay = document.createElement('div');
  overlay.className = 'nav-overlay';
  document.body.appendChild(overlay);

  function openDrawer() {
    links.classList.add('open');
    overlay.classList.add('open');
    toggle.textContent = '✕';
    toggle.setAttribute('aria-label', 'Close menu');
  }
  function closeDrawer() {
    links.classList.remove('open');
    overlay.classList.remove('open');
    toggle.textContent = '☰';
    toggle.setAttribute('aria-label', 'Open menu');
  }

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.contains('open') ? closeDrawer() : openDrawer();
    });
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
    // Delegated so it also covers auth-slot links added later by populateAuthArea()
    links.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeDrawer();
    });
  }

  highlightActiveLink();
  populateAuthArea();
});

function highlightActiveLink() {
  // Normalize both sides to no trailing slash (except root, which stays "/")
  let path = window.location.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '') path = '/';

  document.querySelectorAll('.nav-links a[href]').forEach(a => {
    let href = a.getAttribute('href');
    if (href.length > 1 && href.endsWith('/')) href = href.slice(0, -1);
    if (href === path) a.classList.add('active');
  });
}

async function populateAuthArea() {
  const slot = document.getElementById('nav-auth-slot');
  if (!slot) return;

  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    slot.innerHTML = `<a href="/auth/" class="btn btn-primary btn-sm">Sign In</a>`;
    return;
  }

  const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).single();
  const onAdminPage = window.location.pathname.startsWith('/admin/');
  const adminLink = (profile?.is_admin && !onAdminPage) ? `<a href="/admin/">Admin</a>` : '';

  slot.innerHTML = `
    ${adminLink}
    <a href="/dashboard/">Profile</a>
    <button class="btn btn-ghost btn-sm" id="nav-sign-out">Sign Out</button>
  `;

  document.getElementById('nav-sign-out')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/';
  });
}
