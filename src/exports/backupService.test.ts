import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { completeInitialSetup } from '@/setup/setupService';
import { createTransaction } from '@/transactions/createTransaction';
import { getBalanceId } from '@/defaultData';
import type { Currency, Method } from '@/types';
import {
  BackupValidationError,
  TAPTRACK_BACKUP_FORMAT,
  TAPTRACK_BACKUP_VERSION,
  exportBackupJSON,
  restoreBackupJSON,
} from './backupService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackBackupTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

async function setupLedger(tryCash = 500) {
  await completeInitialSetup(
    {
      balances: {
        TRY: { cash: tryCash, card: 0 },
        USD: { cash: 20, card: 0 },
        EUR: { cash: 0, card: 0 },
      },
      monthlyBudget: 1_000,
      defaultMethod: 'cash',
      month: '2026-05',
    },
    database,
    new Date('2026-05-01T09:00:00.000Z')
  );
}

async function addCoffee(amount: number, id: string, date = '2026-05-05') {
  return createTransaction(
    {
      type: 'expense',
      amount,
      currency: 'TRY',
      title: `coffee ${amount}`,
      categoryId: 'cat-food',
      method: 'cash',
      date,
    },
    database,
    new Date(`${date}T12:00:00.000Z`),
    id
  );
}

async function getBalance(currency: Currency, method: Method) {
  return database.balances.get(getBalanceId(currency, method));
}

