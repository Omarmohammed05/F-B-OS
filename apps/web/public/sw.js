/* Sufra OS service worker: the app's own shell, kept on the device.
 *
 * The till is offline-first, so a reload with no network must still open the
 * app: a navigation is answered by the network and falls back to the last app
 * document it saved, and the scripts, styles and images the page asks for come
 * from the network first and the cache when it is down. `/api/` is still never
 * cached — a ticket, a guest or a punch is the server's answer, never a
 * remembered one. The till's own copy of the menu and its queued tickets live in
 * `localStorage` (`src/lib/offline.ts`), not here.
 */

const VERSION = 'sufra-v2';
// The last app document, whatever route it was opened on.
const SHELL_DOCUMENT = '/';
const SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function remember(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(VERSION).then((cache) => cache.put(request, copy));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data: the API answers or fails, a cached reply would be a lie.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Every route serves the same document, so one copy covers them all.
          remember(SHELL_DOCUMENT, response);
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (
            (await cache.match(SHELL_DOCUMENT)) ||
            (await cache.match('/offline.html')) ||
            new Response('Offline', { status: 503 })
          );
        }),
    );
    return;
  }

  // Scripts, styles, fonts and images: fresh while the network answers, the
  // remembered copy when it does not. Production fingerprints every file under
  // /assets/, so a hit there is always current.
  event.respondWith(
    fetch(request)
      .then((response) => {
        remember(request, response);
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error())),
  );
});
