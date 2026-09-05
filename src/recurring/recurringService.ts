import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { addFrequency, formatLocalDate, parseLocalDate } from '@/dates';
import { createTransaction } from '@/transactions/createTransaction';
import { deleteRecord, pushRecord } from '@/sync/syncService';
import type { RecurringTransaction, TransactionDraft } from '@/types';

export type RecurringInput = Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>;

export type DueRecurringResult = {
  created: number;
  skipped: number;
  failed: number;
};

export async function createRecurringTransaction(
  recurring: RecurringInput,
  database: TapTrackDatabase = db
): Promise<RecurringTransaction> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  const newRecurring: RecurringTransaction = {
    ...recurring,
    id: `recurring-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };

  await database.recurringTransactions.add(newRecurring);
  void pushRecord('recurringTransactions', newRecurring as unknown as Record<string, unknown>, database);
  return newRecurring;
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>,
  database: TapTrackDatabase = db
): Promise<RecurringTransaction> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  await database.recurringTransactions.update(id, {
    ...updates,
    updatedAt: now,
  });

  const updated = await database.recurringTransactions.get(id);
  if (!updated) {
    throw new Error('Recurring transaction not found');
  }
  void pushRecord('recurringTransactions', updated as unknown as Record<string, unknown>, database);
  return updated;
}

export async function getRecurringTransactions(database: TapTrackDatabase = db) {
  await ensureDatabaseSeeded(database);
  return database.recurringTransactions.toArray();
}

export async function getActiveRecurringTransactions(database: TapTrackDatabase = db) {
  await ensureDatabaseSeeded(database);
  return database.recurringTransactions.filter((item) => item.isActive).toArray();
}

export async function getRecurringTransaction(
  id: string,
  database: TapTrackDatabase = db
): Promise<RecurringTransaction | null> {
  await ensureDatabaseSeeded(database);
  return (await database.recurringTransactions.get(id)) ?? null;
}

export async function deleteRecurringTransaction(
  id: string,
  database: TapTrackDatabase = db
): Promise<void> {
  await ensureDatabaseSeeded(database);
  await database.recurringTransactions.delete(id);
  void deleteRecord('recurringTransactions', id, database);
}

export function getInitialNextRunDate(startDate: string, currentDate = new Date()) {
  const today = formatLocalDate(currentDate);
  return startDate >= today ? startDate : today;
}

export function calculateNextRunDate(
  recurring: Pick<RecurringTransaction, 'frequency' | 'nextRunDate'>,
  currentDate: Date = new Date()
): string {
  const currentDay = parseLocalDate(formatLocalDate(currentDate));
  let nextDate = parseLocalDate(recurring.nextRunDate);

  do {
    nextDate = addFrequency(nextDate, recurring.frequency);
  } while (nextDate <= currentDay);

  return formatLocalDate(nextDate);
}

export async function createDueRecurringTransactions(
  currentDate: Date = new Date(),
  database: TapTrackDatabase = db
): Promise<DueRecurringResult> {
  await ensureDatabaseSeeded(database);

  const activeRecurring = await getActiveRecurringTransactions(database);
  const today = formatLocalDate(currentDate);
  const result: DueRecurringResult = { created: 0, skipped: 0, failed: 0 };

  for (const recurring of activeRecurring) {
    let nextRunDate = recurring.nextRunDate;
    let safety = 0;
    const endDate = recurring.endDate;

    if (endDate && nextRunDate > endDate) {
      await updateRecurringTransaction(recurring.id, { isActive: false }, database);
      continue;
    }

    while (nextRunDate <= today && safety < 366) {
      if (endDate && nextRunDate > endDate) {
        break;
      }

      const existingTransaction = await database.transactions
        .where('recurringSourceId')
        .equals(recurring.id)
        .filter((transaction) => transaction.date === nextRunDate)
        .first();

      if (existingTransaction) {
        result.skipped += 1;
      } else {
        const transactionDraft: TransactionDraft = {
          type: recurring.type,
          amount: recurring.amount,
          currency: recurring.currency,
          title: recurring.title,
          categoryId: recurring.categoryId,
          method: recurring.method,
          date: nextRunDate,
          recurringSourceId: recurring.id,
        };

        try {
          await createTransaction(transactionDraft, database);
          result.created += 1;
        } catch {
          result.failed += 1;
          break;
        }
      }

      nextRunDate = formatLocalDate(addFrequency(parseLocalDate(nextRunDate), recurring.frequency));
      const updates: Partial<RecurringTransaction> = { nextRunDate };
      if (endDate && nextRunDate > endDate) {
        updates.isActive = false;
      }
      await updateRecurringTransaction(recurring.id, updates, database);
      safety += 1;
    }
  }

  return result;
}
