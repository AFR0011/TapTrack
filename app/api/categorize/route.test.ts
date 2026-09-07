import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser },
    rpc,
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
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('GROQ_API_KEY', 'groq-secret');
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
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
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-account quota is exhausted', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails explicitly when Groq is not configured', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const response = await POST(request());
    expect(response.status).toBe(503);
  });

  it('returns only a category id from the allowed list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'cat-subscriptions' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ categoryId: 'cat-subscriptions' });
    expect(rpc).toHaveBeenCalledWith('consume_ai_categorization_quota', { max_requests: 30 });
  });

  it('rejects oversized titles without calling Groq', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({
      title: 'x'.repeat(161),
      transactionType: 'expense',
      categories: [{ id: 'cat-food', name: 'Food', type: 'expense' }],
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
