import { CATEGORY_COLOR_VALUES, CATEGORY_ICON_IDS } from '@/categories/categoryVisualTokens';
import type { Category, TransactionType } from '@/types';

export interface CategorizeRequest {
  title: string;
  categories: Pick<Category, 'id' | 'name' | 'type'>[];
  transactionType: TransactionType;
  recommendNewCategories?: boolean;
}

export type ExistingCategorySuggestion = {
  kind: 'existing';
  categoryId: string;
  confidence: number;
};

export type NewCategorySuggestion = {
  kind: 'new';
  suggestion: {
    name: string;
    icon: string;
    color: string;
    type: TransactionType;
  };
  confidence: number;
};

export type ParsedCategorySuggestion =
  | ExistingCategorySuggestion
  | NewCategorySuggestion
  | { kind: 'none' };

export function buildCategoryPrompt(request: CategorizeRequest): string {
  const relevant = request.categories.filter((category) => category.type === request.transactionType);
  const listItems = relevant.length
    ? relevant.map((category) => `- ${category.id}: "${category.name}"`).join('\n')
    : '- none';
  const recommendationRule = request.recommendNewCategories
    ? `If none of the existing categories is a natural fit, you may propose ONE reusable category. A new category should be broad enough to use again, not merchant-specific or transaction-specific. Use exactly one allowed icon and color.\nAllowed icons: ${CATEGORY_ICON_IDS.join(', ')}\nAllowed colors: ${CATEGORY_COLOR_VALUES.join(', ')}`
    : 'You must use an existing category. Do not propose a new category.';

  return `You are categorizing one personal-finance transaction.

Transaction type: ${request.transactionType}
Transaction description: ${JSON.stringify(request.title)}

Existing categories:
${listItems}

${recommendationRule}

Return JSON only, with no markdown or explanation.
For an existing category:
{"kind":"existing","categoryId":"<exact id>","confidence":0.0}

${request.recommendNewCategories ? `For a genuinely useful new category:
{"kind":"new","name":"<short reusable name>","icon":"<allowed icon>","color":"<allowed color>","confidence":0.0}

` : ''}If the description is too vague to make a useful choice:
{"kind":"none"}`;
}

export function parseCategoryResponse(
  responseText: string,
  request: CategorizeRequest
): ParsedCategorySuggestion {
  const parsed = parseJsonObject(responseText);
  if (!parsed) return { kind: 'none' };

  const relevant = request.categories.filter((category) => category.type === request.transactionType);
  const categoryById = new Map(relevant.map((category) => [category.id.toLowerCase(), category]));

  if (parsed.kind === 'existing' && typeof parsed.categoryId === 'string') {
    const category = categoryById.get(parsed.categoryId.trim().toLowerCase());
    if (!category) return { kind: 'none' };
    return {
      kind: 'existing',
      categoryId: category.id,
      confidence: normalizeConfidence(parsed.confidence),
    };
  }

  if (parsed.kind !== 'new' || request.recommendNewCategories !== true) {
    return { kind: 'none' };
  }

  const name = typeof parsed.name === 'string' ? parsed.name.trim().replace(/\s+/g, ' ') : '';
  const icon = typeof parsed.icon === 'string' ? parsed.icon : '';
  const color = typeof parsed.color === 'string' ? parsed.color : '';
  if (name.length < 2 || name.length > 40) return { kind: 'none' };
  if (!CATEGORY_ICON_IDS.some((value) => value === icon)) return { kind: 'none' };
  if (!CATEGORY_COLOR_VALUES.some((value) => value === color)) return { kind: 'none' };

  const existingByName = relevant.find(
    (category) => category.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (existingByName) {
    return {
      kind: 'existing',
      categoryId: existingByName.id,
      confidence: normalizeConfidence(parsed.confidence),
    };
  }

  return {
    kind: 'new',
    suggestion: {
      name,
      icon,
      color,
      type: request.transactionType,
    },
    confidence: normalizeConfidence(parsed.confidence),
  };
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
