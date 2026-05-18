import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

import { createSupabaseBrowserClient } from '@/lib/supabase';
import { processRetryQueue, pullUpdates, pushRecord } from './syncService';

const LAST_SYNC_KEY = 'taptrack_last_sync_at';
const RETRY_QUEUE_KEY = 'taptrack_retry_queue';

type TableResponse = { data: unknown[] | null; error: { message: string } | null };

function createClientMock(options?: {
  upsertError?: { message: string } | null;
  tableResponses?: Record<string, TableResponse>;
}) {
  const tableResponses = options?.tableResponses ?? {};
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    },
    from: vi.fn((table: string) => ({
      upsert: vi.fn(async () => ({ error: options?.upsertError ?? null })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        in: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
      select: vi.fn(() => ({
        gt: vi.fn(async () => tableResponses[table] ?? { data: [], error: null }),
      })),
    })),
  };
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
  });

  afterEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error test cleanup
    delete globalThis.window;
    // @ts-expect-error test cleanup
    delete globalThis.localStorage;
  });

  it('queues failed upserts for retry', async () => {
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createClientMock({ upsertError: { message: 'upsert failed' } }) as ReturnType<
        typeof createSupabaseBrowserClient
      >
    );

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

    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createClientMock() as ReturnType<typeof createSupabaseBrowserClient>
    );

    await processRetryQueue();

    const queue = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) ?? '[]');
    expect(queue).toEqual([]);
  });

  it('does not advance lastSyncAt when any table pull fails', async () => {
    const initialSync = '2026-05-18T00:00:00.000Z';
    localStorage.setItem(LAST_SYNC_KEY, initialSync);

    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createClientMock({
        tableResponses: {
          balances: { data: null, error: { message: 'read failed' } },
        },
      }) as ReturnType<typeof createSupabaseBrowserClient>
    );

    await pullUpdates();

    expect(localStorage.getItem(LAST_SYNC_KEY)).toBe(initialSync);
  });
});
