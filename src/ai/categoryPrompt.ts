import type { Category } from '@/types';

export interface CategorizeRequest {
  title: string;
  categories: Pick<Category, 'id' | 'name' | 'type'>[];
  transactionType: 'income' | 'expense';
}

/**
 * Builds the Ollama prompt for one-shot category classification.
 * The model must reply with exactly one categoryId from the list.
 */
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

/**
 * Parses the raw Ollama response text to extract a category id.
 * Returns null if the model returned something unexpected.
 */
export function parseCategoryResponse(
  responseText: string,
  validIds: Set<string>
): string | null {
  const candidate = responseText.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (validIds.has(candidate)) return candidate;
  // Try to find any valid id token anywhere in the response
  for (const id of validIds) {
    if (responseText.toLowerCase().includes(id)) return id;
  }
  return null;
}
