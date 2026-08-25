// BloxCore — minimal service worker, push notifications only (no offline caching).
// Registered from js/push.js on every page.

self.addEventListener('push', (event) => {
  let data = { title: 'BloxCore', body: '', url: '/' };
  try { data = event.data.json(); } catch (e) { /* non-JSON payload, use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'BloxCore', {
      body: data.body || '',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
