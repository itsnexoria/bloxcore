// BloxCore — sea-events/index.html logic

let currentUser = null;
let currentFilter = 'all';
let allEvents = [];
let myJoinedIds = new Set();

const EVENT_TYPES = {
  sea_beast: { label: 'Sea Beast', icon: 'https://static.wikia.nocookie.net/roblox-blox-piece/images/9/91/SeaBeast.webp/revision/latest?cb=20240212015257' },
  terror_shark: { label: 'Terror Shark', icon: 'https://static.wikia.nocookie.net/roblox-blox-piece/images/1/15/Terrorshark_IG_%28Green%29.png/revision/latest/scale-to-width-down/268?cb=20240907213938' },
  leviathan: { label: 'Leviathan', icon: 'https://static.wikia.nocookie.net/roblox-blox-piece/images/0/0a/Leviathan.png/revision/latest/scale-to-width-down/268?cb=20250127234818' },
  prehistoric_island: { label: 'Prehistoric Island', icon: 'https://static.wikia.nocookie.net/roblox-blox-piece/images/b/b1/Prehistoric_Island.png/revision/latest?cb=20241229013115' },
  mirage: { label: 'Mirage', icon: 'https://static.wikia.nocookie.net/roblox-blox-piece/images/f/f9/Mirage_Clear_View.png/revision/latest/scale-to-width-down/267?cb=20230316042605' },
  kitsune_shrine: { label: 'Kitsune Shrine', icon: 'https://static.wikia.nocookie.net/roblox-blox-piece/images/8/89/Kitsune_Shrine_Full.png/revision/latest/scale-to-width-down/268?cb=20240812005020' },
};

onReady(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    document.getElementById('post-event-btn').style.display = 'inline-flex';
  }

  document.getElementById('post-event-btn').addEventListener('click', () => {
    document.getElementById('post-event-modal').classList.add('open');
  });
  document.getElementById('post-event-close').addEventListener('click', () => {
    document.getElementById('post-event-modal').classList.remove('open');
  });
  document.getElementById('post-event-form').addEventListener('submit', handlePostEvent);

  getSiteSettings().then(settings => {
    document.getElementById('se-notes').maxLength = settings.maxSeaEventNoteLength;
  }).catch(e => logError('Failed to apply sea event length settings:', e));

  document.querySelectorAll('#se-category-tabs [data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('#se-category-tabs [data-filter]').forEach(b => {
        b.className = `btn btn-sm ${b.dataset.filter === currentFilter ? 'btn-primary' : 'btn-ghost'}`;
      });
      renderEvents();
    });
  });

  await loadEvents();
  setInterval(renderEvents, 30000); // keep countdowns + expired listings fresh without a full reload
});

async function loadEvents() {
  const container = document.getElementById('sea-events-list');

  if (currentUser) {
    const { data: joined } = await sb.from('sea_event_participants').select('event_id').eq('user_id', currentUser.id);
    myJoinedIds = new Set((joined || []).map(j => j.event_id));
  }

  const [{ data: events, error }, { data: participants }] = await Promise.all([
    sb.from('sea_events').select('*, profiles!sea_events_host_id_fkey(username, display_name, avatar_url, avatar_frame, roblox_verified)').order('created_at', { ascending: false }),
    sb.from('sea_event_participants').select('event_id, user_id, profiles(username, display_name, avatar_url, avatar_frame)'),
  ]);

  if (error) {
    container.innerHTML = errorStateHtml("Couldn't load events right now.", 'loadEvents()');
    refreshIcons();
    logError(error);
    return;
  }

  const countsByEvent = new Map();
  (participants || []).forEach(p => {
    if (!countsByEvent.has(p.event_id)) countsByEvent.set(p.event_id, []);
    countsByEvent.get(p.event_id).push(p);
  });

  allEvents = (events || []).map(ev => ({ ...ev, participants: countsByEvent.get(ev.id) || [] }));
  renderEvents();
}

