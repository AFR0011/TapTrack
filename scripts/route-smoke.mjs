const baseUrl = process.env.TAPTRACK_SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';

const checks = [
  {
    name: 'root redirects unauthenticated users',
    path: '/',
    init: { redirect: 'manual' },
    expect: (response) =>
      [307, 308].includes(response.status) &&
      (response.headers.get('location') ?? '').includes('/login'),
  },
  {
    name: 'login is reachable',
    path: '/login',
    expect: (response) => response.status === 200,
  },
  {
    name: 'app redirects unauthenticated users',
    path: '/app',
    init: { redirect: 'manual' },
    expect: (response) =>
      [307, 308].includes(response.status) &&
      (response.headers.get('location') ?? '').includes('/login'),
  },
  {
    name: 'exchange API returns JSON, not login HTML',
    path: '/api/exchange-rates',
    expect: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.clone().json().catch(() => null);
      return response.status === 200 && contentType.includes('application/json') && body?.USD && body?.EUR;
    },
  },
  {
    name: 'manifest is public JSON',
    path: '/manifest.webmanifest',
    expect: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.clone().json().catch(() => null);
      return response.status === 200 && contentType.includes('application/manifest+json') && body?.name === 'TapTrack';
    },
  },
  {
    name: 'service worker is public JavaScript',
    path: '/sw.js',
    expect: (response) => response.status === 200 && response.headers.get('content-type')?.includes('javascript'),
  },
  {
    name: 'telegram webhook rejects bad secret with JSON 401',
    path: '/api/telegram/webhook',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong',
      },
      body: JSON.stringify({ update_id: 1 }),
    },
    expect: (response) => response.status === 401 && response.headers.get('content-type')?.includes('application/json'),
  },
  {
    name: 'telegram register rejects bad admin secret with JSON 401',
    path: '/api/telegram/register',
    init: {
      headers: {
        'x-admin-secret': 'wrong',
      },
    },
    expect: (response) => response.status === 401 && response.headers.get('content-type')?.includes('application/json'),
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
