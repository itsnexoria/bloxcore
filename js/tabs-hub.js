// BloxCore — generic tab hub used by /trading/, /build/ and /whats-new/.
// Markup contract:
//   <div class="hub-tabs" role="tablist" data-hub-default="board">
//     <button class="hub-tab" role="tab" data-hub-tab="board" data-title="…">…</button> …
//   </div>
//   <div data-hub-panel="board">…</div> <div data-hub-panel="calculator" hidden>…</div>
// A tool script registers a lazy initialiser with `window.hubInit.<tab> = async () => {…}`; it runs once, the first time
// its tab is shown (the default tab included). The active tab lives in `?tab=`; other query params belong to the tool.
// Optional segmented controls inside a panel: [data-seg-group] > [data-seg-btn] / [data-seg-panel].

window.hubInit = window.hubInit || {};

(function () {
  const bar = document.querySelector('.hub-tabs');
  if (!bar) return;
  const tabs = [...bar.querySelectorAll('[data-hub-tab]')];
  const panels = new Map([...document.querySelectorAll('[data-hub-panel]')].map(p => [p.dataset.hubPanel, p]));
  const inited = new Set();
  const names = tabs.map(t => t.dataset.hubTab);
  const fallback = bar.dataset.hubDefault || names[0];
  const baseTitle = document.title;

  function tabFromLocation() {
    const q = new URLSearchParams(location.search).get('tab');
    if (q && names.includes(q)) return q;
    if (['#offers', '#confirmations'].includes(location.hash) && names.includes('board')) return 'board';
    return fallback;
  }

  async function show(name, { fromClick = false } = {}) {
    if (!names.includes(name)) name = fallback;
    tabs.forEach(t => {
      const on = t.dataset.hubTab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p, key) => { p.hidden = key !== name; });
    const active = tabs.find(t => t.dataset.hubTab === name);
    if (active?.dataset.title) document.title = active.dataset.title; else document.title = baseTitle;
    if (fromClick) {
      const url = new URL(location.href);
      url.search = name === fallback ? '' : `?tab=${name}`;
      url.hash = '';
      history.replaceState(null, '', url);
    }
    if (!inited.has(name)) {
      inited.add(name);
      const init = window.hubInit[name];
      if (typeof init === 'function') { try { await init(); } catch (e) { if (typeof logError === 'function') logError(`tab "${name}" failed to start:`, e); } }
    }
    if (typeof refreshIcons === 'function') refreshIcons();
    window.dispatchEvent(new CustomEvent('hub:tab', { detail: { tab: name } }));
  }

  tabs.forEach(t => {
    t.addEventListener('click', () => show(t.dataset.hubTab, { fromClick: true }));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = tabs[(i + tabs.length) % tabs.length];
      next.focus(); show(next.dataset.hubTab, { fromClick: true });
    });
  });
  window.hubShow = show;

  // segmented controls (e.g. Values → Recent changes | Price history)
  document.querySelectorAll('[data-seg-group]').forEach(group => {
    const name = group.dataset.segGroup;
    const btns = [...group.querySelectorAll('[data-seg-btn]')];
    const segPanels = [...document.querySelectorAll(`[data-seg-panel-group="${name}"]`)];
    const showSeg = (seg) => {
      btns.forEach(b => { const on = b.dataset.segBtn === seg; b.classList.toggle('btn-primary', on); b.classList.toggle('btn-ghost', !on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      segPanels.forEach(p => { p.hidden = p.dataset.segPanel !== seg; });
      window.dispatchEvent(new CustomEvent('hub:seg', { detail: { group: name, seg } }));
    };
    btns.forEach(b => b.addEventListener('click', () => showSeg(b.dataset.segBtn)));
  });

  const start = () => show(tabFromLocation());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('popstate', () => show(tabFromLocation()));
})();
