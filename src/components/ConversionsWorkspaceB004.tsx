'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import {
  fetchHistoricalExchangeRate,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import { formatMoney, parseAmountInput } from '@/format';
import { SUPPORTED_METHODS, type Currency, type Method } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';

type OpKind = 'exchange' | 'transfer';
type RateState = {
  requestKey: string;
  rate: HistoricalExchangeRateResponse | null;
  error: string;
};
type PendingOrdering = { draft: ConversionDraft; checkpointId: string };

export default function ConversionsWorkspaceB004() {
  const reduceMotion = useReducedMotion();
  const today = formatLocalDate(new Date());
  const { currencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
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
  const [rateState, setRateState] = useState<RateState>({
    requestKey: '',
    rate: null,
    error: '',
  });

  const balances = useLiveQuery(() => db.balances.toArray());
  const conversions = useLiveQuery(() =>
    db.conversions.orderBy('date').reverse().limit(30).toArray()
  );
  const isLoading = balances === undefined || conversions === undefined || currenciesLoading;
  const fromCurrency =
    fromCurrencyOverride && currencies.includes(fromCurrencyOverride)
      ? fromCurrencyOverride
      : defaultCurrency;
  const defaultToCurrency =
    currencies.find((currency) => currency !== fromCurrency) ?? fromCurrency;
  const toCurrency =
    toCurrencyOverride && currencies.includes(toCurrencyOverride)
      ? toCurrencyOverride
      : defaultToCurrency;
  const initialized = !currenciesLoading && currencies.length > 0;

  const balanceMap = useMemo(
    () => new Map((balances ?? []).map((balance) => [balance.id, balance.amount])),
    [balances]
  );
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const fromAmount = parseAmountInput(fromAmountRaw);
  const opKind: OpKind = fromCurrency !== toCurrency ? 'exchange' : 'transfer';
  const rateRequestKey = opKind === 'exchange' ? `${fromCurrency}|${toCurrency}|${date}` : '';
  const exchangeRate = rateState.requestKey === rateRequestKey ? rateState.rate : null;
  const rateError = rateState.requestKey === rateRequestKey ? rateState.error : '';
  const rateLoading = opKind === 'exchange' && rateState.requestKey !== rateRequestKey;

  useEffect(() => {
    if (opKind !== 'exchange' || !initialized) return;
    const controller = new AbortController();
    void fetchHistoricalExchangeRate({
      base: fromCurrency,
      quote: toCurrency,
      date,
      signal: controller.signal,
    })
      .then((rate) => {
        if (!controller.signal.aborted) {
          setRateState({ requestKey: rateRequestKey, rate, error: '' });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRateState({
          requestKey: rateRequestKey,
          rate: null,
          error: err instanceof Error ? err.message : 'Exchange rate could not be loaded.',
        });
      });
    return () => controller.abort();
  }, [date, fromCurrency, initialized, opKind, rateRequestKey, toCurrency]);

  const toAmount =
    opKind === 'transfer'
      ? fromAmount
      : exchangeRate && fromAmount > 0
        ? roundCurrencyAmount(fromAmount * exchangeRate.rate)
        : 0;
  const calculatedToAmountRaw = fromAmount > 0 && toAmount > 0 ? toAmount.toFixed(2) : '';
  const fromBalanceId = `${fromCurrency}-${fromMethod}`;
  const toBalanceId = `${toCurrency}-${toMethod}`;
  const fromAvailable = balanceMap.get(fromBalanceId) ?? 0;

  const clearPendingOrdering = () => {
    setPendingOrdering(null);
    setError('');
  };

  const persistDraft = async (draft: ConversionDraft) => {
    setSaving(true);
    setError('');
    try {
      await createConversion(draft);
      toast.success(
        draft.fromCurrency !== draft.toCurrency ? 'Exchange recorded.' : 'Transfer recorded.'
      );
      setFromAmountRaw('');
      setNote('');
      setPendingOrdering(null);
    } catch (err) {
      if (err instanceof AmbiguousLedgerOrderingError) {
        setPendingOrdering({ draft, checkpointId: err.checkpointId });
        setError(
          'This transfer or exchange is on the same date as a balance check. Choose whether it happened before or after that balance was recorded.'
        );
      } else {
        setPendingOrdering(null);
        setError(
          err instanceof InsufficientConversionBalanceError || err instanceof InvalidConversionError
            ? err.message
            : 'This transfer or exchange could not be saved. Check the details and try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setPendingOrdering(null);
    if (fromAmount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (opKind === 'exchange' && rateLoading) {
      setError('The exchange rate is still loading.');
      return;
    }
    if (opKind === 'exchange' && !exchangeRate) {
      setError(rateError || 'No exchange rate is available for this date yet.');
      return;
    }
    if (toAmount <= 0) {
      setError('The destination amount could not be calculated. Check the amount and currencies.');
      return;
    }
    if (opKind === 'transfer' && fromMethod === toMethod) {
      setError('Choose a different destination method for this transfer.');
      return;
    }

    await persistDraft({
      fromCurrency,
      toCurrency,
      fromMethod,
      toMethod,
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

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading transfers and exchanges">
        <PageHeader title="Transfers & exchanges" description="Move money between methods or currencies." />
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonListCard titleWidth="w-56" count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Transfers & exchanges" description="Move money between methods or currencies." />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0" padding="sm">
          <CardHeader title={opKind === 'exchange' ? 'Currency exchange' : 'Cash / card transfer'} />
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <fieldset className="space-y-3 rounded-lg border border-accent bg-accent-muted/40 p-3">
              <legend className="px-1 text-sm font-semibold text-secondary">From</legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
                <Field
                  label="Amount"
                  inputMode="decimal"
                  value={fromAmountRaw}
                  onChange={(event) => {
                    clearPendingOrdering();
                    setFromAmountRaw(event.target.value);
                  }}
                  placeholder="0.00"
                  required
                  disabled={saving}
                  autoComplete="off"
                />
                <SelectField
                  label="Currency"
                  value={fromCurrency}
                  onChange={(event) => {
                    clearPendingOrdering();
                    setFromCurrencyOverride(event.target.value);
                  }}
                  options={currencyOptions}
                  disabled={saving}
                />
                <SelectField
                  label="Method"
                  value={fromMethod}
                  onChange={(event) => {
                    clearPendingOrdering();
                    setFromMethod(event.target.value as Method);
                  }}
                  options={SUPPORTED_METHODS.map((method) => ({ value: method, label: method }))}
                  disabled={saving}
                />
              </div>
              <p className="text-xs font-medium text-muted">
                Available:{' '}
                <span className="font-semibold text-secondary">
                  {formatMoney(fromAvailable, fromCurrency)}
                </span>
              </p>
            </fieldset>

            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-sm font-semibold text-muted">↓</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <fieldset className="space-y-3 rounded-lg border border-success bg-success-muted/40 p-3">
              <legend className="px-1 text-sm font-semibold text-secondary">To</legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
                <Field
                  label={opKind === 'exchange' ? 'Calculated amount' : 'Amount'}
                  inputMode="decimal"
                  value={calculatedToAmountRaw}
                  placeholder={rateLoading ? 'Loading rate…' : '0.00'}
                  readOnly
                  aria-readonly="true"
                  className="bg-surface-muted text-secondary"
                  disabled={saving}
                />
                <SelectField
                  label="Currency"
                  value={toCurrency}
                  onChange={(event) => {
                    clearPendingOrdering();
                    setToCurrencyOverride(event.target.value);
                  }}
                  options={currencyOptions}
                  disabled={saving}
                />
                <SelectField
                  label="Method"
                  value={toMethod}
                  onChange={(event) => {
                    clearPendingOrdering();
                    setToMethod(event.target.value as Method);
                  }}
                  options={SUPPORTED_METHODS.map((method) => ({ value: method, label: method }))}
                  disabled={saving}
                />
              </div>
              {opKind === 'exchange' ? (
                <ExchangeRateStatus rate={exchangeRate} loading={rateLoading} error={rateError} />
              ) : (
                <p className="text-xs font-medium text-muted">
                  The same amount moves from one payment method to the other.
                </p>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Date"
                type="date"
                value={date}
                max={today}
                onChange={(event) => {
                  clearPendingOrdering();
                  setDate(event.target.value);
                }}
                required
                disabled={saving}
              />
              <Field
                label="Note"
                value={note}
                onChange={(event) => {
                  clearPendingOrdering();
                  setNote(event.target.value);
                }}
                placeholder="Optional"
                disabled={saving}
              />
            </div>

            <AnimatePresence>
              {error ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : undefined}
                  role="alert"
                  className="rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"
                >
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
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Button
              type="submit"
              fullWidth
              loading={saving}
              disabled={saving || rateLoading || fromAmount <= 0 || toAmount <= 0}
            >
              {opKind === 'exchange'
                ? `Exchange ${fromCurrency} → ${toCurrency}`
                : `Transfer ${fromCurrency} ${fromMethod} → ${toMethod}`}
            </Button>
          </form>
        </Card>

        <Card className="min-w-0" padding="sm">
          <CardHeader title="Current balances" />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(balances ?? []).map((balance) => {
              const isSource = balance.id === fromBalanceId;
              const isDestination = balance.id === toBalanceId;
              return (
                <div
                  key={balance.id}
                  className={`rounded-xl px-3 py-2.5 ${
                    isSource
                      ? 'border-2 border-accent bg-accent-muted'
                      : isDestination
                        ? 'border-2 border-success bg-success-muted'
                        : 'border border-subtle bg-surface-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">
                      {balance.currency} {balance.method}
                    </p>
                    {isSource ? <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-accent">From</span> : null}
                    {isDestination ? <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-success">To</span> : null}
                  </div>
                  <p className="mt-1 text-sm font-bold text-primary">
                    {formatMoney(balance.amount, balance.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <Card className="min-w-0 overflow-hidden" padding="none">
        <div className="border-b border-subtle px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-primary">Recent transfers & exchanges</h2>
        </div>
        <div className="divide-y divide-subtle">
          {(conversions ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm font-medium text-muted">No transfers or exchanges yet.</p>
          ) : (
            (conversions ?? []).map((conversion) => (
              <div
                key={conversion.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:px-5"
              >
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {conversion.fromCurrency === conversion.toCurrency
                      ? `${conversion.fromMethod} → ${conversion.toMethod} transfer`
                      : `${conversion.fromCurrency} → ${conversion.toCurrency} exchange`}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted">
                    {conversion.date}
                    {conversion.note ? ` · ${conversion.note}` : ''}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm font-bold text-danger">
                    −{formatMoney(conversion.fromAmount, conversion.fromCurrency)}{' '}
                    <span className="font-medium text-muted">{conversion.fromMethod}</span>
                  </p>
                  <p className="text-sm font-bold text-success">
                    +{formatMoney(conversion.toAmount, conversion.toCurrency)}{' '}
                    <span className="font-medium text-muted">{conversion.toMethod}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
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
      <p className="text-xs font-medium text-muted">Loading the exchange rate for this date…</p>
    );
  }
  if (error) return <p className="text-xs font-medium text-danger">{error}</p>;
  if (!rate) return null;
  return (
    <p className="text-xs font-medium text-ai">
      Rate: 1 {rate.base} = {rate.rate.toFixed(6)} {rate.quote} · {rate.source} · {rate.dateUsed}
      {rate.dateUsed !== rate.dateRequested ? ` (nearest earlier available date)` : ''}
    </p>
  );
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
