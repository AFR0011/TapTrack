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
  it('funds balances, creates opening checkpoints, stores a monthly budget, and marks setup complete', async () => {
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
    const tryCashId = getBalanceId('TRY', 'cash');
    const tryCash = await database.balances.get(tryCashId);
    const opening = await database.balanceCheckpoints.get(`opening-${tryCashId}`);
    const budget = await database.monthlyBudgets.where('month').equals('2026-05').first();

    expect(settings?.setupCompleted).toBe(true);
    expect(settings?.lastUsedMethod).toBe('cash');
    expect(tryCash?.amount).toBe(500);
    expect(opening).toMatchObject({
      balanceId: tryCashId,
      currency: 'TRY',
      method: 'cash',
      kind: 'opening',
      observedAmount: 500,
      deltaAmount: 500,
    });
    expect(await database.balanceCheckpoints.count()).toBe(6);
    expect(budget?.totalBudget).toBe(20000);
  });

  it('never allows initial balances to be set a second time', async () => {
    const input = {
      balances: {
        TRY: { cash: 500, card: 1000 },
        USD: { cash: 20, card: 30 },
        EUR: { cash: 10, card: 15 },
      },
      monthlyBudget: 20000,
      defaultMethod: 'cash' as const,
      month: '2026-05',
    };

    await completeInitialSetup(input, database);
    await expect(completeInitialSetup(input, database)).rejects.toThrow(
      'Initial balances are already locked'
    );

    expect(await database.balanceCheckpoints.count()).toBe(6);
    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(500);
  });
});
