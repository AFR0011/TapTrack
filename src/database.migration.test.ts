import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';

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

describe('database migrations', () => {
  const names: string[] = [];

  afterEach(async () => {
    for (const name of names.splice(0)) await Dexie.delete(name);
  });

  it('preserves finance data, creates no binding implicitly, and snapshots completed balances once', async () => {
    const name = `ravel-migration-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores(legacyStores);
    legacy.version(2).stores({
      conversions: 'id, date, fromCurrency, toCurrency, fromMethod, toMethod',
    });
    legacy.version(3).stores({
      deviceMetadata: 'id',
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

    const upgraded = new RavelDatabase(name);
    await upgraded.open();

    for (const [table, row] of Object.entries(rows)) {
      await expect(upgraded.table(table).get(String(row.id))).resolves.toBeDefined();
    }
    await expect(upgraded.deviceMetadata.count()).resolves.toBe(0);
    await expect(upgraded.balanceCheckpoints.get('opening-TRY-cash')).resolves.toMatchObject({
      balanceId: 'TRY-cash',
      currency: 'TRY',
      method: 'cash',
      kind: 'opening',
      observedAmount: 9,
      deltaAmount: 9,
    });

    const checkpointCount = await upgraded.balanceCheckpoints.count();
    upgraded.close();

    const reopened = new RavelDatabase(name);
    await reopened.open();
    await expect(reopened.balanceCheckpoints.count()).resolves.toBe(checkpointCount);
    reopened.close();
  });

  it('does not invent opening checkpoints before setup is complete', async () => {
    const name = `ravel-migration-unfinished-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores(legacyStores);
    legacy.version(2).stores({
      conversions: 'id, date, fromCurrency, toCurrency, fromMethod, toMethod',
    });
    legacy.version(3).stores({ deviceMetadata: 'id' });
    await legacy.open();

    const now = '2026-05-18T00:00:00.000Z';
    await legacy.table('balances').put({
      id: 'TRY-cash',
      currency: 'TRY',
      method: 'cash',
      amount: 0,
      updatedAt: now,
    });
    await legacy.table('settings').put({
      id: 'default',
      defaultCurrency: 'TRY',
      lastUsedMethod: 'cash',
      setupCompleted: false,
      createdAt: now,
      updatedAt: now,
    });
    legacy.close();

    const upgraded = new RavelDatabase(name);
    await upgraded.open();
    await expect(upgraded.balanceCheckpoints.count()).resolves.toBe(0);
    upgraded.close();
  });

  it('repairs missing default category ids without overwriting existing category changes', async () => {
    const name = `ravel-seed-repair-${crypto.randomUUID()}`;
    names.push(name);
    const database = new RavelDatabase(name);
    await ensureDatabaseSeeded(database);

    const existingFood = await database.categories.get('cat-food');
    expect(existingFood).toBeDefined();
    await database.categories.put({ ...existingFood!, name: 'Meals' });
    await database.categories.delete('cat-other');

    await ensureDatabaseSeeded(database);

    await expect(database.categories.get('cat-food')).resolves.toMatchObject({ name: 'Meals' });
    await expect(database.categories.get('cat-other')).resolves.toMatchObject({
      id: 'cat-other',
      name: 'Other',
      isDefault: true,
      type: 'expense',
    });
    database.close();
  });
});
