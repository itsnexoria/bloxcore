// BloxCore — /admin/overview/ : one-screen health + queue summary for staff, plus the auto-moderation flag queue.
// Data: get_admin_overview() RPC (mod/admin only), mod_flags (staff RLS), review_mod_flag() RPC.

let overviewTimer = null;

onReady(async () => {
  const auth = await requireMod();
  if (!auth) return;
  document.getElementById('overview-content').style.display = '';
  document.getElementById('ov-refresh').addEventListener('click', refreshOverview);
  await refreshOverview();
  overviewTimer = setInterval(() => { if (!document.hidden) refreshOverview(); }, 60000);
});

function ovTile({ label, value, href, icon, warn, danger }) {
  const tone = danger && value > 0 ? 'danger' : warn && value > 0 ? 'warn' : '';
  const tag = href ? 'a' : 'div';
  return `<${tag} class="ov-tile ${tone}" ${href ? `href="${href}"` : ''}>
    <span class="ov-tile-icon"><i data-lucide="${icon}"></i></span>
    <span class="ov-tile-value">${value}</span>
    <span class="ov-tile-label">${label}</span>
  </${tag}>`;
}

async function refreshOverview() {
  const { data, error } = await sb.rpc('get_admin_overview');
  if (error) { logError('get_admin_overview failed:', error); showToast('Couldn\'t load the overview.', true); return; }
  const d = data;
  document.getElementById('ov-queues').innerHTML = [
    ovTile({ label: 'Open reports', value: d.open_reports, href: '/admin/reports/', icon: 'flag', warn: true }),
    ovTile({ label: 'Auto-mod flags', value: d.open_flags, href: '#ov-flags', icon: 'shield-alert', warn: true, danger: d.high_flags > 0 }),
    ovTile({ label: 'Submissions to review', value: d.pending_submissions, href: '/admin/', icon: 'inbox', warn: true }),
    ovTile({ label: 'Ban appeals', value: d.pending_appeals, href: '/admin/appeals/', icon: 'gavel', warn: true }),
    ovTile({ label: 'Giveaways pending', value: d.pending_giveaways + d.pending_giveaway_proofs, href: '/admin/giveaways/', icon: 'gift', warn: true }),
    ovTile({ label: 'PvP to review', value: d.pvp_to_review, href: '/admin/manage/#pvp', icon: 'swords', warn: true }),
  ].join('');
  document.getElementById('ov-health').innerHTML = [
    ovTile({ label: 'Client errors (24h)', value: d.errors_24h, href: '/admin/site/', icon: 'bug', warn: d.errors_24h > 25, danger: d.errors_24h > 100 }),
    ovTile({ label: 'Cron failures (24h)', value: d.cron_failures_24h, href: '/admin/site/', icon: 'timer-off', danger: true }),
    ovTile({ label: 'Webhook failures (24h)', value: d.webhook_failures_24h, href: '/admin/site/', icon: 'webhook', danger: true }),
  ].join('');
  document.getElementById('ov-activity').innerHTML = [
    ovTile({ label: 'Total users', value: d.total_users, icon: 'users' }),
    ovTile({ label: 'Signups (24h)', value: d.signups_24h, icon: 'user-plus' }),
    ovTile({ label: 'Signups (7d)', value: d.signups_7d, icon: 'calendar-plus' }),
    ovTile({ label: 'Active trades', value: d.active_trades, href: '/trading/', icon: 'repeat' }),
    ovTile({ label: 'Pending offers', value: d.pending_offers, icon: 'handshake' }),
    ovTile({ label: 'Sea events live', value: d.active_sea_events, href: '/sea-events/', icon: 'waves' }),
    ovTile({ label: 'Clips this week', value: d.clips_this_week, href: '/clips/', icon: 'clapperboard' }),
  ].join('');
  document.getElementById('ov-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  refreshIcons();
  await loadFlags();
}

const FLAG_TYPE_LABEL = {
  trade_listing: 'Trade listing', service_listing: 'Service listing', sea_event: 'Sea event', feed_comment: 'Comment',
  feed_post: 'Feed post', combo: 'Combo', giveaway: 'Giveaway', pvp_match: 'PvP match', clip: 'Clip',
};
const FLAG_SEV = { high: '#f87171', medium: '#fbbf24', low: '#94a3b8' };

async function loadFlags() {
  const wrap = document.getElementById('ov-flag-list');
  const { data, error } = await sb
    .from('mod_flags')
    .select('id, target_type, target_id, reasons, severity, excerpt, created_at, user:profiles!mod_flags_user_id_fkey(username, display_name, avatar_url, avatar_frame)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) { logError('mod_flags load failed:', error); wrap.innerHTML = '<p class="muted">Couldn\'t load flags.</p>'; return; }
  const rank = { high: 0, medium: 1, low: 2 };
  const rows = (data || []).sort((a, b) => rank[a.severity] - rank[b.severity] || new Date(b.created_at) - new Date(a.created_at));
  if (!rows.length) { wrap.innerHTML = '<div class="panel" style="padding:22px; text-align:center;"><p class="muted" style="margin:0;"><i data-lucide="check-circle" class="icon-sm icon-inline"></i>Nothing flagged — all clear.</p></div>'; refreshIcons(); return; }
  wrap.innerHTML = rows.map(f => `
    <div class="panel ov-flag" style="--sev:${FLAG_SEV[f.severity]};" data-flag-id="${f.id}">
      <div class="flex-between" style="gap:10px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="ov-sev">${f.severity}</span>
          <strong>${FLAG_TYPE_LABEL[f.target_type] || f.target_type}</strong>
          ${f.user ? `<a href="/player/?u=${encodeURIComponent(f.user.username)}" class="muted" style="font-size:0.85rem;">by @${escapeHtml(f.user.username)}</a>` : ''}
          <span class="muted" style="font-size:0.78rem;">${timeAgo(f.created_at)}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" data-flag-action="dismiss" data-flag="${f.id}">Dismiss</button>
          ${f.target_type === 'giveaway' ? '<a class="btn btn-ghost btn-sm" href="/admin/giveaways/">Open queue</a>' : `<button class="btn btn-primary btn-sm" data-flag-action="remove" data-flag="${f.id}"><i data-lucide="trash-2" class="icon-sm icon-inline"></i>Remove content</button>`}
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
    const { error: err } = await sb.rpc('review_mod_flag', { p_id: btn.dataset.flag, p_action: action });
    if (err) { showToast(err.message, true); loadFlags(); return; }
    showToast(action === 'remove' ? 'Content removed.' : 'Flag dismissed.');
    refreshOverview();
  }));
}
