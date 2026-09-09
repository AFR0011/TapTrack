'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
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
import { CategoryIcon } from '@/categories/categoryVisuals';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonCard, SkeletonMetric } from '@/components/ui/Skeleton';
import { StatCard, StatRow } from '@/components/ui/StatRow';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { getCurrentMonth, getPreviousMonth } from '@/dates';
import { exportPDF, type ReportExportOptions } from '@/exports/exportService';
import { clampPercent, formatMoney } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import {
  getTransactionAmountInCurrency,
  loadHistoricalReportRates,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
import { calculateIncomeVsExpense } from '@/reports/reportService';
import { getBudgetPerformance } from '@/reports/reportTransforms';
import type { Currency, Transaction } from '@/types';

type ReportMode = 'month' | 'range' | 'year';
type ReportSection = 'overview' | 'spending' | 'budgets';
type ComparisonRow = { label: string; income: number; expense: number };
type SpendingRow = { date: string; amount: number };

const CHART_TOOLTIP_PROPS = {
  contentStyle: { background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 },
  wrapperStyle: { outline: 'none', zIndex: 20 },
  cursor: { fill: 'var(--surface-muted)', opacity: 0.45 },
} as const;

function getReportAmount(
  transaction: Transaction,
  reportCurrency: Currency,
  historicalRates: HistoricalReportRateMap,
  conversionAvailable: boolean
): number | null {
  if (transaction.currency === reportCurrency) return transaction.amount;
  if (!conversionAvailable) return null;
  return getTransactionAmountInCurrency(transaction, historicalRates, reportCurrency);
}

function calculateReportTotals(
  transactions: Transaction[],
  reportCurrency: Currency,
  historicalRates: HistoricalReportRateMap,
  conversionAvailable: boolean
) {
  if (!conversionAvailable) return calculateIncomeVsExpense(transactions, reportCurrency);
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    const amount = getReportAmount(transaction, reportCurrency, historicalRates, true);
    if (amount === null) continue;
    if (transaction.type === 'income') income += amount;
    else expense += amount;
  }
  return { income, expense, net: income - expense };
}

