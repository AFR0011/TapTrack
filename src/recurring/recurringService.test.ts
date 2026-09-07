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

  it('preserves a monthly Jan 31 anchor through shorter months', async () => {
    const recurring = await createRecurringTransaction(
      {
        type: 'income',
        amount: 100,
        currency: 'TRY',
        title: 'month-end income',
        categoryId: 'cat-income',
        method: 'card',
        frequency: 'monthly',
        startDate: '2027-01-31',
        nextRunDate: '2027-01-31',
        isActive: true,
      },
      database
    );

    await expect(
      createDueRecurringTransactions(new Date(2027, 2, 31, 12, 0, 0), database)
    ).resolves.toMatchObject({ created: 3, failed: 0 });

    const dates = (await database.transactions.toArray())
      .filter((transaction) => transaction.recurringSourceId === recurring.id)
      .map((transaction) => transaction.date)
      .sort();
    expect(dates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);

    await expect(database.recurringTransactions.get(recurring.id)).resolves.toMatchObject({
      nextRunDate: '2027-04-30',
    });
  });

  it('uses today as the first run date when the selected start date is already past', () => {
    expect(getInitialNextRunDate('2026-05-01', new Date(2026, 4, 5))).toBe('2026-05-05');
  });
});