describe('backupService', () => {
  it('exports a versioned canonical backup without derived/device-local state', async () => {
    await setupLedger();
    await addCoffee(120, 'coffee-original');
    await database.deviceMetadata.put({
      id: 'other-device-metadata',
      syncOwnerUserId: 'not-a-ledger-binding',
      linkedAt: '2026-05-06T00:00:00.000Z',
    });
    await database.settings.update('default', { lastSyncAt: '2026-05-06T12:00:00.000Z' });

    const parsed = JSON.parse(
      await exportBackupJSON(database, new Date('2026-05-07T00:00:00.000Z'))
    ) as Record<string, unknown>;

    expect(parsed.format).toBe(TAPTRACK_BACKUP_FORMAT);
    expect(parsed.version).toBe(TAPTRACK_BACKUP_VERSION);
    expect(parsed.exportedAt).toBe('2026-05-07T00:00:00.000Z');
    expect(Array.isArray(parsed.balanceCheckpoints)).toBe(true);
    expect(parsed).not.toHaveProperty('balances');
    expect(parsed).not.toHaveProperty('deviceMetadata');
    expect(parsed).not.toHaveProperty('syncOutbox');
    expect((parsed.settings as Array<Record<string, unknown>>)[0]).not.toHaveProperty('lastSyncAt');
  });

  it('restores by replacement, rebuilds balances, clears stale local outbox, and returns a pre-restore safety backup', async () => {
    await setupLedger();
    await addCoffee(120, 'coffee-original');
    const restorePoint = await exportBackupJSON(
      database,
      new Date('2026-05-06T00:00:00.000Z')
    );

    await addCoffee(50, 'coffee-after-backup', '2026-05-06');
    expect((await getBalance('TRY', 'cash'))?.amount).toBe(330);
    expect(await database.transactions.count()).toBe(2);
    expect(await database.syncOutbox.count()).toBeGreaterThan(0);

    let safetySnapshot = '';
    let countDuringSafetyCallback = -1;
    const result = await restoreBackupJSON(restorePoint, database, {
      now: new Date('2026-05-08T00:00:00.000Z'),
      beforeReplace: async (safetyBackup) => {
        safetySnapshot = safetyBackup;
        countDuringSafetyCallback = await database.transactions.count();
      },
    });

    expect(countDuringSafetyCallback).toBe(2);
    expect(JSON.parse(safetySnapshot).transactions).toHaveLength(2);
    expect(result.safetyBackup).toBe(safetySnapshot);
    expect(result.source).toBe('v2');
    expect(result.legacyMigrated).toBe(false);
    expect((await database.transactions.toArray()).map((item) => item.id)).toEqual([
      'coffee-original',
    ]);
    expect((await getBalance('TRY', 'cash'))?.amount).toBe(380);
    expect(await database.syncOutbox.count()).toBe(0);
  });

  it('does not mutate anything when safety-backup persistence fails', async () => {
    await setupLedger();
    await addCoffee(120, 'coffee-original');
    const restorePoint = await exportBackupJSON(database);
    await addCoffee(50, 'coffee-after-backup', '2026-05-06');

    await expect(
      restoreBackupJSON(restorePoint, database, {
        beforeReplace: () => {
          throw new Error('download failed');
        },
      })
    ).rejects.toThrow('download failed');

    expect(await database.transactions.count()).toBe(2);
    expect((await getBalance('TRY', 'cash'))?.amount).toBe(330);
  });

  it('rejects corrupt references before replacement and leaves the current ledger intact', async () => {
    await setupLedger();
    await addCoffee(120, 'coffee-original');
    const parsed = JSON.parse(await exportBackupJSON(database));
    parsed.transactions[0].categoryId = 'missing-category';
    const beforeReplace = vi.fn();

    await expect(
      restoreBackupJSON(JSON.stringify(parsed), database, { beforeReplace })
    ).rejects.toThrow(BackupValidationError);

    expect(beforeReplace).not.toHaveBeenCalled();
    expect(await database.transactions.count()).toBe(1);
    expect((await getBalance('TRY', 'cash'))?.amount).toBe(380);
  });

  it('rejects completed canonical backups that do not contain an opening checkpoint for every balance', async () => {
    await setupLedger();
    const parsed = JSON.parse(await exportBackupJSON(database));
    parsed.balanceCheckpoints = parsed.balanceCheckpoints.filter(
      (checkpoint: { balanceId: string }) => checkpoint.balanceId !== 'EUR-card'
    );

    await expect(restoreBackupJSON(JSON.stringify(parsed), database)).rejects.toThrow(
      'Completed backup is missing opening checkpoints for: EUR-card.'
    );
  });

  it('blocks restore on a cloud-linked ledger until restore scope is explicitly decided', async () => {
    await setupLedger();
    const backup = await exportBackupJSON(database);
    await database.deviceMetadata.put({
      id: 'ledger-binding',
      syncOwnerUserId: 'user-123',
      linkedAt: '2026-05-02T00:00:00.000Z',
    });

    await expect(restoreBackupJSON(backup, database)).rejects.toThrow(
      'Choose whether to restore the synced account or only this device'
    );
  });

  it('migrates an unversioned legacy backup into opening checkpoints without replaying historical activity', async () => {
    await setupLedger(500);
    await addCoffee(120, 'legacy-coffee');

    const legacyBackup = {
      transactions: await database.transactions.toArray(),
      balances: await database.balances.toArray(),
      categories: await database.categories.toArray(),
      monthlyBudgets: await database.monthlyBudgets.toArray(),
      categoryBudgets: await database.categoryBudgets.toArray(),
      recurringTransactions: await database.recurringTransactions.toArray(),
      conversions: await database.conversions.toArray(),
      settings: await database.settings.toArray(),
    };
    const expectedBalances = new Map(
      legacyBackup.balances.map((balance) => [balance.id, balance.amount])
    );

    await database.transactions.clear();
    await database.balanceCheckpoints.clear();
    await database.balances.clear();

    const result = await restoreBackupJSON(JSON.stringify(legacyBackup), database, {
      now: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(result.source).toBe('legacy');
    expect(result.legacyMigrated).toBe(true);
    expect(await database.transactions.count()).toBe(1);
    const checkpoints = await database.balanceCheckpoints.toArray();
    expect(checkpoints).toHaveLength(6);
    expect(checkpoints.every((checkpoint) => checkpoint.kind === 'opening')).toBe(true);

    for (const balance of await database.balances.toArray()) {
      expect(balance.amount).toBe(expectedBalances.get(balance.id));
    }
    expect((await getBalance('TRY', 'cash'))?.amount).toBe(380);
  });

  it('rejects a malformed legacy balance snapshot instead of guessing a baseline', async () => {
    await setupLedger();
    const legacyBackup = {
      transactions: await database.transactions.toArray(),
      balances: (await database.balances.toArray()).slice(0, 5),
      categories: await database.categories.toArray(),
      monthlyBudgets: await database.monthlyBudgets.toArray(),
      categoryBudgets: await database.categoryBudgets.toArray(),
      recurringTransactions: await database.recurringTransactions.toArray(),
      conversions: await database.conversions.toArray(),
      settings: await database.settings.toArray(),
    };

    await expect(restoreBackupJSON(JSON.stringify(legacyBackup), database)).rejects.toThrow(
      'Legacy backup must contain exactly one saved balance for every supported currency and payment method.'
    );
  });
});
