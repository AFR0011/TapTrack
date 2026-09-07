import { DEFAULT_SETTINGS_ID, createDefaultSettings, getBalanceId } from '@/defaultData';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getAutomaticOccurredAt } from '@/dates';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import { getInsufficientBalanceMessage, getTransactionBalanceDelta } from '@/balances/balanceEffects';
import type { Settings, Transaction, TransactionDraft } from '@/types';
import { deleteRecord, pushRecord } from '@/sync/syncService';

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

export async function createTransaction(
  input: TransactionDraft,
  database: TapTrackDatabase = db,
  nowDate = new Date()
): Promise<Transaction> {
  await ensureDatabaseSeeded(database);

  const now = nowDate.toISOString();
  const transaction: Transaction = {
    ...input,
    occurredAt: input.occurredAt ?? getAutomaticOccurredAt(input.date, nowDate),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  let updatedSettings: Settings | null = null;

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.settings,
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

      const settings =
        (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
      updatedSettings = {
        ...settings,
        lastUsedMethod: input.method,
        updatedAt: now,
      };
      await database.settings.put(updatedSettings);
    }
  );

  void pushRecord('transactions', transaction as unknown as Record<string, unknown>, database);
  if (updatedSettings) {
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>, database);
  }

  return transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionDraft,
  database: TapTrackDatabase = db
): Promise<Transaction> {
  await ensureDatabaseSeeded(database);

  const nowDate = new Date();
  const now = nowDate.toISOString();
  let updatedTransaction: Transaction | null = null;
  let updatedSettings: Settings | null = null;

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.settings,
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
      const settings =
        (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
      updatedSettings = {
        ...settings,
        lastUsedMethod: input.method,
        updatedAt: now,
      };
      await database.settings.put(updatedSettings);
    }
  );

  if (!updatedTransaction) throw new Error('Transaction was not updated');

  void pushRecord('transactions', updatedTransaction as unknown as Record<string, unknown>, database);
  if (updatedSettings) {
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>, database);
  }

  return updatedTransaction;
}

export async function deleteTransaction(
  id: string,
  database: TapTrackDatabase = db
): Promise<void> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();

  await database.transaction(
    'rw',
    database.transactions,
    database.conversions,
    database.balanceCheckpoints,
    database.balances,
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
    }
  );

  void deleteRecord('transactions', id, database);
}

/** Creates multiple transactions atomically and rebuilds all derived balances once. */
export async function createTransactions(
  inputs: TransactionDraft[],
  database: TapTrackDatabase = db
): Promise<Transaction[]> {
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await createTransaction(inputs[0]!, database)];

  await ensureDatabaseSeeded(database);

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const transactions: Transaction[] = inputs.map((input) => ({
    ...input,
    occurredAt: input.occurredAt ?? getAutomaticOccurredAt(input.date, nowDate),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }));
  let updatedSettings: Settings | null = null;

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.settings,
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

      const lastInput = inputs.at(-1)!;
      const settings =
        (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
      updatedSettings = {
        ...settings,
        lastUsedMethod: lastInput.method,
        updatedAt: now,
      };
      await database.settings.put(updatedSettings);
    }
  );

  for (const transaction of transactions) {
    void pushRecord('transactions', transaction as unknown as Record<string, unknown>, database);
  }
  if (updatedSettings) {
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>, database);
  }

  return transactions;
}
