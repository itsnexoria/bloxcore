// BloxCore — crews/index.html logic

let currentUser = null;

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  await loadCrews();
  await guardCreateButton();

  const settings = await getSiteSettings();
  document.getElementById('crew-name').minLength = settings.minCrewNameLength;
  document.getElementById('crew-name').maxLength = settings.maxCrewNameLength;
  document.getElementById('crew-description').minLength = settings.minCrewDescriptionLength;
  document.getElementById('crew-description').maxLength = settings.maxCrewDescriptionLength;

  document.getElementById('create-crew-btn').addEventListener('click', openModal);
  document.getElementById('crew-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('crew-form').addEventListener('submit', handleCreate);
  document.getElementById('crews-recruiting-toggle').addEventListener('click', () => {
    recruitingOnly = !recruitingOnly;
    const btn = document.getElementById('crews-recruiting-toggle');
    btn.className = `btn btn-sm ${recruitingOnly ? 'btn-primary' : 'btn-ghost'}`;
    document.getElementById('crews-grid').innerHTML = `<div class="skeleton" style="height:160px;"></div>`;
    loadCrews();
  });

  document.querySelectorAll('#crews-page-tabs [data-page-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchPageTab(btn.dataset.pageTab));
  });
});

// Top-level Crews / Crew Wars / Weekly Leaderboard tabs. Crew Wars and Weekly
// Leaderboard are both loaded lazily the first time their tab is opened.
let pageTab = 'crews';
let _weeklyLoaded = false;

