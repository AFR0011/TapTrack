import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { createTransaction } from '@/transactions/createTransaction';
import {
  calculateRollover,
  getCategoryBudgetStatus,
  getMonthlyBudgetStatus,
  prepareMonthlyRollover,
  upsertCategoryBudget,
  upsertMonthlyBudget,
} from './budgetService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

describe('budgetService', () => {
  it('calculates total budget status from TRY expenses', async () => {
    await upsertMonthlyBudget({ month: '2026-05', totalBudget: 20000 }, database);
    await database.balances.update('TRY-cash', { amount: 1000 });
    await createTransaction(
      {
        type: 'expense',
        amount: 250,
        currency: 'TRY',
        title: 'coffee',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-05-05',
      },
      database
    );

    await expect(getMonthlyBudgetStatus('2026-05', database)).resolves.toMatchObject({
      totalBudget: 20000,
      totalSpent: 250,
      remaining: 19750,
    });
  });

  it('calculates category budget status without rollover', async () => {
    await upsertCategoryBudget({ month: '2026-05', categoryId: 'cat-food', amount: 5000 }, database);
    await database.balances.update('TRY-cash', { amount: 1000 });
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

    await expect(getCategoryBudgetStatus('2026-05', 'cat-food', database)).resolves.toMatchObject({
      budget: 5000,
      spent: 300,
      remaining: 4700,
    });
  });

  it('rolls unused total budget into the next month', async () => {
    await upsertMonthlyBudget({ month: '2026-04', totalBudget: 20000 }, database);
    await database.balances.update('TRY-cash', { amount: 30000 });
    await createTransaction(
      {
        type: 'expense',
        amount: 18000,
        currency: 'TRY',
        title: 'monthly expenses',
        categoryId: 'cat-other',
        method: 'cash',
        date: '2026-04-20',
      },
      database
    );

    const budget = await prepareMonthlyRollover('2026-05', 20000, database);

    expect(calculateRollover(20000, 18000)).toBe(2000);
    expect(budget.rolloverFromPreviousMonth).toBe(2000);
  });
});
