import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { proxy } from './proxy';

function mockUser(user: { id: string } | null, error?: Error) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getUser: vi.fn(async () => {
        if (error) throw error;
        return { data: { user } };
      }),
    },
  } as unknown as ReturnType<typeof createServerClient>);
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe('proxy route policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
  });

  it('keeps local app routes available without consulting the auth provider', async () => {
    mockUser(null);

    const root = await proxy(request('/app'));
    const reports = await proxy(request('/app/reports'));

    expect(root.status).toBe(200);
    expect(reports.status).toBe(200);
    expect(root.headers.get('location')).toBeNull();
    expect(reports.headers.get('location')).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('keeps login reachable for unauthenticated users', async () => {
    mockUser(null);

    const response = await proxy(request('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(createServerClient).toHaveBeenCalledTimes(1);
  });

  it('does not consult authentication for integration API routes', async () => {
    mockUser(null);

    const exchange = await proxy(request('/api/exchange-rates'));
    const webhook = await proxy(request('/api/telegram/webhook'));

    expect(exchange.status).toBe(200);
    expect(webhook.status).toBe(200);
    expect(exchange.headers.get('location')).toBeNull();
    expect(webhook.headers.get('location')).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('does not consult authentication for PWA assets', async () => {
    mockUser(null);

    const manifest = await proxy(request('/manifest.webmanifest'));
    const serviceWorker = await proxy(request('/sw.js'));

    expect(manifest.status).toBe(200);
    expect(serviceWorker.status).toBe(200);
    expect(manifest.headers.get('location')).toBeNull();
    expect(serviceWorker.headers.get('location')).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('sends authenticated users away from login while leaving root to its page redirect', async () => {
    mockUser({ id: 'user-1' });

    const login = await proxy(request('/login'));
    const root = await proxy(request('/'));

    expect(login.status).toBe(307);
    expect(login.headers.get('location')).toBe('http://localhost/app');
    expect(root.status).toBe(200);
    expect(root.headers.get('location')).toBeNull();
  });

  it('does not construct a provider client when configuration is absent', async () => {
    vi.unstubAllEnvs();

    const response = await proxy(request('/login'));

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('keeps login available when the provider fails', async () => {
    mockUser(null, new Error('provider down'));

    const response = await proxy(request('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
