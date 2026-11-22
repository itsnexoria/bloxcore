// Ad-consent gate. Ads are the only third-party tracking on the site, so they load only after consent where
// the law expects it. Region is a best guess from the browser time zone (no IP lookup, no extra request):
// Europe/* zones plus a few EU/EEA/UK islands. Set window.BC_CONSENT_ALL = true before this loads to ask everyone.
// Exposes window.bcConsent = { required, status(), whenGranted(cb), open() }.
(function () {
  if (window.bcConsent) return;
  var KEY = 'bc_consent';
  var VERSION = 1;
  var tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
  var gpc = !!(navigator.globalPrivacyControl);
  var inRegion = /^Europe\//.test(tz) || /^Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)$/.test(tz) || tz === 'Africa/Ceuta';
  var required = !!window.BC_CONSENT_ALL || inRegion || gpc;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && v.v === VERSION && (v.ads === 'granted' || v.ads === 'denied') ? v.ads : null;
    } catch (e) { return null; }
  }
  function write(val) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ads: val, t: Date.now() })); } catch (e) { /* ignore */ }
  }
  function status() { return !required ? 'granted' : (gpc ? 'denied' : (read() || 'unset')); }

  var waiters = [];
  function flush() {
    if (status() !== 'granted') return;
    var cbs = waiters.splice(0);
    cbs.forEach(function (cb) { try { cb(); } catch (e) { /* ignore */ } });
  }
  function whenGranted(cb) { waiters.push(cb); flush(); }

  var bar = null;
  function close() { if (bar) { bar.remove(); bar = null; } }
  function choose(val) {
    write(val);
    close();
    if (val === 'granted') flush();
    else {
      // Withdrawing consent: stop any already-injected ad script from running further.
      document.querySelectorAll('script[data-bc-ad]').forEach(function (s) { s.remove(); });
    }
  }

  function css() {
    if (document.getElementById('bc-consent-css')) return;
    var st = document.createElement('style');
    st.id = 'bc-consent-css';
    st.textContent =
      '.bc-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:5000;max-width:620px;margin:0 auto;' +
      'background:var(--navy,#16161f);color:var(--bone,#f5f5f7);border:1px solid var(--navy-light,#2b2b38);' +
      'border-radius:14px;padding:14px 16px;box-shadow:0 10px 40px rgb(0 0 0 / .5);font-size:.86rem;line-height:1.5}' +
      '.bc-consent p{margin:0 0 10px;color:var(--ash,#9a9aa8)}.bc-consent a{color:var(--brass-bright,#60a5fa)}' +
      '.bc-consent-row{display:flex;gap:8px;flex-wrap:wrap}' +
      '.bc-consent button{cursor:pointer;border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;border:1px solid var(--navy-light,#2b2b38);' +
      'background:transparent;color:inherit}.bc-consent button.is-primary{background:var(--brass,#2563eb);border-color:var(--brass,#2563eb);color:#fff}';
    document.head.appendChild(st);
  }

  function open() {
    if (bar) return;
    css();
    bar = document.createElement('div');
    bar.className = 'bc-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Ad choices');
    bar.innerHTML =
      '<p>BloxCore is free thanks to ads. Our ad partner may use cookies or similar technology on your device. ' +
      'Allow ads? You can change this any time from "Ad choices" in the footer. <a href="/privacy/">Privacy policy</a></p>' +
      '<div class="bc-consent-row"><button type="button" class="is-primary" data-c="granted">Allow ads</button>' +
      '<button type="button" data-c="denied">No thanks</button></div>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-c]');
      if (b) choose(b.getAttribute('data-c'));
    });
    document.body.appendChild(bar);
  }

  function footerLink() {
    if (!required) return;
    var f = document.querySelector('footer.site-footer');
    if (!f || f.querySelector('[data-bc-ad-choices]')) return;
    var a = document.createElement('a');
    a.href = '#ad-choices';
    a.setAttribute('data-bc-ad-choices', '');
    a.textContent = 'Ad choices';
    a.style.cssText = 'display:block;text-align:center;font-size:.78rem;margin-top:10px;color:var(--ash,#9a9aa8)';
    a.addEventListener('click', function (e) { e.preventDefault(); open(); });
    (f.querySelector('.container') || f).appendChild(a);
  }

  window.bcConsent = { required: required, status: status, whenGranted: whenGranted, open: open };

  function init() {
    footerLink();
    if (required && status() === 'unset') open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
