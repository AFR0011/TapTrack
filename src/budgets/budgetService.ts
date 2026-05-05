import { db } from '@/database';
import type { MonthlyBudget, CategoryBudget } from '@/types';

export async function getMonthlyBudget(month: string): Promise<MonthlyBudget | null> {
  return await db.monthlyBudgets.get({ month });
}

export async function createMonthlyBudget(budget: Omit<MonthlyBudget, 'id' | 'createdAt' | 'updatedAt'>): Promise<MonthlyBudget> {
  const now = new Date().toISOString();
  const monthlyBudget: MonthlyBudget = {
    ...budget,
    id: `budget-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };

  await db.monthlyBudgets.add(monthlyBudget);
  return monthlyBudget;
}

export async function updateMonthlyBudget(id: string, updates: Partial<MonthlyBudget>): Promise<MonthlyBudget> {
  const now = new Date().toISOString();
  await db.monthlyBudgets.update(id, {
    ...updates,
    updatedAt: now,
  });

  const updated = await db.monthlyBudgets.get(id);
  if (!updated) {
    throw new Error('Budget not found');
  }
  return updated;
}

export async function getCategoryBudget(month: string, categoryId: string): Promise<CategoryBudget | null> {
  return await db.categoryBudgets.get({ month, categoryId });
}

export async function createCategoryBudget(budget: Omit<CategoryBudget, 'id' | 'createdAt' | 'updatedAt'>): Promise<CategoryBudget> {
  const now = new Date().toISOString();
  const categoryBudget: CategoryBudget = {
    ...budget,
    id: `cat-budget-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };

  await db.categoryBudgets.add(categoryBudget);
  return categoryBudget;
}

export async function updateCategoryBudget(id: string, updates: Partial<CategoryBudget>): Promise<CategoryBudget> {
  const now = new Date().toISOString();
  await db.categoryBudgets.update(id, {
    ...updates,
    updatedAt: now,
  });

  const updated = await db.categoryBudgets.get(id);
  if (!updated) {
    throw new Error('Category budget not found');
  }
  return updated;
}

export async function calculateRollover(monthlyBudget: MonthlyBudget, totalSpent: number): Promise<number> {
  // Calculate rollover amount: unused budget from previous month
  const unused = monthlyBudget.totalBudget - totalSpent;
  return Math.max(0, unused); // Ensure no negative rollover
}

export async function getMonthlyBudgetStatus(month: string): Promise<{
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  rollover: number;
}> {
  // Get the monthly budget
  const budget = await getMonthlyBudget(month);
  if (!budget) {
    return {
      totalBudget: 0,
      totalSpent: 0,
      remaining: 0,
      rollover: 0,
    };
  }

  // Calculate total spent for this month
  const totalSpent = await getTotalSpentForMonth(month);

  // Calculate rollover
  const rollover = await calculateRollover(budget, totalSpent);

  return {
    totalBudget: budget.totalBudget,
    totalSpent,
    remaining: budget.totalBudget - totalSpent,
    rollover,
  };
}

export async function getCategoryBudgetStatus(month: string, categoryId: string): Promise<{
  budget: number;
  spent: number;
  remaining: number;
}> {
  // Get category budget
  const categoryBudget = await getCategoryBudget(month, categoryId);
  if (!categoryBudget) {
    return {
      budget: 0,
      spent: 0,
      remaining: 0,
    };
  }

  // Calculate spent for this category in the month
  const spent = await getCategorySpentForMonth(month, categoryId);

  return {
    budget: categoryBudget.amount,
    spent,
    remaining: categoryBudget.amount - spent,
  };
}

async function getTotalSpentForMonth(month: string): Promise<number> {
  const transactions = await db.transactions.where('date').startsWith(month).toArray();
  return transactions
    .filter(t => t.type === 'expense' && t.currency === 'TRY')
    .reduce((sum, t) => sum + t.amount, 0);
}

async function getCategorySpentForMonth(month: string, categoryId: string): Promise<number> {
  const transactions = await db.transactions.where('date').startsWith(month).toArray();
  return transactions
    .filter(t => t.type === 'expense' && t.currency === 'TRY' && t.categoryId === categoryId)
    .reduce((sum, t) => sum + t.amount, 0);
}