'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CommandInput from '@/components/CommandInput';
import { QuickAddTransaction, type QuickAddPrefill } from '@/components/QuickAddTransaction';
import {
  getTransactionInputMode,
  setTransactionInputMode,
  type TransactionInputMode,
} from '@/transactions/inputPreferences';

export function TransactionEntry({
  initialMode,
  prefill,
  onSaved,
}: {
  initialMode?: TransactionInputMode;
  prefill?: QuickAddPrefill;
  onSaved?: () => void;
}) {
  const [mode, setMode] = useState<TransactionInputMode>(initialMode ?? 'quick');

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
      return;
    }
    setMode(getTransactionInputMode());
  }, [initialMode]);

  const chooseMode = (nextMode: TransactionInputMode) => {
    setMode(nextMode);
    setTransactionInputMode(nextMode);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary">Add transaction</h2>
          <p className="mt-0.5 text-xs font-medium text-muted">
            Quick for guided entry, Command for keyboard speed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-subtle bg-surface-muted p-1" aria-label="Transaction input mode">
            {(['quick', 'command'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseMode(option)}
                aria-pressed={mode === option}
                className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                  mode === option
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-muted hover:text-primary'
                }`}
              >
                {option === 'quick' ? 'Quick' : 'Command'}
              </button>
            ))}
          </div>
          <Link
            href="/app/transactions"
            className="flex min-h-11 items-center px-2 text-xs font-semibold text-accent hover:underline"
          >
            Full editor
          </Link>
        </div>
      </div>

      {mode === 'quick' ? <QuickAddTransaction prefill={prefill} onSaved={onSaved} /> : <CommandInput />}
    </div>
  );
}
