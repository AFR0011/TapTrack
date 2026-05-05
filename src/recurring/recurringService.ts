import { db } from '@/database';
import type { RecurringTransaction } from '@/types';
import { createTransaction } from '@/transactions/createTransaction';
import { formatLocalDate } from '@/parser/parseCommand';

export async function createRecurringTransaction(
  recurring: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>
): Promise<RecurringTransaction> {
  const now = new Date().toISOString();
  const newRecurring: RecurringTransaction = {
    ...recurring,
    id: `recurring-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };

  await db.recurringTransactions.add(newRecurring);
  return newRecurring;
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>
): Promise<RecurringTransaction> {
  const now = new Date().toISOString();
  await db.recurringTransactions.update(id, {
    ...updates,
    updatedAt: now,
  });

  const updated = await db.recurringTransactions.get(id);
  if (!updated) {
    throw new Error('Recurring transaction not found');
  }
  return updated;
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  return await db.recurringTransactions.toArray();
}

export async function getActiveRecurringTransactions(): Promise<RecurringTransaction[]> {
  return await db.recurringTransactions.where('isActive').equals(true).toArray();
}

export async function getRecurringTransaction(id: string): Promise<RecurringTransaction | null> {
  return await db.recurringTransactions.get(id);
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  await db.recurringTransactions.delete(id);
}

export async function calculateNextRunDate(
  recurring: RecurringTransaction,
  currentDate: Date = new Date()
): Promise<string> {
  const startDate = new Date(recurring.startDate);
  const currentDateObj = new Date(currentDate);

  // Reset time to midnight for date comparison
  startDate.setHours(0, 0, 0, 0);
  currentDateObj.setHours(0, 0, 0, 0);

  // If the start date is in the future, use it
  if (startDate > currentDateObj) {
    return formatLocalDate(startDate);
  }

  // Calculate next run date based on frequency
  let nextDate = new Date(startDate);

  switch (recurring.frequency) {
    case 'daily':
      nextDate.setDate(startDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(startDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(startDate.getMonth() + 1);
      break;
    case 'yearly':
      nextDate.setFullYear(startDate.getFullYear() + 1);
      break;
  }

  // Ensure the next date is not in the future
  if (nextDate > currentDateObj) {
    return formatLocalDate(nextDate);
  }

  // If we're past the next date, keep going until we find a future date
  while (nextDate <= currentDateObj) {
    switch (recurring.frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }
  }

  return formatLocalDate(nextDate);
}

export async function createDueRecurringTransactions(currentDate: Date = new Date()): Promise<void> {
  const activeRecurring = await getActiveRecurringTransactions();
  const today = formatLocalDate(currentDate);

  for (const recurring of activeRecurring) {
    // Check if this recurring transaction should run today
    if (recurring.nextRunDate === today) {
      // Check if we've already created this transaction for today
      const existingTransaction = await db.transactions
        .where('recurringSourceId')
        .equals(recurring.id)
        .and(t => t.date === today)
        .first();

      if (!existingTransaction) {
        // Create the transaction
        try {
          const transactionDraft = {
            type: recurring.type,
            amount: recurring.amount,
            currency: recurring.currency,
            title: recurring.title,
            categoryId: recurring.categoryId,
            method: recurring.method,
            date: today,
          };

          await createTransaction(transactionDraft);

          // Update the recurring transaction's next run date
          const nextRunDate = await calculateNextRunDate(recurring, currentDate);
          await updateRecurringTransaction(recurring.id, { nextRunDate });
        } catch (error) {
          console.error(`Failed to create recurring transaction ${recurring.id}:`, error);
        }
      }
    }
  }
}