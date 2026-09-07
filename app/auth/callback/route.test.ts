import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: authMocks })),
}));

import { GET } from './route';

beforeEach(() => {
  authMocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  authMocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
  authMocks.getUser.mockReset().mockResolvedValue({
    data: { user: null },
    error: null,
  });
});

function request(query = '') {
  return new NextRequest(`http://localhost/auth/callback${query ? `?${query}` : ''}`);
}

describe('auth callback route', () => {
  it('exchanges a PKCE code before granting the app redirect', async () => {
    const response = await GET(request('code=abc'));

    expect(authMocks.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(response.headers.get('location')).toBe('http://localhost/app');
  });

  it('verifies token-hash email callbacks', async () => {
    const response = await GET(request('token_hash=hash-1&type=email'));

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'email' });
    expect(response.headers.get('location')).toBe('http://localhost/app');
  });

  it('returns failed exchanges to login instead of granting the app redirect', async () => {
    authMocks.exchangeCodeForSession.mockResolvedValue({ error: new Error('bad code') });

    const response = await GET(request('code=bad'));

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?auth=confirmation-failed'
    );
  });

  it('only accepts a credential-free callback when the browser is already authenticated', async () => {
    const rejected = await GET(request());
    expect(rejected.headers.get('location')).toBe(
      'http://localhost/login?auth=confirmation-failed'
    );

    authMocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const accepted = await GET(request());
    expect(accepted.headers.get('location')).toBe('http://localhost/app');
  });
});
