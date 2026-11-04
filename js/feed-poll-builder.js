// BloxCore — feed poll builder (compose box)
// Lazy-loaded by js/feed.js (loadFeedModule); runs in the same global scope as feed.js.

// Poll builder (compose box)
function openPollBuilder() {
  pendingPoll = { options: ['', ''], hours: 24 };
  renderPollBuilder();
}
function closePollBuilder() {
  pendingPoll = null;
  const el = document.getElementById('feed-poll-builder');
  el.hidden = true; el.innerHTML = '';
  document.getElementById('feed-poll-btn')?.classList.remove('is-on');
}
function renderPollBuilder() {
  const el = document.getElementById('feed-poll-builder');
  if (!pendingPoll) return;
  el.hidden = false;
  document.getElementById('feed-poll-btn')?.classList.add('is-on');
  el.innerHTML = `
    <div class="fpb-head"><strong>Poll</strong><span class="muted">The post text is your question.</span><button type="button" class="btn btn-ghost btn-sm" id="fpb-remove" aria-label="Remove poll"><i data-lucide="x" class="icon-sm"></i></button></div>
    ${pendingPoll.options.map((o, i) => `<input type="text" class="fpb-opt" data-opt="${i}" maxlength="40" placeholder="Option ${i + 1}" value="${escapeHtml(o)}">`).join('')}
    <div class="fpb-foot">
      ${pendingPoll.options.length < 4 ? `<button type="button" class="btn btn-ghost btn-sm" id="fpb-add"><i data-lucide="plus" class="icon-sm icon-inline"></i>Add option</button>` : '<span></span>'}
      <label class="fpb-dur">Ends in
        <select id="fpb-hours">${[[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '7 days']].map(([h, l]) => `<option value="${h}" ${h === pendingPoll.hours ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
    </div>`;
  el.querySelectorAll('.fpb-opt').forEach(inp => inp.addEventListener('input', () => { pendingPoll.options[Number(inp.dataset.opt)] = inp.value; }));
  el.querySelector('#fpb-hours').addEventListener('change', (e) => { pendingPoll.hours = Number(e.target.value); });
  el.querySelector('#fpb-remove').addEventListener('click', closePollBuilder);
  el.querySelector('#fpb-add')?.addEventListener('click', () => { pendingPoll.options.push(''); renderPollBuilder(); });
  refreshIcons();
}
