// BloxCore — /status/index.html logic
// Every check here is a real network call made right now in the visitor's browser —
// there's no historical uptime data behind this (that would need an external monitoring
// service this project doesn't have), so this deliberately doesn't claim an uptime
// percentage or a "last incident" history. It's a pass/fail snapshot, not a status-page-
// as-a-service replacement.

const STATUS_THRESHOLDS = { degradedMs: 1500 };

async function timeIt(fn) {
  const start = performance.now();
  try {
    await fn();
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - start), error: e };
  }
}

async function checkWebsite() {
  // If this script is running at all, the page (and its host — Cloudflare/GitHub Pages)
  // is up. No network call needed.
  return { ok: true, ms: 0 };
}

async function checkDatabase() {
  return timeIt(async () => {
    const { error } = await sb.from('site_settings').select('key').limit(1);
    if (error) throw error;
  });
}

async function checkAuth() {
  return timeIt(async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

async function checkStorage() {
  return timeIt(async () => {
    const { error } = await sb.storage.from('avatars').list('', { limit: 1 });
    if (error) throw error;
  });
}

const CHECKS = [
  { key: 'website', label: 'Website', icon: 'globe', run: checkWebsite },
  { key: 'database', label: 'Database', icon: 'database', run: checkDatabase },
  { key: 'auth', label: 'Authentication', icon: 'shield-check', run: checkAuth },
  { key: 'storage', label: 'File Storage', icon: 'hard-drive', run: checkStorage },
];

onReady(async () => {
  await runAllChecks();
  document.getElementById('status-recheck-btn').addEventListener('click', runAllChecks);
});

async function runAllChecks() {
  const listEl = document.getElementById('status-checks');
  const overallEl = document.getElementById('status-overall');
  listEl.innerHTML = CHECKS.map(c => `
    <div class="panel" style="display:flex; align-items:center; gap:14px;" id="status-row-${c.key}">
      <div class="skeleton" style="width:36px; height:36px; border-radius:10px; flex-shrink:0;"></div>
      <div style="flex:1;"><p style="margin:0; font-weight:700;">${c.label}</p><p class="muted" style="margin:2px 0 0; font-size:0.8rem;">Checking…</p></div>
    </div>
  `).join('');

  const results = await Promise.all(CHECKS.map(async c => ({ ...c, result: await c.run() })));

  listEl.innerHTML = results.map(c => {
    const status = statusFor(c.result);
    return `
      <div class="panel" style="display:flex; align-items:center; gap:14px;">
        <span class="icon-badge" data-tone="${status.tone}" style="flex-shrink:0;"><i data-lucide="${c.icon}" class="icon-sm"></i></span>
        <div style="flex:1;">
          <p style="margin:0; font-weight:700;">${c.label}</p>
          <p class="muted" style="margin:2px 0 0; font-size:0.8rem;">${status.label}${c.result.ok ? ` · ${c.result.ms}ms` : ''}</p>
        </div>
        <span style="width:10px; height:10px; border-radius:50%; background:${status.dot}; flex-shrink:0;" aria-hidden="true"></span>
      </div>
    `;
  }).join('');
  refreshIcons();

  const allOk = results.every(r => r.result.ok);
  const anySlow = results.some(r => r.result.ok && r.result.ms > STATUS_THRESHOLDS.degradedMs);
  const overall = !allOk
    ? { tone: 'blood', dot: 'var(--blood)', title: 'Some systems are down', sub: "One or more checks failed just now — this could be temporary, try re-checking in a minute." }
    : anySlow
    ? { tone: 'gold', dot: 'var(--gold)', title: 'Operational, but slower than usual', sub: 'Everything responded, just not as fast as expected.' }
    : { tone: 'sea', dot: 'var(--sea)', title: 'All systems operational', sub: 'Every check passed just now.' };

  overallEl.innerHTML = `
    <span class="icon-badge" data-tone="${overall.tone}" style="width:44px; height:44px; flex-shrink:0;"><i data-lucide="${allOk ? 'check' : 'triangle-alert'}" class="icon-md"></i></span>
    <div>
      <p style="margin:0; font-weight:700; font-size:1.05rem;">${overall.title}</p>
      <p class="muted" style="margin:2px 0 0; font-size:0.82rem;">${overall.sub} Checked at ${new Date().toLocaleTimeString()}.</p>
    </div>
  `;
  refreshIcons();
}

function statusFor(result) {
  if (!result.ok) return { tone: 'blood', dot: 'var(--blood)', label: 'Down' };
  if (result.ms > STATUS_THRESHOLDS.degradedMs) return { tone: 'gold', dot: 'var(--gold)', label: 'Slow' };
  return { tone: 'sea', dot: 'var(--sea)', label: 'Operational' };
}
