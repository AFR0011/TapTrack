import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';

vi.mock('@/lib/supabase', () => ({ createSupabaseBrowserClient: vi.fn() }));
vi.mock('@/sync/syncBinding', async () => {
  const actual = await vi.importActual<typeof import('@/sync/syncBinding')>('@/sync/syncBinding');
  return {
    ...actual,
    inspectDeviceLedgerLinkToCurrentUser: vi.fn(),
    linkDeviceLedgerToCurrentUser: vi.fn(),
  };
});
vi.mock('@/sync/syncService', async () => {
  const actual = await vi.importActual<typeof import('@/sync/syncService')>('@/sync/syncService');
  return {
    ...actual,
    pushRecord: vi.fn(),
    pushLocalChanges: vi.fn(),
    pullUpdates: vi.fn(),
  };
});

import { createSupabaseBrowserClient } from '@/lib/supabase';
import {
  inspectDeviceLedgerLinkToCurrentUser,
  linkDeviceLedgerToCurrentUser,
} from '@/sync/syncBinding';
import { pullUpdates, pushLocalChanges, pushRecord } from '@/sync/syncService';
import { adoptCloudLedger, linkEmptyCloudLedger, mergeLocalLedgerIntoCloud } from './syncAdoption';

type CloudClientOptions = {
  failedTable?: string;
  tableData?: Record<string, unknown[]>;
};

function createCloudClient(options: CloudClientOptions = {}) {
  return {
    from: vi.fn((tableName: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(async () => ({
          data: options.tableData?.[tableName] ?? [],
          error: options.failedTable === tableName ? { message: 'network read failed' } : null,
        })),
      };
      return chain;
    }),
  };
}

describe('cloud ledger adoption', () => {
  let database: TapTrackDatabase;

  beforeEach(async () => {
    database = new TapTrackDatabase(`taptrack-adoption-${crypto.randomUUID()}`);
    await ensureDatabaseSeeded(database);
    vi.mocked(inspectDeviceLedgerLinkToCurrentUser).mockResolvedValue({
      state: 'merge-choice',
      userId: 'user-1',
      localHasUserData: true,
      remoteHasData: true,
    });
    vi.mocked(linkDeviceLedgerToCurrentUser).mockResolvedValue({
      id: DEVICE_LEDGER_BINDING_ID,
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-09-07T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await database.delete();
  });

  it('does not bind or clear local data when a cloud snapshot cannot be fully validated', async () => {
    await database.transactions.add({
      id: 'local-transaction',
      type: 'income',
      amount: 100,
      currency: 'TRY',
      title: 'local',
      categoryId: 'cat-income',
      method: 'cash',
      date: '2026-09-07',
      createdAt: '2026-09-07T10:00:00.000Z',
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createCloudClient({ failedTable: 'categories' }) as never
    );

    await expect(adoptCloudLedger(database)).rejects.toThrow('categories');
    await expect(database.transactions.get('local-transaction')).resolves.toBeDefined();
    expect(linkDeviceLedgerToCurrentUser).not.toHaveBeenCalled();
  });

  it('repairs only seed rows missing from a legacy cloud snapshot', async () => {
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createCloudClient({
        tableData: {
          transactions: [
            {
              user_id: 'user-1',
              id: 'cloud-transaction',
              type: 'expense',
              amount: 25,
              currency: 'TRY',
              title: 'Cloud lunch',
              category_id: 'cat-food',
              method: 'card',
              date: '2026-09-07',
              occurred_at: '2026-09-07T12:00:00.000Z',
              created_at: '2026-09-07T12:00:00.000Z',
              updated_at: '2026-09-07T12:00:00.000Z',
              deleted_at: null,
            },
          ],
          categories: [
            {
              user_id: 'user-1',
              id: 'cat-food',
              name: 'Meals',
              icon: 'utensils',
              color: '#16a34a',
              is_default: true,
              type: 'expense',
              created_at: '2026-09-01T00:00:00.000Z',
              updated_at: '2026-09-02T00:00:00.000Z',
              deleted_at: null,
            },
          ],
          settings: [],
        },
      }) as never
    );

    await adoptCloudLedger(database);

    expect(linkDeviceLedgerToCurrentUser).toHaveBeenCalledWith(database, 'use-cloud');
    await expect(database.transactions.get('cloud-transaction')).resolves.toBeDefined();
    await expect(database.categories.get('cat-food')).resolves.toMatchObject({ name: 'Meals' });
    await expect(database.categories.get('cat-other')).resolves.toMatchObject({ name: 'Other' });
    await expect(database.settings.get('default')).resolves.toMatchObject({ setupCompleted: true });

    const repairedIds = vi.mocked(pushRecord).mock.calls.map(([, record]) => record.id);
    expect(new Set(repairedIds)).toEqual(
      new Set([
        'cat-rent',
        'cat-subscriptions',
        'cat-fun',
        'cat-other',
        'cat-income',
        'default',
      ])
    );
    expect(repairedIds).not.toContain('cat-food');
    expect(repairedIds).not.toContain('cloud-transaction');
  });

  it('uses explicit merge mode before pushing and pulling', async () => {
    await mergeLocalLedgerIntoCloud(database);

    expect(linkDeviceLedgerToCurrentUser).toHaveBeenCalledWith(database, 'merge-local');
    expect(pushLocalChanges).toHaveBeenCalledWith(database);
    expect(pullUpdates).toHaveBeenCalledWith(database);
  });

  it('uses empty-only mode when creating the first cloud ledger', async () => {
    await linkEmptyCloudLedger(database);

    expect(linkDeviceLedgerToCurrentUser).toHaveBeenCalledWith(database, 'empty-only');
    expect(pushLocalChanges).toHaveBeenCalledWith(database);
    expect(pullUpdates).toHaveBeenCalledWith(database);
  });
});
