// BloxCore — crew/index.html logic

let currentUser = null;
let crew = null;
let myMembership = null; // { crew_id } if in any crew
let allWars = [];

onReady(async () => {
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
  await loadWars();

  document.getElementById('edit-crew-form').addEventListener('submit', handleEditCrew);
  document.getElementById('edit-crew-cancel').addEventListener('click', closeEditModal);
  document.getElementById('war-call-btn').addEventListener('click', openWarCallModal);
  document.getElementById('war-call-cancel').addEventListener('click', closeWarCallModal);
  document.getElementById('war-call-form').addEventListener('submit', handleWarCall);
  wireWarCallAutocomplete();
});

async function render() {
  const { data: members, error } = await sb
    .from('crew_members')
    .select('user_id, role, joined_at, profiles(username, display_name, level, pirate_bounty, title_color_override, titles(name, color))')
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

  let actionHtml;
  if (!currentUser) {
    actionHtml = '';
  } else if (isLeader) {
    actionHtml = `<div style="display:flex; gap:10px;"><button class="btn btn-ghost" id="edit-crew-btn">Edit Crew</button><button class="btn btn-danger" id="delete-crew-btn">Delete Crew</button></div>`;
  } else if (isMember) {
    actionHtml = `<button class="btn btn-ghost" id="leave-crew-btn">Leave Crew</button>`;
  } else {
    // Crews are leader-invite only now — no self-serve join. The Roblox/Discord
    // contact buttons rendered above this are the actual path to reach the leader.
    actionHtml = `<p class="muted" style="margin:0; font-size:0.85rem; text-align:right;">Ask the crew leader to add you.</p>`;
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
            ? `<img src="${crew.logo_url}" alt="" loading="lazy" style="width:68px; height:68px; border-radius:var(--radius); object-fit:cover; flex-shrink:0; box-shadow:0 0 0 1px var(--glass-border), 0 6px 20px rgb(var(--shadow-rgb) / 0.4), 0 0 24px rgb(var(--purple-rgb) / 0.3);" onerror="this.style.display='none';">`
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
        ${crew.discord_invite ? `<a href="${safeUrl(crew.discord_invite)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm"><i data-lucide="message-circle" class="icon-sm icon-inline"></i>Join Discord</a>` : ''}
        ${actionHtml}
        ${currentUser && !isLeader ? `<button type="button" class="btn btn-ghost btn-sm" id="report-crew-btn" title="Report"><i data-lucide="flag" class="icon-sm icon-inline"></i>Report</button>` : ''}
      </div>
    </div>

    ${isLeader ? `
    <div class="panel" style="margin-top:20px;">
      <h3 style="font-size:1rem; margin-bottom:10px;">Add a Member</h3>
      <form id="add-member-form" style="display:flex; gap:10px; align-items:flex-start; position:relative;">
        <div style="flex:1; position:relative;">
          <input type="text" id="add-member-username" placeholder="Search a BloxCore username…" autocomplete="off" style="margin:0; width:100%;" ${members.length >= 30 ? 'disabled' : ''}>
          <div id="add-member-suggestions" class="autocomplete-list autocomplete-list-inline"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm" ${members.length >= 30 ? 'disabled' : ''} title="Add"><i data-lucide="plus" class="icon-sm"></i></button>
      </form>
      <p class="field-error" id="add-member-error" style="display:none;"></p>
    </div>` : ''}

    <div class="panel" style="margin-top:20px; padding:0;">
      ${members.map((m, i) => renderMemberRow(m, i === members.length - 1, isLeader)).join('')}
    </div>
  `;
  document.getElementById('war-call-btn').style.display = isLeader ? 'inline-flex' : 'none';
  document.getElementById('crew-wars-section').style.display = 'block';
  refreshIcons();

  document.getElementById('leave-crew-btn')?.addEventListener('click', () => handleLeave(currentUser.id));
  document.getElementById('delete-crew-btn')?.addEventListener('click', handleDelete);
  document.getElementById('report-crew-btn')?.addEventListener('click', () => reportContent('crew', crew.id));
  document.getElementById('edit-crew-btn')?.addEventListener('click', openEditModal);
  document.getElementById('edit-crew-logo-file')?.addEventListener('change', handleCrewLogoSelect);
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
        <a href="/player/?u=${encodeURIComponent(p.username)}" style="color:var(--bone); font-weight:700; text-decoration:none;">${escapeHtml(displayNameFor(p))}</a>
        ${titleBadge(p)}
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
      const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url, avatar_frame')
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

let pendingCrewLogoFile = null;

function handleCrewLogoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    showToast('Crew icon must be 3MB or smaller.', true);
    e.target.value = '';
    return;
  }
  pendingCrewLogoFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('edit-crew-logo-preview-img').src = reader.result;
    document.getElementById('edit-crew-logo-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function openEditModal() {
  document.getElementById('edit-crew-name').value = crew.name;
  document.getElementById('edit-crew-tag').value = crew.tag || '';
  document.getElementById('edit-crew-description').value = crew.description || '';
  document.getElementById('edit-crew-logo-file').value = '';
  pendingCrewLogoFile = null;
  const preview = document.getElementById('edit-crew-logo-preview');
  if (crew.logo_url) {
    document.getElementById('edit-crew-logo-preview-img').src = crew.logo_url;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
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

  let logo_url = crew.logo_url || null;
  if (pendingCrewLogoFile) {
    const ext = pendingCrewLogoFile.name.split('.').pop();
    const path = `crew-logos/${crew.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('avatars').upload(path, pendingCrewLogoFile);
    if (uploadError) {
      errorEl.textContent = uploadError.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      return;
    }
    const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
    logo_url = urlData.publicUrl;
  }

  const updates = {
    name: document.getElementById('edit-crew-name').value.trim(),
    tag: document.getElementById('edit-crew-tag').value.trim() || null,
    description: document.getElementById('edit-crew-description').value.trim(),
    logo_url,
    roblox_username: document.getElementById('edit-crew-roblox').value.trim() || null,
    discord_invite: document.getElementById('edit-crew-discord').value.trim() || null,
  };

  if (updates.discord_invite && safeUrl(updates.discord_invite) === '#') {
    errorEl.textContent = "That Discord invite doesn't look like a valid web address.";
    errorEl.style.display = 'block';
    btn.disabled = false;
    return;
  }

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

// ---- Crew Wars ----

async function loadWars() {
  const { data, error } = await sb
    .from('crew_wars')
    .select('*, challenger:challenger_crew_id(name, tag, logo_url), defender:defender_crew_id(name, tag, logo_url)')
    .or(`challenger_crew_id.eq.${crew.id},defender_crew_id.eq.${crew.id}`)
    .order('created_at', { ascending: false })
    .limit(20);

  const list = document.getElementById('crew-wars-list');
  if (error) {
    list.innerHTML = `<p class="muted">Couldn't load wars right now.</p>`;
    console.error(error);
    return;
  }
  allWars = data;
  if (!data.length) {
    list.innerHTML = `<p class="muted" style="padding:10px 0;">No war history yet.</p>`;
    return;
  }

  const warIds = data.map(w => w.id);
  const { data: participants } = await sb
    .from('crew_war_participants')
    .select('war_id, crew_id, user_id, profiles(username, display_name)')
    .in('war_id', warIds);

  list.innerHTML = data.map(w => renderWarCard(w, (participants || []).filter(p => p.war_id === w.id))).join('');
  refreshIcons();

  document.querySelectorAll('[data-war-accept]').forEach(b => b.addEventListener('click', () => respondToWar(b.dataset.warAccept, 'accepted')));
  document.querySelectorAll('[data-war-decline]').forEach(b => b.addEventListener('click', () => respondToWar(b.dataset.warDecline, 'declined')));
  document.querySelectorAll('[data-war-cancel]').forEach(b => b.addEventListener('click', () => respondToWar(b.dataset.warCancel, 'cancelled')));
  document.querySelectorAll('[data-war-join]').forEach(b => b.addEventListener('click', () => joinWar(b.dataset.warJoin)));
  document.querySelectorAll('[data-war-leave]').forEach(b => b.addEventListener('click', () => leaveWar(b.dataset.warLeave)));
  document.querySelectorAll('[data-war-video-form]').forEach(f => f.addEventListener('submit', (e) => submitWarVideo(e, f.dataset.warVideoForm)));
}

function renderWarCard(w, participants) {
  const isChallenger = w.challenger_crew_id === crew.id;
  const opponent = isChallenger ? w.defender : w.challenger;
  const opponentId = isChallenger ? w.defender_crew_id : w.challenger_crew_id;
  const isLeader = currentUser && crew.leader_id === currentUser.id;
  const isMember = myMembership && myMembership.crew_id === crew.id;
  const iJoined = currentUser && participants.some(p => p.user_id === currentUser.id);

  const statusTag = {
    pending: `<span class="tag tag-medium">Pending</span>`,
    accepted: `<span class="tag tag-easy">Active</span>`,
    declined: `<span class="tag tag-hard">Declined</span>`,
    cancelled: `<span class="muted" style="font-size:0.78rem;">Cancelled</span>`,
    completed: w.winner_crew_id === crew.id
      ? `<span class="tag tag-easy">Won</span>`
      : `<span class="tag tag-hard">Lost</span>`,
  }[w.status] || '';

  const myVideoUrl = isChallenger ? w.challenger_video_url : w.defender_video_url;
  const theirVideoUrl = isChallenger ? w.defender_video_url : w.challenger_video_url;
  const hasEvidence = !!(w.challenger_video_url || w.defender_video_url);

  let actions = '';
  if (w.status === 'pending' && !isChallenger && isLeader) {
    actions = `<button class="btn btn-primary btn-sm" data-war-accept="${w.id}">Accept</button><button class="btn btn-ghost btn-sm" data-war-decline="${w.id}">Decline</button>`;
  } else if (w.status === 'pending' && isChallenger && isLeader) {
    actions = `<button class="btn btn-ghost btn-sm" data-war-cancel="${w.id}">Cancel Call</button>`;
  } else if (w.status === 'accepted') {
    const joinLeave = isMember
      ? (iJoined
        ? `<button class="btn btn-ghost btn-sm" data-war-leave="${w.id}">Leave War</button>`
        : `<button class="btn btn-primary btn-sm" data-war-join="${w.id}">Join War</button>`)
      : '';
    actions = `${joinLeave}`;
  }

  const mine = participants.filter(p => p.crew_id === crew.id);
  const theirs = participants.filter(p => p.crew_id === opponentId);

  return `
    <div class="panel" style="margin-bottom:12px;">
      <div class="flex-between" style="align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <p style="margin:0; font-weight:700;">
            ${escapeHtml(crew.name)} <span class="muted">vs</span> ${opponent ? `<a href="/crew/?name=${encodeURIComponent(opponent.name)}" style="color:var(--bone);">${escapeHtml(opponent.name)}</a>` : 'Unknown Crew'}
          </p>
          <p class="muted" style="margin:2px 0 0; font-size:0.78rem;">${timeAgo(w.created_at)}</p>
        </div>
        ${statusTag}
      </div>
      ${w.message ? `<p class="muted" style="margin:10px 0 0; font-size:0.85rem;">${escapeHtml(w.message)}</p>` : ''}
      ${w.status === 'accepted' ? `
        <div style="display:flex; gap:24px; margin-top:12px; flex-wrap:wrap;">
          <div><p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase;">${escapeHtml(crew.name)} (${mine.length})</p>${mine.map(p => `<p style="margin:0; font-size:0.82rem;">${escapeHtml(displayNameFor(p.profiles))}</p>`).join('') || '<p class="muted" style="font-size:0.8rem;">No one yet</p>'}</div>
          <div><p class="muted" style="margin:0 0 4px; font-size:0.72rem; text-transform:uppercase;">${opponent ? escapeHtml(opponent.name) : 'Opponent'} (${theirs.length})</p>${theirs.map(p => `<p style="margin:0; font-size:0.82rem;">${escapeHtml(displayNameFor(p.profiles))}</p>`).join('') || '<p class="muted" style="font-size:0.8rem;">No one yet</p>'}</div>
        </div>
        <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--navy-light);">
          <p class="muted" style="margin:0 0 8px; font-size:0.72rem; text-transform:uppercase;"><i data-lucide="video" class="icon-sm icon-inline"></i>Video Proof</p>
          ${myVideoUrl ? `<p style="margin:0 0 6px; font-size:0.85rem;">${escapeHtml(crew.name)}: <a href="${escapeHtml(myVideoUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--brass-bright);">watch</a></p>`
            : isLeader ? `<form data-war-video-form="${w.id}" style="display:flex; gap:8px; margin-bottom:6px;"><input type="url" placeholder="YouTube, Twitch, Streamable, etc." required style="margin:0;"><button type="submit" class="btn btn-ghost btn-sm" title="Add"><i data-lucide="plus" class="icon-sm"></i></button></form>` : ''}
          ${theirVideoUrl ? `<p style="margin:0; font-size:0.85rem;">${opponent ? escapeHtml(opponent.name) : 'Opponent'}: <a href="${escapeHtml(theirVideoUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--brass-bright);">watch</a></p>` : `<p class="muted" style="margin:0; font-size:0.8rem;">${opponent ? escapeHtml(opponent.name) : 'Opponent'} hasn't submitted a clip.</p>`}
          ${hasEvidence
            ? `<p class="muted" style="margin:8px 0 0; font-size:0.78rem;"><i data-lucide="shield" class="icon-sm icon-inline"></i>A staff member will review the evidence and decide the winner.</p>`
            : `<p class="muted" style="margin:8px 0 0; font-size:0.78rem;"><i data-lucide="shield" class="icon-sm icon-inline"></i>Staff decides the outcome — a clip is needed from at least one side, or it's recorded as a tie.</p>`}
        </div>
      ` : ''}
      ${actions ? `<div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">${actions}</div>` : ''}
    </div>
  `;
}

async function respondToWar(warId, status) {
  const { error } = await sb.from('crew_wars').update({ status, responded_at: new Date().toISOString() }).eq('id', warId);
  if (error) { showToast(error.message, true); return; }
  showToast(status === 'accepted' ? 'War accepted.' : status === 'declined' ? 'War declined.' : 'War call cancelled.');
  await loadWars();
}

async function submitWarVideo(e, warId) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const url = input.value.trim();
  if (!url) return;
  if (!isVideoPlatformLink(url)) {
    showToast('Link must be from YouTube, Twitch, Streamable, Medal, Vimeo, TikTok, or Google Drive.', true);
    return;
  }
  const isChallenger = allWars.find(w => w.id === warId)?.challenger_crew_id === crew.id;
  const field = isChallenger ? 'challenger_video_url' : 'defender_video_url';
  const { error } = await sb.from('crew_wars').update({ [field]: url }).eq('id', warId);
  if (error) { showToast(error.message, true); return; }
  showToast('Clip added.');
  await loadWars();
}

async function joinWar(warId) {
  const { error } = await sb.from('crew_war_participants').insert({ war_id: warId, crew_id: crew.id, user_id: currentUser.id });
  if (error) { showToast(error.message, true); return; }
  await loadWars();
}

async function leaveWar(warId) {
  const { error } = await sb.from('crew_war_participants').delete().eq('war_id', warId).eq('user_id', currentUser.id);
  if (error) { showToast(error.message, true); return; }
  await loadWars();
}

function openWarCallModal() {
  document.getElementById('war-call-form').reset();
  document.getElementById('war-call-target-id').value = '';
  document.getElementById('war-call-error').style.display = 'none';
  document.getElementById('war-call-modal').style.display = 'flex';
}
function closeWarCallModal() {
  document.getElementById('war-call-modal').style.display = 'none';
}

function wireWarCallAutocomplete() {
  const input = document.getElementById('war-call-target');
  const box = document.getElementById('war-call-suggestions');
  let debounceTimer;
  input.addEventListener('input', () => {
    document.getElementById('war-call-target-id').value = '';
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (!query) { box.classList.remove('open'); box.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      const { data } = await sb.from('crews').select('id, name, tag').ilike('name', `%${query}%`).neq('id', crew.id).limit(8);
      const candidates = data || [];
      box.innerHTML = candidates.length
        ? candidates.map(c => `<div class="autocomplete-item" data-pick-crew="${c.id}" data-pick-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}${c.tag ? ` <span class="muted">[${escapeHtml(c.tag)}]</span>` : ''}</div>`).join('')
        : `<div class="autocomplete-empty">No crews found.</div>`;
      box.classList.add('open');
      box.querySelectorAll('[data-pick-crew]').forEach(el => {
        el.addEventListener('click', () => {
          input.value = el.dataset.pickName;
          document.getElementById('war-call-target-id').value = el.dataset.pickCrew;
          box.classList.remove('open');
        });
      });
    }, 250);
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) box.classList.remove('open');
  });
}

async function handleWarCall(e) {
  e.preventDefault();
  const targetId = document.getElementById('war-call-target-id').value;
  const errorEl = document.getElementById('war-call-error');
  errorEl.style.display = 'none';
  if (!targetId) {
    errorEl.textContent = 'Pick a crew from the search results.';
    errorEl.style.display = 'block';
    return;
  }
  const { error } = await sb.from('crew_wars').insert({
    challenger_crew_id: crew.id,
    defender_crew_id: targetId,
    called_by: currentUser.id,
    message: document.getElementById('war-call-message').value.trim() || null,
  });
  if (error) {
    errorEl.textContent = error.message.includes('duplicate') || error.message.includes('war_wars')
      ? 'There is already a pending or active war between these crews.'
      : error.message;
    errorEl.style.display = 'block';
    return;
  }
  closeWarCallModal();
  showToast('War call sent.');
  await loadWars();
}
