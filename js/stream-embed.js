// Homepage Twitch card: stays hidden until the channel is actually live, hides again when the
// stream ends. Uses Twitch's own embed API (no API key). Add ?stream=on to the URL to force
// the card visible while styling it, ?stream=off to force it hidden.
(function () {
  var CHANNEL = 'clxxdy4869';
  var card = document.getElementById('bc-stream-card');
  if (!card) return;

  function setLive(live) {
    card.classList.toggle('is-live', live);
    card.setAttribute('aria-hidden', live ? 'false' : 'true');
    card.inert = !live; // hidden card shouldn't be reachable by keyboard
  }

  var force = new URLSearchParams(location.search).get('stream');
  if (force === 'off') return;

  var s = document.createElement('script');
  s.src = 'https://embed.twitch.tv/embed/v1.js';
  s.async = true;
  s.onload = function () {
    var embed = new Twitch.Embed('bc-twitch-player', {
      channel: CHANNEL,
      parent: [location.hostname], // works on bloxcores.com, www., preview URLs, localhost
      width: '100%',
      height: '100%',
      layout: 'video',
      autoplay: true,
      muted: true,
    });
    embed.addEventListener(Twitch.Embed.VIDEO_READY, function () {
      var player = embed.getPlayer();
      player.addEventListener(Twitch.Player.ONLINE, function () { setLive(true); });
      player.addEventListener(Twitch.Player.PLAYING, function () { setLive(true); });
      player.addEventListener(Twitch.Player.OFFLINE, function () { setLive(false); });
      player.addEventListener(Twitch.Player.ENDED, function () { setLive(false); });
    });
    if (force === 'on') setLive(true);
  };
  document.head.appendChild(s);
})();
