import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  formatMoney,
  parseAmountInput,
  parseNonNegativeAmountInput,
} from './format';

describe('format helpers', () => {
  it('formats money with currency suffix', () => {
    expect(formatMoney(1234.5, 'TRY')).toContain('TRY');
  });

  it('parses decimal inputs with dot or comma', () => {
    expect(parseAmountInput('12.5')).toBe(12.5);
    expect(parseAmountInput('12,5')).toBe(12.5);
    expect(parseAmountInput('  .5  ')).toBe(0.5);
  });

  it('normalizes invalid, partial, or non-positive values to 0', () => {
    expect(parseAmountInput('')).toBe(0);
    expect(parseAmountInput('-1')).toBe(0);
    expect(parseAmountInput('abc')).toBe(0);
    expect(parseAmountInput('123abc')).toBe(0);
    expect(parseAmountInput('12.5junk')).toBe(0);
    expect(parseAmountInput('1,2,3')).toBe(0);
  });

  it('accepts zero for reconciliation balances without accepting malformed values', () => {
    expect(parseNonNegativeAmountInput('0')).toBe(0);
    expect(parseNonNegativeAmountInput('0,5')).toBe(0.5);
    expect(parseNonNegativeAmountInput('12.5')).toBe(12.5);
    expect(parseNonNegativeAmountInput('-1')).toBeNull();
    expect(parseNonNegativeAmountInput('12abc')).toBeNull();
    expect(parseNonNegativeAmountInput('')).toBeNull();
  });

  it('clamps percent between 0 and 100', () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(45)).toBe(45);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});
