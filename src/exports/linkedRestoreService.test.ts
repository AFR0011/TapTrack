import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { exportBackupJSON } from '@/exports/backupService';
import { getSyncAccess } from '@/sync/syncBinding';
import { restoreOnlyThisDevice, restoreSyncedAccount } from './linkedRestoreService';

vi.mock('@/sync/syncBinding', () => ({ getSyncAccess: vi.fn() }));

let database: RavelDatabase;
let source: RavelDatabase;

const binding = {
  id: 'ledger-binding',
  syncOwnerUserId: 'user-1',
  linkedAt: '2026-09-08T05:00:00.000Z',
  cloudRevision: 1,
  cloudGeneration: '123e4567-e89b-42d3-a456-426614174000',
};

beforeEach(async () => {
  database = new RavelDatabase(`RavelLinkedRestore-${crypto.randomUUID()}`);
  source = new RavelDatabase(`RavelLinkedRestoreSource-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
  await ensureDatabaseSeeded(source);
  await database.deviceMetadata.put(binding);
  await database.categories.put({
    id: 'cat-local-extra',
    name: 'Local extra',
    type: 'expense',
    isDefault: false,
    createdAt: '2026-09-08T05:00:00.000Z',
    updatedAt: '2026-09-08T05:00:00.000Z',
  });
  vi.mocked(getSyncAccess).mockResolvedValue({
    state: 'linked',
    client: {} as never,
    userId: 'user-1',
    binding,
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await database.delete();
  await source.delete();
});

describe('linked restore coordinator', () => {
  it('aborts device-only restore if the safety backup cannot be persisted', async () => {
    const backup = await exportBackupJSON(source);
    await expect(
      restoreOnlyThisDevice(backup, () => {
        throw new Error('download failed');
      }, database)
    ).rejects.toThrow('download failed');

    expect(await database.deviceMetadata.get('ledger-binding')).toEqual(binding);
    expect(await database.categories.get('cat-local-extra')).toBeDefined();
  });

  it('restores only this device and atomically detaches the cloud binding', async () => {
    const backup = await exportBackupJSON(source);
    const safety = vi.fn();
    await restoreOnlyThisDevice(backup, safety, database);

    expect(safety).toHaveBeenCalledTimes(1);
    expect(await database.deviceMetadata.get('ledger-binding')).toBeUndefined();
    expect(await database.categories.get('cat-local-extra')).toBeUndefined();
    expect(await database.categories.count()).toBe(6);
  });

  it('leaves local data and binding untouched when account restore fails remotely', async () => {
    const backup = await exportBackupJSON(source);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'remote failed' }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    )));

    await expect(restoreSyncedAccount(backup, () => undefined, database)).rejects.toThrow(
      'Local data was not changed'
    );
    expect(await database.deviceMetadata.get('ledger-binding')).toEqual(binding);
    expect(await database.categories.get('cat-local-extra')).toBeDefined();
  });

  it('replaces local state and stamps the new account generation after cloud restore', async () => {
    const backup = await exportBackupJSON(source);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        revision: 2,
        generation: '123e4567-e89b-42d3-b456-426614174001',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )));

    await restoreSyncedAccount(backup, () => undefined, database);

    expect(await database.categories.get('cat-local-extra')).toBeUndefined();
    expect(await database.deviceMetadata.get('ledger-binding')).toMatchObject({
      syncOwnerUserId: 'user-1',
      cloudRevision: 2,
      cloudGeneration: '123e4567-e89b-42d3-b456-426614174001',
    });
    expect(await database.syncOutbox.count()).toBe(0);
  });
});
