/* SMS IoT — minimal service worker.
 *
 * Responsibilities:
 *   1. Cache the app shell on install so the site loads offline.
 *   2. Network-first for GETs so updates ship immediately online.
 *   3. Handle notification clicks — focus the portal tab (or open it) and
 *      navigate to /alarms when the user clicks a native notification.
 *   4. Support action buttons ("View alarm") on rich notifications fired by
 *      the page via `registration.showNotification()`.
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
  // Bypass live-data paths AND anything managed by Vite's dev server so HMR
  // keeps working when the SW is registered in development.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/websocket/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/src/') ||
    url.search.includes('import') ||
    url.search.includes('t=')
  ) {
    return;
  }

  // Network-first, cache fallback.
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

/* ---------------------- Notifications ---------------------- */

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  // "acknowledge" action: close + skip focus (user just wanted to dismiss).
  if (event.action === 'acknowledge') return;

  const targetUrl = data.url || '/alarms';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    // Focus an already-open portal tab if any, navigate it, otherwise open a new one.
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch { /* ignore */ }
        } else {
          // Post a message to the client so it can react even without navigate().
          client.postMessage({ type: 'sms-iot-open', url: targetUrl });
        }
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});

// Swallow close events so they don't error out.
self.addEventListener('notificationclose', () => {});
