import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { createTransaction, InsufficientBalanceError } from './createTransaction';

describe('createTransaction balance checking', () => {
  let database: TapTrackDatabase;

  beforeEach(async () => {
    database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
    await ensureDatabaseSeeded(database);
  });

  afterEach(async () => {
    await database.delete();
  });

  it('should throw InsufficientBalanceError when expense exceeds balance', async () => {
    // Create an expense transaction without funding the balance
    await expect(createTransaction({
      type: 'expense',
      amount: 120,
      currency: 'TRY',
      title: 'coffee',
      categoryId: 'cat-food',
      method: 'cash',
      date: '2026-04-30',
    }, database)).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it('should allow expense when balance is sufficient', async () => {
    // Fund the balance first
    await database.balances.update('TRY-cash', { amount: 200 });

    // Create an expense transaction with sufficient balance
    const transaction = await createTransaction({
      type: 'expense',
      amount: 120,
      currency: 'TRY',
      title: 'coffee',
      categoryId: 'cat-food',
      method: 'cash',
      date: '2026-04-30',
    }, database);

    // Verify transaction was created
    expect(transaction).toBeDefined();

    // Verify balance was updated
    const balance = await database.balances.get('TRY-cash');
    expect(balance?.amount).toBe(80); // 200 - 120
  });
});