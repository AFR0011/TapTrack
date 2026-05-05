import { DEFAULT_SETTINGS_ID, createDefaultSettings, getBalanceId } from '@/defaultData';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getInsufficientBalanceMessage, getTransactionBalanceDelta } from '@/balances/balanceEffects';
import type { Balance, Transaction, TransactionDraft } from '@/types';

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
  database: TapTrackDatabase = db
): Promise<Transaction> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  const transaction: Transaction = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction('rw', database.transactions, database.balances, database.settings, async () => {
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

    await database.balances.put({
      ...currentBalance,
      amount: nextAmount,
      updatedAt: now,
    });
    await database.transactions.add(transaction);

    const settings = (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
    await database.settings.put({
      ...settings,
      lastUsedMethod: input.method,
      updatedAt: now,
    });
  });

  return transaction;
}
