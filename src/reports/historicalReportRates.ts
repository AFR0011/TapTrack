import { fetchHistoricalExchangeRate, type HistoricalExchangeRateResponse } from '@/exchangeRates';
import type { Currency, Transaction } from '@/types';

export type HistoricalReportRateMap = Record<string, HistoricalExchangeRateResponse>;

export type HistoricalReportRateNeed = {
  key: string;
  base: Currency;
  quote: Currency;
  date: string;
};

const MAX_CONCURRENT_RATE_REQUESTS = 6;
const rateCache = new Map<string, HistoricalExchangeRateResponse>();

export function getHistoricalReportRateKey(base: Currency, date: string, quote: Currency = 'TRY'): string {
  return `${base}:${quote}:${date}`;
}

export function collectHistoricalReportRateNeeds(
  transactions: Transaction[],
  quoteCurrency: Currency = 'TRY'
): HistoricalReportRateNeed[] {
  const needs = new Map<string, HistoricalReportRateNeed>();
  for (const transaction of transactions) {
    if (transaction.currency === quoteCurrency) continue;
    const key = getHistoricalReportRateKey(transaction.currency, transaction.date, quoteCurrency);
    if (!needs.has(key)) {
      needs.set(key, { key, base: transaction.currency, quote: quoteCurrency, date: transaction.date });
    }
  }
  return [...needs.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function loadHistoricalReportRates(
  transactions: Transaction[],
  signal?: AbortSignal,
  quoteCurrency: Currency = 'TRY'
): Promise<HistoricalReportRateMap> {
  const needs = collectHistoricalReportRateNeeds(transactions, quoteCurrency);
  const rates: HistoricalReportRateMap = {};
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < needs.length) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('Historical exchange-rate request was cancelled.');
      }
      const need = needs[cursor++];
      const cached = rateCache.get(need.key);
      if (cached) { rates[need.key] = cached; continue; }
      const rate = await fetchHistoricalExchangeRate({ base: need.base, quote: need.quote, date: need.date, signal });
      rateCache.set(need.key, rate);
      rates[need.key] = rate;
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_RATE_REQUESTS, needs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return rates;
}

export async function loadHistoricalReportRatesInCurrency(
  transactions: Transaction[],
  quoteCurrency: Currency,
  signal?: AbortSignal
): Promise<HistoricalReportRateMap> {
  return loadHistoricalReportRates(transactions, signal, quoteCurrency);
}

export function getTransactionAmountInCurrency(
  transaction: Transaction,
  rates: HistoricalReportRateMap,
  quoteCurrency: Currency
): number | null {
  if (transaction.currency === quoteCurrency) return transaction.amount;
  const rate = rates[getHistoricalReportRateKey(transaction.currency, transaction.date, quoteCurrency)];
  return rate ? transaction.amount * rate.rate : null;
}

export function getTransactionAmountInTRY(transaction: Transaction, rates: HistoricalReportRateMap): number | null {
  return getTransactionAmountInCurrency(transaction, rates, 'TRY');
}
