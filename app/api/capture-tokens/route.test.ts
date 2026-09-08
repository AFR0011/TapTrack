import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminFrom: vi.fn(),
  createCaptureToken: vi.fn(() => 'ttcap_test_private_key'),
  hashCaptureToken: vi.fn(() => 'a'.repeat(64)),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({ from: mocks.adminFrom }),
}));

vi.mock('@/server/capture/captureTokens', () => ({
  createCaptureToken: mocks.createCaptureToken,
  hashCaptureToken: mocks.hashCaptureToken,
}));

import { POST } from './route';

function request(body: unknown = { label: 'My iPhone' }) {
  return new NextRequest('http://localhost/api/capture-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function settingsQuery(result: { data: { id: string } | null; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

function captureTokenQuery() {
  const countResult = { count: 0, error: null };
  const countChain = {
    eq: vi.fn(),
    is: vi.fn().mockResolvedValue(countResult),
  };
  countChain.eq.mockReturnValue(countChain);

  const createdDevice = {
    id: 'device-1',
    label: 'My iPhone',
    created_at: '2026-09-08T17:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
  const insertChain = {
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: createdDevice, error: null }),
  };
  insertChain.select.mockReturnValue(insertChain);

  const table = {
    select: vi.fn((_fields: string, options?: { head?: boolean }) => {
      if (options?.head) return countChain;
      throw new Error('Unexpected capture token select');
    }),
    insert: vi.fn(() => insertChain),
  };

  return { table, createdDevice };
}

describe('POST /api/capture-tokens', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects signed-out callers before any admin query', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('refuses to mint a key until the canonical account ledger is ready', async () => {
    const settings = settingsQuery({ data: null, error: null });
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === 'settings') return settings;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('Link cloud sync');
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1);
    expect(mocks.createCaptureToken).not.toHaveBeenCalled();
  });

  it('fails closed when canonical readiness cannot be checked', async () => {
    const settings = settingsQuery({ data: null, error: { message: 'database unavailable' } });
    mocks.adminFrom.mockReturnValue(settings);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.createCaptureToken).not.toHaveBeenCalled();
  });

  it('mints a one-time raw key only after canonical setup is ready', async () => {
    const settings = settingsQuery({ data: { id: 'default' }, error: null });
    const capture = captureTokenQuery();
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === 'settings') return settings;
      if (table === 'capture_tokens') return capture.table;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ token: 'ttcap_test_private_key', device: capture.createdDevice });
    expect(mocks.hashCaptureToken).toHaveBeenCalledWith('ttcap_test_private_key');
    expect(capture.table.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        token_hash: 'a'.repeat(64),
        label: 'My iPhone',
      })
    );
    expect(capture.table.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ token_hash: 'ttcap_test_private_key' })
    );
  });
});
