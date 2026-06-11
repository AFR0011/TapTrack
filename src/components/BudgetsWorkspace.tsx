'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { getCurrentMonth } from '@/dates';
import { clampPercent, formatMoney, parseAmountInput } from '@/format';
import { upsertCategoryBudget, upsertMonthlyBudget } from '@/budgets/budgetService';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from 'sonner';

export default function BudgetsWorkspace() {
  const [month, setMonth] = useState(getCurrentMonth());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray());
  const monthlyBudget = useLiveQuery(
    () => db.monthlyBudgets.where('month').equals(month).first(),
    [month]
  );
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('month').equals(month).toArray(),
    [month]
  );
  const [totalBudgetInput, setTotalBudgetInput] = useState('0');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const savedTotalBudget = monthlyBudget?.totalBudget ?? 0;

  useEffect(() => {
    setTotalBudgetInput(String(savedTotalBudget));
  }, [month, savedTotalBudget]);

  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    categoryBudgets === undefined ||
    monthlyBudget === undefined;

  const monthExpenses = useMemo(
    () =>
      (transactions ?? []).filter(
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
  const remaining = budgetAvailable - totalSpent;
  const totalPercent = budgetAvailable > 0 ? clampPercent((totalSpent / budgetAvailable) * 100) : 0;
  const categoryBudgetByCategory = new Map((categoryBudgets ?? []).map((budget) => [budget.categoryId, budget]));
  const monthlyDirty = parseAmountInput(totalBudgetInput) !== savedTotalBudget;

  const saveMonthlyBudget = async () => {
    setSaving('monthly');
    setError('');
    try {
      await upsertMonthlyBudget({
        month,
        totalBudget: parseAmountInput(totalBudgetInput),
      });
      toast.success('Monthly budget saved.');
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
      toast.success('Category budget saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category budget could not be saved.');
    } finally {
      setSaving('');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading budgets">
        <PageHeader title="Budgets" description="Monthly TRY budgets." />
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        description="Monthly TRY budgets."
        action={
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className={cn(
              'min-h-11 rounded-lg border border-subtle px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent',
              focusVisibleRing
            )}
          />
        }
      />

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-subtle bg-surface p-5 ">
          <h2 className="text-base font-semibold text-primary">Monthly total</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              inputMode="decimal"
              value={totalBudgetInput}
              onChange={(event) => setTotalBudgetInput(event.target.value)}
              className={cn(
            'min-h-11 rounded-lg border border-subtle px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent',
            focusVisibleRing
          )}
            />
            <Button
              type="button"
              onClick={saveMonthlyBudget}
              loading={saving === 'monthly'}
              disabled={saving === 'monthly' || !monthlyDirty}
            >
              Save total
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-danger">{error}</p> : null}

          <div className="mt-5">
            <p className="text-sm font-medium text-secondary">Remaining</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatMoney(remaining)}
            </p>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2">
                <span className="font-medium text-muted">Available</span>
                <span className="font-semibold text-primary">{formatMoney(budgetAvailable)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2">
                <span className="font-medium text-muted">Spent</span>
                <span className="font-semibold text-secondary">{formatMoney(totalSpent)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2">
                <span className="font-medium text-muted">Rollover</span>
                <span className="font-semibold text-secondary">
                  {formatMoney(monthlyBudget?.rolloverFromPreviousMonth ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <ProgressBar
            className="mt-4"
            percent={totalPercent}
            usedLabel={budgetAvailable > 0 ? `${Math.round(totalPercent)}% used` : undefined}
            remainingLabel={
              budgetAvailable > 0
                ? `${formatMoney(Math.max(remaining, 0))} remaining`
                : 'Set a monthly total to track usage'
            }
          />
        </div>

        <div className="rounded-2xl border border-subtle bg-surface p-5 ">
          <h2 className="text-base font-semibold text-primary">Category budgets</h2>
          <div className="mt-4 divide-y divide-subtle">
            {categories.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-secondary">No expense categories available.</p>
                <p className="mt-1 text-sm font-medium text-muted">Create a category in Settings, then assign a monthly limit.</p>
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
                  categoryId={category.id}
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

function CategoryBudgetRow({
  categoryId,
  name,
  spent,
  budget,
  percent,
  saving,
  onSave,
}: {
  categoryId: string;
  name: string;
  spent: number;
  budget: number;
  percent: number;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(String(budget));
  const dirty = parseAmountInput(value) !== budget;

  useEffect(() => {
    setValue(String(budget));
  }, [budget, categoryId]);

  return (
    <div className="grid gap-3 py-3 md:grid-cols-[1fr_160px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold text-primary">{name}</p>
        <p className="mt-1 text-xs font-medium text-muted">{formatMoney(spent)} spent of {formatMoney(budget)}</p>
        <ProgressBar className="mt-2" percent={percent} compact />
      </div>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={cn(
          'min-h-11 rounded-lg border border-subtle px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent',
          focusVisibleRing
        )}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-w-11 shrink-0"
        loading={saving}
        disabled={saving || !dirty}
        onClick={() => onSave(value)}
      >
        Save
      </Button>
    </div>
  );
}
