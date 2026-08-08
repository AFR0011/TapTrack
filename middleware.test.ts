import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { proxy } from './proxy';

function mockUser(user: { id: string } | null) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
  } as unknown as ReturnType<typeof createServerClient>);
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe('proxy route policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated app routes to login', async () => {
    mockUser(null);

    const response = await proxy(request('/app'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('keeps login reachable for unauthenticated users', async () => {
    mockUser(null);

    const response = await proxy(request('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not redirect public integration API routes', async () => {
    mockUser(null);

    const exchange = await proxy(request('/api/exchange-rates'));
    const webhook = await proxy(request('/api/telegram/webhook'));

    expect(exchange.status).toBe(200);
    expect(webhook.status).toBe(200);
    expect(exchange.headers.get('location')).toBeNull();
    expect(webhook.headers.get('location')).toBeNull();
  });

  it('does not redirect PWA assets', async () => {
    mockUser(null);

    const manifest = await proxy(request('/manifest.webmanifest'));
    const serviceWorker = await proxy(request('/sw.js'));

    expect(manifest.status).toBe(200);
    expect(serviceWorker.status).toBe(200);
    expect(manifest.headers.get('location')).toBeNull();
    expect(serviceWorker.headers.get('location')).toBeNull();
  });

  it('sends authenticated users away from login and root to the app', async () => {
    mockUser({ id: 'user-1' });

    const login = await proxy(request('/login'));
    const root = await proxy(request('/'));

    expect(login.status).toBe(307);
    expect(login.headers.get('location')).toBe('http://localhost/app');
    expect(root.status).toBe(307);
    expect(root.headers.get('location')).toBe('http://localhost/app');
  });
});
