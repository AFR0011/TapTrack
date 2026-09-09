import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCategories } from '@/defaultData';
import {
  fetchAICategorySuggestion,
  getLocalCategorySuggestion,
} from './categorySuggestion';

describe('categorySuggestion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the shared local matcher for common expense titles', () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');

    expect(getLocalCategorySuggestion(categories, 'expense', 'morning coffee')?.name).toBe('Food');
    expect(getLocalCategorySuggestion(categories, 'expense', 'weekly groceries')?.name).toBe('Food');
    expect(getLocalCategorySuggestion(categories, 'expense', 'ChatGPT subscription')?.name).toBe('Subscriptions');
    expect(getLocalCategorySuggestion(categories, 'expense', 'cinema tickets')?.name).toBe('Fun');
    expect(getLocalCategorySuggestion(categories, 'expense', 'mystery expense')?.name).toBe('Other');
    expect(getLocalCategorySuggestion(categories, 'income', 'salary')?.name).toBe('Income');
  });

  it('accepts only AI category ids for the requested transaction type', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            kind: 'existing',
            categoryId: 'cat-subscriptions',
            confidence: 0.92,
            unavailable: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await expect(
      fetchAICategorySuggestion('ChatGPT subscription', 'expense', categories)
    ).resolves.toEqual({
      kind: 'existing',
      categoryId: 'cat-subscriptions',
      newCategory: null,
      confidence: 0.92,
      status: 'suggested',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            kind: 'existing',
            categoryId: 'cat-income',
            confidence: 0.95,
            unavailable: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await expect(fetchAICategorySuggestion('coffee', 'expense', categories)).resolves.toEqual({
      kind: 'none',
      categoryId: null,
      newCategory: null,
      confidence: null,
      status: 'none',
    });
  });

  it('falls back cleanly when hosted AI is unavailable', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));

    await expect(fetchAICategorySuggestion('coffee', 'expense', categories)).resolves.toEqual({
      kind: 'none',
      categoryId: null,
      newCategory: null,
      confidence: null,
      status: 'unavailable',
    });
  });
});
