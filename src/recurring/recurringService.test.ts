import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import {
  createDueRecurringTransactions,
  createRecurringTransaction,
  getInitialNextRunDate,
} from './recurringService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

describe('recurringService', () => {
  it('creates a due recurring income on app open without duplicating it', async () => {
    await createRecurringTransaction(
      {
        type: 'income',
        amount: 20000,
        currency: 'TRY',
        title: 'salary',
        categoryId: 'cat-income',
        method: 'card',
        frequency: 'monthly',
        startDate: '2026-05-05',
        nextRunDate: '2026-05-05',
        isActive: true,
      },
      database
    );

    await expect(createDueRecurringTransactions(new Date(2026, 4, 5), database)).resolves.toMatchObject({
      created: 1,
    });
    await expect(createDueRecurringTransactions(new Date(2026, 4, 5), database)).resolves.toMatchObject({
      created: 0,
    });

    const transactions = await database.transactions.toArray();
    const balance = await database.balances.get('TRY-card');

    expect(transactions).toHaveLength(1);
    expect(transactions[0].recurringSourceId).toEqual(expect.any(String));
    expect(balance?.amount).toBe(20000);
  });

  it('uses today as the first run date when the selected start date is already past', () => {
    expect(getInitialNextRunDate('2026-05-01', new Date(2026, 4, 5))).toBe('2026-05-05');
  });
});
