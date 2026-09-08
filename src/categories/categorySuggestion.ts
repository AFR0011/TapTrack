import { findCategoryForTransaction } from '@/defaultData';
import type { Category, TransactionType } from '@/types';

export type CategorySuggestionSource = 'local' | 'ai' | 'manual';
export type AICategorySuggestionStatus = 'suggested' | 'none' | 'unavailable';

export type AICategorySuggestionResult = {
  categoryId: string | null;
  status: AICategorySuggestionStatus;
};

export function getLocalCategorySuggestion(
  categories: Category[],
  type: TransactionType,
  title: string
): Category | undefined {
  return findCategoryForTransaction(categories, type, title);
}

export async function fetchAICategorySuggestion(
  title: string,
  transactionType: TransactionType,
  categories: Category[],
  signal?: AbortSignal
): Promise<AICategorySuggestionResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { categoryId: null, status: 'none' };

  try {
    const response = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: trimmedTitle,
        transactionType,
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          type: category.type,
        })),
      }),
      signal,
    });

    if (!response.ok) return { categoryId: null, status: 'unavailable' };

    const body = (await response.json()) as {
      categoryId?: unknown;
      unavailable?: unknown;
    };
    if (body.unavailable === true) return { categoryId: null, status: 'unavailable' };
    if (typeof body.categoryId !== 'string' || !body.categoryId) {
      return { categoryId: null, status: 'none' };
    }

    const allowed = categories.some(
      (category) => category.type === transactionType && category.id === body.categoryId
    );
    return allowed
      ? { categoryId: body.categoryId, status: 'suggested' }
      : { categoryId: null, status: 'none' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { categoryId: null, status: 'none' };
    }
    return { categoryId: null, status: 'unavailable' };
  }
}
