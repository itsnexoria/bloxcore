// Tiny redirect helper so legacy pages need no inline <script> (keeps the CSP strict).
// <script src="/js/redirect.js" data-to="/x/" [data-keep="search,hash"] [data-forward="u"]></script>
(function () {
  var s = document.currentScript;
  if (!s) return;
  var to = s.getAttribute('data-to') || '/';
  var keep = (s.getAttribute('data-keep') || '').split(',');
  var fwd = (s.getAttribute('data-forward') || '').split(',').filter(Boolean);
  var q = new URLSearchParams(location.search);
  fwd.forEach(function (k) {
    if (q.get(k)) to += (to.indexOf('?') < 0 ? '?' : '&') + k + '=' + encodeURIComponent(q.get(k));
  });
  if (keep.indexOf('search') >= 0) to += location.search;
  if (keep.indexOf('hash') >= 0) to += location.hash;
  location.replace(to);
})();
