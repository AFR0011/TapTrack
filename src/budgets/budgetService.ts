import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { getPreviousMonth } from '@/dates';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import type { Category, CategoryBudget, Currency, MonthlyBudget, TransactionType } from '@/types';
import { flushSyncQueueBestEffort, queueDeleteForSync, queueRecordForSync } from '@/sync/syncService';

export type MonthlyBudgetInput = { month: string; totalBudget: number; rolloverFromPreviousMonth?: number; currency?: Currency };
export type CategoryBudgetInput = { month: string; categoryId: string; amount: number; currency?: Currency };
export type MonthlyBudgetStatus = { totalBudget: number; rollover: number; available: number; totalSpent: number; remaining: number; currency: Currency };
export type CategoryBudgetStatus = { categoryId: string; budget: number; spent: number; remaining: number; currency: Currency };
export type CategoryUpdateInput = { id: string; name: string; type: TransactionType; color?: string; icon?: string };

export function getMonthlyBudgetId(month: string, currency: Currency) {
  return `budget-${month}-${currency}`;
}

export function getCategoryBudgetId(month: string, categoryId: string, currency: Currency) {
  return `category-budget-${month}-${currency}-${categoryId}`;
}

async function resolveBudgetCurrency(
  currency: Currency | undefined,
  database: TapTrackDatabase
): Promise<Currency> {
  if (currency) return currency;
  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  return settings?.defaultCurrency ?? 'TRY';
}

export async function getMonthlyBudget(
  month: string,
  currency?: Currency,
  database: TapTrackDatabase = db
): Promise<MonthlyBudget | null> {
  await ensureDatabaseSeeded(database);
  const resolvedCurrency = await resolveBudgetCurrency(currency, database);
  return (
    (await database.monthlyBudgets
      .where('month')
      .equals(month)
      .filter((budget) => budget.currency === resolvedCurrency)
      .first()) ?? null
  );
}

