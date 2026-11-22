// BloxCore — anonymous live-visitor + visit-count tracking (feeds the Traffic card on /admin/overview/).
// Standalone copy of the tracker so it can be loaded without editing supabase-client.js. Needs the global `sb`.
// Anonymous random id in localStorage; page view on load + a heartbeat every 45 s while the tab is visible.
// No IP, no query string. Skipped for /admin, bots, webdrivers and Do-Not-Track. The database ignores
// duplicate calls (3 s per-visitor page-view throttle, 20 s heartbeat throttle), so running next to another copy is harmless.
if (!window.__bcTraffic) {
  window.__bcTraffic = true;
  if (typeof sb !== 'undefined') (function trackVisit() {
  try {
    const path = location.pathname;
    if (path.startsWith('/admin') || navigator.webdriver || navigator.doNotTrack === '1') return;
    if (/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i.test(navigator.userAgent)) return;
    let vid = localStorage.getItem('bc_vid');
    if (!vid || !/^[0-9a-f-]{36}$/i.test(vid)) {
      vid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
      localStorage.setItem('bc_vid', vid);
    }
    const send = (fn) => sb.rpc(fn, { p_visitor: vid, p_path: path }).then(() => {}, () => {});
    const start = () => {
      send('track_pageview');
      setInterval(() => { if (!document.hidden) send('track_heartbeat'); }, 45000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) send('track_heartbeat'); });
    };
    if (document.hidden) document.addEventListener('visibilitychange', function once() { if (document.hidden) return; document.removeEventListener('visibilitychange', once); start(); });
    else start();
  } catch (e) { /* tracking must never break a page */ }
})();
}
