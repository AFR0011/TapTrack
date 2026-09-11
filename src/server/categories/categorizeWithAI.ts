import {
  buildCategoryPrompt,
  parseCategoryResponse,
  type CategorizeRequest,
  type ParsedCategoryEvaluation,
} from '@/ai/categoryPrompt';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const GROQ_TIMEOUT_MS = 2500;

interface GroqChatCompletion {
  choices?: Array<{
    finish_reason?: string | null;
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
  const startedAt = Date.now();

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
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: 512,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'taptrack_category_evaluation',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                existing: {
                  anyOf: [
                    {
                      type: 'object',
                      properties: {
                        categoryId: { type: 'string' },
                        fit: { type: 'number', minimum: 0, maximum: 1 },
                      },
                      required: ['categoryId', 'fit'],
                      additionalProperties: false,
                    },
                    { type: 'null' },
                  ],
                },
                newCategory: {
                  anyOf: [
                    {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        icon: { type: 'string' },
                        color: { type: 'string' },
                        fit: { type: 'number', minimum: 0, maximum: 1 },
                      },
                      required: ['name', 'icon', 'color', 'fit'],
                      additionalProperties: false,
                    },
                    { type: 'null' },
                  ],
                },
              },
              required: ['existing', 'newCategory'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'Classify the transaction using the supplied categories. Follow the response schema exactly.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn('AI categorization upstream request failed', {
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return { existing: null, newCategory: null, unavailable: true };
    }

    const data = (await response.json()) as GroqChatCompletion;
    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw) {
      console.warn('AI categorization returned no content', {
        finishReason: data.choices?.[0]?.finish_reason ?? null,
        durationMs: Date.now() - startedAt,
      });
      return { existing: null, newCategory: null, unavailable: true };
    }

    const evaluation = parseCategoryResponse(raw, normalizedRequest);
    console.info('AI categorization completed', {
      durationMs: Date.now() - startedAt,
      finishReason: data.choices?.[0]?.finish_reason ?? null,
      existingCategory: Boolean(evaluation.existing),
      newCategory: Boolean(evaluation.newCategory),
    });

    return {
      ...evaluation,
      unavailable: false,
    };
  } catch (error) {
    console.warn('AI categorization request did not complete', {
      reason: error instanceof Error ? error.name : 'unknown',
      durationMs: Date.now() - startedAt,
    });
    return { existing: null, newCategory: null, unavailable: true };
  }
}
