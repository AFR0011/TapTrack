import { NextResponse } from 'next/server';
import type { ExchangeRates } from '@/types';

/**
 * Returns live USD→TRY and EUR→TRY exchange rates.
 * Source: open.er-api.com (free, no key required, 1500 req/month).
 * Next.js ISR caches the response for 1 hour server-side.
 * The response also carries a Cache-Control header so Vercel's edge cache
 * and the browser serve it stale for up to 1 hour.
 */
export const revalidate = 3600;

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/TRY', {
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const data = (await res.json()) as {
      rates: Record<string, number>;
    };

    // open.er-api.com returns rates with TRY as base, so:
    //   data.rates.USD = 0.026 → 1 TRY = 0.026 USD → 1 USD = 1/0.026 TRY ≈ 38.5
    const usdRate = data.rates['USD'];
    const eurRate = data.rates['EUR'];
    if (!usdRate || !eurRate) throw new Error('missing rates');

    const rates: ExchangeRates = {
      USD: 1 / usdRate,
      EUR: 1 / eurRate,
    };

    return NextResponse.json(rates, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch {
    // Return rough fallback so the toggle degrades gracefully
    const fallback: ExchangeRates = { USD: 38.5, EUR: 42 };
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
