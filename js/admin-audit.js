// BloxCore — /admin/audit/ (admin only): who did what, and when. Data: get_admin_audit_log() — rows are
// written by database triggers whenever staff ban/unban, change roles, rule on queues or remove content.

const AUDIT_PAGE_SIZE = 50;
const AUDIT_ACTIONS = [
  ['', 'All actions'], ['user:banned', 'Bans'], ['user:unbanned', 'Unbans'], ['user:role_changed', 'Role changes'],
  ['user:shadow_muted', 'Shadow mutes'], ['report', 'Reports'], ['appeal', 'Ban appeals'], ['giveaway', 'Giveaways'],
  ['submission', 'Quest submissions'], ['pvp', 'PvP rulings'], ['war', 'Crew wars'], ['flag', 'Auto-mod flags'],
  ['content:deleted', 'Content removed'], ['note:added', 'Mod notes'],
];
let auditRows = [];
let auditTotal = 0;
let auditActorId = null;
let auditTargetId = null;

onReady(async () => {
  const auth = await requireAdmin();
  if (!auth) return;
  document.getElementById('audit-content').style.display = 'block';
  document.getElementById('audit-action').innerHTML = AUDIT_ACTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  document.getElementById('audit-action').addEventListener('change', reloadAudit);
  let timer;
  ['audit-actor', 'audit-target'].forEach(id => document.getElementById(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reloadAudit, 450); }));
  document.getElementById('audit-clear').addEventListener('click', () => {
    document.getElementById('audit-action').value = '';
    document.getElementById('audit-actor').value = '';
    document.getElementById('audit-target').value = '';
    reloadAudit();
  });
  document.getElementById('audit-more').addEventListener('click', () => fetchAudit(true));
  document.getElementById('audit-export').addEventListener('click', exportAuditCsv);
  document.querySelectorAll('[data-audit-tab]').forEach(b => b.addEventListener('click', () => {
    const tab = b.dataset.auditTab;
    document.querySelectorAll('[data-audit-tab]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    document.getElementById('audit-panel-log').hidden = tab !== 'log';
    document.getElementById('audit-panel-activity').hidden = tab !== 'activity';
    if (tab === 'activity') loadActivity();
  }));
  document.getElementById('act-weeks').addEventListener('change', loadActivity);

  // Deep links: /admin/audit/?u=<username> (e.g. from a player's admin card) pre-filters to that player.
  const u = new URLSearchParams(location.search).get('u');
  if (u) document.getElementById('audit-target').value = u;
  reloadAudit();
});

async function resolveUsername(inputId) {
  const name = document.getElementById(inputId).value.trim();
  if (!name) return { id: null, ok: true };
  const { data } = await sb.from('profiles').select('id').ilike('username', name.replace(/[%_]/g, '\\$&')).limit(1);
  return data && data[0] ? { id: data[0].id, ok: true } : { id: null, ok: false };
}

async function reloadAudit() {
  const [actor, target] = await Promise.all([resolveUsername('audit-actor'), resolveUsername('audit-target')]);
  const list = document.getElementById('audit-list');
  if (!actor.ok || !target.ok) {
    auditRows = []; auditTotal = 0;
    list.innerHTML = '<div class="empty-state">No player with that username.</div>';
    document.getElementById('audit-summary').textContent = '';
    document.getElementById('audit-more').style.display = 'none';
    return;
  }
  auditActorId = actor.id; auditTargetId = target.id;
  auditRows = [];
  await fetchAudit(false);
}

async function fetchAudit(append) {
  const list = document.getElementById('audit-list');
  const action = document.getElementById('audit-action').value || null;
  if (!append) list.innerHTML = '<div class="skeleton" style="height:64px;"></div><div class="skeleton" style="height:64px;"></div>';
  const { data, error } = await sb.rpc('get_admin_audit_log', {
    p_limit: AUDIT_PAGE_SIZE, p_offset: append ? auditRows.length : 0, p_action: action, p_actor: auditActorId, p_target: auditTargetId,
  });
  if (error) { logError(error); list.innerHTML = errorStateHtml("Couldn't load the audit log.", 'reloadAudit()'); refreshIcons(); return; }
  auditRows = append ? auditRows.concat(data || []) : (data || []);
  auditTotal = data && data[0] ? Number(data[0].total) : (append ? auditTotal : 0);
  renderAudit();
}

function auditTone(action) {
  if (/banned|deleted|denied|rejected|role_changed|shadow_muted/.test(action)) return 'danger';
  if (/approved|resolved|unbanned|shadow_unmuted/.test(action)) return 'ok';
  return 'neutral';
}
function auditIcon(action) {
  const k = action.split(':')[0];
  return ({ user: 'user-cog', report: 'flag', appeal: 'gavel', giveaway: 'gift', submission: 'inbox', pvp: 'crosshair', war: 'swords', flag: 'shield-alert', content: 'trash-2', note: 'notebook-pen' })[k] || 'activity';
}

