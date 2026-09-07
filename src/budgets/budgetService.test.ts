import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { createTransaction } from '@/transactions/createTransaction';
import { seedOpeningBalance } from '@/test/ledgerTestUtils';
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
});

describe('budgetService', () => {
  it('calculates total budget status from TRY expenses', async () => {
    await upsertMonthlyBudget({ month: '2026-05', totalBudget: 20000 }, database);
    await seedOpeningBalance(database, 'TRY-cash', 1000);
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
    await seedOpeningBalance(database, 'TRY-cash', 1000);
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
    await seedOpeningBalance(database, 'TRY-cash', 30000);
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

  it('updates custom category details and atomically queues the category snapshot', async () => {
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
    const queued = await database.syncOutbox.get('categories:cat-custom');

    expect(updated).toMatchObject({
      id: 'cat-custom',
      name: 'New name',
      icon: 'ticket',
      color: '#db2777',
      type: 'expense',
    });
    expect(queued).toMatchObject({
      tableName: 'categories',
      operation: 'upsert',
      recordId: 'cat-custom',
    });
    expect(queued?.record).toMatchObject({
      id: 'cat-custom',
      name: 'New name',
      icon: 'ticket',
      color: '#db2777',
    });
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
    await seedOpeningBalance(database, 'TRY-cash', 1000);
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
    await expect(database.syncOutbox.get(`transactions:${transaction.id}`)).resolves.toMatchObject({
      operation: 'upsert',
      recordId: transaction.id,
      record: expect.objectContaining({ categoryId: 'cat-other' }),
    });
  });

  it('prevents deleting default categories', async () => {
    await expect(deleteCategory('cat-other', database)).rejects.toThrow(
      'Default categories cannot be deleted.'
    );
  });

  it('reassigns income transactions and queues both reassignment and category delete atomically', async () => {
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
    await expect(database.syncOutbox.get(`transactions:${transaction.id}`)).resolves.toMatchObject({
      tableName: 'transactions',
      operation: 'upsert',
      recordId: transaction.id,
      record: expect.objectContaining({ categoryId: 'cat-income' }),
    });
    await expect(database.syncOutbox.get('categories:cat-bonus')).resolves.toMatchObject({
      tableName: 'categories',
      operation: 'delete',
      recordId: 'cat-bonus',
    });
  });
});