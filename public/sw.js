const CACHE_PREFIX = 'taptrack-shell-';
const CACHE_NAME = `${CACHE_PREFIX}2026-09-11-v13`;
const NAVIGATION_TIMEOUT_MS = 3500;
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
  '/icons/ravel-icon.svg',
  '/icons/ravel-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await cacheAppShell();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function canonicalRouteRequest(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`);
}

function isAppPath(pathname) {
  return pathname === '/app' || pathname.startsWith('/app/');
}

function isCacheableAppResponse(request, response) {
  if (!response.ok || response.redirected) return false;
  const requestedUrl = new URL(request.url);
  const responseUrl = new URL(response.url);
  return (
    responseUrl.origin === requestedUrl.origin &&
    responseUrl.pathname === requestedUrl.pathname &&
    (response.headers.get('content-type') ?? '').includes('text/html')
  );
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  for (const asset of STATIC_SHELL_ASSETS) {
    const request = new Request(new URL(asset, self.location.origin), { credentials: 'same-origin' });
    const response = await fetch(request, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not cache ${asset}`);
    await cache.put(request, response);
  }

  for (const route of APP_ROUTES) {
    const request = new Request(new URL(route, self.location.origin), { credentials: 'same-origin' });
    const response = await fetch(request, { cache: 'no-store' });
    if (!isCacheableAppResponse(request, response)) {
      throw new Error(`Could not cache authenticated app route ${route}`);
    }
    await cacheNavigationResponse(cache, request, response, true);
  }
}

async function cacheNavigationResponse(cache, request, response, strictAssets = false) {
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

      const assetRequest = new Request(absoluteUrl.href, { credentials: 'same-origin' });
      if (await cache.match(assetRequest)) return;

      try {
        const assetResponse = await fetch(assetRequest, { cache: 'no-store' });
        if (!assetResponse.ok) {
          if (strictAssets) throw new Error(`Could not cache ${absoluteUrl.pathname}`);
          return;
        }
        await cache.put(assetRequest, assetResponse);
      } catch (error) {
        if (strictAssets) throw error;
      }
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

async function cachedNavigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(canonicalRouteRequest(request))) ??
    (await cache.match(new Request(`${self.location.origin}/app`))) ??
    offlineFallbackResponse()
  );
}

async function networkFirstNavigation(event, request) {
  if (self.navigator.onLine === false) return cachedNavigationResponse(request);

  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (isCacheableAppResponse(request, response)) {
      const cache = await caches.open(CACHE_NAME);
      event.waitUntil(cacheNavigationResponse(cache, request, response.clone(), false));
    }
    return response;
  } catch {
    return cachedNavigationResponse(request);
  }
}

async function cacheFirstResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const matched = await cache.match(request);
  if (matched) return matched;

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function offlineFallbackResponse() {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ravel offline</title></head><body style="font-family:system-ui,sans-serif;margin:0;padding:32px;background:#f8f5ee;color:#2e241e"><main style="max-width:560px;margin:auto"><h1>Ravel is offline</h1><p>The local app shell was not available for this page yet. Reconnect once so Ravel can finish preparing offline access.</p></main></body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate' && isAppPath(url.pathname)) {
    event.respondWith(networkFirstNavigation(event, request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstResponse(request));
    return;
  }

  const cacheableStatic =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    ['font', 'image'].includes(request.destination);

  if (!cacheableStatic) return;
  event.respondWith(cacheFirstResponse(request));
});
