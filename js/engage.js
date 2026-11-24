// BloxCore — gentle sign-up prompts + mobile "post" floating action buttons.
// Self-contained: injects its own CSS, needs nothing from other files (uses the global `sb` only to start
// Discord sign-in, and falls back to /auth/). Loaded on every page by one line in nav.js (see README note).
//
//  1. Logged-out visitors get a dismissible, non-blocking card after they've shown interest (never on first
//     paint, never on /auth/ or legal pages, and it backs off for days after "Maybe later").
//  2. On phones the page's "post / new listing / add" button becomes a floating button. Logged-out visitors
//     see it too — tapping it opens a friendly one-tap Discord sign-in sheet instead of a dead end.
//  3. On /feed/ (phones) the composer becomes a bottom sheet opened by that button; for logged-out visitors
//     the greyed-out like/react buttons open the same sign-in sheet.
(function () {
  'use strict';
  if (window.__bcEngage) return;
  window.__bcEngage = true;

  const path = location.pathname;
  const NO_PROMPT = /^\/(auth|admin|privacy|terms|offline|404)(\/|$)/.test(path) || path === '/dashboard/' || path === '/dashboard';
  const mobile = window.matchMedia('(max-width: 760px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const loggedIn = () => {
    try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)); } catch { return false; }
  };
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- styles
  const css = `
.bc-fab{position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:850;height:56px;min-width:56px;padding:0 20px 0 16px;border:0;border-radius:28px;display:none;align-items:center;justify-content:center;gap:8px;color:#fff;cursor:pointer;
  font:700 .85rem/1 var(--font-body,system-ui,sans-serif);letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(135deg,var(--brass,#2563eb),var(--brass-bright,#60a5fa));
  box-shadow:0 10px 28px rgb(0 0 0/.5),inset 0 0 0 1px rgb(255 255 255/.16);transition:padding .2s,transform .2s,opacity .2s;-webkit-tap-highlight-color:transparent}
.bc-fab svg{width:22px;height:22px;flex:none}
.bc-fab-label{max-width:150px;overflow:hidden;white-space:nowrap;transition:max-width .2s,opacity .2s}
.bc-fab.is-compact{padding:0 17px}.bc-fab.is-compact .bc-fab-label{max-width:0;opacity:0}
.bc-fab.is-away{transform:translateY(96px);opacity:0;pointer-events:none}
.bc-fab:active{transform:scale(.96)}
.bc-fab:focus-visible,.bc-sheet button:focus-visible,.bc-nudge button:focus-visible,.bc-nudge a:focus-visible{outline:2px solid #fff;outline-offset:2px}
.bc-gated{opacity:.65;cursor:pointer!important}
@media (max-width:760px){.bc-fab:not([hidden]){display:inline-flex}.bc-fab-src{display:none!important}
  #feed-compose.bc-compose:not(.bc-open){display:none!important}
  #feed-compose.bc-open{display:block!important;transform:none!important;opacity:1!important;visibility:visible!important;position:fixed;left:0;right:0;bottom:0;z-index:1250;margin:0;max-height:88dvh;overflow:auto;border-radius:22px 22px 0 0;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));animation:bc-up .22s ease-out}
  .bc-compose-head{display:flex;align-items:center;justify-content:space-between;margin:-4px 0 10px;font-weight:700}
  .bc-compose-head button{min-width:44px;min-height:44px;border:0;background:none;color:inherit;font-size:1.5rem;line-height:1;cursor:pointer}}
@media (min-width:761px){.bc-compose-head{display:none}}
.bc-backdrop{position:fixed;inset:0;z-index:1240;background:rgb(0 0 0/.62);backdrop-filter:blur(3px);animation:bc-fade .18s ease-out}
.bc-sheet{position:fixed;z-index:1300;left:0;right:0;bottom:0;margin:0 auto;max-width:440px;padding:22px 20px calc(22px + env(safe-area-inset-bottom,0px));border-radius:22px 22px 0 0;text-align:center;color:var(--bone,#f3f4f6);
  background:linear-gradient(180deg,rgb(255 255 255/.06),rgb(255 255 255/.015)),var(--navy,#0b1020);border:1px solid rgb(255 255 255/.12);box-shadow:0 -20px 60px rgb(0 0 0/.6);animation:bc-up .22s ease-out}
@media (min-width:761px){.bc-sheet{bottom:auto;top:50%;transform:translateY(-50%);border-radius:22px;animation:bc-fade .18s ease-out}}
.bc-sheet h2,.bc-nudge h2{margin:0 0 6px;font-size:1.2rem;line-height:1.25;text-transform:none;letter-spacing:0}.bc-sheet h2::after,.bc-nudge h2::after{display:none}
.bc-sheet p,.bc-nudge p{margin:0 0 14px;color:var(--ash,#9ca3af);font-size:.92rem;line-height:1.5}
.bc-perks{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:0 0 14px}.bc-perks span{padding:3px 10px;border-radius:999px;font-size:.74rem;background:rgb(255 255 255/.07);border:1px solid rgb(255 255 255/.1)}
.bc-discord{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:50px;border:0;border-radius:14px;background:#5865f2;color:#fff;font:700 .95rem/1 var(--font-body,system-ui,sans-serif);letter-spacing:.03em;text-transform:uppercase;cursor:pointer;box-shadow:0 8px 24px rgb(88 101 242/.4)}
.bc-discord:disabled{opacity:.7;cursor:progress}.bc-discord svg{width:22px;height:22px}
.bc-row{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px}
.bc-link{min-height:44px;padding:0 12px;border:0;background:none;color:var(--ash,#9ca3af);font:600 .85rem/1 var(--font-body,system-ui,sans-serif);text-decoration:underline;text-underline-offset:3px;cursor:pointer;display:inline-flex;align-items:center}
.bc-x{position:absolute;top:4px;right:4px;width:44px;height:44px;border:0;background:none;color:var(--ash,#9ca3af);font-size:1.4rem;cursor:pointer}
.bc-nudge{position:fixed;z-index:840;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));padding:18px 16px 12px;border-radius:18px;color:var(--bone,#f3f4f6);
  background:linear-gradient(180deg,rgb(255 255 255/.07),rgb(255 255 255/.02)),var(--navy,#0b1020);border:1px solid rgb(255 255 255/.14);box-shadow:0 18px 50px rgb(0 0 0/.6);animation:bc-up .3s ease-out}
@media (min-width:761px){.bc-nudge{left:auto;right:20px;bottom:20px;width:380px}}
@media (max-width:760px){.bc-nudge .bc-perks{display:none}.bc-nudge{padding:16px 14px 8px}.bc-nudge p{margin-bottom:12px}}
.bc-nudge h2{padding-right:34px}
@keyframes bc-up{from{transform:translateY(28px);opacity:0}to{transform:none;opacity:1}}@keyframes bc-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.bc-fab,.bc-sheet,.bc-nudge,.bc-backdrop,#feed-compose.bc-open{animation:none!important;transition:none!important}}
body:has(.nav-links.open) .bc-fab{display:none!important}`;
  const style = document.createElement('style');
  style.id = 'bc-engage-css';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  // ---------------------------------------------------------------- sign-in
  const DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.27 5.33A17.2 17.2 0 0 0 15 4l-.2.4a15.8 15.8 0 0 1 3.9 1.9 14 14 0 0 0-13.4 0A15.8 15.8 0 0 1 9.2 4.4L9 4a17.2 17.2 0 0 0-4.27 1.33C2.05 9.3 1.3 13.2 1.67 17.05A17.3 17.3 0 0 0 6.9 19.7l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12.3 12.3 0 0 0 10.6 0l.4.3a11 11 0 0 1-1.7.8l1.1 1.8a17.3 17.3 0 0 0 5.23-2.65c.44-4.45-.75-8.3-3.06-11.72ZM8.7 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>';

  async function discordSignIn(btn) {
    store.set('bc_nudge', { ...store.get('bc_nudge', {}), until: Date.now() + 14 * 864e5 });
    btn.disabled = true;
    btn.lastChild.textContent = 'Opening Discord…';
    try {
      if (typeof sb !== 'undefined' && sb.auth) {
        const { error } = await sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + '/dashboard/' } });
        if (!error) return;
      }
    } catch { /* fall through */ }
    location.href = '/auth/';
  }

  let openSheet = null;
  function closeSheet() { if (!openSheet) return; openSheet.remove(); openSheet = null; document.removeEventListener('keydown', onEsc); }
  function onEsc(e) { if (e.key === 'Escape') closeSheet(); }

  function openSignIn({ title, body }) {
    closeSheet(); hideNudge(false);
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="bc-backdrop"></div>
      <div class="bc-sheet" role="dialog" aria-modal="true" aria-labelledby="bc-sheet-title">
        <button class="bc-x" type="button" aria-label="Close">×</button>
        <h2 id="bc-sheet-title">${esc(title || 'Join BloxCore')}</h2>
        <p>${esc(body || 'It\u2019s free and takes about 10 seconds with Discord.')}</p>
        <button class="bc-discord" type="button">${DISCORD_SVG}<span>Continue with Discord</span></button>
        <div class="bc-row"><a class="bc-link" href="/auth/">Use email instead</a><button class="bc-link" type="button" data-close>Not now</button></div>
      </div>`;
    document.body.appendChild(wrap);
    openSheet = wrap;
    const go = wrap.querySelector('.bc-discord');
    go.addEventListener('click', () => discordSignIn(go));
    wrap.querySelector('.bc-backdrop').addEventListener('click', closeSheet);
    wrap.querySelector('.bc-x').addEventListener('click', closeSheet);
    wrap.querySelector('[data-close]').addEventListener('click', closeSheet);
    document.addEventListener('keydown', onEsc);
    go.focus({ preventScroll: true });
  }
  window.bcSignInPrompt = openSignIn; // other scripts can call this instead of redirecting to /auth/

  // ---------------------------------------------------------------- soft nudge card
  let nudge = null, nudgeTimer = null;
  function hideNudge(remember) {
    if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
    if (!nudge) return;
    nudge.remove(); nudge = null;
    if (remember) {
      const s = store.get('bc_nudge', {});
      const n = (s.n || 0) + 1;
      store.set('bc_nudge', { n, until: Date.now() + (n === 1 ? 3 : n === 2 ? 7 : 30) * 864e5 });
    }
    syncFab();
  }

  function nudgeCopy() {
    const h1 = (document.querySelector('h1')?.textContent || '').trim();
    if (/^\/blox-fruits-values\/[^/]+\/?$/.test(path)) {
      const name = h1.replace(/\s+Value in Blox Fruits.*$/i, '').trim();
      return { title: name ? `Get an alert when ${name} is listed` : 'Get alerts for the items you want', body: 'Free account: add items to your watchlist and we\u2019ll tell you the moment someone offers them.' };
    }
    if (/^\/blox-fruits-compare\//.test(path)) return { title: 'Trading these? Do it on BloxCore', body: 'Post a listing, get offers and track value changes \u2014 free with Discord.' };
    if (path.startsWith('/trading')) return { title: 'Post your own listing', body: 'Sign in with Discord in one tap and trade with the community.' };
    if (path.startsWith('/feed')) return { title: 'Join the conversation', body: 'Post, react, comment and follow other pirates \u2014 free.' };
    if (path.startsWith('/giveaways')) return { title: 'Enter giveaways', body: 'Sign in with Discord to join and get notified about new ones.' };
    return { title: 'Join BloxCore \u2014 it\u2019s free', body: 'Track values, get trade alerts, post listings and enter giveaways.' };
  }

  function showNudge() {
    if (nudge || openSheet || loggedIn() || document.hidden) return;
    const s = store.get('bc_nudge', {});
    if (s.until && Date.now() < s.until) return;
    const c = nudgeCopy();
    nudge = document.createElement('section');
    nudge.className = 'bc-nudge';
    nudge.setAttribute('aria-label', 'Join BloxCore');
    nudge.innerHTML = `<button class="bc-x" type="button" aria-label="Dismiss">×</button>
      <h2>${esc(c.title)}</h2><p>${esc(c.body)}</p>
      <div class="bc-perks"><span>🔔 Trade alerts</span><span>📈 Track values</span><span>🎁 Giveaways</span></div>
      <button class="bc-discord" type="button">${DISCORD_SVG}<span>Continue with Discord</span></button>
      <div class="bc-row"><a class="bc-link" href="/auth/">Use email</a><button class="bc-link" type="button" data-later>Maybe later</button></div>`;
    document.body.appendChild(nudge);
    const go = nudge.querySelector('.bc-discord');
    go.addEventListener('click', () => discordSignIn(go));
    nudge.querySelector('.bc-x').addEventListener('click', () => hideNudge(true));
    nudge.querySelector('[data-later]').addEventListener('click', () => hideNudge(true));
    syncFab();
  }

  function scheduleNudge() {
    if (NO_PROMPT || loggedIn()) return;
    const pv = (+sessionStorage.getItem('bc_pv') || 0) + 1;
    try { sessionStorage.setItem('bc_pv', String(pv)); } catch { /* ignore */ }
    const start = Date.now();
    let fired = false;
    const fire = () => { if (fired) return; fired = true; window.removeEventListener('scroll', onScroll); showNudge(); };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY / max >= 0.45 && Date.now() - start >= 15000) fire();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    nudgeTimer = setTimeout(fire, pv >= 2 ? 6000 : 45000); // 2nd page in a session: soon; first page: only after real dwell time
  }

  // ---------------------------------------------------------------- floating action button
  const FAB = {
    '/trading/':    { sel: '#new-listing-btn',    label: 'New listing',    gate: ['Post a trade listing', 'Sign in with Discord (free) to post listings and get offers.'] },
    '/services/':   { sel: '#new-listing-btn',    label: 'Post listing',   gate: ['Post a service listing', 'Sign in with Discord (free) to find or offer raid and trial help.'] },
    '/giveaways/':  { sel: '#submit-giveaway-btn', label: 'Giveaway',      gate: ['Submit a giveaway', 'Sign in with Discord (free) to submit and enter giveaways.'] },
    '/pvp/':        { sel: '#post-match-btn',     label: 'Post match',     gate: ['Post a PvP match', 'Sign in with Discord (free) to challenge other pirates.'] },
    '/sea-events/': { sel: '#post-event-btn',     label: 'Post event',     gate: ['Host a sea event', 'Sign in with Discord (free) to host and join sea events.'] },
    '/combos/':     { sel: '#new-combo-btn',      label: 'Add combo',      gate: ['Share a combo', 'Sign in with Discord (free) to publish your combos.'] },
    '/crews/':      { sel: '#create-crew-btn',    label: 'Create crew',    gate: ['Start a crew', 'Sign in with Discord (free) to create or join a crew.'] },
    '/feed/':       { compose: '#feed-compose',   label: 'Post',           gate: ['Share with the crew', 'Sign in with Discord (free) to post, react and comment.'] },
  };
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  let fab = null, syncFab = () => {};

  function setupFab() {
    const cfg = FAB[path.endsWith('/') ? path : path + '/'];
    if (!cfg) return;
    const src = cfg.sel ? document.querySelector(cfg.sel) : null;
    const composer = cfg.compose ? document.querySelector(cfg.compose) : null;
    if ((cfg.sel && !src) || (cfg.compose && !composer)) return;

    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'bc-fab';
    fab.setAttribute('aria-label', cfg.label);
    fab.innerHTML = `${cfg.compose ? PEN : PLUS}<span class="bc-fab-label">${esc(cfg.label)}</span>`;
    document.body.appendChild(fab);
    if (src) src.classList.add('bc-fab-src');
    if (composer) composer.classList.add('bc-compose');

    const available = () => !loggedIn() || (src ? src.style.display !== 'none' : composer ? composer.style.display !== 'none' : true);
    let typing = false;
    syncFab = () => {
      fab.hidden = !available();
      fab.classList.toggle('is-away', typing || !!nudge || !!openSheet || !!document.querySelector('#feed-compose.bc-open'));
    };
    if (src) new MutationObserver(syncFab).observe(src, { attributes: true, attributeFilter: ['style'] });
    if (composer) new MutationObserver(syncFab).observe(composer, { attributes: true, attributeFilter: ['style'] });
    document.addEventListener('focusin', e => { if (e.target.matches('input,textarea,select,[contenteditable]') && !e.target.closest('#feed-compose.bc-open')) { typing = true; syncFab(); } });
    document.addEventListener('focusout', () => { typing = false; setTimeout(syncFab, 150); });
    window.addEventListener('scroll', () => fab.classList.toggle('is-compact', scrollY > 60), { passive: true });
    setInterval(syncFab, 1500); // cheap safety net for pages that toggle the button some other way
    syncFab();

    fab.addEventListener('click', () => {
      if (!loggedIn()) return openSignIn({ title: cfg.gate[0], body: cfg.gate[1] });
      if (composer) return openComposer(composer);
      src.click();
    });
  }

  // /feed/ composer as a bottom sheet (phones only — CSS keeps it inline on desktop)
  function openComposer(composer) {
    if (composer.classList.contains('bc-open')) return;
    if (!composer.querySelector('.bc-compose-head')) {
      const head = document.createElement('div');
      head.className = 'bc-compose-head';
      head.innerHTML = '<span>New post</span><button type="button" aria-label="Close">×</button>';
      composer.prepend(head);
      head.querySelector('button').addEventListener('click', closeComposer);
      const post = composer.querySelector('#feed-post-btn');
      if (post) post.addEventListener('click', () => {
        let tries = 0;
        const t = setInterval(() => { const ta = composer.querySelector('#feed-post-input'); if ((ta && !ta.value.trim()) || ++tries > 12) { clearInterval(t); if (ta && !ta.value.trim()) closeComposer(); } }, 400);
      });
    }
    const back = document.createElement('div');
    back.className = 'bc-backdrop';
    back.id = 'bc-compose-backdrop';
    back.addEventListener('click', closeComposer);
    document.body.appendChild(back);
    // Park a marker where the composer lives, then move it to <body>: inside .feed-main it sits under a transformed
    // ancestor, which breaks position:fixed and traps its z-index below the backdrop.
    composerHome = document.createComment('bc-compose-home');
    composer.before(composerHome);
    document.body.appendChild(composer);
    composer.classList.add('bc-open');
    syncFab();
    composer.querySelector('#feed-post-input')?.focus();
  }
  let composerHome = null;
  function closeComposer() {
    document.getElementById('bc-compose-backdrop')?.remove();
    const c = document.getElementById('feed-compose');
    if (c) c.classList.remove('bc-open');
    if (c && composerHome && composerHome.parentNode) { composerHome.replaceWith(c); }
    composerHome = null;
    syncFab();
  }

  // Logged-out: the feed renders greyed-out (disabled) like/react/save buttons that swallow taps. Keep them looking
  // inactive, but let the tap through to a friendly sign-in sheet.
  function gateFeedActions() {
    if (!path.startsWith('/feed') || loggedIn()) return;
    const SEL = '.feed-action-btn[disabled], .fp-rx-chip[disabled], [data-react-toggle][disabled], [data-like-post][disabled], [data-bookmark-post][disabled]';
    const arm = () => document.querySelectorAll(SEL).forEach(b => { b.removeAttribute('disabled'); b.setAttribute('aria-disabled', 'true'); b.dataset.bcGated = '1'; b.classList.add('bc-gated'); });
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(arm, 80); }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(arm, 1000); // backup in case a page swaps its whole <body>
    arm();
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-bc-gated]');
      if (!b) return;
      e.preventDefault(); e.stopImmediatePropagation();
      openSignIn({ title: 'Sign in to join in', body: 'Like, react, comment and follow other pirates \u2014 free with Discord.' });
    }, true);
  }

  // ---------------------------------------------------------------- go
  function init() { setupFab(); gateFeedActions(); scheduleNudge(); mobile.addEventListener?.('change', () => { if (!mobile.matches) closeComposer(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
