// BloxCore — /trader/?u=<username>: public trader reputation (verified trades, completion rate, vouches).
// Data: get_trader_profile() + get_confirmed_trades(); everything shown is already public on the player page.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function level(p) {
    const n = p.confirmed_trades;
    if (p.vouches_down > p.vouches_up && p.vouches_down >= 2) return { label: 'Mixed feedback', tone: 'warn', hint: 'More negative than positive vouches — trade carefully.' };
    if (n >= 15) return { label: 'Veteran trader', tone: 'gold', hint: `${n} trades confirmed by the other side.` };
    if (n >= 5) return { label: 'Established trader', tone: 'ok', hint: `${n} trades confirmed by the other side.` };
    if (n >= 1) return { label: 'Building a record', tone: 'neutral', hint: `${n} confirmed ${n === 1 ? 'trade' : 'trades'} so far.` };
    return { label: 'No verified trades yet', tone: 'neutral', hint: 'A trade counts once both players confirm it.' };
  }

  function rate(p) { return p.decided_trades ? Math.round((p.confirmed_trades / p.decided_trades) * 100) : null; }

  function tile(icon, value, label, sub) {
    return `<div class="tr-tile"><i data-lucide="${icon}" class="icon-sm"></i><strong>${value}</strong><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }

  async function renderTrades(p) {
    const { data: rows } = await sb.rpc('get_confirmed_trades', { p_user_id: p.id, p_limit: 10 });
    if (!rows || !rows.length) return '';
    const ids = new Set();
    rows.forEach(r => [...(r.gave || []), ...(r.got || [])].forEach(e => ids.add(e.id)));
    const { data: items } = await sb.from('bf_items').select('id, name').in('id', [...ids]);
    const byId = new Map((items || []).map(i => [i.id, i.name]));
    const label = (entries) => (entries || []).map(e => escapeHtml(byId.get(e.id) || 'Unknown item')).join(', ') || '—';
    return `<section class="tr-section"><h2>Recent verified trades</h2>${rows.map(r => `
      <div class="tr-row">
        ${avatarHtml({ username: r.partner_username, display_name: r.partner_display_name, avatar_url: r.partner_avatar_url }, 34)}
        <div class="tr-row-main"><p><span class="tr-gave">${label(r.gave)}</span> <span class="muted">for</span> <span class="tr-got">${label(r.got)}</span></p>
          <small>with <a href="/trader/?u=${encodeURIComponent(r.partner_username || '')}">${escapeHtml(r.partner_display_name || r.partner_username || 'a player')}</a> · ${timeAgo(r.confirmed_at)}</small></div>
        <i data-lucide="badge-check" class="icon-sm tr-check"></i>
      </div>`).join('')}</section>`;
  }

  function renderVouches(p) {
    const list = p.recent_vouches || [];
    return `<section class="tr-section"><h2>Vouches</h2>${list.length ? list.map(v => `
      <div class="tr-row">
        ${avatarHtml({ username: v.voucher_username, display_name: v.voucher_display_name, avatar_url: v.voucher_avatar_url }, 34)}
        <div class="tr-row-main"><p><a href="/trader/?u=${encodeURIComponent(v.voucher_username || '')}" class="tr-name">${escapeHtml(v.voucher_display_name || v.voucher_username || 'Someone')}</a> ${v.comment ? `<span class="tr-comment">“${escapeHtml(v.comment)}”</span>` : ''}</p><small>${timeAgo(v.created_at)}</small></div>
        <i data-lucide="${v.direction === 1 ? 'thumbs-up' : 'thumbs-down'}" class="icon-sm ${v.direction === 1 ? 'tr-up' : 'tr-down'}"></i>
      </div>`).join('') : '<p class="muted" style="margin:0;">No vouches yet. Players can vouch after a confirmed trade together.</p>'}</section>`;
  }

  async function init() {
    const u = new URLSearchParams(location.search).get('u');
    const root = $('tr-root');
    if (!u) { root.innerHTML = '<div class="empty-state">Pick a player: <a href="/leaderboard/">find traders on the leaderboard</a>.</div>'; return; }
    const { data: p, error } = await sb.rpc('get_trader_profile', { p_username: u });
    if (error) { root.innerHTML = '<div class="empty-state">Couldn\'t load this trader right now.</div>'; return; }
    if (!p) { root.innerHTML = '<div class="empty-state">No trader with that username.</div>'; return; }
    if (p.private) { root.innerHTML = `<div class="empty-state">@${escapeHtml(p.username)} keeps their profile private.</div>`; return; }

    const lv = level(p); const r = rate(p); const name = p.display_name || p.username;
    document.title = `${name} — Trader profile — BloxCore`;
    root.innerHTML = `
      <header class="tr-head">
        ${avatarHtml(p, 72)}
        <div class="tr-head-main">
          <h1>${escapeHtml(name)} ${p.roblox_verified ? '<i data-lucide="badge-check" class="icon-sm tr-check" title="Roblox account verified"></i>' : ''}</h1>
          <p class="muted">@${escapeHtml(p.username)} · member since ${new Date(p.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
          <span class="tr-level tr-${lv.tone}">${lv.label}</span> <span class="tr-level-hint">${lv.hint}</span>
        </div>
        <div class="tr-head-actions">
          <a href="/player/?u=${encodeURIComponent(p.username)}" class="btn btn-ghost btn-sm">Profile</a>
          <button type="button" class="btn btn-ghost btn-sm" id="tr-share"><i data-lucide="link" class="icon-sm icon-inline"></i>Share</button>
        </div>
      </header>
      <div class="tr-tiles">
        ${tile('badge-check', p.confirmed_trades, 'Verified trades', p.unique_partners ? `${p.unique_partners} different ${p.unique_partners === 1 ? 'partner' : 'partners'}` : '')}
        ${tile('percent', r === null ? '—' : r + '%', 'Completion rate', p.decided_trades ? `${p.confirmed_trades} of ${p.decided_trades} settled` : 'no settled trades yet')}
        ${tile('thumbs-up', `${p.vouches_up}<em>/${p.vouches_down}</em>`, 'Vouches', 'positive / negative')}
        ${tile('repeat', p.active_listings, 'Active listings', `<a href="/trading/">open trading</a>`)}
      </div>
      ${renderVouches(p)}
      <div id="tr-trades"></div>`;
    $('tr-share').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); showToast('Link copied.'); } catch { showToast(location.href); }
    });
    refreshIcons();
    const html = await renderTrades(p);
    if (html) { $('tr-trades').innerHTML = html; refreshIcons(); }
  }

  onReady(init);
})();
