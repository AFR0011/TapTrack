import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/syncBinding', () => ({
  getSyncAccess: vi.fn(),
  requireLinkedSyncAccess: vi.fn(),
}));

import { getSyncAccess, requireLinkedSyncAccess } from '@/sync/syncBinding';
import {
  getSyncStatus,
  processRetryQueue,
  pullUpdates,
  pushRecord,
  syncAllLocalData,
} from './syncService';

const RETRY_QUEUE_KEY = 'taptrack_retry_queue:user-1';
const SYNC_CURSOR_KEY = 'taptrack_sync_cursor:user-1';
const PUSH_CURSOR_KEY = 'taptrack_push_cursor:user-1';

type TableResponse = { data: unknown[] | null; error: { message: string } | null };

type MockOptions = {
  upsertError?: { message: string } | null;
  deleteError?: { message: string } | null;
  tableResponses?: Record<string, TableResponse>;
};

function createDeleteChain(error: { message: string } | null = null) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    then: (resolve: (value: { error: { message: string } | null }) => unknown) =>
      Promise.resolve(resolve({ error })),
  };
  return chain;
}

function createSelectChain(table: string, tableResponses: Record<string, TableResponse>) {
  const chain = {
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    order: vi.fn(async () => tableResponses[table] ?? { data: [], error: null }),
    then: (resolve: (value: TableResponse) => unknown) =>
      Promise.resolve(resolve(tableResponses[table] ?? { data: [], error: null })),
  };
  return chain;
}

function createClientMock(options?: MockOptions) {
  const tableResponses = options?.tableResponses ?? {};
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    },
    from: vi.fn((table: string) => ({
      upsert: vi.fn(async () => ({ error: options?.upsertError ?? null })),
      delete: vi.fn(() => createDeleteChain(options?.deleteError ?? null)),
      select: vi.fn(() => createSelectChain(table, tableResponses)),
    })),
  };
}

function authorize(client = createClientMock()) {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue({
    client: client as never,
    userId: 'user-1',
  });
  return client;
}

function installMemoryStorage() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  });
}

describe('syncService', () => {
  beforeEach(() => {
    installMemoryStorage();
    authorize();
    vi.mocked(getSyncAccess).mockResolvedValue({
      state: 'linked',
      client: createClientMock() as never,
      userId: 'user-1',
      binding: {
        id: 'ledger-binding',
        syncOwnerUserId: 'user-1',
        linkedAt: '2026-05-18T00:00:00.000Z',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error test cleanup
    delete globalThis.window;
    // @ts-expect-error test cleanup
    delete globalThis.localStorage;
  });

  it('queues failed upserts for retry', async () => {
    authorize(createClientMock({ upsertError: { message: 'upsert failed' } }));

    await pushRecord('balances', {
      id: 'TRY-cash',
      currency: 'TRY',
      method: 'cash',
      amount: 12,
      updatedAt: '2026-05-18T00:00:00.000Z',
    });

    const queue = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) ?? '[]') as Array<{
      operation: string;
      recordId: string;
    }>;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ operation: 'upsert', recordId: 'TRY-cash' });
  });

  it('processes retry queue successfully', async () => {
    localStorage.setItem(
      RETRY_QUEUE_KEY,
      JSON.stringify([
        {
          tableName: 'balances',
          operation: 'upsert',
          recordId: 'TRY-cash',
          record: { id: 'TRY-cash', amount: 100, currency: 'TRY', method: 'cash', updatedAt: '2026-05-18' },
          attempts: 0,
          lastAttempt: 0,
        },
      ])
    );

    authorize();

    await processRetryQueue();

    const queue = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) ?? '[]');
    expect(queue).toEqual([]);
  });

  it('does not advance sync cursor when any table pull fails', async () => {
    const initialSync = '2026-05-18T00:00:00.000Z';
    localStorage.setItem(SYNC_CURSOR_KEY, initialSync);

    authorize(
      createClientMock({
        tableResponses: {
          balances: { data: null, error: { message: 'read failed' } },
        },
      })
    );

    await pullUpdates();

    expect(localStorage.getItem(SYNC_CURSOR_KEY)).toBe(initialSync);
  });

  it('reports sync status from auth, cursors, and retry queue', async () => {
    localStorage.setItem(SYNC_CURSOR_KEY, '2026-05-18T00:00:00.000Z');
    localStorage.setItem(PUSH_CURSOR_KEY, '2026-05-18T01:00:00.000Z');
    localStorage.setItem(
      RETRY_QUEUE_KEY,
      JSON.stringify([
        {
          tableName: 'balances',
          operation: 'upsert',
          recordId: 'TRY-cash',
          record: { id: 'TRY-cash' },
          attempts: 0,
          lastAttempt: 0,
        },
      ])
    );

    await expect(getSyncStatus()).resolves.toMatchObject({
      authenticated: true,
      userId: 'user-1',
      lastSyncAt: '2026-05-18T00:00:00.000Z',
      lastPushAt: '2026-05-18T01:00:00.000Z',
      pendingRetryCount: 1,
      online: true,
    });
  });

  it('performs no remote work when the ledger is not authorized for sync', async () => {
    vi.mocked(requireLinkedSyncAccess).mockResolvedValue(null);
    const client = createClientMock();

    await pushRecord('balances', { id: 'TRY-cash', updatedAt: '2026-05-18' });
    await processRetryQueue();
    await pullUpdates();

    expect(client.from).not.toHaveBeenCalled();
    expect(localStorage.getItem(RETRY_QUEUE_KEY)).toBeNull();
  });

  it('keeps destructive remote snapshot replacement disabled', async () => {
    await expect(syncAllLocalData()).rejects.toThrow('Remote snapshot replacement is disabled');
  });
});
