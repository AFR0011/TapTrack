import { findCategoryForTransaction } from '@/defaultData';
import { isCategoryColor, isCategoryIconId } from '@/categories/categoryVisualTokens';
import type { Category, TransactionType } from '@/types';

export type CategorySuggestionSource = 'local' | 'ai' | 'manual';
export type AICategorySuggestionStatus = 'suggested' | 'none' | 'unavailable';

export type SuggestedNewCategory = {
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
};

export type AICategorySuggestionResult = {
  kind: 'existing' | 'new' | 'none';
  categoryId: string | null;
  newCategory: SuggestedNewCategory | null;
  confidence: number | null;
  status: AICategorySuggestionStatus;
};

const NONE: AICategorySuggestionResult = {
  kind: 'none',
  categoryId: null,
  newCategory: null,
  confidence: null,
  status: 'none',
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
  options: { recommendNewCategories?: boolean; signal?: AbortSignal } = {}
): Promise<AICategorySuggestionResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return NONE;

  try {
    const response = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: trimmedTitle,
        transactionType,
        recommendNewCategories: options.recommendNewCategories ?? false,
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          type: category.type,
        })),
      }),
      signal: options.signal,
    });

    if (!response.ok) return { ...NONE, status: 'unavailable' };

    const body = (await response.json()) as Record<string, unknown>;
    if (body.unavailable === true) return { ...NONE, status: 'unavailable' };

    if (body.kind === 'existing' && typeof body.categoryId === 'string') {
      const allowed = categories.some(
        (category) => category.type === transactionType && category.id === body.categoryId
      );
      if (!allowed) return NONE;
      return {
        kind: 'existing',
        categoryId: body.categoryId,
        newCategory: null,
        confidence: normalizeConfidence(body.confidence),
        status: 'suggested',
      };
    }

    if (
      body.kind === 'new' &&
      options.recommendNewCategories === true &&
      body.suggestion &&
      typeof body.suggestion === 'object' &&
      !Array.isArray(body.suggestion)
    ) {
      const suggestion = body.suggestion as Record<string, unknown>;
      const name = typeof suggestion.name === 'string' ? suggestion.name.trim() : '';
      const icon = suggestion.icon;
      const color = suggestion.color;
      const type = suggestion.type;
      if (
        name.length >= 2 &&
        name.length <= 40 &&
        isCategoryIconId(icon) &&
        isCategoryColor(color) &&
        type === transactionType
      ) {
        return {
          kind: 'new',
          categoryId: null,
          newCategory: { name, icon, color, type },
          confidence: normalizeConfidence(body.confidence),
          status: 'suggested',
        };
      }
    }

    return NONE;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return NONE;
    return { ...NONE, status: 'unavailable' };
  }
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}
