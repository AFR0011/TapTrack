'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
import RecentTransactions from '@/components/RecentTransactions';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { Category, Currency, Transaction } from '@/types';

type BalanceRateMap = Record<string, number>;
type AnalyticsTab = 'spending' | 'budget' | 'categories';

type TopCategory = {
  category: Category | undefined;
  name: string;
  amount: number;
};

const ANALYTICS_TABS: Array<{ id: AnalyticsTab; label: string }> = [
  { id: 'spending', label: 'Spending' },
  { id: 'budget', label: 'Budget' },
  { id: 'categories', label: 'Categories' },
];

export default function DashboardSummary() {
  const reduceMotion = useReducedMotion();
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
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('spending');

  const defaultCurrency = settings?.defaultCurrency ?? 'TRY';
  const activeCurrencies = useMemo(
    () => (settings ? resolveActiveCurrencies(settings, balances ?? []) : []),
    [balances, settings]
  );
  const activeBalances = useMemo(() => {
    const active = new Set(activeCurrencies);
    return (balances ?? []).filter((balance) => active.has(balance.currency));
  }, [activeCurrencies, balances]);
  const balanceSummaries = useMemo(
    () =>
      activeCurrencies.map((currency) => ({
        currency,
        amount: activeBalances
          .filter((balance) => balance.currency === currency)
          .reduce((sum, balance) => sum + balance.amount, 0),
      })),
    [activeBalances, activeCurrencies]
  );
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
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
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
  const topCategoryTotal = topCategories.reduce((sum, item) => sum + item.amount, 0);

  const moveAnalytics = (direction: -1 | 1) => {
    const index = ANALYTICS_TABS.findIndex((tab) => tab.id === analyticsTab);
    const next = index + direction;
    if (next >= 0 && next < ANALYTICS_TABS.length) setAnalyticsTab(ANALYTICS_TABS[next].id);
  };

  return (
    <section className="space-y-6">
      <Link
        href="/app/balances"
        prefetch={false}
        className={cn(
          'group relative block overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-[0_20px_55px_rgba(30,64,175,0.22)] md:p-6',
          focusVisibleRing
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/80">Available</p>
              <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">
                {ratesLoading ? '…' : (
                  <AnimatedNumber value={totalBalance} format={(amount) => formatCurrency(amount, defaultCurrency)} />
                )}
              </p>
              <p
                className={cn(
                  'mt-2 text-sm font-semibold tabular-nums',
                  monthNet > 0
                    ? 'text-emerald-300'
                    : monthNet < 0
                      ? 'text-rose-300'
                      : 'text-blue-100/70'
                )}
              >
                {ratesLoading
                  ? '…'
                  : monthNet === 0
                    ? 'No net change this month'
                    : `${monthNet > 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(monthNet), defaultCurrency)} this month`}
              </p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-blue-100 ring-1 ring-white/10 transition-colors group-hover:bg-white/15" aria-hidden="true">
              ↗
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <HeroMetric
              label="Income"
              value={monthIncome}
              currency={defaultCurrency}
              tone="good"
              loading={ratesLoading}
            />
            <HeroMetric
              label="Spent"
              value={monthExpenses}
              currency={defaultCurrency}
              tone="neutral"
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

      <RecentTransactions />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Accounts</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Balances</h2>
          </div>
          <Link
            href="/app/balances"
            prefetch={false}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface px-3.5 text-sm font-semibold text-secondary shadow-sm ring-1 ring-subtle transition-colors hover:bg-surface-muted hover:text-primary',
              focusVisibleRing
            )}
          >
            View all <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
          {balanceSummaries.map((balance) => (
            <Link
              key={balance.currency}
              href="/app/balances"
              prefetch={false}
              className={cn(
                'min-w-[9.75rem] snap-start rounded-[1.35rem] bg-surface px-4 py-3.5 shadow-[0_6px_22px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:min-w-0',
                focusVisibleRing
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{balance.currency}</p>
              <p className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums text-primary">
                <AnimatedNumber value={balance.amount} format={(value) => formatCurrency(value, balance.currency)} />
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">This month</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Insights</h2>
          </div>
          <Link
            href="/app/reports"
            prefetch={false}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface px-3.5 text-sm font-semibold text-secondary shadow-sm ring-1 ring-subtle transition-colors hover:bg-surface-muted hover:text-primary',
              focusVisibleRing
            )}
          >
            Reports <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-[1.55rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.06)] ring-1 ring-subtle/70 dark:shadow-none">
          <div className="p-3 pb-0">
            <div className="grid grid-cols-3 rounded-2xl bg-surface-muted p-1" role="tablist" aria-label="Dashboard insights">
              {ANALYTICS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`dashboard-tab-${tab.id}`}
                  aria-selected={analyticsTab === tab.id}
                  aria-controls={`dashboard-panel-${tab.id}`}
                  onClick={() => setAnalyticsTab(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      moveAnalytics(-1);
                    }
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      moveAnalytics(1);
                    }
                  }}
                  className={cn(
                    'min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors',
                    analyticsTab === tab.id
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-muted hover:text-secondary',
                    focusVisibleRing
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-[13.5rem] overflow-hidden px-4 pb-4 pt-3 md:px-5 md:pb-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={analyticsTab}
                role="tabpanel"
                id={`dashboard-panel-${analyticsTab}`}
                aria-labelledby={`dashboard-tab-${analyticsTab}`}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.12}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  if (info.offset.x <= -55) moveAnalytics(1);
                  if (info.offset.x >= 55) moveAnalytics(-1);
                }}
                initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                style={{ touchAction: 'pan-y' }}
              >
                {analyticsTab === 'spending' ? (
                  <SpendingPanel
                    monthExpenses={monthExpenses}
                    monthIncome={monthIncome}
                    monthNet={monthNet}
                    currency={defaultCurrency}
                    loading={ratesLoading}
                    trendData={trendData}
                    trendTotal={trendTotal}
                  />
                ) : null}

                {analyticsTab === 'budget' ? (
                  <BudgetPanel
                    budgetAvailable={budgetAvailable}
                    budgetSpent={budgetSpent}
                    budgetRemaining={budgetRemaining}
                    budgetUsed={budgetUsed}
                    currency={budgetCurrency}
                  />
                ) : null}

                {analyticsTab === 'categories' ? (
                  <CategoriesPanel
                    topCategories={topCategories}
                    total={topCategoryTotal}
                    currency={defaultCurrency}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
    </section>
  );
}

function SpendingPanel({
  monthExpenses,
  monthIncome,
  monthNet,
  currency,
  loading,
  trendData,
  trendTotal,
}: {
  monthExpenses: number;
  monthIncome: number;
  monthNet: number;
  currency: Currency;
  loading: boolean;
  trendData: Array<{ date: string; label: string; amount: number }>;
  trendTotal: number;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted">Spent this month</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-primary">
            {loading ? '…' : <AnimatedNumber value={monthExpenses} format={(value) => formatCurrency(value, currency)} />}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted">Net</p>
          <p className={cn('mt-1 text-sm font-bold tabular-nums', monthNet >= 0 ? 'text-success' : 'text-danger')}>
            {loading ? '…' : formatCurrency(monthNet, currency)}
          </p>
        </div>
      </div>

      {trendTotal > 0 ? (
        <div className="mt-3 h-28" aria-label="Daily spending over the last 30 days">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
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
                interval={8}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
                formatter={(value) => formatCurrency(Number(value ?? 0), currency)}
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
        <div className="mt-4 rounded-2xl bg-surface-muted px-4 py-5">
          <p className="text-sm font-semibold text-secondary">No spending in the last 30 days.</p>
        </div>
      )}

      <p className="sr-only">Income this month was {formatCurrency(monthIncome, currency)}.</p>
    </div>
  );
}

function BudgetPanel({
  budgetAvailable,
  budgetSpent,
  budgetRemaining,
  budgetUsed,
  currency,
}: {
  budgetAvailable: number;
  budgetSpent: number;
  budgetRemaining: number;
  budgetUsed: number;
  currency: Currency;
}) {
  if (budgetAvailable <= 0) {
    return (
      <div className="flex min-h-[10rem] flex-col items-start justify-center">
        <p className="text-sm font-semibold text-secondary">No budget for this month.</p>
        <Link href="/app/budgets" prefetch={false} className="mt-3 text-sm font-semibold text-accent hover:underline">
          Set a budget
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-1">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted">Remaining</p>
          <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', budgetRemaining >= 0 ? 'text-primary' : 'text-danger')}>
            {formatCurrency(budgetRemaining, currency)}
          </p>
        </div>
        <p className="text-sm font-semibold text-muted">{Math.round(budgetUsed)}% used</p>
      </div>

      <ProgressBar
        className="mt-5"
        percent={budgetUsed}
        usedLabel={`${Math.round(budgetUsed)}% used`}
        remainingLabel={formatCurrency(Math.max(budgetRemaining, 0), currency)}
        ariaLabel="Monthly budget used"
        ariaValueText={`${Math.round(budgetUsed)}% used, ${formatCurrency(Math.max(budgetRemaining, 0), currency)} remaining`}
      />

      <div className="mt-5 flex items-center justify-between border-t border-subtle pt-4 text-xs font-medium text-muted">
        <span>{formatCurrency(budgetSpent, currency)} spent</span>
        <Link href="/app/budgets" prefetch={false} className="font-semibold text-accent hover:underline">
          {formatCurrency(budgetAvailable, currency)} total
        </Link>
      </div>
    </div>
  );
}

function CategoriesPanel({
  topCategories,
  total,
  currency,
}: {
  topCategories: TopCategory[];
  total: number;
  currency: Currency;
}) {
  if (!topCategories.length) {
    return (
      <div className="flex min-h-[10rem] items-center">
        <p className="text-sm text-muted">No spending yet this month.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-subtle">
      {topCategories.map((item) => {
        const share = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        return (
          <div key={item.name} className="py-3 first:pt-1 last:pb-1">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={item.category?.icon} color={item.category?.color} className="h-9 w-9 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-secondary">{item.name}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(item.amount, currency)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
