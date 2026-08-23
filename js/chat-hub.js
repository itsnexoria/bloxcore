// BloxCore — chat/index.html tab controller (Live Chat / Messages / Friends)
// Loaded after chat.js and messages.js, which each self-initialize independently via onReady().
// This file only handles which panel is visible — no data loading of its own.

function switchHubTab(tab) {
  document.querySelectorAll('#chat-hub-tabs [data-hub-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.hubTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('hub-panel-live').style.display = tab === 'live' ? 'block' : 'none';
  document.getElementById('hub-panel-messages').style.display = tab === 'messages' ? 'block' : 'none';
  document.getElementById('hub-panel-friends').style.display = tab === 'friends' ? 'block' : 'none';

  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState({}, '', url);
}

document.querySelectorAll('#chat-hub-tabs [data-hub-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchHubTab(btn.dataset.hubTab));
});

const _hubParams = new URLSearchParams(window.location.search);
const _initialHubTab = _hubParams.get('u') ? 'messages' : (_hubParams.get('tab') || 'live');
switchHubTab(_initialHubTab);
