// BloxCore — shared nav behavior, included on every page after supabase-client.js

// Drawer open/close + the elements that can trigger it live at module scope (not inside
// DOMContentLoaded) so that renderNavProfileAvatar() — called later from populateAuthArea(),
// once we know whether the viewer is signed in — can wire the profile-pic button into the
// exact same drawer as the hamburger, instead of duplicating the open/close logic.
let _drawerLinks = null;
let _drawerOverlay = null;
const _drawerTriggers = [];

function openDrawer() {
  if (!_drawerLinks) return;
  _drawerLinks.classList.add('open');
  _drawerOverlay?.classList.add('open');
  document.body.classList.add('drawer-open');
  document.documentElement.classList.add('drawer-open');
  _drawerTriggers.forEach(t => {
    t.setAttribute('aria-expanded', 'true');
    t.setAttribute('aria-label', 'Close menu');
    t.classList.add('is-open');
  });
  refreshIcons();
}
function closeDrawer() {
  if (!_drawerLinks) return;
  _drawerLinks.classList.remove('open');
  _drawerOverlay?.classList.remove('open');
  document.body.classList.remove('drawer-open');
  document.documentElement.classList.remove('drawer-open');
  _drawerTriggers.forEach(t => {
    t.setAttribute('aria-expanded', 'false');
    t.setAttribute('aria-label', 'Open menu');
    t.classList.remove('is-open');
  });
  refreshIcons();
}
function toggleDrawer() {
  _drawerLinks?.classList.contains('open') ? closeDrawer() : openDrawer();
}

// Registers an element (the hamburger button, or the profile-pic once it renders) as a
// drawer trigger. Safe to call more than once per element.
function bindDrawerTrigger(el) {
  if (!el || el.dataset.drawerWired) return;
  el.dataset.drawerWired = '1';
  _drawerTriggers.push(el);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDrawer();
  });
}

// ---- Site-wide page maintenance / per-user page block check ----
// Runs first thing on every page. Doesn't stop the page's own script from firing (that would
// mean touching every single page file), but the full-screen overlay makes the page unusable,
// which covers the real goal: visitors can't see or interact with a blocked/maintenance page.

async function checkPageAccess() {
  const path = window.location.pathname;

  const { data: maint } = await sb.from('page_maintenance').select('enabled, message').eq('page_path', path).maybeSingle();
  const { data: { session } } = await sb.auth.getSession();
  const userId = session?.user?.id || null;

  let isAdmin = false;
  if (userId) {
    const { data: prof } = await sb.from('profiles').select('role').eq('id', userId).maybeSingle();
    isAdmin = prof?.role === 'admin';
  }

  if (maint?.enabled && !isAdmin) {
    showPageBlockOverlay('🛠️ Under Maintenance', maint.message || 'This page is temporarily unavailable. Check back soon.');
    return;
  }

  if (userId) {
    const { data: block } = await sb.from('user_page_blocks').select('reason').eq('user_id', userId).eq('page_path', path).maybeSingle();
    if (block) {
      showPageBlockOverlay('🚫 Access Restricted', block.reason || "You've been blocked from this page.");
    }
  }
}

function showPageBlockOverlay(title, message) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:#0a0e17; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px;';
  const heading = document.createElement('h1');
  heading.style.cssText = 'font-size:1.6rem; margin-bottom:10px; color:#f5f5f5;';
  heading.textContent = title;
  const body = document.createElement('p');
  body.style.cssText = 'color:#9ca3af; max-width:420px; line-height:1.6;';
  body.textContent = message;
  const home = document.createElement('a');
  home.href = '/';
  home.textContent = 'Return home';
  home.style.cssText = 'margin-top:20px; color:#fbbf24; text-decoration:none; font-weight:600;';
  overlay.append(heading, body, home);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

