// BloxCore — friends/index.html tab controller (Messages / Friends)
// Loaded after messages.js, which self-initializes independently via onReady().
// This file only handles which panel is visible — no data loading of its own.

function switchHubTab(tab) {
  document.querySelectorAll('#friends-hub-tabs [data-hub-tab]').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.hubTab === tab ? 'btn-primary' : 'btn-ghost'}`;
  });
  document.getElementById('hub-panel-messages').style.display = tab === 'messages' ? 'block' : 'none';
  document.getElementById('hub-panel-friends').style.display = tab === 'friends' ? 'block' : 'none';

  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState({}, '', url);
}

document.querySelectorAll('#friends-hub-tabs [data-hub-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchHubTab(btn.dataset.hubTab));
});

const _hubParams = new URLSearchParams(window.location.search);
const _initialHubTab = _hubParams.get('u') ? 'messages' : (_hubParams.get('tab') || 'messages');
switchHubTab(_initialHubTab);
