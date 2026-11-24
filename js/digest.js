// BloxCore — /digest/: auto-generated weekly digest (value risers/drops, top posts, activity) from get_weekly_digest().
// Always current — it covers "the last 7 days" — and comes with ready-to-paste text for X and Discord.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const slug = (name) => String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const pct = (n) => `${n > 0 ? '+' : ''}${Number(n).toFixed(Math.abs(n) >= 10 ? 0 : 1)}%`;
  const SITE = 'https://bloxcores.com/digest/';

  function shareText(d, forDiscord) {
    const range = `${fmtDate(d.since)}–${fmtDate(d.until)}`;
    const mov = (rows) => rows.slice(0, 3).map(r => `${r.name} ${pct(r.pct)}`).join(', ');
    const lines = [forDiscord ? `**BloxCore weekly digest · ${range}**` : `BloxCore weekly digest (${range})`];
    if (d.risers.length) lines.push(`📈 Up: ${mov(d.risers)}`);
    if (d.drops.length) lines.push(`📉 Down: ${mov(d.drops)}`);
    if (d.confirmed_trades) lines.push(`🤝 ${d.confirmed_trades} verified ${d.confirmed_trades === 1 ? 'trade' : 'trades'}, ${d.new_listings} new listings`);
    lines.push(SITE);
    return lines.join('\n');
  }

  const moverRow = (r, up) => `<a href="/blox-fruits-values/${slug(r.name)}/" class="dg-row">
      ${r.icon_url ? `<img src="${safeImgUrl(r.icon_url)}" alt="" width="36" height="36" loading="lazy" class="dg-icon">` : '<span class="dg-icon dg-icon-ph"></span>'}
      <span class="dg-row-main"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.category || '')} · ${formatValue(r.old_value)} → ${formatValue(r.new_value)}</small></span>
      <span class="dg-pct ${up ? 'is-up' : 'is-down'}">${pct(r.pct)}</span></a>`;

  function render(d) {
    const t = (icon, n, label) => `<div class="dg-tile"><i data-lucide="${icon}" class="icon-sm"></i><strong>${n}</strong><span>${label}</span></div>`;
    $('dg-root').innerHTML = `
      <header class="dg-head">
        <div><span class="dg-kicker">Weekly digest</span><h1>${fmtDate(d.since)} – ${fmtDate(d.until)}</h1>
          <p class="muted">What moved in Blox Fruits trading this week, plus what the community was talking about.</p></div>
        <div class="dg-share">
          <a class="btn btn-primary btn-sm" id="dg-x" target="_blank" rel="noopener noreferrer"><i data-lucide="share-2" class="icon-sm icon-inline"></i>Post on X</a>
          <button type="button" class="btn btn-ghost btn-sm" id="dg-discord"><i data-lucide="clipboard-copy" class="icon-sm icon-inline"></i>Copy for Discord</button>
        </div>
      </header>
      <div class="dg-tiles">${t('user-plus', d.new_members, 'New members')}${t('message-square', d.posts, 'Feed posts')}${t('badge-check', d.confirmed_trades, 'Verified trades')}${t('repeat', d.new_listings, 'New listings')}</div>
      <div class="dg-cols">
        <section><h2 class="dg-up"><i data-lucide="trending-up" class="icon-sm"></i>Biggest risers</h2>${d.risers.length ? d.risers.map(r => moverRow(r, true)).join('') : '<p class="muted">No risers this week.</p>'}</section>
        <section><h2 class="dg-down"><i data-lucide="trending-down" class="icon-sm"></i>Biggest drops</h2>${d.drops.length ? d.drops.map(r => moverRow(r, false)).join('') : '<p class="muted">No drops this week.</p>'}</section>
      </div>
      <section class="dg-posts"><h2><i data-lucide="flame" class="icon-sm"></i>Top posts</h2>${d.top_posts.length ? d.top_posts.map(p => `
        <a href="/feed/?post=${p.id}" class="dg-post"><p>${escapeHtml(p.content)}</p><small>${escapeHtml(p.display_name || p.username)} · ${p.likes} ${p.likes === 1 ? 'like' : 'likes'} · ${p.comments} ${p.comments === 1 ? 'comment' : 'comments'}</small></a>`).join('') : '<p class="muted">No posts yet this week — <a href="/feed/">start one</a>.</p>'}</section>
      <p class="muted dg-foot">Values are community-set, not official prices. Full log: <a href="/value-changes/">value changes</a> · <a href="/trading/">trading board</a>.</p>`;
    $('dg-x').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(d, false));
    $('dg-discord').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(shareText(d, true)); showToast('Copied — paste it into Discord.'); } catch { showToast('Couldn\'t copy automatically.', true); }
    });
    refreshIcons();
  }

  onReady(async () => {
    const { data, error } = await sb.rpc('get_weekly_digest');
    if (error || !data) { $('dg-root').innerHTML = '<div class="empty-state">Couldn\'t load the digest right now.</div>'; return; }
    render(data);
  });
})();