document.addEventListener('DOMContentLoaded', () => {
  checkPageAccess();
  renderSiteBanners();

  const toggle = document.querySelector('.nav-toggle');
  _drawerLinks = document.querySelector('.nav-links');

  // Overlay backdrop behind the drawer — created here so no page markup has to carry it.
  _drawerOverlay = document.createElement('div');
  _drawerOverlay.className = 'nav-overlay';
  document.body.appendChild(_drawerOverlay);

  if (toggle && _drawerLinks) {
    // The icon inside the button used to be replaced with a fresh <i>/<svg> on every open and
    // close (via innerHTML), which meant every single toggle depended on lucide having already
    // loaded and re-rendering in time. Swapping the icon via a CSS class instead (see the
    // .nav-toggle.is-open rule) means the click always works even if icon rendering lags.
    bindDrawerTrigger(toggle);
    _drawerOverlay.addEventListener('click', closeDrawer);
    document.querySelector('.nav-drawer-close')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
    // Delegated so it also covers auth-slot links added later by populateAuthArea()
    _drawerLinks.addEventListener('click', (e) => {
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
  const tagStagger = (el) => {
    const siblings = Array.from(el.parentElement?.children || []).filter(c => c.matches?.(revealSelector));
    const i = siblings.indexOf(el);
    if (i > -1) el.style.setProperty('--reveal-i', Math.min(i, 8));
  };
  document.querySelectorAll(revealSelector).forEach(el => { tagStagger(el); io.observe(el); });

  // Show already-on-screen elements instantly instead of animating them — used for content
  // that's being reinserted into a spot the user is already looking at (a periodic data
  // refresh, a filter click), not real "just scrolled into view" content. Without this, every
  // refresh on pages like Quests/Sea Events/PvP (which re-render their card grid every
  // 15-30s) replays the full 0.6s fade+slide on cards the user was already reading,
  // which reads as the whole grid randomly flickering rather than a smooth update.
  const showInstantly = (el) => {
    el.style.transition = 'none';
    el.classList.add('in-view');
    io.unobserve(el);
    // Re-enable the transition on the next frame so any later legitimate state change
    // (e.g. a hover) still animates normally — only this initial pop-in is skipped.
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; }));
  };
  const scrollFxStartedAt = Date.now();
  const observeOrShow = (el) => {
    // Give the page's first data fetch a few seconds to land — most cards on the site
    // (chat, quests, giveaways, sea events, pvp) render async after a Supabase call, and
    // that first appearance should still get the normal entrance fade. Only a *later*
    // re-render (a 15-30s polling refresh) skips the animation for anything already on
    // screen, since that's the "user just sitting there and it re-fades" case.
    if (Date.now() - scrollFxStartedAt < 4000) { io.observe(el); return; }
    const r = el.getBoundingClientRect();
    const alreadyVisible = r.top < (window.innerHeight + 40) && r.bottom > -40;
    if (alreadyVisible) showInstantly(el);
    else io.observe(el);
  };

  // Most of these cards are rendered async after a Supabase fetch, well after this script's
  // initial querySelectorAll runs — without this, anything added later would inherit the CSS's
  // opacity:0 starting state but never get observed, and stay invisible forever.
  if ('MutationObserver' in window) {
    let iconTimer;
    const mo = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.(revealSelector)) { tagStagger(node); observeOrShow(node); }
          node.querySelectorAll?.(revealSelector).forEach(el => { tagStagger(el); observeOrShow(el); });
        });
      });
      if (window.lucide) {
        clearTimeout(iconTimer);
        iconTimer = setTimeout(refreshIcons, 60);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  initCursorSpotlight();
  initHeroTilt();
}

// Cursor-tracked spotlight glow — sets --mx/--my (in px, relative to the element) on
// whichever .panel/.poster the pointer is currently over, which the CSS radial-gradient
// in .panel::after / .poster::after reads. Uses event delegation on the whole document
// instead of one listener per card, since cards are added/removed constantly across pages.
function initCursorSpotlight() {
  if (window.matchMedia('(hover: none)').matches) return; // touch devices: no hover, skip
  if (document.documentElement.classList.contains('reduce-motion')) return;

  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.panel:not(.panel-plain), .poster');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    card.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, { passive: true });
}

