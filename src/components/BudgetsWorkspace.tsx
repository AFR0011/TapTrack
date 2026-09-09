'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { getCurrentMonth } from '@/dates';
import { clampPercent, formatMoney, parseAmountInput } from '@/format';
import {
  deleteCategoryBudget,
  upsertCategoryBudget,
  upsertMonthlyBudget,
} from '@/budgets/budgetService';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { CategoryPicker } from '@/components/CategoryPicker';
import { toast } from 'sonner';
import type { Category, Currency } from '@/types';

export default function BudgetsWorkspace() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [currencyOverride, setCurrencyOverride] = useState<Currency | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newCategoryAmount, setNewCategoryAmount] = useState('');
  const [saving, setSaving] = useState('');
  const [monthlyError, setMonthlyError] = useState('');
  const [addCategoryError, setAddCategoryError] = useState('');

  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray());
  const {
    currencies: activeCurrencies,
    defaultCurrency,
    loading: currenciesLoading,
  } = useActiveCurrencies();
  const budgetCurrency =
    currencyOverride && activeCurrencies.includes(currencyOverride)
      ? currencyOverride
      : defaultCurrency;
  const monthlyBudget = useLiveQuery(
    async () =>
      (await db.monthlyBudgets
        .where('month')
        .equals(month)
        .filter((budget) => budget.currency === budgetCurrency)
        .first()) ?? null,
    [month, budgetCurrency]
  );
  const categoryBudgets = useLiveQuery(
    () =>
      db.categoryBudgets
        .where('month')
        .equals(month)
        .filter((budget) => budget.currency === budgetCurrency)
        .toArray(),
    [month, budgetCurrency]
  );

  const isLoading =
    transactions === undefined ||
    categories === undefined ||
    categoryBudgets === undefined ||
    monthlyBudget === undefined ||
    currenciesLoading;

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
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );
  const configuredCategoryIds = new Set((categoryBudgets ?? []).map((budget) => budget.categoryId));
  const availableCategories = (categories ?? []).filter(
    (category) => !configuredCategoryIds.has(category.id)
  );
  const resolvedNewCategoryId = availableCategories.some((category) => category.id === newCategoryId)
    ? newCategoryId
    : availableCategories[0]?.id ?? '';

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
      setMonthlyError(
        err instanceof Error
          ? err.message
          : 'Monthly budget could not be saved. Check the amount and try again.'
      );
    } finally {
      setSaving('');
    }
  };

  const saveCategoryBudget = async (categoryId: string, value: string) => {
    setSaving(categoryId);
    try {
      await upsertCategoryBudget({
        month,
        categoryId,
        amount: parseAmountInput(value),
        currency: budgetCurrency,
      });
      toast.success('Category limit saved.');
    } finally {
      setSaving('');
    }
  };

  const addCategoryLimit = async () => {
    setAddCategoryError('');
    const amount = parseAmountInput(newCategoryAmount);
    if (!resolvedNewCategoryId) {
      setAddCategoryError('Choose a category.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setAddCategoryError('Enter a monthly limit greater than zero.');
      return;
    }
    setSaving('new-category');
    try {
      await upsertCategoryBudget({
        month,
        categoryId: resolvedNewCategoryId,
        amount,
        currency: budgetCurrency,
      });
      setNewCategoryAmount('');
      setNewCategoryId('');
      setShowAddCategory(false);
      toast.success('Category limit added.');
    } catch (err) {
      setAddCategoryError(err instanceof Error ? err.message : 'Category limit could not be added.');
    } finally {
      setSaving('');
    }
  };

  const removeCategoryLimit = async (categoryId: string) => {
    setSaving(categoryId);
    try {
      await deleteCategoryBudget(month, categoryId, budgetCurrency);
      toast.success('Category limit removed.');
    } finally {
      setSaving('');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading budgets">
        <PageHeader title="Budgets" />
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
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              aria-label="Budget month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className={cn(
                'min-h-11 rounded-lg border border-subtle bg-surface px-3 py-2 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
                focusVisibleRing
              )}
            />
            <select
              aria-label="Budget currency"
              value={budgetCurrency}
              onChange={(event) => setCurrencyOverride(event.target.value)}
              className={cn(
                'min-h-11 rounded-lg border border-subtle bg-surface px-3 py-2 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
                focusVisibleRing
              )}
            >
              {activeCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-subtle bg-surface p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Monthly budget</p>
            <p
              className={cn(
                'mt-2 text-3xl font-bold tabular-nums',
                remaining < 0 ? 'text-danger' : 'text-primary'
              )}
            >
              {formatMoney(remaining, budgetCurrency)}
            </p>
            <p className="mt-1 text-sm font-medium text-muted">
              {remaining >= 0 ? 'remaining' : 'over budget'}
            </p>
          </div>

          <MonthlyBudgetEditor
            key={`${month}:${savedTotalBudget}:${budgetCurrency}`}
            savedValue={savedTotalBudget}
            currency={budgetCurrency}
            saving={saving === 'monthly'}
            error={monthlyError}
            onSave={saveMonthlyBudget}
          />

          <dl className="mt-5 divide-y divide-subtle rounded-xl border border-subtle bg-surface-muted px-3">
            <MetricRow label="Spent" value={formatMoney(totalSpent, budgetCurrency)} />
            <MetricRow label="Budget" value={formatMoney(monthlyBudget?.totalBudget ?? 0, budgetCurrency)} />
            {(monthlyBudget?.rolloverFromPreviousMonth ?? 0) > 0 ? (
              <MetricRow
                label="Rollover"
                value={formatMoney(monthlyBudget?.rolloverFromPreviousMonth ?? 0, budgetCurrency)}
              />
            ) : null}
          </dl>

          <ProgressBar
            className="mt-4"
            percent={totalPercent}
            usedLabel={budgetAvailable > 0 ? `${Math.round(totalPercent)}% used` : undefined}
            remainingLabel={
              budgetAvailable > 0
                ? `${formatMoney(Math.max(remaining, 0), budgetCurrency)} remaining`
                : 'Set a monthly budget to track usage'
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-primary">Category limits</h2>
              <p className="mt-1 text-sm text-muted">Only categories you choose to limit appear here.</p>
            </div>
            {!showAddCategory && availableCategories.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddCategory(true)}>
                + Add category
              </Button>
            ) : null}
          </div>

          {showAddCategory ? (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent-muted/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <CategoryPicker
                  categories={availableCategories}
                  value={resolvedNewCategoryId}
                  onChange={setNewCategoryId}
                />
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-secondary">Monthly limit</span>
                  <div className="relative">
                    <input
                      inputMode="decimal"
                      value={newCategoryAmount}
                      onChange={(event) => setNewCategoryAmount(event.target.value)}
                      className={cn(
                        'min-h-11 w-full rounded-lg border border-subtle bg-surface px-3 py-2 pr-14 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
                        focusVisibleRing
                      )}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
                      {budgetCurrency}
                    </span>
                  </div>
                </label>
              </div>
              {addCategoryError ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{addCategoryError}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void addCategoryLimit()}
                  loading={saving === 'new-category'}
                  disabled={saving === 'new-category'}
                >
                  Add limit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowAddCategory(false);
                    setNewCategoryAmount('');
                    setAddCategoryError('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {(categoryBudgets ?? []).length === 0 ? (
            <div className="mt-5 rounded-xl bg-surface-muted p-5 text-center">
              <p className="text-sm font-semibold text-secondary">No category limits yet.</p>
              <p className="mt-1 text-sm text-muted">Add limits only for the categories you want to control closely.</p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-subtle">
              {(categoryBudgets ?? [])
                .slice()
                .sort((a, b) => {
                  const aName = categoryById.get(a.categoryId)?.name ?? a.categoryId;
                  const bName = categoryById.get(b.categoryId)?.name ?? b.categoryId;
                  return aName.localeCompare(bName);
                })
                .map((budget) => {
                  const category = categoryById.get(budget.categoryId);
                  if (!category) return null;
                  const spent = monthExpenses
                    .filter((transaction) => transaction.categoryId === category.id)
                    .reduce((sum, transaction) => sum + transaction.amount, 0);
                  const percent = budget.amount > 0 ? clampPercent((spent / budget.amount) * 100) : 0;
                  return (
                    <CategoryBudgetRow
                      key={budget.id}
                      category={category}
                      currency={budgetCurrency}
                      spent={spent}
                      budget={budget.amount}
                      percent={percent}
                      saving={saving === category.id}
                      onSave={(value) => void saveCategoryBudget(category.id, value)}
                      onRemove={() => void removeCategoryLimit(category.id)}
                    />
                  );
                })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-primary">{value}</dd>
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
    <div className="mt-5">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-secondary">Budget amount</span>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
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
            Save
          </Button>
        </div>
      </label>
      {error ? <p id="monthly-budget-error" role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function CategoryBudgetRow({
  category,
  currency,
  spent,
  budget,
  percent,
  saving,
  onSave,
  onRemove,
}: {
  category: Category;
  currency: Currency;
  spent: number;
  budget: number;
  percent: number;
  saving: boolean;
  onSave: (value: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(budget));
  const [error, setError] = useState('');

  const save = () => {
    const amount = parseAmountInput(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a limit greater than zero.');
      return;
    }
    setError('');
    onSave(value);
    setEditing(false);
  };

  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <CategoryIcon icon={category.icon} color={category.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-primary">{category.name}</p>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {formatMoney(spent, currency)} of {formatMoney(budget, currency)}
              </p>
            </div>
            {!editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </div>
          <ProgressBar
            className="mt-2"
            percent={percent}
            compact
            ariaLabel={`${category.name} budget used`}
            ariaValueText={`${Math.round(percent)}% used`}
          />
        </div>
      </div>

      {editing ? (
        <div className="mt-3 rounded-xl bg-surface-muted p-3 sm:ml-12">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted">Monthly limit</span>
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className={cn(
                    'min-h-11 w-full rounded-lg border border-subtle bg-surface px-3 py-2 pr-14 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
                    focusVisibleRing
                  )}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">{currency}</span>
              </div>
            </label>
            <Button type="button" onClick={save} loading={saving} disabled={saving}>Save</Button>
            <Button type="button" variant="dangerGhost" onClick={onRemove} disabled={saving}>Remove</Button>
          </div>
          {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setValue(String(budget));
              setError('');
            }}
            className="mt-2 min-h-11 text-sm font-semibold text-muted hover:text-primary"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
