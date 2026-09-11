import { db, ensureDatabaseSeeded, type RavelDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import { formatLocalDate, getAutomaticOccurredAt } from '@/dates';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import { getInsufficientBalanceMessage, getTransactionBalanceDelta } from '@/balances/balanceEffects';
import type { Transaction, TransactionDraft } from '@/types';
import {
  flushSyncQueueBestEffort,
  queueDeleteForSync,
  queueRecordForSync,
} from '@/sync/syncService';

export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_BALANCE';

  constructor(
    readonly currency: TransactionDraft['currency'],
    readonly method: TransactionDraft['method'],
    readonly availableAmount: number
  ) {
    super(getInsufficientBalanceMessage(currency, method));
    this.name = 'InsufficientBalanceError';
  }
}

export class InvalidTransactionDateError extends Error {
  readonly code = 'FUTURE_TRANSACTION_DATE';

  constructor(readonly date: string) {
    super('Future-dated transactions are not supported. Use Recurring for scheduled activity.');
    this.name = 'InvalidTransactionDateError';
  }
}

function assertTransactionDateNotFuture(input: TransactionDraft, nowDate: Date) {
  if (input.date > formatLocalDate(nowDate)) {
    throw new InvalidTransactionDateError(input.date);
  }
}

export async function createTransaction(
  input: TransactionDraft,
  database: RavelDatabase = db,
  nowDate = new Date(),
  transactionId = crypto.randomUUID()
): Promise<Transaction> {
  assertTransactionDateNotFuture(input, nowDate);
  await ensureDatabaseSeeded(database);

  const now = nowDate.toISOString();
  const transaction: Transaction = {
    ...input,
    occurredAt: input.occurredAt ?? getAutomaticOccurredAt(input.date, nowDate),
    id: transactionId,
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.syncOutbox,
    ],
    async () => {
      const previousBalance = await database.balances.get(getBalanceId(input.currency, input.method));
      await database.transactions.add(transaction);

      const rebuilt = await rebuildDerivedBalances(database, now);
      const nextBalance = rebuilt.find(
        (balance) => balance.id === getBalanceId(input.currency, input.method)
      );
      if (nextBalance && nextBalance.amount < 0) {
        throw new InsufficientBalanceError(
          input.currency,
          input.method,
          previousBalance?.amount ?? Math.max(0, nextBalance.amount - getTransactionBalanceDelta(input))
        );
      }

      await queueRecordForSync(
        'transactions',
        transaction as unknown as Record<string, unknown>,
        database
      );
    }
  );

  void flushSyncQueueBestEffort(database);
  return transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionDraft,
  database: RavelDatabase = db
): Promise<Transaction> {
  await ensureDatabaseSeeded(database);

  const nowDate = new Date();
  assertTransactionDateNotFuture(input, nowDate);
  const now = nowDate.toISOString();
  let updatedTransaction: Transaction | null = null;

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.syncOutbox,
    ],
    async () => {
      const existingTransaction = await database.transactions.get(id);
      if (!existingTransaction) throw new Error('Transaction not found');

      const destinationBalanceId = getBalanceId(input.currency, input.method);
      const previousDestination = await database.balances.get(destinationBalanceId);
      const occurredAt =
        input.occurredAt ??
        (existingTransaction.date === input.date
          ? existingTransaction.occurredAt
          : getAutomaticOccurredAt(input.date, nowDate));

      const nextTransaction: Transaction = {
        ...input,
        occurredAt,
        id,
        createdAt: existingTransaction.createdAt,
        updatedAt: now,
      };
      await database.transactions.put(nextTransaction);

      const rebuilt = await rebuildDerivedBalances(database, now);
      const negative = rebuilt.find((balance) => balance.amount < 0);
      if (negative) {
        throw new InsufficientBalanceError(
          negative.currency,
          negative.method,
          negative.id === destinationBalanceId
            ? previousDestination?.amount ?? 0
            : 0
        );
      }

      updatedTransaction = nextTransaction;
      await queueRecordForSync(
        'transactions',
        nextTransaction as unknown as Record<string, unknown>,
        database
      );
    }
  );

  if (!updatedTransaction) throw new Error('Transaction was not updated');

  void flushSyncQueueBestEffort(database);
  return updatedTransaction;
}

export async function deleteTransaction(
  id: string,
  database: RavelDatabase = db
): Promise<void> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.syncOutbox,
    ],
    async () => {
      const transaction = await database.transactions.get(id);
      if (!transaction) throw new Error('Transaction not found');

      const previousBalance = await database.balances.get(
        getBalanceId(transaction.currency, transaction.method)
      );
      await database.transactions.delete(id);
      const rebuilt = await rebuildDerivedBalances(database, now);
      const negative = rebuilt.find((balance) => balance.amount < 0);
      if (negative) {
        throw new InsufficientBalanceError(
          negative.currency,
          negative.method,
          previousBalance?.amount ?? 0
        );
      }

      await queueDeleteForSync('transactions', id, database);
    }
  );

  void flushSyncQueueBestEffort(database);
}

/** Creates multiple transactions atomically and rebuilds all derived balances once. */
export async function createTransactions(
  inputs: TransactionDraft[],
  database: RavelDatabase = db
): Promise<Transaction[]> {
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await createTransaction(inputs[0]!, database)];

  await ensureDatabaseSeeded(database);

  const nowDate = new Date();
  for (const input of inputs) assertTransactionDateNotFuture(input, nowDate);
  const now = nowDate.toISOString();
  const transactions: Transaction[] = inputs.map((input) => ({
    ...input,
    occurredAt: input.occurredAt ?? getAutomaticOccurredAt(input.date, nowDate),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }));

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.syncOutbox,
    ],
    async () => {
      const previousBalances = new Map(
        (await database.balances.toArray()).map((balance) => [balance.id, balance] as const)
      );
      await database.transactions.bulkAdd(transactions);
      const rebuilt = await rebuildDerivedBalances(database, now);
      const negative = rebuilt.find((balance) => balance.amount < 0);
      if (negative) {
        throw new InsufficientBalanceError(
          negative.currency,
          negative.method,
          previousBalances.get(negative.id)?.amount ?? 0
        );
      }

      for (const transaction of transactions) {
        await queueRecordForSync(
          'transactions',
          transaction as unknown as Record<string, unknown>,
          database
        );
      }
    }
  );

  void flushSyncQueueBestEffort(database);
  return transactions;
}
