import Dexie, { type Table } from 'dexie';
import type {
  Balance,
  BalanceCheckpoint,
  Category,
  CategoryBudget,
  Conversion,
  DeviceMetadata,
  MonthlyBudget,
  RecurringTransaction,
  Settings,
  Transaction,
} from '@/types';
import {
  DEFAULT_SETTINGS_ID,
  createDefaultCategories,
  createDefaultSettings,
  createInitialBalances,
} from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';

export class TapTrackDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  /** Derived local cache. Never treat this table as authoritative sync state. */
  balances!: Table<Balance, string>;
  balanceCheckpoints!: Table<BalanceCheckpoint, string>;
  categories!: Table<Category, string>;
  monthlyBudgets!: Table<MonthlyBudget, string>;
  categoryBudgets!: Table<CategoryBudget, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  conversions!: Table<Conversion, string>;
  settings!: Table<Settings, string>;
  deviceMetadata!: Table<DeviceMetadata, string>;

  constructor(name = 'TapTrackDB') {
    super(name);
    this.version(1).stores({
      transactions: 'id, type, date, categoryId, method, currency, recurringSourceId',
      balances: 'id, currency, method',
      categories: 'id, name, type',
      monthlyBudgets: 'id, month',
      categoryBudgets: 'id, month, categoryId',
      recurringTransactions: 'id, nextRunDate, isActive',
      conversions: 'id, date, fromCurrency, toCurrency',
      settings: 'id',
    });
    // Version 2: conversions gain fromMethod + toMethod (replaces single method field).
    // No index change needed; Dexie will keep existing records as-is.
    this.version(2).stores({
      conversions: 'id, date, fromCurrency, toCurrency, fromMethod, toMethod',
    });
    // Version 3 adds device-only metadata. It is intentionally excluded from
    // finance sync, backup/import, and normal ledger reset.
    this.version(3).stores({
      deviceMetadata: 'id',
    });
    // Version 4 introduces authoritative absolute balance checkpoints. Existing
    // completed installations snapshot their current balance cache exactly once
    // so the migration does not replay historical transactions on top of it.
    this.version(4)
      .stores({
        balanceCheckpoints: 'id, balanceId, kind, month, effectiveAt',
      })
      .upgrade(async (transaction) => {
        const settings = (await transaction.table('settings').get(DEFAULT_SETTINGS_ID)) as
          | Settings
          | undefined;
        if (!settings?.setupCompleted) return;

        const checkpointTable = transaction.table('balanceCheckpoints');
        if ((await checkpointTable.count()) > 0) return;

        const balances = (await transaction.table('balances').toArray()) as Balance[];
        if (balances.length === 0) return;

        const nowDate = new Date();
        const now = nowDate.toISOString();
        const date = formatLocalDate(nowDate);
        const month = getCurrentMonth(nowDate);
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

        await checkpointTable.bulkPut(checkpoints);
      });
  }
}

export const db = new TapTrackDatabase();

export async function ensureDatabaseSeeded(database: TapTrackDatabase = db) {
  const now = new Date().toISOString();

  await database.transaction('rw', database.categories, database.balances, database.settings, async () => {
    const categoryCount = await database.categories.count();
    if (categoryCount === 0) {
      await database.categories.bulkPut(createDefaultCategories(now));
    }

    const existingBalances = await database.balances.toArray();
    const existingBalanceIds = new Set(existingBalances.map((balance) => balance.id));
    const missingBalances = createInitialBalances(now).filter(
      (balance) => !existingBalanceIds.has(balance.id)
    );

    if (missingBalances.length > 0) {
      await database.balances.bulkPut(missingBalances);
    }

    const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
    if (!settings) {
      await database.settings.put(createDefaultSettings(now));
    }
  });
}
