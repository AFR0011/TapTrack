'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { db } from '@/database';
import { formatMoney } from '@/format';
import { SkeletonListRows } from '@/components/ui/Skeleton';
import { cn, focusVisibleRing } from '@/lib/cn';

export default function RecentTransactions() {
  const reduceMotion = useReducedMotion();
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );
  const sortedTransactions = useMemo(
    () =>
      [...(transactions ?? [])].sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        return dateDiff !== 0 ? dateDiff : b.createdAt.localeCompare(a.createdAt);
      }),
    [transactions]
  );

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: 'easeOut', delay: 0.06 }}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Activity</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Recent activity</h2>
        </div>
        <Link
          href="/app/transactions"
          prefetch={false}
          className={cn('text-sm font-semibold text-accent hover:underline', focusVisibleRing)}
        >
          View all
        </Link>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
        {transactions === undefined || categories === undefined ? (
          <div aria-busy="true" aria-label="Loading recent transactions">
            <SkeletonListRows count={4} />
          </div>
        ) : sortedTransactions.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <p className="text-sm font-semibold text-secondary">No transactions yet.</p>
            <Link
              href="/app/add"
              prefetch={false}
              className={cn('mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-accent hover:bg-surface-muted', focusVisibleRing)}
            >
              Add transaction
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {sortedTransactions.slice(0, 4).map((transaction, index) => {
              const category = categoryMap.get(transaction.categoryId);
              return (
                <motion.div
                  key={transaction.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut', delay: index * 0.02 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <CategoryIcon icon={category?.icon} color={category?.color} className="h-9 w-9 rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">{transaction.title}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-muted">
                      {category?.name ?? 'Other'} · {capitalize(transaction.method)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-sm font-bold tabular-nums', transaction.type === 'income' ? 'text-success' : 'text-primary')}>
                      {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-muted">{formatShortDate(transaction.date)}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.section>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
