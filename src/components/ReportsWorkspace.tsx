'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
import { db } from '@/database';
import { getCurrentMonth, getPreviousMonth } from '@/dates';
import { clampPercent, formatMoney } from '@/format';
import { calculateIncomeVsExpense } from '@/reports/reportService';
import { getBudgetPerformance } from '@/reports/reportTransforms';

const COLORS = ['#2563eb', '#16a34a', '#db2777', '#f59e0b', '#64748b', '#7c3aed'];

export default function ReportsWorkspace() {
  const [month, setMonth] = useState(getCurrentMonth());
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

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const monthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(month)),
    [month, transactions]
  );
  const previousMonthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(getPreviousMonth(month))),
    [month, transactions]
  );
  const incomeVsExpense = calculateIncomeVsExpense(monthTransactions);
  const previousIncomeVsExpense = calculateIncomeVsExpense(previousMonthTransactions);
  const categoryData = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of monthTransactions) {
      if (transaction.type !== 'expense' || transaction.currency !== 'TRY') continue;
      spending.set(transaction.categoryId, (spending.get(transaction.categoryId) ?? 0) + transaction.amount);
    }
    return [...spending.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        name: categoryById.get(categoryId)?.name ?? categoryId,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [categoryById, monthTransactions]);
  const spendingOverTime = useMemo(() => {
    const spending = new Map<string, number>();
    for (const transaction of monthTransactions) {
      if (transaction.type !== 'expense' || transaction.currency !== 'TRY') continue;
      spending.set(transaction.date, (spending.get(transaction.date) ?? 0) + transaction.amount);
    }
    return [...spending.entries()]
      .map(([date, amount]) => ({ date: date.slice(5), amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [monthTransactions]);
  const comparisonData = [
    { month: getPreviousMonth(month), income: previousIncomeVsExpense.income, expense: previousIncomeVsExpense.expense },
    { month, income: incomeVsExpense.income, expense: incomeVsExpense.expense },
  ];
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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Reports</h1>
          <p className="text-sm font-medium text-slate-500">Monthly review studio for TRY spending, budgets, and comparison.</p>
        </div>
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500" />
      </header>

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
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Income vs expense" empty={comparisonData.every((item) => item.income === 0 && item.expense === 0)}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparisonData}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Bar dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Budget performance</h2>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${budgetPercent}%` }} />
          </div>
          <div className="mt-4 grid gap-2">
            <MetricRow label="Available" value={formatMoney(budgetPerformance.available)} />
            <MetricRow label="Spent" value={formatMoney(budgetPerformance.totalSpent)} />
            <MetricRow label="Remaining" value={formatMoney(budgetPerformance.remaining)} tone={budgetPerformance.remaining >= 0 ? 'good' : 'bad'} />
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {budgetPerformance.categoryBudgets.length === 0 ? (
              <p className="py-4 text-sm font-medium text-slate-500">No category budgets set for this month.</p>
            ) : (
              budgetPerformance.categoryBudgets.map((item) => (
                <div key={item.categoryId} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium text-slate-600">{categoryById.get(item.categoryId)?.name ?? item.categoryId}</span>
                  <span className="font-semibold text-slate-950">{formatMoney(item.spent)} / {formatMoney(item.budget)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === 'good' ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {empty ? <p className="mt-6 text-center text-sm font-medium text-slate-500">No data for this month.</p> : <div className="mt-4">{children}</div>}
    </div>
  );
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-950'}`}>{value}</span>
    </div>
  );
}
