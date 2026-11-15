// "Giveaways running now" strip for the SEO pages (any element with [data-giveaway-strip]).
// Public read of active giveaways + entry counts; hides itself when nothing is running. Logged-out visitors get the
// one-tap Discord sign-in sheet (js/engage.js) instead of a dead-end redirect — this strip exists to turn
// search visitors into signups.
(function () {
  const boxes = document.querySelectorAll('[data-giveaway-strip]');
  if (!boxes.length || typeof sb === 'undefined') return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const loggedIn = () => { try { return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)); } catch (e) { return false; } };

  function endsIn(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Ending now';
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return d >= 1 ? `Ends in ${d}d ${h % 24}h` : h >= 1 ? `Ends in ${h}h ${m % 60}m` : `Ends in ${m}m`;
  }

  async function load() {
    const { data: gs } = await sb.from('giveaways').select('id, title, prize, image_url, ends_at, winner_count')
      .eq('status', 'active').gt('ends_at', new Date().toISOString()).order('ends_at', { ascending: true }).limit(3);
    if (!gs || !gs.length) return;
    const counts = await Promise.all(gs.map((g) => sb.from('giveaway_entries').select('id', { count: 'exact', head: true }).eq('giveaway_id', g.id).then((r) => r.count || 0, () => 0)));
    const cards = gs.map((g, i) => `
      <a class="seo-gw-card" href="/giveaways/" data-gw>
        ${g.image_url ? `<img src="${esc(g.image_url)}" alt="" width="44" height="44" loading="lazy" decoding="async">` : '<span class="seo-gw-noimg" aria-hidden="true">🎁</span>'}
        <span class="seo-gw-body"><b>${esc(g.title)}</b><small>${esc(endsIn(g.ends_at))} · ${counts[i]} entered</small></span>
        <span class="seo-gw-cta">Enter</span>
      </a>`).join('');
    boxes.forEach((box) => {
      box.innerHTML = `<div class="seo-gw-head"><b>🎁 Giveaways running now</b><a href="/giveaways/">See all</a></div><div class="seo-gw-list">${cards}</div><p class="seo-gw-foot">Free to enter with a BloxCore account — sign in with Discord in one tap.</p>`;
      box.hidden = false;
      box.querySelectorAll('[data-gw]').forEach((a) => a.addEventListener('click', (e) => {
        if (loggedIn() || typeof window.bcSignInPrompt !== 'function') return; // logged in (or no sheet): normal link
        e.preventDefault();
        window.bcSignInPrompt({ title: 'Enter this giveaway', body: 'Create a free BloxCore account with Discord to enter — it takes about 10 seconds.' });
      }));
    });
  }
  load().catch(() => {});
})();
