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
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import {
  fetchHistoricalExchangeRate,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import { formatMoney, parseAmountInput } from '@/format';
import { cn } from '@/lib/cn';
import { SUPPORTED_METHODS, type Currency, type Method } from '@/types';

type OpKind = 'exchange' | 'transfer';
type RateState = { requestKey: string; rate: HistoricalExchangeRateResponse | null; error: string };
type PendingOrdering = { draft: ConversionDraft; checkpointId: string };

export default function ConversionsWorkspaceB004() {
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
  const [rateState, setRateState] = useState<RateState>({ requestKey: '', rate: null, error: '' });

  const balances = useLiveQuery(() => db.balances.toArray());
  const conversions = useLiveQuery(() => db.conversions.orderBy('date').reverse().limit(30).toArray());
  const isLoading = balances === undefined || conversions === undefined || currenciesLoading;
  const fromCurrency = fromCurrencyOverride && currencies.includes(fromCurrencyOverride) ? fromCurrencyOverride : defaultCurrency;
  const defaultToCurrency = currencies.find((currency) => currency !== fromCurrency) ?? fromCurrency;
  const toCurrency = toCurrencyOverride && currencies.includes(toCurrencyOverride) ? toCurrencyOverride : defaultToCurrency;
  const initialized = !currenciesLoading && currencies.length > 0;
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const balanceMap = useMemo(() => new Map((balances ?? []).map((balance) => [balance.id, balance.amount])), [balances]);
  const fromAmount = parseAmountInput(fromAmountRaw);
  const opKind: OpKind = fromCurrency !== toCurrency ? 'exchange' : 'transfer';
  const rateRequestKey = opKind === 'exchange' ? `${fromCurrency}|${toCurrency}|${date}` : '';
  const exchangeRate = rateState.requestKey === rateRequestKey ? rateState.rate : null;
  const rateError = rateState.requestKey === rateRequestKey ? rateState.error : '';
  const rateLoading = opKind === 'exchange' && rateState.requestKey !== rateRequestKey;

  useEffect(() => {
    if (opKind !== 'exchange' || !initialized) return;
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
  }, [date, fromCurrency, initialized, opKind, rateRequestKey, toCurrency]);

  const toAmount = opKind === 'transfer'
    ? fromAmount
    : exchangeRate && fromAmount > 0
      ? roundCurrencyAmount(fromAmount * exchangeRate.rate)
      : 0;
  const fromBalanceId = `${fromCurrency}-${fromMethod}`;
  const toBalanceId = `${toCurrency}-${toMethod}`;
  const fromAvailable = balanceMap.get(fromBalanceId) ?? 0;
  const toAvailable = balanceMap.get(toBalanceId) ?? 0;
  const fromAfter = fromAvailable - Math.max(fromAmount, 0);
  const toAfter = toAvailable + Math.max(toAmount, 0);

  const clearFeedback = () => {
    setPendingOrdering(null);
    setError('');
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
        setError('This move is on the same date as a balance check. Choose whether it happened before or after that balance was recorded.');
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
    if (fromAmount > fromAvailable) return setError(`Only ${formatMoney(fromAvailable, fromCurrency)} is available in the source balance.`);
    if (opKind === 'exchange' && rateLoading) return setError('The exchange rate is still loading.');
    if (opKind === 'exchange' && !exchangeRate) return setError(rateError || 'No exchange rate is available for this date yet.');
    if (toAmount <= 0) return setError('The destination amount could not be calculated.');
    if (opKind === 'transfer' && fromMethod === toMethod) return setError('Choose a different destination method for this transfer.');

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
        <div className="grid gap-4 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        <SkeletonListCard titleWidth="w-56" count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Transfers & exchanges" description="Choose where money leaves, where it arrives, and review the result before saving." />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <Card className="min-w-0" padding="sm">
          <CardHeader title={opKind === 'exchange' ? 'Exchange money' : 'Move between cash and card'} />
          <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="rounded-xl border border-subtle bg-surface-muted p-3">
                <legend className="px-1 text-sm font-semibold text-secondary">From</legend>
                <div className="grid gap-3">
                  <Field
                    label="Amount"
                    inputMode="decimal"
                    value={fromAmountRaw}
                    onChange={(event) => { clearFeedback(); setFromAmountRaw(event.target.value); }}
                    placeholder="0.00"
                    required
                    disabled={saving}
                    autoComplete="off"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <SelectField label="Currency" value={fromCurrency} onChange={(event) => { clearFeedback(); setFromCurrencyOverride(event.target.value); }} options={currencyOptions} disabled={saving} />
                    <SelectField label="Method" value={fromMethod} onChange={(event) => { clearFeedback(); setFromMethod(event.target.value as Method); }} options={SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))} disabled={saving} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="rounded-xl border border-subtle bg-surface-muted p-3">
                <legend className="px-1 text-sm font-semibold text-secondary">To</legend>
                <div className="grid gap-3">
                  <Field label={opKind === 'exchange' ? 'You receive' : 'Amount'} value={fromAmount > 0 && toAmount > 0 ? toAmount.toFixed(2) : ''} placeholder={rateLoading ? 'Loading rate…' : '0.00'} readOnly aria-readonly="true" className="bg-surface text-secondary" />
                  <div className="grid grid-cols-2 gap-2">
                    <SelectField label="Currency" value={toCurrency} onChange={(event) => { clearFeedback(); setToCurrencyOverride(event.target.value); }} options={currencyOptions} disabled={saving} />
                    <SelectField label="Method" value={toMethod} onChange={(event) => { clearFeedback(); setToMethod(event.target.value as Method); }} options={SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))} disabled={saving} />
                  </div>
                </div>
              </fieldset>
            </div>

            {opKind === 'exchange' ? <ExchangeRateStatus rate={exchangeRate} loading={rateLoading} error={rateError} /> : null}

            <details className="group rounded-lg border border-subtle bg-surface-muted">
              <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold text-secondary [&::-webkit-details-marker]:hidden">
                Date and note <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="grid gap-3 border-t border-subtle p-3 sm:grid-cols-2">
                <Field label="Date" type="date" value={date} max={today} onChange={(event) => { clearFeedback(); setDate(event.target.value); }} required disabled={saving} />
                <Field label="Note" value={note} onChange={(event) => { clearFeedback(); setNote(event.target.value); }} placeholder="Optional" disabled={saving} />
              </div>
            </details>

            {error ? (
              <div role="alert" className="rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
                <p>{error}</p>
                {pendingOrdering ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => void resolveOrdering('before')} disabled={saving}>Before balance check</Button>
                    <Button type="button" variant="secondary" onClick={() => void resolveOrdering('after')} disabled={saving}>After balance check</Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" fullWidth loading={saving} disabled={saving || rateLoading || fromAmount <= 0 || toAmount <= 0}>
              {opKind === 'exchange' ? `Exchange ${fromCurrency} to ${toCurrency}` : `Move ${fromCurrency} from ${capitalize(fromMethod)} to ${capitalize(toMethod)}`}
            </Button>
          </form>
        </Card>

        <Card className="min-w-0" padding="sm">
          <CardHeader title="After this move" />
          <p className="mt-1 text-sm font-medium text-muted">A preview only. Balances change after you save.</p>
          <div className="mt-5 space-y-4">
            <OutcomeRow
              label="Source"
              currency={fromCurrency}
              method={fromMethod}
              before={fromAvailable}
              after={fromAfter}
              tone={fromAfter < 0 ? 'bad' : 'neutral'}
            />
            <div className="flex items-center gap-3" aria-hidden="true"><div className="h-px flex-1 bg-border" /><span className="text-sm font-semibold text-muted">↓</span><div className="h-px flex-1 bg-border" /></div>
            <OutcomeRow label="Destination" currency={toCurrency} method={toMethod} before={toAvailable} after={toAfter} tone="good" />
          </div>
          {opKind === 'exchange' && exchangeRate ? (
            <div className="mt-5 rounded-xl bg-surface-muted p-3 text-sm">
              <p className="font-semibold text-secondary">Rate used</p>
              <p className="mt-1 font-medium text-muted">1 {exchangeRate.base} = {exchangeRate.rate.toFixed(6)} {exchangeRate.quote}</p>
              <p className="mt-1 text-xs font-medium text-muted">{exchangeRate.dateUsed}{exchangeRate.dateUsed !== exchangeRate.dateRequested ? ' · nearest earlier available date' : ''}</p>
            </div>
          ) : null}
        </Card>
      </section>

      <Card className="min-w-0 overflow-hidden" padding="none">
        <div className="border-b border-subtle px-4 py-4 sm:px-5"><h2 className="text-base font-semibold text-primary">Recent moves</h2></div>
        {(conversions ?? []).length === 0 ? (
          <EmptyState title="No transfers or exchanges yet." description="Moves between your balances will appear here." className="m-5" />
        ) : (
          <div className="divide-y divide-subtle">
            {(conversions ?? []).map((conversion) => (
              <div key={conversion.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:px-5">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {conversion.fromCurrency === conversion.toCurrency
                      ? `${capitalize(conversion.fromMethod)} → ${capitalize(conversion.toMethod)}`
                      : `${conversion.fromCurrency} → ${conversion.toCurrency}`}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted">{conversion.date}{conversion.note ? ` · ${conversion.note}` : ''}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm font-semibold text-danger">−{formatMoney(conversion.fromAmount, conversion.fromCurrency)} <span className="font-medium text-muted">{capitalize(conversion.fromMethod)}</span></p>
                  <p className="text-sm font-semibold text-success">+{formatMoney(conversion.toAmount, conversion.toCurrency)} <span className="font-medium text-muted">{capitalize(conversion.toMethod)}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function OutcomeRow({ label, currency, method, before, after, tone }: { label: string; currency: Currency; method: Method; before: number; after: number; tone: 'neutral' | 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-subtle bg-surface-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-secondary">{currency} · {capitalize(method)}</p></div>
        <p className={cn('text-lg font-bold tabular-nums', tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-primary')}>{formatMoney(after, currency)}</p>
      </div>
      <p className="mt-2 text-xs font-medium text-muted">Before: {formatMoney(before, currency)}</p>
    </div>
  );
}

function ExchangeRateStatus({ rate, loading, error }: { rate: HistoricalExchangeRateResponse | null; loading: boolean; error: string }) {
  if (loading) return <p className="text-xs font-medium text-muted">Loading the exchange rate for this date…</p>;
  if (error) return <p className="text-xs font-medium text-danger">{error}</p>;
  if (!rate) return null;
  return <p className="text-xs font-medium text-muted">Using 1 {rate.base} = {rate.rate.toFixed(6)} {rate.quote} for {rate.dateUsed}{rate.dateUsed !== rate.dateRequested ? ' (nearest earlier available date)' : ''}.</p>;
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
