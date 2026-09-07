import {
  fetchHistoricalExchangeRate,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import type { Currency, Transaction } from '@/types';

type ForeignCurrency = Exclude<Currency, 'TRY'>;

export type HistoricalReportRateMap = Record<string, HistoricalExchangeRateResponse>;

export type HistoricalReportRateNeed = {
  key: string;
  base: ForeignCurrency;
  quote: 'TRY';
  date: string;
};

const MAX_CONCURRENT_RATE_REQUESTS = 6;
const rateCache = new Map<string, HistoricalExchangeRateResponse>();

export function getHistoricalReportRateKey(currency: ForeignCurrency, date: string): string {
  return `${currency}:${date}`;
}

export function collectHistoricalReportRateNeeds(
  transactions: Transaction[]
): HistoricalReportRateNeed[] {
  const needs = new Map<string, HistoricalReportRateNeed>();

  for (const transaction of transactions) {
    if (transaction.currency === 'TRY') continue;

    const key = getHistoricalReportRateKey(transaction.currency, transaction.date);
    if (!needs.has(key)) {
      needs.set(key, {
        key,
        base: transaction.currency,
        quote: 'TRY',
        date: transaction.date,
      });
    }
  }

  return [...needs.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function loadHistoricalReportRates(
  transactions: Transaction[],
  signal?: AbortSignal
): Promise<HistoricalReportRateMap> {
  const needs = collectHistoricalReportRateNeeds(transactions);
  const rates: HistoricalReportRateMap = {};
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < needs.length) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new Error('Historical exchange-rate request was cancelled.');
      }

      const need = needs[cursor];
      cursor += 1;

      const cached = rateCache.get(need.key);
      if (cached) {
        rates[need.key] = cached;
        continue;
      }

      const rate = await fetchHistoricalExchangeRate({
        base: need.base,
        quote: need.quote,
        date: need.date,
        signal,
      });
      rateCache.set(need.key, rate);
      rates[need.key] = rate;
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_RATE_REQUESTS, needs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return rates;
}

export function getTransactionAmountInTRY(
  transaction: Transaction,
  rates: HistoricalReportRateMap
): number | null {
  if (transaction.currency === 'TRY') return transaction.amount;

  const rate = rates[getHistoricalReportRateKey(transaction.currency, transaction.date)];
  if (!rate) return null;

  return transaction.amount * rate.rate;
}
