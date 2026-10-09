// BloxCore — /blox-fruits-value-changes/ : public log of community value changes (get_value_changes RPC).

let vcDays = 14;
let vcDir = 'all';
let vcRows = [];

function vcSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function vcSetActive(selector, active) {
  document.querySelectorAll(selector).forEach(b => {
    b.classList.toggle('btn-primary', b === active);
    b.classList.toggle('btn-ghost', b !== active);
    b.setAttribute('aria-pressed', b === active ? 'true' : 'false');
  });
}

onReady(async () => {
  document.querySelectorAll('[data-vc-days]').forEach(b => b.addEventListener('click', () => {
    vcDays = Number(b.dataset.vcDays);
    vcSetActive('[data-vc-days]', b);
    loadValueChanges();
  }));
  document.querySelectorAll('[data-vc-dir]').forEach(b => b.addEventListener('click', () => {
    vcDir = b.dataset.vcDir;
    vcSetActive('[data-vc-dir]', b);
    renderValueChanges();
  }));
  await loadValueChanges();
});

async function loadValueChanges() {
  const list = document.getElementById('vc-list');
  list.innerHTML = '<div class="skeleton" style="height:64px; margin-bottom:10px;"></div>'.repeat(4);
  const { data, error } = await sb.rpc('get_value_changes', { p_days: vcDays });
  if (error) {
    logError('get_value_changes failed:', error);
    list.innerHTML = '<div class="panel" style="padding:24px; text-align:center;"><p class="muted" style="margin:0;">Couldn\'t load value changes. Try again in a moment.</p></div>';
    return;
  }
  vcRows = data || [];
  renderValueChanges();
}

function vcRowHtml(r) {
  const up = r.new_value > r.old_value;
  const color = up ? 'var(--sea)' : '#f87171';
  const pct = r.pct === null ? '' : `${up ? '+' : ''}${Number(r.pct).toFixed(1)}%`;
  return `
    <a href="/blox-fruits-values/${vcSlug(r.name)}/" class="panel vc-row hover-lift-card" style="--vc-color:${color};">
      <span class="vc-row-img">${r.icon_url ? `<img src="${escapeHtml(r.icon_url)}" alt="" loading="lazy" width="40" height="40">` : '<i data-lucide="sparkles"></i>'}</span>
      <span class="vc-row-name"><strong>${escapeHtml(r.name)}</strong><span class="muted">${escapeHtml(r.category || '')}</span></span>
      <span class="vc-row-values"><span class="muted">${formatValue(r.old_value)}</span><i data-lucide="arrow-right" class="icon-sm"></i><strong>${formatValue(r.new_value)}</strong></span>
      <span class="vc-row-pct"><i data-lucide="${up ? 'trending-up' : 'trending-down'}" class="icon-sm icon-inline"></i>${pct}</span>
    </a>`;
}

function renderValueChanges() {
  const list = document.getElementById('vc-list');
  const summary = document.getElementById('vc-summary');
  const rows = vcRows.filter(r => vcDir === 'all' || (vcDir === 'up' ? r.new_value > r.old_value : r.new_value < r.old_value));

  // Biggest movers (one entry per item — its most recent change)
  const seen = new Set();
  const latest = vcRows.filter(r => r.pct !== null && !seen.has(r.item_id) && seen.add(r.item_id));
  const risers = [...latest].sort((a, b) => b.pct - a.pct).filter(r => r.pct > 0).slice(0, 3);
  const fallers = [...latest].sort((a, b) => a.pct - b.pct).filter(r => r.pct < 0).slice(0, 3);
  const chip = (r, up) => `<a class="vc-chip" href="/blox-fruits-values/${vcSlug(r.name)}/" style="--vc-color:${up ? 'var(--sea)' : '#f87171'};">${escapeHtml(r.name)} <strong>${up ? '+' : ''}${Number(r.pct).toFixed(1)}%</strong></a>`;
  summary.innerHTML = (risers.length || fallers.length) ? `
    <div class="vc-summary-col"><span class="vc-summary-label"><i data-lucide="trending-up" class="icon-sm icon-inline"></i>Biggest risers</span>${risers.map(r => chip(r, true)).join('') || '<span class="muted">None</span>'}</div>
    <div class="vc-summary-col"><span class="vc-summary-label"><i data-lucide="trending-down" class="icon-sm icon-inline"></i>Biggest drops</span>${fallers.map(r => chip(r, false)).join('') || '<span class="muted">None</span>'}</div>` : '';

  if (!rows.length) {
    list.innerHTML = '<div class="panel" style="padding:28px; text-align:center;"><p class="muted" style="margin:0;">No value changes in this window yet.</p></div>';
    refreshIcons();
    return;
  }

  const groups = new Map();
  rows.forEach(r => {
    const day = new Date(r.changed_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(r);
  });
  list.innerHTML = [...groups.entries()].map(([day, items]) => `
    <h2 class="vc-day">${escapeHtml(day)} <span class="muted">· ${items.length} change${items.length === 1 ? '' : 's'}</span></h2>
    <div class="vc-group">${items.map(vcRowHtml).join('')}</div>`).join('');
  refreshIcons();
}
