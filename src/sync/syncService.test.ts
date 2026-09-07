import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';

vi.mock('@/sync/syncBinding', () => ({
  getSyncAccess: vi.fn(),
  requireLinkedSyncAccess: vi.fn(),
}));

import { getSyncAccess, requireLinkedSyncAccess } from '@/sync/syncBinding';
import {
  deleteRecord,
  getSyncStatus,
  processRetryQueue,
  pullUpdates,
  pushRecord,
  syncAllLocalData,
} from './syncService';

type TableResponse = { data: unknown[] | null; error: { message: string } | null };

type ClientOptions = {
  upsert?: (table: string, payload: unknown) => Promise<{ error: { message: string } | null }>;
  updateError?: { message: string } | null;
  tableResponses?: Record<string, TableResponse>;
};

function createAwaitableChain<T>(value: T) {
  const chain = {
    eq: vi.fn(() => chain),
    then: (resolve: (result: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
  };
  return chain;
}

function createClientMock(options: ClientOptions = {}) {
  const tableResponses = options.tableResponses ?? {};
  const upsert = vi.fn(async (table: string, payload: unknown) =>
    options.upsert ? options.upsert(table, payload) : { error: null }
  );
  const update = vi.fn((table: string, payload: unknown) => {
    void table;
    void payload;
    return createAwaitableChain({ error: options.updateError ?? null });
  });

  return {
    upsert,
    update,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    },
    from: vi.fn((table: string) => ({
      upsert: (payload: unknown) => upsert(table, payload),
      update: (payload: unknown) => update(table, payload),
      select: vi.fn(() =>
        createAwaitableChain(
          tableResponses[table] ?? {
            data: [],
            error: null,
          }
        )
      ),
    })),
  };
}

let database: TapTrackDatabase;

function authorize(client = createClientMock()) {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue({
    client: client as never,
    userId: 'user-1',
  });
  return client;
}

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackSyncTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
  const client = createClientMock();
  authorize(client);
  vi.mocked(getSyncAccess).mockResolvedValue({
    state: 'linked',
    client: client as never,
    userId: 'user-1',
    binding: {
      id: 'ledger-binding',
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-05-18T00:00:00.000Z',
    },
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  await database.delete();
});

describe('syncService durable protocol', () => {
  it('never queues or uploads derived balance rows', async () => {
    const client = authorize();

    await pushRecord(
      'balances',
      {
        id: 'TRY-cash',
        currency: 'TRY',
        method: 'cash',
        amount: 12,
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      database
    );

    expect(await database.syncOutbox.count()).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('keeps failed canonical writes in the durable IndexedDB outbox', async () => {
    authorize(
      createClientMock({
        upsert: async () => ({ error: { message: 'offline' } }),
      })
    );

    await pushRecord(
      'settings',
      {
        id: 'default',
        defaultCurrency: 'TRY',
        lastUsedMethod: 'card',
        setupCompleted: true,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      database
    );

    const item = await database.syncOutbox.get('settings:default');
    expect(item).toMatchObject({
      tableName: 'settings',
      operation: 'upsert',
      recordId: 'default',
      attempts: 1,
    });
    expect(item?.operationId).toEqual(expect.any(String));
  });

  it('acknowledges a successful exact operation', async () => {
    authorize();

    await pushRecord(
      'categories',
      {
        id: 'cat-test',
        name: 'Test',
        type: 'expense',
        isDefault: false,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      database
    );

    expect(await database.syncOutbox.get('categories:cat-test')).toBeUndefined();
  });

  it('does not let an older in-flight success acknowledge a newer queued edit', async () => {
    let resolveFirst: ((value: { error: null }) => void) | undefined;
    let call = 0;
    const client = createClientMock({
      upsert: async () => {
        call += 1;
        if (call === 1) {
          return new Promise<{ error: null }>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return { error: { message: 'second write still offline' } };
      },
    });
    authorize(client);

    const first = pushRecord(
      'categories',
      {
        id: 'cat-race',
        name: 'Older',
        type: 'expense',
        isDefault: false,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      database
    );

    await vi.waitFor(async () => {
      expect((await database.syncOutbox.get('categories:cat-race'))?.operationId).toBeDefined();
    });
    const firstOperationId = (await database.syncOutbox.get('categories:cat-race'))!.operationId;

    await pushRecord(
      'categories',
      {
        id: 'cat-race',
        name: 'Newer',
        type: 'expense',
        isDefault: false,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T01:00:00.000Z',
      },
      database
    );

    const newer = await database.syncOutbox.get('categories:cat-race');
    expect(newer?.operationId).not.toBe(firstOperationId);
    expect(newer?.record?.name).toBe('Newer');

    resolveFirst?.({ error: null });
    await first;

    expect((await database.syncOutbox.get('categories:cat-race'))?.operationId).toBe(
      newer?.operationId
    );
  });

  it('uses one soft-delete update instead of hard delete plus a tombstone', async () => {
    const client = authorize();

    await deleteRecord('transactions', 'tx-1', database);

    expect(client.update).toHaveBeenCalledTimes(1);
    expect(client.update.mock.calls[0]?.[0]).toBe('transactions');
    expect(client.update.mock.calls[0]?.[1]).toMatchObject({
      deleted_at: expect.any(String),
    });
    expect(await database.syncOutbox.get('transactions:tx-1')).toBeUndefined();
  });

  it('protects a pending optimistic local row from an older remote pull', async () => {
    const local = {
      id: 'tx-pending',
      type: 'income' as const,
      amount: 50,
      currency: 'TRY' as const,
      title: 'Local newer title',
      categoryId: 'cat-income',
      method: 'cash' as const,
      date: '2026-05-18',
      occurredAt: '2026-05-18T10:00:00.000Z',
      createdAt: '2026-05-18T10:00:00.000Z',
      updatedAt: '2026-05-18T11:00:00.000Z',
    };
    await database.transactions.put(local);

    vi.mocked(requireLinkedSyncAccess).mockResolvedValue(null);
    await pushRecord('transactions', local, database);

    authorize(
      createClientMock({
        tableResponses: {
          transactions: {
            data: [
              {
                user_id: 'user-1',
                id: 'tx-pending',
                type: 'income',
                amount: 50,
                currency: 'TRY',
                title: 'Remote older title',
                category_id: 'cat-income',
                method: 'cash',
                date: '2026-05-18',
                created_at: '2026-05-18T10:00:00.000Z',
                updated_at: '2026-05-18T10:30:00.000Z',
                deleted_at: null,
              },
            ],
            error: null,
          },
        },
      })
    );

    await pullUpdates(database);

    expect((await database.transactions.get('tx-pending'))?.title).toBe('Local newer title');
    expect(await database.syncOutbox.get('transactions:tx-pending')).toBeDefined();
  });

  it('applies remote soft deletes locally', async () => {
    await database.categories.put({
      id: 'cat-delete',
      name: 'Delete me',
      type: 'expense',
      isDefault: false,
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
    });

    authorize(
      createClientMock({
        tableResponses: {
          categories: {
            data: [
              {
                user_id: 'user-1',
                id: 'cat-delete',
                deleted_at: '2026-05-19T00:00:00.000Z',
                updated_at: '2026-05-19T00:00:00.000Z',
              },
            ],
            error: null,
          },
        },
      })
    );

    await pullUpdates(database);

    expect(await database.categories.get('cat-delete')).toBeUndefined();
  });

  it('rebuilds identical derived balances from pulled checkpoints and ledger records', async () => {
    authorize(
      createClientMock({
        tableResponses: {
          balance_checkpoints: {
            data: [
              {
                user_id: 'user-1',
                id: 'opening-TRY-cash',
                balance_id: 'TRY-cash',
                currency: 'TRY',
                method: 'cash',
                kind: 'opening',
                observed_amount: 100,
                delta_amount: 100,
                date: '2026-05-01',
                effective_at: '2026-05-01T09:00:00.000Z',
                month: '2026-05',
                created_at: '2026-05-01T09:00:00.000Z',
                updated_at: '2026-05-01T09:00:00.000Z',
                deleted_at: null,
              },
            ],
            error: null,
          },
          transactions: {
            data: [
              {
                user_id: 'user-1',
                id: 'tx-1',
                type: 'expense',
                amount: 25,
                currency: 'TRY',
                title: 'Lunch',
                category_id: 'cat-food',
                method: 'cash',
                date: '2026-05-01',
                occurred_at: '2026-05-01T10:00:00.000Z',
                created_at: '2026-05-01T10:00:00.000Z',
                updated_at: '2026-05-01T10:00:00.000Z',
                deleted_at: null,
              },
            ],
            error: null,
          },
        },
      })
    );

    await pullUpdates(database);

    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(75);
  });

  it('queues local writes while unauthorized and performs no network work', async () => {
    vi.mocked(requireLinkedSyncAccess).mockResolvedValue(null);
    const client = createClientMock();

    await pushRecord(
      'categories',
      {
        id: 'cat-offline',
        name: 'Offline',
        type: 'expense',
        isDefault: false,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      database
    );
    await processRetryQueue(database);
    await pullUpdates(database);

    expect(client.from).not.toHaveBeenCalled();
    expect(await database.syncOutbox.get('categories:cat-offline')).toBeDefined();
  });

  it('reports durable pending operations in sync status', async () => {
    vi.mocked(requireLinkedSyncAccess).mockResolvedValue(null);
    await pushRecord(
      'categories',
      {
        id: 'cat-pending',
        name: 'Pending',
        type: 'expense',
        isDefault: false,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      database
    );

    await expect(getSyncStatus(database)).resolves.toMatchObject({
      authenticated: true,
      userId: 'user-1',
      pendingRetryCount: 1,
      online: true,
    });
  });

  it('keeps destructive remote snapshot replacement disabled', async () => {
    await expect(syncAllLocalData(database)).rejects.toThrow(
      'Remote snapshot replacement is disabled'
    );
  });
});
