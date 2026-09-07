'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db } from '@/database';
import { formatMoney, parseNonNegativeAmountInput } from '@/format';
import {
  getMonthlyReconciliationState,
  reconcileCurrentMonth,
} from '@/balances/reconciliationService';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function MonthlyReconciliationPrompt() {
  const state = useLiveQuery(() => getMonthlyReconciliationState(undefined, db), []);
  const initializedMonthRef = useRef<string | null>(null);
  const [dismissedMonth, setDismissedMonth] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!state?.required || initializedMonthRef.current === state.month) return;
    initializedMonthRef.current = state.month;
    setInputs(
      Object.fromEntries(state.balances.map((balance) => [balance.id, String(balance.amount)]))
    );
    setError('');
  }, [state]);

  const parsedAmounts = useMemo(() => {
    if (!state) return null;
    const parsed: Record<string, number> = {};
    for (const balance of state.balances) {
      const value = parseNonNegativeAmountInput(inputs[balance.id] ?? '');
      if (value === null) return null;
      parsed[balance.id] = value;
    }
    return parsed;
  }, [inputs, state]);

  if (!state?.required || dismissedMonth === state.month) return null;

  const handleConfirm = async () => {
    if (!parsedAmounts) {
      setError('Enter a valid non-negative amount for every balance.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const checkpoints = await reconcileCurrentMonth(parsedAmounts, db);
      const changed = checkpoints.filter((checkpoint) => Math.abs(checkpoint.deltaAmount) > 0.000001);
      setDismissedMonth(state.month);
      toast.success(
        changed.length === 0
          ? 'Balances reconciled. Everything matched.'
          : `Balances reconciled with ${changed.length} adjustment${changed.length === 1 ? '' : 's'}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Balances could not be reconciled.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title="Monthly balance check"
      message="Compare TapTrack with the balances you actually have. Leave matching values unchanged and correct anything that is off. Differences are saved as reconciliation adjustments, not income or spending."
      confirmLabel="Reconcile"
      cancelLabel="Not now"
      confirmLoading={saving}
      confirmDisabled={!parsedAmounts}
      cancelDisabled={saving}
      onConfirm={() => void handleConfirm()}
      onCancel={() => setDismissedMonth(state.month)}
    >
      <div className="mt-4 grid gap-3">
        {state.balances.map((balance) => (
          <label key={balance.id} className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-sm font-medium text-secondary">
              <span>{balance.currency} {balance.method}</span>
              <span className="text-xs text-muted">TapTrack: {formatMoney(balance.amount, balance.currency)}</span>
            </span>
            <input
              value={inputs[balance.id] ?? ''}
              onChange={(event) => {
                setInputs((current) => ({ ...current, [balance.id]: event.target.value }));
                setError('');
              }}
              inputMode="decimal"
              autoComplete="off"
              disabled={saving}
              aria-label={`Actual ${balance.currency} ${balance.method} balance`}
              className="min-h-11 rounded-lg border border-subtle bg-surface px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