export default function ReportsWorkspace() {
  const router = useRouter();
  const currentMonth = getCurrentMonth();
  const { currencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
  const [section, setSection] = useState<ReportSection>('overview');
  const [reportMode, setReportMode] = useState<ReportMode>('month');
  const [month, setMonth] = useState(currentMonth);
  const [rangeStart, setRangeStart] = useState(`${currentMonth}-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(currentMonth.slice(0, 4));
  const [reportCurrency, setReportCurrency] = useState<Currency>('TRY');
  const [historicalRates, setHistoricalRates] = useState<HistoricalReportRateMap>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const monthlyBudget = useLiveQuery(
    async () =>
      (await db.monthlyBudgets
        .where('month')
        .equals(month)
        .filter((budget) => budget.currency === reportCurrency)
        .first()) ?? null,
    [month, reportCurrency]
  );
  const categoryBudgets = useLiveQuery(
    () =>
      db.categoryBudgets
        .where('month')
        .equals(month)
        .filter((budget) => budget.currency === reportCurrency)
        .toArray(),
    [month, reportCurrency]
  );

  useEffect(() => {
    if (currenciesLoading) return;
    if (currencies.includes(reportCurrency)) return;
    setReportCurrency(defaultCurrency);
  }, [currencies, currenciesLoading, defaultCurrency, reportCurrency]);

  const activeTransactions = useMemo(() => {
    const rows = transactions ?? [];
    if (reportMode === 'month') return rows.filter((transaction) => transaction.date.startsWith(month));
    if (reportMode === 'year') return rows.filter((transaction) => transaction.date.startsWith(year));
    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return rows.filter((transaction) => transaction.date >= start && transaction.date <= end);
  }, [month, rangeEnd, rangeStart, reportMode, transactions, year]);

  const previousMonthTransactions = useMemo(
    () =>
      reportMode === 'month'
        ? (transactions ?? []).filter((transaction) =>
            transaction.date.startsWith(getPreviousMonth(month))
          )
        : [],
    [month, reportMode, transactions]
  );

  const rateTransactions = useMemo(
    () => [...activeTransactions, ...previousMonthTransactions],
    [activeTransactions, previousMonthTransactions]
  );
  const needsConversion = rateTransactions.some(
    (transaction) => transaction.currency !== reportCurrency
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!needsConversion) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setHistoricalRates({});
        setRateError('');
        setRatesLoading(false);
      });
      return () => controller.abort();
    }

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setRatesLoading(true);
      setRateError('');
      setHistoricalRates({});
    });
    void loadHistoricalReportRates(rateTransactions, controller.signal, reportCurrency)
      .then((rates) => {
        if (!controller.signal.aborted) setHistoricalRates(rates);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoricalRates({});
          setRateError(
            `Some currencies could not be converted into ${reportCurrency}. Totals currently include ${reportCurrency} transactions only.`
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRatesLoading(false);
      });
    return () => controller.abort();
  }, [needsConversion, rateTransactions, reportCurrency]);

  const conversionAvailable = !rateError;
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );
  const totals = useMemo(
    () => calculateReportTotals(activeTransactions, reportCurrency, historicalRates, conversionAvailable),
    [activeTransactions, conversionAvailable, historicalRates, reportCurrency]
  );
  const previousTotals = useMemo(
    () =>
      calculateReportTotals(
        previousMonthTransactions,
        reportCurrency,
        historicalRates,
        conversionAvailable
      ),
    [conversionAvailable, historicalRates, previousMonthTransactions, reportCurrency]
  );

  const categoryData = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      const amount = getReportAmount(
        transaction,
        reportCurrency,
        historicalRates,
        conversionAvailable
      );
      if (amount === null) continue;
      spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + amount);
    }
    return [...spending.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeTransactions, conversionAvailable, historicalRates, reportCurrency]);

  const spendingOverTime = useMemo<SpendingRow[]>(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      const amount = getReportAmount(
        transaction,
        reportCurrency,
        historicalRates,
        conversionAvailable
      );
      if (amount === null) continue;
      spending.set(transaction.date, (spending.get(transaction.date) ?? 0) + amount);
    }
    return [...spending.entries()]
      .map(([date, amount]) => ({ date: reportMode === 'year' ? date.slice(5) : date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeTransactions, conversionAvailable, historicalRates, reportCurrency, reportMode]);

  const comparisonData = useMemo<ComparisonRow[]>(() => {
    if (reportMode === 'month') {
      return [
        {
          label: getPreviousMonth(month),
          income: previousTotals.income,
          expense: previousTotals.expense,
        },
        { label: month, income: totals.income, expense: totals.expense },
      ];
    }
    if (reportMode === 'year') {
      return Array.from({ length: 12 }, (_, index) => {
        const itemMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
        const itemTotals = calculateReportTotals(
          (transactions ?? []).filter((transaction) => transaction.date.startsWith(itemMonth)),
          reportCurrency,
          historicalRates,
          conversionAvailable
        );
        return { label: itemMonth.slice(5), income: itemTotals.income, expense: itemTotals.expense };
      });
    }
    return [{ label: 'Selected range', income: totals.income, expense: totals.expense }];
  }, [conversionAvailable, historicalRates, month, previousTotals, reportCurrency, reportMode, totals, transactions, year]);

  const budgetPerformance = getBudgetPerformance(
    month,
    monthlyBudget ?? null,
    categoryBudgets ?? [],
    transactions ?? [],
    reportCurrency
  );
  const budgetPercent =
    budgetPerformance.available > 0
      ? clampPercent((budgetPerformance.totalSpent / budgetPerformance.available) * 100)
      : 0;
  const largestCategory = categoryData[0];
  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    monthlyBudget === undefined ||
    categoryBudgets === undefined ||
    currenciesLoading;

  const handleExportPDF = async () => {
    setExporting(true);
    setExportError('');
    const fxOptions = conversionAvailable
      ? {
          convertToReportCurrency: true as const,
          reportCurrency,
          historicalRates,
        }
      : {
          convertToReportCurrency: false as const,
          reportCurrency,
        };
    const options: ReportExportOptions =
      reportMode === 'month'
        ? { mode: 'month', month, ...fxOptions }
        : reportMode === 'year'
          ? { mode: 'year', year, ...fxOptions }
          : { mode: 'range', startDate: rangeStart, endDate: rangeEnd, ...fxOptions };
    try {
      const blob = await exportPDF(options);
      downloadBlob(`taptrack-${reportMode}-report.pdf`, blob);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The PDF could not be created.');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading reports">
        <PageHeader title="Reports" description="Income, spending, and budgets." />
        <SkeletonCard />
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
      </div>
    );
  }

  const yAxis = {
    tick: { fill: 'var(--text-muted)', fontSize: 12 },
    tickLine: false,
    axisLine: false,
    width: 64,
    tickFormatter: (value: number) => formatCompactAxisMoney(Number(value), reportCurrency),
  } as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Understand where your money went without configuring the report engine first."
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleExportPDF()}
            loading={exporting}
            disabled={exporting || ratesLoading}
          >
            Export PDF
          </Button>
        }
      />

      <section className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5" aria-label="Report context">
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(140px,180px)] md:items-end">
          <div className="flex flex-wrap gap-2" aria-label="Report period type">
            {(['month', 'range', 'year'] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={reportMode === mode ? 'primary' : 'subtle'}
                size="sm"
                aria-pressed={reportMode === mode}
                onClick={() => setReportMode(mode)}
              >
                {mode === 'month' ? 'Month' : mode === 'range' ? 'Range' : 'Year'}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
              <Field label="Year" type="number" value={year} onChange={(event) => setYear(event.target.value)} min="2000" max="2100" />
            ) : null}
          </div>
          <SelectField
            label="Report currency"
            value={reportCurrency}
            onChange={(event) => setReportCurrency(event.target.value)}
            options={currencies.map((currency) => ({ value: currency, label: currency }))}
          />
        </div>
        <p className="mt-3 text-sm font-medium text-muted" role="status">
          {ratesLoading
            ? `Converting transactions into ${reportCurrency}…`
            : rateError
              ? rateError
              : needsConversion
                ? `Other currencies are converted into ${reportCurrency} using each transaction date.`
                : `All transactions in this report are already in ${reportCurrency}.`}
        </p>
        {exportError ? <p className="mt-2 text-sm font-medium text-danger" role="alert">{exportError}</p> : null}
      </section>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-subtle bg-surface p-1" aria-label="Report sections">
        {([
          ['overview', 'Overview'],
          ['spending', 'Spending'],
          ['budgets', 'Budgets'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            aria-current={section === value ? 'page' : undefined}
            className={cn(
              'min-h-11 min-w-28 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors',
              section === value
                ? 'bg-action-primary text-white'
                : 'text-secondary hover:bg-surface-muted hover:text-primary',
              focusVisibleRing
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === 'overview' ? (
        <section className="space-y-4" aria-labelledby="report-overview-heading">
          <h2 id="report-overview-heading" className="sr-only">Report overview</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Income" value={ratesLoading ? '…' : formatMoney(totals.income, reportCurrency)} tone="good" />
            <StatCard label="Expenses" value={ratesLoading ? '…' : formatMoney(totals.expense, reportCurrency)} tone="bad" />
            <StatCard label="Net" value={ratesLoading ? '…' : formatMoney(totals.net, reportCurrency)} tone={totals.net >= 0 ? 'good' : 'bad'} />
          </div>

          {!ratesLoading && activeTransactions.length > 0 ? (
            <div className="rounded-2xl border border-subtle bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">At a glance</p>
              <p className="mt-2 text-base font-semibold text-primary">
                {totals.net >= 0
                  ? `You finished ${formatMoney(totals.net, reportCurrency)} above zero.`
                  : `You finished ${formatMoney(Math.abs(totals.net), reportCurrency)} below zero.`}
              </p>
              <p className="mt-1 text-sm font-medium text-secondary">
                {largestCategory
                  ? `${categoryById.get(largestCategory.categoryId)?.name ?? 'Your largest category'} accounted for ${formatMoney(largestCategory.amount, reportCurrency)} of spending.`
                  : 'There is no spending in this period yet.'}
              </p>
            </div>
          ) : null}

          <ChartPanel
            title={reportMode === 'year' ? 'Income and expenses by month' : 'Income and expenses'}
            empty={comparisonData.every((row) => row.income === 0 && row.expense === 0)}
          >
            <ChartLegend />
            <div className="mt-3" aria-hidden="true">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={comparisonData}>
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis {...yAxis} />
                  <Tooltip content={<ChartTooltip currency={reportCurrency} />} {...CHART_TOOLTIP_PROPS} />
                  <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataDisclosure label="View income and expense data">
              <ComparisonDataTable rows={comparisonData} currency={reportCurrency} />
            </DataDisclosure>
          </ChartPanel>
        </section>
      ) : null}

      {section === 'spending' ? (
        <section className="grid gap-4 lg:grid-cols-2" aria-labelledby="report-spending-heading">
          <h2 id="report-spending-heading" className="sr-only">Spending report</h2>
          <ChartPanel title="Spending by category" empty={categoryData.length === 0}>
            <div className="divide-y divide-subtle">
              {categoryData.map((item, index) => {
                const category = categoryById.get(item.categoryId);
                const share = totals.expense > 0 ? (item.amount / totals.expense) * 100 : 0;
                return (
                  <div key={item.categoryId} className="flex items-center gap-3 py-3">
                    <CategoryIcon icon={category?.icon} color={category?.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-primary">{category?.name ?? item.categoryId}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-primary">{formatMoney(item.amount, reportCurrency)}</p>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-muted">{Math.round(share)}% of spending · #{index + 1}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartPanel>

          <ChartPanel title="Spending over time" empty={spendingOverTime.length === 0}>
            <p className="mb-3 text-xs font-medium text-muted">
              {spendingOverTime.length} day{spendingOverTime.length === 1 ? '' : 's'} with spending · {formatMoney(spendingOverTime.reduce((sum, row) => sum + row.amount, 0), reportCurrency)} total
            </p>
            <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={spendingOverTime}>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis {...yAxis} />
                  <Tooltip content={<ChartTooltip currency={reportCurrency} />} {...CHART_TOOLTIP_PROPS} />
                  <Line type="monotone" dataKey="amount" name="Spent" stroke="var(--chart-1)" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <DataDisclosure label="View spending data">
              <SpendingDataTable rows={spendingOverTime} currency={reportCurrency} />
            </DataDisclosure>
          </ChartPanel>
        </section>
      ) : null}

      {section === 'budgets' ? (
        <section className="space-y-4" aria-labelledby="report-budgets-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="report-budgets-heading" className="text-lg font-semibold text-primary">Budget performance</h2>
              <p className="mt-1 text-sm font-medium text-muted">Budgets are tracked in their own currency rather than converted.</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push('/app/budgets')}>Manage budgets</Button>
          </div>

          {reportMode !== 'month' ? (
            <EmptyState title="Budget performance is monthly." description="Switch the report period to Month to review a budget." />
          ) : budgetPerformance.available <= 0 && budgetPerformance.categoryBudgets.length === 0 ? (
            <EmptyState title={`No ${reportCurrency} budget for ${month}.`} description="Create a monthly total or category limit on Budgets." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-subtle bg-surface p-5">
                <ProgressBar
                  percent={budgetPercent}
                  usedLabel={budgetPerformance.available > 0 ? `${Math.round(budgetPercent)}% used` : undefined}
                  remainingLabel={budgetPerformance.available > 0 ? `${formatMoney(Math.max(budgetPerformance.remaining, 0), reportCurrency)} remaining` : 'No monthly total set'}
                  ariaLabel="Monthly budget used"
                  ariaValueText={budgetPerformance.available > 0 ? `${Math.round(budgetPercent)}% used` : 'No monthly total set'}
                />
                <div className="mt-4 grid gap-2">
                  <StatRow label="Available" value={formatMoney(budgetPerformance.available, reportCurrency)} />
                  <StatRow label="Spent" value={formatMoney(budgetPerformance.totalSpent, reportCurrency)} />
                  <StatRow label="Remaining" value={formatMoney(budgetPerformance.remaining, reportCurrency)} tone={budgetPerformance.remaining >= 0 ? 'good' : 'bad'} />
                  {budgetPerformance.rollover > 0 ? <StatRow label="Rollover" value={formatMoney(budgetPerformance.rollover, reportCurrency)} /> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-subtle bg-surface p-5">
                <h3 className="text-base font-semibold text-primary">Category limits</h3>
                {budgetPerformance.categoryBudgets.length === 0 ? (
                  <EmptyState title="No category limits." description="Add only the categories you want to keep an eye on." compact className="mt-3" />
                ) : (
                  <div className="mt-3 divide-y divide-subtle">
                    {budgetPerformance.categoryBudgets.map((item) => {
                      const category = categoryById.get(item.categoryId);
                      return (
                        <div key={item.categoryId} className="flex items-center gap-3 py-3">
                          <CategoryIcon icon={category?.icon} color={category?.color} />
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="truncate font-semibold text-primary">{category?.name ?? item.categoryId}</span>
                              <span className="shrink-0 font-semibold tabular-nums text-primary">{formatMoney(item.spent, item.currency)} / {formatMoney(item.budget, item.currency)}</span>
                            </div>
                            <p className={cn('mt-0.5 text-xs font-medium', item.remaining >= 0 ? 'text-muted' : 'text-danger')}>
                              {item.remaining >= 0 ? `${formatMoney(item.remaining, item.currency)} left` : `${formatMoney(Math.abs(item.remaining), item.currency)} over`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ChartPanel({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5">
      <h3 className="text-base font-semibold text-primary">{title}</h3>
      {empty ? <EmptyState title="Nothing to show yet." description="Transactions in this period will appear here." compact className="mt-4" /> : <div className="mt-4">{children}</div>}
    </div>
  );
}

function formatCompactAxisMoney(amount: number, currency: Currency) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M ${currency}`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k ${currency}`;
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

function ChartTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string | number; currency: Currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-subtle bg-surface px-3 py-2 text-sm shadow-[var(--shadow-overlay)]">
      {label ? <p className="mb-1.5 font-medium text-muted">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="font-medium text-secondary">{entry.name ?? 'Amount'}</span>
            <span className="font-semibold tabular-nums text-primary">{formatMoney(Number(entry.value), currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs font-medium text-secondary" aria-label="Chart legend">
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} aria-hidden="true" />Income</span>
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-3)' }} aria-hidden="true" />Expenses</span>
    </div>
  );
}

function DataDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group mt-4 rounded-lg border border-subtle bg-surface-muted">
      <summary className={cn('flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden', focusVisibleRing)}>
        <span>{label}</span><span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="overflow-x-auto border-t border-subtle p-3">{children}</div>
    </details>
  );
}

function SpendingDataTable({ rows, currency }: { rows: SpendingRow[]; currency: Currency }) {
  return (
    <table className="w-full min-w-64 text-left text-sm">
      <caption className="sr-only">Spending by date</caption>
      <thead><tr className="text-xs text-muted"><th scope="col" className="pb-2 pr-4 font-semibold">Date</th><th scope="col" className="pb-2 text-right font-semibold">Spent</th></tr></thead>
      <tbody className="divide-y divide-subtle">
        {rows.map((row) => <tr key={row.date}><th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.date}</th><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatMoney(row.amount, currency)}</td></tr>)}
      </tbody>
    </table>
  );
}

function ComparisonDataTable({ rows, currency }: { rows: ComparisonRow[]; currency: Currency }) {
  return (
    <table className="w-full min-w-80 text-left text-sm">
      <caption className="sr-only">Income and expenses by period</caption>
      <thead><tr className="text-xs text-muted"><th scope="col" className="pb-2 pr-4 font-semibold">Period</th><th scope="col" className="pb-2 text-right font-semibold">Income</th><th scope="col" className="pb-2 text-right font-semibold">Expenses</th></tr></thead>
      <tbody className="divide-y divide-subtle">
        {rows.map((row) => <tr key={row.label}><th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.label}</th><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatMoney(row.income, currency)}</td><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatMoney(row.expense, currency)}</td></tr>)}
      </tbody>
    </table>
  );
}
