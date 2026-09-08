import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/exports/linkedRestoreService', () => ({
  restoreOnlyThisDevice: vi.fn(),
  restoreSyncedAccount: vi.fn(),
}));

import {
  createFreshLedgerBackup,
  resetOnlyThisDevice,
  resetSyncedAccount,
} from '@/exports/resetService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
} from '@/exports/linkedRestoreService';

describe('resetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a valid fresh canonical ledger with setup incomplete', () => {
    const now = new Date('2026-09-08T08:45:00.000Z');
    const backup = createFreshLedgerBackup(now);

    expect(backup.format).toBe('taptrack-backup');
    expect(backup.version).toBe(2);
    expect(backup.exportedAt).toBe(now.toISOString());
    expect(backup.transactions).toEqual([]);
    expect(backup.balanceCheckpoints).toEqual([]);
    expect(backup.monthlyBudgets).toEqual([]);
    expect(backup.categoryBudgets).toEqual([]);
    expect(backup.recurringTransactions).toEqual([]);
    expect(backup.conversions).toEqual([]);
    expect(backup.categories).toHaveLength(6);
    expect(backup.settings).toHaveLength(1);
    expect(backup.settings[0]).toMatchObject({
      id: 'default',
      defaultCurrency: 'TRY',
      lastUsedMethod: 'card',
      setupCompleted: false,
      aiCategorizationEnabled: false,
      darkModeEnabled: false,
    });
  });

  it('uses the device-only restore path so cloud data stays untouched', async () => {
    vi.mocked(restoreOnlyThisDevice).mockResolvedValue({
      source: 'v2',
      legacyMigrated: false,
      safetyBackup: '{}',
      restoredRecordCount: 7,
    });
    const beforeReplace = vi.fn();
    const database = {} as never;

    await resetOnlyThisDevice(
      beforeReplace,
      database,
      new Date('2026-09-08T08:45:00.000Z')
    );

    expect(restoreOnlyThisDevice).toHaveBeenCalledOnce();
    expect(restoreSyncedAccount).not.toHaveBeenCalled();
    const [jsonData, callback, dbArg] = vi.mocked(restoreOnlyThisDevice).mock.calls[0];
    expect(JSON.parse(jsonData)).toMatchObject({
      format: 'taptrack-backup',
      version: 2,
      transactions: [],
      balanceCheckpoints: [],
      settings: [{ setupCompleted: false }],
    });
    expect(callback).toBe(beforeReplace);
    expect(dbArg).toBe(database);
  });

  it('uses the generation-rotating account restore path for reset everywhere', async () => {
    vi.mocked(restoreSyncedAccount).mockResolvedValue({
      source: 'v2',
      legacyMigrated: false,
      safetyBackup: '{}',
      restoredRecordCount: 7,
    });
    const beforeReplace = vi.fn();
    const database = {} as never;

    await resetSyncedAccount(
      beforeReplace,
      database,
      new Date('2026-09-08T08:45:00.000Z')
    );

    expect(restoreSyncedAccount).toHaveBeenCalledOnce();
    expect(restoreOnlyThisDevice).not.toHaveBeenCalled();
    const [jsonData, callback, dbArg] = vi.mocked(restoreSyncedAccount).mock.calls[0];
    expect(JSON.parse(jsonData)).toMatchObject({
      format: 'taptrack-backup',
      version: 2,
      transactions: [],
      balanceCheckpoints: [],
      settings: [{ setupCompleted: false }],
    });
    expect(callback).toBe(beforeReplace);
    expect(dbArg).toBe(database);
  });
});
