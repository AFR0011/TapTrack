import { describe, expect, it } from 'vitest';
import { createDefaultCategories } from '@/defaultData';
import { parseCommand, parseCommands } from './parseCommand';

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

describe('parseCommands', () => {
  it('returns a single-element array for a single entry', () => {
    const results = parseCommands('-120 coffee cash', { categories, today });
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].transaction.amount).toBe(120);
      expect(results[0].transaction.title).toBe('coffee');
    }
  });

  it('splits and parses two expense entries on one line', () => {
    const results = parseCommands('-250 dinner cash -500 lunch card', { categories, today });
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(true);
    if (results[0]?.ok) {
      expect(results[0].transaction.amount).toBe(250);
      expect(results[0].transaction.title).toBe('dinner');
      expect(results[0].transaction.method).toBe('cash');
    }
    if (results[1]?.ok) {
      expect(results[1].transaction.amount).toBe(500);
      expect(results[1].transaction.title).toBe('lunch');
      expect(results[1].transaction.method).toBe('card');
    }
  });

  it('handles mixed income and expense entries', () => {
    const results = parseCommands('-250 dinner +300 loan cash', { categories, today });
    expect(results).toHaveLength(2);
    if (results[0]?.ok) expect(results[0].transaction.type).toBe('expense');
    if (results[1]?.ok) {
      expect(results[1].transaction.type).toBe('income');
      expect(results[1].transaction.amount).toBe(300);
    }
  });

  it('returns an error result for entries missing a title', () => {
    const results = parseCommands('-250 dinner -500 cash', { categories, today });
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(true);
    // "-500 cash" has no title (cash is parsed as method, leaving nothing)
    expect(results[1]?.ok).toBe(false);
  });

  it('returns a single failure for empty input', () => {
    const results = parseCommands('', { categories, today });
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
  });

  it('single entry result is identical to parseCommand result', () => {
    const multiResult = parseCommands('-120 coffee cash', { categories, today });
    const singleResult = parseCommand('-120 coffee cash', { categories, today });
    expect(multiResult[0]).toEqual(singleResult);
  });
});
