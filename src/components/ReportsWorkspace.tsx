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
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth, getPreviousMonth } from '@/dates';
import { exportPDF, type ReportExportOptions } from '@/exports/exportService';
import { clampPercent, formatMoney } from '@/format';
import {
  getTransactionAmountInCurrency,
  loadHistoricalReportRates,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
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
import { cn, focusVisibleRing } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import type { Currency, Transaction } from '@/types';

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

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

type ComparisonRow = {
  label: string;
  income: number;
  expense: number;
};

type SpendingRow = {
  date: string;
  amount: number;
};

function getReportTransactionAmount(
  transaction: Transaction,
  convertAll: boolean,
  reportCurrency: Currency,
  historicalRates: HistoricalReportRateMap
): number | null {
  if (!convertAll) {
    return transaction.currency === reportCurrency ? transaction.amount : null;
  }
  return getTransactionAmountInCurrency(transaction, historicalRates, reportCurrency);
}

function calculateReportTotals(
  transactions: Transaction[],
  convertAll: boolean,
  reportCurrency: Currency,
  historicalRates: HistoricalReportRateMap
) {
  if (!convertAll) return calculateIncomeVsExpense(transactions, reportCurrency);

  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    const amount = getTransactionAmountInCurrency(transaction, historicalRates, reportCurrency);
    if (amount === null) continue;
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
  const [convertAll, setConvertAll] = useState(false);
  const [historicalRates, setHistoricalRates] = useState<HistoricalReportRateMap>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const monthlyBudget = useLiveQuery(
    async () => (await db.monthlyBudgets.where('month').equals(month).first()) ?? null,
    [month]
  );
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('month').equals(month).toArray(),
    [month]
  );
  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    settings === undefined ||
    categoryBudgets === undefined ||
    monthlyBudget === undefined;
  const reportCurrency = settings?.defaultCurrency ?? 'TRY';

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
    () =>
      (transactions ?? []).filter((transaction) =>
        transaction.date.startsWith(getPreviousMonth(month))
      ),
    [month, transactions]
  );

  const rateTransactions = useMemo(
    () =>
      reportMode === 'month'
        ? [...activeTransactions, ...previousMonthTransactions]
        : activeTransactions,
    [activeTransactions, previousMonthTransactions, reportMode]
  );

  useEffect(() => {
    if (!convertAll) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setRatesLoading(true);
      setRateError('');
      setHistoricalRates({});
    });

    void loadHistoricalReportRates(rateTransactions, controller.signal, reportCurrency)
      .then((loadedRates) => {
        if (!controller.signal.aborted) setHistoricalRates(loadedRates);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistoricalRates({});
        setConvertAll(false);
        setRateError(
          error instanceof Error
            ? error.message
            : 'Exchange rates are temporarily unavailable.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRatesLoading(false);
      });

    return () => controller.abort();
  }, [convertAll, rateTransactions, reportCurrency]);

  const incomeVsExpense = useMemo(
    () => calculateReportTotals(activeTransactions, convertAll, reportCurrency, historicalRates),
    [activeTransactions, convertAll, historicalRates, reportCurrency]
  );

  const previousIncomeVsExpense = useMemo(
    () =>
      calculateReportTotals(
        previousMonthTransactions,
        convertAll,
        reportCurrency,
        historicalRates
      ),
    [convertAll, historicalRates, previousMonthTransactions, reportCurrency]
  );

  const categoryData = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      const amount = getReportTransactionAmount(
        transaction,
        convertAll,
        reportCurrency,
        historicalRates
      );
      if (amount === null) continue;
      spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + amount);
    }

    return [...spending.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        name: categoryById.get(categoryId)?.name ?? categoryId,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeTransactions, categoryById, convertAll, historicalRates, reportCurrency]);

  const spendingOverTime = useMemo<SpendingRow[]>(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      const amount = getReportTransactionAmount(
        transaction,
        convertAll,
        reportCurrency,
        historicalRates
      );
      if (amount === null) continue;
      spending.set(transaction.date, (spending.get(transaction.date) ?? 0) + amount);
    }

    return [...spending.entries()]
      .map(([date, amount]) => ({
        date: reportMode === 'year' ? date.slice(5) : date,
        amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeTransactions, convertAll, historicalRates, reportCurrency, reportMode]);

  const comparisonData = useMemo<ComparisonRow[]>(() => {
    if (reportMode === 'month') {
      return [
        {
          label: getPreviousMonth(month),
          income: previousIncomeVsExpense.income,
          expense: previousIncomeVsExpense.expense,
        },
        { label: month, income: incomeVsExpense.income, expense: incomeVsExpense.expense },
      ];
    }

    if (reportMode === 'year') {
      return Array.from({ length: 12 }, (_, index) => {
        const itemMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
        const totals = calculateReportTotals(
          (transactions ?? []).filter((transaction) => transaction.date.startsWith(itemMonth)),
          convertAll,
          reportCurrency,
          historicalRates
        );
        return { label: itemMonth.slice(5), income: totals.income, expense: totals.expense };
      });
    }

    return [{ label: 'Range', income: incomeVsExpense.income, expense: incomeVsExpense.expense }];
  }, [
    convertAll,
    historicalRates,
    incomeVsExpense,
    month,
    previousIncomeVsExpense,
    reportCurrency,
    reportMode,
    transactions,
    year,
  ]);

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

  const historicalRateCount = Object.keys(historicalRates).length;
  const priorAvailableRateCount = Object.values(historicalRates).filter(
    (rate) => rate.status === 'prior-available'
  ).length;
  const rateLabel =
    convertAll && !ratesLoading
      ? historicalRateCount === 0
        ? `No other currencies need conversion into ${reportCurrency} for this report.`
        : `${historicalRateCount} transaction-date rate${historicalRateCount === 1 ? '' : 's'} used${
            priorAvailableRateCount > 0
              ? `; ${priorAvailableRateCount} used the nearest earlier available date`
              : ''
          }.`
      : '';

  const largestCategory = categoryData[0];
  const reportSummary = buildReportSummary({
    net: incomeVsExpense.net,
    expense: incomeVsExpense.expense,
    currency: reportCurrency,
    largestCategory,
  });

  const handleExportPDF = async () => {
    setExporting(true);
    setExportError('');

    const fxExportOptions = convertAll
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
        ? { mode: 'month', month, ...fxExportOptions }
        : reportMode === 'year'
          ? { mode: 'year', year, ...fxExportOptions }
          : { mode: 'range', startDate: rangeStart, endDate: rangeEnd, ...fxExportOptions };

    try {
      const blob = await exportPDF(options);
      downloadBlob(`taptrack-${reportMode}-report.pdf`, blob);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'The PDF could not be created. Try again.');
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
        description={`Income, spending, and budgets · ${reportCurrency}`}
        action={
          <div className="flex flex-wrap items-center gap-2" aria-label="Report period">
            <ModeButton mode="month" activeMode={reportMode} onClick={setReportMode} />
            <ModeButton mode="range" activeMode={reportMode} onClick={setReportMode} />
            <ModeButton mode="year" activeMode={reportMode} onClick={setReportMode} />
          </div>
        }
      />

      <div className="flex flex-col gap-5">
        <section className="order-1 grid gap-4 md:order-2 md:grid-cols-3">
          <StatCard
            label="Income"
            value={ratesLoading ? '…' : formatMoney(incomeVsExpense.income, reportCurrency)}
            tone="good"
          />
          <StatCard
            label="Expenses"
            value={ratesLoading ? '…' : formatMoney(incomeVsExpense.expense, reportCurrency)}
            tone="bad"
          />
          <StatCard
            label="Net"
            value={ratesLoading ? '…' : formatMoney(incomeVsExpense.net, reportCurrency)}
            tone={incomeVsExpense.net >= 0 ? 'good' : 'bad'}
          />
        </section>

        {!ratesLoading && activeTransactions.length > 0 ? (
          <p className="order-1 rounded-xl bg-surface-muted px-4 py-3 text-sm font-medium text-secondary md:order-2">
            {reportSummary}
          </p>
        ) : null}

        <section className="order-2 rounded-2xl border border-subtle bg-surface p-5 md:order-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              {reportMode === 'month' ? (
                <Field
                  label="Month"
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                />
              ) : null}
              {reportMode === 'range' ? (
                <>
                  <Field
                    label="Start"
                    type="date"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value)}
                  />
                  <Field
                    label="End"
                    type="date"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value)}
                  />
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
              onClick={() => void handleExportPDF()}
              loading={exporting}
              disabled={exporting}
            >
              Export PDF
            </Button>
          </div>

          <ToggleRow
            className="mt-4"
            label={`Include all currencies in ${reportCurrency}`}
            description={
              ratesLoading
                ? 'Loading exchange rates…'
                : convertAll && rateLabel
                  ? rateLabel
                  : undefined
            }
            checked={convertAll}
            onChange={() => {
              if (convertAll) {
                setConvertAll(false);
                setHistoricalRates({});
                setRateError('');
                setRatesLoading(false);
                return;
              }
              setHistoricalRates({});
              setRateError('');
              setRatesLoading(true);
              setConvertAll(true);
            }}
            disabled={ratesLoading}
          />

          <p className="mt-3 text-sm font-medium text-muted" role="status">
            {convertAll
              ? ratesLoading
                ? `Loading exchange rates into ${reportCurrency}…`
                : `Transactions in other currencies are converted using the rate for each transaction date. If no rate was published that day, the nearest earlier available date is used.`
              : `Showing ${reportCurrency} transactions only. Turn on conversion to include other currencies.`}
          </p>

          {rateError ? (
            <p className="mt-3 text-sm font-medium text-danger" role="alert">
              {rateError} This report is showing {reportCurrency} transactions only.
            </p>
          ) : null}
          {exportError ? <p className="mt-3 text-sm font-medium text-danger" role="alert">{exportError}</p> : null}
        </section>

        <section className="order-3 grid gap-4 lg:grid-cols-2">
          <ChartPanel title="Spending by category" empty={categoryData.length === 0}>
            <CategorySpendingList items={categoryData} currency={reportCurrency} />
          </ChartPanel>

          <ChartPanel title="Spending over time" empty={spendingOverTime.length === 0}>
            <p className="mb-3 text-xs font-medium text-muted">
              {spendingOverTime.length} day{spendingOverTime.length === 1 ? '' : 's'} with spending · {formatMoney(spendingOverTime.reduce((sum, row) => sum + row.amount, 0), reportCurrency)} total
            </p>
            <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={spendingOverTime}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis {...yAxis} />
                  <Tooltip
                    content={<ChartTooltip currency={reportCurrency} />}
                    {...CHART_TOOLTIP_PROPS}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="Spent"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <DataDisclosure label="View spending data">
              <SpendingDataTable rows={spendingOverTime} currency={reportCurrency} />
            </DataDisclosure>
          </ChartPanel>

          <ChartPanel
            title={reportMode === 'year' ? 'Monthly income vs expense' : 'Income vs expense'}
            empty={comparisonData.every((item) => item.income === 0 && item.expense === 0)}
          >
            <ChartLegend />
            <div className="mt-3" aria-hidden="true">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={comparisonData}>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...yAxis} />
                  <Tooltip
                    content={<ChartTooltip currency={reportCurrency} />}
                    {...CHART_TOOLTIP_PROPS}
                  />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    name="Expenses"
                    fill="var(--chart-3)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataDisclosure label="View income and expense data">
              <ComparisonDataTable rows={comparisonData} currency={reportCurrency} />
            </DataDisclosure>
          </ChartPanel>

          <div className="rounded-2xl border border-subtle bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-primary">Budget performance</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => router.push('/app/budgets')}
              >
                Manage budgets
              </Button>
            </div>
            {reportMode !== 'month' ? (
              <EmptyState
                title="Budget view is monthly."
                description="Switch to Month to review the budget for that period."
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
                      ? `${formatMoney(
                          Math.max(budgetPerformance.remaining, 0),
                          budgetPerformance.currency
                        )} remaining`
                      : 'Set a monthly total on Budgets'
                  }
                  ariaLabel="Monthly budget used"
                  ariaValueText={
                    budgetPerformance.available > 0
                      ? `${Math.round(budgetPercent)}% used, ${formatMoney(Math.max(budgetPerformance.remaining, 0), budgetPerformance.currency)} remaining`
                      : 'No monthly budget set'
                  }
                />
                <div className="mt-4 grid gap-2">
                  <StatRow
                    label="Available"
                    value={formatMoney(budgetPerformance.available, budgetPerformance.currency)}
                  />
                  <StatRow
                    label="Spent"
                    value={formatMoney(budgetPerformance.totalSpent, budgetPerformance.currency)}
                  />
                  <StatRow
                    label="Remaining"
                    value={formatMoney(budgetPerformance.remaining, budgetPerformance.currency)}
                    tone={budgetPerformance.remaining >= 0 ? 'good' : 'bad'}
                  />
                </div>
                <div className="mt-4 divide-y divide-subtle">
                  {budgetPerformance.categoryBudgets.length === 0 ? (
                    <EmptyState
                      title="No category budgets yet."
                      description="Set category limits on Budgets."
                      compact
                    />
                  ) : (
                    budgetPerformance.categoryBudgets.map((item) => (
                      <div
                        key={item.categoryId}
                        className="flex items-center justify-between py-3 text-sm"
                      >
                        <span className="font-medium text-secondary">
                          {categoryById.get(item.categoryId)?.name ?? item.categoryId}
                        </span>
                        <span className="font-semibold text-primary">
                          {formatMoney(item.spent, item.currency)} /{' '}
                          {formatMoney(item.budget, item.currency)}
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

function buildReportSummary({
  net,
  expense,
  currency,
  largestCategory,
}: {
  net: number;
  expense: number;
  currency: Currency;
  largestCategory?: { name: string; amount: number };
}) {
  const parts = [
    net >= 0
      ? `Net was ${formatMoney(net, currency)} above zero.`
      : `Net was ${formatMoney(Math.abs(net), currency)} below zero.`,
    `Total spending was ${formatMoney(expense, currency)}.`,
  ];
  if (largestCategory) {
    parts.push(`${largestCategory.name} was the largest spending category at ${formatMoney(largestCategory.amount, currency)}.`);
  }
  return parts.join(' ');
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
      aria-pressed={active}
      onClick={() => onClick(mode)}
    >
      {label}
    </Button>
  );
}

function formatCompactAxisMoney(amount: number, currency: Currency) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}M ${currency}`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}k ${currency}`;
  }
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
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
  currency,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  currency: Currency;
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
            <span
              className="flex items-center gap-2 font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {entry.color ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: entry.color }}
                  aria-hidden
                />
              ) : null}
              {formatTooltipSeriesName(entry.name)}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatMoney(Number(entry.value), currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs font-medium text-secondary" aria-label="Chart legend">
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} aria-hidden="true" />
        Income
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-3)' }} aria-hidden="true" />
        Expenses
      </span>
    </div>
  );
}

function DataDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group mt-4 rounded-lg border border-subtle bg-surface-muted">
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden',
          focusVisibleRing
        )}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="overflow-x-auto border-t border-subtle p-3">{children}</div>
    </details>
  );
}

function SpendingDataTable({ rows, currency }: { rows: SpendingRow[]; currency: Currency }) {
  return (
    <table className="w-full min-w-64 text-left text-sm">
      <caption className="sr-only">Spending by date</caption>
      <thead>
        <tr className="text-xs text-muted">
          <th scope="col" className="pb-2 pr-4 font-semibold">Date</th>
          <th scope="col" className="pb-2 text-right font-semibold">Spent</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-subtle">
        {rows.map((row) => (
          <tr key={row.date}>
            <th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.date}</th>
            <td className="py-2 text-right font-semibold tabular-nums text-primary">{formatMoney(row.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ComparisonDataTable({ rows, currency }: { rows: ComparisonRow[]; currency: Currency }) {
  return (
    <table className="w-full min-w-80 text-left text-sm">
      <caption className="sr-only">Income and expenses by period</caption>
      <thead>
        <tr className="text-xs text-muted">
          <th scope="col" className="pb-2 pr-4 font-semibold">Period</th>
          <th scope="col" className="pb-2 pr-4 text-right font-semibold">Income</th>
          <th scope="col" className="pb-2 text-right font-semibold">Expenses</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-subtle">
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.label}</th>
            <td className="py-2 pr-4 text-right font-semibold tabular-nums text-success">{formatMoney(row.income, currency)}</td>
            <td className="py-2 text-right font-semibold tabular-nums text-danger">{formatMoney(row.expense, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CategorySpendingList({
  items,
  currency,
}: {
  items: Array<{ categoryId: string; name: string; amount: number }>;
  currency: Currency;
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
              <span className="min-w-0 truncate text-sm font-semibold text-primary">
                {item.name}
              </span>
              <div className="flex shrink-0 items-baseline gap-2 text-sm tabular-nums">
                <span className="font-semibold text-primary">
                  {formatMoney(item.amount, currency)}
                </span>
                <span className="font-medium text-muted">{Math.round(percent)}%</span>
              </div>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
              role="progressbar"
              aria-label={`${item.name} share of spending`}
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${Math.round(percent)}% of spending`}
            >
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
    <div className="rounded-2xl border border-subtle bg-surface p-5">
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      {empty ? (
        <EmptyState
          title="No report data yet."
          description="Add a transaction for this period."
          className="mt-4"
        />
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </div>
  );
}
