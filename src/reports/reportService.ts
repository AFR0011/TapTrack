import { db } from '@/database';
import type { Transaction } from '@/types';

export async function getCategorySpending(month: string): Promise<{ categoryId: string; amount: number }[]> {
  const transactions = await db.transactions
    .where('date')
    .startsWith(month)
    .toArray();

  const spendingByCategory: Record<string, number> = {};

  transactions
    .filter(t => t.type === 'expense' && t.currency === 'TRY')
    .forEach(t => {
      if (!spendingByCategory[t.categoryId]) {
        spendingByCategory[t.categoryId] = 0;
      }
      spendingByCategory[t.categoryId] += t.amount;
    });

  return Object.entries(spendingByCategory).map(([categoryId, amount]) => ({
    categoryId,
    amount,
  }));
}

export async function getSpendingOverTime(month: string): Promise<{ date: string; amount: number }[]> {
  const transactions = await db.transactions
    .where('date')
    .startsWith(month)
    .toArray();

  const spendingByDate: Record<string, number> = {};

  transactions
    .filter(t => t.type === 'expense' && t.currency === 'TRY')
    .forEach(t => {
      if (!spendingByDate[t.date]) {
        spendingByDate[t.date] = 0;
      }
      spendingByDate[t.date] += t.amount;
    });

  return Object.entries(spendingByDate)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getIncomeVsExpense(month: string): Promise<{ income: number; expense: number }> {
  const transactions = await db.transactions
    .where('date')
    .startsWith(month)
    .toArray();

  let income = 0;
  let expense = 0;

  transactions.forEach(t => {
    if (t.currency === 'TRY') {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    }
  });

  return { income, expense };
}

export async function getMonthlyComparison(month: string): Promise<{
  currentMonth: { income: number; expense: number; net: number };
  previousMonth: { income: number; expense: number; net: number };
}> {
  const currentMonth = month;
  const previousMonth = getPreviousMonth(month);

  const currentMonthData = await getIncomeVsExpense(currentMonth);
  const previousMonthData = await getIncomeVsExpense(previousMonth);

  return {
    currentMonth: {
      income: currentMonthData.income,
      expense: currentMonthData.expense,
      net: currentMonthData.income - currentMonthData.expense,
    },
    previousMonth: {
      income: previousMonthData.income,
      expense: previousMonthData.expense,
      net: previousMonthData.income - previousMonthData.expense,
    },
  };
}

export async function getBudgetPerformance(month: string): Promise<{
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  categoryBudgets: { categoryId: string; budget: number; spent: number; remaining: number }[];
}> {
  // Get monthly budget
  const monthlyBudget = await db.monthlyBudgets.get({ month });
  const totalBudget = monthlyBudget ? monthlyBudget.totalBudget : 0;

  // Calculate total spent
  const transactions = await db.transactions
    .where('date')
    .startsWith(month)
    .toArray();

  let totalSpent = 0;
  transactions
    .filter(t => t.type === 'expense' && t.currency === 'TRY')
    .forEach(t => {
      totalSpent += t.amount;
    });

  // Get category budgets
  const categoryBudgets = await db.categoryBudgets
    .where('month')
    .equals(month)
    .toArray();

  const categoryBudgetsData = await Promise.all(
    categoryBudgets.map(async (catBudget) => {
      const spent = await getCategorySpentForMonth(month, catBudget.categoryId);
      return {
        categoryId: catBudget.categoryId,
        budget: catBudget.amount,
        spent,
        remaining: catBudget.amount - spent,
      };
    })
  );

  return {
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
    categoryBudgets: categoryBudgetsData,
  };
}

export async function getFullTransactionList(month: string): Promise<Transaction[]> {
  const transactions = await db.transactions
    .where('date')
    .startsWith(month)
    .toArray();

  return transactions.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
}

function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  let prevMonth = monthNum - 1;
  let prevYear = year;

  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  return `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
}

async function getCategorySpentForMonth(month: string, categoryId: string): Promise<number> {
  const transactions = await db.transactions
    .where('date')
    .startsWith(month)
    .toArray();

  return transactions
    .filter(t => t.type === 'expense' && t.currency === 'TRY' && t.categoryId === categoryId)
    .reduce((sum, t) => sum + t.amount, 0);
}