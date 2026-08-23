// BloxCore — global animation engine (v3)
// Auto-applies scroll reveal, staggered entrances, magnetic buttons, number
// counters, a soft page transition, and light card/image parallax across
// every page. Everything opts out cleanly when the user has Reduce Motion
// enabled (html.reduce-motion, set from Settings) or the OS-level
// prefers-reduced-motion is on — in both cases we just show the end state.
(function () {
  'use strict';

  var reduceMotion = document.documentElement.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var isTouch = matchMedia('(pointer: coarse)').matches;

  document.documentElement.classList.add('page-ready');

  // Skip anything inside these — they manage their own visibility already
  // (nav drawers, modals, toasts) and re-tagging them causes flicker/mis-fires.
  var SKIP_SELECTOR = '.nav-drawer, .drawer, .modal, dialog, .toast, [aria-hidden="true"]';

  function inSkippedRegion(el) {
    return !!el.closest(SKIP_SELECTOR);
  }

  /* ------------------------------ Scroll reveal ------------------------------ */
  // Note: nav.js already runs its own reveal-on-scroll + cursor-spotlight system
  // for `.panel`/`.poster` (see the .js-reveal rules in style.css) — this only
  // covers `.stat-tile` stat blocks, which that system doesn't touch, so the
  // two never fight over the same element.
  function initReveal() {
    var main = document.querySelector('main');
    if (!main) return;

    var candidates = main.querySelectorAll('.stat-tile');

    candidates.forEach(function (el) {
      if (inSkippedRegion(el) || el.classList.contains('no-reveal') || el.dataset.revealed) return;
      el.dataset.revealed = '1';
      el.classList.add('reveal');
    });

    // Stagger: index within each parent, capped so long lists don't take
    // forever to finish revealing.
    var parents = new Set();
    candidates.forEach(function (el) { if (el.classList.contains('reveal')) parents.add(el.parentElement); });
    parents.forEach(function (parent) {
      var i = 0;
      Array.prototype.forEach.call(parent.children, function (child) {
        if (child.classList && child.classList.contains('reveal')) {
          child.style.setProperty('--reveal-i', Math.min(i, 8));
          i++;
        }
      });
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      candidates.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    candidates.forEach(function (el) { io.observe(el); });
  }

  /* Magnetic button cursor-pull effect was removed site-wide — it caused persistent
     jitter/glitching on buttons (especially nested inside .panel cards) that wasn't
     worth chasing further. initMagnetic() and its call sites below are gone; buttons
     now just use their plain CSS :hover states. */

  /* ------------------------------- Number counters ---------------------------- */
  function parseNumber(raw) {
    var s = raw.trim();
    var mult = 1;
    if (/[km]$/i.test(s)) {
      mult = /k$/i.test(s) ? 1000 : 1000000;
      s = s.slice(0, -1);
    }
    var n = parseFloat(s.replace(/,/g, ''));
    return isNaN(n) ? null : n * mult;
  }

  function formatLike(original, value) {
    if (/[km]$/i.test(original.trim())) {
      var isM = /m$/i.test(original.trim());
      var v = value / (isM ? 1000000 : 1000);
      return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + (isM ? 'M' : 'K');
    }
    return Math.round(value).toLocaleString();
  }

  function initCounters() {
    var nums = document.querySelectorAll('.stat-number');
    if (!nums.length) return;

    function animate(el) {
      var original = el.textContent;
      var target = parseNumber(original);
      if (target === null || el.dataset.counted) return;
      el.dataset.counted = '1';
      if (reduceMotion) return; // leave the final value as-is
      var start = performance.now();
      var duration = 900;
      function tick(now) {
        var p = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = formatLike(original, target * eased);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = original;
      }
      requestAnimationFrame(tick);
    }

    if (!('IntersectionObserver' in window)) { nums.forEach(animate); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { animate(entry.target); io.unobserve(entry.target); }
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* -------------------------------- Page transition ---------------------------- */
  function initPageTransition() {
    if (reduceMotion) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a || !a.href) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.href.indexOf('#') === 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var url;
      try { url = new URL(a.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page/anchor
      e.preventDefault();
      document.body.classList.add('page-leaving');
      setTimeout(function () { location.href = a.href; }, 180);
    });
  }

  /* ---------------------------------- Parallax ---------------------------------- */
  function initParallax() {
    if (reduceMotion || isTouch) return;
    // Note: #hero-poster already has its own mousemove tilt effect (nav.js) —
    // deliberately excluded here so the two transforms don't fight.
    var els = document.querySelectorAll('[data-parallax]:not(#hero-poster)');
    if (!els.length) return;
    var ticking = false;
    function update() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var center = rect.top + rect.height / 2 - vh / 2;
        var speed = parseFloat(el.dataset.parallax) || 0.06;
        el.style.transform = 'translateY(' + (center * -speed).toFixed(1) + 'px)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  function boot() {
    initReveal();
    initCounters();
    initPageTransition();
    initParallax();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Content that loads async (challenges list, leaderboard rows, etc.) is
  // rendered by each page's own script after a fetch — re-run the
  // lightweight parts on a short delay so late-arriving cards/counters still
  // get the treatment without every page having to call this itself.
  setTimeout(function () { initReveal(); initCounters(); }, 900);
})();
