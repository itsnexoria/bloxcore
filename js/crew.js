// BloxCore — crew/index.html logic

let currentUser = null;
let crew = null;
let myMembership = null; // { crew_id } if in any crew

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  const params = new URLSearchParams(window.location.search);
  const name = params.get('name');
  if (!name) {
    document.getElementById('crew-content').innerHTML = `<div class="empty-state">No crew specified.</div>`;
    return;
  }

  const { data, error } = await sb.from('crews').select('*').eq('name', name).single();
  if (error || !data) {
    document.getElementById('crew-content').innerHTML = `<div class="empty-state">Couldn't find a crew named "${escapeHtml(name)}".</div>`;
    return;
  }
  crew = data;
  document.title = `${crew.name} — BloxCore`;

  if (currentUser) {
    const { data: membership } = await sb.from('crew_members').select('crew_id').eq('user_id', currentUser.id).maybeSingle();
    myMembership = membership;
  }

  await render();

  document.getElementById('edit-crew-form').addEventListener('submit', handleEditCrew);
  document.getElementById('edit-crew-cancel').addEventListener('click', closeEditModal);
});

async function render() {
  const { data: members, error } = await sb
    .from('crew_members')
    .select('user_id, role, joined_at, profiles(username, display_name, level, pirate_bounty, titles(name, color))')
    .eq('crew_id', crew.id)
    .order('role', { ascending: true });

  if (error) {
    document.getElementById('crew-content').innerHTML = `<p class="muted">Couldn't load crew members.</p>`;
    console.error(error);
    return;
  }

  const totalBounty = members.reduce((sum, m) => sum + (m.profiles?.pirate_bounty || 0), 0);

  const isLeader = currentUser && crew.leader_id === currentUser.id;
  const isMember = myMembership && myMembership.crew_id === crew.id;
  const inAnotherCrew = myMembership && myMembership.crew_id !== crew.id;

  let actionHtml;
  if (!currentUser) {
    actionHtml = `<a href="/auth/" class="btn btn-primary">Sign in to Join</a>`;
  } else if (isLeader) {
    actionHtml = `<div style="display:flex; gap:10px;"><button class="btn btn-ghost" id="edit-crew-btn">Edit Crew</button><button class="btn btn-danger" id="delete-crew-btn">Delete Crew</button></div>`;
  } else if (isMember) {
    actionHtml = `<button class="btn btn-ghost" id="leave-crew-btn">Leave Crew</button>`;
  } else if (inAnotherCrew) {
    actionHtml = `<button class="btn btn-ghost" disabled title="Leave your current crew first">Already in a Crew</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary" id="join-crew-btn">Join Crew</button>`;
  }

  const bountyHtml = `
    <div style="text-align:right; flex-shrink:0;">
      <p class="muted" style="margin:0; font-size:0.62rem; text-transform:uppercase; letter-spacing:0.05em;">Crew Bounty</p>
      <p style="margin:0; font-family:var(--font-stamp); font-size:1.4rem; color:var(--gold-bright); text-shadow:0 0 14px rgb(var(--gold-rgb) / 0.4); display:flex; align-items:center; gap:6px; justify-content:flex-end;">
        <i data-lucide="skull" class="icon-md" style="color:var(--gold);"></i>${formatBounty(totalBounty)}
      </p>
    </div>
  `;

  const robloxUsername = crew.roblox_username ? escapeHtml(crew.roblox_username) : '';

  document.getElementById('crew-content').innerHTML = `
    <div class="panel">
      <div class="flex-between" style="align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:16px;">
          ${crew.logo_url
            ? `<img src="${crew.logo_url}" alt="" style="width:68px; height:68px; border-radius:var(--radius); object-fit:cover; flex-shrink:0; box-shadow:0 0 0 1px var(--glass-border), 0 6px 20px rgb(var(--shadow-rgb) / 0.4), 0 0 24px rgb(var(--purple-rgb) / 0.3);" onerror="this.style.display='none';">`
            : `<div style="width:68px; height:68px; border-radius:var(--radius); background:linear-gradient(150deg, var(--navy-light), var(--navy)); display:flex; align-items:center; justify-content:center; color:var(--ash); font-family:var(--font-stamp); font-size:1.5rem; flex-shrink:0;">${escapeHtml((crew.name[0] || '?').toUpperCase())}</div>`}
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <h1 style="font-size:1.5rem; margin:0;">${escapeHtml(crew.name)}</h1>
              ${crew.tag ? `<span class="tag tag-legendary">${escapeHtml(crew.tag)}</span>` : ''}
            </div>
            <p class="muted" style="margin:4px 0 0; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
              <i data-lucide="users" class="icon-sm"></i>${members.length}/30 members
              <span style="opacity:0.5;">·</span>
              <i data-lucide="calendar" class="icon-sm"></i>founded ${formatDate(crew.created_at)}
            </p>
          </div>
        </div>
        ${bountyHtml}
      </div>
      <p style="margin:18px 0 0; color:var(--ash);">${escapeHtml(crew.description)}</p>
      <div style="display:flex; gap:14px; margin-top:20px; flex-wrap:wrap; align-items:center;">
        ${robloxUsername ? `<a href="https://www.roblox.com/users/profile?username=${encodeURIComponent(robloxUsername)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm"><i data-lucide="external-link" class="icon-sm icon-inline"></i>${robloxUsername} on Roblox</a>` : ''}
        ${crew.discord_invite ? `<a href="${escapeHtml(crew.discord_invite)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm"><i data-lucide="message-circle" class="icon-sm icon-inline"></i>Join Discord</a>` : ''}
        ${actionHtml}
      </div>
    </div>

    ${isLeader ? `
    <div class="panel" style="margin-top:20px;">
      <h3 style="font-size:1rem; margin-bottom:10px;">Add a Member</h3>
      <form id="add-member-form" style="display:flex; gap:10px; align-items:flex-start; position:relative;">
        <div style="flex:1; position:relative;">
          <input type="text" id="add-member-username" placeholder="Search a BloxCore username…" autocomplete="off" style="margin:0; width:100%;" ${members.length >= 30 ? 'disabled' : ''}>
          <div id="add-member-suggestions" class="autocomplete-list"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm" ${members.length >= 30 ? 'disabled' : ''}>Add</button>
      </form>
      <p class="field-error" id="add-member-error" style="display:none;"></p>
    </div>` : ''}

    <div class="panel" style="margin-top:20px; padding:0;">
      ${members.map((m, i) => renderMemberRow(m, i === members.length - 1, isLeader)).join('')}
    </div>
  `;
  refreshIcons();

  document.getElementById('join-crew-btn')?.addEventListener('click', handleJoin);
  document.getElementById('leave-crew-btn')?.addEventListener('click', () => handleLeave(currentUser.id));
  document.getElementById('delete-crew-btn')?.addEventListener('click', handleDelete);
  document.getElementById('edit-crew-btn')?.addEventListener('click', openEditModal);
  document.getElementById('add-member-form')?.addEventListener('submit', handleAddMember);
  wireAddMemberAutocomplete(members);
  document.querySelectorAll('[data-kick]').forEach(btn => {
    btn.addEventListener('click', () => handleLeave(btn.dataset.kick));
  });
}

