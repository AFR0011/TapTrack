import Papa from 'papaparse';
import {
  exportBackupJSON,
  restoreBackupJSON,
  type RestoreBackupOptions,
  type RestoreBackupResult,
  type TapTrackBackupV2,
} from '@/exports/backupService';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { formatDisplayMonth } from '@/dates';
import {
  getTransactionAmountInTRY,
  loadHistoricalReportRates,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
import { getBudgetPerformanceReport, getDateRangeTransactionList, getFullTransactionList } from '@/reports/reportService';
import type { Transaction } from '@/types';

export type TapTrackBackup = TapTrackBackupV2;

type ReportPeriodOptions =
  | { mode: 'month'; month: string }
  | { mode: 'range'; startDate: string; endDate: string }
  | { mode: 'year'; year: string };

export type ReportExportOptions = ReportPeriodOptions & {
  /** Mirrors the Reports "Convert all to TRY" view. */
  convertToTRY?: boolean;
  /** Pass the already-loaded screen rates so PDF values exactly match the visible report. */
  historicalRates?: HistoricalReportRateMap;
};

const CSV_COLUMNS: Array<keyof Transaction> = [
  'id',
  'type',
  'amount',
  'currency',
  'title',
  'categoryId',
  'method',
  'date',
  'note',
  'recurringSourceId',
  'createdAt',
  'updatedAt',
];

export async function exportCSV(database: TapTrackDatabase = db): Promise<string> {
  await ensureDatabaseSeeded(database);
  const transactions = await database.transactions.toArray();

  return Papa.unparse({
    fields: CSV_COLUMNS,
    data: transactions.map((transaction) =>
      CSV_COLUMNS.map((column) => transaction[column] ?? '')
    ),
  });
}

export async function exportJSON(database: TapTrackDatabase = db): Promise<string> {
  return exportBackupJSON(database);
}

export async function importJSON(
  jsonData: string,
  database: TapTrackDatabase = db,
  options: RestoreBackupOptions = {}
): Promise<RestoreBackupResult> {
  return restoreBackupJSON(jsonData, database, options);
}

export async function exportPDF(
  options: string | ReportExportOptions,
  database: TapTrackDatabase = db
): Promise<Blob> {
  await ensureDatabaseSeeded(database);

  const normalizedOptions: ReportExportOptions =
    typeof options === 'string' ? { mode: 'month', month: options } : options;
  const categories = await database.categories.toArray();
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const convertToTRY = normalizedOptions.convertToTRY ?? false;

  if (normalizedOptions.mode === 'year') {
    const transactions = await database.transactions
      .where('date')
      .startsWith(normalizedOptions.year)
      .toArray();
    const rates = await resolveReportRates(
      transactions,
      convertToTRY,
      normalizedOptions.historicalRates
    );
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = `${normalizedOptions.year}-${String(index + 1).padStart(2, '0')}`;
      const totals = calculatePdfTotals(
        transactions.filter((transaction) => transaction.date.startsWith(month)),
        convertToTRY,
        rates
      );
      return { month, ...totals };
    });
    const totalIncome = months.reduce((sum, item) => sum + item.income, 0);
    const totalExpense = months.reduce((sum, item) => sum + item.expense, 0);
    const fxLines = getFxBasisLines(convertToTRY, rates);

    const lines = [
      `TapTrack Yearly Report - ${normalizedOptions.year}`,
      '================================================================================',
      `Generated: ${new Date().toISOString()}`,
      '',
      ...fxLines,
      'FINANCIAL SUMMARY',
      '--------------------------------------------------------------------------------',
      `Total income:    ${totalIncome} TRY`,
      `Total expenses:  ${totalExpense} TRY`,
      `Net:             ${totalIncome - totalExpense} TRY`,
      '',
      'MONTHLY SUMMARY',
      '--------------------------------------------------------------------------------',
      ...months.map(
        (item) =>
          `${item.month} | income ${item.income} TRY | expenses ${item.expense} TRY | net ${item.net} TRY`
      ),
      '',
      '================================================================================',
      'End of report - Page 1 of 1',
    ];

    return createSimplePdf(lines);
  }

  const reportLabel =
    normalizedOptions.mode === 'month'
      ? `Monthly Report - ${formatDisplayMonth(normalizedOptions.month)}`
      : `Range Report - ${normalizedOptions.startDate} to ${normalizedOptions.endDate}`;

  const [transactions, budgetPerformance] =
    normalizedOptions.mode === 'month'
      ? await Promise.all([
          getFullTransactionList(normalizedOptions.month, database),
          getBudgetPerformanceReport(normalizedOptions.month, database),
        ])
      : await Promise.all([
          getDateRangeTransactionList(normalizedOptions.startDate, normalizedOptions.endDate, database),
          Promise.resolve(null),
        ]);

  const rates = await resolveReportRates(
    transactions,
    convertToTRY,
    normalizedOptions.historicalRates
  );
  const incomeVsExpense = calculatePdfTotals(transactions, convertToTRY, rates);
  const categorySpending = calculatePdfCategorySpending(transactions, convertToTRY, rates);
  const fxLines = getFxBasisLines(convertToTRY, rates);

  const lines = [
    `TapTrack ${reportLabel}`,
    '================================================================================',
    `Generated: ${new Date().toISOString()}`,
    '',
    ...fxLines,
    'FINANCIAL SUMMARY',
    '--------------------------------------------------------------------------------',
    `Total income:    ${incomeVsExpense.income} TRY`,
    `Total expenses:  ${incomeVsExpense.expense} TRY`,
    `Net:             ${incomeVsExpense.net} TRY`,
    '',
    'BUDGET SUMMARY',
    '--------------------------------------------------------------------------------',
    ...(budgetPerformance
      ? [
          `Budget available:   ${budgetPerformance.available} TRY`,
          `Budget spent:       ${budgetPerformance.totalSpent} TRY`,
          `Budget remaining:   ${budgetPerformance.remaining} TRY`,
        ]
      : ['Budget summary is shown for monthly reports only.']),
    '',
    'CATEGORY SPENDING',
    '--------------------------------------------------------------------------------',
    ...(categorySpending.length
      ? categorySpending.map(
          (item) => `${categoryById.get(item.categoryId) ?? item.categoryId}: ${item.amount} TRY`
        )
      : [convertToTRY ? 'No expense categories in this report period.' : 'No TRY expense categories in this report period.']),
    '',
    'TRANSACTIONS',
    '================================================================================',
    ...(transactions.length
      ? transactions.map((transaction) =>
          formatPdfTransaction(transaction, categoryById, convertToTRY, rates)
        )
      : ['No transactions for this report period.']),
    '',
    '================================================================================',
    `End of report - Page 1 of 1`,
  ];

  return createSimplePdf(lines);
}

