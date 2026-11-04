// BloxCore — less-used shared helpers split out of supabase-client.js so most pages don't download them.
// Load this right AFTER supabase-client.js, and only on pages whose scripts use something below
// (scripts/check-site.mjs fails the build if a page uses one of these without loading this file).

function scamSignals(text) {
  const s = String(text || '');
  const lower = s.toLowerCase();
  const reasons = [];

  const hosts = [];
  for (const m of lower.matchAll(/(?:https?:\/\/|www\.)([a-z0-9.-]+\.[a-z]{2,})|\b([a-z0-9-]+\.(?:com|net|org|gg|xyz|io|me|ly|tv|ru|shop|store|link|app|co|site|online|click|top|win))\b/g)) {
    hosts.push((m[1] || m[2]).replace(/^www\./, ''));
  }
  const isSafe = (h) => SAFE_LINK_HOSTS.some(d => h === d || h.endsWith('.' + d));
  if (hosts.some(h => LINK_SHORTENERS.includes(h))) reasons.push('a shortened link that hides where it goes');
  else if (hosts.some(h => !isSafe(h))) reasons.push('a link to an outside website');

  if (/\b(password|roblosecurity|\.?cookie|2fa|verification code|login code|auth(?:entication)? code)\b/.test(lower)) reasons.push('a request for account details');
  if (/\b(paypal|cash ?app|venmo|zelle|crypto|bitcoin|btc|usdt|gift ?card|steam card|western union)\b/.test(lower)
      || (/\b(robux|rbx)\b/.test(lower) && /(\d|pay|send|buy|sell|gamepass|donate)/.test(lower))) reasons.push('payment with Robux or real money');
  if (/\b(you|u)\s+(go|send|pay)\s+first\b|\b(go|send|pay)\s+first\b|\btrust me\b|\bi(?:'| a)?m\s+(?:a\s+)?(?:trusted\s+)?middle\s?man\b/.test(lower)) reasons.push('pressure to go first or "trust me"');
  return reasons;
}

// Live heads-up under a text box (listing notes, offer messages). Warns the writer; never blocks.
function attachScamHint(input) {
  if (!input || input.dataset.scamHint) return;
  input.dataset.scamHint = '1';
  const hint = document.createElement('div');
  hint.className = 'chat-scam-hint';
  hint.style.margin = '6px 0 0';
  hint.hidden = true;
  input.insertAdjacentElement('afterend', hint);
  const update = () => {
    const reasons = scamSignals(input.value);
    hint.hidden = !reasons.length;
    if (reasons.length) {
      hint.innerHTML = `<i data-lucide="shield-alert" class="icon-sm"></i><span>Heads up — this has ${escapeHtml(reasons.join(', '))}. Scammers use these; never pay or send first, and keep trades inside Roblox.</span>`;
      refreshIcons();
    }
  };
  input.addEventListener('input', update);
  update();
}

function scamWarningHtml(text) {
  const reasons = scamSignals(text);
  if (!reasons.length) return '';
  return `<div class="chat-scam-warn" role="note"><i data-lucide="shield-alert" class="icon-sm"></i><span><strong>Possible scam:</strong> this message has ${escapeHtml(reasons.join(', '))}. Trade inside Roblox only, never pay or send first, and never share your password.</span></div>`;
}

// Same as errorStateHtml() but as a single <tr><td>, for tables where a <div> inside
// <tbody> would be invalid markup (admin crew/war tables).
function errorStateTableRow(colspan, message, retryFn) {
  return `<tr><td colspan="${colspan}" class="muted" style="padding:20px; text-align:center;">
    ${escapeHtml(message)}
    ${retryFn ? ` <button type="button" class="btn btn-ghost btn-sm" onclick="${retryFn}"><i data-lucide="refresh-cw" class="icon-sm icon-inline"></i>Retry</button>` : ''}
  </td></tr>`;
}

// Small, dependency-free markdown -> HTML for admin-authored content (changelog posts). Escapes
// first, then only ever adds tags itself — so even if something raw-HTML-shaped is in the
// source text, it's already neutralized before any markdown syntax is applied. Supports the
// common subset: headers, bold/italic, links, inline code, code blocks, lists, quotes.
function markdownToHtml(raw) {
  const escaped = escapeHtml(raw ?? '');
  const codeBlocks = [];
  let text = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre style="background:rgba(255,255,255,0.04); border:1px solid var(--glass-border); border-radius:var(--radius-sm); padding:10px; overflow-x:auto;"><code>${code.trim()}</code></pre>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });

  // Bullet lists — group consecutive "- item" or "* item" lines into one <ul>. Runs
  // before bold/italic so a bullet's leading "* " is stripped first; otherwise a lone
  // leading asterisk on a list line can get mistaken for the start of an *italic* span.
  text = text.replace(/(^[-*] .*(?:\n[-*] .*)*)/gm, block =>
    `<ul style="margin:8px 0; padding-left:20px;">${block.split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('')}</ul>`
  );

  text = text
    .replace(/^### (.*)$/gm, '<h4 style="margin:14px 0 4px; font-size:1rem; font-family:var(--font-body); text-transform:none; letter-spacing:normal;">$1</h4>')
    .replace(/^## (.*)$/gm, '<h3 style="margin:16px 0 6px; font-size:1.05rem; font-family:var(--font-body); text-transform:none; letter-spacing:normal;">$1</h3>')
    .replace(/^&gt; (.*)$/gm, '<blockquote style="margin:8px 0; padding-left:12px; border-left:2px solid var(--brass); color:var(--ash);">$1</blockquote>')
    .replace(/^(?:---|\*\*\*|___)$/gm, '\u0000HR\u0000')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:4px; font-size:0.9em;">$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--brass-bright);">$1</a>');

  text = text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed === '\u0000HR\u0000') return '<hr style="margin:16px 0; border:none; border-top:1px solid var(--glass-border);">';
      return /^<(h3|h4|ul|blockquote)/.test(trimmed) ? line : line ? `<p style="margin:6px 0;">${line}</p>` : '';
    })
    .join('');

  return text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => codeBlocks[i]);
}

