'use client';

import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { TransactionEntry } from '@/components/TransactionEntry';
import type { QuickAddPrefill } from '@/components/QuickAddTransaction';
import type { TransactionInputMode } from '@/transactions/inputPreferences';
import type { Currency, Method, TransactionType } from '@/types';

const VALID_TYPES = new Set<TransactionType>(['expense', 'income']);
const VALID_METHODS = new Set<Method>(['cash', 'card']);
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

function parseCaptureParameters(params: URLSearchParams): {
  mode?: TransactionInputMode;
  prefill?: QuickAddPrefill;
} {
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
  const normalizedCurrency = rawCurrency?.trim().toUpperCase() ?? '';
  if (CURRENCY_PATTERN.test(normalizedCurrency)) {
    prefill.currency = normalizedCurrency as Currency;
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

function CaptureContent() {
  const searchParams = useSearchParams();
  const capture = useMemo(
    () => parseCaptureParameters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">New transaction</p>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Add transaction</h1>
        </div>
        <Link
          href="/app"
          prefetch={false}
          onClick={(event) => {
            if (navigator.onLine !== false) return;
            event.preventDefault();
            // A full document navigation is intentional here so the service worker can serve the warmed route offline.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign('/app');
          }}
          className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-muted hover:text-primary"
        >
          Back
        </Link>
      </div>

      <TransactionEntry
        initialMode={capture.mode}
        prefill={capture.prefill}
      />
    </div>
  );
}

export default function AddTransactionPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-surface-muted" aria-hidden="true" />}>
      <CaptureContent />
    </Suspense>
  );
}
