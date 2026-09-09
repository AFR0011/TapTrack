import {
  EXISTING_CATEGORY_AUTO_APPLY_MIN_FIT,
  NEW_CATEGORY_RECOMMEND_MIN_FIT,
} from '@/ai/categoryPrompt';
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

    const existing = parseExistingCandidate(body.existing, transactionType, categories);
    if (existing && existing.fit >= EXISTING_CATEGORY_AUTO_APPLY_MIN_FIT) {
      return {
        kind: 'existing',
        categoryId: existing.categoryId,
        newCategory: null,
        confidence: existing.fit,
        status: 'suggested',
      };
    }

    const newCategory =
      options.recommendNewCategories === true
        ? parseNewCategoryCandidate(body.newCategory, transactionType)
        : null;
    if (newCategory && newCategory.fit >= NEW_CATEGORY_RECOMMEND_MIN_FIT) {
      return {
        kind: 'new',
        categoryId: null,
        newCategory: newCategory.suggestion,
        confidence: newCategory.fit,
        status: 'suggested',
      };
    }

    return NONE;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return NONE;
    return { ...NONE, status: 'unavailable' };
  }
}

function parseExistingCandidate(
  value: unknown,
  transactionType: TransactionType,
  categories: Category[]
): { categoryId: string; fit: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.categoryId !== 'string') return null;
  const allowed = categories.some(
    (category) => category.type === transactionType && category.id === candidate.categoryId
  );
  if (!allowed) return null;
  return {
    categoryId: candidate.categoryId,
    fit: normalizeFit(candidate.fit),
  };
}

function parseNewCategoryCandidate(
  value: unknown,
  transactionType: TransactionType
): { suggestion: SuggestedNewCategory; fit: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const icon = candidate.icon;
  const color = candidate.color;
  const type = candidate.type;
  if (
    name.length < 2 ||
    name.length > 40 ||
    typeof icon !== 'string' ||
    !isCategoryIconId(icon) ||
    typeof color !== 'string' ||
    !isCategoryColor(color) ||
    type !== transactionType
  ) {
    return null;
  }

  return {
    suggestion: { name, icon, color, type: transactionType },
    fit: normalizeFit(candidate.fit),
  };
}

function normalizeFit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
