'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { clampPercent } from '@/format';
import { formatCurrency } from '@/currencies/currencyCatalog';
import { fetchHistoricalExchangeRate } from '@/exchangeRates';
import {
  getTransactionAmountInCurrency,
  loadHistoricalReportRatesInCurrency,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard, SkeletonMetric } from '@/components/ui/Skeleton';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { Currency, Transaction } from '@/types';

type BalanceRateMap = Record<string, number>;

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
  const [budgetRates, setBudgetRates] = useState<HistoricalReportRateMap>({});
  const [balanceRates, setBalanceRates] = useState<BalanceRateMap>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateError, setRateError] = useState(false);

  const defaultCurrency = settings?.defaultCurrency ?? 'TRY';
  const budgetCurrency = monthlyBudget?.currency ?? defaultCurrency;
  const today = formatLocalDate(new Date());
  const thirtyDaysAgo = shiftDate(today, -29);

  const dashboardTransactions = useMemo(
    () => (transactions ?? []).filter((transaction) => transaction.date >= thirtyDaysAgo || transaction.date.startsWith(currentMonth)),
    [currentMonth, thirtyDaysAgo, transactions]
  );
  const monthTransactions = useMemo(
    () => dashboardTransactions.filter((transaction) => transaction.date.startsWith(currentMonth)),
    [currentMonth, dashboardTransactions]
  );

  useEffect(() => {
    if (!transactions || !settings || !balances) return;
    const controller = new AbortController();
    queueMicrotask(() => { setRatesLoading(true); setRateError(false); });

    const load = async () => {
      try {
        const [defaultRates, currentBalanceRates, currentBudgetRates] = await Promise.all([
          loadHistoricalReportRatesInCurrency(dashboardTransactions, defaultCurrency, controller.signal),
          loadBalanceRates(balances, defaultCurrency, today, controller.signal),
          budgetCurrency === defaultCurrency
            ? Promise.resolve({} as HistoricalReportRateMap)
            : loadHistoricalReportRatesInCurrency(monthTransactions, budgetCurrency, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setRates(defaultRates);
        setBalanceRates(currentBalanceRates);
        setBudgetRates(currentBudgetRates);
      } catch {
        if (!controller.signal.aborted) setRateError(true);
      } finally {
        if (!controller.signal.aborted) setRatesLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [balances, budgetCurrency, dashboardTransactions, defaultCurrency, monthTransactions, settings, today, transactions]);

  if (!balances || !transactions || !categories || !settings || monthlyBudget === undefined) {
    return <section className="space-y-4" aria-busy="true" aria-label="Loading dashboard"><div className="grid gap-3 sm:grid-cols-3"><SkeletonMetric /><SkeletonMetric /><SkeletonMetric /></div><SkeletonCard /><SkeletonCard /></section>;
  }

  const convert = (transaction: Transaction, quote = defaultCurrency) => {
    const map = quote === defaultCurrency ? rates : budgetRates;
    return getTransactionAmountInCurrency(transaction, map, quote);
  };

  const monthIncome = sumTransactions(monthTransactions.filter((t) => t.type === 'income'), convert);
  const monthExpenses = sumTransactions(monthTransactions.filter((t) => t.type === 'expense'), convert);
  const monthNet = monthIncome - monthExpenses;
  const totalBalance = balances.reduce((sum, balance) => {
    if (balance.currency === defaultCurrency) return sum + balance.amount;
    const rate = balanceRates[balance.currency];
    return rate ? sum + balance.amount * rate : sum;
  }, 0);

  const budgetSpent = sumTransactions(
    monthTransactions.filter((transaction) => transaction.type === 'expense'),
    (transaction) => convert(transaction, budgetCurrency)
  );
  const budgetAvailable = (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const budgetRemaining = budgetAvailable - budgetSpent;
  const budgetUsed = budgetAvailable > 0 ? clampPercent((budgetSpent / budgetAvailable) * 100) : 0;

  const trendData = buildTrendData(dashboardTransactions, thirtyDaysAgo, today, convert);
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const categorySpending = new Map<string, number>();
  for (const transaction of monthTransactions) {
    if (transaction.type !== 'expense') continue;
    const amount = convert(transaction);
    if (amount === null) continue;
    categorySpending.set(transaction.categoryId, (categorySpending.get(transaction.categoryId) ?? 0) + amount);
  }
  const topCategories = [...categorySpending.entries()]
    .map(([categoryId, amount]) => ({ name: categoryById.get(categoryId) ?? 'Other', amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Available" value={totalBalance} currency={defaultCurrency} loading={ratesLoading} />
        <Metric label="Month net" value={monthNet} currency={defaultCurrency} tone={monthNet >= 0 ? 'good' : 'bad'} loading={ratesLoading} />
        <Metric label={budgetAvailable > 0 ? 'Budget left' : 'Month spent'} value={budgetAvailable > 0 ? budgetRemaining : monthExpenses} currency={budgetAvailable > 0 ? budgetCurrency : defaultCurrency} tone={budgetAvailable > 0 && budgetRemaining < 0 ? 'bad' : 'neutral'} loading={ratesLoading} />
      </div>

      {rateError ? <p className="rounded-xl border border-subtle bg-surface-muted px-3 py-2 text-xs font-medium text-muted">Cross-currency totals are temporarily incomplete.</p> : null}

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-primary">Spending trend</h2><p className="mt-1 text-sm text-muted">Last 30 days · {defaultCurrency}</p></div><Link href="/app/reports" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Reports</Link></div>
        <div className="mt-5 h-44" aria-label="Daily spending over the last 30 days">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={trendData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={6} /><Tooltip cursor={{ fill: 'var(--surface-muted)' }} formatter={(value) => formatCurrency(Number(value ?? 0), defaultCurrency)} labelFormatter={(label) => String(label)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 12 }} /><Bar dataKey="amount" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-subtle bg-surface p-5">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-primary">Budget health</h2><Link href="/app/budgets" className="text-sm font-semibold text-accent hover:underline">Manage</Link></div>
          {budgetAvailable > 0 ? <><div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-xs font-medium text-muted">Spent</p><p className="mt-1 text-xl font-bold text-primary">{formatCurrency(budgetSpent, budgetCurrency)}</p></div><p className={`text-sm font-semibold ${budgetRemaining >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(budgetRemaining, budgetCurrency)} left</p></div><ProgressBar className="mt-4" percent={budgetUsed} usedLabel={`${Math.round(budgetUsed)}% used`} remainingLabel={formatCurrency(Math.max(budgetRemaining, 0), budgetCurrency)} /></> : <div className="mt-5 rounded-xl bg-surface-muted p-4"><p className="text-sm font-medium text-secondary">No budget for this month.</p><Link href="/app/budgets" className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline">Set a budget</Link></div>}
        </section>

        <section className="rounded-2xl border border-subtle bg-surface p-5">
          <h2 className="text-base font-semibold text-primary">Top spending</h2>
          {topCategories.length ? <div className="mt-4 space-y-3">{topCategories.map((item, index) => <div key={item.name} className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">{item.name}</span><span className="text-sm font-bold tabular-nums text-primary">{formatCurrency(item.amount, defaultCurrency)}</span></div>)}</div> : <p className="mt-5 text-sm text-muted">No spending yet this month.</p>}
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-muted">Balances</h2><span className="text-xs font-medium text-muted">{defaultCurrency} summary</span></div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{balances.map((balance) => <div key={balance.id} className="min-w-0 rounded-xl border border-subtle bg-surface px-3 py-2"><p className="truncate text-xs font-medium text-muted">{balance.currency} {balance.method}</p><p className="mt-0.5 truncate text-sm font-bold tabular-nums text-primary"><AnimatedNumber value={balance.amount} format={(value) => formatCurrency(value, balance.currency)} /></p></div>)}</div>
      </section>
    </section>
  );
}

function Metric({ label, value, currency, tone = 'neutral', loading }: { label: string; value: number; currency: Currency; tone?: 'neutral' | 'good' | 'bad'; loading: boolean }) {
  const toneClass = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-primary';
  return <div className="rounded-2xl border border-subtle bg-surface p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className={`mt-2 text-xl font-bold tabular-nums ${toneClass}`}>{loading ? '…' : <AnimatedNumber value={value} format={(amount) => formatCurrency(amount, currency)} />}</p></div>;
}

function sumTransactions(transactions: Transaction[], convert: (transaction: Transaction) => number | null): number {
  return transactions.reduce((sum, transaction) => sum + (convert(transaction) ?? 0), 0);
}

function buildTrendData(transactions: Transaction[], start: string, end: string, convert: (transaction: Transaction) => number | null) {
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

async function loadBalanceRates(balances: Array<{ currency: Currency }>, quote: Currency, date: string, signal: AbortSignal): Promise<BalanceRateMap> {
  const codes = [...new Set(balances.map((balance) => balance.currency).filter((currency) => currency !== quote))];
  const entries = await Promise.all(codes.map(async (currency) => {
    const rate = await fetchHistoricalExchangeRate({ base: currency, quote, date, signal });
    return [currency, rate.rate] as const;
  }));
  return Object.fromEntries(entries);
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
