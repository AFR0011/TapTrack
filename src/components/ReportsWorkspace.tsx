'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
import type { ExchangeRates, Transaction } from '@/types';

const COLORS = ['#2563eb', '#16a34a', '#db2777', '#f59e0b', '#64748b', '#7c3aed'];

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

  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(month).first(),
    [month]
  );
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('month').equals(month).toArray(),
    [month],
    []
  );

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
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const activeTransactions = useMemo(() => {
    if (reportMode === 'month') {
      return transactions.filter((transaction) => transaction.date.startsWith(month));
    }
    if (reportMode === 'year') {
      return transactions.filter((transaction) => transaction.date.startsWith(year));
    }

    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return transactions.filter((transaction) => transaction.date >= start && transaction.date <= end);
  }, [month, rangeEnd, rangeStart, reportMode, transactions, year]);

  const previousMonthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(getPreviousMonth(month))),
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
          transactions.filter((transaction) => transaction.date.startsWith(itemMonth)),
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
    categoryBudgets,
    transactions
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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Reports</h1>
          <p className="text-sm font-medium text-slate-500">
            Monthly, date-range, and yearly review using local transaction data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeButton mode="month" activeMode={reportMode} onClick={setReportMode} />
          <ModeButton mode="range" activeMode={reportMode} onClick={setReportMode} />
          <ModeButton mode="year" activeMode={reportMode} onClick={setReportMode} />
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div className="grid gap-3 sm:grid-cols-3">
            {reportMode === 'month' ? (
              <DateInput label="Month" type="month" value={month} onChange={setMonth} />
            ) : null}
            {reportMode === 'range' ? (
              <>
                <DateInput label="Start" type="date" value={rangeStart} onChange={setRangeStart} />
                <DateInput label="End" type="date" value={rangeEnd} onChange={setRangeEnd} />
              </>
            ) : null}
            {reportMode === 'year' ? (
              <DateInput label="Year" type="number" value={year} onChange={setYear} min="2000" max="2100" />
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setUnifyToTRY((value) => !value)}
            disabled={ratesLoading}
            title={rateLabel || 'Convert USD and EUR to TRY for this report view'}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all disabled:opacity-60 ${
              unifyToTRY
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {ratesLoading ? 'Loading rates' : unifyToTRY ? 'All in TRY' : 'Unify to TRY'}
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={exporting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-60"
          >
            {exporting ? 'Exporting PDF' : 'Export PDF'}
          </button>
        </div>
        {unifyToTRY && rateLabel ? <p className="mt-3 text-xs font-medium text-slate-400">{rateLabel}</p> : null}
        {exportError ? <p className="mt-3 text-sm font-medium text-red-600">{exportError}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Income" value={formatMoney(incomeVsExpense.income)} tone="good" />
        <Metric label="Expenses" value={formatMoney(incomeVsExpense.expense)} tone="bad" />
        <Metric label="Net" value={formatMoney(incomeVsExpense.net)} tone={incomeVsExpense.net >= 0 ? 'good' : 'bad'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Spending by category" empty={categoryData.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={categoryData} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                {categoryData.map((entry, index) => (
                  <Cell key={entry.categoryId} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Spending over time" empty={spendingOverTime.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={spendingOverTime}>
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title={reportMode === 'year' ? 'Monthly income vs expense' : 'Income vs expense'}
          empty={comparisonData.every((item) => item.income === 0 && item.expense === 0)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparisonData}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Bar dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
          <h2 className="text-base font-semibold text-slate-950">Budget performance</h2>
          {reportMode !== 'month' ? (
            <EmptyState
              title="Budget view is monthly."
              action="Switch to Month to review TRY budgets and rollover."
            />
          ) : (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${budgetPercent}%` }} />
              </div>
              <div className="mt-4 grid gap-2">
                <MetricRow label="Available" value={formatMoney(budgetPerformance.available)} />
                <MetricRow label="Spent" value={formatMoney(budgetPerformance.totalSpent)} />
                <MetricRow
                  label="Remaining"
                  value={formatMoney(budgetPerformance.remaining)}
                  tone={budgetPerformance.remaining >= 0 ? 'good' : 'bad'}
                />
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {budgetPerformance.categoryBudgets.length === 0 ? (
                  <EmptyState title="No category budgets yet." action="Set category limits on Budgets." compact />
                ) : (
                  budgetPerformance.categoryBudgets.map((item) => (
                    <div key={item.categoryId} className="flex items-center justify-between py-3 text-sm">
                      <span className="font-medium text-slate-600">{categoryById.get(item.categoryId)?.name ?? item.categoryId}</span>
                      <span className="font-semibold text-slate-950">
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
    <button
      type="button"
      onClick={() => onClick(mode)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
        active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function DateInput({
  label,
  value,
  onChange,
  type,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: 'month' | 'date' | 'number';
  min?: string;
  max?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
      {label}
      <input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === 'good' ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {empty ? (
        <EmptyState title="No report data yet." action="Log a transaction for this period." />
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </div>
  );
}

function EmptyState({ title, action, compact = false }: { title: string; action: string; compact?: boolean }) {
  return (
    <div className={`${compact ? 'py-4' : 'mt-6 py-8'} text-center`}>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{action}</p>
    </div>
  );
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-950'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
