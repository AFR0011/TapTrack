import { buildCategoryPrompt, parseCategoryResponse, type CategorizeRequest } from '@/ai/categoryPrompt';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';

interface GroqChatCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export type ServerCategorySuggestion = {
  categoryId: string | null;
  unavailable: boolean;
};

export async function categorizeWithAI(
  request: CategorizeRequest
): Promise<ServerCategorySuggestion> {
  const relevantCategories = request.categories.filter(
    (category) => category.type === request.transactionType
  );
  if (relevantCategories.length === 0) {
    return { categoryId: null, unavailable: false };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { categoryId: null, unavailable: true };

  const validIds = new Set(relevantCategories.map((category) => category.id.toLowerCase()));
  const prompt = buildCategoryPrompt({ ...request, categories: relevantCategories });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
        temperature: 0,
        max_completion_tokens: 24,
        messages: [
          {
            role: 'system',
            content: 'Return exactly one category ID from the supplied list and nothing else.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return { categoryId: null, unavailable: true };

    const data = (await response.json()) as GroqChatCompletion;
    const raw = data.choices?.[0]?.message?.content ?? '';
    return {
      categoryId: parseCategoryResponse(raw, validIds),
      unavailable: false,
    };
  } catch {
    return { categoryId: null, unavailable: true };
  }
}
