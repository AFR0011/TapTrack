import { describe, expect, it } from 'vitest';
import { buildCategoryPrompt, parseCategoryResponse } from './categoryPrompt';

describe('categoryPrompt helpers', () => {
  it('builds a prompt with only categories that match transaction type', () => {
    const prompt = buildCategoryPrompt({
      title: 'Spotify Premium',
      transactionType: 'expense',
      categories: [
        { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense' },
        { id: 'cat-income', name: 'Income', type: 'income' },
      ],
    });

    expect(prompt).toContain('cat-subscriptions');
    expect(prompt).not.toContain('cat-income');
    expect(prompt).toContain('Transaction title: "Spotify Premium"');
  });

  it('parses a direct model response token', () => {
    const validIds = new Set(['cat-food', 'cat-rent']);
    expect(parseCategoryResponse('cat-food', validIds)).toBe('cat-food');
  });

  it('finds a valid category id inside verbose responses', () => {
    const validIds = new Set(['cat-food', 'cat-rent']);
    expect(parseCategoryResponse('Best match is cat-rent for this title.', validIds)).toBe('cat-rent');
  });

  it('returns null when response has no valid category id', () => {
    const validIds = new Set(['cat-food', 'cat-rent']);
    expect(parseCategoryResponse('unknown', validIds)).toBeNull();
  });
});
