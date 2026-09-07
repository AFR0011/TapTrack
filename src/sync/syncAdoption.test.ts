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
    pushLocalChanges: vi.fn(),
    pullUpdates: vi.fn(),
  };
});

import { createSupabaseBrowserClient } from '@/lib/supabase';
import {
  inspectDeviceLedgerLinkToCurrentUser,
  linkDeviceLedgerToCurrentUser,
} from '@/sync/syncBinding';
import { pullUpdates, pushLocalChanges } from '@/sync/syncService';
import { adoptCloudLedger, linkEmptyCloudLedger, mergeLocalLedgerIntoCloud } from './syncAdoption';

function createCloudClient(options?: { failedTable?: string }) {
  return {
    from: vi.fn((tableName: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(async () => ({
          data: [],
          error: options?.failedTable === tableName ? { message: 'network read failed' } : null,
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
