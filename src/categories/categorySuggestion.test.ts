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

  it('uses only neutral local fallbacks when AI is not involved', () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');

    expect(getLocalCategorySuggestion(categories, 'expense', 'morning coffee')?.name).toBe('Other');
    expect(getLocalCategorySuggestion(categories, 'expense', 'plane tickets')?.name).toBe('Other');
    expect(getLocalCategorySuggestion(categories, 'expense', 'ChatGPT subscription')?.name).toBe('Other');
    expect(getLocalCategorySuggestion(categories, 'income', 'salary')?.name).toBe('Income');
  });

  it('auto-applies a strong existing-category fit even when a new category also looks useful', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            existing: { categoryId: 'cat-subscriptions', fit: 0.86 },
            newCategory: {
              name: 'Digital services',
              icon: 'repeat',
              color: '#2563eb',
              type: 'expense',
              fit: 0.95,
            },
            unavailable: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await expect(
      fetchAICategorySuggestion('ChatGPT subscription', 'expense', categories, {
        recommendNewCategories: true,
      })
    ).resolves.toEqual({
      kind: 'existing',
      categoryId: 'cat-subscriptions',
      newCategory: null,
      confidence: 0.86,
      status: 'suggested',
    });
  });

  it('recommends Travel when the existing fit is weak but the new-category fit is strong', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            existing: { categoryId: 'cat-fun', fit: 0.38 },
            newCategory: {
              name: 'Travel',
              icon: 'plane',
              color: '#2563eb',
              type: 'expense',
              fit: 0.96,
            },
            unavailable: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await expect(
      fetchAICategorySuggestion('plane tickets', 'expense', categories, {
        recommendNewCategories: true,
      })
    ).resolves.toEqual({
      kind: 'new',
      categoryId: null,
      newCategory: {
        name: 'Travel',
        icon: 'plane',
        color: '#2563eb',
        type: 'expense',
      },
      confidence: 0.96,
      status: 'suggested',
    });
  });

  it('does nothing when neither candidate clears its fit threshold', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            existing: { categoryId: 'cat-fun', fit: 0.79 },
            newCategory: {
              name: 'Travel',
              icon: 'plane',
              color: '#2563eb',
              type: 'expense',
              fit: 0.74,
            },
            unavailable: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await expect(
      fetchAICategorySuggestion('ambiguous tickets', 'expense', categories, {
        recommendNewCategories: true,
      })
    ).resolves.toEqual({
      kind: 'none',
      categoryId: null,
      newCategory: null,
      confidence: null,
      status: 'none',
    });
  });

  it('rejects existing category ids from the wrong transaction type', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            existing: { categoryId: 'cat-income', fit: 0.95 },
            newCategory: null,
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
