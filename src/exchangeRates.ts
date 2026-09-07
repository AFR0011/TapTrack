import type { Currency } from '@/types';

export const EXCHANGE_RATE_SOURCE = 'TCMB via Frankfurter' as const;

export type HistoricalExchangeRateResponse = {
  base: Currency;
  quote: Currency;
  dateRequested: string;
  dateUsed: string;
  rate: number;
  source: typeof EXCHANGE_RATE_SOURCE;
  status: 'historical' | 'prior-available';
};

export async function fetchHistoricalExchangeRate(input: {
  base: Currency;
  quote: Currency;
  date: string;
  signal?: AbortSignal;
}): Promise<HistoricalExchangeRateResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Exchange rates require an internet connection.');
  }

  const params = new URLSearchParams({
    base: input.base,
    quote: input.quote,
    date: input.date,
  });
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

  if (
    data.base !== input.base ||
    data.quote !== input.quote ||
    data.dateRequested !== input.date ||
    typeof data.dateUsed !== 'string' ||
    typeof data.rate !== 'number' ||
    !Number.isFinite(data.rate) ||
    data.rate <= 0 ||
    data.source !== EXCHANGE_RATE_SOURCE ||
    (data.status !== 'historical' && data.status !== 'prior-available')
  ) {
    throw new Error('Exchange-rate service returned an invalid response.');
  }

  return data as HistoricalExchangeRateResponse;
}