function renderMemberRow(m, isLast, isLeader) {
  const p = m.profiles;
  const canKick = isLeader && m.role !== 'leader';
  return `
    <div class="flex-between" style="padding:12px 20px; ${isLast ? '' : 'border-bottom:1px solid var(--navy-light);'}">
      <div>
        ${titleBadge(p)}
        <a href="/player/?u=${encodeURIComponent(p.username)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(displayNameFor(p))}</a>
        ${m.role === 'leader' ? `<span class="muted" style="font-size:0.78rem; margin-left:6px;"><i data-lucide="star" class="icon-sm"></i> Leader</span>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="muted" style="font-size:0.82rem; font-family:var(--font-mono);">Lv. ${p.level}</span>
        ${canKick ? `<button class="btn btn-danger btn-sm" data-kick="${m.user_id}">Remove</button>` : ''}
      </div>
    </div>
  `;
}

function wireAddMemberAutocomplete(currentMembers) {
  const input = document.getElementById('add-member-username');
  const box = document.getElementById('add-member-suggestions');
  if (!input) return;

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (!query) { box.classList.remove('open'); box.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      const existingIds = new Set(currentMembers.map(m => m.user_id));
      const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(8);

      if (error) {
        box.innerHTML = `<div class="autocomplete-empty">Couldn't search right now.</div>`;
        box.classList.add('open');
        console.error(error);
        return;
      }

      const candidates = (data || []).filter(u => !existingIds.has(u.id));
      box.innerHTML = candidates.length
        ? candidates.map(u => `
            <div class="autocomplete-item" data-pick-username="${escapeHtml(u.username)}">
              ${avatarHtml(u, 26)}
              ${escapeHtml(displayNameFor(u))} <span class="muted" style="font-size:0.78rem;">@${escapeHtml(u.username)}</span>
            </div>
          `).join('')
        : `<div class="autocomplete-empty">No matching players.</div>`;
      box.classList.add('open');

      box.querySelectorAll('[data-pick-username]').forEach(item => {
        item.addEventListener('click', () => {
          input.value = item.dataset.pickUsername;
          box.classList.remove('open');
          box.innerHTML = '';
        });
      });
    }, 250);
  });

  // render() calls this again after every member added/removed — guard so we don't stack up
  // a fresh document-level click listener each time.
  if (!box.dataset.wired) {
    box.dataset.wired = '1';
    document.addEventListener('click', (e) => {
      if (!box.contains(e.target) && e.target !== input) box.classList.remove('open');
    });
  }
}

