'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import {
  createConversion,
  InvalidConversionError,
  InsufficientConversionBalanceError,
  type ConversionDraft,
} from '@/conversions/conversionService';
import ConversionsLoadingFrame from '@/components/ConversionsLoadingFrame';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import {
  fetchHistoricalExchangeRate,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import { formatMoney, parseAmountInput } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
import { SUPPORTED_METHODS, type Currency, type Method } from '@/types';

type OpKind = 'transfer' | 'exchange';
type RateState = { requestKey: string; rate: HistoricalExchangeRateResponse | null; error: string };
type PendingOrdering = { draft: ConversionDraft; checkpointId: string };

export default function ConversionsWorkspaceB004() {
  const today = formatLocalDate(new Date());
  const { currencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
  const [mode, setMode] = useState<OpKind>('transfer');
  const [fromCurrencyOverride, setFromCurrencyOverride] = useState<Currency | null>(null);
  const [fromMethod, setFromMethod] = useState<Method>('card');
  const [fromAmountRaw, setFromAmountRaw] = useState('');
  const [toCurrencyOverride, setToCurrencyOverride] = useState<Currency | null>(null);
  const [toMethod, setToMethod] = useState<Method>('cash');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingOrdering, setPendingOrdering] = useState<PendingOrdering | null>(null);
  const [rateState, setRateState] = useState<RateState>({ requestKey: '', rate: null, error: '' });

  const balances = useLiveQuery(() => db.balances.toArray());
  const conversions = useLiveQuery(() => db.conversions.orderBy('date').reverse().limit(30).toArray());
  const isLoading = balances === undefined || conversions === undefined || currenciesLoading;
  const initialized = !currenciesLoading && currencies.length > 0;
  const canExchange = currencies.length > 1;
  const fromCurrency =
    fromCurrencyOverride && currencies.includes(fromCurrencyOverride)
      ? fromCurrencyOverride
      : defaultCurrency;
  const exchangeFallback = currencies.find((currency) => currency !== fromCurrency) ?? fromCurrency;
  const toCurrency =
    mode === 'transfer'
      ? fromCurrency
      : toCurrencyOverride && currencies.includes(toCurrencyOverride) && toCurrencyOverride !== fromCurrency
        ? toCurrencyOverride
        : exchangeFallback;
  const destinationMethod =
    mode === 'transfer' && toMethod === fromMethod
      ? SUPPORTED_METHODS.find((method) => method !== fromMethod) ?? toMethod
      : toMethod;
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const destinationCurrencyOptions = currencies
    .filter((currency) => mode === 'transfer' || currency !== fromCurrency)
    .map((currency) => ({ value: currency, label: currency }));
  const methodOptions = SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }));
  const destinationMethodOptions = SUPPORTED_METHODS
    .filter((method) => mode === 'exchange' || method !== fromMethod)
    .map((method) => ({ value: method, label: capitalize(method) }));
  const balanceMap = useMemo(
    () => new Map((balances ?? []).map((balance) => [balance.id, balance.amount])),
    [balances]
  );
  const fromAmount = parseAmountInput(fromAmountRaw);
  const rateRequestKey = mode === 'exchange' ? `${fromCurrency}|${toCurrency}|${date}` : '';
  const exchangeRate = rateState.requestKey === rateRequestKey ? rateState.rate : null;
  const rateError = rateState.requestKey === rateRequestKey ? rateState.error : '';
  const rateLoading = mode === 'exchange' && rateState.requestKey !== rateRequestKey;

  useEffect(() => {
    if (mode !== 'exchange' || !initialized || !canExchange || fromCurrency === toCurrency) return;
    const controller = new AbortController();
    void fetchHistoricalExchangeRate({ base: fromCurrency, quote: toCurrency, date, signal: controller.signal })
      .then((rate) => {
        if (!controller.signal.aborted) setRateState({ requestKey: rateRequestKey, rate, error: '' });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setRateState({
          requestKey: rateRequestKey,
          rate: null,
          error: requestError instanceof Error ? requestError.message : 'Exchange rate could not be loaded.',
        });
      });
    return () => controller.abort();
  }, [canExchange, date, fromCurrency, initialized, mode, rateRequestKey, toCurrency]);

  const toAmount =
    mode === 'transfer'
      ? fromAmount
      : exchangeRate && fromAmount > 0
        ? roundCurrencyAmount(fromAmount * exchangeRate.rate)
        : 0;
  const fromBalanceId = `${fromCurrency}-${fromMethod}`;
  const toBalanceId = `${toCurrency}-${destinationMethod}`;
  const fromAvailable = balanceMap.get(fromBalanceId) ?? 0;
  const toAvailable = balanceMap.get(toBalanceId) ?? 0;
  const fromAfter = fromAvailable - Math.max(fromAmount, 0);
  const toAfter = toAvailable + Math.max(toAmount, 0);

  const clearFeedback = () => {
    setPendingOrdering(null);
    setError('');
  };

  const selectMode = (nextMode: OpKind) => {
    if (nextMode === 'exchange' && !canExchange) return;
    clearFeedback();
    setMode(nextMode);
    if (nextMode === 'exchange') {
      setToCurrencyOverride(currencies.find((currency) => currency !== fromCurrency) ?? null);
    }
  };

  const selectFromCurrency = (nextCurrency: Currency) => {
    clearFeedback();
    setFromCurrencyOverride(nextCurrency);
    if (mode === 'exchange' && toCurrency === nextCurrency) {
      setToCurrencyOverride(currencies.find((currency) => currency !== nextCurrency) ?? null);
    }
  };

  const persistDraft = async (draft: ConversionDraft) => {
    setSaving(true);
    setError('');
    try {
      await createConversion(draft);
      toast.success(draft.fromCurrency !== draft.toCurrency ? 'Exchange recorded.' : 'Transfer recorded.');
      setFromAmountRaw('');
      setNote('');
      setPendingOrdering(null);
    } catch (requestError) {
      if (requestError instanceof AmbiguousLedgerOrderingError) {
        setPendingOrdering({ draft, checkpointId: requestError.checkpointId });
        setError(
          'This move is on the same date as a balance check. Choose whether it happened before or after that balance was recorded.'
        );
      } else {
        setPendingOrdering(null);
        setError(
          requestError instanceof InsufficientConversionBalanceError || requestError instanceof InvalidConversionError
            ? requestError.message
            : 'This transfer or exchange could not be saved. Check the details and try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    if (fromAmount <= 0) return setError('Enter an amount greater than zero.');
    if (fromAmount > fromAvailable) {
      return setError(`Only ${formatMoney(fromAvailable, fromCurrency)} is available in the source balance.`);
    }
    if (mode === 'exchange' && !canExchange) return setError('Add another active currency before exchanging money.');
    if (mode === 'exchange' && fromCurrency === toCurrency) return setError('Choose two different currencies for an exchange.');
    if (mode === 'exchange' && rateLoading) return setError('The exchange rate is still loading.');
    if (mode === 'exchange' && !exchangeRate) {
      return setError(rateError || 'No exchange rate is available for this date yet.');
    }
    if (toAmount <= 0) return setError('The destination amount could not be calculated.');
    if (mode === 'transfer' && fromMethod === destinationMethod) {
      return setError('Choose a different destination method for this transfer.');
    }

    await persistDraft({
      fromCurrency,
      toCurrency,
      fromMethod,
      toMethod: destinationMethod,
      fromAmount,
      toAmount,
      date,
      note: note.trim() || undefined,
    });
  };

  const resolveOrdering = async (relation: HistoricalOrderingRelation) => {
    if (!pendingOrdering) return;
    const checkpoint = await db.balanceCheckpoints.get(pendingOrdering.checkpointId);
    if (!checkpoint) {
      setError('That balance check could not be found. Return to Balances and try again.');
      setPendingOrdering(null);
      return;
    }
    await persistDraft({
      ...pendingOrdering.draft,
      occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(checkpoint, relation),
    });
  };

  if (isLoading) return <ConversionsLoadingFrame />;

  return (
    <div className="space-y-5 sm:space-y-6" data-layout="conversions-content">
      <header className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Transfers & exchanges</h1>
        <p className="mt-1 text-sm font-medium text-muted">
          Move money between your balances without counting it as income or spending.
        </p>
      </header>

      <div
        role="group"
        aria-label="Move type"
        className="inline-flex w-full rounded-2xl bg-surface-muted p-1 sm:w-auto"
      >
        <ModeButton active={mode === 'transfer'} onClick={() => selectMode('transfer')}>
          Transfer
        </ModeButton>
        <ModeButton active={mode === 'exchange'} onClick={() => selectMode('exchange')} disabled={!canExchange}>
          Exchange
        </ModeButton>
      </div>
      {!canExchange ? (
        <p className="-mt-3 text-xs font-medium text-muted">Add another active currency to enable exchanges.</p>
      ) : null}

      <section
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]"
        data-layout="conversions-workspace"
      >
        <section
          className="min-w-0 rounded-[1.5rem] bg-surface p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 sm:p-6 dark:shadow-none"
          data-conversions-column="editor"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {mode === 'exchange' ? 'Currency exchange' : 'Balance transfer'}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-primary">
              {mode === 'exchange' ? 'Exchange money' : 'Move money between methods'}
            </h2>
            <p className="mt-1 text-sm font-medium text-muted">
              {mode === 'exchange'
                ? 'Choose the balance money leaves and the balance that receives the converted amount.'
                : 'Keep the currency the same and move money between cash and card.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div
              className="rounded-[1.25rem] bg-surface-muted/70 p-4 ring-1 ring-subtle/70 sm:p-5"
              data-move-source
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">From</p>
                  <p className="mt-1 text-base font-semibold text-primary">
                    {fromCurrency} · {capitalize(fromMethod)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-muted">Available</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-primary">
                    {formatMoney(fromAvailable, fromCurrency)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Currency"
                  value={fromCurrency}
                  onChange={(event) => selectFromCurrency(event.target.value)}
                  options={currencyOptions}
                  disabled={saving}
                />
                <SelectField
                  label="Method"
                  value={fromMethod}
                  onChange={(event) => {
                    clearFeedback();
                    setFromMethod(event.target.value as Method);
                  }}
                  options={methodOptions}
                  disabled={saving}
                />
              </div>

              <Field
                label="Amount to move"
                inputMode="decimal"
                value={fromAmountRaw}
                onChange={(event) => {
                  clearFeedback();
                  setFromAmountRaw(event.target.value);
                }}
                placeholder="0.00"
                required
                disabled={saving}
                autoComplete="off"
                className="mt-1 min-h-14 text-2xl font-semibold tabular-nums md:text-xl"
              />
            </div>

            <div className="flex items-center gap-3 px-2" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-muted text-lg text-muted">↓</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div
              className="rounded-[1.25rem] bg-surface-muted/70 p-4 ring-1 ring-subtle/70 sm:p-5"
              data-move-destination
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">To</p>
                  <p className="mt-1 text-base font-semibold text-primary">
                    {toCurrency} · {capitalize(destinationMethod)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-muted">Current</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-primary">
                    {formatMoney(toAvailable, toCurrency)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Currency"
                  value={toCurrency}
                  onChange={(event) => {
                    clearFeedback();
                    setToCurrencyOverride(event.target.value);
                  }}
                  options={destinationCurrencyOptions}
                  disabled={saving || mode === 'transfer'}
                />
                <SelectField
                  label="Method"
                  value={destinationMethod}
                  onChange={(event) => {
                    clearFeedback();
                    setToMethod(event.target.value as Method);
                  }}
                  options={destinationMethodOptions}
                  disabled={saving}
                />
              </div>

              <Field
                label="Destination amount"
                value={fromAmount > 0 && toAmount > 0 ? toAmount.toFixed(2) : ''}
                placeholder={rateLoading ? 'Loading rate…' : '0.00'}
                readOnly
                aria-readonly="true"
                className="mt-1 min-h-14 bg-surface text-xl font-semibold tabular-nums text-secondary md:text-lg"
              />
            </div>

            {mode === 'exchange' ? (
              <ExchangeRateStatus rate={exchangeRate} loading={rateLoading} error={rateError} />
            ) : (
              <p className="px-1 text-xs font-medium text-muted">
                Transfers keep the amount and currency unchanged. Only the balance method changes.
              </p>
            )}

            <details className="group overflow-hidden rounded-xl bg-surface-muted/70 ring-1 ring-subtle/70">
              <summary
                className={cn(
                  'flex min-h-11 cursor-pointer list-none items-center px-4 py-2 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden',
                  focusVisibleRing
                )}
              >
                Date and note
                <Chevron className="ml-auto text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-subtle p-4 sm:grid-cols-2">
                <Field
                  label="Date"
                  type="date"
                  value={date}
                  max={today}
                  onChange={(event) => {
                    clearFeedback();
                    setDate(event.target.value);
                  }}
                  required
                  disabled={saving}
                />
                <Field
                  label="Note"
                  value={note}
                  onChange={(event) => {
                    clearFeedback();
                    setNote(event.target.value);
                  }}
                  placeholder="Optional"
                  disabled={saving}
                />
              </div>
            </details>

            {error ? (
              <div role="alert" className="rounded-xl bg-danger-muted px-4 py-3 text-sm font-medium text-danger ring-1 ring-danger/20">
                <p>{error}</p>
                {pendingOrdering ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void resolveOrdering('before')}
                      disabled={saving}
                    >
                      Before balance check
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void resolveOrdering('after')}
                      disabled={saving}
                    >
                      After balance check
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={saving}
              disabled={saving || rateLoading || fromAmount <= 0 || toAmount <= 0}
            >
              {mode === 'exchange'
                ? `Exchange ${fromCurrency} to ${toCurrency}`
                : `Transfer to ${capitalize(destinationMethod)}`}
            </Button>
          </form>
        </section>

        <aside
          className="min-w-0 rounded-[1.5rem] bg-surface p-5 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 sm:p-6 dark:shadow-none"
          data-conversions-column="preview"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Review</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-primary">After this move</h2>
          <p className="mt-1 text-sm font-medium text-muted">Nothing changes until you save.</p>

          <div className="mt-6 rounded-[1.25rem] bg-surface-muted/70 p-5 text-center ring-1 ring-subtle/70">
            <p className="text-sm font-medium text-muted">
              {mode === 'exchange'
                ? `${fromCurrency} → ${toCurrency}`
                : `${capitalize(fromMethod)} → ${capitalize(destinationMethod)}`}
            </p>
            <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums text-primary">
                {fromAmount > 0 ? formatMoney(fromAmount, fromCurrency) : formatMoney(0, fromCurrency)}
              </span>
              <span className="text-muted">→</span>
              <span className="text-2xl font-semibold tabular-nums text-primary">
                {toAmount > 0 ? formatMoney(toAmount, toCurrency) : formatMoney(0, toCurrency)}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <BalanceDelta
              label="Source balance"
              currency={fromCurrency}
              method={fromMethod}
              before={fromAvailable}
              after={fromAfter}
              tone={fromAfter < 0 ? 'bad' : 'neutral'}
            />
            <BalanceDelta
              label="Destination balance"
              currency={toCurrency}
              method={destinationMethod}
              before={toAvailable}
              after={toAfter}
              tone="good"
            />
          </div>

          {mode === 'exchange' && exchangeRate ? (
            <div className="mt-5 rounded-xl bg-surface-muted/70 p-4 ring-1 ring-subtle/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-secondary">Rate used</p>
                <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-subtle/70">
                  {exchangeRate.cached ? 'Saved rate' : exchangeRate.source}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold tabular-nums text-primary">
                1 {exchangeRate.base} = {exchangeRate.rate.toFixed(6)} {exchangeRate.quote}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                Rate date {exchangeRate.dateUsed}
                {exchangeRate.dateUsed !== exchangeRate.dateRequested ? ' · nearest earlier available date' : ''}
              </p>
            </div>
          ) : null}

          <div className="mt-5 rounded-xl bg-accent-muted px-4 py-3 text-sm font-medium text-secondary ring-1 ring-subtle/70">
            This is a balance move, not new money or spending. Reports and budgets are not inflated by it.
          </div>
        </aside>
      </section>

      <section className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.04)] ring-1 ring-subtle/70 dark:shadow-none">
        <div className="flex items-end justify-between gap-4 border-b border-subtle px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-primary">Recent moves</h2>
            <p className="mt-0.5 text-xs font-medium text-muted">Your latest transfers and exchanges.</p>
          </div>
          {(conversions ?? []).length > 0 ? (
            <span className="text-xs font-semibold text-muted">Latest {(conversions ?? []).length}</span>
          ) : null}
        </div>
        {(conversions ?? []).length === 0 ? (
          <EmptyState
            title="No transfers or exchanges yet."
            description="Money moved between your balances will appear here."
            className="m-5 sm:m-6"
          />
        ) : (
          <div className="divide-y divide-subtle">
            {(conversions ?? []).map((conversion) => {
              const isExchange = conversion.fromCurrency !== conversion.toCurrency;
              return (
                <div
                  key={conversion.id}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {isExchange ? 'Exchange' : 'Transfer'}
                      </span>
                      <p className="text-sm font-semibold text-primary">
                        {isExchange
                          ? `${conversion.fromCurrency} → ${conversion.toCurrency}`
                          : `${capitalize(conversion.fromMethod)} → ${capitalize(conversion.toMethod)}`}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted">
                      {conversion.date}{conversion.note ? ` · ${conversion.note}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:block sm:text-right">
                    <p className="text-sm font-semibold tabular-nums text-danger">
                      −{formatMoney(conversion.fromAmount, conversion.fromCurrency)}{' '}
                      <span className="font-medium text-muted">{capitalize(conversion.fromMethod)}</span>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-success">
                      +{formatMoney(conversion.toAmount, conversion.toCurrency)}{' '}
                      <span className="font-medium text-muted">{capitalize(conversion.toMethod)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-11 flex-1 rounded-xl px-5 py-2 text-sm font-semibold transition-colors sm:flex-none',
        focusVisibleRing,
        active ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary',
        disabled && 'cursor-not-allowed opacity-45'
      )}
    >
      {children}
    </button>
  );
}

function BalanceDelta({
  label,
  currency,
  method,
  before,
  after,
  tone,
}: {
  label: string;
  currency: Currency;
  method: Method;
  before: number;
  after: number;
  tone: 'neutral' | 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl bg-surface-muted/70 p-4 ring-1 ring-subtle/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1 text-sm font-semibold text-secondary">
            {currency} · {capitalize(method)}
          </p>
        </div>
        <p
          className={cn(
            'text-lg font-semibold tabular-nums',
            tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-primary'
          )}
        >
          {formatMoney(after, currency)}
        </p>
      </div>
      <p className="mt-2 text-xs font-medium text-muted">Before {formatMoney(before, currency)}</p>
    </div>
  );
}

function ExchangeRateStatus({
  rate,
  loading,
  error,
}: {
  rate: HistoricalExchangeRateResponse | null;
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return (
      <div role="status" className="rounded-xl bg-surface-muted/70 px-4 py-3 text-xs font-medium text-muted ring-1 ring-subtle/70">
        Loading the exchange rate for this date…
      </div>
    );
  }
  if (error) {
    return (
      <div role="status" className="rounded-xl bg-danger-muted px-4 py-3 text-xs font-medium text-danger ring-1 ring-danger/20">
        {error}
      </div>
    );
  }
  if (!rate) return null;
  return (
    <div className="rounded-xl bg-surface-muted/70 px-4 py-3 ring-1 ring-subtle/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-secondary">
          1 {rate.base} = {rate.rate.toFixed(6)} {rate.quote}
        </p>
        <span className="text-[11px] font-semibold text-muted">{rate.cached ? 'Saved rate' : rate.source}</span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-muted">
        Rate date {rate.dateUsed}{rate.dateUsed !== rate.dateRequested ? ' · nearest earlier available date' : ''}
      </p>
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
