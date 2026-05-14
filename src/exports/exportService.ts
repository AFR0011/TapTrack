import Papa from 'papaparse';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { formatDisplayMonth } from '@/dates';
import {
  getBudgetPerformanceReport,
  getCategorySpending,
  getFullTransactionList,
  getIncomeVsExpense,
} from '@/reports/reportService';
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

export type TapTrackBackup = {
  transactions: Transaction[];
  balances: Balance[];
  categories: Category[];
  monthlyBudgets: MonthlyBudget[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  conversions: Conversion[];
  settings: Settings[];
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
  const data = await readBackup(database);
  return JSON.stringify(data, null, 2);
}

export async function importJSON(jsonData: string, database: TapTrackDatabase = db): Promise<void> {
  const data = parseBackup(jsonData);

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.balances,
      database.categories,
      database.monthlyBudgets,
      database.categoryBudgets,
      database.recurringTransactions,
      database.conversions,
      database.settings,
    ],
    async () => {
      await Promise.all([
        database.transactions.clear(),
        database.balances.clear(),
        database.categories.clear(),
        database.monthlyBudgets.clear(),
        database.categoryBudgets.clear(),
        database.recurringTransactions.clear(),
        database.conversions.clear(),
        database.settings.clear(),
      ]);

      await Promise.all([
        data.transactions.length ? database.transactions.bulkPut(data.transactions) : undefined,
        data.balances.length ? database.balances.bulkPut(data.balances) : undefined,
        data.categories.length ? database.categories.bulkPut(data.categories) : undefined,
        data.monthlyBudgets.length ? database.monthlyBudgets.bulkPut(data.monthlyBudgets) : undefined,
        data.categoryBudgets.length ? database.categoryBudgets.bulkPut(data.categoryBudgets) : undefined,
        data.recurringTransactions.length
          ? database.recurringTransactions.bulkPut(data.recurringTransactions)
          : undefined,
        data.conversions.length ? database.conversions.bulkPut(data.conversions) : undefined,
        data.settings.length ? database.settings.bulkPut(data.settings) : undefined,
      ]);
    }
  );

  await ensureDatabaseSeeded(database);
}

export async function exportPDF(month: string, database: TapTrackDatabase = db): Promise<Blob> {
  await ensureDatabaseSeeded(database);

  const [transactions, incomeVsExpense, categorySpending, budgetPerformance] = await Promise.all([
    getFullTransactionList(month, database),
    getIncomeVsExpense(month, database),
    getCategorySpending(month, database),
    getBudgetPerformanceReport(month, database),
  ]);

  const lines = [
    `TapTrack Monthly Report - ${formatDisplayMonth(month)}`,
    '================================================================================',
    `Generated: ${new Date().toISOString()}`,
    '',
    'FINANCIAL SUMMARY',
    '--------------------------------------------------------------------------------',
    `Total income:    ${incomeVsExpense.income} TRY`,
    `Total expenses:  ${incomeVsExpense.expense} TRY`,
    `Net:             ${incomeVsExpense.net} TRY`,
    '',
    'BUDGET SUMMARY',
    '--------------------------------------------------------------------------------',
    `Budget available:   ${budgetPerformance.available} TRY`,
    `Budget spent:       ${budgetPerformance.totalSpent} TRY`,
    `Budget remaining:   ${budgetPerformance.remaining} TRY`,
    '',
    'CATEGORY SPENDING',
    '--------------------------------------------------------------------------------',
    ...(categorySpending.length
      ? categorySpending.map((item) => `${item.categoryId}: ${item.amount} TRY`)
      : ['No TRY expense categories this month.']),
    '',
    'TRANSACTIONS',
    '================================================================================',
    ...(transactions.length
      ? transactions.map(
          (transaction) =>
            `${transaction.date} | ${transaction.type === 'income' ? '+' : '-'}${transaction.amount} ${transaction.currency} | ${transaction.method} | ${transaction.title} | ${transaction.categoryId}`
        )
      : ['No transactions this month.']),
    '',
    '================================================================================',
    `End of report - Page 1 of 1`,
  ];

  return createSimplePdf(lines);
}

async function readBackup(database: TapTrackDatabase): Promise<TapTrackBackup> {
  await ensureDatabaseSeeded(database);

  const [
    transactions,
    balances,
    categories,
    monthlyBudgets,
    categoryBudgets,
    recurringTransactions,
    conversions,
    settings,
  ] = await Promise.all([
    database.transactions.toArray(),
    database.balances.toArray(),
    database.categories.toArray(),
    database.monthlyBudgets.toArray(),
    database.categoryBudgets.toArray(),
    database.recurringTransactions.toArray(),
    database.conversions.toArray(),
    database.settings.toArray(),
  ]);

  return {
    transactions,
    balances,
    categories,
    monthlyBudgets,
    categoryBudgets,
    recurringTransactions,
    conversions,
    settings,
  };
}

function parseBackup(jsonData: string): TapTrackBackup {
  const parsed = JSON.parse(jsonData) as Partial<TapTrackBackup>;

  return {
    transactions: asArray(parsed.transactions),
    balances: asArray(parsed.balances),
    categories: asArray(parsed.categories),
    monthlyBudgets: asArray(parsed.monthlyBudgets),
    categoryBudgets: asArray(parsed.categoryBudgets),
    recurringTransactions: asArray(parsed.recurringTransactions),
    conversions: asArray(parsed.conversions),
    settings: asArray(parsed.settings),
  };
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
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
