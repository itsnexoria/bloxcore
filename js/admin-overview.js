// BloxCore — /admin/overview/ : staff command centre.
// Data: get_admin_overview() (counters), get_admin_overview_extras() (14-day series, hourly errors, activity feed, push/db stats),
// get_cron_health() (admin only), mod_flags (auto-moderation queue, staff RLS) + review_mod_flag().

const OV = { timer: null, auto: true, metric: 'signups', sev: 'all', data: null, extras: null, cron: null, isAdmin: false, flags: [], prev: new Map() };
const OV_REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

onReady(async () => {
  const auth = await requireMod();
  if (!auth) return;
  OV.isAdmin = auth.profile?.role === 'admin';
  document.getElementById('ov-greeting').textContent = `${ovGreeting()}, ${auth.profile?.display_name || auth.profile?.username || 'staff'}`;
  document.getElementById('overview-content').hidden = false;
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !OV.isAdmin; });

  document.getElementById('ov-refresh').addEventListener('click', () => refreshOverview(true));
  document.getElementById('ov-auto').addEventListener('click', toggleAuto);
  document.querySelectorAll('[data-ov-metric]').forEach(b => b.addEventListener('click', () => { OV.metric = b.dataset.ovMetric; renderMainChart(); }));
  document.querySelectorAll('[data-ov-sev]').forEach(b => b.addEventListener('click', () => { OV.sev = b.dataset.ovSev; renderFlags(); }));
  document.getElementById('ov-dismiss-low').addEventListener('click', dismissLowFlags);
  document.addEventListener('keydown', (e) => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !/input|textarea|select/i.test(document.activeElement?.tagName)) refreshOverview(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && OV.auto) refreshOverview(); });

  await refreshOverview();
  startAuto();
});

