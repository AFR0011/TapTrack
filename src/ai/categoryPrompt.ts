import { CATEGORY_COLOR_VALUES, CATEGORY_ICON_IDS } from '@/categories/categoryVisualTokens';
import type { Category, TransactionType } from '@/types';

export const EXISTING_CATEGORY_AUTO_APPLY_MIN_FIT = 0.8;
export const NEW_CATEGORY_RECOMMEND_MIN_FIT = 0.75;

export interface CategorizeRequest {
  title: string;
  categories: Pick<Category, 'id' | 'name' | 'type'>[];
  transactionType: TransactionType;
  recommendNewCategories?: boolean;
}

export type ExistingCategoryFit = {
  categoryId: string;
  fit: number;
};

export type NewCategoryFit = {
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  fit: number;
};

export type ParsedCategoryEvaluation = {
  existing: ExistingCategoryFit | null;
  newCategory: NewCategoryFit | null;
};

export function buildCategoryPrompt(request: CategorizeRequest): string {
  const relevant = request.categories.filter((category) => category.type === request.transactionType);
  const listItems = relevant.length
    ? relevant.map((category) => `- ${category.id}: "${category.name}"`).join('\n')
    : '- none';
  const newCategoryRule = request.recommendNewCategories
    ? `Also evaluate independently whether a distinct reusable category would materially improve classification. A new category must be broad enough to reuse, must not duplicate an existing category, and must not be merchant-specific or transaction-specific. Use exactly one allowed icon and color.\nAllowed icons: ${CATEGORY_ICON_IDS.join(', ')}\nAllowed colors: ${CATEGORY_COLOR_VALUES.join(', ')}`
    : 'Set newCategory to null. Do not propose a new category.';

  return `You are evaluating one personal-finance transaction.

Transaction type: ${request.transactionType}
Transaction description: ${JSON.stringify(request.title)}

Existing categories:
${listItems}

Evaluate TWO questions independently:
1. What is the best existing-category semantic fit? Return its exact id and a fit score from 0 to 1. Fit means how naturally and specifically the transaction belongs in that reusable category. Generic catch-all plausibility is not a strong fit. Do not inflate fit merely because a broad category could technically contain the transaction.
2. ${newCategoryRule}

A plausible existing category must NOT suppress a genuinely better new-category proposal. Evaluate both independently.

Return JSON only, with no markdown or explanation, using exactly this shape:
{"existing":{"categoryId":"<exact id>","fit":0.0},"newCategory":${request.recommendNewCategories ? '{"name":"<short reusable name>","icon":"<allowed icon>","color":"<allowed color>","fit":0.0}' : 'null'}}

If no existing category is meaningfully applicable, set existing to null. If no useful new category is warranted, set newCategory to null.`;
}

export function parseCategoryResponse(
  responseText: string,
  request: CategorizeRequest
): ParsedCategoryEvaluation {
  const parsed = parseJsonObject(responseText);
  if (!parsed) return emptyEvaluation();

  const relevant = request.categories.filter((category) => category.type === request.transactionType);
  const categoryById = new Map(relevant.map((category) => [category.id.toLowerCase(), category]));

  let existing: ExistingCategoryFit | null = null;
  if (parsed.existing && typeof parsed.existing === 'object' && !Array.isArray(parsed.existing)) {
    const candidate = parsed.existing as Record<string, unknown>;
    if (typeof candidate.categoryId === 'string') {
      const category = categoryById.get(candidate.categoryId.trim().toLowerCase());
      if (category) {
        existing = {
          categoryId: category.id,
          fit: normalizeFit(candidate.fit),
        };
      }
    }
  }

  let newCategory: NewCategoryFit | null = null;
  if (
    request.recommendNewCategories === true &&
    parsed.newCategory &&
    typeof parsed.newCategory === 'object' &&
    !Array.isArray(parsed.newCategory)
  ) {
    const candidate = parsed.newCategory as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim().replace(/\s+/g, ' ') : '';
    const icon = typeof candidate.icon === 'string' ? candidate.icon : '';
    const color = typeof candidate.color === 'string' ? candidate.color : '';
    const duplicatesExisting = relevant.some(
      (category) => category.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (
      name.length >= 2 &&
      name.length <= 40 &&
      !duplicatesExisting &&
      CATEGORY_ICON_IDS.some((value) => value === icon) &&
      CATEGORY_COLOR_VALUES.some((value) => value === color)
    ) {
      newCategory = {
        name,
        icon,
        color,
        type: request.transactionType,
        fit: normalizeFit(candidate.fit),
      };
    }
  }

  return { existing, newCategory };
}

function emptyEvaluation(): ParsedCategoryEvaluation {
  return { existing: null, newCategory: null };
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

function normalizeFit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
