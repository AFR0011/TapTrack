import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';
import { disconnectDeviceLedger } from '@/sync/disconnectDevice';

function makeTransaction() {
  return {
    id: 'local-transaction',
    type: 'expense' as const,
    amount: 25,
    currency: 'TRY' as const,
    title: 'Local coffee',
    categoryId: 'cat-food',
    method: 'card' as const,
    date: '2026-09-08',
    createdAt: '2026-09-08T08:00:00.000Z',
    updatedAt: '2026-09-08T08:00:00.000Z',
  };
}

describe('disconnectDeviceLedger', () => {
  let database: RavelDatabase;

  beforeEach(() => {
    database = new RavelDatabase(`taptrack-disconnect-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await database.delete();
  });

  it('atomically removes the binding and pending account outbox while preserving local finance data', async () => {
    const transaction = makeTransaction();
    await database.transactions.add(transaction);
    await database.deviceMetadata.add({
      id: DEVICE_LEDGER_BINDING_ID,
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-09-01T00:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: '123e4567-e89b-42d3-a456-426614174000',
    });
    await database.syncOutbox.add({
      id: 'transactions:local-transaction',
      operationId: '123e4567-e89b-42d3-a456-426614174001',
      tableName: 'transactions',
      operation: 'upsert',
      recordId: transaction.id,
      record: transaction,
      queuedAt: '2026-09-08T08:00:00.000Z',
      attempts: 0,
    });

    await expect(disconnectDeviceLedger(database)).resolves.toBe(true);

    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
    await expect(database.syncOutbox.count()).resolves.toBe(0);
    await expect(database.transactions.get(transaction.id)).resolves.toEqual(transaction);
  });

  it('is an idempotent no-op when the browser is already unlinked', async () => {
    await database.transactions.add(makeTransaction());

    await expect(disconnectDeviceLedger(database)).resolves.toBe(false);
    await expect(database.transactions.count()).resolves.toBe(1);
  });
});
