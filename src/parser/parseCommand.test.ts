import { describe, expect, it } from 'vitest';
import { createDefaultCategories } from '@/defaultData';
import { parseCommand } from './parseCommand';

const categories = createDefaultCategories('2026-04-30T00:00:00.000Z');
const today = new Date(2026, 3, 30);

describe('parseCommand', () => {
  it('parses an expense with default TRY currency and explicit method', () => {
    const result = parseCommand('-120 coffee cash', { categories, today });

    expect(result).toEqual({
      ok: true,
      transaction: {
        type: 'expense',
        amount: 120,
        currency: 'TRY',
        title: 'coffee',
        categoryId: 'cat-food',
        method: 'cash',
        date: '2026-04-30',
      },
    });
  });

  it('parses explicit currency and falls back to last used method', () => {
    const result = parseCommand('-9.99 eur spotify', {
      categories,
      defaultMethod: 'card',
      today,
    });

    expect(result).toEqual({
      ok: true,
      transaction: {
        type: 'expense',
        amount: 9.99,
        currency: 'EUR',
        title: 'spotify',
        categoryId: 'cat-subscriptions',
        method: 'card',
        date: '2026-04-30',
      },
    });
  });

  it('keeps income in the income category', () => {
    const result = parseCommand('+20000 salary card', { categories, today });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.categoryId).toBe('cat-income');
      expect(result.transaction.type).toBe('income');
    }
  });

  it('rejects commands without an income or expense sign', () => {
    expect(parseCommand('120 coffee cash', { categories })).toEqual({
      ok: false,
      message: 'Use + or - followed by an amount, title, and optional method.',
    });
  });
});
