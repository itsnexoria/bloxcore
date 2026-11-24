// BloxCore — community value vote on /blox-fruits-values/<item>/ pages: members mark an item
// Overpaid / Fair / Underpaid. DB: bf_item_value_votes (own row readable), RPCs vote_item_value,
// get_item_value_votes (public counts, last 30 days). get_community_trending() feeds the homepage tiles.

const VOTE_CHOICES = [
  { key: 'overpaid', label: 'Overpaid', icon: 'trending-down' },
  { key: 'fair', label: 'Fair', icon: 'scale' },
  { key: 'underpaid', label: 'Underpaid', icon: 'tag' },
];
const VOTE_MIN_FOR_VERDICT = 5; // matches get_community_trending()

onReady(async () => {
  const root = document.getElementById('value-vote');
  if (!root) return;
  const itemId = Number(root.dataset.itemId);
  const body = root.querySelector('.vote-body');
  if (!itemId || !body) return;

  let user = null;
  let myVote = null;
  let counts = { overpaid: 0, fair: 0, underpaid: 0, total: 0 };

  async function load() {
    const [{ data: rows, error }, session] = await Promise.all([
      sb.rpc('get_item_value_votes', { p_item_ids: [itemId] }),
      getCurrentProfile().catch(() => ({ user: null })),
    ]);
    if (error) { logError('get_item_value_votes failed:', error); body.textContent = 'Votes are unavailable right now.'; return false; }
    user = session.user || null;
    if (rows && rows[0]) counts = rows[0];
    if (user) {
      const { data: mine } = await sb.from('bf_item_value_votes').select('vote').eq('item_id', itemId).eq('user_id', user.id).maybeSingle();
      myVote = mine ? mine.vote : null;
    }
    return true;
  }

  function render() {
    const total = counts.total || 0;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const buttons = VOTE_CHOICES.map((c) => `
      <button type="button" class="btn btn-ghost vote-btn vote-${c.key}${myVote === c.key ? ' is-selected' : ''}" data-vote="${c.key}" aria-pressed="${myVote === c.key}">
        <i data-lucide="${c.icon}" class="icon-sm icon-inline"></i>${c.label}
      </button>`).join('');
    const bar = total
      ? `<div class="vote-bar" role="img" aria-label="${pct(counts.overpaid)}% overpaid, ${pct(counts.fair)}% fair, ${pct(counts.underpaid)}% underpaid">
           ${VOTE_CHOICES.map((c) => `<span class="vote-seg vote-seg-${c.key}" style="width:${pct(counts[c.key])}%"></span>`).join('')}
         </div>
         <p class="muted vote-legend">${VOTE_CHOICES.map((c) => `${c.label} ${pct(counts[c.key])}%`).join(' · ')} · ${total} vote${total === 1 ? '' : 's'} in the last 30 days</p>`
      : '<p class="muted vote-legend">No votes yet — be the first.</p>';
    const hint = total && total < VOTE_MIN_FOR_VERDICT
      ? `<p class="muted vote-legend">${VOTE_MIN_FOR_VERDICT - total} more vote${VOTE_MIN_FOR_VERDICT - total === 1 ? '' : 's'} until this can show up in Trending.</p>` : '';
    const signin = user ? '' : '<p class="muted vote-legend"><a href="/auth/">Sign in</a> to cast your vote.</p>';
    body.innerHTML = `<div class="vote-buttons">${buttons}</div>${bar}${hint}${signin}`;
    refreshIcons();
  }

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('.vote-btn');
    if (!btn) return;
    if (!user) { showToast('Sign in to vote.', true); return; }
    const choice = btn.dataset.vote;
    const next = myVote === choice ? null : choice; // tap again to take your vote back
    body.querySelectorAll('.vote-btn').forEach((b) => { b.disabled = true; });
    const { error } = await sb.rpc('vote_item_value', { p_item_id: itemId, p_vote: next });
    if (error) {
      logError('vote_item_value failed:', error);
      showToast(/rate|limit|too many/i.test(error.message || '') ? 'Slow down — too many votes. Try again soon.' : 'Couldn\'t save your vote.', true);
    } else {
      myVote = next;
      await load();
    }
    render();
  });

  if (await load()) render();
});
