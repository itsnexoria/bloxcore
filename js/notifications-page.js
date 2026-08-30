// BloxCore — /notifications/index.html logic (full notification history)
// Reuses the .notif-item/.notif-dot/.notif-message/.notif-time/.notif-actions CSS from
// the header dropdown (js/nav.js) but each row here is its own panel card, and this page
// adds filtering + pagination the dropdown doesn't need (it only ever shows the latest 20).

let notifUserId = null;
let currentNotifFilter = 'all';

// Buckets the real `type` values seen in the notifications table into a few filters a
// person would actually want to browse by — not every type gets its own filter button.
const NOTIF_FILTER_TYPES = {
  rank: ['rank_up', 'title_earned', 'title_awarded', 'achievement_earned'],
  social: ['new_follower', 'friend_request_received', 'friend_request_accepted', 'chat_mention', 'chat_reply', 'new_message'],
  crews: ['crew_war_called', 'crew_war_accepted', 'crew_war_declined', 'crew_war_resolved'],
  events: ['new_giveaway', 'giveaway_win', 'giveaway_winner_picked', 'new_sea_event', 'sea_event_joined', 'submission_approved'],
  tournaments: ['tournament_cancelled', 'tournament_champion', 'tournament_match_result', 'tournament_prediction_correct', 'tournament_prize_won'],
};

const NOTIF_TYPE_ICON = {
  rank_up: 'trending-up', title_earned: 'award', title_awarded: 'award', achievement_earned: 'award',
  new_follower: 'user-plus', friend_request_received: 'user-plus', friend_request_accepted: 'user-check',
  chat_mention: 'at-sign', chat_reply: 'reply', new_message: 'mail',
  crew_war_called: 'swords', crew_war_accepted: 'swords', crew_war_declined: 'shield-off', crew_war_resolved: 'flag',
  new_giveaway: 'gift', giveaway_win: 'party-popper', giveaway_winner_picked: 'party-popper',
  new_sea_event: 'waves', sea_event_joined: 'waves', submission_approved: 'check-circle',
  tournament_cancelled: 'circle-x', tournament_champion: 'trophy', tournament_match_result: 'swords',
  tournament_prediction_correct: 'target', tournament_prize_won: 'gift',
};

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  notifUserId = auth.user.id;

  loadNotifPage();

  document.getElementById('notif-page-mark-all-read').addEventListener('click', markAllReadFromPage);
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentNotifFilter = btn.dataset.notifFilter;
      loadNotifPage();
    });
  });
});

function loadNotifPage() {
  const container = document.getElementById('notif-page-list');
  container.innerHTML = `<div class="skeleton" style="height:64px;"></div><div class="skeleton" style="height:64px;"></div><div class="skeleton" style="height:64px;"></div>`;
  let isFirstPage = true;

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
        container.innerHTML = `<div class="empty-state">Nothing here yet.</div>`;
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
        el.addEventListener('click', () => openNotifFromPage(el.dataset.notifId, el.dataset.notifLink));
      });
    },
  });

  container.innerHTML = '';
  loadNext();
}

function renderNotifPageItem(n) {
  const icon = NOTIF_TYPE_ICON[n.type] || 'bell';
  const actions = renderNotifActions(n);
  return `
    <div class="panel hover-lift-card notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-notif-link="${escapeHtml(n.link || '')}" style="cursor:${n.link ? 'pointer' : 'default'};">
      <span class="icon-badge" data-tone="blue" style="flex-shrink:0;"><i data-lucide="${icon}" class="icon-sm"></i></span>
      <span style="flex:1; min-width:0;">
        <span class="notif-message">${escapeHtml(n.message)}</span>
        <span class="notif-time">${timeAgo(n.created_at)}</span>
        ${actions}
      </span>
      ${n.read ? '' : '<span class="notif-dot" style="background:var(--brass-bright); margin-top:8px;"></span>'}
    </div>
  `;
}

async function openNotifFromPage(id, link) {
  await sb.from('notifications').update({ read: true }).eq('id', id);
  if (link) window.location.href = link;
}

async function markAllReadFromPage() {
  const { error } = await sb.from('notifications').update({ read: true }).eq('user_id', notifUserId).eq('read', false);
  if (error) {
    showToast(error.message || 'Could not mark notifications read.', true);
    return;
  }
  showToast('All caught up.');
  loadNotifPage();
}
