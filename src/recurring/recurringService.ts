import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { addFrequency, formatLocalDate, parseLocalDate } from '@/dates';
import { createTransaction } from '@/transactions/createTransaction';
import {
  flushSyncQueueBestEffort,
  queueDeleteForSync,
  queueRecordForSync,
} from '@/sync/syncService';
import type { Frequency, RecurringTransaction, TransactionDraft } from '@/types';

export type RecurringInput = Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>;

export type RecurringOrderingConflict = {
  recurringId: string;
  title: string;
  occurrenceDate: string;
  checkpointId: string;
};

export type DueRecurringResult = {
  created: number;
  skipped: number;
  failed: number;
  conflicts: RecurringOrderingConflict[];
};

export function getRecurringOccurrenceId(recurringId: string, date: string): string {
  return `recurring-occurrence-${recurringId}-${date}`;
}

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

  await database.transaction(
    'rw',
    [database.recurringTransactions, database.syncOutbox],
    async () => {
      await database.recurringTransactions.add(newRecurring);
      await queueRecordForSync(
        'recurringTransactions',
        newRecurring as unknown as Record<string, unknown>,
        database
      );
    }
  );

  void flushSyncQueueBestEffort(database);
  return newRecurring;
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>,
  database: TapTrackDatabase = db
): Promise<RecurringTransaction> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  let updated: RecurringTransaction | null = null;

  await database.transaction(
    'rw',
    [database.recurringTransactions, database.syncOutbox],
    async () => {
      const existing = await database.recurringTransactions.get(id);
      if (!existing) {
        throw new Error('Recurring transaction not found');
      }

      const next: RecurringTransaction = {
        ...existing,
        ...updates,
        id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      await database.recurringTransactions.put(next);
      await queueRecordForSync(
        'recurringTransactions',
        next as unknown as Record<string, unknown>,
        database
      );
      updated = next;
    }
  );

  if (!updated) {
    throw new Error('Recurring transaction not found');
  }

  void flushSyncQueueBestEffort(database);
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

  await database.transaction(
    'rw',
    [database.recurringTransactions, database.syncOutbox],
    async () => {
      const existing = await database.recurringTransactions.get(id);
      if (!existing) {
        throw new Error('Recurring transaction not found');
      }
      await database.recurringTransactions.delete(id);
      await queueDeleteForSync('recurringTransactions', id, database);
    }
  );

  void flushSyncQueueBestEffort(database);
}

/**
 * Returns the first occurrence on or after today that still belongs to the
 * original schedule. Unlike getInitialNextRunDate(), this does not invent a
 * one-off occurrence today when the schedule started in the past.
 */
export function getNextScheduledOccurrenceDate(
  startDate: string,
  frequency: Frequency,
  currentDate = new Date()
) {
  const today = formatLocalDate(currentDate);
  if (startDate >= today) return startDate;

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [todayYear, todayMonth] = today.split('-').map(Number);

  if (frequency === 'daily') return today;

  if (frequency === 'weekly') {
    const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const todayDate = parseLocalDate(today);
    const todayUtc = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    const daysSinceStart = Math.floor((todayUtc - startUtc) / 86_400_000);
    const weeks = Math.ceil(daysSinceStart / 7);
    const next = parseLocalDate(startDate);
    next.setDate(next.getDate() + weeks * 7);
    return formatLocalDate(next);
  }

  if (frequency === 'monthly') {
    let monthOffset = (todayYear - startYear) * 12 + (todayMonth - startMonth);
    let candidate = clampedScheduleDate(startYear, startMonth - 1 + monthOffset, startDay);
    if (candidate < today) {
      monthOffset += 1;
      candidate = clampedScheduleDate(startYear, startMonth - 1 + monthOffset, startDay);
    }
    return candidate;
  }

  let yearOffset = todayYear - startYear;
  let candidate = clampedScheduleDate(startYear + yearOffset, startMonth - 1, startDay);
  if (candidate < today) {
    yearOffset += 1;
    candidate = clampedScheduleDate(startYear + yearOffset, startMonth - 1, startDay);
  }
  return candidate;
}

export async function resumeRecurringTransaction(
  id: string,
  currentDate = new Date(),
  database: TapTrackDatabase = db
) {
  const recurring = await getRecurringTransaction(id, database);
  if (!recurring) throw new Error('Recurring transaction not found');

  const nextRunDate = getNextScheduledOccurrenceDate(
    recurring.startDate,
    recurring.frequency,
    currentDate
  );
  if (recurring.endDate && nextRunDate > recurring.endDate) {
    throw new Error('This recurring schedule has ended. Edit the end date before resuming it.');
  }

  return updateRecurringTransaction(
    id,
    { isActive: true, nextRunDate },
    database
  );
}

export function getInitialNextRunDate(startDate: string, currentDate = new Date()) {
  const today = formatLocalDate(currentDate);
  return startDate >= today ? startDate : today;
}

