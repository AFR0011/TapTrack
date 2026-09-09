'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { clampPercent } from '@/format';
import { formatCurrency } from '@/currencies/currencyCatalog';
import { resolveActiveCurrencies } from '@/currencies/activeCurrencySelection';
import { fetchHistoricalExchangeRate } from '@/exchangeRates';
import {
  getTransactionAmountInCurrency,
  loadHistoricalReportRatesInCurrency,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard, SkeletonMetric } from '@/components/ui/Skeleton';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { Category, Currency, Transaction } from '@/types';

type BalanceRateMap = Record<string, number>;

type TopCategory = {
  category: Category | undefined;
  name: string;
  amount: number;
};

export default function DashboardSummary() {
  const balances = useLiveQuery(() => db.balances.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const currentMonth = getCurrentMonth();
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(currentMonth).first(),
    [currentMonth]
  );
  const [rates, setRates] = useState<HistoricalReportRateMap>({});
  const [balanceRates, setBalanceRates] = useState<BalanceRateMap>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateError, setRateError] = useState(false);

  const defaultCurrency = settings?.defaultCurrency ?? 'TRY';
  const activeCurrencies = useMemo(
    () => (settings ? resolveActiveCurrencies(settings, balances ?? []) : []),
    [balances, settings]
  );
  const activeBalances = useMemo(() => {
    const active = new Set(activeCurrencies);
    return (balances ?? []).filter((balance) => active.has(balance.currency));
  }, [activeCurrencies, balances]);
  const budgetCurrency = monthlyBudget?.currency ?? defaultCurrency;
  const today = formatLocalDate(new Date());
  const thirtyDaysAgo = shiftDate(today, -29);

  const dashboardTransactions = useMemo(
    () =>
      (transactions ?? []).filter(
        (transaction) => transaction.date >= thirtyDaysAgo || transaction.date.startsWith(currentMonth)
      ),
    [currentMonth, thirtyDaysAgo, transactions]
  );
  const monthTransactions = useMemo(
    () => dashboardTransactions.filter((transaction) => transaction.date.startsWith(currentMonth)),
    [currentMonth, dashboardTransactions]
  );

  useEffect(() => {
    if (!transactions || !settings || balances === undefined) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      setRatesLoading(true);
      setRateError(false);
    });

    const load = async () => {
      try {
        const [defaultRates, currentBalanceRates] = await Promise.all([
          loadHistoricalReportRatesInCurrency(dashboardTransactions, defaultCurrency, controller.signal),
          loadBalanceRates(activeBalances, defaultCurrency, today, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setRates(defaultRates);
        setBalanceRates(currentBalanceRates);
      } catch {
        if (!controller.signal.aborted) setRateError(true);
      } finally {
        if (!controller.signal.aborted) setRatesLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [activeBalances, balances, dashboardTransactions, defaultCurrency, settings, today, transactions]);

  if (!balances || !transactions || !categories || !settings || monthlyBudget === undefined) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
        <SkeletonCard />
      </section>
    );
  }

  const convert = (transaction: Transaction) =>
    getTransactionAmountInCurrency(transaction, rates, defaultCurrency);
  const monthIncome = sumTransactions(
    monthTransactions.filter((transaction) => transaction.type === 'income'),
    convert
  );
  const monthExpenses = sumTransactions(
    monthTransactions.filter((transaction) => transaction.type === 'expense'),
    convert
  );
  const monthNet = monthIncome - monthExpenses;
  const totalBalance = activeBalances.reduce((sum, balance) => {
    if (balance.currency === defaultCurrency) return sum + balance.amount;
    const rate = balanceRates[balance.currency];
    return rate ? sum + balance.amount * rate : sum;
  }, 0);

  const budgetSpent = monthTransactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' && transaction.currency === budgetCurrency
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAvailable =
    (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const budgetRemaining = budgetAvailable - budgetSpent;
  const budgetUsed = budgetAvailable > 0 ? clampPercent((budgetSpent / budgetAvailable) * 100) : 0;

  const trendData = buildTrendData(dashboardTransactions, thirtyDaysAgo, today, convert);
  const trendTotal = trendData.reduce((sum, item) => sum + item.amount, 0);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categorySpending = new Map<string, number>();
  for (const transaction of monthTransactions) {
    if (transaction.type !== 'expense') continue;
    const amount = convert(transaction);
    if (amount === null) continue;
    categorySpending.set(
      transaction.categoryId,
      (categorySpending.get(transaction.categoryId) ?? 0) + amount
    );
  }
  const topCategories: TopCategory[] = [...categorySpending.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryById.get(categoryId);
      return {
        category,
        name: category?.name ?? 'Other',
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  return (
    <section className="space-y-6">
      <Link
        href="/app/balances"
        prefetch={false}
        className={cn(
          'group relative block overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-[0_20px_55px_rgba(30,64,175,0.22)] transition-transform md:p-6',
          'hover:-translate-y-0.5',
          focusVisibleRing
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/80">Available</p>
              <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">
                {ratesLoading ? '…' : (
                  <AnimatedNumber value={totalBalance} format={(amount) => formatCurrency(amount, defaultCurrency)} />
                )}
              </p>
              <p className="mt-2 text-sm font-medium text-blue-100/70">
                {activeBalances.length} active balance{activeBalances.length === 1 ? '' : 's'} · {defaultCurrency} summary
              </p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-blue-100 ring-1 ring-white/10 transition-colors group-hover:bg-white/15" aria-hidden="true">
              ↗
            </span>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <HeroMetric label="Month net" value={monthNet} currency={defaultCurrency} tone={monthNet >= 0 ? 'good' : 'bad'} loading={ratesLoading} />
            <HeroMetric
              label={budgetAvailable > 0 ? 'Budget left' : 'Month spent'}
              value={budgetAvailable > 0 ? budgetRemaining : monthExpenses}
              currency={budgetAvailable > 0 ? budgetCurrency : defaultCurrency}
              tone={budgetAvailable > 0 && budgetRemaining < 0 ? 'bad' : 'neutral'}
              loading={ratesLoading}
            />
          </div>
        </div>
      </Link>

      {rateError ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-xs font-medium text-muted">
          Some active currency balances could not be included in the total right now.
        </p>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">This month</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Cash flow</h2>
          </div>
          <Link href="/app/reports" prefetch={false} className="text-sm font-semibold text-accent hover:underline">
            Reports
          </Link>
        </div>

        <div className="rounded-[1.5rem] bg-surface p-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)] ring-1 ring-subtle/70 dark:shadow-none md:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <EditorialMetric label="Income" value={monthIncome} currency={defaultCurrency} tone="good" loading={ratesLoading} />
            <EditorialMetric label="Spent" value={monthExpenses} currency={defaultCurrency} tone="neutral" loading={ratesLoading} />
            <div className="col-span-2 sm:col-span-1">
              <EditorialMetric label="Net" value={monthNet} currency={defaultCurrency} tone={monthNet >= 0 ? 'good' : 'bad'} loading={ratesLoading} />
            </div>
          </div>

          {trendTotal > 0 ? (
            <div className="mt-5 h-36" aria-label="Daily spending over the last 30 days">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboardSpendingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    interval={6}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
                    formatter={(value) => formatCurrency(Number(value ?? 0), defaultCurrency)}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      boxShadow: '0 12px 32px rgb(15 23 42 / 0.14)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--chart-1)"
                    strokeWidth={2.25}
                    fill="url(#dashboardSpendingFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--chart-1)', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-surface-muted px-4 py-5">
              <p className="text-sm font-semibold text-secondary">No spending in the last 30 days.</p>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Plan</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Budget</h2>
            </div>
            <Link href="/app/budgets" prefetch={false} className="text-sm font-semibold text-accent hover:underline">
              Manage
            </Link>
          </div>

          <div className="rounded-[1.5rem] bg-surface p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none md:p-5">
            {budgetAvailable > 0 ? (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted">Remaining</p>
                    <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', budgetRemaining >= 0 ? 'text-primary' : 'text-danger')}>
                      {formatCurrency(budgetRemaining, budgetCurrency)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-muted">{Math.round(budgetUsed)}% used</p>
                </div>
                <ProgressBar
                  className="mt-4"
                  percent={budgetUsed}
                  usedLabel={`${Math.round(budgetUsed)}% used`}
                  remainingLabel={formatCurrency(Math.max(budgetRemaining, 0), budgetCurrency)}
                  ariaLabel="Monthly budget used"
                  ariaValueText={`${Math.round(budgetUsed)}% used, ${formatCurrency(Math.max(budgetRemaining, 0), budgetCurrency)} remaining`}
                />
                <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3 text-xs font-medium text-muted">
                  <span>{formatCurrency(budgetSpent, budgetCurrency)} spent</span>
                  <span>{formatCurrency(budgetAvailable, budgetCurrency)} total</span>
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-sm font-semibold text-secondary">No budget for this month.</p>
                <Link href="/app/budgets" prefetch={false} className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">
                  Set a budget
                </Link>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Patterns</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Top spending</h2>
          </div>

          <div className="rounded-[1.5rem] bg-surface px-4 py-2 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
            {topCategories.length ? (
              <div className="divide-y divide-subtle">
                {topCategories.map((item) => (
                  <div key={item.name} className="flex items-center gap-3 py-3.5">
                    <CategoryIcon icon={item.category?.icon} color={item.category?.color} className="h-10 w-10 rounded-2xl" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">{item.name}</span>
                    <span className="text-sm font-bold tabular-nums text-primary">{formatCurrency(item.amount, defaultCurrency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-5 text-sm text-muted">No spending yet this month.</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Accounts</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Balances</h2>
          </div>
          <Link href="/app/balances" prefetch={false} className="text-sm font-semibold text-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
          {activeBalances.map((balance) => (
            <Link
              key={balance.id}
              href="/app/balances"
              prefetch={false}
              className={cn(
                'min-w-[10.5rem] rounded-[1.35rem] bg-surface px-4 py-3.5 shadow-[0_6px_22px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 transition-transform hover:-translate-y-0.5 dark:shadow-none sm:min-w-0',
                focusVisibleRing
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{balance.currency} · {capitalize(balance.method)}</p>
              <p className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums text-primary">
                <AnimatedNumber value={balance.amount} format={(value) => formatCurrency(value, balance.currency)} />
              </p>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  currency,
  tone,
  loading,
}: {
  label: string;
  value: number;
  currency: Currency;
  tone: 'neutral' | 'good' | 'bad';
  loading: boolean;
}) {
  const toneClass = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white';
  return (
    <div>
      <p className="text-xs font-medium text-blue-100/60">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tracking-tight tabular-nums', toneClass)}>
        {loading ? '…' : <AnimatedNumber value={value} format={(amount) => formatCurrency(amount, currency)} />}
      </p>
    </div>
  );
}

function EditorialMetric({
  label,
  value,
  currency,
  tone,
  loading,
}: {
  label: string;
  value: number;
  currency: Currency;
  tone: 'neutral' | 'good' | 'bad';
  loading: boolean;
}) {
  const toneClass = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-primary';
  return (
    <div className="rounded-2xl bg-surface-muted/70 px-3.5 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn('mt-1 text-base font-semibold tracking-tight tabular-nums', toneClass)}>
        {loading ? '…' : <AnimatedNumber value={value} format={(amount) => formatCurrency(amount, currency)} />}
      </p>
    </div>
  );
}

function sumTransactions(
  transactions: Transaction[],
  convert: (transaction: Transaction) => number | null
): number {
  return transactions.reduce((sum, transaction) => sum + (convert(transaction) ?? 0), 0);
}

function buildTrendData(
  transactions: Transaction[],
  start: string,
  end: string,
  convert: (transaction: Transaction) => number | null
) {
  const spending = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || transaction.date < start || transaction.date > end) continue;
    const amount = convert(transaction);
    if (amount === null) continue;
    spending.set(transaction.date, (spending.get(transaction.date) ?? 0) + amount);
  }
  const rows: Array<{ date: string; label: string; amount: number }> = [];
  let cursor = start;
  while (cursor <= end) {
    rows.push({ date: cursor, label: cursor.slice(5), amount: spending.get(cursor) ?? 0 });
    cursor = shiftDate(cursor, 1);
  }
  return rows;
}

async function loadBalanceRates(
  balances: Array<{ currency: Currency }>,
  quote: Currency,
  date: string,
  signal: AbortSignal
): Promise<BalanceRateMap> {
  const codes = [
    ...new Set(
      balances.map((balance) => balance.currency).filter((currency) => currency !== quote)
    ),
  ];
  const entries = await Promise.all(
    codes.map(async (currency) => {
      const rate = await fetchHistoricalExchangeRate({ base: currency, quote, date, signal });
      return [currency, rate.rate] as const;
    })
  );
  return Object.fromEntries(entries);
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