function formatBounty(n) {
  const num = Number(n) || 0;
  if (num <= 0) return 'Unranked';
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${label}M`;
  }
  return num.toLocaleString('en-US');
}

// Fixed bounty tiers (2.5M steps, 2.5M-30M) — used for both Pirate and Marine Bounty selects.
const BOUNTY_TIERS = [
  { value: 2500000, label: '2.5M' },
  { value: 5000000, label: '5M+' },
  { value: 7500000, label: '7.5M+' },
  { value: 10000000, label: '10M+' },
  { value: 12500000, label: '12.5M+' },
  { value: 15000000, label: '15M+' },
  { value: 17500000, label: '17.5M+' },
  { value: 20000000, label: '20M+' },
  { value: 22500000, label: '22.5M+' },
  { value: 25000000, label: '25M+' },
  { value: 27500000, label: '27.5M+' },
  { value: 30000000, label: '30M' },
];

// Report dialog: pick a reason, add optional context + an evidence link (e.g. a screenshot on Imgur/Gyazo),
// then submit_report() applies the same rate limit + banned-user check for every caller.
async function reportContent(targetType, targetId) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showToast('Sign in to report content.', true); return; }
  if (document.getElementById('rep-wrap')) return;

  const wrap = document.createElement('div');
  wrap.className = 'rep-wrap'; wrap.id = 'rep-wrap';
  wrap.innerHTML = `
    <div class="rep-dialog" role="dialog" aria-modal="true" aria-label="Report">
      <div class="rep-head"><strong>Report this</strong><button type="button" class="rep-x" id="rep-close" aria-label="Close">✕</button></div>
      <p class="rep-sub">Pick what fits best. Staff review every report; reporting someone isn't shared with them.</p>
      <div class="rep-chips" id="rep-chips">${REPORT_REASONS.map(r => `<button type="button" class="rep-chip" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}</div>
      <textarea id="rep-details" maxlength="1000" rows="3" placeholder="What happened? Names, trade details, anything that helps (optional)"></textarea>
      <label class="rep-label" for="rep-evidence">Evidence link <span>(optional)</span></label>
      <input type="url" id="rep-evidence" maxlength="500" placeholder="https://i.imgur.com/… — link to a screenshot" autocomplete="off">
      <p class="rep-hint">Upload the screenshot to Imgur, Gyazo or Lightshot and paste the link. Never include passwords or codes.</p>
      <div class="rep-actions"><button type="button" class="btn btn-ghost btn-sm" id="rep-cancel">Cancel</button><button type="button" class="btn btn-primary btn-sm" id="rep-send" disabled>Send report</button></div>
    </div>`;
  document.body.appendChild(wrap);
  const $ = (id) => wrap.querySelector('#' + id);
  let reason = '';
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('rep-close').addEventListener('click', close);
  $('rep-cancel').addEventListener('click', close);
  $('rep-chips').querySelectorAll('[data-reason]').forEach(b => b.addEventListener('click', () => {
    reason = b.dataset.reason;
    $('rep-chips').querySelectorAll('.rep-chip').forEach(c => c.classList.toggle('is-on', c === b));
    $('rep-send').disabled = false;
  }));
  $('rep-send').addEventListener('click', async () => {
    const details = $('rep-details').value.trim();
    const evidence = $('rep-evidence').value.trim();
    if (reason === 'Other' && !details) { showToast('Add a few words about what happened.', true); $('rep-details').focus(); return; }
    if (evidence && !/^https:\/\/\S+$/i.test(evidence)) { showToast('The evidence link must start with https://', true); $('rep-evidence').focus(); return; }
    $('rep-send').disabled = true;
    const { error } = await sb.rpc('submit_report', { p_target_type: targetType, p_target_id: targetId, p_reason: reason, p_details: details || null, p_evidence_url: evidence || null });
    if (error) { showToast(error.message, true); $('rep-send').disabled = false; return; }
    close();
    showToast('Reported — staff will take a look.');
  });
  $('rep-chips').querySelector('button').focus();
}

function newAccountBadge(profile, repPositive, repNegative) {
  if (!profile?.created_at) return '';
  const isNew = (Date.now() - new Date(profile.created_at).getTime()) < NEW_ACCOUNT_WINDOW_MS;
  const hasNoVouches = !repPositive && !repNegative;
  if (!isNew || !hasNoVouches) return '';
  return `<span class="new-account-badge" title="Account created within the last 3 days and has no vouches yet — take extra care."><i data-lucide="triangle-alert" class="icon-sm icon-inline"></i>New account</span>`;
}

// Batches a reputation lookup for a set of posters (e.g. everyone shown on a page of
// listings) into one query instead of one round-trip per card, then drops a small badge
// into every element carrying data-rep-for="<userId>" found under container. Also flags
// posters whose account is new and has no vouches yet (see newAccountBadge above) into
// any matching data-new-account-for="<userId>" element.
async function loadReputationBadges(container, posters) {
  const list = posters.map(p => (typeof p === 'string' ? { id: p, createdAt: null } : { id: p.id, createdAt: p.createdAt }));
  const ids = [...new Set(list.map(p => p.id))].filter(Boolean);
  if (!ids.length) return;
  const createdAtById = new Map(list.map(p => [p.id, p.createdAt]));

  const [{ data }, { data: verifiedRows }, { data: confirmedRows }] = await Promise.all([
    sb.from('vouches').select('target_id, direction').in('target_id', ids),
    sb.rpc('get_verified_traders', { p_user_ids: ids }),
    sb.rpc('get_confirmed_trade_counts', { p_user_ids: ids }),
  ]);
  const confirmedById = new Map((confirmedRows || []).map(r => [r.user_id, Number(r.n)]));
  const scores = {};
  (data || []).forEach(v => {
    scores[v.target_id] = scores[v.target_id] || { positive: 0, negative: 0 };
    scores[v.target_id][v.direction === 1 ? 'positive' : 'negative']++;
  });
  const verifiedIds = new Set((verifiedRows || []).map(r => r.user_id));

  container.querySelectorAll('[data-rep-for]').forEach(el => {
    const s = scores[el.dataset.repFor];
    if (!s || (!s.positive && !s.negative)) return;
    el.innerHTML = `<span class="rep-badge" title="${s.positive} positive, ${s.negative} negative vouch${s.positive + s.negative === 1 ? '' : 'es'}"><i data-lucide="thumbs-up" class="icon-sm icon-inline"></i>${s.positive}${s.negative ? ` <i data-lucide="thumbs-down" class="icon-sm icon-inline" style="margin-left:4px;"></i>${s.negative}` : ''}</span>`;
  });

  container.querySelectorAll('[data-new-account-for]').forEach(el => {
    const userId = el.dataset.newAccountFor;
    const s = scores[userId] || { positive: 0, negative: 0 };
    el.innerHTML = newAccountBadge({ created_at: createdAtById.get(userId) }, s.positive, s.negative);
  });

  container.querySelectorAll('[data-confirmed-trades-for]').forEach(el => {
    const n = confirmedById.get(el.dataset.confirmedTradesFor);
    if (!n) return;
    el.innerHTML = `<span class="rep-badge" style="color:var(--brass-bright);" title="${n} trade${n === 1 ? '' : 's'} confirmed by both sides"><i data-lucide="handshake" class="icon-sm icon-inline"></i>${n} confirmed</span>`;
  });

  container.querySelectorAll('[data-verified-trader-for]').forEach(el => {
    if (!verifiedIds.has(el.dataset.verifiedTraderFor)) return;
    el.innerHTML = `<span class="rep-badge" style="color:var(--sea); background:rgb(52 211 153 / 0.12);" title="Verified trader — enough completed trades with no open reports"><i data-lucide="badge-check" class="icon-sm icon-inline"></i>Verified</span>`;
  });

  refreshIcons();
}

function chatNameColor(profile) {
  if (profile?.chat_name_color) return profile.chat_name_color;
  if (profile?.role === 'mod' || profile?.role === 'admin') return 'var(--blood-dim)';
  // Deterministic so the same person always lands on the same color without storing one —
  // simple string hash over their (stable) user id, not their display name.
  const id = profile?.id || profile?.username || '';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CHAT_NAME_COLOR_PALETTE[hash % CHAT_NAME_COLOR_PALETTE.length];
}

// A curated set of colors users can recolor their equipped title with — not a free color
// picker, so every combination still fits the site's palette. 'default' means "use the
// title's own color" (title_color_override = null); 'rainbow' is the special animated style.
const TITLE_COLOR_PRESETS = [
  { key: 'default', label: 'Default', swatch: null },
  { key: '#ef4444', label: 'Red', swatch: '#ef4444' },
  { key: '#fbbf24', label: 'Gold', swatch: '#fbbf24' },
  { key: '#a78bfa', label: 'Purple', swatch: '#a78bfa' },
  { key: '#38bdf8', label: 'Blue', swatch: '#38bdf8' },
  { key: '#34d399', label: 'Green', swatch: '#34d399' },
  { key: '#fb7185', label: 'Rose', swatch: '#fb7185' },
  { key: '#f5f5f7', label: 'White', swatch: '#f5f5f7' },
  { key: 'rainbow', label: 'Rainbow', swatch: 'rainbow' },
];

// --- Fruit skin/mutation picker -------------------------------------------
// Some fruits have known equippable skins or mutations (e.g. Dragon has Eclipse,
// Tiger has Werewolf). Any fruit selector can call maybePromptFruitSkin() after a
// fruit is chosen — it only prompts when that fruit actually has linked skins in
// bf_items, and injects its own modal into the page the first time it's needed.

function ensureFruitSkinModal() {
  if (document.getElementById('fruit-skin-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'fruit-skin-modal';
  overlay.className = 'build-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'fruit-skin-modal-title');
  overlay.innerHTML = `
    <div class="panel build-modal">
      <div class="flex-between" style="margin-bottom:14px;">
        <h3 style="font-size:1.05rem; margin:0;" id="fruit-skin-modal-title">Choose a Skin</h3>
        <button type="button" class="btn btn-ghost btn-sm" id="fruit-skin-modal-close" aria-label="Close"><i data-lucide="x" class="icon-md"></i></button>
      </div>
      <p class="muted" style="margin:0 0 14px; font-size:0.82rem;">This fruit has known skins/mutations — pick the one you're using in-game, or Base for the plain fruit.</p>
      <div id="fruit-skin-modal-grid" class="build-modal-grid"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('fruit-skin-modal-close').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
}

async function maybePromptFruitSkin(fruitName, currentSkin, onSelect) {
  if (!fruitName) { onSelect(null); return; }

  const { data: skins } = await sb.from('bf_items').select('id, name, icon_url').eq('category', 'limited').eq('base_fruit', fruitName);
  if (!skins || !skins.length) { onSelect(null); return; }

  ensureFruitSkinModal();
  const overlay = document.getElementById('fruit-skin-modal');
  document.getElementById('fruit-skin-modal-title').textContent = `${fruitName} — Choose Your Skin`;
  const grid = document.getElementById('fruit-skin-modal-grid');

  const noneTile = `<div class="build-modal-tile ${!currentSkin ? 'selected' : ''}" data-skin-name=""><i data-lucide="ban" class="icon-lg"></i><span>Base ${escapeHtml(fruitName)}</span></div>`;
  const tiles = skins.map(s => `
    <div class="build-modal-tile ${currentSkin === s.name ? 'selected' : ''}" data-skin-name="${escapeHtml(s.name)}">
      <img src="${safeImgUrl(s.icon_url)}" alt="${escapeHtml(s.name)}" loading="lazy">
      <span>${escapeHtml(s.name)}</span>
    </div>
  `).join('');
  grid.innerHTML = noneTile + tiles;
  refreshIcons();

  grid.querySelectorAll('[data-skin-name]').forEach(tile => {
    tile.addEventListener('click', () => {
      overlay.classList.remove('open');
      const name = tile.dataset.skinName || null;
      const iconUrl = name ? (skins.find(s => s.name === name)?.icon_url || null) : null;
      onSelect(name, iconUrl);
    });
  });
  overlay.classList.add('open');
}

// --- Shared "Load More" pagination helper ----------------------------------
// Renders a Load More button under `container`; each click fetches the next
// page via `fetchPage(offset, pageSize)` (must return an array), appends the
// rendered rows via `renderItem`, and hides itself once a short page comes
// back (fewer rows than pageSize means there's nothing left to load).
function attachLoadMore(container, { pageSize = 20, initialOffset = 0, fetchPage, renderItem, onAppend, wrapId } = {}) {
  let offset = initialOffset;
  let loading = false;
  wrapId = wrapId || `load-more-wrap-${Math.random().toString(36).slice(2, 9)}`;
  const existing = document.getElementById(wrapId);
  if (existing) existing.remove();
  const btnId = `${wrapId}-btn`;
  container.insertAdjacentHTML('afterend', `<div id="${wrapId}" style="text-align:center; margin-top:16px;"><button id="${btnId}" class="btn btn-ghost btn-sm" style="display:none;">Load more</button></div>`);
  const btn = document.getElementById(btnId);

  async function loadNext() {
    if (loading) return;
    loading = true;
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      const rows = await fetchPage(offset, pageSize);
      if (rows.length) {
        container.insertAdjacentHTML('beforeend', rows.map(renderItem).join(''));
        offset += rows.length;
        if (onAppend) onAppend(rows);
      }
      btn.style.display = rows.length < pageSize ? 'none' : 'inline-flex';
    } catch (e) {
      logError('Load more failed:', e);
      btn.textContent = 'Couldn\'t load more — retry';
    } finally {
      loading = false;
      btn.disabled = false;
      if (btn.style.display !== 'none') btn.textContent = 'Load more';
    }
  }

  btn.addEventListener('click', loadNext);
  return { loadNext, reset: () => { offset = initialOffset; btn.style.display = 'none'; } };
}

function startRobloxOAuthConnect(returnTo) {
  const state = crypto.randomUUID();
  sessionStorage.setItem('bc_roblox_oauth_state', state);
  sessionStorage.setItem('bc_roblox_oauth_return', returnTo || location.pathname);
  const redirectUri = `${location.origin}/roblox-callback/`;
  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.searchParams.set('client_id', ROBLOX_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  location.href = url.toString();
}

// First-visit dismissible tip banner — shown once per browser until the person
// dismisses it, tracked purely in localStorage (no account-level state needed).
function initFirstVisitBanner(bannerId, dismissBtnId, storageKey) {
  const banner = document.getElementById(bannerId);
  const dismissBtn = document.getElementById(dismissBtnId);
  if (!banner || !dismissBtn) return;

  if (!localStorage.getItem(storageKey)) {
    banner.style.display = 'block';
    refreshIcons();
  }

  dismissBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    localStorage.setItem(storageKey, '1');
  });
}

// ---- PvP rating tiers (1v1 Elo, everyone starts at 1000) ---------------------------------
const PVP_TIERS = [
  { name: 'Master',   min: 1650, icon: 'crown',   color: '#f472b6' },
  { name: 'Diamond',  min: 1500, icon: 'gem',     color: '#60a5fa' },
  { name: 'Platinum', min: 1350, icon: 'shield',  color: '#2dd4bf' },
  { name: 'Gold',     min: 1200, icon: 'medal',   color: '#fbbf24' },
  { name: 'Silver',   min: 1050, icon: 'award',   color: '#cbd5e1' },
  { name: 'Bronze',   min: 0,    icon: 'swords',  color: '#d9895a' },
];

function pvpTier(rating) {
  const r = Number(rating) || 1000;
  return PVP_TIERS.find(t => r >= t.min) || PVP_TIERS[PVP_TIERS.length - 1];
}

function pvpTierTagHtml(rating) {
  const t = pvpTier(rating);
  return `<span class="pvp-tier" style="--tier-color:${t.color};" title="${t.name} tier"><i data-lucide="${t.icon}" class="icon-sm icon-inline"></i>${t.name}</span>`;
}