async function resolveReportRates(
  transactions: Transaction[],
  convertToTRY: boolean,
  suppliedRates?: HistoricalReportRateMap
): Promise<HistoricalReportRateMap> {
  if (!convertToTRY) return {};

  const rates = suppliedRates ?? (await loadHistoricalReportRates(transactions));
  for (const transaction of transactions) {
    if (transaction.currency === 'TRY') continue;
    if (getTransactionAmountInTRY(transaction, rates) === null) {
      throw new Error(
        `Historical ${transaction.currency}/TRY rate is missing for ${transaction.date}; PDF export was not generated.`
      );
    }
  }
  return rates;
}

function calculatePdfTotals(
  transactions: Transaction[],
  convertToTRY: boolean,
  rates: HistoricalReportRateMap
) {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    const amount = getPdfTransactionAmount(transaction, convertToTRY, rates);
    if (amount === null) continue;
    if (transaction.type === 'income') income += amount;
    else expense += amount;
  }

  return { income, expense, net: income - expense };
}

function calculatePdfCategorySpending(
  transactions: Transaction[],
  convertToTRY: boolean,
  rates: HistoricalReportRateMap
) {
  const spending = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const amount = getPdfTransactionAmount(transaction, convertToTRY, rates);
    if (amount === null) continue;
    spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + amount);
  }

  return [...spending.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getPdfTransactionAmount(
  transaction: Transaction,
  convertToTRY: boolean,
  rates: HistoricalReportRateMap
): number | null {
  if (!convertToTRY) return transaction.currency === 'TRY' ? transaction.amount : null;
  return getTransactionAmountInTRY(transaction, rates);
}

function formatPdfTransaction(
  transaction: Transaction,
  categoryById: Map<string, string>,
  convertToTRY: boolean,
  rates: HistoricalReportRateMap
): string {
  const sign = transaction.type === 'income' ? '+' : '-';
  const base = `${transaction.date} | ${sign}${transaction.amount} ${transaction.currency}`;
  let valuation = '';

  if (convertToTRY && transaction.currency !== 'TRY') {
    const amountInTRY = getTransactionAmountInTRY(transaction, rates);
    if (amountInTRY === null) {
      throw new Error(
        `Historical ${transaction.currency}/TRY rate is missing for ${transaction.date}; PDF export was not generated.`
      );
    }
    valuation = ` (= ${amountInTRY} TRY)`;
  }

  return `${base}${valuation} | ${transaction.method} | ${transaction.title} | ${categoryById.get(transaction.categoryId) ?? transaction.categoryId}`;
}

function getFxBasisLines(convertToTRY: boolean, rates: HistoricalReportRateMap): string[] {
  if (!convertToTRY) return [];

  const entries = Object.values(rates);
  const priorAvailable = entries.filter((rate) => rate.status === 'prior-available').length;
  return [
    'FX BASIS',
    '--------------------------------------------------------------------------------',
    'USD/EUR values use TCMB rates via Frankfurter for each transaction date.',
    priorAvailable > 0
      ? `${priorAvailable} historical rate${priorAvailable === 1 ? '' : 's'} used the most recent prior published date.`
      : 'All required historical rates were published on their transaction dates.',
    '',
  ];
}

function createSimplePdf(lines: string[]) {
  const escapedLines = lines.map(escapePdfText);
  const contentLines = escapedLines.flatMap((line, index) => {
    if (index === 0) return ['BT /F1 16 Tf 54 760 Td', `(${line}) Tj`];
    return ['0 -18 Td', `(${line}) Tj`];
  });
  const content = `${contentLines.join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
