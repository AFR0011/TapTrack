'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { getCurrentMonth } from '@/dates';
import { clampPercent, formatMoney, parseAmountInput } from '@/format';
import { upsertCategoryBudget, upsertMonthlyBudget } from '@/budgets/budgetService';

export default function BudgetsWorkspace() {
  const [month, setMonth] = useState(getCurrentMonth());
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray(), [], []);
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(month).first(),
    [month]
  );
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('month').equals(month).toArray(),
    [month],
    []
  );
  const [totalBudgetInput, setTotalBudgetInput] = useState('');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const monthExpenses = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          transaction.type === 'expense' &&
          transaction.currency === 'TRY' &&
          transaction.date.startsWith(month)
      ),
    [month, transactions]
  );
  const totalSpent = monthExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAvailable =
    (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const totalPercent = budgetAvailable > 0 ? clampPercent((totalSpent / budgetAvailable) * 100) : 0;
  const categoryBudgetByCategory = new Map(categoryBudgets.map((budget) => [budget.categoryId, budget]));

  const saveMonthlyBudget = async () => {
    setSaving('monthly');
    setError('');
    try {
      await upsertMonthlyBudget({
        month,
        totalBudget: parseAmountInput(totalBudgetInput || String(monthlyBudget?.totalBudget ?? 0)),
      });
      setTotalBudgetInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Budget could not be saved.');
    } finally {
      setSaving('');
    }
  };

  const saveCategoryBudget = async (categoryId: string, value: string) => {
    setSaving(categoryId);
    setError('');
    try {
      await upsertCategoryBudget({ month, categoryId, amount: parseAmountInput(value) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category budget could not be saved.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Budgets</h1>
          <p className="text-sm font-medium text-slate-500">TRY monthly planning with total rollover and category usage.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500"
        />
      </header>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
          <h2 className="text-base font-semibold text-slate-950">Monthly total</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              inputMode="decimal"
              value={totalBudgetInput}
              onChange={(event) => setTotalBudgetInput(event.target.value)}
              placeholder={String(monthlyBudget?.totalBudget ?? 0)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={saveMonthlyBudget}
              disabled={saving === 'monthly'}
              className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
            >
              Save total
            </button>
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
          <div className="mt-5 grid gap-3">
            <BudgetMetric label="Available" value={formatMoney(budgetAvailable)} />
            <BudgetMetric label="Spent" value={formatMoney(totalSpent)} />
            <BudgetMetric label="Remaining" value={formatMoney(budgetAvailable - totalSpent)} tone={budgetAvailable - totalSpent >= 0 ? 'good' : 'bad'} />
            <BudgetMetric label="Rollover" value={formatMoney(monthlyBudget?.rolloverFromPreviousMonth ?? 0)} />
          </div>
          <ProgressBar percent={totalPercent} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
          <h2 className="text-base font-semibold text-slate-950">Category budgets</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {categories.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-slate-700">No expense categories available.</p>
                <p className="mt-1 text-sm font-medium text-slate-500">Create a category in Settings, then assign a monthly limit.</p>
              </div>
            ) : categories.map((category) => {
              const categoryBudget = categoryBudgetByCategory.get(category.id);
              const spent = monthExpenses
                .filter((transaction) => transaction.categoryId === category.id)
                .reduce((sum, transaction) => sum + transaction.amount, 0);
              const budget = categoryBudget?.amount ?? 0;
              const percent = budget > 0 ? clampPercent((spent / budget) * 100) : 0;

              return (
                <CategoryBudgetRow
                  key={category.id}
                  name={category.name}
                  spent={spent}
                  budget={budget}
                  percent={percent}
                  saving={saving === category.id}
                  onSave={(value) => saveCategoryBudget(category.id, value)}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function BudgetMetric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-950'}`}>{value}</span>
    </div>
  );
}

function CategoryBudgetRow({
  name,
  spent,
  budget,
  percent,
  saving,
  onSave,
}: {
  name: string;
  spent: number;
  budget: number;
  percent: number;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="grid gap-3 py-3 md:grid-cols-[1fr_160px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold text-slate-950">{name}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">{formatMoney(spent)} spent of {formatMoney(budget)}</p>
        <ProgressBar percent={percent} compact />
      </div>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={String(budget)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500"
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          onSave(value || String(budget));
          setValue('');
        }}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}

function ProgressBar({ percent, compact = false }: { percent: number; compact?: boolean }) {
  return (
    <div className={`${compact ? 'mt-2 h-1.5' : 'mt-4 h-2'} overflow-hidden rounded-full bg-slate-100`}>
      <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
    </div>
  );
}
