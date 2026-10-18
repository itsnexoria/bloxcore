// BloxCore — /notifications/index.html logic (full notification history)
// A day-grouped timeline (Today / Yesterday / This week / Earlier) with tone-coded icons, an unread
// accent bar, a live unread summary and filters. The header dropdown (js/nav.js) keeps its own
// .notif-item styles; this page uses the .nf-* classes.

let notifUserId = null;
let currentNotifFilter = 'all';

// Buckets the real `type` values seen in the notifications table into a few filters a
// person would actually want to browse by — not every type gets its own filter button.
const NOTIF_FILTER_TYPES = {
  rank: ['rank_up', 'title_earned', 'title_awarded', 'achievement_earned'],
  social: ['new_follower', 'friend_request_received', 'friend_request_accepted', 'chat_mention', 'chat_reply', 'new_message', 'feed_comment', 'feed_mention'],
  crews: ['crew_war_called', 'crew_war_accepted', 'crew_war_declined', 'crew_war_resolved', 'crew_join_request', 'crew_join_response'],
  events: ['new_giveaway', 'giveaway_win', 'giveaway_winner_picked', 'new_sea_event', 'sea_event_joined', 'submission_approved', 'watchlist_match', 'weekly_recap'],
  tournaments: ['tournament_cancelled', 'tournament_champion', 'tournament_match_result', 'tournament_prediction_correct', 'tournament_prize_won'],
};

// Which tone a notification gets, derived from the same buckets the filters use.
function notifCategory(type) {
  for (const [cat, types] of Object.entries(NOTIF_FILTER_TYPES)) if (types.includes(type)) return cat;
  return 'other';
}

function notifBucket(iso) {
  const d = new Date(iso), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  return 'Earlier';
}

async function refreshNotifSummary() {
  const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', notifUserId).eq('read', false);
  if (error) { logError(error); return; }
  const n = count || 0;
  document.getElementById('nf-count').textContent = n ? `${n} new` : 'All caught up';
  document.getElementById('nf-sub').textContent = n ? 'Tap one to jump straight to it, or clear them all at once.' : 'Nothing is waiting for you right now.';
  document.getElementById('notif-page-mark-all-read').disabled = n === 0;
}

const NOTIF_TYPE_ICON = {
  rank_up: 'trending-up', title_earned: 'award', title_awarded: 'award', achievement_earned: 'award',
  new_follower: 'user-plus', friend_request_received: 'user-plus', friend_request_accepted: 'user-check',
  chat_mention: 'at-sign', chat_reply: 'reply', new_message: 'mail', feed_comment: 'message-square', feed_mention: 'at-sign',
  crew_war_called: 'swords', crew_war_accepted: 'swords', crew_war_declined: 'shield-off', crew_war_resolved: 'flag',
  crew_join_request: 'user-plus', crew_join_response: 'users',
  new_giveaway: 'gift', giveaway_win: 'party-popper', giveaway_winner_picked: 'party-popper',
  new_sea_event: 'waves', sea_event_joined: 'waves', submission_approved: 'check-circle',
  watchlist_match: 'eye', weekly_recap: 'calendar-check',
  tournament_cancelled: 'circle-x', tournament_champion: 'trophy', tournament_match_result: 'swords',
  tournament_prediction_correct: 'target', tournament_prize_won: 'gift',
};

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  notifUserId = auth.user.id;

  loadNotifPage();
  refreshNotifSummary();

  document.getElementById('notif-page-mark-all-read').addEventListener('click', markAllReadFromPage);
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notif-filter-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-pressed'); });
      btn.classList.add('active');
      currentNotifFilter = btn.dataset.notifFilter;
      loadNotifPage();
    });
  });
});

