'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { CategoryIcon } from '@/categories/categoryVisuals';
import ReportsLoadingFrame from '@/components/ReportsLoadingFrame';
import { AdaptiveSheet } from '@/components/ui/AdaptiveSheet';
import { Button, buttonVariants } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatRow } from '@/components/ui/StatRow';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { formatCurrency } from '@/currencies/currencyCatalog';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth, getPreviousMonth } from '@/dates';
import { exportPDF, type ReportExportOptions } from '@/exports/exportService';
import { clampPercent } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import {
  getTransactionAmountInCurrency,
  loadHistoricalReportRates,
  type HistoricalReportRateMap,
} from '@/reports/historicalReportRates';
import { calculateIncomeVsExpense } from '@/reports/reportService';
import { getBudgetPerformance } from '@/reports/reportTransforms';
import type { Category, Currency, Transaction } from '@/types';

type ReportMode = 'month' | 'range' | 'year';
type ReportSection = 'overview' | 'spending' | 'budgets';
type ComparisonRow = { label: string; income: number; expense: number };
type SpendingRow = { date: string; label: string; amount: number };
type CashFlowRow = { date: string; label: string; amount: number };

const REPORT_TABS: Array<{ id: ReportSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'spending', label: 'Spending' },
  { id: 'budgets', label: 'Budgets' },
];

const TOOLTIP_PROPS = {
  contentStyle: { background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 },
  wrapperStyle: { outline: 'none', zIndex: 20 },
  cursor: { fill: 'var(--surface-muted)', opacity: 0.45 },
} as const;

function convertedAmount(
  transaction: Transaction,
  reportCurrency: Currency,
  rates: HistoricalReportRateMap,
  conversionAvailable: boolean
): number | null {
  if (transaction.currency === reportCurrency) return transaction.amount;
  if (!conversionAvailable) return null;
  return getTransactionAmountInCurrency(transaction, rates, reportCurrency);
}

function totalsFor(
  transactions: Transaction[],
  reportCurrency: Currency,
  rates: HistoricalReportRateMap,
  conversionAvailable: boolean
) {
  if (!conversionAvailable) return calculateIncomeVsExpense(transactions, reportCurrency);
  return transactions.reduce(
    (totals, transaction) => {
      const amount = convertedAmount(transaction, reportCurrency, rates, true);
      if (amount === null) return totals;
      return transaction.type === 'income'
        ? { ...totals, income: totals.income + amount, net: totals.net + amount }
        : { ...totals, expense: totals.expense + amount, net: totals.net - amount };
    },
    { income: 0, expense: 0, net: 0 }
  );
}