function switchPageTab(tab) {
  if (tab === pageTab) return;
  pageTab = tab;
  document.querySelectorAll('#crews-page-tabs [data-page-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.pageTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('crews-page-tab-crews').style.display = tab === 'crews' ? '' : 'none';
  document.getElementById('crews-page-tab-wars').style.display = tab === 'wars' ? '' : 'none';
  document.getElementById('crews-page-tab-weekly').style.display = tab === 'weekly' ? '' : 'none';

  if (tab === 'wars') initCrewWarsHub();
  if (tab === 'weekly' && !_weeklyLoaded) { _weeklyLoaded = true; loadWeeklyCrewLeaderboard(); }
}

async function loadWeeklyCrewLeaderboard() {
  const el = document.getElementById('weekly-crew-leaderboard');
  const { data, error } = await sb.rpc('get_crew_weekly_leaderboard');

  if (error || !data?.length) {
    el.innerHTML = `<p class="muted" style="padding:20px; margin:0;">No crew activity in the last 7 days yet.</p>`;
    return;
  }

  el.innerHTML = data.map((c, i) => {
    const rank = i + 1;
    const podium = rank <= 3;
    return `
    <div class="flex-between${podium ? ' lb-row-podium' : ''}" ${podium ? `data-rank="${rank}"` : ''} style="padding:12px 20px; ${i === data.length - 1 || podium ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="${podium ? 'lb-podium-rank' : ''}" style="font-family:var(--font-mono); color:var(--ash); width:22px;">${podium ? `<i data-lucide="${rank === 1 ? 'crown' : 'medal'}" class="icon-sm"></i>` : `#${rank}`}</span>
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" loading="lazy" style="width:32px; height:32px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.style.visibility='hidden';">`
          : `<div style="width:32px; height:32px; border-radius:8px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0; color:var(--ash);">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <div>
          <a href="/crew/?name=${encodeURIComponent(c.name)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)}</a>
          <p class="muted" style="margin:0; font-size:0.72rem;">${c.member_count} member${c.member_count === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div style="text-align:right;">
        <p style="margin:0; font-family:var(--font-mono); color:var(--brass-bright);">${Number(c.weekly_xp).toLocaleString()} XP</p>
        <p class="muted" style="margin:0; font-size:0.72rem;">${c.weekly_completions} bounties</p>
      </div>
    </div>
  `;
  }).join('');
  refreshIcons();
}

// Every player can only ever be in one crew at a time (the DB enforces this with a unique
// constraint), so hide the confusing "you're already in a crew" error at submit time —
// just tell them up front and point them at the crew they're already in.
async function guardCreateButton() {
  const btn = document.getElementById('create-crew-btn');
  if (!currentUser) {
    btn.disabled = true;
    btn.title = 'Sign in to create a crew';
    return;
  }

  const { data } = await sb.from('crew_members').select('crews(name)').eq('user_id', currentUser.id).maybeSingle();
  if (data?.crews) {
    btn.textContent = 'Already in a Crew';
    btn.disabled = true;
    btn.title = `You're already in ${data.crews.name} — leave it first to create a new one.`;
  }
}

const CREWS_PAGE_SIZE = 20;
let recruitingOnly = false;

async function loadCrews() {
  const grid = document.getElementById('crews-grid');
  const rows = await fetchCrewsPage(0, CREWS_PAGE_SIZE);

  if (rows === null) {
    grid.innerHTML = errorStateHtml("Couldn't load crews right now.", 'loadCrews()');
    refreshIcons();
    return;
  }

  if (!rows.length) {
    grid.innerHTML = recruitingOnly
      ? `<div class="empty-state" style="grid-column:1/-1;">No crews are actively recruiting right now — check back later.</div>`
      : `<div class="empty-state" style="grid-column:1/-1;">No crews yet.</div>`;
    return;
  }

  grid.innerHTML = rows.map(renderCrewCard).join('');
  refreshIcons();

  attachLoadMore(grid, {
    pageSize: CREWS_PAGE_SIZE,
    initialOffset: rows.length,
    fetchPage: (offset, pageSize) => fetchCrewsPage(offset, pageSize).then(r => r || []),
    renderItem: renderCrewCard,
    onAppend: refreshIcons,
  });
}

// Fetches one page of crews plus a bounty total (sum of members' pirate_bounty) for
// just those crews — scoped per page instead of pulling every crew's members at once.
async function fetchCrewsPage(offset, pageSize) {
  let query = sb.from('crews').select('*').order('created_at', { ascending: false });
  if (recruitingOnly) query = query.eq('recruiting', true);
  const { data, error } = await query.range(offset, offset + pageSize - 1);
  if (error) {
    logError(error);
    return null;
  }
  if (!data.length) return data;

  const bountyByCrew = {};
  const countByCrew = {};
  const { data: members } = await sb.from('crew_members').select('crew_id, profiles(pirate_bounty)').in('crew_id', data.map(c => c.id));
  (members || []).forEach(m => {
    bountyByCrew[m.crew_id] = (bountyByCrew[m.crew_id] || 0) + (m.profiles?.pirate_bounty || 0);
    countByCrew[m.crew_id] = (countByCrew[m.crew_id] || 0) + 1;
  });
  data.forEach(c => { c._bounty = bountyByCrew[c.id] || 0; c._memberCount = countByCrew[c.id] || 0; });
  return data;
}

function renderCrewCard(c) {
  return `
    <div class="panel crew-card hover-lift-card">
      <div class="crew-card-top">
        ${c.logo_url
          ? `<img src="${c.logo_url}" alt="" loading="lazy" class="crew-card-logo" onerror="this.style.display='none';">`
          : `<div class="crew-card-logo crew-card-logo-fallback">${escapeHtml((c.name[0] || '?').toUpperCase())}</div>`}
        <div style="min-width:0; flex:1;">
          <h3 title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</h3>
          ${c.tag ? `<span class="tag tag-legendary">${escapeHtml(c.tag)}</span>` : ''}
          ${c.recruiting ? `<span class="tag" style="background:rgb(52 211 153 / 0.15); color:var(--sea); margin-left:4px;"><i data-lucide="user-plus" class="icon-sm icon-inline"></i>Recruiting</span>` : ''}
        </div>
        <div class="crew-card-bounty">
          <p class="muted">Bounty</p>
          <p>${formatBounty(c._bounty || 0)}</p>
        </div>
      </div>
      <p class="muted crew-card-desc">${escapeHtml(c.description)}</p>
      <div class="crew-card-footer">
        <span class="muted crew-card-members"><i data-lucide="users" class="icon-sm icon-inline"></i>${c._memberCount} member${c._memberCount === 1 ? '' : 's'}</span>
        <a href="/crew/?name=${encodeURIComponent(c.name)}" class="btn btn-primary btn-sm">View Crew</a>
      </div>
    </div>
  `;
}

function openModal() {
  if (!currentUser) {
    window.location.href = '/auth/';
    return;
  }
  document.getElementById('crew-error').style.display = 'none';
  document.getElementById('crew-form').reset();
  document.getElementById('crew-modal').style.display = 'flex';
}

function closeModal() {
  hideModalById('crew-modal');
}

async function handleCreate(e) {
  e.preventDefault();
  const errorEl = document.getElementById('crew-error');
  const saveBtn = e.target.querySelector('button[type="submit"]');
  errorEl.style.display = 'none';

  const discordInvite = document.getElementById('crew-discord').value.trim();
  const logoFile = document.getElementById('crew-logo-file').files[0];
  const name = document.getElementById('crew-name').value.trim();
  const description = document.getElementById('crew-description').value.trim();
  const settings = await getSiteSettings();

  if (!logoFile) {
    errorEl.textContent = 'A crew icon is required.';
    errorEl.style.display = 'block';
    return;
  }
  if (logoFile.size > 3 * 1024 * 1024) {
    errorEl.textContent = 'Crew icon must be 3MB or smaller.';
    errorEl.style.display = 'block';
    return;
  }
  if (name.length < settings.minCrewNameLength) {
    errorEl.textContent = `Crew name must be at least ${settings.minCrewNameLength} characters.`;
    errorEl.style.display = 'block';
    return;
  }
  if (description.length < settings.minCrewDescriptionLength) {
    errorEl.textContent = `Description must be at least ${settings.minCrewDescriptionLength} characters.`;
    errorEl.style.display = 'block';
    return;
  }
  if (discordInvite && safeUrl(discordInvite) === '#') {
    errorEl.textContent = "That Discord invite doesn't look like a valid web address.";
    errorEl.style.display = 'block';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Creating…';

  const { data: crewId, error } = await sb.rpc('create_crew', {
    p_name: document.getElementById('crew-name').value.trim(),
    p_tag: document.getElementById('crew-tag').value.trim() || null,
    p_description: document.getElementById('crew-description').value.trim(),
    p_roblox_username: document.getElementById('crew-roblox').value.trim() || null,
    p_discord_invite: document.getElementById('crew-discord').value.trim() || null,
  });

  if (!error && logoFile && crewId) {
    const compressed = await compressImage(logoFile, { maxDimension: 512, quality: 0.85 });
    const ext = compressed.name ? compressed.name.split('.').pop() : logoFile.name.split('.').pop();
    const path = `crew-logos/${crewId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('avatars').upload(path, compressed);
    if (!uploadError) {
      const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
      await sb.from('crews').update({ logo_url: urlData.publicUrl }).eq('id', crewId);
    }
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Create';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  window.location.href = `/crew/?name=${encodeURIComponent(document.getElementById('crew-name').value.trim())}`;
}
