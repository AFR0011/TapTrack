'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { getCurrentMonth, getPreviousMonth } from '@/dates';
import { exportPDF, type ReportExportOptions } from '@/exports/exportService';
import { clampPercent, formatMoney } from '@/format';
import { calculateIncomeVsExpense } from '@/reports/reportService';
import { getBudgetPerformance } from '@/reports/reportTransforms';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard, SkeletonMetric } from '@/components/ui/Skeleton';
import { StatCard, StatRow } from '@/components/ui/StatRow';
import { ToggleRow } from '@/components/ui/Toggle';
import { downloadBlob } from '@/lib/download';
import type { ExchangeRates, Transaction } from '@/types';

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

const CHART_Y_AXIS = {
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  tickLine: false,
  axisLine: false,
  width: 56,
  tickFormatter: (value: number) => formatCompactAxisMoney(Number(value)),
} as const;

const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    padding: 0,
  },
  wrapperStyle: {
    outline: 'none',
    zIndex: 20,
  },
  labelStyle: {
    color: 'var(--text-muted)',
  },
  itemStyle: {
    color: 'var(--text-primary)',
  },
  cursor: {
    fill: 'var(--surface-muted)',
    opacity: 0.45,
  },
} as const;

type ReportMode = 'month' | 'range' | 'year';

function toTRY(amount: number, currency: string, rates: ExchangeRates | null): number {
  if (currency === 'TRY' || !rates) return amount;
  if (currency === 'USD') return amount * rates.USD;
  if (currency === 'EUR') return amount * rates.EUR;
  return amount;
}

function calculateReportTotals(transactions: Transaction[], rates: ExchangeRates | null) {
  if (!rates) return calculateIncomeVsExpense(transactions);

  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    const amount = toTRY(transaction.amount, transaction.currency, rates);
    if (transaction.type === 'income') income += amount;
    else expense += amount;
  }
  return { income, expense, net: income - expense };
}

