import { afterEach, describe, expect, it, vi } from 'vitest';
import { categorizeWithAI } from './categorizeWithAI';

const request = {
  title: 'Migros groceries',
  transactionType: 'expense' as const,
  recommendNewCategories: false,
  categories: [
    { id: 'cat-groceries', name: 'Groceries', type: 'expense' as const },
    { id: 'cat-income', name: 'Income', type: 'income' as const },
  ],
};

describe('categorizeWithAI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses low reasoning and strict structured output for the latency-sensitive path', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  existing: { categoryId: 'cat-groceries', fit: 0.96 },
                  newCategory: null,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(categorizeWithAI(request)).resolves.toEqual({
      existing: { categoryId: 'cat-groceries', fit: 0.96 },
      newCategory: null,
      unavailable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.reasoning_format).toBe('hidden');
    expect(body.max_completion_tokens).toBe(512);
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'ravel_category_evaluation',
        strict: true,
      },
    });
  });

  it('fails soft when Groq rejects the request', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));

    await expect(categorizeWithAI(request)).resolves.toEqual({
      existing: null,
      newCategory: null,
      unavailable: true,
    });
  });

  it('does not call Groq when no relevant category exists and new recommendations are disabled', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      categorizeWithAI({
        ...request,
        categories: [{ id: 'cat-income', name: 'Income', type: 'income' as const }],
      })
    ).resolves.toEqual({
      existing: null,
      newCategory: null,
      unavailable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
