import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TapTrackDatabase, ensureDatabaseSeeded } from '@/database';
import { createTransaction } from '@/transactions/createTransaction';
import { exportCSV, exportJSON, exportPDF, importJSON } from './exportService';
import type { TransactionDraft } from '@/types';

let database: TapTrackDatabase;

beforeEach(async () => {
  database = new TapTrackDatabase(`TapTrackTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

const expense: TransactionDraft = {
  type: 'expense',
  amount: 120,
  currency: 'TRY',
  title: 'coffee',
  categoryId: 'cat-food',
  method: 'cash',
  date: '2026-05-05',
};

describe('exportService', () => {
  it('exports transaction CSV with headers', async () => {
    await database.balances.update('TRY-cash', { amount: 200 });
    await createTransaction(expense, database);

    const csvData = await exportCSV(database);

    expect(csvData).toContain('id,type,amount,currency,title,categoryId,method,date,note,recurringSourceId,createdAt,updatedAt');
    expect(csvData).toContain('coffee');
  });

  it('round-trips a full JSON backup', async () => {
    await database.balances.update('TRY-cash', { amount: 200 });
    await createTransaction(expense, database);

    const backup = await exportJSON(database);
    await importJSON(
      JSON.stringify({
        transactions: [],
        balances: [],
        categories: [],
        monthlyBudgets: [],
        categoryBudgets: [],
        recurringTransactions: [],
        conversions: [],
        settings: [],
      }),
      database
    );
    expect(await database.transactions.count()).toBe(0);

    await importJSON(backup, database);

    expect(await database.transactions.count()).toBe(1);
    expect(await database.categories.count()).toBe(6);
    expect(await database.settings.count()).toBe(1);
  });

  it('exports a PDF blob with monthly report content', async () => {
    await database.balances.update('TRY-cash', { amount: 200 });
    await createTransaction(expense, database);

    const pdf = await exportPDF('2026-05', database);
    const text = await pdf.text();

    expect(pdf.type).toBe('application/pdf');
    expect(text).toContain('TapTrack Monthly Report');
    expect(text).toContain('coffee');
  });
});
