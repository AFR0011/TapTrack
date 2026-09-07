import { DEFAULT_SETTINGS_ID, createDefaultSettings, getBalanceId } from '@/defaultData';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getAutomaticOccurredAt } from '@/dates';
import { getInsufficientBalanceMessage, getTransactionBalanceDelta } from '@/balances/balanceEffects';
import type { Balance, Currency, Method, Settings, Transaction, TransactionDraft } from '@/types';
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

  const syncPayload = await database.transaction('rw', database.transactions, database.balances, database.settings, async () => {
    const balanceId = getBalanceId(input.currency, input.method);
    const currentBalance =
      (await database.balances.get(balanceId)) ??
      ({
        id: balanceId,
        currency: input.currency,
        method: input.method,
        amount: 0,
        updatedAt: now,
      } satisfies Balance);

    const nextAmount = currentBalance.amount + getTransactionBalanceDelta(input);

    if (nextAmount < 0) {
      throw new InsufficientBalanceError(input.currency, input.method, currentBalance.amount);
    }

    const updatedBalance: Balance = {
      ...currentBalance,
      amount: nextAmount,
      updatedAt: now,
    };
    await database.balances.put(updatedBalance);
    await database.transactions.add(transaction);

    const settings = (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
    const updatedSettings = {
      ...settings,
      lastUsedMethod: input.method,
      updatedAt: now,
    };
    await database.settings.put(updatedSettings);

    return { updatedBalance, updatedSettings };
  });

  void pushRecord('transactions', transaction as unknown as Record<string, unknown>, database);
  void pushRecord('balances', syncPayload.updatedBalance as unknown as Record<string, unknown>, database);
  void pushRecord('settings', syncPayload.updatedSettings as unknown as Record<string, unknown>, database);

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
  let balanceUpdates: Balance[] = [];
  let updatedSettings: Settings | null = null;

  await database.transaction('rw', database.transactions, database.balances, database.settings, async () => {
    const existingTransaction = await database.transactions.get(id);
    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    balanceUpdates = await calculateBalanceUpdates(existingTransaction, input, database, now);
    balanceUpdates.forEach((balance) => {
      if (balance.amount < 0) {
        throw new InsufficientBalanceError(balance.currency, balance.method, balance.amount);
      }
    });

    await Promise.all(balanceUpdates.map((balance) => database.balances.put(balance)));

    const occurredAt =
      input.occurredAt ??
      (existingTransaction.date === input.date
        ? existingTransaction.occurredAt
        : getAutomaticOccurredAt(input.date, nowDate));

    updatedTransaction = {
      ...input,
      occurredAt,
      id,
      createdAt: existingTransaction.createdAt,
      updatedAt: now,
    };

    await database.transactions.put(updatedTransaction);

    const settings = (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
    updatedSettings = {
      ...settings,
      lastUsedMethod: input.method,
      updatedAt: now,
    };
    await database.settings.put(updatedSettings);
  });

  if (!updatedTransaction) {
    throw new Error('Transaction was not updated');
  }

  void pushRecord('transactions', updatedTransaction as unknown as Record<string, unknown>, database);
  balanceUpdates.forEach((balance) => {
    void pushRecord('balances', balance as unknown as Record<string, unknown>, database);
  });
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

  const updatedBalance = await database.transaction('rw', database.transactions, database.balances, async () => {
    const transaction = await database.transactions.get(id);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const balanceId = getBalanceId(transaction.currency, transaction.method);
    const currentBalance =
      (await database.balances.get(balanceId)) ??
      ({
        id: balanceId,
        currency: transaction.currency,
        method: transaction.method,
        amount: 0,
        updatedAt: now,
      } satisfies Balance);
    const nextAmount = currentBalance.amount - getTransactionBalanceDelta(transaction);

    if (nextAmount < 0) {
      throw new InsufficientBalanceError(transaction.currency, transaction.method, currentBalance.amount);
    }

    const nextBalance: Balance = {
      ...currentBalance,
      amount: nextAmount,
      updatedAt: now,
    };
    await database.balances.put(nextBalance);
    await database.transactions.delete(id);
    return nextBalance;
  });

  void pushRecord('balances', updatedBalance as unknown as Record<string, unknown>, database);
  void deleteRecord('transactions', id, database);
}

/**
 * Creates multiple transactions atomically. Validates cumulative balance
 * effects so that if any transaction in the batch would cause a negative
 * balance the entire batch is rejected together.
 */
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

  const syncPayload = await database.transaction('rw', database.transactions, database.balances, database.settings, async () => {
    // Collect every unique balance row this batch touches
    const balanceIds = [...new Set(inputs.map((input) => getBalanceId(input.currency, input.method)))];
    const balanceMap = new Map<string, Balance>();

    for (const balanceId of balanceIds) {
      const [currency, method] = balanceId.split('-') as [Currency, Method];
      balanceMap.set(
        balanceId,
        (await database.balances.get(balanceId)) ?? {
          id: balanceId,
          currency,
          method,
          amount: 0,
          updatedAt: now,
        }
      );
    }

    // Simulate cumulative deltas in order; reject the whole batch on first shortfall
    for (const input of inputs) {
      const balanceId = getBalanceId(input.currency, input.method);
      const balance = balanceMap.get(balanceId)!;
      const nextAmount = balance.amount + getTransactionBalanceDelta(input);
      if (nextAmount < 0) {
        throw new InsufficientBalanceError(input.currency, input.method, balance.amount);
      }
      balance.amount = nextAmount;
      balance.updatedAt = now;
    }

    for (const balance of balanceMap.values()) {
      await database.balances.put(balance);
    }
    for (const transaction of transactions) {
      await database.transactions.add(transaction);
    }

    const lastInput = inputs.at(-1)!;
    const settings = (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
    const updatedSettings = {
      ...settings,
      lastUsedMethod: lastInput.method,
      updatedAt: now,
    };
    await database.settings.put(updatedSettings);

    return { balances: [...balanceMap.values()], updatedSettings };
  });

  for (const transaction of transactions) {
    void pushRecord('transactions', transaction as unknown as Record<string, unknown>, database);
  }
  for (const balance of syncPayload.balances) {
    void pushRecord('balances', balance as unknown as Record<string, unknown>, database);
  }
  void pushRecord('settings', syncPayload.updatedSettings as unknown as Record<string, unknown>, database);

  return transactions;
}

async function calculateBalanceUpdates(
  existingTransaction: Transaction,
  nextTransaction: TransactionDraft,
  database: TapTrackDatabase,
  now: string
) {
  const existingBalanceId = getBalanceId(existingTransaction.currency, existingTransaction.method);
  const nextBalanceId = getBalanceId(nextTransaction.currency, nextTransaction.method);
  const balanceIds = new Set([existingBalanceId, nextBalanceId]);
  const balances = new Map<string, Balance>();

  for (const balanceId of balanceIds) {
    const [currency, method] = balanceId.split('-') as [TransactionDraft['currency'], TransactionDraft['method']];
    balances.set(
      balanceId,
      (await database.balances.get(balanceId)) ?? {
        id: balanceId,
        currency,
        method,
        amount: 0,
        updatedAt: now,
      }
    );
  }

  const existingBalance = balances.get(existingBalanceId);
  const nextBalance = balances.get(nextBalanceId);
  if (!existingBalance || !nextBalance) {
    throw new Error('Balance lookup failed');
  }

  existingBalance.amount -= getTransactionBalanceDelta(existingTransaction);
  existingBalance.updatedAt = now;
  nextBalance.amount += getTransactionBalanceDelta(nextTransaction);
  nextBalance.updatedAt = now;

  return [...balances.values()];
}
