import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBalanceId } from '@/defaultData';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import type { Currency, Method, TransactionDraft } from '@/types';
import {
  InsufficientBalanceError,
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from './createTransaction';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

const baseExpense: TransactionDraft = {
  type: 'expense',
  amount: 120,
  currency: 'TRY',
  title: 'coffee',
  categoryId: 'cat-food',
  method: 'cash',
  date: '2026-04-30',
};

async function setOpeningBalance(currency: Currency, method: Method, amount: number) {
  const balanceId = getBalanceId(currency, method);
  const effectiveAt = '2026-01-01T00:00:00.000Z';
  await database.balanceCheckpoints.put({
    id: `opening-${balanceId}`,
    balanceId,
    currency,
    method,
    kind: 'opening',
    observedAmount: amount,
    deltaAmount: amount,
    date: '2026-01-01',
    effectiveAt,
    month: '2026-01',
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  });
}

describe('createTransaction', () => {
  it('does not leak an unhandled sync rejection from the committed local write', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);

    try {
      await setOpeningBalance('TRY', 'cash', 200);
      await createTransaction(baseExpense, database);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('records exact ordering for current-day activity but leaves historical activity unordered', async () => {
    const now = new Date(2026, 4, 18, 14, 30, 0);

    const current = await createTransaction(
      {
        ...baseExpense,
        type: 'income',
        amount: 10,
        title: 'today',
        categoryId: 'cat-income',
        date: '2026-05-18',
      },
      database,
      now
    );
    const historical = await createTransaction(
      {
        ...baseExpense,
        type: 'income',
        amount: 10,
        title: 'yesterday',
        categoryId: 'cat-income',
        date: '2026-05-17',
      },
      database,
      now
    );

    expect(current.occurredAt).toBe(now.toISOString());
    expect(historical.occurredAt).toBeUndefined();
  });

  it('creates an income transaction and updates the matching derived balance', async () => {
    const transaction = await createTransaction(
      {
        ...baseExpense,
        type: 'income',
        amount: 20000,
        title: 'salary',
        categoryId: 'cat-income',
        method: 'card',
      },
      database
    );

    const balance = await database.balances.get(getBalanceId('TRY', 'card'));

    expect(transaction.id).toEqual(expect.any(String));
    expect(balance?.amount).toBe(20000);
  });

  it('creates an expense transaction when the opening balance is funded', async () => {
    await setOpeningBalance('TRY', 'cash', 200);

    await createTransaction(baseExpense, database);

    const balance = await database.balances.get(getBalanceId('TRY', 'cash'));
    const transactions = await database.transactions.toArray();

    expect(balance?.amount).toBe(80);
    expect(transactions).toHaveLength(1);
  });

  it('blocks an expense that would make a derived balance negative', async () => {
    await expect(createTransaction(baseExpense, database)).rejects.toBeInstanceOf(
      InsufficientBalanceError
    );

    expect(await database.transactions.count()).toBe(0);
  });

  it('updates a transaction by rebuilding from the authoritative ledger', async () => {
    await setOpeningBalance('TRY', 'cash', 300);
    await setOpeningBalance('TRY', 'card', 100);
    const transaction = await createTransaction(baseExpense, database);

    await updateTransaction(
      transaction.id,
      {
        ...baseExpense,
        amount: 50,
        method: 'card',
      },
      database
    );

    const cashBalance = await database.balances.get(getBalanceId('TRY', 'cash'));
    const cardBalance = await database.balances.get(getBalanceId('TRY', 'card'));

    expect(cashBalance?.amount).toBe(300);
    expect(cardBalance?.amount).toBe(50);
  });

  it('blocks edits that would make the destination balance negative', async () => {
    await setOpeningBalance('TRY', 'cash', 300);
    const transaction = await createTransaction(baseExpense, database);

    await expect(
      updateTransaction(
        transaction.id,
        {
          ...baseExpense,
          amount: 50,
          method: 'card',
        },
        database
      )
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const original = await database.transactions.get(transaction.id);
    expect(original?.method).toBe('cash');
  });

  it('deletes a transaction and rebuilds its balance effect away', async () => {
    await setOpeningBalance('TRY', 'cash', 300);
    const transaction = await createTransaction(baseExpense, database);

    await deleteTransaction(transaction.id, database);

    const balance = await database.balances.get(getBalanceId('TRY', 'cash'));
    expect(balance?.amount).toBe(300);
    expect(await database.transactions.count()).toBe(0);
  });
});
