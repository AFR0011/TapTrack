import type { Category } from '@/types';

export interface CategorizeRequest {
  title: string;
  categories: Pick<Category, 'id' | 'name' | 'type'>[];
  transactionType: 'income' | 'expense';
}

/** Builds the one-shot category classification prompt for the hosted AI provider. */
export function buildCategoryPrompt(request: CategorizeRequest): string {
  const relevant = request.categories.filter((c) => c.type === request.transactionType);
  const listItems = relevant.map((c) => `- ${c.id}: "${c.name}"`).join('\n');

  return `You are a personal finance assistant. Classify the transaction title into exactly one category.

Available categories:
${listItems}

Rules:
- Reply with ONLY the categoryId (e.g. cat-food). No explanation.
- If unsure, reply with the most general category id.

Transaction title: "${request.title}"
Category id:`;
}

/** Returns null when the provider response does not contain an allowed category id. */
export function parseCategoryResponse(
  responseText: string,
  validIds: Set<string>
): string | null {
  const candidate = responseText.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (validIds.has(candidate)) return candidate;
  for (const id of validIds) {
    if (responseText.toLowerCase().includes(id)) return id;
  }
  return null;
}