function renderEvents() {
  const container = document.getElementById('sea-events-list');
  const now = Date.now();
  const visible = allEvents
    .filter(ev => new Date(ev.expires_at).getTime() > now)
    .filter(ev => currentFilter === 'all' || ev.type === currentFilter);

  container.innerHTML = visible.length
    ? visible.map(renderEventCard).join('')
    : `<div class="empty-state" style="grid-column:1/-1;">No live events${currentFilter === 'all' ? '' : ' for this type'} right now — post one to get a server going.</div>`;

  refreshIcons();
  document.querySelectorAll('[data-join-event]').forEach(btn => btn.addEventListener('click', () => joinEvent(btn.dataset.joinEvent)));
  document.querySelectorAll('[data-leave-event]').forEach(btn => btn.addEventListener('click', () => leaveEvent(btn.dataset.leaveEvent)));
  document.querySelectorAll('[data-delete-event]').forEach(btn => btn.addEventListener('click', () => deleteEvent(btn.dataset.deleteEvent)));
  document.querySelectorAll('[data-report-event]').forEach(btn => btn.addEventListener('click', () => reportContent('sea_event', btn.dataset.reportEvent)));
}

function renderEventCard(ev) {
  const type = EVENT_TYPES[ev.type] || { label: ev.type, icon: null };
  const joined = myJoinedIds.has(ev.id);
  const full = ev.participants.length >= ev.max_players;
  const isHost = currentUser && ev.host_id === currentUser.id;

  const totalMs = new Date(ev.expires_at).getTime() - new Date(ev.created_at).getTime();
  const leftMs = new Date(ev.expires_at).getTime() - Date.now();
  const pctLeft = Math.max(0, Math.min(100, (leftMs / totalMs) * 100));
  const urgent = pctLeft < 25;

  let actionHtml;
  if (isHost) {
    actionHtml = `<span class="tag tag-legendary" style="display:block; text-align:center; padding:8px;"><i data-lucide="crown" class="icon-sm icon-inline"></i>You're Hosting</span>`;
  } else if (!currentUser) {
    actionHtml = `<a href="/auth/" class="btn btn-primary btn-block btn-sm">Sign in to Join</a>`;
  } else if (joined) {
    actionHtml = `<button class="btn btn-ghost btn-block btn-sm" data-leave-event="${ev.id}">Leave</button>`;
  } else if (full) {
    actionHtml = `<button class="btn btn-ghost btn-block btn-sm" disabled>Server Full</button>`;
  } else {
    actionHtml = `<button class="btn btn-primary btn-block btn-sm" data-join-event="${ev.id}">Join</button>`;
  }

  const avatarStack = ev.participants.slice(0, 5).map(p => avatarHtml(p.profiles || {}, 26, 'margin-left:-8px;')).join('');
  const extraCount = ev.participants.length > 5 ? `<span class="muted" style="font-size:0.72rem; margin-left:8px;">+${ev.participants.length - 5}</span>` : '';

  const cornerBtn = isHost
    ? `<button class="se-corner-btn" data-delete-event="${ev.id}" title="Delete event"><i data-lucide="x" class="icon-sm"></i></button>`
    : (currentUser ? `<button class="se-corner-btn" data-report-event="${ev.id}" title="Report"><i data-lucide="flag" class="icon-sm"></i></button>` : '');

  return `
    <div class="panel se-card hover-lift-card sea-event-card">
      <div class="se-banner" style="background-image:url('${type.icon || ''}');">
        <div class="se-banner-scrim"></div>
        <span class="se-type-pill">${type.icon ? `<img src="${type.icon}" alt="">` : `<i data-lucide="triangle-alert" class="icon-sm"></i>`}${type.label}</span>
        ${cornerBtn}
        <div class="se-host-row">
          ${avatarHtml(ev.profiles || {}, 28, 'box-shadow:0 0 0 2px rgba(10,14,23,0.9);')}
          <a href="/player/?u=${encodeURIComponent(ev.profiles?.username || '')}">${escapeHtml(displayNameFor(ev.profiles || {}))}</a>
          ${ev.profiles?.roblox_verified ? '<i data-lucide="badge-check" class="icon-sm" style="color:#34d399;" title="Verified Roblox account"></i>' : ''}
        </div>
      </div>

      <div class="se-body">
        ${ev.notes ? `<p class="muted" style="margin:0 0 14px; font-size:0.85rem;">${escapeHtml(ev.notes)}</p>` : ''}

        <div class="flex-between" style="font-size:0.78rem; margin-bottom:6px;">
          <span class="muted">${ev.participants.length}/${ev.max_players} joined</span>
          <span style="color:${urgent ? 'var(--blood-dim)' : 'var(--ash)'};">${timeRemainingCompact(ev.expires_at)}</span>
        </div>
        <div style="height:4px; border-radius:2px; background:rgba(255,255,255,0.06); overflow:hidden; margin-bottom:14px;">
          <div style="height:100%; width:${pctLeft}%; background:${urgent ? 'var(--blood-dim)' : 'var(--brass)'}; transition:width 1s linear;"></div>
        </div>
        ${ev.participants.length ? `<div style="display:flex; align-items:center; margin:0 0 14px 8px;">${avatarStack}${extraCount}</div>` : ''}

        <div style="display:flex; gap:8px;">
          <a href="${safeUrl(ev.link)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="flex:1; min-width:0;"><i data-lucide="external-link" class="icon-sm icon-inline"></i>Open</a>
          <div style="flex:1; min-width:0;">${actionHtml}</div>
        </div>
      </div>
    </div>
  `;
}

