import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { EXCHANGE_RATE_SOURCE } from '@/exchangeRates';
import { getHistoricalReportRateKey, type HistoricalReportRateMap } from '@/reports/historicalReportRates';
import { createTransaction } from '@/transactions/createTransaction';
import { seedOpeningBalance } from '@/test/ledgerTestUtils';
import { exportCSV, exportJSON, exportPDF, importJSON } from './exportService';
import type { Transaction, TransactionDraft } from '@/types';

let database: RavelDatabase;

beforeEach(async () => {
  database = new RavelDatabase(`RavelTest-${crypto.randomUUID()}`);
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
    await seedOpeningBalance(database, 'TRY-cash', 200);
    await createTransaction(expense, database);

    const csvData = await exportCSV(database);

    expect(csvData).toContain('id,type,amount,currency,title,categoryId,method,date,note,recurringSourceId,createdAt,updatedAt');
    expect(csvData).toContain('coffee');
  });

  it('routes JSON export/import through versioned replace semantics', async () => {
    await seedOpeningBalance(database, 'TRY-cash', 200);
    await createTransaction(expense, database, new Date('2026-05-05T12:00:00.000Z'), 'coffee-original');

    const backup = await exportJSON(database);
    const parsed = JSON.parse(backup);
    expect(parsed.format).toBe('taptrack-backup');
    expect(parsed.version).toBe(2);
    expect(parsed).not.toHaveProperty('balances');

    await createTransaction(
      { ...expense, amount: 20, title: 'extra', date: '2026-05-06' },
      database,
      new Date('2026-05-06T12:00:00.000Z'),
      'coffee-extra'
    );
    expect(await database.transactions.count()).toBe(2);

    await importJSON(backup, database);

    expect((await database.transactions.toArray()).map((item) => item.id)).toEqual(['coffee-original']);
    expect(await database.categories.count()).toBe(6);
    expect(await database.settings.count()).toBe(1);
  });

  it('exports a PDF blob with monthly report content', async () => {
    await seedOpeningBalance(database, 'TRY-cash', 200);
    await createTransaction(expense, database);

    const pdf = await exportPDF('2026-05', database);
    const text = await pdf.text();

    expect(pdf.type).toBe('application/pdf');
    expect(text).toContain('Ravel Monthly Report');
    expect(text).toContain('coffee');
    expect(text).toContain('Food');
    expect(text).toContain('Page 1 of 1');
  });

  it('paginates long PDF reports without clipping the last transaction', async () => {
    const createdAt = '2026-05-01T12:00:00.000Z';
    const transactions: Transaction[] = Array.from({ length: 96 }, (_, index) => ({
      id: `pdf-row-${String(index + 1).padStart(3, '0')}`,
      type: 'expense',
      amount: index + 1,
      currency: 'TRY',
      title:
        index === 95
          ? 'FINAL-PDF-ROW that must remain visible after pagination and wrapping'
          : `PDF row ${index + 1}`,
      categoryId: 'cat-food',
      method: 'card',
      date: `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
      createdAt,
      updatedAt: createdAt,
    }));
    await database.transactions.bulkAdd(transactions);

    const pdf = await exportPDF('2026-05', database);
    const text = await pdf.text();
    const pageCountMatch = text.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/);

    expect(Number(pageCountMatch?.[1] ?? 0)).toBeGreaterThan(1);
    expect(text).toContain('FINAL-PDF-ROW');
    expect(text).toMatch(/Page 1 of \d+/);
    expect(text).toMatch(/Page \d+ of \d+/);
  });

  it('makes PDF totals follow the historical TRY report view', async () => {
    await seedOpeningBalance(database, 'TRY-cash', 500);
    await seedOpeningBalance(database, 'USD-card', 100);
    await createTransaction(expense, database);
    await createTransaction(
      {
        type: 'expense',
        amount: 2,
        currency: 'USD',
        title: 'usd lunch',
        categoryId: 'cat-food',
        method: 'card',
        date: '2026-05-05',
      },
      database
    );
    await createTransaction(
      {
        type: 'income',
        amount: 1,
        currency: 'EUR',
        title: 'euro refund',
        categoryId: 'cat-income',
        method: 'cash',
        date: '2026-05-06',
      },
      database
    );

    const historicalRates: HistoricalReportRateMap = {
      [getHistoricalReportRateKey('USD', '2026-05-05')]: {
        base: 'USD',
        quote: 'TRY',
        dateRequested: '2026-05-05',
        dateUsed: '2026-05-05',
        rate: 40,
        source: EXCHANGE_RATE_SOURCE,
        status: 'historical',
      },
      [getHistoricalReportRateKey('EUR', '2026-05-06')]: {
        base: 'EUR',
        quote: 'TRY',
        dateRequested: '2026-05-06',
        dateUsed: '2026-05-05',
        rate: 45,
        source: EXCHANGE_RATE_SOURCE,
        status: 'prior-available',
      },
    };

    const pdf = await exportPDF(
      { mode: 'month', month: '2026-05', convertToTRY: true, historicalRates },
      database
    );
    const text = await pdf.text();

    expect(text).toContain('FX BASIS');
    expect(text).toContain('Total income:    45 TRY');
    expect(text).toContain('Total expenses:  200 TRY');
    expect(text).toContain('Net:             -155 TRY');
    expect(text).toContain('Food: 200 TRY');
    expect(text).toContain('-2 USD \\(= 80 TRY\\)');
    expect(text).toContain('1 historical rate used the most recent prior published date.');
  });

  it('refuses TRY-unified PDF export when a required historical rate is missing', async () => {
    await seedOpeningBalance(database, 'USD-card', 100);
    await createTransaction(
      {
        type: 'expense',
        amount: 2,
        currency: 'USD',
        title: 'usd lunch',
        categoryId: 'cat-food',
        method: 'card',
        date: '2026-05-05',
      },
      database
    );

    await expect(
      exportPDF(
        { mode: 'month', month: '2026-05', convertToTRY: true, historicalRates: {} },
        database
      )
    ).rejects.toThrow('Historical USD/TRY rate is missing for 2026-05-05');
  });

  it('exports a PDF blob for custom date ranges', async () => {
    await seedOpeningBalance(database, 'TRY-cash', 500);
    await createTransaction(expense, database);

    const pdf = await exportPDF({ mode: 'range', startDate: '2026-05-01', endDate: '2026-05-31' }, database);
    const text = await pdf.text();

    expect(pdf.type).toBe('application/pdf');
    expect(text).toContain('Ravel Range Report');
    expect(text).toContain('2026-05-01 to 2026-05-31');
    expect(text).toContain('Food');
  });

  it('exports a PDF blob for yearly summaries', async () => {
    await seedOpeningBalance(database, 'TRY-card', 1000);
    await createTransaction(
      {
        type: 'income',
        amount: 1000,
        currency: 'TRY',
        title: 'salary',
        categoryId: 'cat-income',
        method: 'card',
        date: '2026-01-01',
      },
      database
    );

    const pdf = await exportPDF({ mode: 'year', year: '2026' }, database);
    const text = await pdf.text();

    expect(pdf.type).toBe('application/pdf');
    expect(text).toContain('Ravel Yearly Report');
    expect(text).toContain('MONTHLY SUMMARY');
    expect(text).toContain('2026-01 | income 1000 TRY');
  });

  it('uses historical rates in yearly PDF summaries when TRY conversion is enabled', async () => {
    await createTransaction(
      {
        type: 'income',
        amount: 10,
        currency: 'USD',
        title: 'usd income',
        categoryId: 'cat-income',
        method: 'card',
        date: '2026-01-03',
      },
      database
    );

    const historicalRates: HistoricalReportRateMap = {
      [getHistoricalReportRateKey('USD', '2026-01-03')]: {
        base: 'USD',
        quote: 'TRY',
        dateRequested: '2026-01-03',
        dateUsed: '2026-01-02',
        rate: 43,
        source: EXCHANGE_RATE_SOURCE,
        status: 'prior-available',
      },
    };

    const pdf = await exportPDF(
      { mode: 'year', year: '2026', convertToTRY: true, historicalRates },
      database
    );
    const text = await pdf.text();

    expect(text).toContain('Total income:    430 TRY');
    expect(text).toContain('2026-01 | income 430 TRY | expenses 0 TRY | net 430 TRY');
  });
});
