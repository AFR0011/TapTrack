'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionEntry } from '@/components/TransactionEntry';
import type { QuickAddPrefill } from '@/components/QuickAddTransaction';
import type { TransactionInputMode } from '@/transactions/inputPreferences';
import type { Currency, Method, TransactionType } from '@/types';

const VALID_TYPES = new Set<TransactionType>(['expense', 'income']);
const VALID_METHODS = new Set<Method>(['cash', 'card']);
const VALID_CURRENCIES = new Set<Currency>(['TRY', 'USD', 'EUR']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

function readCaptureParameters(): {
  mode?: TransactionInputMode;
  prefill?: QuickAddPrefill;
} {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const rawMode = params.get('mode');
  const rawType = params.get('type');
  const rawMethod = params.get('method');
  const rawCurrency = params.get('currency');
  const rawDate = params.get('date');
  const rawAmount = params.get('amount');
  const rawTitle = params.get('title');

  const mode = rawMode === 'command' || rawMode === 'quick' ? rawMode : undefined;
  const prefill: QuickAddPrefill = {};

  if (rawType && VALID_TYPES.has(rawType as TransactionType)) {
    prefill.type = rawType as TransactionType;
  }
  if (rawMethod && VALID_METHODS.has(rawMethod as Method)) {
    prefill.method = rawMethod as Method;
  }
  if (rawCurrency && VALID_CURRENCIES.has(rawCurrency as Currency)) {
    prefill.currency = rawCurrency as Currency;
  }
  if (rawDate && DATE_PATTERN.test(rawDate)) {
    prefill.date = rawDate;
  }
  if (rawAmount && AMOUNT_PATTERN.test(rawAmount)) {
    prefill.amount = rawAmount.replace(',', '.');
  }
  if (rawTitle) {
    prefill.title = rawTitle.trim().slice(0, 120);
  }

  return { mode, prefill: Object.keys(prefill).length > 0 ? prefill : undefined };
}

export default function AddTransactionPage() {
  const router = useRouter();
  const [capture, setCapture] = useState<ReturnType<typeof readCaptureParameters>>({});

  useEffect(() => {
    setCapture(readCaptureParameters());
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Quick capture</p>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Add transaction</h1>
        </div>
        <Link
          href="/app"
          className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-muted hover:text-primary"
        >
          Back
        </Link>
      </div>

      <TransactionEntry
        initialMode={capture.mode}
        prefill={capture.prefill}
        onSaved={() => router.replace('/app')}
      />
    </div>
  );
}
