// BloxCore service worker: push notifications, an offline fallback page, and light asset caching.
// Registered from js/push.js on every page.
//   - Pages (navigations): always network; offline fallback page if the network is down. Never cached, so
//     deploys are never served stale.
//   - /assets/* (images, fonts): stale-while-revalidate — instant repeat views, refreshed in the background.
//   - /css/* and /js/*: network-first, cached copy only when offline — a deploy is picked up immediately.
// Supabase / Discord / third-party requests are cross-origin and never touched.

const OFFLINE_CACHE = 'bc-offline-v1';
const ASSET_CACHE = 'bc-assets-v1';
const OFFLINE_URL = '/offline/';
const ASSET_CACHE_MAX = 200; // entries; oldest are evicted first

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => { /* offline page is a nicety — never block install on it */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) { /* unsupported */ }
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function putAsset(cache, req, res) {
  if (!res || !res.ok || res.type !== 'basic') return;
  await cache.put(req, res.clone());
  const keys = await cache.keys();
  if (keys.length > ASSET_CACHE_MAX) await Promise.all(keys.slice(0, keys.length - ASSET_CACHE_MAX).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || await fetch(req);
      } catch (e) {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || req.headers.has('range')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      const refresh = fetch(req).then(async (res) => { await putAsset(cache, req, res); return res; });
      if (hit) { event.waitUntil(refresh.catch(() => {})); return hit; }
      return refresh;
    })());
  } else if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      try {
        const res = await fetch(req);
        event.waitUntil(putAsset(cache, req, res));
        return res;
      } catch (e) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw e;
      }
    })());
  }
});

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
