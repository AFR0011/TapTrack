'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import {
  activeCurrenciesFromBalances,
  fetchCurrencyCatalog,
  type CurrencyOption,
} from '@/currencies/currencyCatalog';
import { addActiveCurrency, setDefaultCurrency } from '@/currencies/currencyService';
import type { Currency } from '@/types';

export function CurrencySettingsCard() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const [catalog, setCatalog] = useState<CurrencyOption[]>([]);
  const [currencyToAdd, setCurrencyToAdd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCurrencyCatalog(controller.signal).then(setCatalog);
    return () => controller.abort();
  }, []);

  const activeCurrencies = useMemo(
    () => activeCurrenciesFromBalances(balances ?? [], settings?.defaultCurrency),
    [balances, settings?.defaultCurrency]
  );
  const availableToAdd = useMemo(
    () => catalog.filter((item) => !activeCurrencies.includes(item.code)),
    [activeCurrencies, catalog]
  );

  if (!balances || !settings) return null;

  const handleAdd = async () => {
    if (!currencyToAdd) return;
    setBusy(true);
    try {
      await addActiveCurrency(currencyToAdd);
      toast.success(`${currencyToAdd} added.`);
      setCurrencyToAdd('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Currency could not be added. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDefaultChange = async (currency: Currency) => {
    setBusy(true);
    try {
      await setDefaultCurrency(currency);
      toast.success(`Main currency changed to ${currency}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Main currency could not be changed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="currencies" className="scroll-mt-24 rounded-2xl border border-subtle bg-surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-base font-semibold text-primary">Currencies</h2>
          <p className="mt-1 text-sm text-muted">Add the currencies you use and choose which one TapTrack uses for summaries.</p>
        </div>
        <span className="w-fit rounded-full bg-accent-muted px-2.5 py-1 text-xs font-semibold text-accent">
          {settings.defaultCurrency} main
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Main currency"
          value={settings.defaultCurrency}
          onChange={(event) => void handleDefaultChange(event.target.value)}
          options={activeCurrencies.map((code) => ({ value: code, label: currencyLabel(code, catalog) }))}
          disabled={busy}
        />
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <SelectField
            label="Add currency"
            value={currencyToAdd}
            onChange={(event) => setCurrencyToAdd(event.target.value)}
            options={[
              { value: '', label: catalog.length > 0 ? 'Choose currency' : 'Loading currencies…' },
              ...availableToAdd.map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` })),
            ]}
            disabled={busy || availableToAdd.length === 0}
          />
          <Button type="button" variant="secondary" onClick={() => void handleAdd()} disabled={!currencyToAdd || busy}>
            Add
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Currencies in use">
        {activeCurrencies.map((code) => (
          <span
            key={code}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              code === settings.defaultCurrency
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-subtle bg-surface-muted text-secondary'
            }`}
          >
            {code}
          </span>
        ))}
      </div>
    </section>
  );
}

function currencyLabel(code: string, catalog: CurrencyOption[]): string {
  const item = catalog.find((currency) => currency.code === code);
  return item ? `${item.code} · ${item.name}` : code;
}
