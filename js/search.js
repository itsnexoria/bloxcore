// BloxCore — site-wide search (nav search button + modal), included on every page
// after supabase-client.js and nav.js. Injects its own button + overlay via JS so no
// per-page HTML markup is needed — same pattern nav.js already uses for the notif bell.

const SEARCH_MIN_CHARS = 2;
const SEARCH_RESULTS_PER_GROUP = 5;
const SEARCH_DEBOUNCE_MS = 250;

let _searchDebounceTimer = null;
let _searchRequestId = 0;

document.addEventListener('DOMContentLoaded', () => {
  const actions = document.querySelector('.nav-header-actions');
  if (!actions) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-sm';
  btn.id = 'site-search-btn';
  btn.setAttribute('aria-label', 'Search BloxCore');
  btn.style.padding = '9px 10px';
  btn.innerHTML = '<i data-lucide="search" class="icon-sm"></i>';
  actions.insertBefore(btn, actions.firstChild);

  buildSearchModal();
  refreshIcons();

  const overlay = document.getElementById('site-search-overlay');
  const input = document.getElementById('site-search-input');

  btn.addEventListener('click', () => openSearchModal());
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+K opens search from anywhere, mirroring the convention most players will
    // already know from Discord/GitHub/etc.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearchModal();
    } else if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeSearchModal();
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearchModal();
  });
  input.addEventListener('input', () => {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => runSiteSearch(input.value.trim()), SEARCH_DEBOUNCE_MS);
  });

  // Backs the WebSite SearchAction schema on the homepage — a URL like /?q=dragon
  // opens the search modal pre-filled and already searching.
  const q = new URLSearchParams(window.location.search).get('q');
  if (q) {
    openSearchModal();
    input.value = q;
    runSiteSearch(q);
  }
});