export async function upsertMonthlyBudget(
  input: MonthlyBudgetInput,
  database: TapTrackDatabase = db
): Promise<MonthlyBudget> {
  await ensureDatabaseSeeded(database);
  const currency = await resolveBudgetCurrency(input.currency, database);
  const now = new Date().toISOString();
  const existing = await getMonthlyBudget(input.month, currency, database);
  let rolloverFromPreviousMonth = input.rolloverFromPreviousMonth ?? existing?.rolloverFromPreviousMonth ?? 0;

  if (input.rolloverFromPreviousMonth === undefined && !existing) {
    const previousMonth = getPreviousMonth(input.month);
    const previousBudget = await getMonthlyBudget(previousMonth, currency, database);
    const previousSpent = await getTotalSpentForMonth(previousMonth, currency, database);
    rolloverFromPreviousMonth = previousBudget
      ? calculateRollover(
          previousBudget.totalBudget + previousBudget.rolloverFromPreviousMonth,
          previousSpent
        )
      : 0;
  }

  const budget: MonthlyBudget = {
    id: existing?.id ?? getMonthlyBudgetId(input.month, currency),
    month: input.month,
    totalBudget: input.totalBudget,
    rolloverFromPreviousMonth,
    currency,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await database.transaction('rw', [database.monthlyBudgets, database.syncOutbox], async () => {
    await database.monthlyBudgets.put(budget);
    await queueRecordForSync(
      'monthlyBudgets',
      budget as unknown as Record<string, unknown>,
      database
    );
  });
  void flushSyncQueueBestEffort(database);
  return budget;
}

export async function getCategoryBudget(
  month: string,
  categoryId: string,
  currency?: Currency,
  database: TapTrackDatabase = db
): Promise<CategoryBudget | null> {
  await ensureDatabaseSeeded(database);
  const resolvedCurrency = await resolveBudgetCurrency(currency, database);
  return (
    (await database.categoryBudgets
      .where('month')
      .equals(month)
      .filter(
        (budget) => budget.categoryId === categoryId && budget.currency === resolvedCurrency
      )
      .first()) ?? null
  );
}

export async function upsertCategoryBudget(
  input: CategoryBudgetInput,
  database: TapTrackDatabase = db
): Promise<CategoryBudget> {
  await ensureDatabaseSeeded(database);
  const currency = await resolveBudgetCurrency(input.currency, database);
  const now = new Date().toISOString();
  const existing = await getCategoryBudget(input.month, input.categoryId, currency, database);
  const budget: CategoryBudget = {
    id: existing?.id ?? getCategoryBudgetId(input.month, input.categoryId, currency),
    month: input.month,
    categoryId: input.categoryId,
    amount: input.amount,
    currency,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await database.transaction('rw', [database.categoryBudgets, database.syncOutbox], async () => {
    await database.categoryBudgets.put(budget);
    await queueRecordForSync(
      'categoryBudgets',
      budget as unknown as Record<string, unknown>,
      database
    );
  });
  void flushSyncQueueBestEffort(database);
  return budget;
}

export async function deleteCategoryBudget(
  month: string,
  categoryId: string,
  currency: Currency,
  database: TapTrackDatabase = db
): Promise<void> {
  await ensureDatabaseSeeded(database);
  const existing = await getCategoryBudget(month, categoryId, currency, database);
  if (!existing) return;
  await database.transaction('rw', [database.categoryBudgets, database.syncOutbox], async () => {
    await database.categoryBudgets.delete(existing.id);
    await queueDeleteForSync('categoryBudgets', existing.id, database);
  });
  void flushSyncQueueBestEffort(database);
}

export function calculateRollover(totalBudget: number, totalSpent: number) {
  return Math.max(0, totalBudget - totalSpent);
}

export async function getMonthlyBudgetStatus(
  month: string,
  currency?: Currency,
  database: TapTrackDatabase = db
): Promise<MonthlyBudgetStatus> {
  await ensureDatabaseSeeded(database);
  const resolvedCurrency = await resolveBudgetCurrency(currency, database);
  const budget = await getMonthlyBudget(month, resolvedCurrency, database);
  const totalSpent = await getTotalSpentForMonth(month, resolvedCurrency, database);
  const totalBudget = budget?.totalBudget ?? 0;
  const rollover = budget?.rolloverFromPreviousMonth ?? 0;
  const available = totalBudget + rollover;
  return {
    totalBudget,
    rollover,
    available,
    totalSpent,
    remaining: available - totalSpent,
    currency: resolvedCurrency,
  };
}

export async function getCategoryBudgetStatus(
  month: string,
  categoryId: string,
  currency?: Currency,
  database: TapTrackDatabase = db
): Promise<CategoryBudgetStatus> {
  await ensureDatabaseSeeded(database);
  const resolvedCurrency = await resolveBudgetCurrency(currency, database);
  const categoryBudget = await getCategoryBudget(month, categoryId, resolvedCurrency, database);
  const spent = await getCategorySpentForMonth(
    month,
    categoryId,
    resolvedCurrency,
    database
  );
  const budget = categoryBudget?.amount ?? 0;
  return {
    categoryId,
    budget,
    spent,
    remaining: budget - spent,
    currency: resolvedCurrency,
  };
}

export async function prepareMonthlyRollover(
  month: string,
  totalBudget: number,
  database: TapTrackDatabase = db
) {
  await ensureDatabaseSeeded(database);
  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  const currency = settings?.defaultCurrency ?? 'TRY';
  const previousMonth = getPreviousMonth(month);
  const previousBudget = await getMonthlyBudget(previousMonth, currency, database);
  const previousSpent = await getTotalSpentForMonth(previousMonth, currency, database);
  const rolloverFromPreviousMonth = previousBudget
    ? calculateRollover(
        previousBudget.totalBudget + previousBudget.rolloverFromPreviousMonth,
        previousSpent
      )
    : 0;
  return upsertMonthlyBudget(
    { month, totalBudget, rolloverFromPreviousMonth, currency },
    database
  );
}

async function getTotalSpentForMonth(
  month: string,
  currency: Currency,
  database: TapTrackDatabase
) {
  const transactions = await database.transactions.where('date').startsWith(month).toArray();
  return transactions
    .filter(
      (transaction) => transaction.type === 'expense' && transaction.currency === currency
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

async function getCategorySpentForMonth(
  month: string,
  categoryId: string,
  currency: Currency,
  database: TapTrackDatabase
) {
  const transactions = await database.transactions.where('date').startsWith(month).toArray();
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        transaction.currency === currency &&
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
  await database.transaction(
    'rw',
    [database.categories, database.categoryBudgets, database.transactions, database.syncOutbox],
    async () => {
      const category = await database.categories.get(categoryId);
      if (!category) throw new Error('Category not found.');
      if (category.isDefault) throw new Error('Default categories cannot be deleted.');
      const transactions = await database.transactions.where('categoryId').equals(categoryId).toArray();
      for (const transaction of transactions) {
        const replacementCategoryId = await getFallbackCategoryId(
          transaction.type,
          database,
          categoryId
        );
        const updatedTransaction = {
          ...transaction,
          categoryId: replacementCategoryId,
          updatedAt: now,
        };
        await database.transactions.put(updatedTransaction);
        await queueRecordForSync(
          'transactions',
          updatedTransaction as unknown as Record<string, unknown>,
          database
        );
      }
      const categoryBudgets = await database.categoryBudgets
        .where('categoryId')
        .equals(categoryId)
        .toArray();
      for (const budget of categoryBudgets) {
        await database.categoryBudgets.delete(budget.id);
        await queueDeleteForSync('categoryBudgets', budget.id, database);
      }
      await database.categories.delete(categoryId);
      await queueDeleteForSync('categories', categoryId, database);
    }
  );
  void flushSyncQueueBestEffort(database);
}

export async function updateCategory(
  input: CategoryUpdateInput,
  database: TapTrackDatabase = db
): Promise<Category> {
  await ensureDatabaseSeeded(database);
  const now = new Date().toISOString();
  let updatedCategory: Category | null = null;
  await database.transaction(
    'rw',
    [database.categories, database.transactions, database.syncOutbox],
    async () => {
      const existing = await database.categories.get(input.id);
      if (!existing) throw new Error('Category not found.');
      const nextName = input.name.trim();
      if (!nextName) throw new Error('Category name is required.');
      if (existing.isDefault && input.type !== existing.type) {
        throw new Error('Default category type cannot be changed.');
      }
      const nextCategory: Category = {
        ...existing,
        name: nextName,
        type: input.type,
        color: input.color || existing.color,
        icon: input.icon || existing.icon,
        updatedAt: now,
      };
      updatedCategory = nextCategory;
      await database.categories.put(nextCategory);
      await queueRecordForSync(
        'categories',
        nextCategory as unknown as Record<string, unknown>,
        database
      );
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
          const updatedTransaction = {
            ...transaction,
            categoryId: replacementCategoryId,
            updatedAt: now,
          };
          await database.transactions.put(updatedTransaction);
          await queueRecordForSync(
            'transactions',
            updatedTransaction as unknown as Record<string, unknown>,
            database
          );
        }
      }
    }
  );
  if (!updatedCategory) throw new Error('Category was not updated.');
  void flushSyncQueueBestEffort(database);
  return updatedCategory;
}

async function getFallbackCategoryId(
  type: TransactionType,
  database: TapTrackDatabase,
  excludedCategoryId?: string
): Promise<string> {
  const preferredId = type === 'income' ? 'cat-income' : 'cat-other';
  const preferred = await database.categories.get(preferredId);
  if (preferred && preferred.id !== excludedCategoryId && preferred.type === type) return preferred.id;
  const fallback = await database.categories
    .where('type')
    .equals(type)
    .filter((category) => category.id !== excludedCategoryId)
    .first();
  if (!fallback) throw new Error(`No fallback ${type} category is available.`);
  return fallback.id;
}
