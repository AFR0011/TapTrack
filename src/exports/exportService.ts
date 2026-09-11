import Papa from 'papaparse';
import {
  exportBackupJSON,
  restoreBackupJSON,
  type RestoreBackupOptions,
  type RestoreBackupResult,
  type RavelBackupV2,
} from '@/exports/backupService';
import { db, ensureDatabaseSeeded, type RavelDatabase } from '@/database';
import { formatDisplayMonth } from '@/dates';
import {
  getTransactionAmountInCurrency,
  loadHistoricalReportRates,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
import {
  getBudgetPerformanceReport,
  getDateRangeTransactionList,
  getFullTransactionList,
} from '@/reports/reportService';
import type { Currency, Transaction } from '@/types';

export type RavelBackup = RavelBackupV2;

type ReportPeriodOptions =
  | { mode: 'month'; month: string }
  | { mode: 'range'; startDate: string; endDate: string }
  | { mode: 'year'; year: string };

export type ReportExportOptions = ReportPeriodOptions & {
  /** Preferred B004 reporting mode. */
  convertToReportCurrency?: boolean;
  reportCurrency?: Currency;
  /** Legacy B003 compatibility. */
  convertToTRY?: boolean;
  /** Pass screen-loaded rates so exported values exactly match the visible report. */
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

export async function exportCSV(database: RavelDatabase = db): Promise<string> {
  await ensureDatabaseSeeded(database);
  const transactions = await database.transactions.toArray();
  return Papa.unparse({
    fields: CSV_COLUMNS,
    data: transactions.map((transaction) => CSV_COLUMNS.map((column) => transaction[column] ?? '')),
  });
}

export async function exportJSON(database: RavelDatabase = db): Promise<string> {
  return exportBackupJSON(database);
}

export async function importJSON(
  jsonData: string,
  database: RavelDatabase = db,
  options: RestoreBackupOptions = {}
): Promise<RestoreBackupResult> {
  return restoreBackupJSON(jsonData, database, options);
}

export async function exportPDF(
  options: string | ReportExportOptions,
  database: RavelDatabase = db
): Promise<Blob> {
  await ensureDatabaseSeeded(database);

  const normalizedOptions: ReportExportOptions =
    typeof options === 'string' ? { mode: 'month', month: options } : options;
  const settings = await database.settings.get('default');
  const reportCurrency = normalizedOptions.reportCurrency ?? settings?.defaultCurrency ?? 'TRY';
  const convertAll =
    normalizedOptions.convertToReportCurrency ?? normalizedOptions.convertToTRY ?? false;
  const categories = await database.categories.toArray();
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  if (normalizedOptions.mode === 'year') {
    const transactions = await database.transactions
      .where('date')
      .startsWith(normalizedOptions.year)
      .toArray();
    const rates = await resolveReportRates(
      transactions,
      convertAll,
      reportCurrency,
      normalizedOptions.historicalRates
    );
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = `${normalizedOptions.year}-${String(index + 1).padStart(2, '0')}`;
      const totals = calculatePdfTotals(
        transactions.filter((transaction) => transaction.date.startsWith(month)),
        convertAll,
        reportCurrency,
        rates
      );
      return { month, ...totals };
    });
    const totalIncome = months.reduce((sum, item) => sum + item.income, 0);
    const totalExpense = months.reduce((sum, item) => sum + item.expense, 0);
    const fxLines = getFxBasisLines(convertAll, reportCurrency, rates);

    return createSimplePdf([
      `Ravel Yearly Report - ${normalizedOptions.year}`,
      '================================================================================',
      `Generated: ${new Date().toISOString()}`,
      '',
      ...fxLines,
      'FINANCIAL SUMMARY',
      '--------------------------------------------------------------------------------',
      `Total income:    ${totalIncome} ${reportCurrency}`,
      `Total expenses:  ${totalExpense} ${reportCurrency}`,
      `Net:             ${totalIncome - totalExpense} ${reportCurrency}`,
      '',
      'MONTHLY SUMMARY',
      '--------------------------------------------------------------------------------',
      ...months.map(
        (item) =>
          `${item.month} | income ${item.income} ${reportCurrency} | expenses ${item.expense} ${reportCurrency} | net ${item.net} ${reportCurrency}`
      ),
      '',
      '================================================================================',
      'End of report',
    ]);
  }

  const reportLabel =
    normalizedOptions.mode === 'month'
      ? `Monthly Report - ${formatDisplayMonth(normalizedOptions.month)}`
      : `Range Report - ${normalizedOptions.startDate} to ${normalizedOptions.endDate}`;

  const [transactions, budgetPerformance] =
    normalizedOptions.mode === 'month'
      ? await Promise.all([
          getFullTransactionList(normalizedOptions.month, database),
          getBudgetPerformanceReport(normalizedOptions.month, database, reportCurrency),
        ])
      : await Promise.all([
          getDateRangeTransactionList(normalizedOptions.startDate, normalizedOptions.endDate, database),
          Promise.resolve(null),
        ]);

  const rates = await resolveReportRates(
    transactions,
    convertAll,
    reportCurrency,
    normalizedOptions.historicalRates
  );
  const incomeVsExpense = calculatePdfTotals(transactions, convertAll, reportCurrency, rates);
  const categorySpending = calculatePdfCategorySpending(
    transactions,
    convertAll,
    reportCurrency,
    rates
  );
  const fxLines = getFxBasisLines(convertAll, reportCurrency, rates);

  const lines = [
    `Ravel ${reportLabel}`,
    '================================================================================',
    `Generated: ${new Date().toISOString()}`,
    '',
    ...fxLines,
    'FINANCIAL SUMMARY',
    '--------------------------------------------------------------------------------',
    `Total income:    ${incomeVsExpense.income} ${reportCurrency}`,
    `Total expenses:  ${incomeVsExpense.expense} ${reportCurrency}`,
    `Net:             ${incomeVsExpense.net} ${reportCurrency}`,
    '',
    'BUDGET SUMMARY',
    '--------------------------------------------------------------------------------',
    ...(budgetPerformance
      ? [
          `Budget available:   ${budgetPerformance.available} ${budgetPerformance.currency}`,
          `Budget spent:       ${budgetPerformance.totalSpent} ${budgetPerformance.currency}`,
          `Budget remaining:   ${budgetPerformance.remaining} ${budgetPerformance.currency}`,
        ]
      : ['Budget summary is shown for monthly reports only.']),
    '',
    'CATEGORY SPENDING',
    '--------------------------------------------------------------------------------',
    ...(categorySpending.length
      ? categorySpending.map(
          (item) => `${categoryById.get(item.categoryId) ?? item.categoryId}: ${item.amount} ${reportCurrency}`
        )
      : [
          convertAll
            ? 'No expense categories in this report period.'
            : `No ${reportCurrency} expense categories in this report period.`,
        ]),
    '',
    'TRANSACTIONS',
    '================================================================================',
    ...(transactions.length
      ? transactions.map((transaction) =>
          formatPdfTransaction(transaction, categoryById, convertAll, reportCurrency, rates)
        )
      : ['No transactions for this report period.']),
    '',
    '================================================================================',
    'End of report',
  ];

  return createSimplePdf(lines);
}

