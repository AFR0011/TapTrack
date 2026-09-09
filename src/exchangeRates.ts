import type { Currency } from '@/types';

export const EXCHANGE_RATE_SOURCE = 'Frankfurter' as const;
const EXCHANGE_RATE_CACHE_KEY = 'taptrack.exchange-rates.v1';
const MAX_CACHED_RATES = 120;

export type HistoricalExchangeRateResponse = {
  base: Currency;
  quote: Currency;
  dateRequested: string;
  dateUsed: string;
  rate: number;
  source: typeof EXCHANGE_RATE_SOURCE;
  status: 'historical' | 'prior-available';
  /** True when this response came from TapTrack's local rate cache. */
  cached?: boolean;
  /** When TapTrack last fetched this rate successfully from the provider. */
  fetchedAt?: string;
};

export type CachedExchangeRate = Omit<HistoricalExchangeRateResponse, 'cached'> & {
  fetchedAt: string;
};

type ExchangeRateRequest = {
  base: Currency;
  quote: Currency;
  date: string;
  signal?: AbortSignal;
};

export async function fetchHistoricalExchangeRate(
  input: ExchangeRateRequest
): Promise<HistoricalExchangeRateResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return getCachedRateOrThrow(input);
  }

  const params = new URLSearchParams({ base: input.base, quote: input.quote, date: input.date });

  try {
    const response = await fetch(`/api/exchange-rates?${params.toString()}`, {
      signal: input.signal,
      cache: 'no-store',
    });
    const data = (await response.json()) as Partial<HistoricalExchangeRateResponse> & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || 'Exchange rates are temporarily unavailable.');
    }

    const validated = validateExchangeRateResponse(data, input);
    const fetchedAt = new Date().toISOString();
    cacheExchangeRate({ ...validated, fetchedAt });
    return { ...validated, cached: false, fetchedAt };
  } catch (error) {
    if (isAbortError(error)) throw error;
    const cached = findLatestCachedExchangeRate(readCachedExchangeRates(), input);
    if (cached) return cached;
    throw error;
  }
}

export function findLatestCachedExchangeRate(
  entries: CachedExchangeRate[],
  input: Pick<ExchangeRateRequest, 'base' | 'quote' | 'date'>
): HistoricalExchangeRateResponse | null {
  const candidates = entries
    .filter((entry) => isValidCachedExchangeRate(entry))
    .filter((entry) => entry.dateUsed <= input.date)
    .filter(
      (entry) =>
        (entry.base === input.base && entry.quote === input.quote) ||
        (entry.base === input.quote && entry.quote === input.base)
    )
    .sort((a, b) => {
      const byDate = b.dateUsed.localeCompare(a.dateUsed);
      return byDate !== 0 ? byDate : b.fetchedAt.localeCompare(a.fetchedAt);
    });

  const latest = candidates[0];
  if (!latest) return null;

  const status = latest.dateUsed === input.date ? 'historical' : 'prior-available';
  if (latest.base === input.base && latest.quote === input.quote) {
    return {
      base: input.base,
      quote: input.quote,
      dateRequested: input.date,
      dateUsed: latest.dateUsed,
      rate: latest.rate,
      source: EXCHANGE_RATE_SOURCE,
      status,
      cached: true,
      fetchedAt: latest.fetchedAt,
    };
  }

  return {
    base: input.base,
    quote: input.quote,
    dateRequested: input.date,
    dateUsed: latest.dateUsed,
    rate: 1 / latest.rate,
    source: EXCHANGE_RATE_SOURCE,
    status,
    cached: true,
    fetchedAt: latest.fetchedAt,
  };
}

function getCachedRateOrThrow(input: ExchangeRateRequest): HistoricalExchangeRateResponse {
  const cached = findLatestCachedExchangeRate(readCachedExchangeRates(), input);
  if (cached) return cached;
  throw new Error(
    `No saved ${input.base} → ${input.quote} exchange rate is available on or before ${input.date}. Connect to fetch a suitable rate.`
  );
}

function validateExchangeRateResponse(
  data: Partial<HistoricalExchangeRateResponse>,
  input: ExchangeRateRequest
): HistoricalExchangeRateResponse {
  if (
    data.base !== input.base ||
    data.quote !== input.quote ||
    data.dateRequested !== input.date ||
    typeof data.dateUsed !== 'string' ||
    data.dateUsed > input.date ||
    typeof data.rate !== 'number' ||
    !Number.isFinite(data.rate) ||
    data.rate <= 0 ||
    data.source !== EXCHANGE_RATE_SOURCE ||
    (data.status !== 'historical' && data.status !== 'prior-available')
  ) {
    throw new Error('Exchange-rate service returned an invalid response.');
  }

  return {
    base: data.base,
    quote: data.quote,
    dateRequested: data.dateRequested,
    dateUsed: data.dateUsed,
    rate: data.rate,
    source: data.source,
    status: data.status,
  };
}

function cacheExchangeRate(entry: CachedExchangeRate) {
  const storage = getLocalStorage();
  if (!storage) return;

  const current = readCachedExchangeRates();
  const withoutSameObservation = current.filter(
    (cached) =>
      !(
        cached.base === entry.base &&
        cached.quote === entry.quote &&
        cached.dateUsed === entry.dateUsed
      )
  );
  const next = [entry, ...withoutSameObservation]
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_CACHED_RATES);

  try {
    storage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Rate caching is best-effort. A full or unavailable storage area must not block online exchange.
  }
}

function readCachedExchangeRates(): CachedExchangeRate[] {
  const storage = getLocalStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCachedExchangeRate);
  } catch {
    return [];
  }
}

function isValidCachedExchangeRate(value: unknown): value is CachedExchangeRate {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CachedExchangeRate>;
  return (
    typeof entry.base === 'string' &&
    /^[A-Z]{3}$/.test(entry.base) &&
    typeof entry.quote === 'string' &&
    /^[A-Z]{3}$/.test(entry.quote) &&
    typeof entry.dateRequested === 'string' &&
    typeof entry.dateUsed === 'string' &&
    typeof entry.rate === 'number' &&
    Number.isFinite(entry.rate) &&
    entry.rate > 0 &&
    entry.source === EXCHANGE_RATE_SOURCE &&
    (entry.status === 'historical' || entry.status === 'prior-available') &&
    typeof entry.fetchedAt === 'string'
  );
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}
