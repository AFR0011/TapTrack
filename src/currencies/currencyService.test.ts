import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import {
  createRecurringTransaction,
  resumeRecurringTransaction,
  updateRecurringTransaction,
} from '@/recurring/recurringService';
import { addActiveCurrency, removeActiveCurrency } from './currencyService';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
  await addActiveCurrency('USD', database, new Date(2026, 8, 1, 12, 0, 0));
});

afterEach(async () => {
  await database.delete();
});

const usdRule = {
  type: 'expense' as const,
  amount: 25,
  currency: 'USD' as const,
  title: 'Subscription',
  categoryId: 'cat-other',
  method: 'card' as const,
  frequency: 'monthly' as const,
  startDate: '2026-09-05',
  nextRunDate: '2026-09-05',
  isActive: true,
};

describe('currency archival integrity', () => {
  it('blocks removing a currency while an active recurring rule still uses it', async () => {
    await createRecurringTransaction(usdRule, database);

    await expect(removeActiveCurrency('USD', database)).rejects.toThrow(
      'Pause or move active recurring rules in USD before removing this currency.'
    );

    const settings = await database.settings.get('settings');
    expect(settings?.activeCurrencies).toContain('USD');
  });

  it('allows an archived currency to keep a paused rule but blocks resuming it', async () => {
    const recurring = await createRecurringTransaction(usdRule, database);
    await updateRecurringTransaction(recurring.id, { isActive: false }, database);

    const settings = await removeActiveCurrency('USD', database);
    expect(settings.activeCurrencies).not.toContain('USD');
    await expect(
      resumeRecurringTransaction(recurring.id, new Date(2026, 8, 6, 12, 0, 0), database)
    ).rejects.toThrow('Add USD back to active currencies before using this recurring rule.');

    await expect(database.recurringTransactions.get(recurring.id)).resolves.toMatchObject({
      isActive: false,
      currency: 'USD',
    });
  });
});