async function resolveReportRates(
  transactions: Transaction[],
  convertAll: boolean,
  reportCurrency: Currency,
  suppliedRates?: HistoricalReportRateMap
): Promise<HistoricalReportRateMap> {
  if (!convertAll) return {};

  const rates =
    suppliedRates ?? (await loadHistoricalReportRates(transactions, undefined, reportCurrency));
  for (const transaction of transactions) {
    if (transaction.currency === reportCurrency) continue;
    if (getTransactionAmountInCurrency(transaction, rates, reportCurrency) === null) {
      throw new Error(
        `Historical ${transaction.currency}/${reportCurrency} rate is missing for ${transaction.date}; PDF export was not generated.`
      );
    }
  }
  return rates;
}

function calculatePdfTotals(
  transactions: Transaction[],
  convertAll: boolean,
  reportCurrency: Currency,
  rates: HistoricalReportRateMap
) {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    const amount = getPdfTransactionAmount(transaction, convertAll, reportCurrency, rates);
    if (amount === null) continue;
    if (transaction.type === 'income') income += amount;
    else expense += amount;
  }
  return { income, expense, net: income - expense };
}

function calculatePdfCategorySpending(
  transactions: Transaction[],
  convertAll: boolean,
  reportCurrency: Currency,
  rates: HistoricalReportRateMap
) {
  const spending = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const amount = getPdfTransactionAmount(transaction, convertAll, reportCurrency, rates);
    if (amount === null) continue;
    spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + amount);
  }
  return [...spending.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getPdfTransactionAmount(
  transaction: Transaction,
  convertAll: boolean,
  reportCurrency: Currency,
  rates: HistoricalReportRateMap
): number | null {
  if (!convertAll) {
    return transaction.currency === reportCurrency ? transaction.amount : null;
  }
  return getTransactionAmountInCurrency(transaction, rates, reportCurrency);
}

function formatPdfTransaction(
  transaction: Transaction,
  categoryById: Map<string, string>,
  convertAll: boolean,
  reportCurrency: Currency,
  rates: HistoricalReportRateMap
): string {
  const sign = transaction.type === 'income' ? '+' : '-';
  const base = `${transaction.date} | ${sign}${transaction.amount} ${transaction.currency}`;
  let valuation = '';

  if (convertAll && transaction.currency !== reportCurrency) {
    const amountInReportCurrency = getTransactionAmountInCurrency(
      transaction,
      rates,
      reportCurrency
    );
    if (amountInReportCurrency === null) {
      throw new Error(
        `Historical ${transaction.currency}/${reportCurrency} rate is missing for ${transaction.date}; PDF export was not generated.`
      );
    }
    valuation = ` (= ${amountInReportCurrency} ${reportCurrency})`;
  }

  return `${base}${valuation} | ${transaction.method} | ${transaction.title} | ${categoryById.get(transaction.categoryId) ?? transaction.categoryId}`;
}

function getFxBasisLines(
  convertAll: boolean,
  reportCurrency: Currency,
  rates: HistoricalReportRateMap
): string[] {
  if (!convertAll) return [];
  const entries = Object.values(rates);
  const priorAvailable = entries.filter((rate) => rate.status === 'prior-available').length;
  return [
    'FX BASIS',
    '--------------------------------------------------------------------------------',
    `Foreign-currency values use Frankfurter historical rates into ${reportCurrency} for each transaction date.`,
    priorAvailable > 0
      ? `${priorAvailable} historical rate${priorAvailable === 1 ? '' : 's'} used the most recent prior published date.`
      : 'All required historical rates were published on their transaction dates.',
    '',
  ];
}

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN_X = 54;
const PDF_BODY_FONT_SIZE = 10;
const PDF_TITLE_FONT_SIZE = 16;
const PDF_LINE_HEIGHT = 14;
const PDF_TOP = 756;
const PDF_BOTTOM = 54;
const PDF_MAX_CHARS = 90;

/**
 * Tiny dependency-free report PDF writer with deterministic line wrapping and
 * real pagination. It deliberately keeps streams uncompressed so automated
 * regression tests can verify that the first and last report rows are present.
 */
function createSimplePdf(lines: string[]) {
  const wrapped = lines.flatMap((line) => wrapPdfLine(normalizePdfText(line), PDF_MAX_CHARS));
  const linesPerPage = Math.max(1, Math.floor((PDF_TOP - PDF_BOTTOM - 24) / PDF_LINE_HEIGHT));
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += linesPerPage) {
    pages.push(wrapped.slice(index, index + linesPerPage));
  }
  if (pages.length === 0) pages.push(['']);

  const catalogObject = 1;
  const pagesObject = 2;
  const fontObject = 3;
  const pageObjectNumber = (index: number) => 4 + index * 2;
  const contentObjectNumber = (index: number) => 5 + index * 2;
  const pageRefs = pages.map((_, index) => `${pageObjectNumber(index)} 0 R`).join(' ');
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  pages.forEach((pageLines, pageIndex) => {
    const pageNumber = pageObjectNumber(pageIndex);
    const contentNumber = contentObjectNumber(pageIndex);
    void pageNumber;
    objects.push(
      `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentNumber} 0 R >>`
    );

    const contentLines: string[] = ['BT'];
    pageLines.forEach((line, lineIndex) => {
      const fontSize = pageIndex === 0 && lineIndex === 0 ? PDF_TITLE_FONT_SIZE : PDF_BODY_FONT_SIZE;
      const y = PDF_TOP - lineIndex * PDF_LINE_HEIGHT;
      contentLines.push(`/F1 ${fontSize} Tf ${PDF_MARGIN_X} ${y} Td (${escapePdfText(line)}) Tj`);
      if (lineIndex < pageLines.length - 1) contentLines.push(`-${PDF_MARGIN_X} -${y} Td`);
    });
    const footer = `Page ${pageIndex + 1} of ${pages.length}`;
    contentLines.push(`/F1 9 Tf ${PDF_MARGIN_X} 32 Td (${escapePdfText(footer)}) Tj`, 'ET');
    const content = contentLines.join('\n');
    objects.push(`<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function wrapPdfLine(value: string, maxChars: number): string[] {
  if (value.length <= maxChars) return [value];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      if (word.length <= maxChars) {
        current = word;
      } else {
        for (let index = 0; index < word.length; index += maxChars) {
          lines.push(word.slice(index, index + maxChars));
        }
      }
      continue;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      lines.push(current);
      if (word.length <= maxChars) {
        current = word;
      } else {
        for (let index = 0; index < word.length; index += maxChars) {
          lines.push(word.slice(index, index + maxChars));
        }
        current = '';
      }
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

/**
 * Helvetica/WinAnsi cannot faithfully render every Unicode code point. Map the
 * common Turkish characters Ravel is likely to contain and strip remaining
 * combining marks rather than writing malformed PDF strings or silently losing
 * whole rows. The JSON/CSV exports remain the lossless Unicode representations.
 */
function normalizePdfText(value: string): string {
  const mapped = value
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G');
  return mapped
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