function ovGreeting() { const h = new Date().getHours(); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function startAuto() { clearInterval(OV.timer); if (OV.auto) OV.timer = setInterval(() => { if (!document.hidden) refreshOverview(); }, 60000); }
function toggleAuto() {
  OV.auto = !OV.auto;
  const b = document.getElementById('ov-auto');
  b.setAttribute('aria-pressed', OV.auto ? 'true' : 'false');
  b.classList.toggle('on', OV.auto);
  b.querySelector('span').textContent = OV.auto ? 'Live' : 'Paused';
  startAuto();
}

// ---- data -------------------------------------------------------------------------------------
async function refreshOverview(manual = false) {
  const btn = document.getElementById('ov-refresh');
  btn.classList.add('spinning');
  const [ov, ex, cron] = await Promise.all([
    sb.rpc('get_admin_overview'),
    sb.rpc('get_admin_overview_extras'),
    OV.isAdmin ? sb.rpc('get_cron_health') : Promise.resolve({ data: null }),
  ]);
  btn.classList.remove('spinning');
  if (ov.error) { logError('get_admin_overview failed:', ov.error); showToast('Couldn\'t load the overview.', true); return; }
  if (ex.error) logError('get_admin_overview_extras failed:', ex.error);
  OV.data = ov.data; OV.extras = ex.data || null; OV.cron = cron.data || null;
  renderAll();
  await loadFlags();
  if (manual) showToast('Refreshed.');
}

function renderAll() {
  renderHero(); renderAttention(); renderHealth(); renderKpis(); renderMainChart(); renderErrorChart(); renderFeed(); renderCron();
  document.getElementById('ov-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  refreshIcons();
}

// ---- helpers ----------------------------------------------------------------------------------
function ovNum(el, to) {
  const from = OV.prev.has(el.id) ? OV.prev.get(el.id) : 0;
  OV.prev.set(el.id, to);
  if (OV_REDUCED || from === to) { el.textContent = Number(to).toLocaleString(); return; }
  const t0 = performance.now(), dur = 650;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function ovAge(hours) { if (hours == null) return ''; if (hours < 1) return '<1h'; if (hours < 48) return `${hours}h`; return `${Math.round(hours / 24)}d`; }
function ovSpark(values, color) {
  if (!values || values.length < 2) return '';
  const w = 120, h = 34, max = Math.max(...values, 1), step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = 'sg' + Math.random().toString(36).slice(2, 8);
  return `<svg class="ov-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w},${h} L0,${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---- hero + status ----------------------------------------------------------------------------
function ovAttentionTotal() { const d = OV.data; return d.open_reports + d.open_flags + d.pending_submissions + d.pending_appeals + d.pending_giveaways + d.pending_giveaway_proofs + d.pvp_to_review; }
function ovDangers() {
  const d = OV.data, x = OV.extras || {}, out = [];
  if (d.high_flags > 0) out.push(`${d.high_flags} high-severity flag${d.high_flags === 1 ? '' : 's'}`);
  if (d.cron_failures_24h > 0) out.push(`${d.cron_failures_24h} cron failure${d.cron_failures_24h === 1 ? '' : 's'}`);
  if (d.webhook_failures_24h > 0) out.push(`${d.webhook_failures_24h} webhook failure${d.webhook_failures_24h === 1 ? '' : 's'}`);
  if (d.errors_24h > 100) out.push('error spike');
  if ((x.oldest_report_hours || 0) > 72) out.push('reports waiting 3+ days');
  return out;
}
function renderHero() {
  const dangers = ovDangers(), total = ovAttentionTotal();
  const pill = document.getElementById('ov-status');
  const tone = dangers.length ? 'danger' : total > 0 ? 'warn' : 'ok';
  pill.className = `ov-status ${tone}`;
  pill.innerHTML = `<span class="ov-dot"></span>${dangers.length ? `Needs attention — ${dangers.slice(0, 2).join(', ')}` : total > 0 ? `${total} item${total === 1 ? '' : 's'} waiting for review` : 'All clear — nothing needs you right now'}`;
}

// ---- attention cards --------------------------------------------------------------------------
function renderAttention() {
  const d = OV.data, x = OV.extras || {};
  const cards = [
    { id: 'a-reports', label: 'Open reports', n: d.open_reports, icon: 'flag', href: '/admin/reports/', hint: d.open_reports ? `oldest ${ovAge(x.oldest_report_hours)}` : '', urgent: (x.oldest_report_hours || 0) > 72 },
    { id: 'a-flags', label: 'Auto-mod flags', n: d.open_flags, icon: 'shield-alert', href: '#ov-flags', hint: d.high_flags ? `${d.high_flags} high severity` : d.open_flags ? `oldest ${ovAge(x.oldest_flag_hours)}` : '', urgent: d.high_flags > 0 },
    { id: 'a-subs', label: 'Quest submissions', n: d.pending_submissions, icon: 'inbox', href: '/admin/', hint: '' },
    { id: 'a-appeals', label: 'Ban appeals', n: d.pending_appeals, icon: 'gavel', href: '/admin/appeals/', hint: '' },
    { id: 'a-giveaways', label: 'Giveaways to review', n: d.pending_giveaways + d.pending_giveaway_proofs, icon: 'gift', href: '/admin/giveaways/', hint: d.pending_giveaway_proofs ? `${d.pending_giveaway_proofs} proof${d.pending_giveaway_proofs === 1 ? '' : 's'}` : '' },
    { id: 'a-pvp', label: 'PvP results', n: d.pvp_to_review, icon: 'swords', href: '/admin/manage/#pvp', hint: '' },
  ];
  cards.sort((a, b) => (b.urgent ? 2 : b.n > 0 ? 1 : 0) - (a.urgent ? 2 : a.n > 0 ? 1 : 0));
  document.getElementById('ov-attention').innerHTML = cards.map(c => {
    const tone = c.urgent ? 'danger' : c.n > 0 ? 'warn' : 'ok';
    return `<a class="ov-card ${tone}" href="${c.href}">
      <span class="ov-card-icon"><i data-lucide="${tone === 'ok' ? 'check' : c.icon}"></i></span>
      <span class="ov-card-body"><span class="ov-card-n" id="${c.id}">0</span><span class="ov-card-label">${c.label}</span>${c.hint ? `<span class="ov-card-hint">${c.hint}</span>` : ''}</span>
      <i data-lucide="arrow-up-right" class="ov-card-go"></i></a>`;
  }).join('');
  cards.forEach(c => ovNum(document.getElementById(c.id), c.n));
}

// ---- health chips -----------------------------------------------------------------------------
function renderHealth() {
  const d = OV.data, x = OV.extras || {};
  const cronBad = OV.cron ? OV.cron.filter(j => j.active && (j.last_status === 'failed' || j.stale || j.fails_24h > 0)).length : d.cron_failures_24h;
  const chips = [
    { label: 'Cron jobs', value: OV.cron ? `${OV.cron.filter(j => j.active).length - cronBad}/${OV.cron.filter(j => j.active).length} healthy` : (d.cron_failures_24h ? `${d.cron_failures_24h} failed` : 'no failures'), tone: cronBad || d.cron_failures_24h ? 'danger' : 'ok', icon: 'timer' },
    { label: 'Client errors · 24h', value: d.errors_24h.toLocaleString(), tone: d.errors_24h > 100 ? 'danger' : d.errors_24h > 25 ? 'warn' : 'ok', icon: 'bug' },
    { label: 'Webhooks · 24h', value: d.webhook_failures_24h ? `${d.webhook_failures_24h} failing` : 'all delivered', tone: d.webhook_failures_24h ? 'danger' : 'ok', icon: 'webhook' },
    { label: 'Push subscribers', value: x.push_users != null ? `${x.push_users} user${x.push_users === 1 ? '' : 's'} · ${x.push_devices} device${x.push_devices === 1 ? '' : 's'}` : '—', tone: 'info', icon: 'bell-ring' },
    { label: 'Database', value: x.db_mb != null ? `${x.db_mb} MB` : '—', sub: x.db_mb != null ? `of 500 MB free tier` : '', tone: x.db_mb > 400 ? 'warn' : 'info', icon: 'database' },
  ];
  document.getElementById('ov-health').innerHTML = chips.map(c => `<div class="ov-chip ${c.tone}"><i data-lucide="${c.icon}"></i><span><small>${c.label}</small><strong>${c.value}</strong></span></div>`).join('');
}

// ---- KPI tiles with sparklines ----------------------------------------------------------------
function renderKpis() {
  const d = OV.data, daily = OV.extras?.daily || [];
  const series = (k) => daily.map(r => r[k]);
  const today = daily[daily.length - 1], yday = daily[daily.length - 2];
  const delta = (k) => (today && yday) ? today[k] - yday[k] : null;
  const tiles = [
    { id: 'k-users', label: 'Total users', n: d.total_users, icon: 'users', color: '#60a5fa', spark: series('signups'), sub: `${d.signups_7d} new this week` },
    { id: 'k-signups', label: 'Signups · 24h', n: d.signups_24h, icon: 'user-plus', color: '#34d399', spark: series('signups'), delta: delta('signups') },
    { id: 'k-trades', label: 'Active trades', n: d.active_trades, icon: 'repeat', color: '#a78bfa', spark: series('trades'), href: '/trading/' },
    { id: 'k-offers', label: 'Pending offers', n: d.pending_offers, icon: 'handshake', color: '#f472b6', spark: series('offers') },
    { id: 'k-events', label: 'Sea events live', n: d.active_sea_events, icon: 'waves', color: '#38bdf8', href: '/sea-events/' },
    { id: 'k-clips', label: 'Clips this week', n: d.clips_this_week, icon: 'clapperboard', color: '#fbbf24', spark: series('clips'), href: '/clips/' },
  ];
  document.getElementById('ov-kpis').innerHTML = tiles.map(t => {
    const dl = t.delta == null ? '' : `<span class="ov-delta ${t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : ''}">${t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '•'} ${Math.abs(t.delta)} vs yesterday</span>`;
    return `<${t.href ? 'a href="' + t.href + '"' : 'div'} class="ov-kpi" style="--c:${t.color};">
      <span class="ov-kpi-top"><i data-lucide="${t.icon}"></i><span>${t.label}</span></span>
      <span class="ov-kpi-n" id="${t.id}">0</span>
      ${dl || (t.sub ? `<span class="ov-kpi-sub">${t.sub}</span>` : '')}
      ${t.spark ? ovSpark(t.spark, t.color) : ''}
    </${t.href ? 'a' : 'div'}>`;
  }).join('');
  tiles.forEach(t => ovNum(document.getElementById(t.id), t.n));
}

// ---- charts -----------------------------------------------------------------------------------
const OV_METRICS = { signups: ['Signups', '#34d399'], trades: ['Trade listings', '#a78bfa'], offers: ['Offers', '#f472b6'], reports: ['Reports', '#f87171'], clips: ['Clips', '#fbbf24'] };

function ovBars(values, labels, color, unit) {
  const W = 720, H = 220, padL = 34, padB = 26, padT = 14, n = values.length;
  const max = Math.max(...values, 1), niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const bw = (W - padL) / n, bar = Math.min(34, bw * 0.62);
  const y = (v) => padT + (H - padT - padB) * (1 - v / niceMax);
  let s = `<svg class="ov-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} per day, last 14 days"><defs><linearGradient id="ovbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".35"/></linearGradient></defs>`;
  for (let i = 0; i <= 4; i++) { const gv = (niceMax / 4) * i, gy = y(gv); s += `<line x1="${padL}" x2="${W}" y1="${gy}" y2="${gy}" class="ov-grid-line"/><text x="${padL - 8}" y="${gy + 4}" text-anchor="end" class="ov-axis">${Math.round(gv)}</text>`; }
  values.forEach((v, i) => {
    const x = padL + i * bw + (bw - bar) / 2, top = y(v), h = Math.max(v > 0 ? 3 : 0, H - padB - top);
    const isToday = i === n - 1;
    s += `<g class="ov-bar-g" data-tip="${labels[i]} — ${v} ${unit.toLowerCase()}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>
      <rect class="ov-bar${isToday ? ' today' : ''}" x="${x}" y="${H - padB - h}" width="${bar}" height="${h}" rx="5" fill="url(#ovbar)" style="animation-delay:${i * 28}ms"/>
      ${v > 0 && (v === max || isToday) ? `<text x="${x + bar / 2}" y="${H - padB - h - 6}" text-anchor="middle" class="ov-val">${v}</text>` : ''}</g>`;
    if (i % 2 === (n - 1) % 2) s += `<text x="${x + bar / 2}" y="${H - 7}" text-anchor="middle" class="ov-axis">${labels[i]}</text>`;
  });
  return s + '</svg>';
}

function renderMainChart() {
  const daily = OV.extras?.daily || [];
  const box = document.getElementById('ov-chart-main');
  document.querySelectorAll('[data-ov-metric]').forEach(b => { const on = b.dataset.ovMetric === OV.metric; b.classList.toggle('btn-primary', on); b.classList.toggle('btn-ghost', !on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  if (!daily.length) { box.innerHTML = '<p class="muted" style="padding:30px; text-align:center;">No data yet.</p>'; return; }
  const [label, color] = OV_METRICS[OV.metric];
  const values = daily.map(r => r[OV.metric]);
  const labels = daily.map(r => new Date(r.day + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  const total = values.reduce((a, b) => a + b, 0), avg = (total / values.length).toFixed(1);
  document.getElementById('ov-chart-sub').textContent = `${total} total · ${avg} per day · last 14 days (UTC)`;
  box.innerHTML = ovBars(values, labels, color, label);
  wireTips(box);
}

function renderErrorChart() {
  const hourly = OV.extras?.errors_hourly || [];
  const box = document.getElementById('ov-chart-errors');
  if (!hourly.length) { box.innerHTML = ''; return; }
  const total = hourly.reduce((a, b) => a + b, 0), peak = Math.max(...hourly);
  document.getElementById('ov-errors-sub').textContent = total ? `${total} in 24h · peak ${peak}/hour` : 'No errors in the last 24 hours 🎉';
  const W = 360, H = 120, max = Math.max(peak, 4), step = W / (hourly.length - 1);
  const pts = hourly.map((v, i) => [i * step, H - 10 - (v / max) * (H - 24)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const color = peak > 25 ? '#f87171' : '#60a5fa';
  box.innerHTML = `<svg class="ov-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Client errors per hour"><defs><linearGradient id="overr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".4"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${W}" y1="${H - 10}" y2="${H - 10}" class="ov-grid-line"/>
    <path d="${line} L${W},${H - 10} L0,${H - 10} Z" fill="url(#overr)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>
    <div class="ov-axis-row"><span>24h ago</span><span>12h</span><span>now</span></div>`;
}

function wireTips(root) {
  let tip = document.getElementById('ov-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'ov-tip'; tip.className = 'ov-tip'; document.body.appendChild(tip); }
  root.querySelectorAll('.ov-bar-g').forEach(g => {
    g.addEventListener('mouseenter', () => { tip.textContent = g.dataset.tip; tip.style.opacity = '1'; });
    g.addEventListener('mousemove', (e) => { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY - 34}px`; });
    g.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
  });
}

// ---- activity feed + cron table ---------------------------------------------------------------
const OV_FEED = { signup: ['user-plus', '#34d399'], report: ['flag', '#f87171'], trade: ['repeat', '#a78bfa'], offer: ['handshake', '#f472b6'], clip: ['clapperboard', '#fbbf24'], flag: ['shield-alert', '#fb923c'], submission: ['inbox', '#38bdf8'] };
function renderFeed() {
  const rows = OV.extras?.recent || [];
  const box = document.getElementById('ov-feed');
  if (!rows.length) { box.innerHTML = '<p class="muted" style="margin:0; padding:12px;">No activity yet.</p>'; return; }
  box.innerHTML = rows.map(r => {
    const [icon, color] = OV_FEED[r.kind] || ['circle', '#94a3b8'];
    return `<div class="ov-feed-row" style="--c:${color};"><span class="ov-feed-icon"><i data-lucide="${icon}"></i></span>
      <span class="ov-feed-text">${r.actor ? `<a href="/player/?u=${encodeURIComponent(r.actor)}">@${escapeHtml(r.actor)}</a> ` : ''}${escapeHtml(r.text)}</span><time>${timeAgo(r.ts)}</time></div>`;
  }).join('');
}

function renderCron() {
  const wrap = document.getElementById('ov-cron');
  if (!OV.isAdmin || !OV.cron) return;
  const jobs = [...OV.cron].sort((a, b) => Number(b.fails_24h > 0 || b.stale) - Number(a.fails_24h > 0 || a.stale) || a.jobname.localeCompare(b.jobname));
  wrap.innerHTML = jobs.map(j => {
    const bad = j.last_status === 'failed' || j.fails_24h > 0, stale = j.stale && !bad;
    return `<div class="ov-cron-row"><span class="ov-dot ${!j.active ? 'off' : bad ? 'danger' : stale ? 'warn' : 'ok'}"></span>
      <span class="ov-cron-name" title="${escapeHtml(j.last_message || '')}">${escapeHtml(j.jobname.replace(/^bloxcore-/, ''))}</span>
      <code>${escapeHtml(j.schedule)}</code><span class="muted">${j.last_run ? timeAgo(j.last_run) : 'never'}</span>
      <span class="ov-cron-runs">${j.runs_24h} run${j.runs_24h === 1 ? '' : 's'}${j.fails_24h ? ` · <b style="color:#f87171">${j.fails_24h} failed</b>` : ''}</span></div>`;
  }).join('');
}

// ---- auto-moderation queue --------------------------------------------------------------------
const FLAG_TYPE_LABEL = { trade_listing: 'Trade listing', service_listing: 'Service listing', sea_event: 'Sea event', feed_comment: 'Comment', feed_post: 'Feed post', combo: 'Combo', giveaway: 'Giveaway', pvp_match: 'PvP match', clip: 'Clip', tier_list: 'Tier list', build: 'Build' };
const FLAG_SEV = { high: '#f87171', medium: '#fbbf24', low: '#94a3b8' };

async function loadFlags() {
  const { data, error } = await sb.from('mod_flags')
    .select('id, target_type, target_id, reasons, severity, excerpt, created_at, user:profiles!mod_flags_user_id_fkey(username, display_name)')
    .eq('status', 'open').order('created_at', { ascending: false }).limit(80);
  if (error) { logError('mod_flags load failed:', error); document.getElementById('ov-flag-list').innerHTML = '<p class="muted">Couldn\'t load flags.</p>'; return; }
  const rank = { high: 0, medium: 1, low: 2 };
  OV.flags = (data || []).sort((a, b) => rank[a.severity] - rank[b.severity] || new Date(b.created_at) - new Date(a.created_at));
  renderFlags();
}

function renderFlags() {
  const wrap = document.getElementById('ov-flag-list');
  document.querySelectorAll('[data-ov-sev]').forEach(b => {
    const on = b.dataset.ovSev === OV.sev; b.classList.toggle('btn-primary', on); b.classList.toggle('btn-ghost', !on);
    const n = b.dataset.ovSev === 'all' ? OV.flags.length : OV.flags.filter(f => f.severity === b.dataset.ovSev).length;
    b.querySelector('b').textContent = n;
  });
  document.getElementById('ov-dismiss-low').hidden = !OV.flags.some(f => f.severity === 'low');
  const rows = OV.flags.filter(f => OV.sev === 'all' || f.severity === OV.sev);
  if (!rows.length) { wrap.innerHTML = '<div class="ov-empty"><i data-lucide="shield-check"></i><p>Nothing flagged — all clear.</p></div>'; refreshIcons(); return; }
  wrap.innerHTML = rows.map(f => `
    <div class="ov-flag" style="--sev:${FLAG_SEV[f.severity]};" data-flag-id="${f.id}">
      <div class="flex-between" style="gap:10px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="ov-sev">${f.severity}</span><strong>${FLAG_TYPE_LABEL[f.target_type] || f.target_type}</strong>
          ${f.user ? `<a href="/player/?u=${encodeURIComponent(f.user.username)}" class="muted" style="font-size:0.85rem;">@${escapeHtml(f.user.username)}</a>` : ''}
          <span class="muted" style="font-size:0.78rem;">${timeAgo(f.created_at)}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" data-flag-action="dismiss" data-flag="${f.id}">Dismiss</button>
          ${f.target_type === 'giveaway' ? '<a class="btn btn-ghost btn-sm" href="/admin/giveaways/">Open queue</a>' : `<button class="btn btn-primary btn-sm" data-flag-action="remove" data-flag="${f.id}"><i data-lucide="trash-2" class="icon-sm icon-inline"></i>Remove</button>`}
        </div>
      </div>
      <div class="ov-reasons">${f.reasons.map(r => `<span class="tag">${escapeHtml(r)}</span>`).join('')}</div>
      ${f.excerpt ? `<p class="ov-excerpt">${escapeHtml(f.excerpt)}</p>` : ''}
    </div>`).join('');
  refreshIcons();
  wrap.querySelectorAll('[data-flag-action]').forEach(btn => btn.addEventListener('click', async () => {
    const action = btn.dataset.flagAction;
    if (action === 'remove' && !confirm('Remove this content from the site?')) return;
    btn.closest('.ov-flag').querySelectorAll('button').forEach(b => { b.disabled = true; });
    const { error } = await sb.rpc('review_mod_flag', { p_id: btn.dataset.flag, p_action: action });
    if (error) { showToast(error.message, true); loadFlags(); return; }
    showToast(action === 'remove' ? 'Content removed.' : 'Flag dismissed.');
    refreshOverview();
  }));
}

async function dismissLowFlags() {
  const low = OV.flags.filter(f => f.severity === 'low');
  if (!low.length || !confirm(`Dismiss all ${low.length} low-severity flag${low.length === 1 ? '' : 's'}?`)) return;
  const results = await Promise.all(low.map(f => sb.rpc('review_mod_flag', { p_id: f.id, p_action: 'dismiss' })));
  const failed = results.filter(r => r.error).length;
  showToast(failed ? `${low.length - failed} dismissed, ${failed} failed.` : `Dismissed ${low.length} low-severity flags.`, !!failed);
  refreshOverview();
}
