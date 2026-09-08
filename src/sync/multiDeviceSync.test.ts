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
    is: vi.fn((field: string, value: unknown) => {
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

const INITIAL_GENERATION = '123e4567-e89b-42d3-a456-426614174000';
const ROTATED_GENERATION = '223e4567-e89b-42d3-a456-426614174000';

function createSharedRemoteClient() {
  const tables = new Map<string, Map<string, RemoteRow>>();
  let revision = 1;
  let generation = INITIAL_GENERATION;
  let rotateBeforeNextOperation = false;

  const getTable = (tableName: string) => {
    let table = tables.get(tableName);
    if (!table) {
      table = new Map<string, RemoteRow>();
      tables.set(tableName, table);
    }
    return table;
  };

  const matches = (row: RemoteRow, filters: Filters) =>
    Object.entries(filters).every(([field, value]) => row[field] === value);

  const rotateGeneration = () => {
    revision += 1;
    generation = ROTATED_GENERATION;
  };

  const client = {
    from: vi.fn((tableName: string) => {
      if (tableName === 'ledger_versions') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: {
              revision,
              generation,
              updated_at: '2026-09-08T06:00:00.000Z',
            },
            error: null,
          })),
          insert: vi.fn(async () => ({ error: null })),
        };
        return chain;
      }

      return {
        select: vi.fn(() =>
          createFilteredChain(async (filters) => ({
            data: [...getTable(tableName).values()]
              .filter((row) => matches(row, filters))
              .map((row) => ({ ...row })),
            error: null,
          }))
        ),
      };
    }),
  };

  const handleSyncRequest = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (rotateBeforeNextOperation) {
      rotateBeforeNextOperation = false;
      rotateGeneration();
    }

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      revision?: number;
      generation?: string;
      table?: string;
      operation?: string;
      recordId?: string;
      record?: RemoteRow | null;
    };

    if (body.revision !== revision || body.generation !== generation) {
      return new Response(JSON.stringify({ revision, generation }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!body.table || !body.recordId) {
      return new Response(JSON.stringify({ error: 'invalid request' }), { status: 400 });
    }

    const table = getTable(body.table);
    const key = `user-1:${body.recordId}`;
    if (body.operation === 'delete') {
      table.set(key, {
        ...(table.get(key) ?? { user_id: 'user-1', id: body.recordId }),
        deleted_at: '2026-09-08T06:30:00.000Z',
        updated_at: '2026-09-08T06:30:00.000Z',
      });
    } else if (body.operation === 'upsert' && body.record) {
      table.set(key, { ...(table.get(key) ?? {}), ...body.record, deleted_at: null });
    } else {
      return new Response(JSON.stringify({ error: 'invalid operation' }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return {
    client,
    handleSyncRequest,
    rotateGeneration,
    rotateBeforeOperation() {
      rotateBeforeNextOperation = true;
    },
    getVersion() {
      return { revision, generation };
    },
    read(tableName: string, id: string, userId = 'user-1') {
      return getTable(tableName).get(`${userId}:${id}`);
    },
  };
}

function authorize(client: ReturnType<typeof createSharedRemoteClient>['client']) {
  vi.mocked(requireLinkedSyncAccess).mockImplementation(async (database?: TapTrackDatabase) => {
    if (!database) return null;
    const binding = await database.deviceMetadata.get('ledger-binding');
    if (!binding) return null;
    return {
      client: client as never,
      userId: 'user-1',
      binding,
    };
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
    const initialBinding = {
      id: 'ledger-binding',
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-09-08T06:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: INITIAL_GENERATION,
    };
    await deviceA.deviceMetadata.put(initialBinding);
    await deviceB.deviceMetadata.put(initialBinding);
    remote = createSharedRemoteClient();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      remote.handleSyncRequest(input, init)
    ));
    authorize(remote.client);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
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

  it('discards an offline stale outbox and adopts cloud after an account restore generation changes', async () => {
    const transaction: Transaction = {
      id: 'tx-generation',
      type: 'expense',
      amount: 10,
      currency: 'TRY',
      title: 'Cloud canonical title',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-08',
      occurredAt: '2026-09-08T06:10:00.000Z',
      createdAt: '2026-09-08T06:10:00.000Z',
      updatedAt: '2026-09-08T06:10:00.000Z',
    };

    await deviceA.transactions.put(transaction);
    await pushRecord('transactions', transaction as unknown as RemoteRow, deviceA);
    await pullUpdates(deviceB);

    goOfflineForSync();
    const staleEdit = {
      ...transaction,
      title: 'Offline stale edit',
      updatedAt: '2026-09-08T06:20:00.000Z',
    };
    await deviceB.transactions.put(staleEdit);
    await pushRecord('transactions', staleEdit as unknown as RemoteRow, deviceB);
    expect(await deviceB.syncOutbox.get('transactions:tx-generation')).toBeDefined();

    remote.rotateGeneration();
    authorize(remote.client);
    await processRetryQueue(deviceB);

    expect(await deviceB.syncOutbox.get('transactions:tx-generation')).toBeUndefined();
    expect((await deviceB.transactions.get('tx-generation'))?.title).toBe('Cloud canonical title');
    expect(remote.read('transactions', 'tx-generation')?.title).toBe('Cloud canonical title');
    await expect(deviceB.deviceMetadata.get('ledger-binding')).resolves.toMatchObject(
      remote.getVersion()
    );
  });

  it('rejects a stale write when generation rotates after precheck but before the protected server operation', async () => {
    const transaction: Transaction = {
      id: 'tx-generation-race',
      type: 'expense',
      amount: 15,
      currency: 'TRY',
      title: 'Cloud before race',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-08',
      occurredAt: '2026-09-08T06:10:00.000Z',
      createdAt: '2026-09-08T06:10:00.000Z',
      updatedAt: '2026-09-08T06:10:00.000Z',
    };

    await deviceA.transactions.put(transaction);
    await pushRecord('transactions', transaction as unknown as RemoteRow, deviceA);

    goOfflineForSync();
    const staleEdit = {
      ...transaction,
      title: 'Stale race edit',
      updatedAt: '2026-09-08T06:25:00.000Z',
    };
    await deviceA.transactions.put(staleEdit);
    await pushRecord('transactions', staleEdit as unknown as RemoteRow, deviceA);
    expect(await deviceA.syncOutbox.get('transactions:tx-generation-race')).toBeDefined();

    authorize(remote.client);
    remote.rotateBeforeOperation();
    await processRetryQueue(deviceA);

    expect(await deviceA.syncOutbox.get('transactions:tx-generation-race')).toBeUndefined();
    expect((await deviceA.transactions.get('tx-generation-race'))?.title).toBe('Cloud before race');
    expect(remote.read('transactions', 'tx-generation-race')?.title).toBe('Cloud before race');
    await expect(deviceA.deviceMetadata.get('ledger-binding')).resolves.toMatchObject(
      remote.getVersion()
    );
  });
});
