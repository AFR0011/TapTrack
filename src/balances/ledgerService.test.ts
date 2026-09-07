import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import type { BalanceCheckpoint, Conversion, Transaction } from '@/types';
import { AmbiguousLedgerOrderingError, rebuildDerivedBalances } from './ledgerService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackLedgerTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

function checkpoint(overrides: Partial<BalanceCheckpoint> = {}): BalanceCheckpoint {
  return {
    id: 'opening-TRY-cash',
    balanceId: getBalanceId('TRY', 'cash'),
    currency: 'TRY',
    method: 'cash',
    kind: 'opening',
    observedAmount: 100,
    deltaAmount: 100,
    date: '2026-05-01',
    effectiveAt: '2026-05-01T09:00:00.000Z',
    month: '2026-05',
    createdAt: '2026-05-01T09:00:00.000Z',
    updatedAt: '2026-05-01T09:00:00.000Z',
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    amount: 20,
    currency: 'TRY',
    title: 'expense',
    categoryId: 'cat-food',
    method: 'cash',
    date: '2026-05-01',
    occurredAt: '2026-05-01T10:00:00.000Z',
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    ...overrides,
  };
}

function conversion(overrides: Partial<Conversion> = {}): Conversion {
  return {
    id: crypto.randomUUID(),
    fromCurrency: 'TRY',
    toCurrency: 'USD',
    fromMethod: 'cash',
    toMethod: 'card',
    fromAmount: 10,
    toAmount: 1,
    date: '2026-05-01',
    occurredAt: '2026-05-01T11:00:00.000Z',
    createdAt: '2026-05-01T11:00:00.000Z',
    updatedAt: '2026-05-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('rebuildDerivedBalances', () => {
  it('starts from the latest checkpoint and applies later transactions and conversions', async () => {
    await database.balanceCheckpoints.bulkPut([
      checkpoint(),
      checkpoint({
        id: 'opening-USD-card',
        balanceId: getBalanceId('USD', 'card'),
        currency: 'USD',
        method: 'card',
        observedAmount: 5,
        deltaAmount: 5,
      }),
    ]);
    await database.transactions.put(transaction());
    await database.conversions.put(conversion());

    await rebuildDerivedBalances(database, '2026-05-01T12:00:00.000Z');

    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(70);
    expect((await database.balances.get(getBalanceId('USD', 'card')))?.amount).toBe(6);
  });

  it('does not replay historical records that fall before an absolute checkpoint', async () => {
    await database.balanceCheckpoints.put(checkpoint());
    await database.transactions.put(
      transaction({
        date: '2026-04-30',
        occurredAt: undefined,
        createdAt: '2026-05-02T12:00:00.000Z',
        updatedAt: '2026-05-02T12:00:00.000Z',
      })
    );

    await rebuildDerivedBalances(database);

    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(100);
  });

  it('treats a later reconciliation as the new absolute base', async () => {
    await database.balanceCheckpoints.bulkPut([
      checkpoint(),
      checkpoint({
        id: 'reconciliation-2026-06-TRY-cash',
        kind: 'reconciliation',
        observedAmount: 50,
        deltaAmount: -50,
        date: '2026-06-01',
        effectiveAt: '2026-06-01T10:00:00.000Z',
        month: '2026-06',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      }),
    ]);
    await database.transactions.bulkPut([
      transaction(),
      transaction({
        id: 'after-reconciliation',
        amount: 5,
        date: '2026-06-01',
        occurredAt: '2026-06-01T11:00:00.000Z',
        createdAt: '2026-06-01T11:00:00.000Z',
        updatedAt: '2026-06-01T11:00:00.000Z',
      }),
    ]);

    await rebuildDerivedBalances(database);

    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(45);
  });

  it('requires an explicit before/after choice for same-day activity created after reconciliation', async () => {
    await database.balanceCheckpoints.put(
      checkpoint({
        id: 'reconciliation-2026-06-TRY-cash',
        kind: 'reconciliation',
        observedAmount: 50,
        deltaAmount: -50,
        date: '2026-06-01',
        effectiveAt: '2026-06-01T10:00:00.000Z',
        month: '2026-06',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      })
    );
    await database.transactions.put(
      transaction({
        id: 'ambiguous',
        amount: 5,
        date: '2026-06-01',
        occurredAt: undefined,
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      })
    );

    await expect(rebuildDerivedBalances(database)).rejects.toBeInstanceOf(
      AmbiguousLedgerOrderingError
    );
  });
});