// Subtle 3D parallax tilt on the homepage's hero "wanted poster" — reads mouse position
// relative to the poster's own bounds and maps it to a small rotation, so it feels pinned
// to a board rather than flat on the screen. No-op on any page without #hero-poster.
function initHeroTilt() {
  const poster = document.getElementById('hero-poster');
  if (!poster) return;
  if (window.matchMedia('(hover: none)').matches) return;
  if (document.documentElement.classList.contains('reduce-motion')) return;

  const wrapper = poster.parentElement;
  wrapper.addEventListener('pointermove', (e) => {
    const rect = poster.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    poster.style.setProperty('--tilt-x', `${px * 10}deg`);
    poster.style.setProperty('--tilt-y', `${-py * 10}deg`);
  });
  wrapper.addEventListener('pointerleave', () => {
    poster.style.setProperty('--tilt-x', '0deg');
    poster.style.setProperty('--tilt-y', '0deg');
  });
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

  // getCurrentProfile() is memoized per page load — on any protected page this reuses
  // the exact same fetch requireAuth() already triggers, instead of firing a second,
  // separate profiles query just for the nav bar.
  const { user, profile } = await getCurrentProfile();

  if (!user) {
    applyRoleGatedNavItems('user');
    slot.innerHTML = `<a href="/auth/" class="btn btn-primary btn-sm"><i data-lucide="log-in" class="icon-sm icon-inline"></i>Sign In</a>`;
    const notifSlot = document.getElementById('nav-notif-slot');
    if (notifSlot) notifSlot.innerHTML = '';
    const messagesSlot = document.getElementById('nav-messages-slot');
    if (messagesSlot) messagesSlot.innerHTML = '';
    const profileSlot = document.getElementById('nav-profile-slot');
    if (profileSlot) profileSlot.innerHTML = '';
    refreshIcons();
    return;
  }

  const role = profile?.role || 'user';

  // Admin-section pages list every staff sub-page in their static markup; hide the ones
  // the current viewer's role doesn't cover (e.g. a mod shouldn't see Manage Challenges).
  applyRoleGatedNavItems(role);
  const badge = document.getElementById('role-badge');
  if (badge) badge.textContent = role === 'admin' ? 'Admin' : role === 'mod' ? 'Mod' : 'Staff';

  if (profile) { syncThemeFromProfile(profile); syncAccentFromProfile(profile); }
  touchLastActive(user.id);
  // touchLastActive throttles writes to once per 5 min via localStorage — without a
  // recurring call, a user who sits on one page for a long session (no navigation)
  // would never get a second write, so their status dot would silently decay from
  // online → idle → offline while they're still actively on the site.
  setInterval(() => touchLastActive(user.id), 4 * 60 * 1000);

  initNotifications(user.id);
  initMessagesBadge(user.id);
  renderNavProfileAvatar(profile);

  const onAdminPage = window.location.pathname.startsWith('/admin/');
  const adminLink = (role !== 'user' && !onAdminPage) ? `<a href="/admin/"><i data-lucide="shield" class="icon-sm icon-inline"></i>Admin</a>` : '';

  slot.innerHTML = `
    <a href="/dashboard/"><i data-lucide="user" class="icon-sm icon-inline"></i>My Profile</a>
    ${adminLink}
    <a href="/settings/"><i data-lucide="settings" class="icon-sm icon-inline"></i>Settings</a>
    <button class="btn btn-ghost btn-sm" id="nav-sign-out"><i data-lucide="log-out" class="icon-sm icon-inline"></i>Sign Out</button>
  `;
  refreshIcons();

  document.getElementById('nav-sign-out')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/';
  });
}

