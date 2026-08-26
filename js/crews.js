// BloxCore — crews/index.html logic

let currentUser = null;

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  await loadCrews();
  await guardCreateButton();

  const settings = await getSiteSettings();
  document.getElementById('crew-name').minLength = settings.minCrewNameLength;
  document.getElementById('crew-description').minLength = settings.minCrewDescriptionLength;

  document.getElementById('create-crew-btn').addEventListener('click', openModal);
  document.getElementById('crew-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('crew-form').addEventListener('submit', handleCreate);
});

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

async function loadCrews() {
  const grid = document.getElementById('crews-grid');
  const rows = await fetchCrewsPage(0, CREWS_PAGE_SIZE);

  if (rows === null) {
    grid.innerHTML = `<p class="muted">Couldn't load crews right now.</p>`;
    return;
  }

  if (!rows.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No crews yet.</div>`;
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
  const { data, error } = await sb.from('crews').select('*').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
  if (error) {
    console.error(error);
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
  document.getElementById('crew-modal').style.display = 'none';
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
    const ext = logoFile.name.split('.').pop();
    const path = `crew-logos/${crewId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('avatars').upload(path, logoFile);
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
