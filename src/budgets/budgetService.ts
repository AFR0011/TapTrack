import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getPreviousMonth } from '@/dates';
import type { Category, CategoryBudget, MonthlyBudget } from '@/types';
import { pushRecord } from '@/sync/syncService';

export type MonthlyBudgetInput = {
  month: string;
  totalBudget: number;
  rolloverFromPreviousMonth?: number;
};

export type CategoryBudgetInput = {
  month: string;
  categoryId: string;
  amount: number;
};

export type MonthlyBudgetStatus = {
  totalBudget: number;
  rollover: number;
  available: number;
  totalSpent: number;
  remaining: number;
};

export type CategoryBudgetStatus = {
  categoryId: string;
  budget: number;
  spent: number;
  remaining: number;
};

export function getMonthlyBudgetId(month: string) {
  return `budget-${month}`;
}

export function getCategoryBudgetId(month: string, categoryId: string) {
  return `category-budget-${month}-${categoryId}`;
}

export async function getMonthlyBudget(
  month: string,
  database: TapTrackDatabase = db
): Promise<MonthlyBudget | null> {
  await ensureDatabaseSeeded(database);
  return (await database.monthlyBudgets.where('month').equals(month).first()) ?? null;
}

export async function upsertMonthlyBudget(
  input: MonthlyBudgetInput,
  database: TapTrackDatabase = db
): Promise<MonthlyBudget> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  const existing = await getMonthlyBudget(input.month, database);
  const budget: MonthlyBudget = {
    id: existing?.id ?? getMonthlyBudgetId(input.month),
    month: input.month,
    totalBudget: input.totalBudget,
    rolloverFromPreviousMonth:
      input.rolloverFromPreviousMonth ?? existing?.rolloverFromPreviousMonth ?? 0,
    currency: 'TRY',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.monthlyBudgets.put(budget);
  void pushRecord('monthlyBudgets', budget as unknown as Record<string, unknown>);
  return budget;
}

export async function getCategoryBudget(
  month: string,
  categoryId: string,
  database: TapTrackDatabase = db
): Promise<CategoryBudget | null> {
  await ensureDatabaseSeeded(database);
  return (
    (await database.categoryBudgets
      .where('month')
      .equals(month)
      .filter((budget) => budget.categoryId === categoryId)
      .first()) ?? null
  );
}

export async function upsertCategoryBudget(
  input: CategoryBudgetInput,
  database: TapTrackDatabase = db
): Promise<CategoryBudget> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  const existing = await getCategoryBudget(input.month, input.categoryId, database);
  const budget: CategoryBudget = {
    id: existing?.id ?? getCategoryBudgetId(input.month, input.categoryId),
    month: input.month,
    categoryId: input.categoryId,
    amount: input.amount,
    currency: 'TRY',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.categoryBudgets.put(budget);
  void pushRecord('categoryBudgets', budget as unknown as Record<string, unknown>);
  return budget;
}

export function calculateRollover(totalBudget: number, totalSpent: number) {
  return Math.max(0, totalBudget - totalSpent);
}

export async function getMonthlyBudgetStatus(
  month: string,
  database: TapTrackDatabase = db
): Promise<MonthlyBudgetStatus> {
  await ensureDatabaseSeeded(database);

  const budget = await getMonthlyBudget(month, database);
  const totalSpent = await getTotalSpentForMonth(month, database);
  const totalBudget = budget?.totalBudget ?? 0;
  const rollover = budget?.rolloverFromPreviousMonth ?? 0;
  const available = totalBudget + rollover;

  return {
    totalBudget,
    rollover,
    available,
    totalSpent,
    remaining: available - totalSpent,
  };
}

export async function getCategoryBudgetStatus(
  month: string,
  categoryId: string,
  database: TapTrackDatabase = db
): Promise<CategoryBudgetStatus> {
  await ensureDatabaseSeeded(database);

  const categoryBudget = await getCategoryBudget(month, categoryId, database);
  const spent = await getCategorySpentForMonth(month, categoryId, database);
  const budget = categoryBudget?.amount ?? 0;

  return {
    categoryId,
    budget,
    spent,
    remaining: budget - spent,
  };
}

export async function prepareMonthlyRollover(
  month: string,
  totalBudget: number,
  database: TapTrackDatabase = db
) {
  await ensureDatabaseSeeded(database);

  const previousMonth = getPreviousMonth(month);
  const previousBudget = await getMonthlyBudget(previousMonth, database);
  const previousSpent = await getTotalSpentForMonth(previousMonth, database);
  const rolloverFromPreviousMonth = previousBudget
    ? calculateRollover(previousBudget.totalBudget + previousBudget.rolloverFromPreviousMonth, previousSpent)
    : 0;

  return upsertMonthlyBudget(
    {
      month,
      totalBudget,
      rolloverFromPreviousMonth,
    },
    database
  );
}

async function getTotalSpentForMonth(month: string, database: TapTrackDatabase) {
  const transactions = await database.transactions.where('date').startsWith(month).toArray();
  return transactions
    .filter((transaction) => transaction.type === 'expense' && transaction.currency === 'TRY')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

async function getCategorySpentForMonth(
  month: string,
  categoryId: string,
  database: TapTrackDatabase
) {
  const transactions = await database.transactions.where('date').startsWith(month).toArray();
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        transaction.currency === 'TRY' &&
        transaction.categoryId === categoryId
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export async function deleteCategory(
  categoryId: string,
  database: TapTrackDatabase = db
): Promise<void> {
  await ensureDatabaseSeeded(database);

  await database.transaction('rw', database.categories, database.categoryBudgets, database.transactions, async () => {
    // Find a replacement category (prefer "Other" or first available expense category)
    const otherCategory = await database.categories
      .where('id')
      .equals('cat-other')
      .first();
    const replacementCategory = otherCategory || (await database.categories.where('type').equals('expense').first());
    const replacementCategoryId = replacementCategory?.id || categoryId;

    // Update all transactions using this category to use replacement
    const transactions = await database.transactions
      .where('categoryId')
      .equals(categoryId)
      .toArray();

    for (const transaction of transactions) {
      await database.transactions.update(transaction.id, {
        categoryId: replacementCategoryId,
        updatedAt: new Date().toISOString(),
      });
    }

    // Delete all category budgets for this category
    await database.categoryBudgets
      .where('categoryId')
      .equals(categoryId)
      .delete();

    // Delete the category itself
    await database.categories.delete(categoryId);
  });

  void pushRecord('categories', { id: categoryId, _deleted: true } as unknown as Record<string, unknown>);
}
