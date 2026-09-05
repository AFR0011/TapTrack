import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase } from '@/database';

const legacyStores = {
  transactions: 'id, type, date, categoryId, method, currency, recurringSourceId',
  balances: 'id, currency, method',
  categories: 'id, name, type',
  monthlyBudgets: 'id, month',
  categoryBudgets: 'id, month, categoryId',
  recurringTransactions: 'id, nextRunDate, isActive',
  conversions: 'id, date, fromCurrency, toCurrency',
  settings: 'id',
};

describe('database v2 to v3 migration', () => {
  const names: string[] = [];

  afterEach(async () => {
    for (const name of names.splice(0)) await Dexie.delete(name);
  });

  it('preserves every finance table and creates no binding implicitly', async () => {
    const name = `taptrack-migration-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores(legacyStores);
    legacy.version(2).stores({
      conversions: 'id, date, fromCurrency, toCurrency, fromMethod, toMethod',
    });
    await legacy.open();

    const now = '2026-05-18T00:00:00.000Z';
    const rows: Record<string, Record<string, unknown>> = {
      transactions: { id: 'tx-1', type: 'expense', amount: 1, date: '2026-05-18', updatedAt: now },
      balances: { id: 'TRY-cash', currency: 'TRY', method: 'cash', amount: 9, updatedAt: now },
      categories: { id: 'cat-1', name: 'Test', type: 'expense', createdAt: now, updatedAt: now },
      monthlyBudgets: { id: '2026-05', month: '2026-05', totalBudget: 10, updatedAt: now },
      categoryBudgets: { id: 'cb-1', month: '2026-05', categoryId: 'cat-1', amount: 2, updatedAt: now },
      recurringTransactions: { id: 'rt-1', nextRunDate: '2026-05-19', isActive: true, updatedAt: now },
      conversions: { id: 'cv-1', date: '2026-05-18', fromCurrency: 'TRY', toCurrency: 'USD', fromMethod: 'cash', toMethod: 'card' },
      settings: { id: 'default', defaultCurrency: 'TRY', lastUsedMethod: 'cash', setupCompleted: true, createdAt: now, updatedAt: now },
    };

    for (const [table, row] of Object.entries(rows)) await legacy.table(table).put(row);
    legacy.close();

    const upgraded = new TapTrackDatabase(name);
    await upgraded.open();

    for (const [table, row] of Object.entries(rows)) {
      await expect(upgraded.table(table).get(String(row.id))).resolves.toBeDefined();
    }
    await expect(upgraded.deviceMetadata.count()).resolves.toBe(0);
    upgraded.close();
  });
});
