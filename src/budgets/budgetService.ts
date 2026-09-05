import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getPreviousMonth } from '@/dates';
import type { Category, CategoryBudget, MonthlyBudget, TransactionType } from '@/types';
import { deleteRecord, pushRecord } from '@/sync/syncService';

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

export type CategoryUpdateInput = {
  id: string;
  name: string;
  type: TransactionType;
  color?: string;
  icon?: string;
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
  let rolloverFromPreviousMonth =
    input.rolloverFromPreviousMonth ?? existing?.rolloverFromPreviousMonth ?? 0;

  if (input.rolloverFromPreviousMonth === undefined && !existing) {
    const previousMonth = getPreviousMonth(input.month);
    const previousBudget = await getMonthlyBudget(previousMonth, database);
    const previousSpent = await getTotalSpentForMonth(previousMonth, database);
    rolloverFromPreviousMonth = previousBudget
      ? calculateRollover(
          previousBudget.totalBudget + previousBudget.rolloverFromPreviousMonth,
          previousSpent
        )
      : 0;
  }

  const budget: MonthlyBudget = {
    id: existing?.id ?? getMonthlyBudgetId(input.month),
    month: input.month,
    totalBudget: input.totalBudget,
    rolloverFromPreviousMonth,
    currency: 'TRY',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.monthlyBudgets.put(budget);
  void pushRecord('monthlyBudgets', budget as unknown as Record<string, unknown>, database);
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
  void pushRecord('categoryBudgets', budget as unknown as Record<string, unknown>, database);
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
  const now = new Date().toISOString();
  const updatedTransactions: Array<Record<string, unknown>> = [];
  let deletedCategoryBudgetIds: string[] = [];

  await database.transaction('rw', database.categories, database.categoryBudgets, database.transactions, async () => {
    const category = await database.categories.get(categoryId);
    if (!category) {
      throw new Error('Category not found.');
    }
    if (category.isDefault) {
      throw new Error('Default categories cannot be deleted.');
    }

    // Update all transactions using this category to use replacement
    const transactions = await database.transactions
      .where('categoryId')
      .equals(categoryId)
      .toArray();

    for (const transaction of transactions) {
      const replacementCategoryId = await getFallbackCategoryId(transaction.type, database, categoryId);
      await database.transactions.update(transaction.id, {
        categoryId: replacementCategoryId,
        updatedAt: now,
      });
      updatedTransactions.push({
        ...transaction,
        categoryId: replacementCategoryId,
        updatedAt: now,
      });
    }

    // Delete all category budgets for this category
    const categoryBudgets = await database.categoryBudgets
      .where('categoryId')
      .equals(categoryId)
      .toArray();
    deletedCategoryBudgetIds = categoryBudgets.map((budget) => budget.id);

    await database.categoryBudgets
      .where('categoryId')
      .equals(categoryId)
      .delete();

    // Delete the category itself
    await database.categories.delete(categoryId);
  });

  updatedTransactions.forEach((transaction) => {
    void pushRecord('transactions', transaction as unknown as Record<string, unknown>, database);
  });
  deletedCategoryBudgetIds.forEach((budgetId) => {
    void deleteRecord('categoryBudgets', budgetId, database);
  });
  void deleteRecord('categories', categoryId, database);
}

export async function updateCategory(
  input: CategoryUpdateInput,
  database: TapTrackDatabase = db
): Promise<Category> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  const updatedTransactions: Array<Record<string, unknown>> = [];
  let updatedCategory: Category | null = null;

  await database.transaction('rw', database.categories, database.transactions, async () => {
    const existing = await database.categories.get(input.id);
    if (!existing) {
      throw new Error('Category not found.');
    }

    const nextName = input.name.trim();
    if (!nextName) {
      throw new Error('Category name is required.');
    }
    if (existing.isDefault && input.type !== existing.type) {
      throw new Error('Default category type cannot be changed.');
    }

    updatedCategory = {
      ...existing,
      name: nextName,
      type: input.type,
      color: input.color || existing.color,
      icon: input.icon || existing.icon,
      updatedAt: now,
    };

    await database.categories.put(updatedCategory);

    if (existing.type !== input.type) {
      const transactions = await database.transactions
        .where('categoryId')
        .equals(input.id)
        .toArray();

      for (const transaction of transactions) {
        if (transaction.type === input.type) continue;

        const replacementCategoryId = await getFallbackCategoryId(
          transaction.type,
          database,
          input.id
        );
        await database.transactions.update(transaction.id, {
          categoryId: replacementCategoryId,
          updatedAt: now,
        });
        updatedTransactions.push({
          ...transaction,
          categoryId: replacementCategoryId,
          updatedAt: now,
        });
      }
    }
  });

  if (!updatedCategory) {
    throw new Error('Category was not updated.');
  }

  void pushRecord('categories', updatedCategory as unknown as Record<string, unknown>, database);
  updatedTransactions.forEach((transaction) => {
    void pushRecord('transactions', transaction, database);
  });

  return updatedCategory;
}

async function getFallbackCategoryId(
  type: TransactionType,
  database: TapTrackDatabase,
  excludedCategoryId?: string
): Promise<string> {
  const preferredId = type === 'income' ? 'cat-income' : 'cat-other';
  const preferred = await database.categories.get(preferredId);
  if (preferred && preferred.id !== excludedCategoryId && preferred.type === type) {
    return preferred.id;
  }

  const fallback = await database.categories
    .where('type')
    .equals(type)
    .filter((category) => category.id !== excludedCategoryId)
    .first();

  if (!fallback) {
    throw new Error(`No fallback ${type} category is available.`);
  }

  return fallback.id;
}
