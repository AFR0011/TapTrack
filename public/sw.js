const CACHE_NAME = 'taptrack-static-v1';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icons/taptrack-icon.svg',
  '/icons/taptrack-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const staticDestination = ['font', 'image', 'manifest', 'script', 'style'].includes(request.destination);
  const nextStatic = url.pathname.startsWith('/_next/static/');
  const publicAsset = url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';

  if (!staticDestination && !nextStatic && !publicAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
