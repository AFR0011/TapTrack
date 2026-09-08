import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const adminRpc = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({ rpc: adminRpc }),
}));

import { POST } from './route';

const validBody = {
  revision: 2,
  generation: '123e4567-e89b-42d3-a456-426614174000',
  table: 'transactions',
  operation: 'upsert',
  recordId: 'tx-1',
  record: {
    id: 'tx-1',
    type: 'expense',
    amount: 20,
    currency: 'TRY',
    title: 'Coffee',
    category_id: 'cat-food',
    method: 'cash',
    date: '2026-09-08',
    created_at: '2026-09-08T06:00:00.000Z',
    updated_at: '2026-09-08T06:00:00.000Z',
  },
};

function request(body: unknown = validBody) {
  return new Request('http://localhost/api/sync/operation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sync/operation', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    adminRpc.mockResolvedValue({
      data: [{ applied: true, revision: 2, generation: validBody.generation }],
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects signed-out callers before admin RPC', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('scopes the protected write to the authenticated user', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith('apply_taptrack_sync_operation', {
      target_user_id: 'user-1',
      expected_revision: 2,
      expected_generation: validBody.generation,
      target_table: 'transactions',
      operation: 'upsert',
      record_id: 'tx-1',
      record: validBody.record,
    });
  });

  it('returns 409 when the account ledger generation changed', async () => {
    adminRpc.mockResolvedValue({
      data: [{ applied: false, revision: 3, generation: '123e4567-e89b-42d3-b456-426614174001' }],
      error: null,
    });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: 'ledger-generation-changed', revision: 3 });
  });

  it('rejects table names outside the canonical allowlist', async () => {
    const response = await POST(request({ ...validBody, table: 'balances' }));
    expect(response.status).toBe(400);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('rejects upserts whose record id does not match the operation id', async () => {
    const response = await POST(
      request({ ...validBody, record: { ...validBody.record, id: 'tx-other' } })
    );
    expect(response.status).toBe(400);
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
