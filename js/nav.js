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
    document.body.classList.add('drawer-open');
    toggle.textContent = '✕';
    toggle.setAttribute('aria-label', 'Close menu');
  }
  function closeDrawer() {
    links.classList.remove('open');
    overlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
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

  // Admin-section pages list every staff sub-page in their static markup; hide the ones
  // the current viewer's role doesn't cover (e.g. a mod shouldn't see Manage Challenges).
  const role = session ? await currentUserRole(session.user.id) : 'user';
  applyRoleGatedNavItems(role);
  const badge = document.getElementById('role-badge');
  if (badge) badge.textContent = role === 'admin' ? 'Admin' : role === 'mod' ? 'Mod' : 'Staff';

  if (!session) {
    slot.innerHTML = `<a href="/auth/" class="btn btn-primary btn-sm">Sign In</a>`;
    return;
  }

  const onAdminPage = window.location.pathname.startsWith('/admin/');
  const adminLink = (role !== 'user' && !onAdminPage) ? `<a href="/admin/">Admin</a>` : '';

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

let _cachedRole = null;
async function currentUserRole(userId) {
  if (_cachedRole) return _cachedRole;
  const { data } = await sb.from('profiles').select('role').eq('id', userId).single();
  _cachedRole = data?.role || 'user';
  return _cachedRole;
}

// Admin nav items can carry data-requires-role="mod" (visible to mod+admin) or "admin"
// (admin only). Anything without the attribute is always shown.
function applyRoleGatedNavItems(role) {
  document.querySelectorAll('.nav-links li[data-requires-role]').forEach(li => {
    const required = li.dataset.requiresRole;
    const allowed = required === 'admin' ? role === 'admin' : (role === 'mod' || role === 'admin');
    li.style.display = allowed ? '' : 'none';
  });
}
