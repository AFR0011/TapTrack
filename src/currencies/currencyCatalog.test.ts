import { describe, expect, it } from 'vitest';
import { getCurrencyFractionDigits } from './currencyCatalog';

describe('currency fraction digits', () => {
  it('uses ISO-style formatter precision for common zero, two, and three-decimal currencies', () => {
    expect(getCurrencyFractionDigits('JPY')).toBe(0);
    expect(getCurrencyFractionDigits('USD')).toBe(2);
    expect(getCurrencyFractionDigits('KWD')).toBe(3);
  });
});
