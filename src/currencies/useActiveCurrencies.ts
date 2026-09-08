'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { activeCurrenciesFromBalances } from '@/currencies/currencyCatalog';

export function useActiveCurrencies() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const currencies = useMemo(
    () => activeCurrenciesFromBalances(balances ?? [], settings?.defaultCurrency),
    [balances, settings?.defaultCurrency]
  );
  return {
    currencies,
    defaultCurrency: settings?.defaultCurrency ?? currencies[0] ?? 'TRY',
    loading: balances === undefined || settings === undefined,
  };
}