function loadNotifPage() {
  const container = document.getElementById('notif-page-list');
  container.innerHTML = `<div class="skeleton nf-skeleton"></div><div class="skeleton nf-skeleton"></div><div class="skeleton nf-skeleton"></div>`;
  let isFirstPage = true;
  lastNotifBucket = null; // day headers restart whenever the list reloads

  const { loadNext } = attachLoadMore(container, {
    pageSize: 20,
    wrapId: 'notif-page-load-more',
    fetchPage: async (offset, pageSize) => {
      let query = sb.from('notifications').select('*').eq('user_id', notifUserId).order('created_at', { ascending: false });
      const types = NOTIF_FILTER_TYPES[currentNotifFilter];
      if (types) query = query.in('type', types);
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) throw error;
      // attachLoadMore only calls renderItem/onAppend when a page comes back non-empty,
      // so an empty *first* page (nothing matches this filter at all) needs its own
      // empty-state — handled here, not in onAppend, since onAppend never fires for it.
      if (isFirstPage && !data.length) {
        container.innerHTML = currentNotifFilter === 'all'
          ? `<div class="nf-empty"><i data-lucide="bell-off" class="icon-lg"></i><h2>No notifications yet</h2><p>Follow players, join a crew or enter a giveaway and what happens next shows up here.</p></div>`
          : `<div class="nf-empty"><i data-lucide="filter-x" class="icon-lg"></i><h2>Nothing in this filter</h2><p>Try another filter or head back to All.</p></div>`;
        refreshIcons();
      }
      isFirstPage = false;
      return data;
    },
    renderItem: renderNotifPageItem,
    onAppend: () => {
      refreshIcons();
      container.querySelectorAll('[data-notif-id]').forEach(el => {
        if (el.dataset.wired) return;
        el.dataset.wired = '1';
        const open = (e) => {
          // an inline action link just marks the notification read — it brings its own destination
          if (e.target.closest('[data-notif-action-id]')) { markNotifRead(el); return; }
          openNotifFromPage(el);
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); open(e); } });
      });
    },
  });

  container.innerHTML = '';
  loadNext();
}

let lastNotifBucket = null;

function renderNotifPageItem(n) {
  const icon = NOTIF_TYPE_ICON[n.type] || 'bell';
  const actions = renderNotifActions(n);
  const bucket = notifBucket(n.created_at);
  const header = bucket !== lastNotifBucket ? `<p class="nf-day">${bucket}</p>` : '';
  lastNotifBucket = bucket;
  const link = n.link || '';
  return `${header}
    <article class="nf-item ${n.read ? '' : 'unread'} ${link ? 'is-link' : ''}" data-cat="${notifCategory(n.type)}" data-notif-id="${n.id}" data-notif-link="${escapeHtml(link)}" ${link ? 'role="link" tabindex="0"' : 'tabindex="0"'}>
      <span class="nf-icon"><i data-lucide="${icon}" class="icon-md"></i></span>
      <div class="nf-body">
        <p class="nf-msg">${escapeHtml(n.message)}</p>
        <p class="nf-time">${timeAgo(n.created_at)}</p>
        ${actions ? `<div class="nf-actions">${actions}</div>` : ''}
      </div>
      ${link ? '<i data-lucide="chevron-right" class="icon-sm nf-chev"></i>' : ''}
    </article>`;
}

async function markNotifRead(el) {
  if (!el.classList.contains('unread')) return;
  el.classList.remove('unread');
  const { error } = await sb.from('notifications').update({ read: true }).eq('id', el.dataset.notifId);
  if (error) { el.classList.add('unread'); logError(error); return; }
  refreshNotifSummary();
}

async function openNotifFromPage(el) {
  const link = el.dataset.notifLink;
  if (link) {
    await sb.from('notifications').update({ read: true }).eq('id', el.dataset.notifId);
    window.location.href = link;
    return;
  }
  markNotifRead(el);
}

async function markAllReadFromPage() {
  const { error } = await sb.from('notifications').update({ read: true }).eq('user_id', notifUserId).eq('read', false);
  if (error) {
    showToast(error.message || 'Could not mark notifications read.', true);
    return;
  }
  showToast('All caught up.');
  loadNotifPage();
  refreshNotifSummary();
}
