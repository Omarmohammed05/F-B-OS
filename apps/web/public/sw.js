/* Sufra OS service worker: an offline shell for an installed till.
 *
 * It caches the brand icons and the offline page, answers a navigation with the
 * network and falls back to that page when the counter loses its connection,
 * and keeps hashed build assets (production `/assets/*`) in a runtime cache.
 * The API is never cached — a ticket, a guest or an attendance punch is always
 * the server's answer, never a remembered one.
 */

const VERSION = 'sufra-v1';
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data: the API answers or fails, a cached reply would be a lie.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match('/offline.html')
          .then((page) => page || new Response('Offline', { status: 503 })),
      ),
    );
    return;
  }

  // Production builds fingerprint every file under /assets/, so a hit is always
  // current. The Vite dev server does not serve that path, so dev is untouched.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
