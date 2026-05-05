import { getBudgetPerformance } from '@/reports/reportTransforms';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getPreviousMonth } from '@/dates';
import type { CategoryBudget, Transaction } from '@/types';

export type CategorySpending = { categoryId: string; amount: number };
export type SpendingPoint = { date: string; amount: number };
export type IncomeVsExpense = { income: number; expense: number; net: number };
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

export async function getSpendingOverTime(
  month: string,
  database: TapTrackDatabase = db
): Promise<SpendingPoint[]> {
  await ensureDatabaseSeeded(database);
  const transactions = await getTransactionsForMonth(month, database);
  const spendingByDate = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || transaction.currency !== 'TRY') continue;
    spendingByDate.set(transaction.date, (spendingByDate.get(transaction.date) ?? 0) + transaction.amount);
  }

  return [...spendingByDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

async function getTransactionsForMonth(month: string, database: TapTrackDatabase) {
  return database.transactions.where('date').startsWith(month).toArray();
}

export type { CategoryBudget };
