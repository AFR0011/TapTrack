import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import type { BalanceCheckpoint, Transaction } from '@/types';

vi.mock('@/sync/syncBinding', () => ({
  getSyncAccess: vi.fn(),
  requireLinkedSyncAccess: vi.fn(),
}));

import { requireLinkedSyncAccess } from '@/sync/syncBinding';
import {
  deleteRecord,
  processRetryQueue,
  pullUpdates,
  pushRecord,
} from './syncService';

type RemoteRow = Record<string, unknown>;
type Filters = Record<string, unknown>;

function createFilteredChain<T>(resolveValue: (filters: Filters) => T | Promise<T>) {
  const filters: Filters = {};
  const chain = {
    eq: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    }),
    then: (
      resolve: (result: T) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(resolveValue(filters)).then(resolve, reject),
  };
  return chain;
}

function createSharedRemoteClient() {
  const tables = new Map<string, Map<string, RemoteRow>>();

  const getTable = (tableName: string) => {
    let table = tables.get(tableName);
    if (!table) {
      table = new Map<string, RemoteRow>();
      tables.set(tableName, table);
    }
    return table;
  };

  const getKey = (row: RemoteRow) => `${String(row.user_id)}:${String(row.id)}`;
  const matches = (row: RemoteRow, filters: Filters) =>
    Object.entries(filters).every(([field, value]) => row[field] === value);

  const client = {
    from: vi.fn((tableName: string) => ({
      upsert: vi.fn(async (payload: RemoteRow) => {
        const table = getTable(tableName);
        const key = getKey(payload);
        table.set(key, { ...(table.get(key) ?? {}), ...payload });
        return { error: null };
      }),
      update: vi.fn((payload: RemoteRow) =>
        createFilteredChain(async (filters) => {
          const table = getTable(tableName);
          for (const [key, row] of table.entries()) {
            if (matches(row, filters)) table.set(key, { ...row, ...payload });
          }
          return { error: null };
        })
      ),
      select: vi.fn(() =>
        createFilteredChain(async (filters) => ({
          data: [...getTable(tableName).values()]
            .filter((row) => matches(row, filters))
            .map((row) => ({ ...row })),
          error: null,
        }))
      ),
    })),
  };

  return {
    client,
    read(tableName: string, id: string, userId = 'user-1') {
      return getTable(tableName).get(`${userId}:${id}`);
    },
  };
}

function authorize(client: ReturnType<typeof createSharedRemoteClient>['client']) {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue({
    client: client as never,
    userId: 'user-1',
  });
}

function goOfflineForSync() {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue(null);
}

