'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import {
  activeCurrenciesFromBalances,
  fetchCurrencyCatalog,
  normalizeCurrencyCode,
  type CurrencyOption,
} from '@/currencies/currencyCatalog';
import {
  addActiveCurrency,
  removeActiveCurrency,
  setDefaultCurrency,
} from '@/currencies/currencyService';
import type { Currency } from '@/types';

export function CurrencySettingsCard() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const [catalog, setCatalog] = useState<CurrencyOption[]>([]);
  const [currencyToAdd, setCurrencyToAdd] = useState('');
  const [currencyToRemove, setCurrencyToRemove] = useState<Currency | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCurrencyCatalog(controller.signal).then(setCatalog);
    return () => controller.abort();
  }, []);

  const activeCurrencies = useMemo(() => {
    if (!settings) return [];
    if (settings.activeCurrencies?.length) {
      const normalized = settings.activeCurrencies
        .map(normalizeCurrencyCode)
        .filter((currency): currency is Currency => Boolean(currency));
      const codes = [...new Set([settings.defaultCurrency, ...normalized])];
      return codes.sort((a, b) => {
        if (a === settings.defaultCurrency) return -1;
        if (b === settings.defaultCurrency) return 1;
        return a.localeCompare(b);
      });
    }
    return activeCurrenciesFromBalances(balances ?? [], settings.defaultCurrency);
  }, [balances, settings]);

  const availableToAdd = useMemo(
    () => catalog.filter((item) => !activeCurrencies.includes(item.code)),
    [activeCurrencies, catalog]
  );

  const balanceByCurrency = useMemo(() => {
    const totals = new Map<Currency, number>();
    for (const balance of balances ?? []) {
      totals.set(balance.currency, (totals.get(balance.currency) ?? 0) + balance.amount);
    }
    return totals;
  }, [balances]);

  if (!balances || !settings) return null;

  const handleAdd = async () => {
    if (!currencyToAdd) return;
    setBusy(true);
    try {
      await addActiveCurrency(currencyToAdd);
      toast.success(`${currencyToAdd} added.`);
      setCurrencyToAdd('');
      setAdding(false);
    } catch {
      toast.error('That currency could not be added. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDefaultChange = async (currency: Currency) => {
    setBusy(true);
    try {
      await setDefaultCurrency(currency);
      toast.success(`Main currency changed to ${currency}.`);
    } catch {
      toast.error('The main currency could not be changed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!currencyToRemove) return;
    setBusy(true);
    try {
      await removeActiveCurrency(currencyToRemove);
      toast.success(`${currencyToRemove} removed from new entries. Your history was kept.`);
      setCurrencyToRemove(null);
    } catch {
      toast.error('That currency could not be removed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const removalBalance = currencyToRemove ? balanceByCurrency.get(currencyToRemove) ?? 0 : 0;

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold text-primary">Currencies</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Choose the currency used for summaries and keep only the currencies you want in new entries.
        </p>
      </div>

      <div className="mt-5 max-w-md rounded-xl border border-subtle bg-surface-muted p-4">
        <SelectField
          label="Main currency"
          value={settings.defaultCurrency}
          onChange={(event) => void handleDefaultChange(event.target.value)}
          options={activeCurrencies.map((code) => ({ value: code, label: currencyLabel(code, catalog) }))}
          disabled={busy}
        />
        <p className="mt-2 text-xs leading-5 text-muted">
          Used for Dashboard totals and as the starting currency for new transactions.
        </p>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-primary">Currencies you use</h3>
            <p className="mt-0.5 text-xs text-muted">Removing one never deletes its transactions or balances.</p>
          </div>
          {!adding && availableToAdd.length > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
              + Add currency
            </Button>
          ) : null}
        </div>

        <div className="mt-3 divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">
          {activeCurrencies.map((code) => {
            const isDefault = code === settings.defaultCurrency;
            return (
              <div key={code} className="flex min-h-14 items-center justify-between gap-4 bg-surface-muted px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{currencyLabel(code, catalog)}</p>
                  <p className="mt-0.5 text-xs font-medium text-muted">
                    {isDefault ? 'Main currency' : 'Available for new entries'}
                  </p>
                </div>
                {isDefault ? null : (
                  <Button
                    type="button"
                    variant="dangerGhost"
                    size="sm"
                    onClick={() => setCurrencyToRemove(code)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {adding ? (
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent-muted/40 p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <SelectField
                label="Add currency"
                value={currencyToAdd}
                onChange={(event) => setCurrencyToAdd(event.target.value)}
                options={[
                  {
                    value: '',
                    label: catalog.length > 0 ? 'Choose currency' : 'Loading currencies…',
                  },
                  ...availableToAdd.map((item) => ({
                    value: item.code,
                    label: `${item.code} · ${item.name}`,
                  })),
                ]}
                disabled={busy || availableToAdd.length === 0}
              />
              <Button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!currencyToAdd || busy}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCurrencyToAdd('');
                  setAdding(false);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={currencyToRemove !== null}
        title={`Remove ${currencyToRemove ?? ''} from new entries?`}
        message={
          removalBalance !== 0
            ? `Your ${currencyToRemove} balance and all existing transactions will stay intact. You can add the currency again later.`
            : `Existing ${currencyToRemove} history will stay intact. You can add the currency again later.`
        }
        confirmLabel="Remove currency"
        confirmVariant="danger"
        onConfirm={() => void handleRemove()}
        onCancel={() => setCurrencyToRemove(null)}
      />
    </section>
  );
}

function currencyLabel(code: string, catalog: CurrencyOption[]): string {
  const item = catalog.find((currency) => currency.code === code);
  return item ? `${item.code} · ${item.name}` : code;
}
