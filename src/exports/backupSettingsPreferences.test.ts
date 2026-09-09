import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { completeInitialSetup } from '@/setup/setupService';
import { exportBackupJSON, restoreBackupJSON } from './backupService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackBackupPreferences-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
  await completeInitialSetup(
    {
      balances: {
        TRY: { cash: 100, card: 0 },
        USD: { cash: 25, card: 0 },
      },
      monthlyBudget: 500,
      defaultMethod: 'cash',
      defaultCurrency: 'TRY',
      month: '2026-09',
    },
    database,
    new Date('2026-09-01T09:00:00.000Z')
  );
});

afterEach(async () => {
  await database.delete();
});

describe('B006 backup settings preferences', () => {
  it('round-trips active currencies and Smart Categories sub-settings', async () => {
    await database.settings.update('default', {
      activeCurrencies: ['TRY', 'USD'],
      aiCategorizationEnabled: true,
      aiAutoCategorizationEnabled: false,
      aiRecommendNewCategoriesEnabled: true,
    });

    const backup = await exportBackupJSON(database, new Date('2026-09-09T00:00:00.000Z'));
    const exported = JSON.parse(backup) as { settings: Array<Record<string, unknown>> };
    expect(exported.settings[0]).toMatchObject({
      activeCurrencies: ['TRY', 'USD'],
      aiCategorizationEnabled: true,
      aiAutoCategorizationEnabled: false,
      aiRecommendNewCategoriesEnabled: true,
    });

    await database.settings.update('default', {
      activeCurrencies: ['TRY'],
      aiCategorizationEnabled: false,
      aiAutoCategorizationEnabled: true,
      aiRecommendNewCategoriesEnabled: false,
    });

    await restoreBackupJSON(backup, database, { now: new Date('2026-09-10T00:00:00.000Z') });
    await expect(database.settings.get('default')).resolves.toMatchObject({
      activeCurrencies: ['TRY', 'USD'],
      aiCategorizationEnabled: true,
      aiAutoCategorizationEnabled: false,
      aiRecommendNewCategoriesEnabled: true,
    });
  });

  it('accepts older v2 backups without the new optional preference fields', async () => {
    const backup = JSON.parse(await exportBackupJSON(database));
    delete backup.settings[0].activeCurrencies;
    delete backup.settings[0].aiAutoCategorizationEnabled;
    delete backup.settings[0].aiRecommendNewCategoriesEnabled;

    await expect(restoreBackupJSON(JSON.stringify(backup), database)).resolves.toMatchObject({
      source: 'v2',
    });
  });

  it('rejects an active-currency list that omits the default currency', async () => {
    const backup = JSON.parse(await exportBackupJSON(database));
    backup.settings[0].activeCurrencies = ['USD'];

    await expect(restoreBackupJSON(JSON.stringify(backup), database)).rejects.toThrow(
      'activeCurrencies must include the default currency'
    );
  });
});