describe('two-device canonical ledger convergence', () => {
  let deviceA: TapTrackDatabase;
  let deviceB: TapTrackDatabase;
  let remote: ReturnType<typeof createSharedRemoteClient>;

  beforeEach(async () => {
    deviceA = new TapTrackDatabase(`TapTrackDeviceA-${crypto.randomUUID()}`);
    deviceB = new TapTrackDatabase(`TapTrackDeviceB-${crypto.randomUUID()}`);
    await ensureDatabaseSeeded(deviceA);
    await ensureDatabaseSeeded(deviceB);
    remote = createSharedRemoteClient();
    authorize(remote.client);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await deviceA.delete();
    await deviceB.delete();
  });

  it('propagates checkpoints, resolves offline edit conflicts by last successful sync, and converges after delete', async () => {
    const opening: BalanceCheckpoint = {
      id: 'opening-TRY-card',
      balanceId: getBalanceId('TRY', 'card'),
      currency: 'TRY',
      method: 'card',
      kind: 'opening',
      observedAmount: 100,
      deltaAmount: 100,
      date: '2026-09-01',
      effectiveAt: '2026-09-01T09:00:00.000Z',
      month: '2026-09',
      createdAt: '2026-09-01T09:00:00.000Z',
      updatedAt: '2026-09-01T09:00:00.000Z',
    };
    const beforeReconciliation: Transaction = {
      id: 'tx-before-reconciliation',
      type: 'expense',
      amount: 25,
      currency: 'TRY',
      title: 'Lunch',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-01',
      occurredAt: '2026-09-01T10:00:00.000Z',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };
    const reconciliation: BalanceCheckpoint = {
      id: 'reconciliation-2026-09-TRY-card',
      balanceId: getBalanceId('TRY', 'card'),
      currency: 'TRY',
      method: 'card',
      kind: 'reconciliation',
      observedAmount: 80,
      deltaAmount: 5,
      date: '2026-09-01',
      effectiveAt: '2026-09-01T11:00:00.000Z',
      month: '2026-09',
      createdAt: '2026-09-01T11:00:00.000Z',
      updatedAt: '2026-09-01T11:00:00.000Z',
    };
    const sharedTransaction: Transaction = {
      id: 'tx-shared',
      type: 'expense',
      amount: 10,
      currency: 'TRY',
      title: 'Original',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-01',
      occurredAt: '2026-09-01T12:00:00.000Z',
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
    };

    await deviceA.balanceCheckpoints.bulkPut([opening, reconciliation]);
    await deviceA.transactions.bulkPut([beforeReconciliation, sharedTransaction]);
    await rebuildDerivedBalances(deviceA);

    await pushRecord('balanceCheckpoints', opening as unknown as RemoteRow, deviceA);
    await pushRecord('transactions', beforeReconciliation as unknown as RemoteRow, deviceA);
    await pushRecord('balanceCheckpoints', reconciliation as unknown as RemoteRow, deviceA);
    await pushRecord('transactions', sharedTransaction as unknown as RemoteRow, deviceA);

    await pullUpdates(deviceB);

    expect(await deviceB.balanceCheckpoints.get(reconciliation.id)).toMatchObject({
      observedAmount: 80,
      kind: 'reconciliation',
    });
    expect((await deviceB.balances.get(getBalanceId('TRY', 'card')))?.amount).toBe(70);

    // Both devices edit the same row while disconnected. Each edit remains
    // optimistic locally and durably queued until its device reconnects.
    goOfflineForSync();
    const editA: Transaction = {
      ...sharedTransaction,
      title: 'Edited on device A',
      updatedAt: '2026-09-01T13:00:00.000Z',
    };
    const editB: Transaction = {
      ...(await deviceB.transactions.get(sharedTransaction.id))!,
      title: 'Edited on device B',
      updatedAt: '2026-09-01T14:00:00.000Z',
    };
    await deviceA.transactions.put(editA);
    await pushRecord('transactions', editA as unknown as RemoteRow, deviceA);
    await deviceB.transactions.put(editB);
    await pushRecord('transactions', editB as unknown as RemoteRow, deviceB);

    expect(await deviceA.syncOutbox.get('transactions:tx-shared')).toBeDefined();
    expect(await deviceB.syncOutbox.get('transactions:tx-shared')).toBeDefined();

    // A reconnects first, so A wins temporarily.
    authorize(remote.client);
    await processRetryQueue(deviceA);
    await pullUpdates(deviceA);
    expect(remote.read('transactions', 'tx-shared')?.title).toBe('Edited on device A');

    // B reconnects second. The user's chosen rule is last successful sync wins.
    await processRetryQueue(deviceB);
    await pullUpdates(deviceB);
    expect(remote.read('transactions', 'tx-shared')?.title).toBe('Edited on device B');

    await pullUpdates(deviceA);
    expect((await deviceA.transactions.get('tx-shared'))?.title).toBe('Edited on device B');
    expect((await deviceB.transactions.get('tx-shared'))?.title).toBe('Edited on device B');
    expect((await deviceA.balances.get(getBalanceId('TRY', 'card')))?.amount).toBe(70);
    expect((await deviceB.balances.get(getBalanceId('TRY', 'card')))?.amount).toBe(70);

    // A later deletes the now-converged transaction while offline. Once that
    // delete syncs, B consumes the remote soft-delete and both rebuild from the
    // same reconciliation checkpoint back to 80 TRY.
    goOfflineForSync();
    await deviceA.transactions.delete('tx-shared');
    await deleteRecord('transactions', 'tx-shared', deviceA);
    expect(await deviceA.syncOutbox.get('transactions:tx-shared')).toBeDefined();

    authorize(remote.client);
    await processRetryQueue(deviceA);
    await pullUpdates(deviceA);
    await pullUpdates(deviceB);

    expect(await deviceA.transactions.get('tx-shared')).toBeUndefined();
    expect(await deviceB.transactions.get('tx-shared')).toBeUndefined();
    expect(remote.read('transactions', 'tx-shared')?.deleted_at).toEqual(expect.any(String));
    expect((await deviceA.balances.get(getBalanceId('TRY', 'card')))?.amount).toBe(80);
    expect((await deviceB.balances.get(getBalanceId('TRY', 'card')))?.amount).toBe(80);
  });
});
