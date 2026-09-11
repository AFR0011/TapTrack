import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXCHANGE_RATE_SOURCE,
  fetchHistoricalExchangeRate,
  findLatestCachedExchangeRate,
  type CachedExchangeRate,
} from './exchangeRates';

const directOlder: CachedExchangeRate = {
  base: 'TRY',
  quote: 'USD',
  dateRequested: '2026-09-08',
  dateUsed: '2026-09-08',
  rate: 0.023,
  source: EXCHANGE_RATE_SOURCE,
  status: 'historical',
  fetchedAt: '2026-09-08T10:00:00.000Z',
};

const directNewer: CachedExchangeRate = {
  ...directOlder,
  dateRequested: '2026-09-09',
  dateUsed: '2026-09-09',
  rate: 0.024,
  fetchedAt: '2026-09-09T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exchange-rate cache', () => {
  it('uses the closest saved observation on or before the requested date', () => {
    expect(
      findLatestCachedExchangeRate([directOlder, directNewer], {
        base: 'TRY',
        quote: 'USD',
        date: '2026-09-10',
      })
    ).toMatchObject({
      base: 'TRY',
      quote: 'USD',
      dateRequested: '2026-09-10',
      dateUsed: '2026-09-09',
      rate: 0.024,
      status: 'prior-available',
      cached: true,
      fetchedAt: '2026-09-09T10:00:00.000Z',
    });
  });

  it('never uses a future cached observation for an earlier historical request', () => {
    expect(
      findLatestCachedExchangeRate([directOlder, directNewer], {
        base: 'TRY',
        quote: 'USD',
        date: '2026-09-08',
      })
    ).toMatchObject({
      dateRequested: '2026-09-08',
      dateUsed: '2026-09-08',
      rate: 0.023,
      status: 'historical',
    });

    expect(
      findLatestCachedExchangeRate([directNewer], {
        base: 'TRY',
        quote: 'USD',
        date: '2026-09-08',
      })
    ).toBeNull();
  });

  it('can invert the newest eligible saved reverse-pair rate', () => {
    const reverse: CachedExchangeRate = {
      base: 'USD',
      quote: 'TRY',
      dateRequested: '2026-09-09',
      dateUsed: '2026-09-09',
      rate: 40,
      source: EXCHANGE_RATE_SOURCE,
      status: 'historical',
      fetchedAt: '2026-09-09T12:00:00.000Z',
    };

    expect(
      findLatestCachedExchangeRate([directOlder, reverse], {
        base: 'TRY',
        quote: 'USD',
        date: '2026-09-10',
      })
    ).toMatchObject({
      rate: 0.025,
      cached: true,
      dateRequested: '2026-09-10',
      dateUsed: '2026-09-09',
      status: 'prior-available',
    });
  });

  it('falls back to local storage while offline without changing the requested date', async () => {
    const storage = new Map<string, string>();
    storage.set('taptrack.exchange-rates.v1', JSON.stringify([directNewer]));

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    vi.stubGlobal('navigator', { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchHistoricalExchangeRate({ base: 'TRY', quote: 'USD', date: '2026-09-10' })
    ).resolves.toMatchObject({
      rate: 0.024,
      cached: true,
      dateRequested: '2026-09-10',
      dateUsed: '2026-09-09',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects offline fallback when the only saved rate is after the requested date', async () => {
    const storage = new Map<string, string>();
    storage.set('ravel.exchange-rates.v1', JSON.stringify([directNewer]));
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    vi.stubGlobal('navigator', { onLine: false });

    await expect(
      fetchHistoricalExchangeRate({ base: 'TRY', quote: 'USD', date: '2026-09-08' })
    ).rejects.toThrow('No saved TRY → USD exchange rate is available on or before 2026-09-08');
  });

  it('explains when no rate has ever been cached for offline use', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    });
    vi.stubGlobal('navigator', { onLine: false });

    await expect(
      fetchHistoricalExchangeRate({ base: 'TRY', quote: 'GBP', date: '2026-09-10' })
    ).rejects.toThrow('No saved TRY → GBP exchange rate is available on or before 2026-09-10');
  });
});
