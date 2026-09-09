import { describe, expect, it } from 'vitest';
import { isCurrencyActive, resolveActiveCurrencies } from './activeCurrencySelection';

describe('active currency selection', () => {
  it('treats explicit active currencies as authoritative over historical balances', () => {
    expect(
      resolveActiveCurrencies(
        { defaultCurrency: 'TRY', activeCurrencies: ['TRY'] },
        [{ currency: 'TRY' }, { currency: 'USD' }, { currency: 'EUR' }, { currency: 'GBP' }]
      )
    ).toEqual(['TRY']);
  });

  it('keeps the default currency active and normalizes configured codes', () => {
    expect(
      resolveActiveCurrencies({ defaultCurrency: 'try', activeCurrencies: ['usd', 'TRY', 'usd'] })
    ).toEqual(['TRY', 'USD']);
  });

  it('uses balance rows only as a legacy fallback when the preference is absent', () => {
    expect(
      resolveActiveCurrencies(
        { defaultCurrency: 'GBP', activeCurrencies: undefined },
        [{ currency: 'EUR' }, { currency: 'GBP' }, { currency: 'USD' }]
      )
    ).toEqual(['GBP', 'EUR', 'USD']);
  });

  it('does not consider an archived currency active just because history remains', () => {
    expect(
      isCurrencyActive(
        'USD',
        { defaultCurrency: 'TRY', activeCurrencies: ['TRY'] },
        [{ currency: 'TRY' }, { currency: 'USD' }]
      )
    ).toBe(false);
  });
});