async function handleAddMember(e) {
  e.preventDefault();
  const input = document.getElementById('add-member-username');
  const errorEl = document.getElementById('add-member-error');
  const username = input.value.trim();
  errorEl.style.display = 'none';
  if (!username) return;

  document.getElementById('add-member-suggestions')?.classList.remove('open');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const { error } = await sb.rpc('add_crew_member', { p_crew_id: crew.id, p_username: username });

  submitBtn.disabled = false;

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  input.value = '';
  showToast(`Added ${username} to the crew.`);
  await render();
}

function openEditModal() {
  document.getElementById('edit-crew-name').value = crew.name;
  document.getElementById('edit-crew-tag').value = crew.tag || '';
  document.getElementById('edit-crew-description').value = crew.description || '';
  document.getElementById('edit-crew-logo').value = crew.logo_url || '';
  document.getElementById('edit-crew-roblox').value = crew.roblox_username || '';
  document.getElementById('edit-crew-discord').value = crew.discord_invite || '';
  document.getElementById('edit-crew-error').style.display = 'none';
  document.getElementById('edit-crew-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-crew-modal').style.display = 'none';
}

async function handleEditCrew(e) {
  e.preventDefault();
  const errorEl = document.getElementById('edit-crew-error');
  const btn = e.target.querySelector('button[type="submit"]');
  errorEl.style.display = 'none';
  btn.disabled = true;

  const updates = {
    name: document.getElementById('edit-crew-name').value.trim(),
    tag: document.getElementById('edit-crew-tag').value.trim() || null,
    description: document.getElementById('edit-crew-description').value.trim(),
    logo_url: document.getElementById('edit-crew-logo').value.trim() || null,
    roblox_username: document.getElementById('edit-crew-roblox').value.trim() || null,
    discord_invite: document.getElementById('edit-crew-discord').value.trim() || null,
  };

  const { error } = await sb.from('crews').update(updates).eq('id', crew.id);
  btn.disabled = false;

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  const nameChanged = updates.name !== crew.name;
  crew = { ...crew, ...updates };
  closeEditModal();
  showToast('Crew updated.');

  if (nameChanged) {
    // The URL is keyed by name — keep it in sync so refreshes/shares still resolve.
    window.history.replaceState(null, '', `/crew/?name=${encodeURIComponent(crew.name)}`);
    document.title = `${crew.name} — BloxCore`;
  }
  await render();
}

async function handleJoin() {
  const { error } = await sb.rpc('join_crew', { p_crew_id: crew.id });
  if (error) {
    showToast(error.message, true);
    return;
  }
  myMembership = { crew_id: crew.id };
  showToast('Joined the crew!');
  await render();
}

async function handleLeave(userId) {
  const isSelf = userId === currentUser?.id;
  if (!window.confirm(isSelf ? 'Leave this crew?' : 'Remove this member from the crew?')) return;

  const { error } = await sb.from('crew_members').delete().eq('crew_id', crew.id).eq('user_id', userId);
  if (error) {
    showToast(error.message, true);
    return;
  }
  if (isSelf) myMembership = null;
  showToast(isSelf ? 'You left the crew.' : 'Member removed.');
  await render();
}

async function handleDelete() {
  if (!window.confirm(`Delete "${crew.name}"? This removes the crew for all members and can't be undone.`)) return;

  const { error } = await sb.from('crews').delete().eq('id', crew.id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  window.location.href = '/crews/';
}