export default function ReportsWorkspace() {
  const router = useRouter();
  const currentMonth = getCurrentMonth();
  const [reportMode, setReportMode] = useState<ReportMode>('month');
  const [month, setMonth] = useState(currentMonth);
  const [rangeStart, setRangeStart] = useState(`${currentMonth}-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(currentMonth.slice(0, 4));
  const [unifyToTRY, setUnifyToTRY] = useState(false);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(month).first(),
    [month]
  );
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('month').equals(month).toArray(),
    [month]
  );
  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    categoryBudgets === undefined ||
    monthlyBudget === undefined;

  useEffect(() => {
    if (!unifyToTRY || rates) return;
    setRatesLoading(true);
    fetch('/api/exchange-rates')
      .then((response) => response.json())
      .then((data: ExchangeRates) => setRates(data))
      .catch(() => setRates({ USD: 38.5, EUR: 42 }))
      .finally(() => setRatesLoading(false));
  }, [rates, unifyToTRY]);

  const activeRates = unifyToTRY ? rates : null;
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );

  const activeTransactions = useMemo(() => {
    const rows = transactions ?? [];
    if (reportMode === 'month') {
      return rows.filter((transaction) => transaction.date.startsWith(month));
    }
    if (reportMode === 'year') {
      return rows.filter((transaction) => transaction.date.startsWith(year));
    }

    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return rows.filter((transaction) => transaction.date >= start && transaction.date <= end);
  }, [month, rangeEnd, rangeStart, reportMode, transactions, year]);

  const previousMonthTransactions = useMemo(
    () => (transactions ?? []).filter((transaction) => transaction.date.startsWith(getPreviousMonth(month))),
    [month, transactions]
  );

  const incomeVsExpense = useMemo(
    () => calculateReportTotals(activeTransactions, activeRates),
    [activeRates, activeTransactions]
  );

  const previousIncomeVsExpense = useMemo(
    () => calculateReportTotals(previousMonthTransactions, activeRates),
    [activeRates, previousMonthTransactions]
  );

  const categoryData = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      if (!activeRates && transaction.currency !== 'TRY') continue;
      const amount = toTRY(transaction.amount, transaction.currency, activeRates);
      spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + amount);
    }

    return [...spending.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        name: categoryById.get(categoryId)?.name ?? categoryId,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeRates, activeTransactions, categoryById]);

  const spendingOverTime = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      if (!activeRates && transaction.currency !== 'TRY') continue;
      const amount = toTRY(transaction.amount, transaction.currency, activeRates);
      spending.set(transaction.date, (spending.get(transaction.date) ?? 0) + amount);
    }

    return [...spending.entries()]
      .map(([date, amount]) => ({
        date: reportMode === 'year' ? date.slice(5) : date,
        amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeRates, activeTransactions, reportMode]);

  const comparisonData = useMemo(() => {
    if (reportMode === 'month') {
      return [
        { label: getPreviousMonth(month), income: previousIncomeVsExpense.income, expense: previousIncomeVsExpense.expense },
        { label: month, income: incomeVsExpense.income, expense: incomeVsExpense.expense },
      ];
    }

    if (reportMode === 'year') {
      return Array.from({ length: 12 }, (_, index) => {
        const itemMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
        const totals = calculateReportTotals(
          (transactions ?? []).filter((transaction) => transaction.date.startsWith(itemMonth)),
          activeRates
        );
        return { label: itemMonth.slice(5), income: totals.income, expense: totals.expense };
      });
    }

    return [{ label: 'Range', income: incomeVsExpense.income, expense: incomeVsExpense.expense }];
  }, [activeRates, incomeVsExpense, month, previousIncomeVsExpense, reportMode, transactions, year]);

  const budgetPerformance = getBudgetPerformance(
    month,
    monthlyBudget ?? null,
    categoryBudgets ?? [],
    transactions ?? []
  );
  const budgetPercent =
    budgetPerformance.available > 0
      ? clampPercent((budgetPerformance.totalSpent / budgetPerformance.available) * 100)
      : 0;

  const rateLabel =
    activeRates && !ratesLoading
      ? `1 USD = ${activeRates.USD.toFixed(1)} TRY; 1 EUR = ${activeRates.EUR.toFixed(1)} TRY`
      : '';

  const handleExportPDF = async () => {
    setExporting(true);
    setExportError('');

    const options: ReportExportOptions =
      reportMode === 'month'
        ? { mode: 'month', month }
        : reportMode === 'year'
          ? { mode: 'year', year }
          : { mode: 'range', startDate: rangeStart, endDate: rangeEnd };

    try {
      const blob = await exportPDF(options);
      downloadBlob(`taptrack-${reportMode}-report.pdf`, blob);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading reports">
        <PageHeader title="Reports" description="Income, spending, and budgets." />
        <div className="flex flex-col gap-5">
          <div className="order-1 grid gap-4 md:order-2 md:grid-cols-3">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
          <SkeletonCard className="order-2 md:order-1" />
          <div className="order-3 grid gap-4 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Income, spending, and budgets."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ModeButton mode="month" activeMode={reportMode} onClick={setReportMode} />
            <ModeButton mode="range" activeMode={reportMode} onClick={setReportMode} />
            <ModeButton mode="year" activeMode={reportMode} onClick={setReportMode} />
          </div>
        }
      />

      <div className="flex flex-col gap-5">
        <section className="order-1 grid gap-4 md:order-2 md:grid-cols-3">
          <StatCard label="Income" value={formatMoney(incomeVsExpense.income)} tone="good" />
          <StatCard label="Expenses" value={formatMoney(incomeVsExpense.expense)} tone="bad" />
          <StatCard label="Net" value={formatMoney(incomeVsExpense.net)} tone={incomeVsExpense.net >= 0 ? 'good' : 'bad'} />
        </section>

        <section className="order-2 rounded-2xl border border-subtle bg-surface p-5 md:order-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              {reportMode === 'month' ? (
                <Field label="Month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
              ) : null}
              {reportMode === 'range' ? (
                <>
                  <Field label="Start" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
                  <Field label="End" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
                </>
              ) : null}
              {reportMode === 'year' ? (
                <Field
                  label="Year"
                  type="number"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  min="2000"
                  max="2100"
                />
              ) : null}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportPDF}
              loading={exporting}
              disabled={exporting}
            >
              Export PDF
            </Button>
          </div>

          <ToggleRow
            className="mt-4"
            label="Convert all to TRY"
            description={
              ratesLoading
                ? 'Loading exchange rates…'
                : unifyToTRY && rateLabel
                  ? rateLabel
                  : undefined
            }
            checked={unifyToTRY}
            onChange={() => setUnifyToTRY((value) => !value)}
            disabled={ratesLoading}
          />

          <p className="mt-3 text-sm font-medium text-muted" role="status">
            {unifyToTRY
              ? 'Including USD and EUR converted to TRY in this report view.'
              : 'Showing TRY transactions only. Enable "Convert all to TRY" to include USD/EUR.'}
          </p>

          {exportError ? <p className="mt-3 text-sm font-medium text-danger">{exportError}</p> : null}
        </section>

        <section className="order-3 grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Spending by category" empty={categoryData.length === 0}>
          <CategorySpendingList items={categoryData} />
        </ChartPanel>

        <ChartPanel title="Spending over time" empty={spendingOverTime.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={spendingOverTime}>
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis {...CHART_Y_AXIS} />
              <Tooltip content={<ChartTooltip />} {...CHART_TOOLTIP_PROPS} />
              <Line type="monotone" dataKey="amount" name="Spent" stroke="var(--chart-1)" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title={reportMode === 'year' ? 'Monthly income vs expense' : 'Income vs expense'}
          empty={comparisonData.every((item) => item.income === 0 && item.expense === 0)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparisonData}>
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis {...CHART_Y_AXIS} />
              <Tooltip content={<ChartTooltip />} {...CHART_TOOLTIP_PROPS} />
              <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expenses" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <div className="rounded-2xl border border-subtle bg-surface p-5 ">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-primary">Budget performance</h2>
            <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => router.push('/app/budgets')}>
              Manage budgets
            </Button>
          </div>
          {reportMode !== 'month' ? (
            <EmptyState
              title="Budget view is monthly."
              description="Switch to Month to review TRY budgets and rollover."
              className="mt-4"
            />
          ) : (
            <>
              <ProgressBar
                className="mt-4"
                percent={budgetPercent}
                usedLabel={
                  budgetPerformance.available > 0
                    ? `${Math.round(budgetPercent)}% used`
                    : undefined
                }
                remainingLabel={
                  budgetPerformance.available > 0
                    ? `${formatMoney(Math.max(budgetPerformance.remaining, 0))} remaining`
                    : 'Set a monthly total on Budgets'
                }
              />
              <div className="mt-4 grid gap-2">
                <StatRow label="Available" value={formatMoney(budgetPerformance.available)} />
                <StatRow label="Spent" value={formatMoney(budgetPerformance.totalSpent)} />
                <StatRow
                  label="Remaining"
                  value={formatMoney(budgetPerformance.remaining)}
                  tone={budgetPerformance.remaining >= 0 ? 'good' : 'bad'}
                />
              </div>
              <div className="mt-4 divide-y divide-subtle">
                {budgetPerformance.categoryBudgets.length === 0 ? (
                  <EmptyState title="No category budgets yet." description="Set category limits on Budgets." compact />
                ) : (
                  budgetPerformance.categoryBudgets.map((item) => (
                    <div key={item.categoryId} className="flex items-center justify-between py-3 text-sm">
                      <span className="font-medium text-secondary">{categoryById.get(item.categoryId)?.name ?? item.categoryId}</span>
                      <span className="font-semibold text-primary">
                        {formatMoney(item.spent)} / {formatMoney(item.budget)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        </section>
      </div>
    </div>
  );
}

function ModeButton({
  mode,
  activeMode,
  onClick,
}: {
  mode: ReportMode;
  activeMode: ReportMode;
  onClick: (mode: ReportMode) => void;
}) {
  const active = mode === activeMode;
  const label = mode === 'month' ? 'Month' : mode === 'range' ? 'Range' : 'Year';

  return (
    <Button
      type="button"
      variant={active ? 'primary' : 'subtle'}
      size="sm"
      onClick={() => onClick(mode)}
    >
      {label}
    </Button>
  );
}

function formatCompactAxisMoney(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M ₺`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k ₺`;
  }
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })} ₺`;
}

function formatTooltipSeriesName(name?: string) {
  if (!name) return 'Amount';
  if (name === 'income' || name === 'Income') return 'Income';
  if (name === 'expense' || name === 'Expenses') return 'Expenses';
  if (name === 'amount' || name === 'Spent') return 'Spent';
  return name;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-[var(--shadow-overlay)]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      {label ? (
        <p className="mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
              {entry.color ? (
                <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} aria-hidden />
              ) : null}
              {formatTooltipSeriesName(entry.name)}
            </span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatMoney(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategorySpendingList({
  items,
}: {
  items: Array<{ categoryId: string; name: string; amount: number }>;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const percent = total > 0 ? (item.amount / total) * 100 : 0;
        const barColor = COLORS[index % COLORS.length];

        return (
          <div key={item.categoryId}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-primary">{item.name}</span>
              <div className="flex shrink-0 items-baseline gap-2 text-sm tabular-nums">
                <span className="font-semibold text-primary">{formatMoney(item.amount)}</span>
                <span className="font-medium text-muted">{Math.round(percent)}%</span>
              </div>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${percent}%`, background: barColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartPanel({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5 ">
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      {empty ? (
        <EmptyState title="No report data yet." description="Log a transaction for this period." className="mt-4" />
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </div>
  );
}
