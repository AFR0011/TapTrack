import { describe, expect, it } from 'vitest';
import { createDefaultCategories } from '@/defaultData';
import { parseCommand, parseCommands } from './parseCommand';

const categories = createDefaultCategories('2026-04-30T00:00:00.000Z');
const today = new Date(2026, 3, 30);

describe('parseCommand', () => {
  it('parses an expense with a neutral category fallback and explicit method', () => {
    const result = parseCommand('-120 coffee cash', { categories, today });
    expect(result).toEqual({
      ok: true,
      transaction: {
        type: 'expense',
        amount: 120,
        currency: 'TRY',
        title: 'coffee',
        categoryId: 'cat-other',
        method: 'cash',
        date: '2026-04-30',
      },
    });
  });

  it('uses the configured default currency when none is typed', () => {
    const result = parseCommand('-12 coffee', {
      categories,
      defaultCurrency: 'GBP',
      activeCurrencies: ['GBP', 'EUR'],
      today,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transaction.currency).toBe('GBP');
  });

  it('accepts arbitrary active three-letter currency codes', () => {
    const result = parseCommand('-25 gbp lunch cash', {
      categories,
      defaultCurrency: 'EUR',
      activeCurrencies: ['EUR', 'GBP'],
      today,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.currency).toBe('GBP');
      expect(result.transaction.title).toBe('lunch');
      expect(result.transaction.categoryId).toBe('cat-other');
    }
  });

  it('rejects a currency that is not active when an active list is supplied', () => {
    expect(
      parseCommand('-25 usd lunch', {
        categories,
        defaultCurrency: 'GBP',
        activeCurrencies: ['GBP', 'EUR'],
        today,
      })
    ).toEqual({
      ok: false,
      message: 'USD is not active in this TapTrack ledger. Add it in Settings first.',
    });
  });

  it('parses explicit currency without keyword-based categorization', () => {
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
        categoryId: 'cat-other',
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
  });

  it('splits and parses two expense entries on one line', () => {
    const results = parseCommands('-250 dinner cash -500 lunch card', { categories, today });
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(true);
    if (results[0]?.ok) expect(results[0].transaction.categoryId).toBe('cat-other');
    if (results[1]?.ok) expect(results[1].transaction.categoryId).toBe('cat-other');
  });

  it('handles mixed income and expense entries', () => {
    const results = parseCommands('-250 dinner +300 loan cash', { categories, today });
    expect(results).toHaveLength(2);
    if (results[0]?.ok) expect(results[0].transaction.type).toBe('expense');
    if (results[1]?.ok) expect(results[1].transaction.type).toBe('income');
  });

  it('returns an error result for entries missing a title', () => {
    const results = parseCommands('-250 dinner -500 cash', { categories, today });
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(true);
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

  it('handles multi-command with mixed currencies', () => {
    const results = parseCommands('-120 coffee +50 usd lunch', { categories, today });
    expect(results).toHaveLength(2);
    if (results[0]?.ok) expect(results[0].transaction.currency).toBe('TRY');
    if (results[1]?.ok) expect(results[1].transaction.currency).toBe('USD');
  });

  it('handles amounts without a leading zero', () => {
    const results = parseCommands('-.5 coffee', { categories, today });
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    if (results[0]?.ok) expect(results[0].transaction.amount).toBe(0.5);
  });

  it('rejects malformed multi-command with missing title', () => {
    const results = parseCommands('-250 dinner -500', { categories, today });
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(false);
  });

  it('handles whitespace variants', () => {
    const results = parseCommands('- 120   coffee   cash', { categories, today });
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
  });
});
