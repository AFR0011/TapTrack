import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { upsertCategoryBudget, upsertMonthlyBudget } from '@/budgets/budgetService';
import { createTransaction } from '@/transactions/createTransaction';
import { seedOpeningBalance } from '@/test/ledgerTestUtils';
import {
  getBudgetPerformanceReport,
  getCategorySpending,
  getDateRangeCategorySpending,
  getDateRangeIncomeVsExpense,
  getDateRangeSpendingOverTime,
  getDateRangeTransactionList,
  getIncomeVsExpense,
  getMonthlyComparison,
  getSpendingOverTime,
  getYearlySummary,
} from './reportService';

let database: RavelDatabase;

beforeEach(async () => {
  database = new RavelDatabase(`RavelTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

describe('reportService', () => {
  it('aggregates monthly report data from TRY transactions', async () => {
    await upsertMonthlyBudget({ month: '2026-05', totalBudget: 20000 }, database);
    await upsertCategoryBudget({ month: '2026-05', categoryId: 'cat-food', amount: 5000 }, database);
    await seedOpeningBalance(database, 'TRY-cash', 1000);
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

  it('aggregates inclusive custom date ranges', async () => {
    await seedOpeningBalance(database, 'TRY-cash', 1000);
    await createTransaction(
      {
        type: 'expense',
        amount: 100,
        currency: 'TRY',
        title: 'inside start',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-05-01',
      },
      database
    );
    await createTransaction(
      {
        type: 'expense',
        amount: 50,
        currency: 'TRY',
        title: 'inside end',
        categoryId: 'cat-transport',
        method: 'cash',
        date: '2026-05-10',
      },
      database
    );
    await createTransaction(
      {
        type: 'expense',
        amount: 20,
        currency: 'TRY',
        title: 'outside',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-05-11',
      },
      database
    );

    await expect(getDateRangeIncomeVsExpense('2026-05-01', '2026-05-10', database)).resolves.toEqual({
      income: 0,
      expense: 150,
      net: -150,
    });
    await expect(getDateRangeCategorySpending('2026-05-01', '2026-05-10', database)).resolves.toEqual([
      { categoryId: 'cat-food', amount: 100 },
      { categoryId: 'cat-transport', amount: 50 },
    ]);
    await expect(getDateRangeSpendingOverTime('2026-05-01', '2026-05-10', database)).resolves.toEqual([
      { date: '2026-05-01', amount: 100 },
      { date: '2026-05-10', amount: 50 },
    ]);
    await expect(getDateRangeTransactionList('2026-05-10', '2026-05-01', database)).resolves.toHaveLength(2);
  });

  it('builds yearly summaries from monthly TRY totals', async () => {
    await seedOpeningBalance(database, 'TRY-card', 5000);
    await seedOpeningBalance(database, 'TRY-cash', 5000);
    await createTransaction(
      {
        type: 'income',
        amount: 3000,
        currency: 'TRY',
        title: 'january income',
        categoryId: 'cat-income',
        method: 'card',
        date: '2026-01-03',
      },
      database
    );
    await createTransaction(
      {
        type: 'expense',
        amount: 250,
        currency: 'TRY',
        title: 'february expense',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-02-12',
      },
      database
    );

    const summary = await getYearlySummary('2026', database);

    expect(summary).toMatchObject({
      year: '2026',
      totalIncome: 3000,
      totalExpense: 250,
      net: 2750,
    });
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toMatchObject({ month: '2026-01', income: 3000, expense: 0, net: 3000 });
    expect(summary.months[1]).toMatchObject({ month: '2026-02', income: 0, expense: 250, net: -250 });
  });
});
