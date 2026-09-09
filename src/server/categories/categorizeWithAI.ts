import {
  buildCategoryPrompt,
  parseCategoryResponse,
  type CategorizeRequest,
  type ParsedCategoryEvaluation,
} from '@/ai/categoryPrompt';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';

interface GroqChatCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export type ServerCategoryEvaluation = ParsedCategoryEvaluation & {
  unavailable: boolean;
};

export async function categorizeWithAI(
  request: CategorizeRequest
): Promise<ServerCategoryEvaluation> {
  const relevantCategories = request.categories.filter(
    (category) => category.type === request.transactionType
  );
  if (relevantCategories.length === 0 && request.recommendNewCategories !== true) {
    return { existing: null, newCategory: null, unavailable: false };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { existing: null, newCategory: null, unavailable: true };

  const normalizedRequest: CategorizeRequest = {
    ...request,
    categories: relevantCategories,
  };
  const prompt = buildCategoryPrompt(normalizedRequest);

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
        max_completion_tokens: 220,
        messages: [
          {
            role: 'system',
            content: 'Return only valid JSON matching the exact object shape in the user prompt. Never add prose or markdown.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return { existing: null, newCategory: null, unavailable: true };

    const data = (await response.json()) as GroqChatCompletion;
    const raw = data.choices?.[0]?.message?.content ?? '';
    return {
      ...parseCategoryResponse(raw, normalizedRequest),
      unavailable: false,
    };
  } catch {
    return { existing: null, newCategory: null, unavailable: true };
  }
}