function renderAudit() {
  const list = document.getElementById('audit-list');
  document.getElementById('audit-summary').textContent = auditRows.length ? `Showing ${auditRows.length} of ${auditTotal}` : '';
  document.getElementById('audit-more').style.display = auditRows.length < auditTotal ? 'inline-flex' : 'none';
  if (!auditRows.length) { list.innerHTML = '<div class="empty-state">Nothing logged for these filters yet.</div>'; return; }
  list.innerHTML = auditRows.map(r => {
    const d = r.details || {};
    const extra = [d.reason && `Reason: ${d.reason}`, d.response && `Reply: ${d.response}`, d.note && `Note: ${d.note}`, d.excerpt && `“${d.excerpt}”`, d.title].filter(Boolean);
    return `
      <div class="audit-row audit-${auditTone(r.action)}">
        <span class="audit-icon"><i data-lucide="${auditIcon(r.action)}" class="icon-sm"></i></span>
        <div class="audit-main">
          <p class="audit-summary">${escapeHtml(r.summary)}</p>
          ${extra.length ? `<p class="audit-extra">${extra.map(escapeHtml).join(' · ')}</p>` : ''}
          <p class="audit-meta"><span class="audit-action">${escapeHtml(r.action)}</span>
            by ${r.actor_username ? `<a href="/player/?u=${encodeURIComponent(r.actor_username)}">@${escapeHtml(r.actor_username)}</a>` : '<span>unknown</span>'}
            ${r.target_username ? ` · about <a href="/admin/audit/?u=${encodeURIComponent(r.target_username)}">@${escapeHtml(r.target_username)}</a>` : ''}</p>
        </div>
        <time class="audit-time" datetime="${r.created_at}" title="${new Date(r.created_at).toLocaleString()}">${timeAgo(r.created_at)}</time>
      </div>`;
  }).join('');
  refreshIcons();
}

function exportAuditCsv() {
  if (!auditRows.length) { showToast('Nothing to export.', true); return; }
  // Prefix cells that start like a spreadsheet formula so opening the CSV in Excel can't run them.
  const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const lines = [['time', 'staff', 'action', 'player', 'summary'].join(',')].concat(
    auditRows.map(r => [r.created_at, r.actor_username, r.action, r.target_username, r.summary].map(q).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bloxcore-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Mod activity: actions per mod per week ----
async function loadActivity() {
  const weeks = Number(document.getElementById('act-weeks').value) || 8;
  const out = document.getElementById('act-table');
  out.innerHTML = '<div class="skeleton" style="height:48px;"></div>';
  const { data, error } = await sb.rpc('get_mod_activity_stats', { p_weeks: weeks });
  if (error) { logError(error); out.innerHTML = errorStateHtml("Couldn't load activity.", 'loadActivity()'); refreshIcons(); return; }
  const rows = data || [];
  if (!rows.length) { out.innerHTML = '<div class="empty-state">No staff actions logged in this range yet.</div>'; return; }

  // Build the week columns (oldest -> newest), including quiet weeks.
  const monday = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const weekKeys = [];
  const start = monday(Date.now());
  for (let i = weeks - 1; i >= 0; i--) { const d = new Date(start); d.setUTCDate(d.getUTCDate() - i * 7); weekKeys.push(d.toISOString().slice(0, 10)); }

  const byMod = new Map();
  rows.forEach(r => {
    const key = r.actor_id || 'unknown';
    if (!byMod.has(key)) byMod.set(key, { name: r.actor_username || 'former staff', weeks: {}, total: 0, bans: 0, rulings: 0, removals: 0, notes: 0 });
    const m = byMod.get(key);
    m.weeks[String(r.week_start).slice(0, 10)] = Number(r.actions);
    m.total += Number(r.actions); m.bans += Number(r.bans); m.rulings += Number(r.rulings); m.removals += Number(r.removals); m.notes += Number(r.notes);
  });
  const mods = [...byMod.values()].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...mods.flatMap(m => Object.values(m.weeks)));

  out.innerHTML = `<div style="overflow-x:auto;"><table class="act-table"><thead><tr><th>Staff</th>${weekKeys.map(k => `<th>${new Date(k + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</th>`).join('')}<th>Total</th><th>Bans</th><th>Rulings</th><th>Removals</th><th>Notes</th></tr></thead>
    <tbody>${mods.map(m => `<tr><td>@${escapeHtml(m.name)}</td>${weekKeys.map(k => { const n = m.weeks[k] || 0; return `<td class="act-cell" style="--w:${Math.round((n / max) * 100)}%;">${n || '·'}</td>`; }).join('')}<td class="act-total">${m.total}</td><td>${m.bans}</td><td>${m.rulings}</td><td>${m.removals}</td><td>${m.notes}</td></tr>`).join('')}</tbody></table></div>`;
}
