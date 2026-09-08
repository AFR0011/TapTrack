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
  SyncOutboxItem,
  Transaction,
} from '@/types';
import {
  DEFAULT_SETTINGS_ID,
  createDefaultCategories,
  createDefaultSettings,
} from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';

export class TapTrackDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  balances!: Table<Balance, string>;
  balanceCheckpoints!: Table<BalanceCheckpoint, string>;
  categories!: Table<Category, string>;
  monthlyBudgets!: Table<MonthlyBudget, string>;
  categoryBudgets!: Table<CategoryBudget, string>;
  recurringTransactions!: Table<RecurringTransaction, string>;
  conversions!: Table<Conversion, string>;
  settings!: Table<Settings, string>;
  deviceMetadata!: Table<DeviceMetadata, string>;
  syncOutbox!: Table<SyncOutboxItem, string>;

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
    this.version(2).stores({ conversions: 'id, date, fromCurrency, toCurrency, fromMethod, toMethod' });
    this.version(3).stores({ deviceMetadata: 'id' });
    this.version(4)
      .stores({ balanceCheckpoints: 'id, balanceId, kind, month, effectiveAt' })
      .upgrade(async (transaction) => {
        const settings = (await transaction.table('settings').get(DEFAULT_SETTINGS_ID)) as Settings | undefined;
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

    this.version(5)
      .stores({ syncOutbox: 'id, tableName, recordId, operation, queuedAt' })
      .upgrade(async (transaction) => {
        const binding = (await transaction.table('deviceMetadata').get('ledger-binding')) as DeviceMetadata | undefined;
        if (!binding) return;
        const outbox = transaction.table('syncOutbox');
        const tableNames = [
          'transactions', 'balanceCheckpoints', 'categories', 'monthlyBudgets',
          'categoryBudgets', 'recurringTransactions', 'conversions', 'settings',
        ] as const;
        const queuedAt = new Date().toISOString();

        for (const tableName of tableNames) {
          const rows = (await transaction.table(tableName).toArray()) as Array<Record<string, unknown>>;
          for (const row of rows) {
            if (typeof row.id !== 'string' || row.id.length === 0) continue;
            const item: SyncOutboxItem = {
              id: `${tableName}:${row.id}`,
              operationId: crypto.randomUUID(),
              tableName,
              operation: 'upsert',
              recordId: row.id,
              record: row,
              queuedAt,
              attempts: 0,
            };
            await outbox.put(item);
          }
        }
      });
  }
}

export const db = new TapTrackDatabase();

export async function ensureDatabaseSeeded(database: TapTrackDatabase = db) {
  const now = new Date().toISOString();

  await database.transaction('rw', database.categories, database.settings, async () => {
    const existingCategories = await database.categories.toArray();
    const existingCategoryIds = new Set(existingCategories.map((category) => category.id));
    const missingCategories = createDefaultCategories(now).filter(
      (category) => !existingCategoryIds.has(category.id)
    );
    if (missingCategories.length > 0) await database.categories.bulkPut(missingCategories);

    const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
    if (!settings) await database.settings.put(createDefaultSettings(now));
  });
}
