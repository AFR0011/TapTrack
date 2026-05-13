'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import {
  createConversion,
  InsufficientConversionBalanceError,
  type ConversionDraft,
} from '@/conversions/conversionService';
import { SUPPORTED_CURRENCIES, SUPPORTED_METHODS, type Currency, type Method } from '@/types';
import { toast } from 'sonner';

type OpKind = 'exchange' | 'transfer';

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
  const [toAmountRaw, setToAmountRaw] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const balances = useLiveQuery(() => db.balances.toArray(), [], []);
  const conversions = useLiveQuery(
    () => db.conversions.orderBy('date').reverse().limit(30).toArray(),
    [],
    []
  );

  const balanceMap = useMemo(
    () => new Map(balances.map((b) => [b.id, b.amount])),
    [balances]
  );

  const fromAmount = parseAmountInput(fromAmountRaw);
  const toAmount = parseAmountInput(toAmountRaw);

  const opKind: OpKind = fromCurrency !== toCurrency ? 'exchange' : 'transfer';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (fromAmount <= 0) { setError('Enter a valid "from" amount.'); return; }
    if (toAmount <= 0) { setError('Enter a valid "to" amount.'); return; }
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

    setSaving(true);
    try {
      await createConversion(draft);
      toast.success(opKind === 'exchange' ? 'Exchange recorded.' : 'Transfer recorded.');
      setFromAmountRaw('');
      setToAmountRaw('');
      setNote('');
    } catch (err) {
      setError(
        err instanceof InsufficientConversionBalanceError
          ? err.message
          : 'Could not save. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const fromBalanceId = `${fromCurrency}-${fromMethod}`;
  const toBalanceId = `${toCurrency}-${toMethod}`;
  const fromAvailable = balanceMap.get(fromBalanceId) ?? 0;

  const impliedRate =
    opKind === 'exchange' && fromAmount > 0 && toAmount > 0
      ? toAmount / fromAmount
      : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Transfers & Exchanges</h1>
        <p className="text-sm font-medium text-slate-500">
          Move money between card and cash, or exchange currencies.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* New operation form */}
        <div className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-glass backdrop-blur-sm">
          <h2 className="text-base font-semibold text-slate-950">
            {kindLabel({ fromCurrency, toCurrency, fromMethod, toMethod })}
          </h2>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* FROM */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">From</legend>
              <div className="grid grid-cols-[1fr_110px_110px] gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  value={fromAmountRaw}
                  onChange={(e) => setFromAmountRaw(e.target.value)}
                  placeholder="Amount"
                  required
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100/50 disabled:opacity-60"
                />
                <select
                  value={fromCurrency}
                  onChange={(e) => setFromCurrency(e.target.value as Currency)}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={fromMethod}
                  onChange={(e) => setFromMethod(e.target.value as Method)}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  {SUPPORTED_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <p className="text-xs font-medium text-slate-400">
                Available: <span className="font-semibold text-slate-600">{formatMoney(fromAvailable, fromCurrency)}</span>
              </p>
            </fieldset>

            {/* Arrow */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="select-none text-slate-400">↓</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* TO */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">To</legend>
              <div className="grid grid-cols-[1fr_110px_110px] gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  value={toAmountRaw}
                  onChange={(e) => setToAmountRaw(e.target.value)}
                  placeholder="Amount"
                  required
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100/50 disabled:opacity-60"
                />
                <select
                  value={toCurrency}
                  onChange={(e) => setToCurrency(e.target.value as Currency)}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={toMethod}
                  onChange={(e) => setToMethod(e.target.value as Method)}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  {SUPPORTED_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {impliedRate !== null && (
                <p className="text-xs font-medium text-violet-600">
                  Implied rate: 1 {fromCurrency} = {impliedRate.toFixed(4)} {toCurrency}
                </p>
              )}
            </fieldset>

            {/* Date + note */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={saving}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ATM, Papara…"
                  disabled={saving}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 disabled:opacity-60"
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={saving || fromAmount <= 0 || toAmount <= 0}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            >
              {saving
                ? 'Saving…'
                : opKind === 'exchange'
                  ? `Exchange ${fromCurrency} → ${toCurrency}`
                  : `Transfer ${fromCurrency} ${fromMethod} → ${toMethod}`}
            </button>
          </form>
        </div>

        {/* Balances quick-view */}
        <div className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-glass backdrop-blur-sm">
          <h2 className="text-base font-semibold text-slate-950">Current balances</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {balances.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl px-3 py-2.5 transition-all ${
                  b.id === fromBalanceId
                    ? 'border-2 border-blue-400 bg-blue-50'
                    : b.id === toBalanceId
                      ? 'border-2 border-emerald-400 bg-emerald-50'
                      : 'border border-slate-100 bg-slate-50'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {b.currency} {b.method}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-950">
                  {formatMoney(b.amount, b.currency)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs font-medium text-slate-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-blue-400 bg-blue-50 align-text-bottom" /> Source &nbsp;
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-emerald-400 bg-emerald-50 align-text-bottom" /> Destination
          </p>
        </div>
      </section>

      {/* History */}
      <section className="rounded-2xl border border-white/60 bg-white/90 shadow-glass backdrop-blur-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Recent transfers &amp; exchanges</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {conversions.length === 0 ? (
            <p className="p-6 text-center text-sm font-medium text-slate-500">No records yet.</p>
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
                    className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {isSameCurrency
                          ? `${c.fromMethod} → ${c.toMethod} transfer`
                          : `${c.fromCurrency} → ${c.toCurrency} exchange`}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-400">
                        {c.date}
                        {c.note ? ` · ${c.note}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">
                        −{formatMoney(c.fromAmount, c.fromCurrency)}
                        <span className="font-medium text-slate-400"> {c.fromMethod}</span>
                      </p>
                      <p className="text-sm font-bold text-emerald-600">
                        +{formatMoney(c.toAmount, c.toCurrency)}
                        <span className="font-medium text-slate-400"> {c.toMethod}</span>
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </section>
    </div>
  );
}
