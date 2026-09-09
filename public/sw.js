const CACHE_PREFIX = 'taptrack-shell-';
const CACHE_NAME = `${CACHE_PREFIX}2026-09-09-v9`;
const APP_ROUTES = [
  '/app',
  '/app/add',
  '/app/transactions',
  '/app/conversions',
  '/app/budgets',
  '/app/recurring',
  '/app/reports',
  '/app/balances',
  '/app/settings',
];
const STATIC_SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icons/taptrack-icon.svg',
  '/icons/taptrack-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

function canonicalRouteRequest(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`);
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(STATIC_SHELL_ASSETS);

  for (const route of APP_ROUTES) {
    const response = await fetch(route, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not cache ${route}`);
    await cacheNavigationResponse(cache, new Request(new URL(route, self.location.origin)), response);
  }
}

async function cacheNavigationResponse(cache, request, response) {
  await cache.put(canonicalRouteRequest(request), response.clone());

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return;

  const html = await response.clone().text();
  const assetUrls = extractNextStaticAssetUrls(html);
  await Promise.all(
    assetUrls.map(async (assetUrl) => {
      const absoluteUrl = new URL(assetUrl, self.location.origin);
      if (
        absoluteUrl.origin !== self.location.origin ||
        !absoluteUrl.pathname.startsWith('/_next/static/')
      ) {
        return;
      }

      const assetRequest = new Request(absoluteUrl.href);
      if (await cache.match(assetRequest)) return;

      const assetResponse = await fetch(assetRequest, { cache: 'no-store' });
      if (assetResponse.ok) await cache.put(assetRequest, assetResponse);
    })
  );
}

function extractNextStaticAssetUrls(html) {
  const urls = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = attributePattern.exec(html)) !== null) {
    if (match[1].startsWith('/_next/static/')) urls.add(match[1]);
  }
  return [...urls];
}

async function precachedResponse(request, fallbackToApp = false) {
  const cache = await caches.open(CACHE_NAME);
  const matched = await cache.match(request);
  if (matched) return matched;
  if (fallbackToApp) {
    return (await cache.match(new Request(`${self.location.origin}/app`))) ?? Response.error();
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (self.navigator.onLine !== false) return;

  if (request.mode === 'navigate') {
    event.respondWith(precachedResponse(canonicalRouteRequest(request), true));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(precachedResponse(request));
    return;
  }

  const cacheableStatic =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    ['font', 'image'].includes(request.destination);

  if (!cacheableStatic) return;
  event.respondWith(precachedResponse(request));
});
