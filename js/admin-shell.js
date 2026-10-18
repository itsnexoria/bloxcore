// BloxCore — shared admin shell: sidebar navigation, live queue badges, Ctrl/⌘+K command palette,
// and keyboard shortcuts for the review queues. Loaded after nav.js on every admin page.
//
// It only WRAPS the page's existing <main>, so each page's own markup, ids and scripts keep working
// untouched. Role-aware: mods only see destinations they can actually open (same rules the pages enforce).
// Wrapped in an IIFE because classic scripts share one global scope on these pages.
(function () {
  'use strict';

  // ---- navigation model ---------------------------------------------------------------------------
  // href with a #hash targets a tab on that page. `admin: true` = admin-only (mods don't see it).
  // `badge` = key(s) of get_admin_overview() whose value is shown as a live count.
  const NAV = [
    { group: 'Overview', items: [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard', href: '/admin/overview/' },
    ] },
    { group: 'Review queues', items: [
      { id: 'submissions', label: 'Quest submissions', icon: 'inbox', href: '/admin/#submissions', badge: 'pending_submissions' },
      { id: 'reports', label: 'Reports', icon: 'flag', href: '/admin/#reports', badge: 'open_reports', tone: 'danger' },
      { id: 'appeals', label: 'Ban appeals', icon: 'gavel', href: '/admin/#appeals', badge: 'pending_appeals' },
      { id: 'giveaway-review', label: 'Giveaway review', icon: 'gift', href: '/admin/#giveaways', badge: ['pending_giveaways', 'pending_giveaway_proofs'] },
      { id: 'disputed-wars', label: 'Disputed wars', icon: 'swords', href: '/admin/#wars' },
      { id: 'flags', label: 'Auto-mod flags', icon: 'shield-alert', href: '/admin/overview/#ov-flags', badge: 'open_flags', tone: 'danger' },
    ] },
    { group: 'Content & events', items: [
      { id: 'm-challenges', label: 'Challenges', icon: 'scroll-text', href: '/admin/manage/#challenges', admin: true },
      { id: 'm-giveaways', label: 'Giveaways', icon: 'gift', href: '/admin/manage/#giveaways' },
      { id: 'm-pvp', label: 'PvP results', icon: 'crosshair', href: '/admin/manage/#pvp', badge: 'pvp_to_review' },
      { id: 'm-tournaments', label: 'Tournaments', icon: 'trophy', href: '/admin/manage/#tournaments' },
      { id: 'm-crews-wars', label: 'Crew wars', icon: 'shield', href: '/admin/manage/#crews-wars', admin: true },
      { id: 'm-game-items', label: 'Game items', icon: 'package', href: '/admin/manage/#game-items', admin: true },
      { id: 'm-titles', label: 'Titles', icon: 'award', href: '/admin/manage/#titles', admin: true },
      { id: 'm-frames', label: 'Avatar frames', icon: 'circle', href: '/admin/manage/#frames', admin: true },
      { id: 'updates', label: 'Updates', icon: 'sparkles', href: '/admin/updates/', admin: true },
    ] },
    { group: 'Community & system', items: [
      { id: 'm-users', label: 'Users', icon: 'users', href: '/admin/manage/#users', admin: true },
      { id: 'm-analytics', label: 'Analytics', icon: 'bar-chart-2', href: '/admin/manage/#analytics', admin: true },
      { id: 'm-site', label: 'Site controls', icon: 'settings', href: '/admin/manage/#site', admin: true },
    ] },
  ];
  const EXTRA_DESTINATIONS = [
    { label: 'BloxCore home', icon: 'home', href: '/' },
    { label: 'My dashboard', icon: 'user', href: '/dashboard/' },
    { label: 'Trading board', icon: 'repeat', href: '/trading/' },
    { label: 'Feed', icon: 'message-square', href: '/feed/' },
  ];
  // Hash used when a page is opened without one (mirrors each page's own default).
  const DEFAULT_HASH = { '/admin/': 'submissions', '/admin/manage/': null /* decided by role */ };

  // ---- state --------------------------------------------------------------------------------------
  let role = 'mod';
  let counts = {};
  let paletteOpen = false;
  let kbdIdx = -1;
  let queueFilter = '';
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const isAdmin = () => role === 'admin';
  const icons = () => { if (typeof refreshIcons === 'function') refreshIcons(); };
  const normPath = (p) => (p.endsWith('/') ? p : p + '/').replace(/index\.html\/?$/, '');

  function visibleNav() {
    return NAV.map(g => ({ ...g, items: g.items.filter(i => !i.admin || isAdmin()) })).filter(g => g.items.length);
  }
  function splitHref(href) { const [path, hash] = href.split('#'); return { path: normPath(path), hash: hash || '' }; }
  function currentLocation() {
    const path = normPath(location.pathname);
    let hash = location.hash.replace('#', '');
    if (!hash && path in DEFAULT_HASH) hash = DEFAULT_HASH[path] ?? (isAdmin() ? 'challenges' : 'giveaways');
    return { path, hash };
  }
  function isActive(item) {
    const cur = currentLocation(); const t = splitHref(item.href);
    if (t.path !== cur.path) return false;
    if (t.hash) return t.hash === cur.hash;
    return cur.path !== '/admin/overview/' || cur.hash !== 'ov-flags';
  }
  function badgeValue(item) {
    if (!item.badge) return 0;
    const keys = Array.isArray(item.badge) ? item.badge : [item.badge];
    return keys.reduce((n, k) => n + (Number(counts[k]) || 0), 0);
  }

  // ---- build the shell ----------------------------------------------------------------------------
  function build() {
    const main = $('main');
    if (!main || $('.adm-shell')) return;
    document.body.classList.add('adm-active');

    const shell = document.createElement('div');
    shell.className = 'adm-shell';
    shell.innerHTML = `
      <aside class="adm-side" id="adm-side" aria-label="Admin navigation"></aside>
      <div class="adm-scrim" id="adm-scrim"></div>
      <div class="adm-body">
        <div class="adm-top">
          <button type="button" class="adm-iconbtn adm-burger" id="adm-burger" aria-label="Open admin menu"><i data-lucide="menu" class="icon-sm"></i></button>
          <div class="adm-crumb" id="adm-crumb"></div>
          <label class="adm-filter" id="adm-filter" hidden><i data-lucide="filter" class="icon-sm"></i><input type="search" id="adm-filter-input" placeholder="Filter this queue…" aria-label="Filter this queue" autocomplete="off"></label>
          <button type="button" class="adm-palette-btn" id="adm-palette-btn" aria-label="Search the admin panel"><i data-lucide="search" class="icon-sm"></i><span>Search…</span><kbd>Ctrl K</kbd></button>
          <button type="button" class="adm-iconbtn" id="adm-help-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><i data-lucide="keyboard" class="icon-sm"></i></button>
        </div>
      </div>`;
    main.parentNode.insertBefore(shell, main);
    $('.adm-body', shell).appendChild(main);

    $('#adm-burger').addEventListener('click', () => toggleDrawer());
    $('#adm-scrim').addEventListener('click', () => toggleDrawer(false));
    $('#adm-palette-btn').addEventListener('click', openPalette);
    $('#adm-help-btn').addEventListener('click', toggleHelp);
    $('#adm-filter-input').addEventListener('input', (e) => { queueFilter = e.target.value.trim().toLowerCase(); applyQueueFilter(); });
  }

  function toggleDrawer(force) {
    const open = force ?? !$('#adm-side').classList.contains('open');
    $('#adm-side').classList.toggle('open', open);
    $('#adm-scrim').classList.toggle('open', open);
  }

  function renderSide() {
    const side = $('#adm-side');
    if (!side) return;
    side.innerHTML = `
      <div class="adm-side-head"><i data-lucide="shield-check" class="icon-sm"></i><div><strong>Control room</strong><span class="adm-role">${esc(role)}</span></div></div>
      <nav class="adm-nav">
        ${visibleNav().map(g => `
          <div class="adm-group">
            <span class="adm-group-label">${esc(g.group)}</span>
            ${g.items.map(i => {
              const n = badgeValue(i);
              return `<a href="${i.href}" class="adm-link${isActive(i) ? ' is-active' : ''}" data-adm-id="${i.id}"${isActive(i) ? ' aria-current="page"' : ''}>
                <i data-lucide="${i.icon}" class="icon-sm"></i><span class="adm-link-label">${esc(i.label)}</span>
                ${n > 0 ? `<span class="adm-badge${i.tone === 'danger' ? ' is-danger' : ''}">${n > 99 ? '99+' : n}</span>` : ''}
              </a>`;
            }).join('')}
          </div>`).join('')}
      </nav>
      <div class="adm-side-foot">
        <a href="/" class="adm-link"><i data-lucide="arrow-left" class="icon-sm"></i><span class="adm-link-label">Back to site</span></a>
        <p><kbd>Ctrl K</kbd> search · <kbd>?</kbd> shortcuts</p>
      </div>`;
    side.querySelectorAll('.adm-link[data-adm-id]').forEach(a => a.addEventListener('click', onNavClick));
    renderCrumb();
    icons();
  }

  function renderCrumb() {
    const el = $('#adm-crumb');
    if (!el) return;
    let found = null;
    visibleNav().forEach(g => g.items.forEach(i => { if (isActive(i)) found = { g: g.group, i }; }));
    el.innerHTML = found
      ? `<span class="adm-crumb-group">${esc(found.g)}</span><i data-lucide="chevron-right" class="icon-sm"></i><strong>${esc(found.i.label)}</strong>`
      : '<strong>Admin</strong>';
    const onReview = normPath(location.pathname) === '/admin/';
    const f = $('#adm-filter'); if (f) f.hidden = !onReview;
  }

  // Same-page tab links switch tabs in place; everything else navigates normally.
  function onNavClick(e) {
    const a = e.currentTarget; const t = splitHref(a.getAttribute('href'));
    const here = normPath(location.pathname);
    toggleDrawer(false);
    if (t.path !== here || !t.hash) return;
    if (here === '/admin/' && typeof switchReviewTab === 'function') { e.preventDefault(); switchReviewTab(t.hash); }
    else if (here === '/admin/manage/') { e.preventDefault(); location.hash = t.hash; }
  }

  // ---- live counts --------------------------------------------------------------------------------
  async function refreshCounts() {
    if (typeof sb === 'undefined') return;
    const { data, error } = await sb.rpc('get_admin_overview');
    if (error || !data) return;
    counts = data;
    renderSide();
    paintTabCounts();
  }
  function paintTabCounts() {
    const map = { submissions: counts.pending_submissions, reports: counts.open_reports, appeals: counts.pending_appeals, giveaways: (counts.pending_giveaways || 0) + (counts.pending_giveaway_proofs || 0) };
    document.querySelectorAll('[data-review-tab]').forEach(btn => {
      const n = Number(map[btn.dataset.reviewTab]) || 0;
      let b = btn.querySelector('.adm-count');
      if (!n) { b?.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'adm-count'; btn.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
    });
  }
  const ACTION_BTN = '[data-approve],[data-reject],[data-resolve-report],[data-dismiss-report],[data-approve-appeal],[data-deny-appeal],[data-approve-pending-giveaway],[data-reject-pending-giveaway],[data-resolve-war],#bulk-approve-btn,#bulk-reject-btn,#report-bulk-dismiss-btn';

  // ---- command palette ----------------------------------------------------------------------------
  let palItems = []; let palIdx = 0; let palTimer = 0; let palSeq = 0;
  function destinations() {
    const nav = visibleNav().flatMap(g => g.items.map(i => ({ type: 'page', label: i.label, hint: g.group, icon: i.icon, href: i.href })));
    return nav.concat(EXTRA_DESTINATIONS.map(d => ({ type: 'page', hint: 'Go to', ...d })));
  }
  function openPalette() {
    if (paletteOpen) return;
    paletteOpen = true;
    const wrap = document.createElement('div');
    wrap.className = 'adm-pal-wrap'; wrap.id = 'adm-pal';
    wrap.innerHTML = `
      <div class="adm-pal" role="dialog" aria-modal="true" aria-label="Admin search">
        <div class="adm-pal-input"><i data-lucide="search" class="icon-sm"></i><input type="text" id="adm-pal-q" placeholder="Jump to a page or find a player…" autocomplete="off" aria-label="Search"><kbd>Esc</kbd></div>
        <div class="adm-pal-list" id="adm-pal-list" role="listbox"></div>
        <div class="adm-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>Type 2+ letters to find players</span></div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closePalette(); });
    const q = $('#adm-pal-q');
    q.addEventListener('input', () => schedulePalette(q.value));
    q.addEventListener('keydown', onPaletteKey);
    renderPalette('', []);
    q.focus();
    icons();
  }
  function closePalette() { $('#adm-pal')?.remove(); paletteOpen = false; }

  function schedulePalette(value) {
    clearTimeout(palTimer);
    renderPalette(value, null);
    const term = value.trim();
    if (term.length < 2 || typeof sb === 'undefined') return;
    const seq = ++palSeq;
    palTimer = setTimeout(async () => {
      const safe = term.replace(/[,()%*\\]/g, ' ').trim();
      if (!safe) return;
      const { data } = await sb.from('profiles').select('id, username, display_name, avatar_url, role, banned').or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`).limit(6);
      if (seq !== palSeq || !paletteOpen) return; // a newer keystroke superseded this lookup
      renderPalette(value, data || []);
    }, 220);
  }

  function renderPalette(value, users) {
    const term = value.trim().toLowerCase();
    let pages = destinations();
    if (term) pages = pages.filter(p => (p.label + ' ' + p.hint).toLowerCase().includes(term));
    palItems = [];
    const rows = [];
    if (users && users.length) {
      users.forEach(u => {
        const name = u.display_name || u.username;
        palItems.push({ type: 'user', run: () => { closePalette(); location.href = `/player/?u=${encodeURIComponent(u.username)}`; } });
        rows.push({ group: 'Players', html: palRow(avatarSafe(u), `${esc(name)} <small>@${esc(u.username)}${u.banned ? ' · banned' : ''}${u.role && u.role !== 'user' ? ' · ' + esc(u.role) : ''}</small>`, 'Open profile') });
        if (isAdmin()) {
          palItems.push({ type: 'manage', run: () => { closePalette(); openUserInManage(u.username); } });
          rows.push({ group: 'Players', html: palRow('<i data-lucide="user-cog" class="icon-sm"></i>', `Manage ${esc(name)}`, 'Users tab') });
        }
      });
    } else if (users === null && term.length >= 2) {
      rows.push({ group: 'Players', html: '<div class="adm-pal-empty">Searching players…</div>', skip: true });
    }
    pages.slice(0, 12).forEach(p => {
      palItems.push({ type: 'page', run: () => { closePalette(); goTo(p.href); } });
      rows.push({ group: 'Pages', html: palRow(`<i data-lucide="${p.icon || 'arrow-right'}" class="icon-sm"></i>`, esc(p.label), p.hint) });
    });
    if (!rows.length) rows.push({ group: '', html: '<div class="adm-pal-empty">No matches.</div>', skip: true });
    palIdx = Math.min(palIdx, Math.max(palItems.length - 1, 0));
    let i = -1; let lastGroup = null;
    $('#adm-pal-list').innerHTML = rows.map(r => {
      const head = r.group && r.group !== lastGroup ? `<div class="adm-pal-group">${esc(r.group)}</div>` : '';
      lastGroup = r.group;
      if (r.skip) return head + r.html;
      i++;
      return head + r.html.replace('class="adm-pal-row"', `class="adm-pal-row${i === palIdx ? ' is-sel' : ''}" data-pal-i="${i}" role="option"`);
    }).join('');
    $('#adm-pal-list').querySelectorAll('[data-pal-i]').forEach(el => {
      el.addEventListener('mousemove', () => selectPal(Number(el.dataset.palI), false));
      el.addEventListener('click', () => palItems[Number(el.dataset.palI)]?.run());
    });
    icons();
  }
  const palRow = (lead, label, hint) => `<div class="adm-pal-row"><span class="adm-pal-lead">${lead}</span><span class="adm-pal-label">${label}</span><span class="adm-pal-hint">${esc(hint || '')}</span></div>`;
  function avatarSafe(u) {
    return typeof avatarHtml === 'function' ? avatarHtml({ username: u.username, display_name: u.display_name, avatar_url: u.avatar_url }, 26) : '<i data-lucide="user" class="icon-sm"></i>';
  }
  function selectPal(i, scroll = true) {
    if (!palItems.length) return;
    palIdx = (i + palItems.length) % palItems.length;
    document.querySelectorAll('#adm-pal-list [data-pal-i]').forEach(el => el.classList.toggle('is-sel', Number(el.dataset.palI) === palIdx));
    if (scroll) $(`#adm-pal-list [data-pal-i="${palIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function onPaletteKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectPal(palIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectPal(palIdx - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); palItems[palIdx]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  }
  function goTo(href) {
    const t = splitHref(href);
    if (t.path === normPath(location.pathname) && t.hash) {
      if (t.path === '/admin/' && typeof switchReviewTab === 'function') switchReviewTab(t.hash);
      else location.hash = t.hash;
    } else location.href = href;
  }
  function openUserInManage(username) {
    try { sessionStorage.setItem('adm_user_q', username); } catch (_) { /* private mode: the tab just opens unfiltered */ }
    if (normPath(location.pathname) !== '/admin/manage/') { location.href = '/admin/manage/#users'; return; }
    location.hash = 'users';
    setTimeout(() => { // tab already initialised -> fill its search box now; otherwise its init reads the stored value
      if (typeof _usersTabInit !== 'undefined' && _usersTabInit) {
        const input = document.getElementById('user-search');
        if (input) { input.value = username; input.dispatchEvent(new Event('input')); sessionStorage.removeItem('adm_user_q'); }
      }
    }, 150);
  }

  // ---- review-queue keyboard shortcuts ------------------------------------------------------------
  const QUEUE = {
    submissions: { primary: '[data-approve]', secondary: '[data-reject]', open: 'a[href][target="_blank"]' },
    giveaways: { primary: '[data-approve-pending-giveaway]', secondary: '[data-reject-pending-giveaway]', open: 'a[href][target="_blank"]' },
    reports: { primary: '[data-resolve-report]', secondary: '[data-dismiss-report]', open: 'a[href][target="_blank"]' },
    appeals: { primary: '[data-approve-appeal]', secondary: '[data-deny-appeal]', open: 'a[href]' },
    wars: { primary: '[data-resolve-war]', secondary: null, open: 'a[href][target="_blank"]', noQuick: true },
  };
  const activeTab = () => (typeof activeReviewTab !== 'undefined' ? activeReviewTab : null);
  function queueCards() {
    const tab = activeTab(); const q = QUEUE[tab];
    if (!q || normPath(location.pathname) !== '/admin/') return [];
    const panel = document.querySelector(`[data-review-panel="${tab}"]`);
    if (!panel) return [];
    return [...new Set([...panel.querySelectorAll(q.primary)].map(b => b.closest('.panel')).filter(Boolean))].filter(c => !c.hasAttribute('data-adm-hidden'));
  }
  function applyQueueFilter() {
    const tab = activeTab(); const q = QUEUE[tab];
    const panel = tab && document.querySelector(`[data-review-panel="${tab}"]`);
    if (!panel || !q) return;
    const all = [...new Set([...panel.querySelectorAll(q.primary)].map(b => b.closest('.panel')).filter(Boolean))];
    all.forEach(c => {
      const hide = queueFilter && !c.textContent.toLowerCase().includes(queueFilter);
      c.toggleAttribute('data-adm-hidden', !!hide);
      c.style.display = hide ? 'none' : '';
    });
    setKbdFocus(Math.min(kbdIdx, queueCards().length - 1));
  }
  function setKbdFocus(i, scroll = false) {
    document.querySelectorAll('.adm-kbd-focus').forEach(c => c.classList.remove('adm-kbd-focus'));
    const cards = queueCards();
    if (!cards.length || i < 0) { kbdIdx = -1; return; }
    kbdIdx = Math.max(0, Math.min(i, cards.length - 1));
    const c = cards[kbdIdx]; c.classList.add('adm-kbd-focus');
    if (scroll) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function queueKey(key, e) {
    const tab = activeTab(); const q = QUEUE[tab];
    if (!q) return false;
    const cards = queueCards();
    if (key === 'j' || key === 'ArrowDown') { setKbdFocus(kbdIdx + 1, true); return true; }
    if (key === 'k' || key === 'ArrowUp') { setKbdFocus(kbdIdx - 1, true); return true; }
    if (key === 'Escape') { setKbdFocus(-1); return false; }
    const card = cards[kbdIdx];
    if (!card) return false;
    const click = (sel) => { const b = sel && card.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; };
    if (key === 'a' && !q.noQuick) return click(q.primary) || true;
    if (key === 'x' && !q.noQuick) return click(q.secondary) || true;
    if (key === 'o') { const l = card.querySelector(q.open); if (l) { if (l.tagName === 'A') window.open(l.href, '_blank', 'noopener'); else l.click(); } return true; }
    if (key === 's') { const cb = card.querySelector('input[type="checkbox"]'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); } return true; }
    return false;
  }
  function cycleTab(dir) {
    const tabs = ['submissions', 'giveaways', 'reports', 'appeals', 'wars'];
    const cur = tabs.indexOf(activeTab());
    if (cur < 0 || typeof switchReviewTab !== 'function') return;
    switchReviewTab(tabs[(cur + dir + tabs.length) % tabs.length]);
  }

  // ---- shortcut help ------------------------------------------------------------------------------
  function toggleHelp() {
    const open = $('#adm-help');
    if (open) { open.remove(); return; }
    const w = document.createElement('div');
    w.className = 'adm-pal-wrap'; w.id = 'adm-help';
    w.innerHTML = `
      <div class="adm-pal adm-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="adm-help-head"><strong>Keyboard shortcuts</strong><button type="button" class="adm-iconbtn" id="adm-help-close" aria-label="Close"><i data-lucide="x" class="icon-sm"></i></button></div>
        <div class="adm-help-grid">
          <div><h4>Anywhere</h4><p><kbd>Ctrl</kbd><kbd>K</kbd> Search pages &amp; players</p><p><kbd>?</kbd> This list</p></div>
          <div><h4>Review queues</h4>
            <p><kbd>J</kbd> / <kbd>K</kbd> Next / previous item</p>
            <p><kbd>A</kbd> Approve / resolve</p>
            <p><kbd>X</kbd> Reject / dismiss</p>
            <p><kbd>S</kbd> Select for bulk action</p>
            <p><kbd>O</kbd> Open proof / link</p>
            <p><kbd>[</kbd> <kbd>]</kbd> Switch queue</p>
            <p><kbd>/</kbd> Filter the queue</p>
          </div>
        </div>
      </div>`;
    document.body.appendChild(w);
    w.addEventListener('mousedown', (e) => { if (e.target === w) w.remove(); });
    $('#adm-help-close').addEventListener('click', () => w.remove());
    icons();
  }

  // ---- global key handling ------------------------------------------------------------------------
  const typing = () => { const el = document.activeElement; return !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable); };
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'k') { e.preventDefault(); paletteOpen ? closePalette() : openPalette(); return; }
    if (k === 'Escape') { if ($('#adm-help')) { $('#adm-help').remove(); return; } if (paletteOpen) { closePalette(); return; } }
    if (typing() || paletteOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.lightbox-overlay.open')) return;
    if (k === '?') { e.preventDefault(); toggleHelp(); return; }
    if (k === '/' && normPath(location.pathname) === '/admin/') { e.preventDefault(); $('#adm-filter-input')?.focus(); return; }
    if (k === '[' ) { cycleTab(-1); return; }
    if (k === ']') { cycleTab(1); return; }
    if (queueKey(k, e)) e.preventDefault();
  });
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest(ACTION_BTN)) setTimeout(refreshCounts, 1500); });

  // history.replaceState (used by the pages' own tab switching) fires no event — announce it so the
  // sidebar highlight and breadcrumb follow tab changes.
  const _replace = history.replaceState;
  history.replaceState = function () { const r = _replace.apply(this, arguments); window.dispatchEvent(new Event('adm:statechange')); return r; };
  const onNav = () => { renderSide(); queueFilter = ''; const fi = $('#adm-filter-input'); if (fi) fi.value = ''; setKbdFocus(-1); watchQueue(); };
  window.addEventListener('hashchange', onNav);
  window.addEventListener('adm:statechange', onNav);

  // Queues re-render as items are actioned/loaded; keep the highlight + filter in sync.
  let observer = null;
  function watchQueue() {
    observer?.disconnect();
    const tab = activeTab();
    const panel = tab && document.querySelector(`[data-review-panel="${tab}"]`);
    if (!panel) return;
    observer = new MutationObserver(() => applyQueueFilter());
    observer.observe(panel, { childList: true, subtree: true });
  }

  // ---- boot ---------------------------------------------------------------------------------------
  async function init() {
    build();
    if (!$('.adm-shell')) return;
    try {
      const { profile } = await getCurrentProfile();
      if (profile?.role === 'admin') role = 'admin'; else if (profile?.role === 'mod') role = 'mod';
    } catch (_) { /* the page's own requireMod() handles redirects; keep the mod view */ }
    renderSide();
    watchQueue();
    refreshCounts();
    setInterval(() => { if (!document.hidden) refreshCounts(); }, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCounts(); });
  }
  if (typeof onReady === 'function') onReady(init); else document.addEventListener('DOMContentLoaded', init);

  window.admShell = { refreshCounts, openPalette };
})();
