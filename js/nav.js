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
    toggle.innerHTML = '<i data-lucide="x" class="icon-md"></i>';
    toggle.setAttribute('aria-label', 'Close menu');
    refreshIcons();
  }
  function closeDrawer() {
    links.classList.remove('open');
    overlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
    toggle.innerHTML = '<i data-lucide="menu" class="icon-md"></i>';
    toggle.setAttribute('aria-label', 'Open menu');
    refreshIcons();
  }

  // Wired up first, before anything that touches icons — a menu that opens/closes is more
  // important than the icon inside it, and must not be skipped if icon rendering ever throws.
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

  refreshIcons();
  highlightActiveLink();
  populateAuthArea();
  initScrollFx();
});

// Nav gains a shadow once the page scrolls, and cards/posters gently rise into view —
// gated behind a JS-only class so nothing is ever invisible if this script fails to run.
function initScrollFx() {
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js-reveal');

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  const revealSelector = 'section.section .panel:not(.panel-plain), section.section .poster:not(#hero-poster)';
  document.querySelectorAll(revealSelector).forEach(el => io.observe(el));

  // Most of these cards are rendered async after a Supabase fetch, well after this script's
  // initial querySelectorAll runs — without this, anything added later would inherit the CSS's
  // opacity:0 starting state but never get observed, and stay invisible forever.
  if ('MutationObserver' in window) {
    let iconTimer;
    const mo = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.(revealSelector)) io.observe(node);
          node.querySelectorAll?.(revealSelector).forEach(el => io.observe(el));
        });
      });
      if (window.lucide) {
        clearTimeout(iconTimer);
        iconTimer = setTimeout(refreshIcons, 60);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}

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
    slot.innerHTML = `<a href="/auth/" class="btn btn-primary btn-sm"><i data-lucide="log-in" class="icon-sm icon-inline"></i>Sign In</a>`;
    refreshIcons();
    return;
  }

  const { data: profile } = await sb.from('profiles').select('theme').eq('id', session.user.id).single();
  if (profile) syncThemeFromProfile(profile);
  touchLastActive(session.user.id);

  const onAdminPage = window.location.pathname.startsWith('/admin/');
  const adminLink = (role !== 'user' && !onAdminPage) ? `<a href="/admin/"><i data-lucide="shield" class="icon-sm icon-inline"></i>Admin</a>` : '';

  slot.innerHTML = `
    ${adminLink}
    <a href="/dashboard/"><i data-lucide="user" class="icon-sm icon-inline"></i>Profile</a>
    <a href="/settings/"><i data-lucide="settings" class="icon-sm icon-inline"></i>Settings</a>
    <button class="btn btn-ghost btn-sm" id="nav-sign-out"><i data-lucide="log-out" class="icon-sm icon-inline"></i>Sign Out</button>
  `;
  refreshIcons();

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
