import { fetchAICategorySuggestion } from '@/categories/categorySuggestion';
import { db, type RavelDatabase } from '@/database';
import { updateTransaction } from '@/transactions/createTransaction';
import type { Category, Transaction, TransactionDraft } from '@/types';

type LateCategorizationDependencies = {
  fetchSuggestion?: typeof fetchAICategorySuggestion;
  update?: typeof updateTransaction;
};

export async function reconcileSavedTransactionCategoryWithAI(
  created: Transaction,
  categories: Category[],
  database: RavelDatabase = db,
  dependencies: LateCategorizationDependencies = {}
): Promise<boolean> {
  const fetchSuggestion = dependencies.fetchSuggestion ?? fetchAICategorySuggestion;
  const update = dependencies.update ?? updateTransaction;
  const suggestion = await fetchSuggestion(created.title, created.type, categories, {
    recommendNewCategories: false,
  });

  if (
    suggestion.kind !== 'existing' ||
    !suggestion.categoryId ||
    suggestion.categoryId === created.categoryId
  ) {
    return false;
  }

  const current = await database.transactions.get(created.id);
  if (
    !current ||
    current.updatedAt !== created.updatedAt ||
    current.categoryId !== created.categoryId
  ) {
    return false;
  }

  const targetCategory = await database.categories.get(suggestion.categoryId);
  if (!targetCategory || targetCategory.type !== current.type) return false;

  await update(current.id, toDraft(current, suggestion.categoryId), database);
  return true;
}

function toDraft(transaction: Transaction, categoryId: string): TransactionDraft {
  return {
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    title: transaction.title,
    categoryId,
    method: transaction.method,
    date: transaction.date,
    note: transaction.note,
    occurredAt: transaction.occurredAt,
    recurringSourceId: transaction.recurringSourceId,
  };
}
