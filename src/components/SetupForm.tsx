'use client';

import { type FormEvent, useState } from 'react';
import { SUPPORTED_METHODS, type Currency, type Method } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { cn, focusVisibleRing } from '@/lib/cn';
import { completeInitialSetup } from '@/setup/setupService';

type BalanceFormState = Record<Currency, Record<Method, string>>;

const INITIAL_BALANCES: BalanceFormState = {
  TRY: { cash: '', card: '' },
  USD: { cash: '', card: '' },
  EUR: { cash: '', card: '' },
};

const FOREIGN_CURRENCIES = ['USD', 'EUR'] as const;

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <div className="min-h-screen bg-background px-4 py-8 text-primary">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">
        <header>
          <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">Welcome to TapTrack</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Add your TRY balances and a monthly budget to start logging expenses. Foreign currency is optional.
          </p>
        </header>

        <Card padding="sm">
          <h2 className="text-base font-semibold text-primary">TRY balances</h2>
          <p className="mt-1 text-sm text-muted">How much TRY do you have in cash and on card right now?</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SUPPORTED_METHODS.map((method) => (
              <Field
                key={method}
                label={`TRY ${method}`}
                inputMode="decimal"
                value={balances.TRY[method]}
                onChange={(event) => updateBalance('TRY', method, event.target.value)}
                placeholder="0"
                autoComplete="off"
              />
            ))}
          </div>
        </Card>

        <details className="rounded-2xl border border-subtle bg-surface-muted">
          <summary
            className={cn(
              'cursor-pointer list-none rounded-lg px-4 py-3 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            Add foreign currency balances
          </summary>
          <div className="space-y-4 border-t border-subtle px-4 py-4">
            {FOREIGN_CURRENCIES.map((currency) => (
              <div key={currency}>
                <h3 className="text-sm font-semibold text-primary">{currency}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {SUPPORTED_METHODS.map((method) => (
                    <Field
                      key={`${currency}-${method}`}
                      label={`${currency} ${method}`}
                      inputMode="decimal"
                      value={balances[currency][method]}
                      onChange={(event) => updateBalance(currency, method, event.target.value)}
                      placeholder="0"
                      autoComplete="off"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>

        <Card padding="sm">
          <h2 className="text-base font-semibold text-primary">Monthly budget &amp; defaults</h2>
          <p className="mt-1 text-sm text-muted">Set a TRY spending target and your usual payment method.</p>
          <div className="mt-4 grid gap-3">
            <Field
              label="Monthly TRY budget"
              inputMode="decimal"
              value={monthlyBudget}
              onChange={(event) => setMonthlyBudget(event.target.value)}
              autoComplete="off"
              required
            />
            <SelectField
              label="Default method"
              value={defaultMethod}
              onChange={(event) => setDefaultMethod(event.target.value as Method)}
              options={SUPPORTED_METHODS.map((method) => ({
                value: method,
                label: method.charAt(0).toUpperCase() + method.slice(1),
              }))}
            />
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" fullWidth className="mt-6" loading={saving} disabled={saving}>
            Start tracking
          </Button>
        </Card>
      </form>
    </div>
  );
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
