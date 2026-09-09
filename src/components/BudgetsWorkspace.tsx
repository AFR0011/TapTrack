'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { clampPercent, formatMoney, parseAmountInput } from '@/format';
import { upsertCategoryBudget, upsertMonthlyBudget } from '@/budgets/budgetService';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from 'sonner';
import type { Currency } from '@/types';

export default function BudgetsWorkspace() {
  const [month, setMonth] = useState(getCurrentMonth());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const monthlyBudget = useLiveQuery(
    async () => (await db.monthlyBudgets.where('month').equals(month).first()) ?? null,
    [month]
  );
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('month').equals(month).toArray(),
    [month]
  );
  const [saving, setSaving] = useState('');
  const [monthlyError, setMonthlyError] = useState('');
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});

  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    settings === undefined ||
    categoryBudgets === undefined ||
    monthlyBudget === undefined;
  const budgetCurrency: Currency = monthlyBudget?.currency ?? settings?.defaultCurrency ?? 'TRY';
  const savedTotalBudget = monthlyBudget?.totalBudget ?? 0;

  const monthExpenses = useMemo(
    () =>
      (transactions ?? []).filter(
        (transaction) =>
          transaction.type === 'expense' &&
          transaction.currency === budgetCurrency &&
          transaction.date.startsWith(month)
      ),
    [budgetCurrency, month, transactions]
  );
  const totalSpent = monthExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAvailable =
    (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const remaining = budgetAvailable - totalSpent;
  const totalPercent = budgetAvailable > 0 ? clampPercent((totalSpent / budgetAvailable) * 100) : 0;
  const categoryBudgetByCategory = new Map(
    (categoryBudgets ?? []).map((budget) => [budget.categoryId, budget])
  );

  const saveMonthlyBudget = async (value: string) => {
    setSaving('monthly');
    setMonthlyError('');
    try {
      await upsertMonthlyBudget({
        month,
        totalBudget: parseAmountInput(value),
        currency: budgetCurrency,
      });
      toast.success('Monthly budget saved.');
    } catch (err) {
      setMonthlyError(err instanceof Error ? err.message : 'Monthly budget could not be saved. Check the amount and try again.');
    } finally {
      setSaving('');
    }
  };

  const saveCategoryBudget = async (categoryId: string, value: string) => {
    setSaving(categoryId);
    setCategoryErrors((current) => ({ ...current, [categoryId]: '' }));
    try {
      const existing = categoryBudgetByCategory.get(categoryId);
      await upsertCategoryBudget({
        month,
        categoryId,
        amount: parseAmountInput(value),
        currency: existing?.currency ?? budgetCurrency,
      });
      toast.success('Category budget saved.');
    } catch (err) {
      setCategoryErrors((current) => ({
        ...current,
        [categoryId]: err instanceof Error ? err.message : 'This category budget could not be saved. Check the amount and try again.',
      }));
    } finally {
      setSaving('');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading budgets">
        <PageHeader title="Budgets" description="Plan monthly spending." />
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
        description={`${budgetCurrency} spending plan.`}
        action={
          <input
            type="month"
            aria-label="Budget month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className={cn(
              'min-h-11 rounded-lg border border-subtle px-3 py-2 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
              focusVisibleRing
            )}
          />
        }
      />

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-subtle bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-primary">Monthly total</h2>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-secondary">
              {budgetCurrency}
            </span>
          </div>
          <MonthlyBudgetEditor
            key={`${month}:${savedTotalBudget}:${budgetCurrency}`}
            savedValue={savedTotalBudget}
            currency={budgetCurrency}
            saving={saving === 'monthly'}
            error={monthlyError}
            onSave={saveMonthlyBudget}
          />

          <div className="mt-5">
            <p className="text-sm font-medium text-secondary">Remaining</p>
            <p
              className={`mt-1 text-3xl font-bold tabular-nums ${
                remaining >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {formatMoney(remaining, budgetCurrency)}
            </p>
            <div className="mt-4 grid gap-2 text-sm">
              <MetricRow label="Available" value={formatMoney(budgetAvailable, budgetCurrency)} />
              <MetricRow label="Spent" value={formatMoney(totalSpent, budgetCurrency)} />
              <MetricRow
                label="Rollover"
                value={formatMoney(monthlyBudget?.rolloverFromPreviousMonth ?? 0, budgetCurrency)}
              />
            </div>
          </div>

          <ProgressBar
            className="mt-4"
            percent={totalPercent}
            usedLabel={budgetAvailable > 0 ? `${Math.round(totalPercent)}% used` : undefined}
            remainingLabel={
              budgetAvailable > 0
                ? `${formatMoney(Math.max(remaining, 0), budgetCurrency)} remaining`
                : 'Set a monthly total to track usage'
            }
            ariaLabel="Monthly budget used"
            ariaValueText={
              budgetAvailable > 0
                ? `${Math.round(totalPercent)}% used, ${formatMoney(Math.max(remaining, 0), budgetCurrency)} remaining`
                : 'No monthly budget set'
            }
          />
        </div>

        <div className="rounded-2xl border border-subtle bg-surface p-5">
          <h2 className="text-base font-semibold text-primary">Category budgets</h2>
          <div className="mt-4 divide-y divide-subtle">
            {categories.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-secondary">No expense categories available.</p>
                <p className="mt-1 text-sm font-medium text-muted">
                  Add a category in Settings, then give it a monthly limit.
                </p>
              </div>
            ) : (
              categories.map((category) => {
                const categoryBudget = categoryBudgetByCategory.get(category.id);
                const categoryCurrency = categoryBudget?.currency ?? budgetCurrency;
                const spent = (transactions ?? [])
                  .filter(
                    (transaction) =>
                      transaction.type === 'expense' &&
                      transaction.currency === categoryCurrency &&
                      transaction.date.startsWith(month) &&
                      transaction.categoryId === category.id
                  )
                  .reduce((sum, transaction) => sum + transaction.amount, 0);
                const budget = categoryBudget?.amount ?? 0;
                const percent = budget > 0 ? clampPercent((spent / budget) * 100) : 0;

                return (
                  <CategoryBudgetRow
                    key={`${category.id}:${budget}:${categoryCurrency}`}
                    name={category.name}
                    currency={categoryCurrency}
                    spent={spent}
                    budget={budget}
                    percent={percent}
                    saving={saving === category.id}
                    error={categoryErrors[category.id] ?? ''}
                    onSave={(value) => void saveCategoryBudget(category.id, value)}
                  />
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2">
      <span className="font-medium text-muted">{label}</span>
      <span className="font-semibold text-primary">{value}</span>
    </div>
  );
}

function MonthlyBudgetEditor({
  savedValue,
  currency,
  saving,
  error,
  onSave,
}: {
  savedValue: number;
  currency: Currency;
  saving: boolean;
  error: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(String(savedValue));
  const dirty = parseAmountInput(value) !== savedValue;

  return (
    <div className="mt-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <input
            inputMode="decimal"
            value={value}
            aria-label={`Monthly budget in ${currency}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'monthly-budget-error' : undefined}
            onChange={(event) => setValue(event.target.value)}
            className={cn(
              'min-h-11 w-full rounded-lg border border-subtle px-3 py-2 pr-14 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
              focusVisibleRing,
              error && 'border-danger focus-visible:border-danger focus-visible:outline-danger'
            )}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
            {currency}
          </span>
        </div>
        <Button
          type="button"
          onClick={() => onSave(value)}
          loading={saving}
          disabled={saving || !dirty}
        >
          Save total
        </Button>
      </div>
      {error ? <p id="monthly-budget-error" role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function CategoryBudgetRow({
  name,
  currency,
  spent,
  budget,
  percent,
  saving,
  error,
  onSave,
}: {
  name: string;
  currency: Currency;
  spent: number;
  budget: number;
  percent: number;
  saving: boolean;
  error: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(String(budget));
  const dirty = parseAmountInput(value) !== budget;
  const errorId = `category-budget-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-error`;

  return (
    <div className="grid gap-3 py-3 md:grid-cols-[1fr_180px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold text-primary">{name}</p>
        <p className="mt-1 text-xs font-medium text-muted">
          {formatMoney(spent, currency)} spent of {formatMoney(budget, currency)}
        </p>
        <ProgressBar
          className="mt-2"
          percent={percent}
          compact
          ariaLabel={`${name} budget used`}
          ariaValueText={budget > 0 ? `${Math.round(percent)}% used` : 'No category budget set'}
        />
      </div>
      <div className="relative">
        <input
          inputMode="decimal"
          value={value}
          aria-label={`${name} budget in ${currency}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            'min-h-11 w-full rounded-lg border border-subtle px-3 py-2 pr-14 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
            focusVisibleRing,
            error && 'border-danger focus-visible:border-danger focus-visible:outline-danger'
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
          {currency}
        </span>
      </div>
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
      {error ? <p id={errorId} role="alert" className="text-sm font-medium text-danger md:col-span-3 md:mt-[-0.25rem]">{error}</p> : null}
    </div>
  );
}
