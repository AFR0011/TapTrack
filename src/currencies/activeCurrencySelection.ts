import { normalizeCurrencyCode } from '@/currencies/currencyCatalog';
import type { Currency, Settings } from '@/types';

type ActiveCurrencySettings = Pick<Settings, 'defaultCurrency' | 'activeCurrencies'>;
type CurrencyBearing = { currency: Currency };

/**
 * Resolve the currencies currently enabled for new activity.
 *
 * B006 made settings.activeCurrencies authoritative. Persisted balance rows are
 * only a legacy fallback because archived currencies deliberately keep their
 * ledger history and derived balance buckets.
 */
export function resolveActiveCurrencies(
  settings: ActiveCurrencySettings,
  fallbackRows: CurrencyBearing[] = []
): Currency[] {
  const defaultCurrency = normalizeCurrencyCode(settings.defaultCurrency);
  const configured = (settings.activeCurrencies ?? [])
    .map(normalizeCurrencyCode)
    .filter((currency): currency is Currency => Boolean(currency));
  const fallback = fallbackRows
    .map((row) => normalizeCurrencyCode(row.currency))
    .filter((currency): currency is Currency => Boolean(currency));
  const source = configured.length > 0 ? configured : fallback;
  const currencies = [...new Set([...(defaultCurrency ? [defaultCurrency] : []), ...source])];

  return currencies.sort((a, b) => {
    if (a === defaultCurrency) return -1;
    if (b === defaultCurrency) return 1;
    return a.localeCompare(b);
  });
}

export function isCurrencyActive(
  currency: Currency,
  settings: ActiveCurrencySettings,
  fallbackRows: CurrencyBearing[] = []
): boolean {
  const normalized = normalizeCurrencyCode(currency);
  return normalized ? resolveActiveCurrencies(settings, fallbackRows).includes(normalized) : false;
}
