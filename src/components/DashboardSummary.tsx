'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { clampPercent } from '@/format';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { buttonVariants } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

function formatTRY(value: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₺';
}

function formatCurrency(value: number, currency: string) {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺';
  const locale = currency === 'TRY' ? 'tr-TR' : 'en-US';
  return symbol + new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default function DashboardSummary() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const currentMonth = getCurrentMonth();
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(currentMonth).first(),
    [currentMonth]
  );
  const today = formatLocalDate(new Date());

  if (balances === undefined || transactions === undefined) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Loading dashboard summary">
        <SkeletonCard />
        <div>
          <Skeleton className="h-4 w-20" />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 min-w-0 rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const todaySpending = transactions
    .filter((t) => t.type === 'expense' && t.currency === 'TRY' && t.date === today)
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlySpending = transactions
    .filter((t) => t.type === 'expense' && t.currency === 'TRY' && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  const budgetAvailable = (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const remaining = budgetAvailable - monthlySpending;
  const budgetUsed = budgetAvailable > 0 ? clampPercent((monthlySpending / budgetAvailable) * 100) : 0;

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' as const }}
        className="rounded-2xl border border-subtle bg-surface p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-muted">Month status</h2>
            <p className="mt-1 text-2xl font-bold text-primary animate-count-up">
              <AnimatedNumber value={monthlySpending} format={formatTRY} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-muted">Remaining</p>
            <p className={`mt-1 text-lg font-bold transition-colors ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>
              <AnimatedNumber value={remaining} format={formatTRY} />
            </p>
          </div>
        </div>

        <ProgressBar
          className="mt-4"
          percent={budgetUsed}
          usedLabel={budgetAvailable > 0 ? `${Math.round(budgetUsed)}% used` : undefined}
          remainingLabel={
            budgetAvailable > 0 ? `${formatTRY(Math.max(remaining, 0))} remaining` : 'Budget not set'
          }
        />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium text-muted sm:flex-1">
            <span>
              Today:{' '}
              <span className="font-semibold text-secondary">
                <AnimatedNumber value={todaySpending} format={formatTRY} />
              </span>
            </span>
            <span>Budget: {budgetAvailable > 0 ? formatTRY(budgetAvailable) : 'Not set'}</span>
          </div>
          <Link
            href="/app/budgets"
            prefetch={false}
            onClick={(event) => {
              if (navigator.onLine !== false) return;
              event.preventDefault();
              window.location.assign('/app/budgets');
            }}
            className={cn(
              buttonVariants({ variant: budgetAvailable > 0 ? 'secondary' : 'primary', size: 'sm' }),
              'w-full sm:w-auto'
            )}
          >
            {budgetAvailable > 0 ? 'Edit budget' : 'Set budget'}
          </Link>
        </div>
      </motion.div>

      <div>
        <h2 className="text-sm font-semibold text-muted">Balances</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {balances.map((balance, i) => (
            <motion.div
              key={balance.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 + i * 0.04, duration: 0.25, ease: 'easeOut' }}
              className="min-w-0 rounded-xl border border-subtle bg-surface px-3 py-2"
            >
              <p className="truncate text-xs font-medium text-muted">
                {balance.currency} {balance.method}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-primary">
                <AnimatedNumber
                  value={balance.amount}
                  format={(v) => formatCurrency(v, balance.currency)}
                />
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
