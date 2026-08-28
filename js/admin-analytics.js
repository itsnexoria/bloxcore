// BloxCore — Manage page "Analytics" tab. Pulls one aggregated JSON blob from
// admin_get_analytics() (SECURITY DEFINER, admin-only) instead of many separate queries.

let _analyticsTabInit = false;

async function initAnalyticsTab() {
  if (_analyticsTabInit) return;
  _analyticsTabInit = true;

  const { data, error } = await sb.rpc('admin_get_analytics');
  if (error || !data) {
    document.getElementById('analytics-stat-cards').innerHTML = errorStateHtml("Couldn't load analytics right now.", 'initAnalyticsTab()');
    refreshIcons();
    logError('admin_get_analytics failed:', error?.message);
    return;
  }

  renderStatCards(data);
  renderSignupsChart(data.signups_by_day || []);
  renderActivityBreakdown(data.activity_by_type || []);
  renderQueueHealth(data.submissions_health || {});
  renderPvpHealth(data.pvp_health || {});
  refreshIcons();
}

function renderStatCards(d) {
  const cards = [
    { label: 'Total Players', value: d.total_users, icon: 'users' },
    { label: 'New (30d)', value: d.new_users_30d, icon: 'user-plus' },
    { label: 'New (7d)', value: d.new_users_7d, icon: 'user-plus' },
    { label: 'Active Trades', value: d.active_trades, icon: 'repeat' },
    { label: 'Active Services', value: d.active_services, icon: 'hammer' },
    { label: 'Chat Msgs (30d)', value: d.chat_messages_30d, icon: 'message-circle' },
  ];
  document.getElementById('analytics-stat-cards').innerHTML = cards.map(c => `
    <div class="panel" style="padding:14px 16px;">
      <p class="muted" style="margin:0 0 6px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:6px;"><i data-lucide="${c.icon}" class="icon-sm"></i>${c.label}</p>
      <p style="margin:0; font-family:var(--font-stamp); font-size:1.4rem; color:var(--brass-bright);">${(c.value ?? 0).toLocaleString()}</p>
    </div>
  `).join('');
}

function renderSignupsChart(days) {
  const el = document.getElementById('analytics-signups-chart');
  if (!days.length) { el.innerHTML = `<p class="muted" style="font-size:0.85rem;">No data yet.</p>`; return; }
  const max = Math.max(1, ...days.map(d => d.count));
  el.innerHTML = `
    <div style="display:flex; align-items:flex-end; gap:6px; height:140px;">
      ${days.map(d => `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; justify-content:flex-end;" title="${d.date}: ${d.count} signup${d.count === 1 ? '' : 's'}">
          <span style="font-size:0.68rem; color:var(--ash);">${d.count || ''}</span>
          <div style="width:100%; max-width:22px; height:${Math.max(3, (d.count / max) * 100)}%; background:linear-gradient(180deg, var(--brass-bright), var(--brass)); border-radius:3px 3px 0 0;"></div>
        </div>
      `).join('')}
    </div>
    <div style="display:flex; gap:6px; margin-top:6px;">
      ${days.map(d => `<span style="flex:1; text-align:center; font-size:0.62rem; color:var(--ash);">${new Date(d.date).toLocaleDateString(undefined, { day: 'numeric' })}</span>`).join('')}
    </div>
  `;
}

function renderActivityBreakdown(rows) {
  const el = document.getElementById('analytics-activity-breakdown');
  if (!rows.length) { el.innerHTML = `<p class="muted" style="font-size:0.85rem;">No activity logged in the last 30 days.</p>`; return; }
  const max = Math.max(1, ...rows.map(r => r.count));
  el.innerHTML = rows.map(r => `
    <div>
      <div class="flex-between" style="font-size:0.8rem; margin-bottom:4px;">
        <span style="text-transform:capitalize;">${escapeHtml(r.type.replace(/_/g, ' '))}</span>
        <span class="muted">${r.count.toLocaleString()}</span>
      </div>
      <div style="height:6px; border-radius:3px; background:rgba(255,255,255,0.06); overflow:hidden;">
        <div style="height:100%; width:${(r.count / max) * 100}%; background:var(--sea);"></div>
      </div>
    </div>
  `).join('');
}

function renderQueueHealth(h) {
  const el = document.getElementById('analytics-queue-health');
  const total = (h.approved || 0) + (h.rejected || 0);
  const approveRate = total ? Math.round((h.approved / total) * 100) : null;
  el.innerHTML = `
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="clock" class="icon-sm icon-inline" style="color:var(--ash);"></i>Pending</span>
      <strong>${(h.pending || 0).toLocaleString()}</strong>
    </div>
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="check" class="icon-sm icon-inline" style="color:var(--gold-bright);"></i>Approved (30d)</span>
      <strong>${(h.approved || 0).toLocaleString()}</strong>
    </div>
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="x" class="icon-sm icon-inline" style="color:var(--blood-dim);"></i>Rejected (30d)</span>
      <strong>${(h.rejected || 0).toLocaleString()}</strong>
    </div>
    ${approveRate !== null ? `
      <div style="margin-top:4px;">
        <div class="flex-between" style="font-size:0.78rem; margin-bottom:4px;"><span class="muted">Approve rate</span><span class="muted">${approveRate}%</span></div>
        <div style="height:6px; border-radius:3px; background:rgba(220,38,38,0.25); overflow:hidden;">
          <div style="height:100%; width:${approveRate}%; background:var(--gold-bright);"></div>
        </div>
      </div>
    ` : ''}
  `;
}

function renderPvpHealth(h) {
  const el = document.getElementById('analytics-pvp-health');
  if (!el) return;
  const top = h.top_rated || [];
  el.innerHTML = `
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="clipboard-check" class="icon-sm icon-inline" style="color:var(--ash);"></i>Reported (30d)</span>
      <strong>${(h.reported_30d || 0).toLocaleString()}</strong>
    </div>
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="clock" class="icon-sm icon-inline" style="color:var(--ash);"></i>Pending Review</span>
      <strong>${(h.pending || 0).toLocaleString()}</strong>
    </div>
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="alert-triangle" class="icon-sm icon-inline" style="color:var(--blood-dim);"></i>Disputed</span>
      <strong>${(h.disputed || 0).toLocaleString()}</strong>
    </div>
    <div class="flex-between" style="font-size:0.85rem;">
      <span><i data-lucide="check" class="icon-sm icon-inline" style="color:var(--gold-bright);"></i>Approved (30d)</span>
      <strong>${(h.approved_30d || 0).toLocaleString()}</strong>
    </div>
    <div style="margin-top:4px;">
      <div class="flex-between" style="font-size:0.78rem; margin-bottom:4px;"><span class="muted">Dispute rate (30d)</span><span class="muted">${h.dispute_rate_30d ?? 0}%</span></div>
      <div style="height:6px; border-radius:3px; background:rgba(255,255,255,0.06); overflow:hidden;">
        <div style="height:100%; width:${Math.min(100, h.dispute_rate_30d || 0)}%; background:var(--blood-dim);"></div>
      </div>
    </div>
    ${top.length ? `
      <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--navy-light);">
        <p class="muted" style="margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">Top Rated</p>
        ${top.map((p, i) => `
          <div class="flex-between" style="font-size:0.8rem; padding:3px 0;">
            <span>#${i + 1} ${escapeHtml(p.display_name || p.username)}</span>
            <span class="muted">${p.rating} (${p.wins}W-${p.losses}L)</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}
