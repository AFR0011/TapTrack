import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import type { BalanceCheckpoint, TransactionDraft } from '@/types';
import { findHistoricalTransactionOrderingRequirements } from './historicalOrdering';

let database: RavelDatabase;

beforeEach(async () => {
  database = new RavelDatabase(`RavelHistoricalOrdering-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);

  const checkpoint: BalanceCheckpoint = {
    id: 'reconciliation-2026-06-TRY-card',
    balanceId: getBalanceId('TRY', 'card'),
    currency: 'TRY',
    method: 'card',
    kind: 'reconciliation',
    observedAmount: 1000,
    deltaAmount: 0,
    date: '2026-06-03',
    effectiveAt: '2026-06-03T10:00:00.000Z',
    month: '2026-06',
    createdAt: '2026-06-03T10:00:00.000Z',
    updatedAt: '2026-06-03T10:00:00.000Z',
  };
  await database.balanceCheckpoints.add(checkpoint);
});

afterEach(async () => {
  await database.delete();
});

describe('historical transaction ordering preflight', () => {
  it('requires a choice only for historical drafts touching the reconciled balance bucket', async () => {
    const base: TransactionDraft = {
      type: 'expense',
      amount: 20,
      currency: 'TRY',
      title: 'Lunch',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-06-03',
    };

    const drafts: TransactionDraft[] = [
      base,
      { ...base, method: 'cash', title: 'Cash lunch' },
      { ...base, date: '2026-06-10', title: 'Today lunch' },
      {
        ...base,
        title: 'Already ordered',
        occurredAt: '2026-06-03T09:59:59.999Z',
      },
    ];

    const requirements = await findHistoricalTransactionOrderingRequirements(
      drafts,
      database,
      new Date('2026-06-10T12:00:00.000Z')
    );

    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({
      index: 0,
      checkpoint: { id: 'reconciliation-2026-06-TRY-card' },
    });
  });
});
