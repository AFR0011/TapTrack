'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { getAdjustmentHistory } from '@/balances/reconciliationService';
import { formatMoney } from '@/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { BalanceCheckpoint, Currency } from '@/types';

export default function BalancesWorkspace() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const adjustments = useLiveQuery(() => getAdjustmentHistory());

  const groupedBalances = useMemo(() => {
    const groups = new Map<Currency, NonNullable<typeof balances>>();
    for (const balance of balances ?? []) {
      const rows = groups.get(balance.currency) ?? [];
      rows.push(balance);
      groups.set(balance.currency, rows);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [balances]);

  if (balances === undefined || adjustments === undefined) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading balances">
        <PageHeader title="Balances" description="Current cash and card balances." />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Balances" description="Current cash and card balances." />

      <section aria-labelledby="current-balances-title">
        <h2 id="current-balances-title" className="sr-only">Current balances</h2>
        {groupedBalances.length === 0 ? (
          <div className="rounded-2xl border border-subtle bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-secondary">No balances yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groupedBalances.map(([currency, rows]) => {
              const total = rows.reduce((sum, row) => sum + row.amount, 0);
              return (
                <article key={currency} className="rounded-2xl border border-subtle bg-surface p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{currency}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                        {formatMoney(total, currency)}
                      </p>
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-muted text-accent" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                        <path d="M3 7.5A2.5 2.5 0 015.5 5H18a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3V7.5zm0 0A2.5 2.5 0 005.5 10H21m-5 4h2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  <div className="mt-5 divide-y divide-subtle rounded-xl border border-subtle bg-surface-muted px-3">
                    {rows
                      .slice()
                      .sort((a, b) => a.method.localeCompare(b.method))
                      .map((balance) => (
                        <div key={balance.id} className="flex min-h-12 items-center justify-between gap-4 py-2.5">
                          <span className="text-sm font-medium capitalize text-secondary">{balance.method}</span>
                          <span className="text-sm font-semibold tabular-nums text-primary">
                            {formatMoney(balance.amount, balance.currency)}
                          </span>
                        </div>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {adjustments.length > 0 ? (
        <details className="group rounded-2xl border border-subtle bg-surface">
          <summary
            className={cn(
              'flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-3 select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-primary">Balance check history</h2>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {adjustments.length} correction{adjustments.length === 1 ? '' : 's'} recorded
              </p>
            </div>
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="divide-y divide-subtle border-t border-subtle">
            {adjustments.map((checkpoint) => (
              <AdjustmentRow key={checkpoint.id} checkpoint={checkpoint} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AdjustmentRow({ checkpoint }: { checkpoint: BalanceCheckpoint }) {
  const deltaLabel =
    checkpoint.deltaAmount === 0
      ? 'No change'
      : `${checkpoint.deltaAmount > 0 ? '+' : ''}${formatMoney(checkpoint.deltaAmount, checkpoint.currency)}`;

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold capitalize text-primary">
          {checkpoint.currency} {checkpoint.method}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted">
          {checkpoint.month ?? checkpoint.date} · {formatMoney(checkpoint.observedAmount, checkpoint.currency)} recorded
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          checkpoint.deltaAmount > 0
            ? 'text-success'
            : checkpoint.deltaAmount < 0
              ? 'text-danger'
              : 'text-muted'
        )}
      >
        {deltaLabel}
      </span>
    </div>
  );
}
