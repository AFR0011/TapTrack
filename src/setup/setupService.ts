import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { createDefaultSettings, DEFAULT_SETTINGS_ID, getBalanceId } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { upsertMonthlyBudget } from '@/budgets/budgetService';
import type { Balance, Currency, Method, Settings } from '@/types';
import { pushRecord } from '@/sync/syncService';

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
  let seededBalances: Balance[] = [];
  let updatedSettings: Settings | null = null;

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
    seededBalances = balances;
    const existingSettings = (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
    const nextSettings: Settings = {
      ...existingSettings,
      id: DEFAULT_SETTINGS_ID,
      lastUsedMethod: input.defaultMethod,
      setupCompleted: true,
      updatedAt: now,
    };
    updatedSettings = nextSettings;
    await database.settings.put(nextSettings);
  });

  await upsertMonthlyBudget(
    {
      month,
      totalBudget: normalizeAmount(input.monthlyBudget),
      rolloverFromPreviousMonth: 0,
    },
    database
  );

  seededBalances.forEach((balance) => {
    void pushRecord('balances', balance as unknown as Record<string, unknown>, database);
  });
  if (updatedSettings) {
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>, database);
  }

  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  if (!settings) {
    throw new Error('Settings were not saved.');
  }
  return settings;
}

function normalizeAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
