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
});

async function render() {
  const { data: members, error } = await sb
    .from('crew_members')
    .select('user_id, role, joined_at, profiles(username, display_name, level, titles(name, color))')
    .eq('crew_id', crew.id)
    .order('role', { ascending: true });

  if (error) {
    document.getElementById('crew-content').innerHTML = `<p class="muted">Couldn't load crew members.</p>`;
    console.error(error);
    return;
  }

  const isLeader = currentUser && crew.leader_id === currentUser.id;
  const isMember = myMembership && myMembership.crew_id === crew.id;
  const inAnotherCrew = myMembership && myMembership.crew_id !== crew.id;

  let actionHtml;
  if (!currentUser) {
    actionHtml = `<a href="/auth/" class="btn btn-primary">Sign in to Join</a>`;
  } else if (isLeader) {
    actionHtml = `<button class="btn btn-danger" id="delete-crew-btn">Delete Crew</button>`;
  } else if (isMember) {
    actionHtml = `<button class="btn btn-ghost" id="leave-crew-btn">Leave Crew</button>`;
  } else if (inAnotherCrew) {
    actionHtml = `<button class="btn btn-ghost" disabled title="Leave your current crew first">Already in a Crew</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary" id="join-crew-btn">Join Crew</button>`;
  }

  document.getElementById('crew-content').innerHTML = `
    <div class="panel">
      <div class="flex-between" style="align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:14px;">
          ${crew.logo_url
            ? `<img src="${crew.logo_url}" alt="" style="width:56px; height:56px; border-radius:10px; object-fit:cover; flex-shrink:0;" onerror="this.style.display='none';">`
            : `<div style="width:56px; height:56px; border-radius:10px; background:var(--navy-light); display:flex; align-items:center; justify-content:center; color:var(--ash); font-size:1.3rem; flex-shrink:0;">${escapeHtml((crew.name[0] || '?').toUpperCase())}</div>`}
          <div>
            <h1 style="font-size:1.6rem; margin-bottom:4px;">${crew.tag ? `[${escapeHtml(crew.tag)}] ` : ''}${escapeHtml(crew.name)}</h1>
            <p class="muted" style="margin:0;">${members.length}/30 members · founded ${formatDate(crew.created_at)}</p>
          </div>
        </div>
        ${actionHtml}
      </div>
      <p style="margin:16px 0 0;">${escapeHtml(crew.description)}</p>
      <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
        ${crew.roblox_username ? `<span class="tag" style="background:rgba(41,182,246,0.14); color:var(--brass-bright);">Roblox: ${escapeHtml(crew.roblox_username)}</span>` : ''}
        ${crew.discord_invite ? `<a href="${escapeHtml(crew.discord_invite)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Join Discord</a>` : ''}
      </div>
    </div>

    ${isLeader ? `
    <div class="panel" style="margin-top:20px;">
      <h3 style="font-size:1rem; margin-bottom:10px;">Add a Member</h3>
      <form id="add-member-form" style="display:flex; gap:10px; align-items:flex-start;">
        <input type="text" id="add-member-username" placeholder="Their BloxCore username" style="margin:0; flex:1;" ${members.length >= 30 ? 'disabled' : ''}>
        <button type="submit" class="btn btn-primary btn-sm" ${members.length >= 30 ? 'disabled' : ''}>Add</button>
      </form>
      <p class="field-error" id="add-member-error" style="display:none;"></p>
    </div>` : ''}

    <div class="panel" style="margin-top:20px; padding:0;">
      ${members.map((m, i) => renderMemberRow(m, i === members.length - 1, isLeader)).join('')}
    </div>
  `;

  document.getElementById('join-crew-btn')?.addEventListener('click', handleJoin);
  document.getElementById('leave-crew-btn')?.addEventListener('click', () => handleLeave(currentUser.id));
  document.getElementById('delete-crew-btn')?.addEventListener('click', handleDelete);
  document.getElementById('add-member-form')?.addEventListener('submit', handleAddMember);
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
        ${m.role === 'leader' ? `<span class="muted" style="font-size:0.78rem; margin-left:6px;">★ Leader</span>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="muted" style="font-size:0.82rem; font-family:var(--font-mono);">Lv. ${p.level}</span>
        ${canKick ? `<button class="btn btn-danger btn-sm" data-kick="${m.user_id}">Remove</button>` : ''}
      </div>
    </div>
  `;
}

async function handleAddMember(e) {
  e.preventDefault();
  const input = document.getElementById('add-member-username');
  const errorEl = document.getElementById('add-member-error');
  const username = input.value.trim();
  errorEl.style.display = 'none';
  if (!username) return;

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
