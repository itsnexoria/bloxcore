// BloxCore — /scam-check/ : public trust lookup (get_trust_card RPC — counts only, no reporter identities).

const RISK_META = {
  trusted: { label: 'Looks trusted', icon: 'shield-check', color: 'var(--sea)', blurb: 'Good track record on BloxCore. Still use common sense — never share passwords or trade outside the game.' },
  neutral: { label: 'No red flags', icon: 'shield', color: 'var(--brass-bright)', blurb: 'Nothing concerning on record, but not much history either. Start small and use the trade confirmation.' },
  caution: { label: 'Be careful', icon: 'shield-alert', color: '#fbbf24', blurb: 'Some warning signs. Trade carefully, ask for vouches, and don\'t go first on big trades.' },
  high: { label: 'High risk', icon: 'shield-x', color: '#f87171', blurb: 'Serious warning signs on record. We recommend not trading with this account.' },
};

onReady(async () => {
  const form = document.getElementById('sc-form');
  const input = document.getElementById('sc-input');
  form.addEventListener('submit', (e) => { e.preventDefault(); lookup(input.value); });
  const initial = new URLSearchParams(location.search).get('u');
  if (initial) { input.value = initial; lookup(initial); }
});

async function lookup(raw) {
  const name = (raw || '').trim().replace(/^@/, '');
  const out = document.getElementById('sc-result');
  if (!name) return;
  history.replaceState(null, '', `?u=${encodeURIComponent(name)}`);
  out.innerHTML = '<div class="skeleton" style="height:220px;"></div>';
  const { data, error } = await sb.rpc('get_trust_card', { p_username: name });
  if (error) { logError('get_trust_card failed:', error); out.innerHTML = '<div class="panel" style="padding:22px;"><p class="muted" style="margin:0;">Lookup failed — try again.</p></div>'; return; }
  if (!data) { out.innerHTML = `<div class="panel" style="padding:22px; text-align:center;"><p style="margin:0 0 6px; font-weight:700;">No BloxCore user called "${escapeHtml(name)}"</p><p class="muted" style="margin:0; font-size:0.85rem;">Check the spelling. If someone is trading with you under a name that isn't on BloxCore, treat that as a warning sign too.</p></div>`; return; }

  const meta = RISK_META[data.risk] || RISK_META.neutral;
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(data.created_at).getTime()) / 86400000));
  const age = ageDays >= 365 ? `${Math.floor(ageDays / 365)}y ${Math.floor((ageDays % 365) / 30)}mo` : ageDays >= 30 ? `${Math.floor(ageDays / 30)} months` : `${ageDays} day${ageDays === 1 ? '' : 's'}`;
  const stat = (v, l) => `<div class="sc-stat"><strong>${v}</strong><span>${l}</span></div>`;
  out.innerHTML = `
    <div class="panel sc-card" style="--risk:${meta.color};">
      <div class="sc-head">
        ${avatarHtml(data, 56)}
        <div style="flex:1; min-width:0;">
          <p style="margin:0; font-size:1.25rem; font-weight:700; color:var(--bone);">${escapeHtml(displayNameFor(data))}</p>
          <p class="muted" style="margin:0; font-size:0.85rem;">@${escapeHtml(data.username)} · level ${data.level ?? 1} · joined ${age} ago</p>
        </div>
        <span class="sc-risk"><i data-lucide="${meta.icon}" class="icon-md icon-inline"></i>${meta.label}</span>
      </div>
      <p class="sc-blurb">${meta.blurb}</p>
      <div class="sc-stats">
        ${stat(data.vouches_pos, 'Positive vouches')}${stat(data.vouches_neg, 'Negative vouches')}
        ${stat(data.confirmed_trades, 'Confirmed trades')}${stat(data.completed_trades, 'Completed trades')}
        ${stat(data.reports_upheld, 'Reports upheld')}
      </div>
      ${data.reasons?.length ? `<ul class="sc-reasons">${data.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:14px;">
        <a class="btn btn-ghost btn-sm" href="/player/?u=${encodeURIComponent(data.username)}"><i data-lucide="user" class="icon-sm icon-inline"></i>View profile</a>
      </div>
    </div>
    <p class="muted" style="font-size:0.75rem; margin-top:10px;">This is an automatic summary of public activity, not a guarantee. Open reports are never shown — only ones moderators upheld.</p>`;
  refreshIcons();
}
