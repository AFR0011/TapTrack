import { NextRequest, NextResponse } from 'next/server';
import {
  EXCHANGE_RATE_SOURCE,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import { normalizeCurrencyCode } from '@/currencies/currencyCatalog';
import type { Currency } from '@/types';

const COVERAGE_START = '1948-01-01';
const INITIAL_LOOKBACK_DAYS = 31;
const RANGE_WINDOW_YEARS = 4;

type FrankfurterRateRecord = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const dateRequested = request.nextUrl.searchParams.get('date') ?? '';
  const base = normalizeCurrencyCode(request.nextUrl.searchParams.get('base'));
  const quote = normalizeCurrencyCode(request.nextUrl.searchParams.get('quote'));

  if (!isValidIsoDate(dateRequested)) {
    return NextResponse.json({ error: 'A valid date in YYYY-MM-DD format is required.' }, { status: 400 });
  }
  if (!base || !quote) {
    return NextResponse.json({ error: 'Valid base and quote currencies are required.' }, { status: 400 });
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
    const exact = await fetchExactRate(base, quote, dateRequested);
    if (exact) {
      return NextResponse.json(toResponse(base, quote, dateRequested, exact), {
        headers: cacheHeaders(dateRequested),
      });
    }

    const prior = await fetchMostRecentPriorRate(base, quote, dateRequested);
    if (prior) {
      return NextResponse.json(toResponse(base, quote, dateRequested, prior), {
        headers: cacheHeaders(dateRequested),
      });
    }

    return NextResponse.json(
      { error: 'No published exchange rate was available on or before the selected date.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Exchange rates are temporarily unavailable. No estimated fallback was used.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

async function fetchExactRate(
  base: Currency,
  quote: Currency,
  date: string
): Promise<FrankfurterRateRecord | null> {
  const upstream = await fetch(
    `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}?date=${date}`,
    { cache: 'no-store' }
  );

  if (upstream.status === 404 || upstream.status === 422) return null;
  if (!upstream.ok) throw new Error(`Frankfurter returned ${upstream.status}`);

  const record = (await upstream.json()) as FrankfurterRateRecord;
  return isUsableRateRecord(record, base, quote, date) ? record : null;
}

async function fetchMostRecentPriorRate(
  base: Currency,
  quote: Currency,
  dateRequested: string
): Promise<FrankfurterRateRecord | null> {
  if (dateRequested <= COVERAGE_START) return null;

  let rangeEnd = subtractUtcDays(dateRequested, 1);
  let rangeStart = maxIsoDate(COVERAGE_START, subtractUtcDays(rangeEnd, INITIAL_LOOKBACK_DAYS - 1));

  while (rangeEnd >= COVERAGE_START) {
    const record = await fetchLatestRateInRange(base, quote, rangeStart, rangeEnd, dateRequested);
    if (record) return record;
    if (rangeStart === COVERAGE_START) break;

    rangeEnd = subtractUtcDays(rangeStart, 1);
    rangeStart = maxIsoDate(COVERAGE_START, subtractUtcYears(rangeEnd, RANGE_WINDOW_YEARS));
  }

  return null;
}

async function fetchLatestRateInRange(
  base: Currency,
  quote: Currency,
  from: string,
  to: string,
  dateRequested: string
): Promise<FrankfurterRateRecord | null> {
  const upstream = await fetch(
    `https://api.frankfurter.dev/v2/rates?from=${from}&to=${to}&base=${encodeURIComponent(base)}&quotes=${encodeURIComponent(quote)}`,
    { cache: 'no-store' }
  );

  if (upstream.status === 404 || upstream.status === 422) return null;
  if (!upstream.ok) throw new Error(`Frankfurter returned ${upstream.status}`);

  const data = (await upstream.json()) as unknown;
  if (!Array.isArray(data)) throw new Error('Frankfurter returned an invalid range response.');

  return (data as FrankfurterRateRecord[])
    .filter((record) => isUsableRateRecord(record, base, quote, dateRequested))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] ?? null;
}

function isUsableRateRecord(
  record: FrankfurterRateRecord,
  base: Currency,
  quote: Currency,
  latestAllowedDate: string
): boolean {
  const rate = Number(record.rate);
  return (
    isValidIsoDate(record.date ?? '') &&
    record.date! <= latestAllowedDate &&
    record.base === base &&
    record.quote === quote &&
    Number.isFinite(rate) &&
    rate > 0
  );
}

function toResponse(
  base: Currency,
  quote: Currency,
  dateRequested: string,
  record: FrankfurterRateRecord
): HistoricalExchangeRateResponse {
  const dateUsed = record.date!;
  return {
    base,
    quote,
    dateRequested,
    dateUsed,
    rate: Number(record.rate),
    source: EXCHANGE_RATE_SOURCE,
    status: dateUsed === dateRequested ? 'historical' : 'prior-available',
  };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function subtractUtcDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function subtractUtcYears(value: string, years: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function maxIsoDate(left: string, right: string): string {
  return left > right ? left : right;
}

function cacheHeaders(dateRequested: string): Record<string, string> {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return {
    'Cache-Control': dateRequested < todayUtc
      ? 'public, s-maxage=86400, stale-while-revalidate=604800'
      : 'public, s-maxage=3600, stale-while-revalidate=3600',
  };
}