export default function ReportsWorkspace() {
  const currentMonth = getCurrentMonth();
  const { currencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
  const [section, setSection] = useState<ReportSection>('overview');
  const [mode, setMode] = useState<ReportMode>('month');
  const [month, setMonth] = useState(currentMonth);
  const [rangeStart, setRangeStart] = useState(`${currentMonth}-01`);
  const [rangeEnd, setRangeEnd] = useState(() => formatLocalDate(new Date()));
  const [year, setYear] = useState(currentMonth.slice(0, 4));
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const [rates, setRates] = useState<HistoricalReportRateMap>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  const [draftMode, setDraftMode] = useState<ReportMode>('month');
  const [draftMonth, setDraftMonth] = useState(currentMonth);
  const [draftRangeStart, setDraftRangeStart] = useState(`${currentMonth}-01`);
  const [draftRangeEnd, setDraftRangeEnd] = useState(() => formatLocalDate(new Date()));
  const [draftYear, setDraftYear] = useState(currentMonth.slice(0, 4));
  const [draftCurrency, setDraftCurrency] = useState<Currency>('TRY');

  const reportCurrency =
    currencyChoice && currencies.includes(currencyChoice) ? currencyChoice : defaultCurrency;
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

  const activeTransactions = useMemo(() => {
    const rows = transactions ?? [];
    if (mode === 'month') return rows.filter((transaction) => transaction.date.startsWith(month));
    if (mode === 'year') return rows.filter((transaction) => transaction.date.startsWith(year));
    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return rows.filter((transaction) => transaction.date >= start && transaction.date <= end);
  }, [mode, month, rangeEnd, rangeStart, transactions, year]);

  const previousTransactions = useMemo(
    () =>
      mode === 'month'
        ? (transactions ?? []).filter((transaction) => transaction.date.startsWith(getPreviousMonth(month)))
        : [],
    [mode, month, transactions]
  );
  const rateTransactions = useMemo(
    () => [...activeTransactions, ...previousTransactions],
    [activeTransactions, previousTransactions]
  );
  const needsConversion = rateTransactions.some(
    (transaction) => transaction.currency !== reportCurrency
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!needsConversion) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setRates({});
        setRateError('');
        setRatesLoading(false);
      });
      return () => controller.abort();
    }

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setRatesLoading(true);
      setRateError('');
      setRates({});
    });
    void loadHistoricalReportRates(rateTransactions, controller.signal, reportCurrency)
      .then((loadedRates) => {
        if (!controller.signal.aborted) setRates(loadedRates);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRates({});
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
    () => totalsFor(activeTransactions, reportCurrency, rates, conversionAvailable),
    [activeTransactions, conversionAvailable, rates, reportCurrency]
  );
  const previousTotals = useMemo(
    () => totalsFor(previousTransactions, reportCurrency, rates, conversionAvailable),
    [conversionAvailable, previousTransactions, rates, reportCurrency]
  );

  const categoryData = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      const amount = convertedAmount(transaction, reportCurrency, rates, conversionAvailable);
      if (amount === null) continue;
      spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + amount);
    }
    return [...spending.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeTransactions, conversionAvailable, rates, reportCurrency]);

  const spendingOverTime = useMemo<SpendingRow[]>(() => {
    const spending = new Map<string, number>();
    for (const transaction of activeTransactions) {
      if (transaction.type !== 'expense') continue;
      const amount = convertedAmount(transaction, reportCurrency, rates, conversionAvailable);
      if (amount === null) continue;
      spending.set(transaction.date, (spending.get(transaction.date) ?? 0) + amount);
    }
    return [...spending.entries()]
      .map(([date, amount]) => ({ date, label: date.slice(5), amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activeTransactions, conversionAvailable, rates, reportCurrency]);

  const cashFlowData = useMemo<CashFlowRow[]>(() => {
    const daily = new Map<string, number>();
    for (const transaction of activeTransactions) {
      const amount = convertedAmount(transaction, reportCurrency, rates, conversionAvailable);
      if (amount === null) continue;
      const signed = transaction.type === 'income' ? amount : -amount;
      daily.set(transaction.date, (daily.get(transaction.date) ?? 0) + signed);
    }
    const dates = [...daily.keys()].sort((a, b) => a.localeCompare(b));
    return dates.map((date, index) => ({
      date,
      label: date.slice(5),
      amount: dates
        .slice(0, index + 1)
        .reduce((sum, itemDate) => sum + (daily.get(itemDate) ?? 0), 0),
    }));
  }, [activeTransactions, conversionAvailable, rates, reportCurrency]);

  const yearComparisonData = useMemo<ComparisonRow[]>(() => {
    if (mode !== 'year') return [];
    return Array.from({ length: 12 }, (_, index) => {
      const itemMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
      const itemTotals = totalsFor(
        (transactions ?? []).filter((transaction) => transaction.date.startsWith(itemMonth)),
        reportCurrency,
        rates,
        conversionAvailable
      );
      return { label: itemMonth.slice(5), income: itemTotals.income, expense: itemTotals.expense };
    });
  }, [conversionAvailable, mode, rates, reportCurrency, transactions, year]);

  const budgetPerformance = getBudgetPerformance(
    month,
    monthlyBudget ?? null,
    categoryBudgets ?? [],
    transactions ?? [],
    reportCurrency
  );
  const budgetPercent = budgetPerformance.available > 0
    ? clampPercent((budgetPerformance.totalSpent / budgetPerformance.available) * 100)
    : 0;

  const periodLabel = getPeriodLabel(mode, month, rangeStart, rangeEnd, year);
  const netDelta = mode === 'month' ? totals.net - previousTotals.net : 0;
  const expenseDelta = mode === 'month' ? totals.expense - previousTotals.expense : 0;
  const largestCategory = categoryData[0];
  const visibleCategories = showAllCategories ? categoryData : categoryData.slice(0, 5);
  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    monthlyBudget === undefined ||
    categoryBudgets === undefined ||
    currenciesLoading;

  const openContextSheet = () => {
    setDraftMode(mode);
    setDraftMonth(month);
    setDraftRangeStart(rangeStart);
    setDraftRangeEnd(rangeEnd);
    setDraftYear(year);
    setDraftCurrency(reportCurrency);
    setContextOpen(true);
  };

  const applyContext = () => {
    setMode(draftMode);
    setMonth(draftMonth);
    setYear(draftYear);
    const [start, end] =
      draftRangeStart <= draftRangeEnd
        ? [draftRangeStart, draftRangeEnd]
        : [draftRangeEnd, draftRangeStart];
    setRangeStart(start);
    setRangeEnd(end);
    setCurrencyChoice(draftCurrency);
    setContextOpen(false);
  };

  const contextValid =
    draftMode === 'month'
      ? /^\d{4}-\d{2}$/.test(draftMonth)
      : draftMode === 'year'
        ? /^\d{4}$/.test(draftYear)
        : Boolean(draftRangeStart && draftRangeEnd);

  const handleExportPDF = async () => {
    setExporting(true);
    setExportError('');
    const fx = conversionAvailable
      ? { convertToReportCurrency: true as const, reportCurrency, historicalRates: rates }
      : { convertToReportCurrency: false as const, reportCurrency };
    const options: ReportExportOptions = mode === 'month'
      ? { mode: 'month', month, ...fx }
      : mode === 'year'
        ? { mode: 'year', year, ...fx }
        : { mode: 'range', startDate: rangeStart, endDate: rangeEnd, ...fx };
    try {
      const blob = await exportPDF(options);
      downloadBlob(`ravel-${mode}-report.pdf`, blob);
      setActionsOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The PDF could not be created.');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <ReportsLoadingFrame />;

  const yAxis = {
    tick: { fill: 'var(--text-muted)', fontSize: 11 },
    tickLine: false,
    axisLine: false,
    width: 60,
    tickFormatter: (value: number) => compactMoney(Number(value), reportCurrency),
  } as const;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Analysis</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-primary sm:text-4xl">Reports</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="max-w-[11.5rem] rounded-xl px-3 sm:max-w-none"
            onClick={openContextSheet}
            aria-label={`Report period: ${periodLabel}. Change report period`}
          >
            <CalendarIcon />
            <span className="truncate">{periodLabel}</span>
            <span aria-hidden="true" className="text-muted">⌄</span>
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="rounded-xl"
            onClick={() => setActionsOpen(true)}
            aria-label="Report actions"
          >
            <MoreIcon />
          </Button>
        </div>
      </header>

      <div
        data-layout="reports-summary"
        className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.4fr)] lg:items-stretch lg:gap-6"
      >
        <section className="relative min-w-0 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-[0_20px_55px_rgba(30,64,175,0.2)] sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl" />
          <div className="relative flex h-full min-h-[14rem] flex-col">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/80">
              {mode === 'month' ? 'Net this month' : mode === 'year' ? `Net in ${year}` : 'Net for range'}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.045em] tabular-nums sm:text-5xl">
              {ratesLoading ? '…' : formatSignedCurrency(totals.net, reportCurrency)}
            </p>
            <p
              className={cn(
                'mt-2 text-sm font-semibold tabular-nums',
                mode !== 'month' || netDelta === 0
                  ? 'text-blue-100/70'
                  : netDelta > 0
                    ? 'text-emerald-300'
                    : 'text-rose-300'
              )}
            >
              {ratesLoading
                ? 'Updating converted totals…'
                : mode === 'month'
                  ? netDelta === 0
                    ? `No change vs ${formatMonthOnly(getPreviousMonth(month))}`
                    : `${netDelta > 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(netDelta), reportCurrency)} vs ${formatMonthOnly(getPreviousMonth(month))}`
                  : periodLabel}
            </p>

            <div className="mt-auto grid grid-cols-2 gap-5 border-t border-white/10 pt-5">
              <ReportHeroMetric label="Income" value={totals.income} currency={reportCurrency} loading={ratesLoading} tone="good" />
              <ReportHeroMetric label="Expenses" value={totals.expense} currency={reportCurrency} loading={ratesLoading} tone="neutral" />
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-[1.75rem] bg-surface p-4 shadow-[0_10px_34px_rgba(15,23,42,0.06)] ring-1 ring-subtle/70 dark:shadow-none sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Trend</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">
                {mode === 'year' ? 'Income and expenses by month' : 'Net movement over time'}
              </h2>
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted">{reportCurrency}</span>
          </div>

          {ratesLoading ? (
            <Skeleton className="mt-5 h-56 w-full rounded-2xl sm:h-64" />
          ) : mode === 'year' ? (
            yearComparisonData.every((row) => row.income === 0 && row.expense === 0) ? (
              <EmptyState title="Nothing to chart yet." description="Transactions in this year will appear here." compact className="mt-5" />
            ) : (
              <>
                <ChartLegend />
                <div className="mt-3 h-56 sm:h-64" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearComparisonData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis {...yAxis} />
                      <Tooltip content={<ChartTooltip currency={reportCurrency} />} {...TOOLTIP_PROPS} />
                      <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={[5, 5, 0, 0]} />
                      <Bar dataKey="expense" name="Expenses" fill="var(--chart-3)" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <DataDisclosure label="View income and expense data">
                  <ComparisonTable rows={yearComparisonData} currency={reportCurrency} />
                </DataDisclosure>
              </>
            )
          ) : cashFlowData.length === 0 ? (
            <EmptyState title="Nothing to chart yet." description="Transactions in this period will appear here." compact className="mt-5" />
          ) : (
            <>
              <div className="mt-4 h-56 sm:h-64" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="reportsNetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={18} />
                    <YAxis {...yAxis} />
                    <Tooltip content={<ChartTooltip currency={reportCurrency} />} {...TOOLTIP_PROPS} />
                    <Area type="monotone" dataKey="amount" name="Net" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#reportsNetFill)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <DataDisclosure label="View net movement data">
                <CashFlowTable rows={cashFlowData} currency={reportCurrency} />
              </DataDisclosure>
            </>
          )}
        </section>
      </div>

      {rateError ? (
        <div className="flex items-start gap-3 rounded-2xl bg-danger-muted px-4 py-3 text-sm font-medium text-danger" role="alert">
          <span aria-hidden="true">!</span>
          <span>{rateError}</span>
        </div>
      ) : null}

      <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-muted p-1" aria-label="Report sections" role="tablist">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            aria-controls={`reports-panel-${tab.id}`}
            onClick={() => setSection(tab.id)}
            className={cn(
              'min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors sm:px-4',
              section === tab.id ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-secondary',
              focusVisibleRing
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id={`reports-panel-${section}`}>
        {section === 'overview' ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)] lg:items-start">
            <ReportPanel>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Spending</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Top categories</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSection('spending')}>View spending</Button>
              </div>
              {categoryData.length === 0 ? (
                <EmptyState title="No spending yet." description="Expense categories will appear here." compact className="mt-4" />
              ) : (
                <CategorySpendList rows={categoryData.slice(0, 4)} total={totals.expense} categoryById={categoryById} currency={reportCurrency} />
              )}
            </ReportPanel>

            <ReportPanel>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">At a glance</p>
              <div className="mt-4 space-y-5">
                <InsightBlock
                  label="Largest category"
                  value={largestCategory ? categoryById.get(largestCategory.categoryId)?.name ?? 'Other' : 'No spending yet'}
                  detail={largestCategory ? formatCurrency(largestCategory.amount, reportCurrency) : undefined}
                />
                {mode === 'month' ? (
                  <InsightBlock
                    label="Expenses vs last month"
                    value={expenseDelta === 0 ? 'No change' : expenseDelta > 0 ? 'Higher' : 'Lower'}
                    detail={expenseDelta === 0 ? undefined : `${formatCurrency(Math.abs(expenseDelta), reportCurrency)} ${expenseDelta > 0 ? 'more' : 'less'}`}
                    tone={expenseDelta > 0 ? 'bad' : expenseDelta < 0 ? 'good' : 'neutral'}
                  />
                ) : (
                  <InsightBlock label="Transactions in period" value={String(activeTransactions.length)} />
                )}
              </div>
            </ReportPanel>
          </section>
        ) : null}

        {section === 'spending' ? (
          <section className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Spending</p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-2xl font-semibold tracking-tight text-primary">{ratesLoading ? '…' : formatCurrency(totals.expense, reportCurrency)} total</h2>
                <span className="text-sm font-medium text-muted">{activeTransactions.filter((transaction) => transaction.type === 'expense').length} expenses</span>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.35fr)] lg:items-start">
              <ReportPanel>
                <h3 className="text-base font-semibold text-primary">By category</h3>
                {categoryData.length === 0 ? (
                  <EmptyState title="Nothing to show yet." description="Expense categories in this period will appear here." compact className="mt-4" />
                ) : (
                  <>
                    <CategorySpendList rows={visibleCategories} total={totals.expense} categoryById={categoryById} currency={reportCurrency} />
                    {categoryData.length > 5 ? (
                      <Button variant="ghost" size="sm" fullWidth className="mt-3" onClick={() => setShowAllCategories((current) => !current)}>
                        {showAllCategories ? 'Show top 5' : `View all ${categoryData.length} categories`}
                      </Button>
                    ) : null}
                  </>
                )}
              </ReportPanel>

              <ReportPanel>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-primary">Spending over time</h3>
                    <p className="mt-1 text-xs font-medium text-muted">{spendingOverTime.length} day{spendingOverTime.length === 1 ? '' : 's'} with spending</p>
                  </div>
                  <span className="text-xs font-semibold text-muted">{reportCurrency}</span>
                </div>
                {spendingOverTime.length === 0 ? (
                  <EmptyState title="Nothing to chart yet." description="Expenses in this period will appear here." compact className="mt-4" />
                ) : (
                  <>
                    <div className="mt-4 h-64" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={spendingOverTime} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="reportsSpendingFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.26} />
                              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={18} />
                          <YAxis {...yAxis} />
                          <Tooltip content={<ChartTooltip currency={reportCurrency} />} {...TOOLTIP_PROPS} />
                          <Area type="monotone" dataKey="amount" name="Spent" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#reportsSpendingFill)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <DataDisclosure label="View spending data"><SpendingTable rows={spendingOverTime} currency={reportCurrency} /></DataDisclosure>
                  </>
                )}
              </ReportPanel>
            </div>
          </section>
        ) : null}

        {section === 'budgets' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Guardrails</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Budget performance</h2>
              </div>
              <Link href="/app/budgets" prefetch={false} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'rounded-xl')}>Manage budgets</Link>
            </div>

            {mode !== 'month' ? (
              <ReportPanel>
                <EmptyState
                  title="Budget performance is monthly."
                  description="Choose a month to review its total and category limits."
                  compact
                  action={<Button variant="secondary" size="sm" onClick={() => {
                    setDraftMode('month');
                    setDraftMonth(month);
                    setDraftCurrency(reportCurrency);
                    setContextOpen(true);
                  }}>Choose a month</Button>}
                />
              </ReportPanel>
            ) : budgetPerformance.available <= 0 && budgetPerformance.categoryBudgets.length === 0 ? (
              <ReportPanel><EmptyState title={`No ${reportCurrency} budget for ${formatMonthLabel(month)}.`} description="Create a monthly total or category limit on Budgets." compact /></ReportPanel>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:items-start">
                <ReportPanel>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted">Remaining</p>
                      <p className={cn('mt-1 text-3xl font-semibold tracking-tight tabular-nums', budgetPerformance.remaining >= 0 ? 'text-primary' : 'text-danger')}>{formatCurrency(budgetPerformance.remaining, reportCurrency)}</p>
                    </div>
                    <span className="text-sm font-semibold text-muted">{Math.round(budgetPercent)}% used</span>
                  </div>
                  <ProgressBar
                    className="mt-5"
                    percent={budgetPercent}
                    usedLabel={budgetPerformance.available > 0 ? `${Math.round(budgetPercent)}% used` : undefined}
                    remainingLabel={budgetPerformance.available > 0 ? `${formatCurrency(Math.max(budgetPerformance.remaining, 0), reportCurrency)} remaining` : 'No monthly total set'}
                    ariaLabel="Monthly budget used"
                    ariaValueText={budgetPerformance.available > 0 ? `${Math.round(budgetPercent)}% used` : 'No monthly total set'}
                  />
                  <div className="mt-5 grid gap-2 border-t border-subtle pt-4">
                    <StatRow label="Available" value={formatCurrency(budgetPerformance.available, reportCurrency)} />
                    <StatRow label="Spent" value={formatCurrency(budgetPerformance.totalSpent, reportCurrency)} />
                    {budgetPerformance.rollover > 0 ? <StatRow label="Rollover" value={formatCurrency(budgetPerformance.rollover, reportCurrency)} /> : null}
                  </div>
                </ReportPanel>

                <ReportPanel>
                  <h3 className="text-base font-semibold text-primary">Category limits</h3>
                  {budgetPerformance.categoryBudgets.length === 0 ? (
                    <EmptyState title="No category limits." description="Add only the categories you want to keep an eye on." compact className="mt-3" />
                  ) : (
                    <div className="mt-3 divide-y divide-subtle">
                      {budgetPerformance.categoryBudgets.map((item) => {
                        const category = categoryById.get(item.categoryId);
                        const percent = item.budget > 0 ? clampPercent((item.spent / item.budget) * 100) : 0;
                        return (
                          <div key={item.categoryId} className="flex items-start gap-3 py-3.5">
                            <CategoryIcon icon={category?.icon} color={category?.color} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate text-sm font-semibold text-primary">{category?.name ?? item.categoryId}</span>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{formatCurrency(item.spent, item.currency)} / {formatCurrency(item.budget, item.currency)}</span>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className={cn('h-full rounded-full', item.remaining >= 0 ? 'bg-accent' : 'bg-danger')} style={{ width: `${percent}%` }} /></div>
                              <p className={cn('mt-1.5 text-xs font-medium', item.remaining >= 0 ? 'text-muted' : 'text-danger')}>{item.remaining >= 0 ? `${formatCurrency(item.remaining, item.currency)} left` : `${formatCurrency(Math.abs(item.remaining), item.currency)} over`}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ReportPanel>
              </div>
            )}
          </section>
        ) : null}
      </div>

      <AdaptiveSheet
        open={contextOpen}
        title="Report period"
        description="Choose the time window and currency used for this report."
        onClose={() => setContextOpen(false)}
        size="sm"
        footer={<div className="grid grid-cols-2 gap-2"><Button variant="ghost" onClick={() => setContextOpen(false)}>Cancel</Button><Button onClick={applyContext} disabled={!contextValid}>Apply report</Button></div>}
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-secondary">Period</p>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-muted p-1">
              {(['month', 'year', 'range'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-sheet-autofocus={value === draftMode ? '' : undefined}
                  aria-pressed={draftMode === value}
                  onClick={() => setDraftMode(value)}
                  className={cn('min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors', draftMode === value ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-secondary', focusVisibleRing)}
                >
                  {value === 'month' ? 'Month' : value === 'year' ? 'Year' : 'Range'}
                </button>
              ))}
            </div>
          </div>
          {draftMode === 'month' ? <Field label="Month" type="month" value={draftMonth} onChange={(event) => setDraftMonth(event.target.value)} /> : null}
          {draftMode === 'year' ? <Field label="Year" type="number" min="2000" max="2100" value={draftYear} onChange={(event) => setDraftYear(event.target.value)} /> : null}
          {draftMode === 'range' ? <div className="grid gap-3 sm:grid-cols-2"><Field label="From" type="date" value={draftRangeStart} onChange={(event) => setDraftRangeStart(event.target.value)} /><Field label="To" type="date" value={draftRangeEnd} onChange={(event) => setDraftRangeEnd(event.target.value)} /></div> : null}
          <div>
            <p className="mb-2 text-sm font-semibold text-secondary">Report currency</p>
            <div className="flex flex-wrap gap-2">
              {currencies.map((currency) => (
                <button
                  key={currency}
                  type="button"
                  aria-pressed={draftCurrency === currency}
                  onClick={() => setDraftCurrency(currency)}
                  className={cn('min-h-11 rounded-xl px-4 text-sm font-semibold ring-1 transition-colors', draftCurrency === currency ? 'bg-accent text-white ring-accent' : 'bg-surface text-secondary ring-subtle hover:bg-surface-muted hover:text-primary', focusVisibleRing)}
                >
                  {currency}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AdaptiveSheet>

      <AdaptiveSheet open={actionsOpen} title="Report actions" onClose={() => setActionsOpen(false)} size="sm">
        <div className="space-y-3">
          <Button fullWidth onClick={() => void handleExportPDF()} loading={exporting} disabled={ratesLoading}><DownloadIcon />Export PDF</Button>
          <p className="text-sm font-medium text-muted">Exports the currently selected report period and currency.</p>
          {exportError ? <p className="rounded-xl bg-danger-muted px-3 py-2 text-sm font-medium text-danger" role="alert">{exportError}</p> : null}
        </div>
      </AdaptiveSheet>
    </div>
  );
}

function ReportPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[1.5rem] bg-surface p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:p-5', className)}>{children}</div>;
}

function CategorySpendList({ rows, total, categoryById, currency }: { rows: Array<{ categoryId: string; amount: number }>; total: number; categoryById: Map<string, Category>; currency: Currency }) {
  return (
    <div className="mt-3 divide-y divide-subtle">
      {rows.map((item, index) => {
        const category = categoryById.get(item.categoryId);
        const share = total > 0 ? clampPercent((item.amount / total) * 100) : 0;
        return (
          <div key={item.categoryId} className="flex items-start gap-3 py-3.5 first:pt-2 last:pb-1">
            <CategoryIcon icon={category?.icon} color={category?.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-primary">{category?.name ?? 'Other'}</p><p className="mt-0.5 text-xs font-medium text-muted">{Math.round(share)}% of spending · #{index + 1}</p></div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-primary">{formatCurrency(item.amount, currency)}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InsightBlock({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail?: string; tone?: 'neutral' | 'good' | 'bad' }) {
  return <div className="border-b border-subtle pb-5 last:border-b-0 last:pb-0"><p className="text-xs font-medium text-muted">{label}</p><div className="mt-1 flex flex-wrap items-baseline justify-between gap-2"><p className={cn('text-lg font-semibold tracking-tight', tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-primary')}>{value}</p>{detail ? <p className="text-sm font-semibold tabular-nums text-secondary">{detail}</p> : null}</div></div>;
}

function ReportHeroMetric({ label, value, currency, loading, tone }: { label: string; value: number; currency: Currency; loading: boolean; tone: 'neutral' | 'good' }) {
  return <div><p className="text-xs font-medium text-blue-100/60">{label}</p><p className={cn('mt-1 text-lg font-semibold tracking-tight tabular-nums', tone === 'good' ? 'text-emerald-300' : 'text-white')}>{loading ? '…' : formatCurrency(value, currency)}</p></div>;
}

function ChartTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string }>; label?: string | number; currency: Currency }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl bg-surface px-3 py-2 text-sm shadow-[var(--shadow-overlay)] ring-1 ring-subtle">{label ? <p className="mb-1.5 font-medium text-muted">{label}</p> : null}<div className="space-y-1">{payload.map((entry) => <div key={entry.name} className="flex items-center justify-between gap-4"><span className="font-medium text-secondary">{entry.name ?? 'Amount'}</span><span className="font-semibold tabular-nums text-primary">{formatCurrency(Number(entry.value), currency)}</span></div>)}</div></div>;
}

function ChartLegend() {
  return <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-secondary" aria-label="Chart legend"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} aria-hidden="true" />Income</span><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-3)' }} aria-hidden="true" />Expenses</span></div>;
}

function DataDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className="group mt-4 rounded-xl bg-surface-muted ring-1 ring-subtle/70"><summary className={cn('flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 py-2 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden', focusVisibleRing)}><span>{label}</span><span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span></summary><div className="overflow-x-auto border-t border-subtle p-3">{children}</div></details>;
}

function SpendingTable({ rows, currency }: { rows: SpendingRow[]; currency: Currency }) {
  return <table className="w-full min-w-64 text-left text-sm"><caption className="sr-only">Spending by date</caption><thead><tr className="text-xs text-muted"><th scope="col" className="pb-2 pr-4 font-semibold">Date</th><th scope="col" className="pb-2 text-right font-semibold">Spent</th></tr></thead><tbody className="divide-y divide-subtle">{rows.map((row) => <tr key={row.date}><th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.date}</th><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatCurrency(row.amount, currency)}</td></tr>)}</tbody></table>;
}

function CashFlowTable({ rows, currency }: { rows: CashFlowRow[]; currency: Currency }) {
  return <table className="w-full min-w-64 text-left text-sm"><caption className="sr-only">Cumulative net movement by date</caption><thead><tr className="text-xs text-muted"><th scope="col" className="pb-2 pr-4 font-semibold">Date</th><th scope="col" className="pb-2 text-right font-semibold">Net movement</th></tr></thead><tbody className="divide-y divide-subtle">{rows.map((row) => <tr key={row.date}><th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.date}</th><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatSignedCurrency(row.amount, currency)}</td></tr>)}</tbody></table>;
}

function ComparisonTable({ rows, currency }: { rows: ComparisonRow[]; currency: Currency }) {
  return <table className="w-full min-w-80 text-left text-sm"><caption className="sr-only">Income and expenses by period</caption><thead><tr className="text-xs text-muted"><th scope="col" className="pb-2 pr-4 font-semibold">Period</th><th scope="col" className="pb-2 text-right font-semibold">Income</th><th scope="col" className="pb-2 text-right font-semibold">Expenses</th></tr></thead><tbody className="divide-y divide-subtle">{rows.map((row) => <tr key={row.label}><th scope="row" className="py-2 pr-4 font-medium text-secondary">{row.label}</th><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatCurrency(row.income, currency)}</td><td className="py-2 text-right font-semibold tabular-nums text-primary">{formatCurrency(row.expense, currency)}</td></tr>)}</tbody></table>;
}

function CalendarIcon() {
  return <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MoreIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

function DownloadIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 18v2h14v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function getPeriodLabel(mode: ReportMode, month: string, start: string, end: string, year: string) {
  if (mode === 'month') return formatMonthLabel(month);
  if (mode === 'year') return year;
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatMonthOnly(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatSignedCurrency(amount: number, currency: Currency) {
  if (amount > 0) return `+${formatCurrency(amount, currency)}`;
  return formatCurrency(amount, currency);
}

function compactMoney(amount: number, currency: Currency) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M ${currency}`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k ${currency}`;
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}
