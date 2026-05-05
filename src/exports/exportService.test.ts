import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { exportCSV, exportJSON, importJSON } from './exportService';
import { createTransaction } from '@/transactions/createTransaction';
import { createDefaultCategories } from '@/defaultData';
import type { TransactionDraft } from '@/types';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);

  // Debug: Check what balances exist
  const balances = await database.balances.toArray();
  console.log('Balances after seeding:', balances);
});

afterEach(async () => {
  await database.delete();
});

describe('exportService', () => {
  describe('exportCSV', () => {
    it('should export empty database as CSV', async () => {
      const csvData = await exportCSV(database);
      expect(csvData).toContain('id,type,amount,currency,title,categoryId,method,date,note,recurringSourceId,createdAt,updatedAt');
      expect(csvData).toContain('\n\n'); // Should have at least one empty line
    });

    it('should export database with transactions as CSV', async () => {
      const transactionDraft: TransactionDraft = {
        type: 'expense',
        amount: 120,
        currency: 'TRY',
        title: 'coffee',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-04-30',
      };

      // First, fund the cash balance to make the transaction possible
      const balanceId = 'TRY-cash';
      await database.balances.update(balanceId, { amount: 200 });

      await createTransaction(transactionDraft, database);

      const csvData = await exportCSV(database);
      expect(csvData).toContain('id,type,amount,currency,title,categoryId,method,date,note,recurringSourceId,createdAt,updatedAt');
      expect(csvData).toContain('coffee');
      expect(csvData).toContain('expense');
      expect(csvData).toContain('120');
    });
  });

  describe('exportJSON', () => {
    it('should export empty database as JSON', async () => {
      const jsonData = await exportJSON(database);
      const data = JSON.parse(jsonData);

      expect(data).toHaveProperty('transactions');
      expect(data).toHaveProperty('balances');
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('monthlyBudgets');
      expect(data).toHaveProperty('categoryBudgets');
      expect(data).toHaveProperty('recurringTransactions');
      expect(data).toHaveProperty('conversions');
      expect(data).toHaveProperty('settings');

      // Check that default categories are included
      expect(data.categories).toHaveLength(6); // Default categories
      expect(data.settings).toHaveLength(1); // Default settings
    });

    it('should export database with transactions as JSON', async () => {
      const transactionDraft: TransactionDraft = {
        type: 'expense',
        amount: 120,
        currency: 'TRY',
        title: 'coffee',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-04-30',
      };

      // First, fund the cash balance to make the transaction possible
      const balanceId = 'TRY-cash';
      await database.balances.update(balanceId, { amount: 200 });

      await createTransaction(transactionDraft, database);

      const jsonData = await exportJSON(database);
      const data = JSON.parse(jsonData);

      expect(data.transactions).toHaveLength(1);
      expect(data.transactions[0].title).toBe('coffee');
      expect(data.transactions[0].amount).toBe(120);
      expect(data.transactions[0].type).toBe('expense');
    });
  });

  describe('importJSON', () => {
    it('should import data and clear existing data', async () => {
      // First, create some data
      const transactionDraft: TransactionDraft = {
        type: 'expense',
        amount: 120,
        currency: 'TRY',
        title: 'coffee',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-04-30',
      };

      // First, fund the cash balance to make the transaction possible
      const balanceId = 'TRY-cash';
      await database.balances.update(balanceId, { amount: 200 });

      await createTransaction(transactionDraft, database);

      // Export current data
      const originalJson = await exportJSON(database);
      const originalData = JSON.parse(originalJson);

      // Clear database
      await database.transaction('rw', database.transactions, database.balances, database.categories, database.monthlyBudgets, database.categoryBudgets, database.recurringTransactions, database.conversions, database.settings, async () => {
        await database.transactions.clear();
        await database.balances.clear();
        await database.categories.clear();
        await database.monthlyBudgets.clear();
        await database.categoryBudgets.clear();
        await database.recurringTransactions.clear();
        await database.conversions.clear();
        await database.settings.clear();
      });

      // Import the data back
      await importJSON(originalJson, database);

      // Verify data was imported
      const importedData = await exportJSON(database);
      const importedJson = JSON.parse(importedData);

      expect(importedJson.transactions).toHaveLength(1);
      expect(importedJson.categories).toHaveLength(6); // Default categories
      expect(importedJson.settings).toHaveLength(1); // Default settings
    });
  });
});