import { describe, expect, it } from 'vitest';
import type { MonthlyBudget } from '@/types';
import { ratesForCurrency, selectMonthlyBudgetForCurrency } from './dashboardFinance';

const budgets: MonthlyBudget[] = [
  {
    id: 'budget-2026-09-USD',
    month: '2026-09',
    totalBudget: 1000,
    rolloverFromPreviousMonth: 0,
    currency: 'USD',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'budget-2026-09-TRY',
    month: '2026-09',
    totalBudget: 20000,
    rolloverFromPreviousMonth: 500,
    currency: 'TRY',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

describe('dashboard finance selection', () => {
  it('selects the budget for the dashboard quote currency instead of the first month row', () => {
    expect(selectMonthlyBudgetForCurrency(budgets, 'TRY')).toMatchObject({
      id: 'budget-2026-09-TRY',
      totalBudget: 20000,
      currency: 'TRY',
    });
    expect(selectMonthlyBudgetForCurrency(budgets, 'EUR')).toBeNull();
  });

  it('never exposes rates loaded for a stale quote currency', () => {
    const rates: Record<string, number> = { USD: 42 };
    expect(ratesForCurrency(rates, 'TRY', 'TRY', {})).toBe(rates);
    expect(ratesForCurrency(rates, 'TRY', 'EUR', {})).toEqual({});
  });
});
