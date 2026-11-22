// BloxCore — /search/: full-page search across players, crews, items, posts, bounties and giveaways.
// Same sources/RLS as the Ctrl+K search modal (js/search.js), with room for more results and tabs.
(function () {
  'use strict';
  const MIN_CHARS = 2;
  const PER_SOURCE = 30;
  const PREVIEW = 5;
  const TABS = [['all', 'All'], ['players', 'Players'], ['crews', 'Crews'], ['items', 'Items'], ['posts', 'Posts'], ['bounties', 'Bounties'], ['giveaways', 'Giveaways']];
  let tab = 'all';
  let data = null;
  let query = '';
  let seq = 0;
  const $ = (id) => document.getElementById(id);
  const slug = (name) => String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const highlight = (text, q) => {
    const safe = escapeHtml(text || '');
    if (!q) return safe;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  };

  async function search(q) {
    const esc = q.replace(/[%_\\]/g, '\\$&').replace(/[,()]/g, ' ');
    const like = `%${esc}%`;
    const [players, crews, items, posts, bounties, giveaways] = await Promise.all([
      sb.from('profiles').select('username, display_name, avatar_url, avatar_frame').eq('profile_visibility', 'public').or(`username.ilike.${like},display_name.ilike.${like}`).limit(PER_SOURCE),
      sb.from('crews').select('id, name, tag, logo_url, description').or(`name.ilike.${like},tag.ilike.${like}`).limit(PER_SOURCE),
      sb.from('bf_items').select('id, name, category, rarity').ilike('name', like).limit(PER_SOURCE),
      sb.from('feed_posts').select('id, content, created_at, user_id').ilike('content', like).order('created_at', { ascending: false }).limit(PER_SOURCE),
      sb.from('challenges').select('id, title, difficulty').eq('active', true).ilike('title', like).limit(PER_SOURCE),
      sb.from('giveaways').select('id, title, prize').eq('status', 'active').or(`title.ilike.${like},prize.ilike.${like}`).limit(PER_SOURCE),
    ]);
    const failed = [players, crews, items, posts, bounties, giveaways].every(r => r.error);
    if (failed) throw new Error('search failed');

    // Posts need their authors; fetch them in one extra query.
    const postRows = posts.data || [];
    const authorIds = [...new Set(postRows.map(p => p.user_id))];
    const authors = new Map();
    if (authorIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, username, display_name, avatar_url, avatar_frame').in('id', authorIds);
      (profs || []).forEach(p => authors.set(p.id, p));
    }
    return {
      players: (players.data || []).map(p => ({ href: `/player/?u=${encodeURIComponent(p.username)}`, lead: avatarHtml(p, 36), title: displayNameFor(p), sub: `@${p.username}` })),
      crews: (crews.data || []).map(c => ({ href: `/crew/?name=${encodeURIComponent(c.name)}`, lead: c.logo_url ? `<img src="${safeImgUrl(c.logo_url)}" alt="" class="sp-logo">` : '<span class="sp-icon"><i data-lucide="shield" class="icon-sm"></i></span>', title: c.name, sub: [c.tag, c.description].filter(Boolean).join(' · ') })),
      items: (items.data || []).map(i => ({ href: `/blox-fruits-values/${slug(i.name)}/`, lead: '<span class="sp-icon"><i data-lucide="gem" class="icon-sm"></i></span>', title: i.name, sub: [i.category, i.rarity].filter(Boolean).join(' · ') })),
      posts: postRows.map(p => { const a = authors.get(p.user_id) || {}; return { href: `/feed/#post-${p.id}`, lead: avatarHtml(a, 36), title: (p.content || '').slice(0, 140), sub: `${displayNameFor(a)} · ${timeAgo(p.created_at)}` }; }),
      bounties: (bounties.data || []).map(c => ({ href: '/challenges/', lead: '<span class="sp-icon"><i data-lucide="target" class="icon-sm"></i></span>', title: c.title, sub: c.difficulty })),
      giveaways: (giveaways.data || []).map(g => ({ href: '/giveaways/', lead: '<span class="sp-icon"><i data-lucide="gift" class="icon-sm"></i></span>', title: g.title, sub: g.prize })),
    };
  }

  const row = (r) => `<a href="${r.href}" class="sp-row">${r.lead}<span class="sp-text"><strong>${highlight(r.title, query)}</strong>${r.sub ? `<small>${highlight(r.sub, query)}</small>` : ''}</span><i data-lucide="chevron-right" class="icon-sm sp-go"></i></a>`;

  function renderTabs() {
    $('sp-tabs').innerHTML = TABS.map(([k, label]) => {
      const n = k === 'all' ? Object.values(data || {}).reduce((a, g) => a + g.length, 0) : (data?.[k]?.length || 0);
      return `<button type="button" class="sp-tab${tab === k ? ' is-on' : ''}" role="tab" aria-selected="${tab === k}" data-tab="${k}">${label}${data && n ? `<span>${n >= PER_SOURCE && k !== 'all' ? PER_SOURCE + '+' : n}</span>` : ''}</button>`;
    }).join('');
    $('sp-tabs').querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; syncUrl(); render(); }));
  }

  function render() {
    renderTabs();
    const out = $('sp-results');
    if (!data) { out.innerHTML = `<p class="muted">Type at least ${MIN_CHARS} characters to search.</p>`; return; }
    const groups = TABS.filter(([k]) => k !== 'all' && (tab === 'all' || tab === k) && data[k].length);
    if (!groups.length) { out.innerHTML = `<div class="empty-state">No results for “${escapeHtml(query)}”.<br><span class="muted">Try a shorter or different word.</span></div>`; return; }
    out.innerHTML = groups.map(([k, label]) => {
      const rows = tab === 'all' ? data[k].slice(0, PREVIEW) : data[k];
      return `<section class="sp-group"><h2>${label}${tab === 'all' && data[k].length > PREVIEW ? `<button type="button" class="sp-more" data-tab="${k}">See all ${data[k].length >= PER_SOURCE ? PER_SOURCE + '+' : data[k].length} →</button>` : ''}</h2>${rows.map(row).join('')}</section>`;
    }).join('');
    out.querySelectorAll('.sp-more').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; syncUrl(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    refreshIcons();
  }

  function syncUrl() {
    const u = new URL(location.href);
    if (query) u.searchParams.set('q', query); else u.searchParams.delete('q');
    if (tab !== 'all') u.searchParams.set('tab', tab); else u.searchParams.delete('tab');
    history.replaceState(null, '', u);
  }

  async function run(q) {
    query = q.trim();
    if (query.length < MIN_CHARS) { data = null; seq++; syncUrl(); render(); return; }
    const mine = ++seq;
    $('sp-results').innerHTML = '<div class="skeleton" style="height:56px;"></div><div class="skeleton" style="height:56px; margin-top:8px;"></div><div class="skeleton" style="height:56px; margin-top:8px;"></div>';
    try {
      const result = await search(query);
      if (mine !== seq) return;
      data = result;
    } catch (e) {
      if (mine !== seq) return;
      $('sp-results').innerHTML = '<div class="empty-state">Search is having trouble right now — try again in a moment.</div>';
      return;
    }
    document.title = `“${query}” — Search — BloxCore`;
    syncUrl();
    render();
  }

  onReady(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (TABS.some(([k]) => k === t)) tab = t;
    const input = $('sp-input');
    input.value = params.get('q') || '';
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value), 280); });
    $('sp-form').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); run(input.value); });
    renderTabs();
    if (input.value) run(input.value); else input.focus();
  });
})();
