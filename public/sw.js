const CACHE_PREFIX = 'taptrack-shell-';
const CACHE_NAME = `${CACHE_PREFIX}2026-09-05-v2`;
const APP_ROUTES = [
  '/app',
  '/app/transactions',
  '/app/conversions',
  '/app/budgets',
  '/app/recurring',
  '/app/reports',
  '/app/settings',
];
const SHELL_ASSETS = [
  ...APP_ROUTES,
  '/manifest.webmanifest',
  '/icons/taptrack-icon.svg',
  '/icons/taptrack-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function canonicalRouteRequest(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(canonicalRouteRequest(request), copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(canonicalRouteRequest(request))) ??
            (await cache.match(new Request(`${url.origin}/app`))) ??
            Response.error()
          );
        })
    );
    return;
  }

  const cacheableStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    ['font', 'image', 'script', 'style'].includes(request.destination);

  if (!cacheableStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});
