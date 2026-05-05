import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBalanceId } from '@/defaultData';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import type { TransactionDraft } from '@/types';
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

describe('createTransaction', () => {
  it('creates an income transaction and updates the matching balance', async () => {
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

  it('creates an expense transaction when the balance is funded', async () => {
    await database.balances.update(getBalanceId('TRY', 'cash'), { amount: 200 });

    await createTransaction(baseExpense, database);

    const balance = await database.balances.get(getBalanceId('TRY', 'cash'));
    const transactions = await database.transactions.toArray();

    expect(balance?.amount).toBe(80);
    expect(transactions).toHaveLength(1);
  });

  it('blocks an expense that would make a balance negative', async () => {
    await expect(createTransaction(baseExpense, database)).rejects.toBeInstanceOf(
      InsufficientBalanceError
    );

    expect(await database.transactions.count()).toBe(0);
  });

  it('updates a transaction by reversing the old balance effect first', async () => {
    await database.balances.update(getBalanceId('TRY', 'cash'), { amount: 300 });
    await database.balances.update(getBalanceId('TRY', 'card'), { amount: 100 });
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
    await database.balances.update(getBalanceId('TRY', 'cash'), { amount: 300 });
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

  it('deletes a transaction and reverses its balance effect', async () => {
    await database.balances.update(getBalanceId('TRY', 'cash'), { amount: 300 });
    const transaction = await createTransaction(baseExpense, database);

    await deleteTransaction(transaction.id, database);

    const balance = await database.balances.get(getBalanceId('TRY', 'cash'));
    expect(balance?.amount).toBe(300);
    expect(await database.transactions.count()).toBe(0);
  });
});
