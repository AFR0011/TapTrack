'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { db } from '@/database';
import { formatMoney } from '@/format';
import { SkeletonListRows } from '@/components/ui/Skeleton';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { Transaction } from '@/types';

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12, transition: { duration: 0.15 } },
};

export default function RecentTransactions() {
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
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
  const filteredTransactions = sortedTransactions.filter((transaction: Transaction) =>
    filter === 'all' ? true : transaction.type === filter
  );

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: 'easeOut', delay: 0.14 }}
      className="rounded-2xl border border-subtle bg-surface"
    >
      <div className="flex flex-col gap-3 border-b border-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-primary">Recent transactions</h2>
        <div className="flex gap-1" aria-label="Filter recent transactions">
          {(['all', 'income', 'expense'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={cn(
                'relative min-h-11 min-w-11 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors',
                focusVisibleRing,
                filter === option ? 'text-white' : 'bg-surface-muted text-secondary hover:bg-surface-raised'
              )}
            >
              {filter === option ? (
                <motion.span
                  layoutId="filter-pill"
                  className="absolute inset-0 rounded-lg bg-action-primary"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 35 }}
                />
              ) : null}
              <span className="relative z-10">{option}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-subtle">
        {transactions === undefined || categories === undefined ? (
          <div aria-busy="true" aria-label="Loading recent transactions"><SkeletonListRows count={4} /></div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-secondary">No matching transactions yet.</p>
            <p className="mt-1 text-sm font-medium text-muted">Add one now or choose a different filter.</p>
            <Link href="/app/add" prefetch={false} className={cn('mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-accent hover:bg-surface-muted', focusVisibleRing)}>Add transaction</Link>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredTransactions.slice(0, 10).map((transaction, index) => {
              const category = categoryMap.get(transaction.categoryId);
              return (
                <motion.div
                  key={transaction.id}
                  layout={!reduceMotion}
                  variants={reduceMotion ? undefined : itemVariants}
                  initial={reduceMotion ? false : 'hidden'}
                  animate={reduceMotion ? undefined : 'visible'}
                  exit={reduceMotion ? undefined : 'exit'}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut', delay: index * 0.025 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <CategoryIcon icon={category?.icon} color={category?.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">{transaction.title}</p>
                    <p className="mt-1 truncate text-xs font-medium text-muted">{transaction.date} · {capitalize(transaction.method)} · {category?.name ?? 'Unknown category'}</p>
                  </div>
                  <p className={cn('shrink-0 text-right text-sm font-bold tabular-nums', transaction.type === 'income' ? 'text-success' : 'text-danger')}>
                    {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="border-t border-subtle p-4">
        <Link href="/app/transactions" prefetch={false} className={cn('inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-accent transition-colors hover:text-accent', focusVisibleRing)}>View all transactions</Link>
      </div>
    </motion.section>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
