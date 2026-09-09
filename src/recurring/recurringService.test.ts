import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import {
  createDueRecurringTransactions,
  createRecurringTransaction,
  deleteRecurringTransaction,
  getInitialNextRunDate,
  getNextScheduledOccurrenceDate,
  resolveRecurringOccurrenceOrdering,
  resumeRecurringTransaction,
  updateRecurringTransaction,
} from './recurringService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

const baseRecurring = {
  type: 'income' as const,
  amount: 20000,
  currency: 'TRY' as const,
  title: 'salary',
  categoryId: 'cat-income',
  method: 'card' as const,
  frequency: 'monthly' as const,
  startDate: '2026-05-05',
  nextRunDate: '2026-05-05',
  isActive: true,
};

describe('recurringService', () => {
  it('commits a recurring rule and its sync intent together', async () => {
    const recurring = await createRecurringTransaction(baseRecurring, database);
    const queued = await database.syncOutbox.get(`recurringTransactions:${recurring.id}`);

    expect(await database.recurringTransactions.get(recurring.id)).toEqual(recurring);
    expect(queued).toMatchObject({
      tableName: 'recurringTransactions',
      operation: 'upsert',
      recordId: recurring.id,
      attempts: 0,
    });
    expect(queued?.record).toMatchObject({ id: recurring.id, title: 'salary' });
  });

  it('creates a due recurring income on app open without duplicating it', async () => {
    const recurring = await createRecurringTransaction(baseRecurring, database);

    await expect(createDueRecurringTransactions(new Date(2026, 4, 5), database)).resolves.toMatchObject({
      created: 1,
    });
    await expect(createDueRecurringTransactions(new Date(2026, 4, 5), database)).resolves.toMatchObject({
      created: 0,
    });

    const transactions = await database.transactions.toArray();
    const balance = await database.balances.get('TRY-card');
    const queuedRule = await database.syncOutbox.get(`recurringTransactions:${recurring.id}`);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].recurringSourceId).toEqual(expect.any(String));
    expect(balance?.amount).toBe(20000);
    expect(queuedRule).toMatchObject({ operation: 'upsert', recordId: recurring.id });
    expect(queuedRule?.record).toMatchObject({ nextRunDate: '2026-06-05' });
  });

  it('surfaces same-day reconciliation ambiguity and advances only after the user resolves it', async () => {
    const recurring = await createRecurringTransaction(baseRecurring, database);
    const balanceId = getBalanceId('TRY', 'card');
    const effectiveAt = '2026-05-05T10:00:00.000Z';
    await database.balanceCheckpoints.put({
      id: 'reconciliation-2026-05-TRY-card',
      balanceId,
      currency: 'TRY',
      method: 'card',
      kind: 'reconciliation',
      observedAmount: 1000,
      deltaAmount: 1000,
      date: '2026-05-05',
      effectiveAt,
      month: '2026-05',
      createdAt: effectiveAt,
      updatedAt: effectiveAt,
    });

    const currentDate = new Date(2026, 4, 6, 12, 0, 0);
    const result = await createDueRecurringTransactions(currentDate, database);

    expect(result.created).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.conflicts).toEqual([
      {
        recurringId: recurring.id,
        title: 'salary',
        occurrenceDate: '2026-05-05',
        checkpointId: 'reconciliation-2026-05-TRY-card',
      },
    ]);
    expect(await database.transactions.count()).toBe(0);
    await expect(database.recurringTransactions.get(recurring.id)).resolves.toMatchObject({
      nextRunDate: '2026-05-05',
    });

    await resolveRecurringOccurrenceOrdering(result.conflicts[0]!, 'after', database, currentDate);

    const occurrence = await database.transactions.get(
      `recurring-occurrence-${recurring.id}-2026-05-05`
    );
    expect(occurrence?.occurredAt).toBe('2026-05-05T10:00:00.001Z');
    await expect(database.recurringTransactions.get(recurring.id)).resolves.toMatchObject({
      nextRunDate: '2026-06-05',
    });
    await expect(database.balances.get(balanceId)).resolves.toMatchObject({ amount: 21000 });
  });

  it('atomically replaces rule sync intent on update and delete', async () => {
    const recurring = await createRecurringTransaction(baseRecurring, database);

    const updated = await updateRecurringTransaction(
      recurring.id,
      { amount: 21000, isActive: false },
      database
    );
    let queued = await database.syncOutbox.get(`recurringTransactions:${recurring.id}`);
    expect(updated).toMatchObject({ amount: 21000, isActive: false });
    expect(queued).toMatchObject({ operation: 'upsert', recordId: recurring.id });
    expect(queued?.record).toMatchObject({ amount: 21000, isActive: false });

    await deleteRecurringTransaction(recurring.id, database);
    queued = await database.syncOutbox.get(`recurringTransactions:${recurring.id}`);
    expect(await database.recurringTransactions.get(recurring.id)).toBeUndefined();
    expect(queued).toMatchObject({
      operation: 'delete',
      tableName: 'recurringTransactions',
      recordId: recurring.id,
    });
    expect(queued?.record).toBeUndefined();
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

  it('finds the next schedule-aligned occurrence without backfilling paused dates', () => {
    expect(getNextScheduledOccurrenceDate('2026-01-31', 'monthly', new Date(2026, 2, 1))).toBe('2026-03-31');
    expect(getNextScheduledOccurrenceDate('2026-05-04', 'weekly', new Date(2026, 4, 19))).toBe('2026-05-25');
    expect(getNextScheduledOccurrenceDate('2024-02-29', 'yearly', new Date(2027, 2, 1))).toBe('2028-02-29');
  });

  it('resumes from the next scheduled occurrence instead of creating transactions missed while paused', async () => {
    const recurring = await createRecurringTransaction(
      {
        ...baseRecurring,
        startDate: '2026-05-05',
        nextRunDate: '2026-06-05',
        isActive: false,
      },
      database
    );

    const resumed = await resumeRecurringTransaction(
      recurring.id,
      new Date(2026, 7, 20),
      database
    );
    expect(resumed).toMatchObject({ isActive: true, nextRunDate: '2026-09-05' });

    await expect(
      createDueRecurringTransactions(new Date(2026, 7, 20), database)
    ).resolves.toMatchObject({ created: 0, failed: 0 });
    expect(await database.transactions.toArray()).toHaveLength(0);
  });

  it('does not resume a schedule whose end date is already behind the next valid occurrence', async () => {
    const recurring = await createRecurringTransaction(
      {
        ...baseRecurring,
        startDate: '2026-05-05',
        nextRunDate: '2026-06-05',
        endDate: '2026-07-05',
        isActive: false,
      },
      database
    );

    await expect(
      resumeRecurringTransaction(recurring.id, new Date(2026, 7, 20), database)
    ).rejects.toThrow('schedule has ended');
    await expect(database.recurringTransactions.get(recurring.id)).resolves.toMatchObject({
      isActive: false,
      nextRunDate: '2026-06-05',
    });
  });
});
