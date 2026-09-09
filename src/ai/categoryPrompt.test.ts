import { describe, expect, it } from 'vitest';
import { buildCategoryPrompt, parseCategoryResponse } from './categoryPrompt';

const request = {
  title: 'Spotify Premium',
  transactionType: 'expense' as const,
  categories: [
    { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense' as const },
    { id: 'cat-food', name: 'Food', type: 'expense' as const },
    { id: 'cat-income', name: 'Income', type: 'income' as const },
  ],
};

describe('categoryPrompt helpers', () => {
  it('builds a prompt with only categories that match transaction type', () => {
    const prompt = buildCategoryPrompt(request);

    expect(prompt).toContain('cat-subscriptions');
    expect(prompt).toContain('cat-food');
    expect(prompt).not.toContain('cat-income');
    expect(prompt).toContain('Transaction description: "Spotify Premium"');
  });

  it('parses a validated existing-category response', () => {
    expect(
      parseCategoryResponse(
        '{"kind":"existing","categoryId":"cat-subscriptions","confidence":0.91}',
        request
      )
    ).toEqual({
      kind: 'existing',
      categoryId: 'cat-subscriptions',
      confidence: 0.91,
    });
  });

  it('rejects existing category ids from the wrong transaction type', () => {
    expect(
      parseCategoryResponse(
        '{"kind":"existing","categoryId":"cat-income","confidence":0.9}',
        request
      )
    ).toEqual({ kind: 'none' });
  });

  it('accepts a constrained reusable new-category proposal when enabled', () => {
    expect(
      parseCategoryResponse(
        '{"kind":"new","name":"Transport","icon":"bus","color":"#2563eb","confidence":0.84}',
        { ...request, recommendNewCategories: true }
      )
    ).toEqual({
      kind: 'new',
      suggestion: {
        name: 'Transport',
        icon: 'bus',
        color: '#2563eb',
        type: 'expense',
      },
      confidence: 0.84,
    });
  });

  it('rejects new-category proposals when recommendations are disabled', () => {
    expect(
      parseCategoryResponse(
        '{"kind":"new","name":"Transport","icon":"bus","color":"#2563eb","confidence":0.84}',
        request
      )
    ).toEqual({ kind: 'none' });
  });
});
