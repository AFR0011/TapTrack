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
  it('builds a prompt that evaluates existing and new-category fit independently', () => {
    const prompt = buildCategoryPrompt({ ...request, recommendNewCategories: true });

    expect(prompt).toContain('cat-subscriptions');
    expect(prompt).toContain('cat-food');
    expect(prompt).not.toContain('cat-income');
    expect(prompt).toContain('Transaction description: "Spotify Premium"');
    expect(prompt).toContain('Evaluate TWO questions independently');
    expect(prompt).toContain('newCategory');
    expect(prompt).toContain('fit');
  });

  it('parses validated existing and new-category candidates from one response', () => {
    expect(
      parseCategoryResponse(
        '{"existing":{"categoryId":"cat-subscriptions","fit":0.91},"newCategory":{"name":"Digital services","icon":"repeat","color":"#2563eb","fit":0.62}}',
        { ...request, recommendNewCategories: true }
      )
    ).toEqual({
      existing: {
        categoryId: 'cat-subscriptions',
        fit: 0.91,
      },
      newCategory: {
        name: 'Digital services',
        icon: 'repeat',
        color: '#2563eb',
        type: 'expense',
        fit: 0.62,
      },
    });
  });

  it('rejects an invalid existing category without discarding a valid new-category candidate', () => {
    expect(
      parseCategoryResponse(
        '{"existing":{"categoryId":"cat-income","fit":0.9},"newCategory":{"name":"Travel","icon":"plane","color":"#2563eb","fit":0.95}}',
        { ...request, recommendNewCategories: true }
      )
    ).toEqual({
      existing: null,
      newCategory: {
        name: 'Travel',
        icon: 'plane',
        color: '#2563eb',
        type: 'expense',
        fit: 0.95,
      },
    });
  });

  it('ignores new-category candidates when recommendations are disabled', () => {
    expect(
      parseCategoryResponse(
        '{"existing":{"categoryId":"cat-food","fit":0.77},"newCategory":{"name":"Travel","icon":"plane","color":"#2563eb","fit":0.95}}',
        request
      )
    ).toEqual({
      existing: {
        categoryId: 'cat-food',
        fit: 0.77,
      },
      newCategory: null,
    });
  });

  it('uses zero fit when the model omits or corrupts the score', () => {
    expect(
      parseCategoryResponse(
        '{"existing":{"categoryId":"cat-food"},"newCategory":null}',
        request
      )
    ).toEqual({
      existing: {
        categoryId: 'cat-food',
        fit: 0,
      },
      newCategory: null,
    });
  });
});