function renderNavProfileAvatar(profile) {
  const slot = document.getElementById('nav-profile-slot');
  if (!slot || !profile) return;
  // Signed in: the profile pic *is* the menu button — it opens the same drawer as the
  // hamburger (which "My Profile" now lives inside, see populateAuthArea), so there's only
  // one menu control instead of two. It's a <button>, not a link, since it no longer navigates.
  slot.innerHTML = `<button type="button" class="nav-avatar-btn" title="Menu" aria-label="Open menu" aria-expanded="false" style="display:flex; background:none; border:none; padding:0; cursor:pointer;">${avatarHtml(profile, 34)}</button>`;
  bindDrawerTrigger(slot.querySelector('.nav-avatar-btn'));

  // Hide the separate hamburger now that the avatar covers the same job — avoids two
  // redundant menu buttons sitting side by side once signed in.
  document.querySelector('.nav-toggle')?.classList.add('nav-toggle-merged');
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
    sb.from('broadcasts').select('id, title, message, severity, link, link_label, expires_at').eq('active', true).order('created_at', { ascending: false }).limit(5),
    sb.from('events').select('id, name, xp_multiplier').eq('active', true).limit(1),
  ]);

  let dismissed = [];
  try { dismissed = JSON.parse(localStorage.getItem('bc_dismissed_broadcasts') || '[]'); } catch {}

  const now = Date.now();
  const banners = [];
  if (events && events[0]) {
    banners.push({ id: `event-${events[0].id}`, severity: 'warning', dismissible: false, message: `<i data-lucide="zap" class="icon-sm icon-inline"></i><strong>${escapeHtml(events[0].name)}</strong> is live — earning ${events[0].xp_multiplier}x XP on approved bounties.` });
  }
  (broadcasts || [])
    .filter(b => !b.expires_at || new Date(b.expires_at).getTime() > now)
    .filter(b => !dismissed.includes(b.id))
    .forEach(b => {
      const link = b.link ? ` <a href="${safeUrl(b.link)}" style="color:inherit; text-decoration:underline; font-weight:600;">${escapeHtml(b.link_label || 'Learn more')}</a>` : '';
      banners.push({
        id: b.id,
        severity: b.severity,
        dismissible: true,
        message: `${b.title ? `<strong>${escapeHtml(b.title)}:</strong> ` : ''}${escapeHtml(b.message)}${link}`,
      });
    });

  if (!banners.length) return;

  const wrap = document.createElement('div');
  wrap.id = 'site-banners';
  wrap.innerHTML = banners.map(b => `
    <div class="site-banner" style="border-left-color:${BANNER_COLORS[b.severity] || BANNER_COLORS.info};" data-banner-id="${b.id}">
      <span>${b.message}</span>
      ${b.dismissible ? `<button type="button" class="site-banner-dismiss" data-dismiss-banner="${b.id}" aria-label="Dismiss"><i data-lucide="x" class="icon-sm"></i></button>` : ''}
    </div>
  `).join('');
  nav.insertAdjacentElement('afterend', wrap);
  refreshIcons();

  wrap.querySelectorAll('[data-dismiss-banner]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.dismissBanner;
      let list = [];
      try { list = JSON.parse(localStorage.getItem('bc_dismissed_broadcasts') || '[]'); } catch {}
      list.push(id);
      localStorage.setItem('bc_dismissed_broadcasts', JSON.stringify(list.slice(-30)));
      btn.closest('.site-banner').remove();
    });
  });
}

// ---- Notifications (bell in nav + optional browser notifications) ----

let _notifChannel = null;
let _notifUserId = null;

// ---- Messages badge (unread DM count in nav, links to /messages/) ----

async function initMessagesBadge(userId) {
  const slot = document.getElementById('nav-messages-slot');
  if (!slot) return;

  slot.innerHTML = `
    <a href="/chat/?tab=messages" class="btn btn-ghost btn-sm" aria-label="Messages" style="position:relative; padding:9px 10px;">
      <i data-lucide="mail" class="icon-sm"></i>
      <span id="messages-badge" style="display:none; position:absolute; top:2px; right:2px; background:var(--blood-dim); color:#fff; font-size:0.65rem; line-height:1; border-radius:999px; padding:3px 5px; font-weight:700;"></span>
    </a>
  `;
  refreshIcons();

  const { data: muted } = await sb.from('blocked_users').select('blocked_id').eq('blocker_id', userId).eq('kind', 'mute');
  const mutedIds = new Set((muted || []).map(m => m.blocked_id));

  const { data: unreadRows } = await sb.from('direct_messages').select('id, sender_id').eq('recipient_id', userId).is('read_at', null);
  const count = (unreadRows || []).filter(m => !mutedIds.has(m.sender_id)).length;
  const badge = document.getElementById('messages-badge');
  if (badge && count) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'block';
  }

  sb.channel(`dm-badge:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${userId}` }, (payload) => {
      if (mutedIds.has(payload.new.sender_id)) return; // muted sender — don't bump the badge
      const b = document.getElementById('messages-badge');
      if (!b) return;
      const current = parseInt(b.textContent, 10) || 0;
      b.textContent = current >= 9 ? '9+' : String(current + 1);
      b.style.display = 'block';
    })
    .subscribe();
}

async function initNotifications(userId) {
  const slot = document.getElementById('nav-notif-slot');
  if (!slot) return;
  _notifUserId = userId;

  slot.innerHTML = `
    <div class="notif-wrap" style="position:relative;">
      <button type="button" class="btn btn-ghost btn-sm" id="notif-bell-btn" aria-label="Notifications" style="position:relative; padding:9px 10px;">
        <i data-lucide="bell" class="icon-sm"></i>
        <span id="notif-badge" style="display:none; position:absolute; top:2px; right:2px; background:var(--blood-dim); color:#fff; font-size:0.65rem; line-height:1; border-radius:999px; padding:3px 5px; font-weight:700;"></span>
      </button>
      <div id="notif-dropdown" class="notif-dropdown"></div>
    </div>
  `;
  refreshIcons();

  const bellBtn = document.getElementById('notif-bell-btn');
  const dropdown = document.getElementById('notif-dropdown');

  bellBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    if (isOpen) await loadNotifications();
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== bellBtn) dropdown.classList.remove('open');
  });

  await refreshUnreadBadge();
  subscribeToNotifications(userId);
}

