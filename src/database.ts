import Dexie, { type Table } from 'dexie';
import type {
  Balance,
  Category,
  CategoryBudget,
  Conversion,
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

export class TapTrackDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  balances!: Table<Balance, string>;
  categories!: Table<Category, string>;
  monthlyBudgets!: Table<MonthlyBudget, string>;
  categoryBudgets!: Table<CategoryBudget, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  conversions!: Table<Conversion, string>;
  settings!: Table<Settings, string>;

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
