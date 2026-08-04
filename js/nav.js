// BloxCore — shared nav behavior, included on every page after supabase-client.js

document.addEventListener('DOMContentLoaded', () => {
  renderSiteBanners();

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
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    toggle.classList.add('is-open');
    refreshIcons();
  }
  function closeDrawer() {
    links.classList.remove('open');
    overlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.classList.remove('is-open');
    refreshIcons();
  }

  // Wired up first, before anything that touches icons — a menu that opens/closes is more
  // important than the icon inside it, and must not be skipped if icon rendering ever throws.
  // toggle.dataset.wired guards against this handler ever being attached twice (e.g. if a
  // page happens to include this script more than once) — a double-bound listener is exactly
  // what makes a toggle "sometimes" appear to do nothing, since the second firing immediately
  // undoes the first within the same click.
  if (toggle && links && !toggle.dataset.wired) {
    toggle.dataset.wired = '1';
    // The icon inside the button used to be replaced with a fresh <i>/<svg> on every open and
    // close (via innerHTML), which meant every single toggle depended on lucide having already
    // loaded and re-rendering in time. Swapping the icon via a CSS class instead (see the
    // .nav-toggle.is-open rule) means the click always works even if icon rendering lags.
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
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
    // Desktop shows nav-links inline (see CSS) — if the viewport crosses into that range while
    // the mobile drawer happens to be open, drop the drawer-only state so it doesn't get stuck.
    const desktopQuery = window.matchMedia('(min-width: 880px)');
    const syncForViewport = (e) => { if (e.matches) closeDrawer(); };
    desktopQuery.addEventListener ? desktopQuery.addEventListener('change', syncForViewport) : desktopQuery.addListener(syncForViewport);
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

// Sitewide broadcast + active XP-event banner — fetched fresh on every page load.
const BANNER_COLORS = {
  info: 'var(--blue)', success: 'var(--sea)', warning: 'var(--gold)', danger: 'var(--blood)',
};

async function renderSiteBanners() {
  const nav = document.querySelector('.nav');
  if (!nav || typeof sb === 'undefined') return;

  const [{ data: broadcasts }, { data: events }] = await Promise.all([
    sb.from('broadcasts').select('id, message, severity').eq('active', true).order('created_at', { ascending: false }).limit(1),
    sb.from('events').select('id, name, xp_multiplier').eq('active', true).limit(1),
  ]);

  const banners = [];
  if (events && events[0]) {
    banners.push({ severity: 'warning', message: `<i data-lucide="zap" class="icon-sm icon-inline"></i><strong>${escapeHtml(events[0].name)}</strong> is live — earning ${events[0].xp_multiplier}x XP on approved bounties.` });
  }
  if (broadcasts && broadcasts[0]) {
    banners.push({ severity: broadcasts[0].severity, message: escapeHtml(broadcasts[0].message) });
  }
  if (!banners.length) return;

  const wrap = document.createElement('div');
  wrap.id = 'site-banners';
  wrap.innerHTML = banners.map(b => `
    <div class="site-banner" style="border-left-color:${BANNER_COLORS[b.severity] || BANNER_COLORS.info};">${b.message}</div>
  `).join('');
  nav.insertAdjacentElement('afterend', wrap);
  refreshIcons();
}
