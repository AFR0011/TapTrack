import { describe, expect, it } from 'vitest';
import { filterTransactionHistory } from './historyFilter';
import type { Category, Transaction } from '@/types';

const categories: Category[] = [
  {
    id: 'food',
    name: 'Food',
    isDefault: true,
    type: 'expense',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'income',
    name: 'Income',
    isDefault: true,
    type: 'income',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const transactions: Transaction[] = [
  {
    id: 'old-expense',
    type: 'expense',
    amount: 20,
    currency: 'TRY',
    title: 'Lunch',
    categoryId: 'food',
    method: 'card',
    date: '2026-07-12',
    createdAt: '2026-07-12T12:00:00.000Z',
    updatedAt: '2026-07-12T12:00:00.000Z',
  },
  {
    id: 'salary',
    type: 'income',
    amount: 2000,
    currency: 'TRY',
    title: 'Salary',
    categoryId: 'income',
    method: 'card',
    date: '2026-09-01',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'coffee',
    type: 'expense',
    amount: 90,
    currency: 'TRY',
    title: 'Coffee',
    note: 'Airport',
    categoryId: 'food',
    method: 'cash',
    date: '2026-09-08',
    createdAt: '2026-09-08T09:00:00.000Z',
    updatedAt: '2026-09-08T09:00:00.000Z',
  },
];

const allFilters = {
  query: '',
  fromDate: '',
  toDate: '',
  type: 'all' as const,
  method: 'all' as const,
  categoryId: 'all',
};

describe('filterTransactionHistory', () => {
  it('returns the complete ledger newest first when no range is set', () => {
    expect(filterTransactionHistory(transactions, categories, allFilters).map((item) => item.id)).toEqual([
      'coffee',
      'salary',
      'old-expense',
    ]);
  });

  it('supports a date range spanning multiple months', () => {
    expect(
      filterTransactionHistory(transactions, categories, {
        ...allFilters,
        fromDate: '2026-08-01',
        toDate: '2026-09-30',
      }).map((item) => item.id)
    ).toEqual(['coffee', 'salary']);
  });

  it('combines search with type, method, and category filters', () => {
    expect(
      filterTransactionHistory(transactions, categories, {
        ...allFilters,
        query: 'airport',
        type: 'expense',
        method: 'cash',
        categoryId: 'food',
      }).map((item) => item.id)
    ).toEqual(['coffee']);
  });
});
