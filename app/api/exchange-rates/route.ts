import { NextRequest, NextResponse } from 'next/server';
import {
  EXCHANGE_RATE_SOURCE,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import type { Currency } from '@/types';

const SUPPORTED = new Set<Currency>(['TRY', 'USD', 'EUR']);
const MAX_LOOKBACK_DAYS = 14;

type FrankfurterRateResponse = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const dateRequested = request.nextUrl.searchParams.get('date') ?? '';
  const base = request.nextUrl.searchParams.get('base') as Currency | null;
  const quote = request.nextUrl.searchParams.get('quote') as Currency | null;

  if (!isValidIsoDate(dateRequested)) {
    return NextResponse.json({ error: 'A valid date in YYYY-MM-DD format is required.' }, { status: 400 });
  }
  if (!base || !quote || !SUPPORTED.has(base) || !SUPPORTED.has(quote)) {
    return NextResponse.json({ error: 'Supported base and quote currencies are required.' }, { status: 400 });
  }

  if (base === quote) {
    return NextResponse.json(
      {
        base,
        quote,
        dateRequested,
        dateUsed: dateRequested,
        rate: 1,
        source: EXCHANGE_RATE_SOURCE,
        status: 'historical',
      } satisfies HistoricalExchangeRateResponse,
      { headers: cacheHeaders(dateRequested) }
    );
  }

  try {
    for (let offset = 0; offset <= MAX_LOOKBACK_DAYS; offset += 1) {
      const candidateDate = subtractUtcDays(dateRequested, offset);
      const upstream = await fetch(
        `https://api.frankfurter.dev/v2/rate/${base}/${quote}?date=${candidateDate}&providers=TCMB`,
        { cache: 'no-store' }
      );

      if (upstream.status === 404 || upstream.status === 422) continue;
      if (!upstream.ok) throw new Error(`Frankfurter returned ${upstream.status}`);

      const data = (await upstream.json()) as FrankfurterRateResponse;
      const rate = Number(data.rate);
      if (!Number.isFinite(rate) || rate <= 0) continue;

      const dateUsed = isValidIsoDate(data.date ?? '') ? data.date! : candidateDate;
      if (dateUsed > dateRequested) {
        throw new Error('Exchange-rate provider returned a future rate.');
      }

      const response: HistoricalExchangeRateResponse = {
        base,
        quote,
        dateRequested,
        dateUsed,
        rate,
        source: EXCHANGE_RATE_SOURCE,
        status: dateUsed === dateRequested ? 'historical' : 'prior-available',
      };

      return NextResponse.json(response, { headers: cacheHeaders(dateRequested) });
    }

    return NextResponse.json(
      { error: 'No published exchange rate was available for the selected date or prior days.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Exchange rates are temporarily unavailable. No estimated fallback was used.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function subtractUtcDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function cacheHeaders(dateRequested: string): Record<string, string> {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return {
    'Cache-Control':
      dateRequested < todayUtc
        ? 'public, s-maxage=86400, stale-while-revalidate=604800'
        : 'public, s-maxage=3600, stale-while-revalidate=3600',
  };
}
