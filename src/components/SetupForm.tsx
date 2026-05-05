'use client';

import { useState } from 'react';
import { SUPPORTED_CURRENCIES, SUPPORTED_METHODS, type Currency, type Method } from '@/types';
import { completeInitialSetup } from '@/setup/setupService';

type BalanceFormState = Record<Currency, Record<Method, string>>;

const INITIAL_BALANCES: BalanceFormState = {
  TRY: { cash: '', card: '' },
  USD: { cash: '', card: '' },
  EUR: { cash: '', card: '' },
};

export default function SetupForm() {
  const [balances, setBalances] = useState<BalanceFormState>(INITIAL_BALANCES);
  const [monthlyBudget, setMonthlyBudget] = useState('20000');
  const [defaultMethod, setDefaultMethod] = useState<Method>('card');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateBalance = (currency: Currency, method: Method, value: string) => {
    setBalances((current) => ({
      ...current,
      [currency]: {
        ...current[currency],
        [method]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');

    try {
      await completeInitialSetup({
        balances: {
          TRY: {
            cash: parseAmount(balances.TRY.cash),
            card: parseAmount(balances.TRY.card),
          },
          USD: {
            cash: parseAmount(balances.USD.cash),
            card: parseAmount(balances.USD.card),
          },
          EUR: {
            cash: parseAmount(balances.EUR.cash),
            card: parseAmount(balances.EUR.card),
          },
        },
        monthlyBudget: parseAmount(monthlyBudget),
        defaultMethod,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">Set up TapTrack</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Add starting balances and a monthly TRY budget so expense logging works immediately.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-base font-semibold">Initial balances</h2>
            <div className="mt-4 grid gap-3">
              {SUPPORTED_CURRENCIES.map((currency) => (
                <div key={currency} className="grid gap-2 rounded-md border border-slate-800 p-3 md:grid-cols-[72px_1fr_1fr] md:items-center">
                  <div className="text-sm font-semibold text-slate-200">{currency}</div>
                  {SUPPORTED_METHODS.map((method) => (
                    <label key={method} className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-400">
                      {method}
                      <input
                        inputMode="decimal"
                        value={balances[currency][method]}
                        onChange={(event) => updateBalance(currency, method, event.target.value)}
                        placeholder="0"
                        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white outline-none focus:border-blue-400"
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-base font-semibold">Defaults</h2>
            <label className="mt-4 grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-400">
              Monthly TRY budget
              <input
                inputMode="decimal"
                value={monthlyBudget}
                onChange={(event) => setMonthlyBudget(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white outline-none focus:border-blue-400"
              />
            </label>
            <label className="mt-4 grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-400">
              Default method
              <select
                value={defaultMethod}
                onChange={(event) => setDefaultMethod(event.target.value as Method)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white outline-none focus:border-blue-400"
              >
                {SUPPORTED_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="mt-4 text-sm font-medium text-red-300">{error}</p> : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="mt-6 w-full rounded-md bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-60"
            >
              {saving ? 'Saving setup' : 'Start tracking'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
