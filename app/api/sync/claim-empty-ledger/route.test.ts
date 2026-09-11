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

const generation = '123e4567-e89b-42d3-a456-426614174000';
const backup = {
  format: 'taptrack-backup',
  version: 2,
  exportedAt: '2026-09-11T10:00:00.000Z',
  transactions: [],
  balanceCheckpoints: [],
  categories: [],
  monthlyBudgets: [],
  categoryBudgets: [],
  recurringTransactions: [],
  conversions: [],
  settings: [
    {
      id: 'default',
      defaultCurrency: 'TRY',
      activeCurrencies: ['TRY'],
      lastUsedMethod: 'card',
      setupCompleted: false,
      aiCategorizationEnabled: false,
      aiAutoCategorizationEnabled: true,
      aiRecommendNewCategoriesEnabled: true,
      darkModeEnabled: false,
      createdAt: '2026-09-11T10:00:00.000Z',
      updatedAt: '2026-09-11T10:00:00.000Z',
    },
  ],
};

function request(body: unknown = { backup }) {
  return new Request('http://localhost/api/sync/claim-empty-ledger', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sync/claim-empty-ledger', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    adminRpc.mockResolvedValue({ data: [{ claimed: true, revision: 1, generation }], error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects signed-out callers before the claim RPC', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid backups before the claim RPC', async () => {
    const response = await POST(request({ backup: { format: 'not-taptrack', version: 2 } }));

    expect(response.status).toBe(400);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('claims and seeds only the authenticated account', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ revision: 1, generation });
    expect(adminRpc).toHaveBeenCalledTimes(1);
    const [name, args] = adminRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('claim_empty_taptrack_ledger');
    expect(args.target_user_id).toBe('user-1');
    const remoteBackup = args.backup as Record<string, unknown>;
    expect(remoteBackup).toHaveProperty('balance_checkpoints');
    expect(remoteBackup).toHaveProperty('recurring_transactions');
    expect(remoteBackup).not.toHaveProperty('balanceCheckpoints');
  });

  it('returns a conflict when another device already claimed the account', async () => {
    adminRpc.mockResolvedValue({
      data: [{ claimed: false, revision: 1, generation }],
      error: null,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ revision: 1, generation });
    expect(body.error).toContain('already has cloud data');
  });

  it('fails closed when the RPC returns an invalid ledger version', async () => {
    adminRpc.mockResolvedValue({
      data: [{ claimed: true, revision: 0, generation: 'invalid' }],
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
  });
});
