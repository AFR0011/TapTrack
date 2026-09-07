'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import {
  createConversion,
  InvalidConversionError,
  InsufficientConversionBalanceError,
  type ConversionDraft,
} from '@/conversions/conversionService';
import {
  fetchHistoricalExchangeRate,
  type HistoricalExchangeRateResponse,
} from '@/exchangeRates';
import { SUPPORTED_CURRENCIES, SUPPORTED_METHODS, type Currency, type Method } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';
import { toast } from 'sonner';

const ARROW_DOWN_ICON = 'M19 14l-7 7m0 0l-7-7m7 7V3';

type OpKind = 'exchange' | 'transfer';

type RateState = {
  requestKey: string;
  rate: HistoricalExchangeRateResponse | null;
  error: string;
};

type PendingOrdering = {
  draft: ConversionDraft;
  checkpointId: string;
};

function kindLabel(draft: { fromCurrency: Currency; toCurrency: Currency; fromMethod: Method; toMethod: Method }): string {
  if (draft.fromCurrency !== draft.toCurrency) return 'Currency exchange';
  return 'Cash / card transfer';
}

export default function ConversionsWorkspace() {
  const today = formatLocalDate(new Date());

  const [fromCurrency, setFromCurrency] = useState<Currency>('USD');
  const [fromMethod, setFromMethod] = useState<Method>('card');
  const [fromAmountRaw, setFromAmountRaw] = useState('');
  const [toCurrency, setToCurrency] = useState<Currency>('TRY');
  const [toMethod, setToMethod] = useState<Method>('card');
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
  const conversions = useLiveQuery(() => db.conversions.orderBy('date').reverse().limit(30).toArray());
  const isLoading = balances === undefined || conversions === undefined;

  const balanceMap = useMemo(
    () => new Map((balances ?? []).map((b) => [b.id, b.amount])),
    [balances]
  );

  const fromAmount = parseAmountInput(fromAmountRaw);
  const opKind: OpKind = fromCurrency !== toCurrency ? 'exchange' : 'transfer';
  const rateRequestKey = opKind === 'exchange' ? `${fromCurrency}|${toCurrency}|${date}` : '';
  const exchangeRate = rateState.requestKey === rateRequestKey ? rateState.rate : null;
  const rateError = rateState.requestKey === rateRequestKey ? rateState.error : '';
  const rateLoading = opKind === 'exchange' && rateState.requestKey !== rateRequestKey;

  const clearPendingOrdering = () => {
    setPendingOrdering(null);
    setError('');
  };

  useEffect(() => {
    if (opKind !== 'exchange') return;

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
  }, [date, fromCurrency, opKind, rateRequestKey, toCurrency]);

  const toAmount =
    opKind === 'transfer'
      ? fromAmount
      : exchangeRate && fromAmount > 0
        ? roundCurrencyAmount(fromAmount * exchangeRate.rate)
        : 0;
  const calculatedToAmountRaw = fromAmount > 0 && toAmount > 0 ? toAmount.toFixed(2) : '';

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
        setError('This transfer or exchange is on the same date as a balance reconciliation. Choose when it happened.');
      } else {
        setPendingOrdering(null);
        setError(
          err instanceof InsufficientConversionBalanceError || err instanceof InvalidConversionError
            ? err.message
            : 'Could not save. Please try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPendingOrdering(null);

    if (fromAmount <= 0) {
      setError('Enter a valid "from" amount.');
      return;
    }
    if (opKind === 'exchange' && rateLoading) {
      setError('The historical exchange rate is still loading.');
      return;
    }
    if (opKind === 'exchange' && !exchangeRate) {
      setError(rateError || 'A published exchange rate is required before saving.');
      return;
    }
    if (toAmount <= 0) {
      setError('The calculated destination amount is not valid.');
      return;
    }
    if (opKind === 'transfer' && fromMethod === toMethod) {
      setError('Source and destination method must differ for a transfer (e.g. card → cash).');
      return;
    }

    const draft: ConversionDraft = {
      fromCurrency,
      toCurrency,
      fromMethod,
      toMethod,
      fromAmount,
      toAmount,
      date,
      note: note.trim() || undefined,
    };

    await persistDraft(draft);
  };

  const resolveOrdering = async (relation: HistoricalOrderingRelation) => {
    if (!pendingOrdering) return;
    const checkpoint = await db.balanceCheckpoints.get(pendingOrdering.checkpointId);
    if (!checkpoint) {
      setError('The reconciliation checkpoint could not be found.');
      setPendingOrdering(null);
      return;
    }

    await persistDraft({
      ...pendingOrdering.draft,
      occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(checkpoint, relation),
    });
  };

  const fromBalanceId = `${fromCurrency}-${fromMethod}`;
  const toBalanceId = `${toCurrency}-${toMethod}`;
  const fromAvailable = balanceMap.get(fromBalanceId) ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading transfers and exchanges">
        <PageHeader title="Transfers & exchanges" description="Move money or exchange currency." />
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
      <PageHeader title="Transfers & exchanges" description="Move money or exchange currency." />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0" padding="sm">
          <CardHeader title={kindLabel({ fromCurrency, toCurrency, fromMethod, toMethod })} />

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <fieldset className="space-y-3 rounded-lg border border-accent bg-accent-muted/40 p-3">
              <legend className="px-1 text-sm font-semibold text-secondary">From</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_96px_96px]">
                <Field
                  label="Amount"
                  inputMode="decimal"
                  value={fromAmountRaw}
                  onChange={(e) => {
                    clearPendingOrdering();
                    setFromAmountRaw(e.target.value);
                  }}
                  placeholder="0.00"
                  required
                  disabled={saving}
                  autoComplete="off"
                />
                <SelectField
                  label="Currency"
                  value={fromCurrency}
                  onChange={(e) => {
                    clearPendingOrdering();
                    setFromCurrency(e.target.value as Currency);
                  }}
                  disabled={saving}
                  options={SUPPORTED_CURRENCIES}
                />
                <SelectField
                  label="Method"
                  value={fromMethod}
                  onChange={(e) => {
                    clearPendingOrdering();
                    setFromMethod(e.target.value as Method);
                  }}
                  disabled={saving}
                  options={SUPPORTED_METHODS.map((method) => ({
                    value: method,
                    label: method.charAt(0).toUpperCase() + method.slice(1),
                  }))}
                />
              </div>
              <p className="text-xs font-medium text-muted">
                Available: <span className="font-semibold text-secondary">{formatMoney(fromAvailable, fromCurrency)}</span>
              </p>
            </fieldset>

            <TransferDivider />

            <fieldset className="space-y-3 rounded-lg border border-success bg-success-muted/40 p-3">
              <legend className="px-1 text-sm font-semibold text-secondary">To</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_96px_96px]">
                <Field
                  label={opKind === 'exchange' ? 'Calculated amount' : 'Amount'}
                  inputMode="decimal"
                  value={calculatedToAmountRaw}
                  placeholder={rateLoading ? 'Loading rate…' : '0.00'}
                  readOnly
                  disabled={saving}
                  autoComplete="off"
                />
                <SelectField
                  label="Currency"
                  value={toCurrency}
                  onChange={(e) => {
                    clearPendingOrdering();
                    setToCurrency(e.target.value as Currency);
                  }}
                  disabled={saving}
                  options={SUPPORTED_CURRENCIES}
                />
                <SelectField
                  label="Method"
                  value={toMethod}
                  onChange={(e) => {
                    clearPendingOrdering();
                    setToMethod(e.target.value as Method);
                  }}
                  disabled={saving}
                  options={SUPPORTED_METHODS.map((method) => ({
                    value: method,
                    label: method.charAt(0).toUpperCase() + method.slice(1),
                  }))}
                />
              </div>
              {opKind === 'exchange' ? (
                <ExchangeRateStatus
                  rate={exchangeRate}
                  loading={rateLoading}
                  error={rateError}
                />
              ) : (
                <p className="text-xs font-medium text-muted">
                  Same-currency transfers move the exact source amount 1:1.
                </p>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => {
                  clearPendingOrdering();
                  setDate(e.target.value);
                }}
                required
                disabled={saving}
              />
              <Field
                label="Note (optional)"
                value={note}
                onChange={(e) => {
                  clearPendingOrdering();
                  setNote(e.target.value);
                }}
                placeholder="ATM, Papara…"
                disabled={saving}
              />
            </div>

            <AnimatePresence>
              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  aria-live="polite"
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
                        Before reconciliation
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void resolveOrdering('after')}
                        disabled={saving}
                      >
                        After reconciliation
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
              className="leading-tight"
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
            {balances.map((b) => (
              <div
                key={b.id}
                className={`min-w-0 rounded-xl px-3 py-2.5 transition-all ${
                  b.id === fromBalanceId
                    ? 'border-2 border-accent bg-accent-muted'
                    : b.id === toBalanceId
                      ? 'border-2 border-success bg-success-muted'
                      : 'border border-subtle bg-surface-muted'
                }`}
              >
                <p className="truncate text-xs font-medium text-muted">
                  {b.currency} {b.method}
                </p>
                <p className="mt-1 break-words text-sm font-bold text-primary">
                  {formatMoney(b.amount, b.currency)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs font-medium text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-accent bg-accent-muted align-text-bottom" /> Source &nbsp;
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-success bg-success-muted align-text-bottom" /> Destination
          </p>
        </Card>
      </section>

      <Card className="min-w-0 overflow-hidden" padding="none">
        <div className="border-b border-subtle px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-primary">Recent transfers &amp; exchanges</h2>
        </div>
        <div className="divide-y divide-subtle">
          {conversions.length === 0 ? (
            <p className="p-6 text-center text-sm font-medium text-muted">No records yet.</p>
          ) : (
            <AnimatePresence initial={false}>
              {conversions.map((c) => {
                const isSameCurrency = c.fromCurrency === c.toCurrency;
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' as const }}
                    className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-primary">
                        {isSameCurrency
                          ? `${c.fromMethod} → ${c.toMethod} transfer`
                          : `${c.fromCurrency} → ${c.toCurrency} exchange`}
                      </p>
                      <p className="mt-0.5 break-words text-xs font-medium text-muted">
                        {c.date}
                        {c.note ? ` · ${c.note}` : ''}
                      </p>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <p className="break-words text-sm font-bold text-danger">
                        −{formatMoney(c.fromAmount, c.fromCurrency)}
                        <span className="font-medium text-muted"> {c.fromMethod}</span>
                      </p>
                      <p className="break-words text-sm font-bold text-success">
                        +{formatMoney(c.toAmount, c.toCurrency)}
                        <span className="font-medium text-muted"> {c.toMethod}</span>
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
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
    return <p className="text-xs font-medium text-muted">Loading the published rate for this date…</p>;
  }
  if (error) {
    return <p className="text-xs font-medium text-danger">{error}</p>;
  }
  if (!rate) return null;

  return (
    <p className="text-xs font-medium text-ai">
      1 {rate.base} = {rate.rate.toFixed(6)} {rate.quote} · {rate.source}
      {rate.dateUsed !== rate.dateRequested
        ? ` · no rate was published on ${rate.dateRequested}; using ${rate.dateUsed}`
        : ` · ${rate.dateUsed}`}
    </p>
  );
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function TransferDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-border" />
      <svg
        className="h-5 w-5 shrink-0 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ARROW_DOWN_ICON} />
      </svg>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
