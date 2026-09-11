const baseUrl = process.env.TAPTRACK_SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';

const checks = [
  {
    name: 'public Ravel landing page is reachable',
    path: '/',
    expect: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.clone().text();
      return (
        response.status === 200 &&
        contentType.includes('text/html') &&
        body.includes('Ravel') &&
        body.includes('Your money doesn’t live in one place. Your ledger can.') &&
        body.includes('Illustrative interface')
      );
    },
  },
  {
    name: 'login is reachable',
    path: '/login',
    expect: (response) => response.status === 200,
  },
  {
    name: 'app is reachable without authentication',
    path: '/app',
    expect: (response) => response.status === 200,
  },
  {
    name: 'app responses carry security headers',
    path: '/app',
    expect: (response) => {
      const csp = response.headers.get('content-security-policy') ?? '';
      return (
        response.status === 200 &&
        csp.includes("default-src 'self'") &&
        csp.includes("frame-ancestors 'none'") &&
        response.headers.get('x-content-type-options') === 'nosniff' &&
        response.headers.get('x-frame-options') === 'DENY' &&
        response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin'
      );
    },
  },
  {
    name: 'exchange API returns typed JSON without authentication',
    path: '/api/exchange-rates?date=2026-09-04&base=TRY&quote=TRY',
    expect: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.clone().json().catch(() => null);
      return (
        response.status === 200 &&
        contentType.includes('application/json') &&
        body?.base === 'TRY' &&
        body?.quote === 'TRY' &&
        body?.rate === 1 &&
        body?.dateRequested === '2026-09-04'
      );
    },
  },
  {
    name: 'Ravel manifest is public JSON',
    path: '/manifest.webmanifest',
    expect: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.clone().json().catch(() => null);
      return (
        response.status === 200 &&
        contentType.includes('application/manifest+json') &&
        body?.name === 'Ravel' &&
        body?.icons?.some((icon) => icon?.src === '/icons/ravel-icon.svg') &&
        body?.icons?.some((icon) => icon?.src === '/icons/ravel-maskable.svg')
      );
    },
  },
  {
    name: 'Ravel service worker precaches current app assets',
    path: '/sw.js',
    expect: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.clone().text();
      return (
        response.status === 200 &&
        contentType.includes('javascript') &&
        body.includes('/icons/ravel-icon.svg') &&
        body.includes('/icons/ravel-maskable.svg') &&
        !body.includes('/icons/taptrack-icon.svg') &&
        !body.includes('/icons/taptrack-maskable.svg')
      );
    },
  },
  {
    name: 'telegram webhook fails closed when integration is unconfigured',
    path: '/api/telegram/webhook',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong',
      },
      body: JSON.stringify({ update_id: 1 }),
    },
    expect: (response) =>
      response.status === 503 && response.headers.get('content-type')?.includes('application/json'),
  },
  {
    name: 'telegram register fails closed when integration is unconfigured',
    path: '/api/telegram/register',
    init: {
      headers: {
        'x-admin-secret': 'wrong',
      },
    },
    expect: (response) =>
      response.status === 503 && response.headers.get('content-type')?.includes('application/json'),
  },
];

let failures = 0;

for (const check of checks) {
  const response = await fetch(new URL(check.path, baseUrl), check.init);
  const ok = await check.expect(response);
  if (ok) {
    console.log(`PASS ${check.name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${check.name}: ${response.status} ${response.statusText}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
