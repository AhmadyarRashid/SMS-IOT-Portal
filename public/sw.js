/* SMS IoT — minimal service worker.
 *
 * Caches the app shell on install and serves a network-first strategy for
 * everything else. API and auth requests are NEVER cached — they must hit
 * the backend so tokens, device state, and alarms stay live.
 */

const CACHE = 'sms-iot-shell-v1';
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/websocket/')) {
    return; // bypass the SW entirely
  }

  // Network-first, cache fallback — so updates ship immediately online and
  // the user still gets a useful shell offline.
  event.respondWith(
    fetch(request)
      .then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/')))
  );
});