function buildSearchModal() {
  const overlay = document.createElement('div');
  overlay.id = 'site-search-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Search BloxCore');
  overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(6,15,26,0.85); z-index:300; align-items:flex-start; justify-content:center; padding:12vh 20px 20px;';
  overlay.innerHTML = `
    <div class="panel" style="max-width:520px; width:100%; margin:0; padding:0; overflow:hidden;">
      <div style="display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--glass-border);">
        <i data-lucide="search" class="icon-sm" style="color:var(--ash); flex-shrink:0;"></i>
        <input id="site-search-input" type="text" placeholder="Search players, crews, listings, giveaways…" aria-label="Search BloxCore" autocomplete="off"
          style="flex:1; background:none; border:none; outline:none; color:var(--bone); font-size:0.95rem;">
        <button type="button" class="btn btn-ghost btn-sm" id="site-search-close" aria-label="Close search"><i data-lucide="x" class="icon-sm"></i></button>
      </div>
      <div id="site-search-results" style="max-height:60vh; overflow-y:auto; padding:8px;">
        <p class="muted" style="padding:16px; margin:0; font-size:0.85rem;">Type at least ${SEARCH_MIN_CHARS} characters to search.</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('site-search-close').addEventListener('click', closeSearchModal);
}

function openSearchModal() {
  const overlay = document.getElementById('site-search-overlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  const input = document.getElementById('site-search-input');
  input.focus();
}

function closeSearchModal() {
  const overlay = document.getElementById('site-search-overlay');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
  const input = document.getElementById('site-search-input');
  input.value = '';
  document.getElementById('site-search-results').innerHTML = `<p class="muted" style="padding:16px; margin:0; font-size:0.85rem;">Type at least ${SEARCH_MIN_CHARS} characters to search.</p>`;
}

async function runSiteSearch(query) {
  const resultsEl = document.getElementById('site-search-results');
  if (query.length < SEARCH_MIN_CHARS) {
    resultsEl.innerHTML = `<p class="muted" style="padding:16px; margin:0; font-size:0.85rem;">Type at least ${SEARCH_MIN_CHARS} characters to search.</p>`;
    return;
  }

  // Guards against a slow earlier request resolving after a newer one and clobbering
  // results — only the most recently *dispatched* request is allowed to render.
  const requestId = ++_searchRequestId;
  resultsEl.innerHTML = `<p class="muted" style="padding:16px; margin:0; font-size:0.85rem;">Searching…</p>`;

  const like = `%${query.replace(/[%_]/g, '\\$&')}%`;
  const nowIso = new Date().toISOString();

  let players, crews, challenges, combos, services, giveaways, seaEvents, pvpMatches, matchedItems, tradeListings, tournaments;
  try {
    [players, crews, challenges, combos, services, giveaways, seaEvents, pvpMatches, matchedItems, tournaments] = await Promise.all([
      sb.from('profiles').select('username, display_name, avatar_url, avatar_frame').eq('profile_visibility', 'public').or(`username.ilike.${like},display_name.ilike.${like}`).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('crews').select('id, name, tag, logo_url').or(`name.ilike.${like},tag.ilike.${like}`).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('challenges').select('id, title, difficulty').eq('active', true).ilike('title', like).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('combos').select('id, title, difficulty').ilike('title', like).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('service_listings').select('id, title, category').eq('status', 'open').ilike('title', like).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('giveaways').select('id, title, prize').eq('status', 'active').or(`title.ilike.${like},prize.ilike.${like}`).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('sea_events').select('id, type, notes').gt('expires_at', nowIso).or(`type.ilike.${like},notes.ilike.${like}`).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('pvp_matches').select('id, match_type, notes').gt('expires_at', nowIso).or(`match_type.ilike.${like},notes.ilike.${like}`).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('bf_items').select('id, name').ilike('name', like).limit(SEARCH_RESULTS_PER_GROUP),
      sb.from('tournaments').select('id, name, status').neq('status', 'cancelled').ilike('name', like).limit(SEARCH_RESULTS_PER_GROUP),
    ]);

    // Trading listings store items as jsonb id arrays, not a searchable title — so a fruit-name
    // match has to go the other way: find matching bf_items first (above), then find active
    // listings that mention any of those item ids in either side of the trade.
    const matchedItemIds = new Set((matchedItems.data || []).map(i => i.id));
    const itemNameById = new Map((matchedItems.data || []).map(i => [i.id, i.name]));
    const { data: recentTrades } = await sb.from('trade_listings')
      .select('id, offering_item_ids, requesting_item_ids, note')
      .eq('active', true).gt('expires_at', nowIso)
      .order('created_at', { ascending: false }).limit(40);

    tradeListings = (recentTrades || []).filter(t => {
      if (t.note && t.note.toLowerCase().includes(query.toLowerCase())) return true;
      const items = [...(t.offering_item_ids || []), ...(t.requesting_item_ids || [])];
      return items.some(entry => matchedItemIds.has(entry.id));
    }).slice(0, SEARCH_RESULTS_PER_GROUP).map(t => {
      const items = [...(t.offering_item_ids || []), ...(t.requesting_item_ids || [])];
      const hit = items.find(entry => matchedItemIds.has(entry.id));
      return { id: t.id, label: hit ? itemNameById.get(hit.id) : (t.note || 'Trade listing') };
    });
  } catch (e) {
    if (requestId !== _searchRequestId) return;
    logError('Site search failed:', e);
    resultsEl.innerHTML = `<p class="muted" style="padding:16px; margin:0; font-size:0.85rem;">Search is having trouble right now — try again in a moment.</p>`;
    return;
  }
  if (requestId !== _searchRequestId) return; // a newer search superseded this one

  const seaEventLabel = { sea_beast: 'Sea Beast', terror_shark: 'Terror Shark', leviathan: 'Leviathan', prehistoric_island: 'Prehistoric Island', mirage: 'Mirage', kitsune_shrine: 'Kitsune Shrine' };

  const groups = [
    { label: 'Players', icon: 'user', items: (players.data || []).map(p => ({
        href: `/player/?u=${encodeURIComponent(p.username)}`,
        html: `${avatarHtml(p, 28)}<span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(displayNameFor(p))}</span>`,
      })) },
    { label: 'Crews', icon: 'users', items: (crews.data || []).map(c => ({
        href: `/crew/?name=${encodeURIComponent(c.name)}`,
        html: `<span style="width:28px; height:28px; border-radius:6px; background:var(--navy-light); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; font-family:var(--font-stamp); font-size:0.8rem; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</span><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.name)}${c.tag ? ` <span class="muted" style="font-size:0.78rem;">[${escapeHtml(c.tag)}]</span>` : ''}</span>`,
      })) },
    { label: 'Quests', icon: 'swords', items: (challenges.data || []).map(c => ({
        href: `/challenges/`,
        html: `<i data-lucide="swords" class="icon-sm" style="color:var(--brass-bright); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title)}</span>`,
      })) },
    { label: 'Combos', icon: 'flame', items: (combos.data || []).map(c => ({
        href: `/combos/#${c.id}`,
        html: `<i data-lucide="flame" class="icon-sm" style="color:var(--gold); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title)}</span>`,
      })) },
    { label: 'Services', icon: 'hammer', items: (services.data || []).map(s => ({
        href: `/services/?tab=${s.category}#${s.id}`,
        html: `<i data-lucide="hammer" class="icon-sm" style="color:var(--sea); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.title)}</span>`,
      })) },
    { label: 'Giveaways', icon: 'gift', items: (giveaways.data || []).map(g => ({
        href: `/giveaways/#${g.id}`,
        html: `<i data-lucide="gift" class="icon-sm" style="color:var(--gold-bright); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(g.title)}</span>`,
      })) },
    { label: 'Sea Events', icon: 'waves', items: (seaEvents.data || []).map(e => ({
        href: `/sea-events/`,
        html: `<i data-lucide="waves" class="icon-sm" style="color:var(--sea); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(seaEventLabel[e.type] || e.type)}</span>`,
      })) },
    { label: 'PvP', icon: 'crosshair', items: (pvpMatches.data || []).map(m => ({
        href: `/pvp/`,
        html: `<i data-lucide="crosshair" class="icon-sm" style="color:var(--blood-dim); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(m.match_type)} match${m.notes ? ` — ${escapeHtml(m.notes)}` : ''}</span>`,
      })) },
    { label: 'Tournaments', icon: 'trophy', items: (tournaments.data || []).map(t => ({
        href: `/pvp/?tab=tournaments`,
        html: `<i data-lucide="trophy" class="icon-sm" style="color:var(--brass-bright); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.name)}</span>`,
      })) },
    { label: 'Trading', icon: 'repeat', items: (tradeListings || []).map(t => ({
        href: `/trading/#${t.id}`,
        html: `<i data-lucide="repeat" class="icon-sm" style="color:var(--brass-bright); flex-shrink:0;"></i><span style="margin-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.label)}</span>`,
      })) },
  ].filter(g => g.items.length);

  if (!groups.length) {
    resultsEl.innerHTML = `<p class="muted" style="padding:16px; margin:0; font-size:0.85rem;">No results for "${escapeHtml(query)}".</p>`;
    return;
  }

  resultsEl.innerHTML = groups.map(g => `
    <div style="padding:6px 10px 2px;">
      <p class="muted" style="margin:6px 0 4px; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.05em;">${g.label}</p>
      ${g.items.map(item => `
        <a href="${item.href}" style="display:flex; align-items:center; padding:8px; border-radius:var(--radius-sm); text-decoration:none; color:var(--bone);" onmouseover="this.style.background='var(--navy-light)'" onmouseout="this.style.background='none'">
          ${item.html}
        </a>
      `).join('')}
    </div>
  `).join('');
  refreshIcons();
}
