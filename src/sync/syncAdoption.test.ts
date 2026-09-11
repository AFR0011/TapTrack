import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';

vi.mock('@/lib/supabase', () => ({ createSupabaseBrowserClient: vi.fn() }));
vi.mock('@/sync/syncBinding', async () => {
  const actual = await vi.importActual<typeof import('@/sync/syncBinding')>('@/sync/syncBinding');
  return {
    ...actual,
    inspectDeviceLedgerLinkToCurrentUser: vi.fn(),
    linkDeviceLedgerToCurrentUser: vi.fn(),
    prepareDeviceLedgerBindingToCurrentUser: vi.fn(),
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
  prepareDeviceLedgerBindingToCurrentUser,
} from '@/sync/syncBinding';
import { pullUpdates, pushLocalChanges, pushRecord } from '@/sync/syncService';
import { adoptCloudLedger, linkEmptyCloudLedger, mergeLocalLedgerIntoCloud } from './syncAdoption';

type CloudClientOptions = {
  failedTable?: string;
  tableData?: Record<string, unknown[]>;
};

const claimGeneration = '123e4567-e89b-42d3-a456-426614174000';

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
  let database: RavelDatabase;

  beforeEach(async () => {
    database = new RavelDatabase(`ravel-adoption-${crypto.randomUUID()}`);
    await ensureDatabaseSeeded(database);
    vi.mocked(inspectDeviceLedgerLinkToCurrentUser).mockResolvedValue({
      state: 'merge-choice',
      userId: 'user-1',
      localHasUserData: true,
      remoteHasData: true,
    });
    vi.mocked(prepareDeviceLedgerBindingToCurrentUser).mockResolvedValue({
      id: DEVICE_LEDGER_BINDING_ID,
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-09-07T00:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: '11111111-1111-4111-8111-111111111111',
    });
    vi.mocked(linkDeviceLedgerToCurrentUser).mockResolvedValue({
      id: DEVICE_LEDGER_BINDING_ID,
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-09-07T00:00:00.000Z',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ revision: 1, generation: claimGeneration }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
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
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
    expect(prepareDeviceLedgerBindingToCurrentUser).not.toHaveBeenCalled();
  });

  it('leaves the local ledger untouched when the pre-replacement safety step fails', async () => {
    await database.transactions.add({
      id: 'local-before-replace',
      type: 'expense',
      amount: 45,
      currency: 'TRY',
      title: 'keep me safe',
      categoryId: 'cat-other',
      method: 'card',
      date: '2026-09-07',
      createdAt: '2026-09-07T11:00:00.000Z',
      updatedAt: '2026-09-07T11:00:00.000Z',
    });
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(createCloudClient() as never);
    const beforeReplace = vi.fn(async () => {
      await expect(database.transactions.get('local-before-replace')).resolves.toBeDefined();
      await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
      throw new Error('safety backup failed');
    });

    await expect(adoptCloudLedger(database, beforeReplace)).rejects.toThrow('safety backup failed');

    expect(beforeReplace).toHaveBeenCalledTimes(1);
    await expect(database.transactions.get('local-before-replace')).resolves.toBeDefined();
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
  });

  it('rolls back both the binding and canonical replacement when adoption fails mid-transaction', async () => {
    await database.transactions.add({
      id: 'local-survivor',
      type: 'income',
      amount: 75,
      currency: 'TRY',
      title: 'local survivor',
      categoryId: 'cat-income',
      method: 'cash',
      date: '2026-09-07',
      createdAt: '2026-09-07T09:00:00.000Z',
      updatedAt: '2026-09-07T09:00:00.000Z',
    });
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createCloudClient({
        tableData: {
          transactions: [
            {
              user_id: 'user-1',
              type: 'expense',
              amount: 20,
              currency: 'TRY',
              title: 'invalid missing id',
              category_id: 'cat-other',
              method: 'card',
              date: '2026-09-07',
              created_at: '2026-09-07T12:00:00.000Z',
              updated_at: '2026-09-07T12:00:00.000Z',
              deleted_at: null,
            },
          ],
        },
      }) as never
    );

    await expect(adoptCloudLedger(database)).rejects.toThrow();

    await expect(database.transactions.get('local-survivor')).resolves.toBeDefined();
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
  });

  it('repairs only seed rows missing from a legacy cloud snapshot and binds atomically', async () => {
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

    expect(prepareDeviceLedgerBindingToCurrentUser).toHaveBeenCalledWith(database, 'use-cloud');
    expect(linkDeviceLedgerToCurrentUser).not.toHaveBeenCalled();
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toMatchObject({
      syncOwnerUserId: 'user-1',
      cloudRevision: 1,
    });
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

  it('claims and seeds an empty account before persisting the local binding', async () => {
    await linkEmptyCloudLedger(database);

    expect(prepareDeviceLedgerBindingToCurrentUser).toHaveBeenCalledWith(database, 'empty-only');
    expect(linkDeviceLedgerToCurrentUser).not.toHaveBeenCalledWith(database, 'empty-only');
    expect(fetch).toHaveBeenCalledWith(
      '/api/sync/claim-empty-ledger',
      expect.objectContaining({ method: 'POST' })
    );
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toMatchObject({
      syncOwnerUserId: 'user-1',
      cloudRevision: 1,
      cloudGeneration: claimGeneration,
    });
    expect(pushLocalChanges).toHaveBeenCalledWith(database);
    expect(pullUpdates).toHaveBeenCalledWith(database);
  });

  it('stays unbound when another device wins the empty-account claim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error:
              'This account already has cloud data. Choose whether to use the cloud ledger or merge this device before linking.',
            revision: 1,
            generation: claimGeneration,
          }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    await expect(linkEmptyCloudLedger(database)).rejects.toThrow('already has cloud data');

    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
    expect(pushLocalChanges).not.toHaveBeenCalled();
    expect(pullUpdates).not.toHaveBeenCalled();
  });
});
