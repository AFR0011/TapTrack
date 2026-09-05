import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase } from '@/database';

vi.mock('@/lib/supabase', () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

import { createSupabaseBrowserClient } from '@/lib/supabase';
import {
  DEVICE_LEDGER_BINDING_ID,
  REMOTE_FINANCE_TABLES,
  getSyncAccess,
  linkDeviceLedgerToCurrentUser,
} from './syncBinding';

function createClient(options?: {
  userId?: string | null;
  nonEmptyTable?: string;
  failedTable?: string;
}) {
  const userId = options?.userId === undefined ? 'user-1' : options.userId;
  const from = vi.fn((tableName: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      limit: vi.fn(async () => ({
        data: options?.nonEmptyTable === tableName ? [{ id: 'remote-row' }] : [],
        error: options?.failedTable === tableName ? { message: 'read failed' } : null,
      })),
    };
    return chain;
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
    from,
  };
}

describe('device ledger sync binding', () => {
  let database: TapTrackDatabase;

  beforeEach(() => {
    database = new TapTrackDatabase(`taptrack-binding-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await database.delete();
  });

  it('reports an unconfigured provider without creating a fake client', async () => {
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(null);

    await expect(getSyncAccess(database)).resolves.toMatchObject({
      state: 'provider-unconfigured',
      client: null,
      userId: null,
    });
  });

  it('links once only after every remote table is confirmed empty', async () => {
    const client = createClient();
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(client as never);

    const binding = await linkDeviceLedgerToCurrentUser(database);

    expect(binding.syncOwnerUserId).toBe('user-1');
    expect(client.from).toHaveBeenCalledTimes(REMOTE_FINANCE_TABLES.length);
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toEqual(binding);

    const repeated = await linkDeviceLedgerToCurrentUser(database);
    expect(repeated).toEqual(binding);
    expect(client.from).toHaveBeenCalledTimes(REMOTE_FINANCE_TABLES.length);
  });

  it('refuses non-empty or failed remote preflight without creating a binding', async () => {
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createClient({ nonEmptyTable: 'transactions' }) as never
    );
    await expect(linkDeviceLedgerToCurrentUser(database)).rejects.toThrow('already has cloud data');
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();

    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createClient({ failedTable: 'balances' }) as never
    );
    await expect(linkDeviceLedgerToCurrentUser(database)).rejects.toThrow('could not be checked');
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toBeUndefined();
  });

  it('keeps the first binding immutable and reports account mismatch', async () => {
    await database.deviceMetadata.add({
      id: DEVICE_LEDGER_BINDING_ID,
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-05-18T00:00:00.000Z',
    });
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(
      createClient({ userId: 'user-2' }) as never
    );

    await expect(getSyncAccess(database)).resolves.toMatchObject({
      state: 'account-mismatch',
      userId: 'user-2',
    });
    await expect(linkDeviceLedgerToCurrentUser(database)).rejects.toThrow('different account');
    await expect(database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID)).resolves.toMatchObject({
      syncOwnerUserId: 'user-1',
    });
  });
});
