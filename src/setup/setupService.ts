import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { createDefaultSettings, DEFAULT_SETTINGS_ID, getBalanceId } from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { getMonthlyBudgetId } from '@/budgets/budgetService';
import type {
  Balance,
  BalanceCheckpoint,
  Currency,
  Method,
  MonthlyBudget,
  Settings,
} from '@/types';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';

export type InitialSetupInput = {
  balances: Record<string, Record<Method, number>>;
  monthlyBudget: number;
  defaultMethod: Method;
  /** Optional only for legacy callers/backups. New onboarding always provides it. */
  defaultCurrency?: Currency;
  month?: string;
};

export async function completeInitialSetup(
  input: InitialSetupInput,
  database: TapTrackDatabase = db,
  nowDate = new Date()
): Promise<Settings> {
  await ensureDatabaseSeeded(database);

  const existingSettings = await database.settings.get(DEFAULT_SETTINGS_ID);
  if (existingSettings?.setupCompleted) {
    throw new Error('Initial balances are already locked. Use monthly reconciliation instead.');
  }

  const defaultCurrency = input.defaultCurrency ?? 'TRY';
  if (!/^[A-Z]{3}$/.test(defaultCurrency) || !input.balances[defaultCurrency]) {
    throw new Error('Choose a valid default currency from your active currencies.');
  }

  const now = nowDate.toISOString();
  const date = formatLocalDate(nowDate);
  const month = input.month ?? getCurrentMonth(nowDate);

  const balances: Balance[] = Object.entries(input.balances).flatMap(([currency, methods]) =>
    Object.entries(methods).map(([method, amount]) => ({
      id: getBalanceId(currency, method as Method),
      currency,
      method: method as Method,
      amount: normalizeAmount(amount),
      updatedAt: now,
    }))
  );

  const checkpoints: BalanceCheckpoint[] = balances.map((balance) => ({
    id: `opening-${balance.id}`,
    balanceId: balance.id,
    currency: balance.currency,
    method: balance.method,
    kind: 'opening',
    observedAmount: balance.amount,
    deltaAmount: balance.amount,
    date,
    effectiveAt: now,
    month,
    createdAt: now,
    updatedAt: now,
  }));

  const currentSettings = (await database.settings.get(DEFAULT_SETTINGS_ID)) ?? createDefaultSettings(now);
  const nextSettings: Settings = {
    ...currentSettings,
    id: DEFAULT_SETTINGS_ID,
    defaultCurrency,
    lastUsedMethod: input.defaultMethod,
    setupCompleted: true,
    updatedAt: now,
  };

  const monthlyBudget: MonthlyBudget = {
    id: getMonthlyBudgetId(month),
    month,
    totalBudget: normalizeAmount(input.monthlyBudget),
    rolloverFromPreviousMonth: 0,
    currency: defaultCurrency,
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction(
    'rw',
    [database.balances, database.balanceCheckpoints, database.settings, database.monthlyBudgets, database.syncOutbox],
    async () => {
      const settingsInTransaction = await database.settings.get(DEFAULT_SETTINGS_ID);
      if (settingsInTransaction?.setupCompleted) {
        throw new Error('Initial balances are already locked. Use monthly reconciliation instead.');
      }

      await database.balances.bulkPut(balances);
      await database.balanceCheckpoints.bulkAdd(checkpoints);
      await database.settings.put(nextSettings);
      await database.monthlyBudgets.put(monthlyBudget);

      for (const checkpoint of checkpoints) {
        await queueRecordForSync('balanceCheckpoints', checkpoint as unknown as Record<string, unknown>, database);
      }
      await queueRecordForSync('settings', nextSettings as unknown as Record<string, unknown>, database);
      await queueRecordForSync('monthlyBudgets', monthlyBudget as unknown as Record<string, unknown>, database);
    }
  );

  void flushSyncQueueBestEffort(database);
  return nextSettings;
}

function normalizeAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