async function refreshUnreadBadge() {
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', _notifUserId).eq('read', false);
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

async function loadNotifications() {
  const dropdown = document.getElementById('notif-dropdown');
  dropdown.innerHTML = `<div class="skeleton" style="height:60px; margin:8px;"></div>`;

  const { data, error } = await sb.from('notifications').select('*').eq('user_id', _notifUserId).order('created_at', { ascending: false }).limit(20);
  if (error) {
    dropdown.innerHTML = errorStateHtml("Couldn't load notifications.", 'loadNotifications()');
    refreshIcons();
    return;
  }

  const permissionRow = (typeof Notification !== 'undefined' && Notification.permission === 'default')
    ? `<button type="button" class="notif-permission-row" id="notif-enable-browser"><i data-lucide="bell-ring" class="icon-sm icon-inline"></i>Turn on browser notifications</button>`
    : '';

  const header = `
    <div class="notif-dropdown-header">
      <span>Notifications</span>
      ${data.some(n => !n.read) ? `<button type="button" id="notif-mark-all-read">Mark all read</button>` : ''}
    </div>
  `;

  dropdown.innerHTML = header + permissionRow + (data.length
    ? data.map(renderNotif).join('')
    : `<p class="muted" style="padding:18px 14px; font-size:0.85rem; text-align:center;">You're all caught up.</p>`);

  refreshIcons();
  document.getElementById('notif-enable-browser')?.addEventListener('click', requestBrowserNotifPermission);
  document.getElementById('notif-mark-all-read')?.addEventListener('click', markAllNotificationsRead);
  dropdown.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', () => openNotification(el.dataset.notifId, el.dataset.notifLink));
  });
  dropdown.querySelectorAll('[data-notif-action-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      sb.from('notifications').update({ read: true }).eq('id', el.dataset.notifActionId);
    });
  });
}

function renderNotif(n) {
  const actions = n.meta?.actions?.length
    ? `<span class="notif-actions">${n.meta.actions.map(a => `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" data-notif-action-id="${n.id}">${escapeHtml(a.label)}</a>`).join('')}</span>`
    : '';
  return `
    <a href="${n.link || '#'}" class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-notif-link="${escapeHtml(n.link || '')}">
      <span class="notif-dot"></span>
      <span>
        <span class="notif-message">${escapeHtml(n.message)}</span>
        <span class="notif-time">${timeAgo(n.created_at)}</span>
        ${actions}
      </span>
    </a>
  `;
}

async function openNotification(id, link) {
  await sb.from('notifications').update({ read: true }).eq('id', id);
  await refreshUnreadBadge();
  if (link) window.location.href = link;
}

async function markAllNotificationsRead() {
  await sb.from('notifications').update({ read: true }).eq('user_id', _notifUserId).eq('read', false);
  await refreshUnreadBadge();
  await loadNotifications();
}

function requestBrowserNotifPermission() {
  if (typeof Notification === 'undefined') return;
  Notification.requestPermission().then(() => loadNotifications());
}

// Web Push (sw.js's service worker) already shows a native OS notification for the same
// event when the user has push enabled — checked here so the realtime listener below
// doesn't also fire one, which is what was causing a duplicate popup for anyone who'd
// enabled push and had a tab open when the event landed. Only checks for an existing
// registration/subscription (never registers or prompts) so this stays a passive check.
async function nativePopupAlreadyCoveredByPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

function subscribeToNotifications(userId) {
  if (_notifChannel) return;
  _notifChannel = sb
    .channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, async (payload) => {
      refreshUnreadBadge();
      const dropdown = document.getElementById('notif-dropdown');
      if (dropdown?.classList.contains('open')) loadNotifications();

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        if (await nativePopupAlreadyCoveredByPush()) return;
        const n = new Notification('BloxCore', { body: payload.new.message, icon: '/assets/icon-192.png' });
        n.onclick = () => {
          window.focus();
          if (payload.new.link) window.location.href = payload.new.link;
        };
      }
    })
    .subscribe();
}

window.addEventListener('pagehide', () => {
  if (_notifChannel) sb.removeChannel(_notifChannel);
});
