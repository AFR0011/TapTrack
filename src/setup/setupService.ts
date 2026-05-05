import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { DEFAULT_SETTINGS_ID, getBalanceId } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { upsertMonthlyBudget } from '@/budgets/budgetService';
import type { Balance, Currency, Method, Settings } from '@/types';

export type InitialSetupInput = {
  balances: Record<Currency, Record<Method, number>>;
  monthlyBudget: number;
  defaultMethod: Method;
  month?: string;
};

export async function completeInitialSetup(
  input: InitialSetupInput,
  database: TapTrackDatabase = db
): Promise<Settings> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  const month = input.month ?? getCurrentMonth();

  await database.transaction('rw', database.balances, database.settings, database.monthlyBudgets, async () => {
    const balances: Balance[] = Object.entries(input.balances).flatMap(([currency, methods]) =>
      Object.entries(methods).map(([method, amount]) => ({
        id: getBalanceId(currency as Currency, method as Method),
        currency: currency as Currency,
        method: method as Method,
        amount: normalizeAmount(amount),
        updatedAt: now,
      }))
    );

    await database.balances.bulkPut(balances);
    await database.settings.put({
      id: DEFAULT_SETTINGS_ID,
      defaultCurrency: 'TRY',
      lastUsedMethod: input.defaultMethod,
      setupCompleted: true,
      createdAt: (await database.settings.get(DEFAULT_SETTINGS_ID))?.createdAt ?? now,
      updatedAt: now,
    });
  });

  await upsertMonthlyBudget(
    {
      month,
      totalBudget: normalizeAmount(input.monthlyBudget),
      rolloverFromPreviousMonth: 0,
    },
    database
  );

  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  if (!settings) {
    throw new Error('Settings were not saved.');
  }
  return settings;
}

function normalizeAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
