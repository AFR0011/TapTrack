import type { Balance, Currency } from '@/types';

export type CurrencyOption = {
  code: Currency;
  name: string;
  symbol?: string;
};

export const FALLBACK_CURRENCIES: CurrencyOption[] = [
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
];

export function normalizeCurrencyCode(value: unknown): Currency | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function activeCurrenciesFromBalances(balances: Balance[], defaultCurrency?: Currency): Currency[] {
  const codes = new Set<Currency>();
  if (defaultCurrency) codes.add(defaultCurrency);
  for (const balance of balances) codes.add(balance.currency);
  return [...codes].sort((a, b) => {
    if (a === defaultCurrency) return -1;
    if (b === defaultCurrency) return 1;
    return a.localeCompare(b);
  });
}

export async function fetchCurrencyCatalog(signal?: AbortSignal): Promise<CurrencyOption[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return FALLBACK_CURRENCIES;
  }

  try {
    const response = await fetch('/api/exchange-rates/currencies', {
      signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Currency catalog unavailable.');
    const body = (await response.json()) as { currencies?: CurrencyOption[] };
    const currencies = (body.currencies ?? []).filter(
      (item) => normalizeCurrencyCode(item.code) && item.name
    );
    return currencies.length > 0 ? currencies : FALLBACK_CURRENCIES;
  } catch {
    return FALLBACK_CURRENCIES;
  }
}

export function formatCurrency(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  }
}