async function handlePostEvent(e) {
  e.preventDefault();
  const errorEl = document.getElementById('post-event-error');
  errorEl.style.display = 'none';

  const notes = document.getElementById('se-notes').value.trim();
  const settings = await getSiteSettings();
  if (notes && notes.length < settings.minSeaEventNoteLength) {
    errorEl.textContent = `Notes must be at least ${settings.minSeaEventNoteLength} characters, or left blank.`;
    errorEl.style.display = 'block';
    return;
  }

  const payload = {
    type: document.getElementById('se-type').value,
    host_id: currentUser.id,
    link: document.getElementById('se-link').value.trim(),
    notes: notes || null,
    max_players: Math.min(12, Math.max(1, Number(document.getElementById('se-max').value) || 12)),
    duration_hours: Number(document.getElementById('se-duration').value) || 1,
  };

  if (!isRobloxLink(payload.link)) {
    errorEl.textContent = 'Link must be a roblox.com link (your profile or a private server link) — other sites aren\'t allowed, to keep scam links off here.';
    errorEl.style.display = 'block';
    return;
  }

  const { error } = await sb.from('sea_events').insert(payload);
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  document.getElementById('post-event-form').reset();
  document.getElementById('se-max').value = 12;
  document.getElementById('post-event-modal').classList.remove('open');
  showToast(`Event posted — it auto-deletes in ${payload.duration_hours}h.`);
  await loadEvents();
}

async function joinEvent(eventId) {
  const { error } = await sb.from('sea_event_participants').insert({ event_id: eventId, user_id: currentUser.id });
  if (error) { showToast(error.message, true); return; }
  myJoinedIds.add(eventId);
  showToast('Joined — good luck out there.');
  await loadEvents();
}

async function leaveEvent(eventId) {
  const { error } = await sb.from('sea_event_participants').delete().eq('event_id', eventId).eq('user_id', currentUser.id);
  if (error) { showToast(error.message, true); return; }
  myJoinedIds.delete(eventId);
  await loadEvents();
}

async function deleteEvent(eventId) {
  if (!window.confirm('Delete this event?')) return;
  const { error } = await sb.from('sea_events').delete().eq('id', eventId);
  if (error) { showToast(error.message, true); return; }
  await loadEvents();
}
