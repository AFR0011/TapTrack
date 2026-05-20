import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { createTransaction } from '@/transactions/createTransaction';
import * as syncService from '@/sync/syncService';
import {
  calculateRollover,
  deleteCategory,
  getCategoryBudgetStatus,
  getMonthlyBudgetStatus,
  prepareMonthlyRollover,
  updateCategory,
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
  vi.restoreAllMocks();
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

  it('updates custom category details', async () => {
    const pushSpy = vi.spyOn(syncService, 'pushRecord').mockResolvedValue(undefined);
    const now = new Date().toISOString();
    await database.categories.add({
      id: 'cat-custom',
      name: 'Old name',
      icon: 'circle',
      color: '#64748b',
      isDefault: false,
      type: 'expense',
      createdAt: now,
      updatedAt: now,
    });

    const updated = await updateCategory(
      {
        id: 'cat-custom',
        name: 'New name',
        icon: 'ticket',
        color: '#db2777',
        type: 'expense',
      },
      database
    );

    expect(updated).toMatchObject({
      id: 'cat-custom',
      name: 'New name',
      icon: 'ticket',
      color: '#db2777',
      type: 'expense',
    });
    expect(pushSpy).toHaveBeenCalledWith('categories', expect.objectContaining({ id: 'cat-custom' }));
  });

  it('prevents changing default category type', async () => {
    await expect(
      updateCategory(
        {
          id: 'cat-other',
          name: 'Other',
          icon: 'circle',
          color: '#64748b',
          type: 'income',
        },
        database
      )
    ).rejects.toThrow('Default category type cannot be changed.');
  });

  it('reassigns mismatched transactions when a category type changes', async () => {
    const now = new Date().toISOString();
    await database.categories.add({
      id: 'cat-custom',
      name: 'Side work',
      icon: 'circle',
      color: '#64748b',
      isDefault: false,
      type: 'expense',
      createdAt: now,
      updatedAt: now,
    });
    await database.balances.update('TRY-cash', { amount: 1000 });
    const transaction = await createTransaction(
      {
        type: 'expense',
        amount: 100,
        currency: 'TRY',
        title: 'old category expense',
        categoryId: 'cat-custom',
        method: 'cash',
        date: '2026-05-05',
      },
      database
    );

    await updateCategory(
      {
        id: 'cat-custom',
        name: 'Side work',
        icon: 'circle',
        color: '#64748b',
        type: 'income',
      },
      database
    );

    await expect(database.transactions.get(transaction.id)).resolves.toMatchObject({
      categoryId: 'cat-other',
    });
  });

  it('prevents deleting default categories', async () => {
    await expect(deleteCategory('cat-other', database)).rejects.toThrow(
      'Default categories cannot be deleted.'
    );
  });

  it('reassigns income transactions to the income fallback when deleting a custom income category', async () => {
    const deleteSpy = vi.spyOn(syncService, 'deleteRecord').mockResolvedValue(undefined);
    const pushSpy = vi.spyOn(syncService, 'pushRecord').mockResolvedValue(undefined);
    const now = new Date().toISOString();
    await database.categories.add({
      id: 'cat-bonus',
      name: 'Bonus',
      icon: 'arrow-down',
      color: '#059669',
      isDefault: false,
      type: 'income',
      createdAt: now,
      updatedAt: now,
    });
    const transaction = await createTransaction(
      {
        type: 'income',
        amount: 500,
        currency: 'TRY',
        title: 'bonus',
        categoryId: 'cat-bonus',
        method: 'card',
        date: '2026-05-05',
      },
      database
    );

    await deleteCategory('cat-bonus', database);

    await expect(database.transactions.get(transaction.id)).resolves.toMatchObject({
      categoryId: 'cat-income',
    });
    await expect(database.categories.get('cat-bonus')).resolves.toBeUndefined();
    expect(pushSpy).toHaveBeenCalledWith('transactions', expect.objectContaining({ id: transaction.id, categoryId: 'cat-income' }));
    expect(deleteSpy).toHaveBeenCalledWith('categories', 'cat-bonus');
  });
});
