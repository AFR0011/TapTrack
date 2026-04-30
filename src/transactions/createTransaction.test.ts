import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBalanceId } from '@/defaultData';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import type { TransactionDraft } from '@/types';
import { InsufficientBalanceError, createTransaction } from './createTransaction';

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
});
