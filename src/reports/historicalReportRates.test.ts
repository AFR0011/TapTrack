import { describe, expect, it } from 'vitest';
import type { HistoricalExchangeRateResponse } from '@/exchangeRates';
import type { Transaction } from '@/types';
import {
  collectHistoricalReportRateNeeds,
  getHistoricalReportRateKey,
  getTransactionAmountInTRY,
  type HistoricalReportRateMap,
} from './historicalReportRates';

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    amount: 100,
    currency: 'USD',
    title: 'test',
    categoryId: 'cat-food',
    method: 'card',
    date: '2026-05-05',
    createdAt: '2026-05-05T12:00:00.000Z',
    updatedAt: '2026-05-05T12:00:00.000Z',
    ...overrides,
  };
}

function rate(input: {
  base: 'USD' | 'EUR';
  dateRequested: string;
  dateUsed?: string;
  rate: number;
}): HistoricalExchangeRateResponse {
  return {
    base: input.base,
    quote: 'TRY',
    dateRequested: input.dateRequested,
    dateUsed: input.dateUsed ?? input.dateRequested,
    rate: input.rate,
    source: 'TCMB via Frankfurter',
    status:
      (input.dateUsed ?? input.dateRequested) === input.dateRequested
        ? 'historical'
        : 'prior-available',
  };
}

describe('historical report rates', () => {
  it('deduplicates requests by transaction date and foreign currency', () => {
    const needs = collectHistoricalReportRateNeeds([
      transaction({ id: 'usd-a' }),
      transaction({ id: 'usd-b', amount: 40 }),
      transaction({ id: 'eur', currency: 'EUR' }),
      transaction({ id: 'try', currency: 'TRY' }),
    ]);

    expect(needs).toEqual([
      {
        key: 'EUR:2026-05-05',
        base: 'EUR',
        quote: 'TRY',
        date: '2026-05-05',
      },
      {
        key: 'USD:2026-05-05',
        base: 'USD',
        quote: 'TRY',
        date: '2026-05-05',
      },
    ]);
  });

  it('uses the rate keyed to each transaction date instead of one report-wide rate', () => {
    const first = transaction({ id: 'first', date: '2026-05-05', amount: 10 });
    const second = transaction({ id: 'second', date: '2026-05-20', amount: 10 });
    const rates: HistoricalReportRateMap = {
      [getHistoricalReportRateKey('USD', '2026-05-05')]: rate({
        base: 'USD',
        dateRequested: '2026-05-05',
        rate: 38,
      }),
      [getHistoricalReportRateKey('USD', '2026-05-20')]: rate({
        base: 'USD',
        dateRequested: '2026-05-20',
        rate: 40,
      }),
    };

    expect(getTransactionAmountInTRY(first, rates)).toBe(380);
    expect(getTransactionAmountInTRY(second, rates)).toBe(400);
  });

  it('accepts a prior published rate for the requested transaction date', () => {
    const weekendTransaction = transaction({ date: '2026-05-10', amount: 5 });
    const rates: HistoricalReportRateMap = {
      [getHistoricalReportRateKey('USD', '2026-05-10')]: rate({
        base: 'USD',
        dateRequested: '2026-05-10',
        dateUsed: '2026-05-08',
        rate: 39,
      }),
    };

    expect(getTransactionAmountInTRY(weekendTransaction, rates)).toBe(195);
  });

  it('returns null instead of treating a missing foreign rate as TRY', () => {
    expect(getTransactionAmountInTRY(transaction({ amount: 25 }), {})).toBeNull();
    expect(
      getTransactionAmountInTRY(transaction({ currency: 'TRY', amount: 25 }), {})
    ).toBe(25);
  });
});