export function calculateNextRunDate(
  recurring: Pick<RecurringTransaction, 'frequency' | 'nextRunDate'> &
    Partial<Pick<RecurringTransaction, 'startDate'>>,
  currentDate: Date = new Date()
): string {
  const currentDay = parseLocalDate(formatLocalDate(currentDate));
  const anchorDate = parseLocalDate(recurring.startDate ?? recurring.nextRunDate);
  let nextDate = parseLocalDate(recurring.nextRunDate);

  do {
    nextDate = addFrequency(nextDate, recurring.frequency, anchorDate);
  } while (nextDate <= currentDay);

  return formatLocalDate(nextDate);
}

async function advanceRecurringAfterOccurrence(
  recurring: RecurringTransaction,
  occurrenceDate: string,
  database: TapTrackDatabase
): Promise<void> {
  const anchorDate = parseLocalDate(recurring.startDate);
  const nextRunDate = formatLocalDate(
    addFrequency(parseLocalDate(occurrenceDate), recurring.frequency, anchorDate)
  );
  const updates: Partial<RecurringTransaction> = { nextRunDate };
  if (recurring.endDate && nextRunDate > recurring.endDate) updates.isActive = false;
  await updateRecurringTransaction(recurring.id, updates, database);
}

export async function resolveRecurringOccurrenceOrdering(
  conflict: RecurringOrderingConflict,
  relation: HistoricalOrderingRelation,
  database: TapTrackDatabase = db,
  currentDate = new Date()
): Promise<void> {
  await ensureDatabaseSeeded(database);
  const recurring = await database.recurringTransactions.get(conflict.recurringId);
  if (!recurring) throw new Error('Recurring transaction not found.');
  if (recurring.nextRunDate !== conflict.occurrenceDate) {
    throw new Error('This recurring occurrence has already moved on. Refresh and try again.');
  }

  const checkpoint = await database.balanceCheckpoints.get(conflict.checkpointId);
  if (!checkpoint || checkpoint.date !== conflict.occurrenceDate) {
    throw new Error('The related balance check could not be found.');
  }

  const occurrenceId = getRecurringOccurrenceId(recurring.id, conflict.occurrenceDate);
  const existing = await database.transactions.get(occurrenceId);
  if (!existing) {
    const transactionDraft: TransactionDraft = {
      type: recurring.type,
      amount: recurring.amount,
      currency: recurring.currency,
      title: recurring.title,
      categoryId: recurring.categoryId,
      method: recurring.method,
      date: conflict.occurrenceDate,
      recurringSourceId: recurring.id,
      occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(checkpoint, relation),
    };
    await createTransaction(transactionDraft, database, currentDate, occurrenceId);
  }

  await advanceRecurringAfterOccurrence(recurring, conflict.occurrenceDate, database);
}

export async function createDueRecurringTransactions(
  currentDate: Date = new Date(),
  database: TapTrackDatabase = db
): Promise<DueRecurringResult> {
  await ensureDatabaseSeeded(database);

  const activeRecurring = await getActiveRecurringTransactions(database);
  const today = formatLocalDate(currentDate);
  const result: DueRecurringResult = { created: 0, skipped: 0, failed: 0, conflicts: [] };

  for (const recurring of activeRecurring) {
    let nextRunDate = recurring.nextRunDate;
    let safety = 0;
    const endDate = recurring.endDate;

    if (endDate && nextRunDate > endDate) {
      await updateRecurringTransaction(recurring.id, { isActive: false }, database);
      continue;
    }

    while (nextRunDate <= today && safety < 366) {
      if (endDate && nextRunDate > endDate) break;

      const occurrenceId = getRecurringOccurrenceId(recurring.id, nextRunDate);
      const existingTransaction = await database.transactions.get(occurrenceId);

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
          await createTransaction(transactionDraft, database, currentDate, occurrenceId);
          result.created += 1;
        } catch (error) {
          // A concurrent local invocation may have inserted the deterministic ID
          // between the read and add. Treat that as the same logical occurrence.
          if (await database.transactions.get(occurrenceId)) {
            result.skipped += 1;
          } else if (error instanceof AmbiguousLedgerOrderingError) {
            result.conflicts.push({
              recurringId: recurring.id,
              title: recurring.title,
              occurrenceDate: nextRunDate,
              checkpointId: error.checkpointId,
            });
            break;
          } else {
            result.failed += 1;
            break;
          }
        }
      }

      await advanceRecurringAfterOccurrence(recurring, nextRunDate, database);
      nextRunDate = formatLocalDate(
        addFrequency(parseLocalDate(nextRunDate), recurring.frequency, parseLocalDate(recurring.startDate))
      );
      safety += 1;
    }
  }

  return result;
}

function clampedScheduleDate(year: number, monthIndex: number, requestedDay: number) {
  const normalized = new Date(year, monthIndex, 1);
  const lastDay = new Date(
    normalized.getFullYear(),
    normalized.getMonth() + 1,
    0
  ).getDate();
  return formatLocalDate(
    new Date(normalized.getFullYear(), normalized.getMonth(), Math.min(requestedDay, lastDay))
  );
}
