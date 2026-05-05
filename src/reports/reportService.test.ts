import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { upsertCategoryBudget, upsertMonthlyBudget } from '@/budgets/budgetService';
import { createTransaction } from '@/transactions/createTransaction';
import {
  getBudgetPerformanceReport,
  getCategorySpending,
  getIncomeVsExpense,
  getMonthlyComparison,
  getSpendingOverTime,
} from './reportService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

describe('reportService', () => {
  it('aggregates monthly report data from TRY transactions', async () => {
    await upsertMonthlyBudget({ month: '2026-05', totalBudget: 20000 }, database);
    await upsertCategoryBudget({ month: '2026-05', categoryId: 'cat-food', amount: 5000 }, database);
    await database.balances.update('TRY-cash', { amount: 1000 });
    await createTransaction(
      {
        type: 'income',
        amount: 20000,
        currency: 'TRY',
        title: 'salary',
        categoryId: 'cat-income',
        method: 'card',
        date: '2026-05-01',
      },
      database
    );
    await createTransaction(
      {
        type: 'expense',
        amount: 300,
        currency: 'TRY',
        title: 'market',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-05-05',
      },
      database
    );

    await expect(getIncomeVsExpense('2026-05', database)).resolves.toEqual({
      income: 20000,
      expense: 300,
      net: 19700,
    });
    await expect(getCategorySpending('2026-05', database)).resolves.toEqual([
      { categoryId: 'cat-food', amount: 300 },
    ]);
    await expect(getSpendingOverTime('2026-05', database)).resolves.toEqual([
      { date: '2026-05-05', amount: 300 },
    ]);
    await expect(getBudgetPerformanceReport('2026-05', database)).resolves.toMatchObject({
      totalBudget: 20000,
      totalSpent: 300,
      categoryBudgets: [{ categoryId: 'cat-food', budget: 5000, spent: 300, remaining: 4700 }],
    });
    await expect(getMonthlyComparison('2026-05', database)).resolves.toMatchObject({
      currentMonth: { net: 19700 },
      previousMonth: { income: 0, expense: 0, net: 0 },
    });
  });
});
