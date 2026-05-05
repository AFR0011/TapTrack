import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBalanceId } from '@/defaultData';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { completeInitialSetup } from './setupService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

describe('completeInitialSetup', () => {
  it('funds balances, stores a monthly budget, and marks setup complete', async () => {
    await completeInitialSetup(
      {
        balances: {
          TRY: { cash: 500, card: 1000 },
          USD: { cash: 20, card: 30 },
          EUR: { cash: 10, card: 15 },
        },
        monthlyBudget: 20000,
        defaultMethod: 'cash',
        month: '2026-05',
      },
      database
    );

    const settings = await database.settings.get('default');
    const tryCash = await database.balances.get(getBalanceId('TRY', 'cash'));
    const budget = await database.monthlyBudgets.where('month').equals('2026-05').first();

    expect(settings?.setupCompleted).toBe(true);
    expect(settings?.lastUsedMethod).toBe('cash');
    expect(tryCash?.amount).toBe(500);
    expect(budget?.totalBudget).toBe(20000);
  });
});
