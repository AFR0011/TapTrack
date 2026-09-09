'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { activeCurrenciesFromBalances, normalizeCurrencyCode } from '@/currencies/currencyCatalog';
import type { Currency } from '@/types';

export function useActiveCurrencies() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));

  let currencies: Currency[];
  if (settings?.activeCurrencies?.length) {
    const normalized = settings.activeCurrencies
      .map(normalizeCurrencyCode)
      .filter((currency): currency is Currency => Boolean(currency));
    const codes = [...new Set([settings.defaultCurrency, ...normalized])];
    currencies = codes.sort((a, b) => {
      if (a === settings.defaultCurrency) return -1;
      if (b === settings.defaultCurrency) return 1;
      return a.localeCompare(b);
    });
  } else {
    currencies = activeCurrenciesFromBalances(balances ?? [], settings?.defaultCurrency);
  }

  return {
    currencies,
    defaultCurrency: settings?.defaultCurrency ?? currencies[0] ?? 'TRY',
    loading: balances === undefined || settings === undefined,
  };
}
