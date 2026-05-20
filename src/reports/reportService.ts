import { getBudgetPerformance } from '@/reports/reportTransforms';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getPreviousMonth } from '@/dates';
import type { CategoryBudget, Transaction } from '@/types';

export type CategorySpending = { categoryId: string; amount: number };
export type SpendingPoint = { date: string; amount: number };
export type IncomeVsExpense = { income: number; expense: number; net: number };
export type MonthlySummaryPoint = { month: string; income: number; expense: number; net: number };
export type YearlySummary = {
  year: string;
  months: MonthlySummaryPoint[];
  totalIncome: number;
  totalExpense: number;
  net: number;
};
export type BudgetPerformance = {
  totalBudget: number;
  rollover: number;
  available: number;
  totalSpent: number;
  remaining: number;
  categoryBudgets: {
    categoryId: string;
    budget: number;
    spent: number;
    remaining: number;
  }[];
};

export async function getCategorySpending(
  month: string,
  database: TapTrackDatabase = db
): Promise<CategorySpending[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForMonth(month, database);
  return calculateCategorySpending(transactions);
}

export async function getSpendingOverTime(
  month: string,
  database: TapTrackDatabase = db
): Promise<SpendingPoint[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForMonth(month, database);
  return calculateSpendingOverTime(transactions);
}

export async function getIncomeVsExpense(
  month: string,
  database: TapTrackDatabase = db
): Promise<IncomeVsExpense> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForMonth(month, database);
  return calculateIncomeVsExpense(transactions);
}

export async function getMonthlyComparison(
  month: string,
  database: TapTrackDatabase = db
): Promise<{
  currentMonth: IncomeVsExpense;
  previousMonth: IncomeVsExpense;
}> {
  await ensureDatabaseSeeded(database);
  const previousMonth = getPreviousMonth(month);
  const [currentTransactions, previousTransactions] = await Promise.all([
    getTransactionsForMonth(month, database),
    getTransactionsForMonth(previousMonth, database),
  ]);

  return {
    currentMonth: calculateIncomeVsExpense(currentTransactions),
    previousMonth: calculateIncomeVsExpense(previousTransactions),
  };
}

export async function getBudgetPerformanceReport(
  month: string,
  database: TapTrackDatabase = db
): Promise<BudgetPerformance> {
  await ensureDatabaseSeeded(database);

  const [budget, categoryBudgets, transactions] = await Promise.all([
    database.monthlyBudgets.where('month').equals(month).first(),
    database.categoryBudgets.where('month').equals(month).toArray(),
    getTransactionsForMonth(month, database),
  ]);

  return getBudgetPerformance(month, budget ?? null, categoryBudgets, transactions);
}

export async function getFullTransactionList(
  month: string,
  database: TapTrackDatabase = db
): Promise<Transaction[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForMonth(month, database);
  return sortTransactionsDescending(transactions);
}

export async function getDateRangeTransactionList(
  startDate: string,
  endDate: string,
  database: TapTrackDatabase = db
): Promise<Transaction[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForDateRange(startDate, endDate, database);
  return sortTransactionsDescending(transactions);
}

export async function getDateRangeIncomeVsExpense(
  startDate: string,
  endDate: string,
  database: TapTrackDatabase = db
): Promise<IncomeVsExpense> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForDateRange(startDate, endDate, database);
  return calculateIncomeVsExpense(transactions);
}

export async function getDateRangeCategorySpending(
  startDate: string,
  endDate: string,
  database: TapTrackDatabase = db
): Promise<CategorySpending[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForDateRange(startDate, endDate, database);
  return calculateCategorySpending(transactions);
}

export async function getDateRangeSpendingOverTime(
  startDate: string,
  endDate: string,
  database: TapTrackDatabase = db
): Promise<SpendingPoint[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForDateRange(startDate, endDate, database);
  return calculateSpendingOverTime(transactions);
}

export async function getYearlySummary(
  year: string,
  database: TapTrackDatabase = db
): Promise<YearlySummary> {
  await ensureDatabaseSeeded(database);

  const months = await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}`;
      const { income, expense, net } = calculateIncomeVsExpense(
        await getTransactionsForMonth(month, database)
      );
      return { month, income, expense, net };
    })
  );

  const totalIncome = months.reduce((sum, item) => sum + item.income, 0);
  const totalExpense = months.reduce((sum, item) => sum + item.expense, 0);

  return {
    year,
    months,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
  };
}

export function calculateIncomeVsExpense(transactions: Transaction[]): IncomeVsExpense {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    if (transaction.currency !== 'TRY') continue;
    if (transaction.type === 'income') {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
  }

  return {
    income,
    expense,
    net: income - expense,
  };
}

export function sortTransactionsDescending(transactions: Transaction[]) {
  return [...transactions].sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function calculateCategorySpending(transactions: Transaction[]): CategorySpending[] {
  const spendingByCategory = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || transaction.currency !== 'TRY') continue;
    spendingByCategory.set(
      transaction.categoryId,
      (spendingByCategory.get(transaction.categoryId) ?? 0) + transaction.amount
    );
  }

  return [...spendingByCategory.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function calculateSpendingOverTime(transactions: Transaction[]): SpendingPoint[] {
  const spendingByDate = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || transaction.currency !== 'TRY') continue;
    spendingByDate.set(transaction.date, (spendingByDate.get(transaction.date) ?? 0) + transaction.amount);
  }

  return [...spendingByDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getTransactionsForMonth(month: string, database: TapTrackDatabase) {
  return database.transactions.where('date').startsWith(month).toArray();
}

async function getTransactionsForDateRange(
  startDate: string,
  endDate: string,
  database: TapTrackDatabase
) {
  const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  return database.transactions
    .where('date')
    .between(start, end, true, true)
    .toArray();
}

export type { CategoryBudget };
