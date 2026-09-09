import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const adminRpc = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc: adminRpc,
  }),
}));

import { POST } from './route';

function request(body = {
  title: 'Spotify',
  transactionType: 'expense',
  categories: [{ id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense' }],
}) {
  return new Request('http://localhost/api/categorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/categorize', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-public-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
    vi.stubEnv('GROQ_API_KEY', 'test-ai-key');
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    adminRpc.mockResolvedValue({ data: true, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects signed-out callers before consuming quota or calling Groq', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(adminRpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-account quota is exhausted', async () => {
    adminRpc.mockResolvedValue({ data: false, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(adminRpc).toHaveBeenCalledWith('consume_ai_categorization_quota', {
      target_user_id: 'user-1',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails explicitly when server-side quota configuration is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('fails explicitly when Groq is not configured', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const response = await POST(request());
    expect(response.status).toBe(503);
  });

  it('returns a structured existing-category result from the allowed list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: 'existing',
                    categoryId: 'cat-subscriptions',
                    confidence: 0.94,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      kind: 'existing',
      categoryId: 'cat-subscriptions',
      confidence: 0.94,
      unavailable: false,
    });
    expect(adminRpc).toHaveBeenCalledWith('consume_ai_categorization_quota', {
      target_user_id: 'user-1',
    });
  });

  it('returns a non-blocking unavailable result when Groq fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider-error', { status: 500 })));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ kind: 'none', unavailable: true });
  });

  it('rejects oversized titles without calling Groq or consuming quota', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({
      title: 'x'.repeat(161),
      transactionType: 'expense',
      categories: [{ id: 'cat-food', name: 'Food', type: 'expense' }],
    }));

    expect(response.status).toBe(400);
    expect(adminRpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
