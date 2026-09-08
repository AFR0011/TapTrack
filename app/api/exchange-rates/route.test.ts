import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request(query: string) {
  return new NextRequest(`http://localhost/api/exchange-rates?${query}`);
}

describe('historical exchange-rate route', () => {
  it('rejects invalid dates without contacting the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('date=2026-02-31&base=TRY&quote=USD'));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 1 for same-currency transfers without an upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('date=2026-09-05&base=TRY&quote=TRY'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      base: 'TRY',
      quote: 'TRY',
      dateRequested: '2026-09-05',
      dateUsed: '2026-09-05',
      rate: 1,
      status: 'historical',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the most recent prior published rate for weekends or holidays', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'not found' }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              date: '2026-09-03',
              base: 'TRY',
              quote: 'USD',
              rate: 0.0205,
            },
            {
              date: '2026-09-04',
              base: 'TRY',
              quote: 'USD',
              rate: 0.02061,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('date=2026-09-05&base=TRY&quote=USD'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      dateRequested: '2026-09-05',
      dateUsed: '2026-09-04',
      rate: 0.02061,
      status: 'prior-available',
      source: 'TCMB via Frankfurter',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('date=2026-09-05'),
      { cache: 'no-store' }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/v2/rates?from=2026-08-05&to=2026-09-04'),
      { cache: 'no-store' }
    );
  });

  it('continues past the initial lookback window instead of inventing a cutoff', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'not found' }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              date: '2026-07-01',
              base: 'TRY',
              quote: 'USD',
              rate: 0.0198,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('date=2026-09-05&base=TRY&quote=USD'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      dateUsed: '2026-07-01',
      rate: 0.0198,
      status: 'prior-available',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/v2/rates?from=2022-08-04&to=2026-08-04'),
      { cache: 'no-store' }
    );
  });

  it('fails explicitly when the provider fails instead of returning invented rates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'down' }), { status: 500 }))
    );

    const response = await GET(request('date=2026-09-04&base=TRY&quote=USD'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain('No estimated fallback was used');
    expect(body).not.toHaveProperty('rate');
  });
});
