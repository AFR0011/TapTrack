'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { CategoryPicker } from '@/components/CategoryPicker';
import { AdaptiveSheet } from '@/components/ui/AdaptiveSheet';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonListRows } from '@/components/ui/Skeleton';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { getCurrentMonth } from '@/dates';
import {
  clampPercent,
  formatMoney,
  parseAmountInput,
  parseNonNegativeAmountInput,
} from '@/format';
import {
  deleteCategoryBudget,
  upsertCategoryBudget,
  upsertMonthlyBudget,
} from '@/budgets/budgetService';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { Currency } from '@/types';

export default function BudgetsWorkspace() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [currencyOverride, setCurrencyOverride] = useState<Currency | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextMonth, setContextMonth] = useState(getCurrentMonth());
  const [contextCurrency, setContextCurrency] = useState<Currency>('TRY');
  const [budgetEditorOpen, setBudgetEditorOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [monthlyError, setMonthlyError] = useState('');
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDraftId, setCategoryDraftId] = useState('');
  const [categoryDraftAmount, setCategoryDraftAmount] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [saving, setSaving] = useState('');

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

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );

  const spentByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of monthExpenses) {
      totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + transaction.amount);
    }
    return totals;
  }, [monthExpenses]);

  const totalSpent = monthExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAvailable =
    (monthlyBudget?.totalBudget ?? 0) + (monthlyBudget?.rolloverFromPreviousMonth ?? 0);
  const remaining = budgetAvailable - totalSpent;
  const overBudget = budgetAvailable > 0 && remaining < 0;
  const totalPercent = budgetAvailable > 0 ? clampPercent((totalSpent / budgetAvailable) * 100) : 0;
  const configuredCategoryIds = new Set((categoryBudgets ?? []).map((budget) => budget.categoryId));
  const availableCategories = (categories ?? []).filter(
    (category) => !configuredCategoryIds.has(category.id)
  );
  const allocatedTotal = (categoryBudgets ?? []).reduce((sum, budget) => sum + budget.amount, 0);
  const allocationOverBudget = budgetAvailable > 0 && allocatedTotal > budgetAvailable;

  const sortedCategoryBudgets = useMemo(
    () =>
      [...(categoryBudgets ?? [])].sort((a, b) => {
        const aName = categoryById.get(a.categoryId)?.name ?? a.categoryId;
        const bName = categoryById.get(b.categoryId)?.name ?? b.categoryId;
        return aName.localeCompare(bName);
      }),
    [categoryBudgets, categoryById]
  );

  const openContext = () => {
    setContextMonth(month);
    setContextCurrency(budgetCurrency);
    setContextOpen(true);
  };

  const applyContext = () => {
    setMonth(contextMonth);
    setCurrencyOverride(contextCurrency === defaultCurrency ? null : contextCurrency);
    setContextOpen(false);
  };

  const openBudgetEditor = () => {
    setBudgetDraft(String(monthlyBudget?.totalBudget ?? 0));
    setMonthlyError('');
    setBudgetEditorOpen(true);
  };

  const saveMonthlyBudget = async () => {
    const amount = parseNonNegativeAmountInput(budgetDraft);
    if (amount === null) {
      setMonthlyError('Enter a valid monthly budget.');
      return;
    }

    setSaving('monthly');
    setMonthlyError('');
    try {
      await upsertMonthlyBudget({
        month,
        totalBudget: amount,
        currency: budgetCurrency,
      });
      setBudgetEditorOpen(false);
      toast.success('Monthly budget saved.');
    } catch (error) {
      setMonthlyError(
        error instanceof Error
          ? error.message
          : 'Monthly budget could not be saved. Check the amount and try again.'
      );
    } finally {
      setSaving('');
    }
  };

  const openAddCategory = () => {
    const categoryId = availableCategories[0]?.id ?? '';
    setEditingCategoryId(null);
    setCategoryDraftId(categoryId);
    setCategoryDraftAmount('');
    setCategoryError('');
    setCategoryEditorOpen(true);
  };

  const openEditCategory = (categoryId: string, amount: number) => {
    setEditingCategoryId(categoryId);
    setCategoryDraftId(categoryId);
    setCategoryDraftAmount(String(amount));
    setCategoryError('');
    setCategoryEditorOpen(true);
  };

  const saveCategoryLimit = async () => {
    const categoryId = editingCategoryId ?? categoryDraftId;
    const amount = parseAmountInput(categoryDraftAmount);
    if (!categoryId) {
      setCategoryError('Choose a category.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setCategoryError('Enter a monthly limit greater than zero.');
      return;
    }

    setSaving(categoryId);
    setCategoryError('');
    try {
      await upsertCategoryBudget({
        month,
        categoryId,
        amount,
        currency: budgetCurrency,
      });
      setCategoryEditorOpen(false);
      toast.success(editingCategoryId ? 'Category limit updated.' : 'Category limit added.');
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'Category limit could not be saved.');
    } finally {
      setSaving('');
    }
  };

  const removeCategoryLimit = async () => {
    if (!editingCategoryId) return;
    setSaving(editingCategoryId);
    try {
      await deleteCategoryBudget(month, editingCategoryId, budgetCurrency);
      setCategoryEditorOpen(false);
      toast.success('Category limit removed.');
    } finally {
      setSaving('');
    }
  };

  if (isLoading) {
    return <BudgetsSkeleton />;
  }

  const monthLabel = formatMonthLabel(month);
  const rollover = monthlyBudget?.rolloverFromPreviousMonth ?? 0;
  const currentEditingCategory = editingCategoryId ? categoryById.get(editingCategoryId) : undefined;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Plan</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-primary">Budgets</h1>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={openContext}>
          <CalendarIcon />
          <span>{monthLabel}</span>
          <span className="text-muted">·</span>
          <span>{budgetCurrency}</span>
          <span aria-hidden="true" className="text-muted">⌄</span>
        </Button>
      </header>

      <div
        data-layout="budgets-content"
        className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7"
      >
        <section
          className={cn(
            'relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-[0_20px_55px_rgba(30,64,175,0.18)] sm:p-6',
            overBudget
              ? 'bg-gradient-to-br from-slate-950 via-rose-950 to-red-900'
              : 'bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900'
          )}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/70">
                  {budgetAvailable > 0 ? 'Left to spend' : 'Monthly budget'}
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">
                  {budgetAvailable > 0
                    ? formatMoney(Math.abs(remaining), budgetCurrency)
                    : formatMoney(0, budgetCurrency)}
                </p>
                <p className={cn('mt-2 text-sm font-semibold', overBudget ? 'text-rose-200' : 'text-blue-100/75')}>
                  {budgetAvailable <= 0
                    ? 'Set a monthly ceiling to start tracking your spending.'
                    : overBudget
                      ? `${formatMoney(Math.abs(remaining), budgetCurrency)} over budget`
                      : `${Math.round(totalPercent)}% of this month’s budget used`}
                </p>
              </div>
              <button
                type="button"
                onClick={openBudgetEditor}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white/10 px-3.5 text-sm font-semibold text-white ring-1 ring-white/10 transition-colors hover:bg-white/15',
                  focusVisibleRing
                )}
              >
                {budgetAvailable > 0 ? 'Edit budget' : 'Set budget'}
              </button>
            </div>

            {budgetAvailable > 0 ? (
              <div className="mt-6">
                <div
                  className="h-2 overflow-hidden rounded-full bg-white/15"
                  role="progressbar"
                  aria-label="Monthly budget used"
                  aria-valuenow={totalPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${Math.round(totalPercent)}% used`}
                >
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-300', overBudget ? 'bg-rose-300' : totalPercent >= 80 ? 'bg-amber-300' : 'bg-white')}
                    style={{ width: `${totalPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <HeroMetric label="Spent" value={formatMoney(totalSpent, budgetCurrency)} />
              <HeroMetric label="Budget" value={formatMoney(monthlyBudget?.totalBudget ?? 0, budgetCurrency)} />
            </div>

            {rollover > 0 ? (
              <p className="mt-3 text-xs font-medium text-blue-100/65">
                Includes {formatMoney(rollover, budgetCurrency)} carried over from last month.
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Guardrails</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Category limits</h2>
            </div>
            {availableCategories.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={openAddCategory}>
                <PlusIcon />
                Add category
              </Button>
            ) : null}
          </div>

          {allocationOverBudget ? (
            <div className="mb-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm font-medium text-secondary ring-1 ring-subtle/70">
              Category limits add up to {formatMoney(allocatedTotal, budgetCurrency)}, which is above the available monthly budget.
            </div>
          ) : null}

          {sortedCategoryBudgets.length === 0 ? (
            <div className="rounded-[1.5rem] bg-surface px-5 py-8 text-center shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-surface-muted text-accent">
                <TargetIcon />
              </div>
              <p className="mt-3 text-sm font-semibold text-primary">No category limits yet.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Add limits only to the categories you want to keep a closer eye on.
              </p>
              {availableCategories.length > 0 ? (
                <Button type="button" variant="secondary" className="mt-4" onClick={openAddCategory}>
                  Add first limit
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
              <div className="divide-y divide-subtle">
                {sortedCategoryBudgets.map((budget) => {
                  const category = categoryById.get(budget.categoryId);
                  if (!category) return null;
                  const spent = spentByCategory.get(category.id) ?? 0;
                  const percent = budget.amount > 0 ? clampPercent((spent / budget.amount) * 100) : 0;
                  const categoryRemaining = budget.amount - spent;
                  return (
                    <button
                      key={budget.id}
                      type="button"
                      onClick={() => openEditCategory(category.id, budget.amount)}
                      className={cn(
                        'w-full px-4 py-4 text-left transition-colors hover:bg-surface-muted sm:px-5',
                        focusVisibleRing
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <CategoryIcon icon={category.icon} color={category.color} className="h-10 w-10 rounded-2xl" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-primary">{category.name}</p>
                              <p className="mt-0.5 text-xs font-medium text-muted">
                                {formatMoney(spent, budgetCurrency)} of {formatMoney(budget.amount, budgetCurrency)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={cn('text-sm font-semibold tabular-nums', categoryRemaining < 0 ? 'text-danger' : 'text-primary')}>
                                {categoryRemaining < 0
                                  ? `${formatMoney(Math.abs(categoryRemaining), budgetCurrency)} over`
                                  : `${formatMoney(categoryRemaining, budgetCurrency)} left`}
                              </p>
                              <span className="mt-0.5 inline-block text-xs font-medium text-muted">{Math.round(percent)}%</span>
                            </div>
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className={cn(
                                'h-full rounded-full transition-[width] duration-300',
                                spent > budget.amount ? 'bg-danger' : percent >= 80 ? 'bg-warning' : 'bg-accent'
                              )}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <AdaptiveSheet
        open={contextOpen}
        title="Budget period"
        description="Choose the month and currency you want to plan."
        onClose={() => setContextOpen(false)}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setContextOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={applyContext}>
              Apply
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-secondary">Month</span>
            <input
              type="month"
              value={contextMonth}
              onChange={(event) => setContextMonth(event.target.value)}
              className={cn(
                'min-h-12 w-full rounded-xl border border-subtle bg-surface px-3.5 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
                focusVisibleRing
              )}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-secondary">Currency</span>
            <select
              value={contextCurrency}
              onChange={(event) => setContextCurrency(event.target.value as Currency)}
              className={cn(
                'min-h-12 w-full rounded-xl border border-subtle bg-surface px-3.5 text-base font-medium text-primary outline-none focus-visible:border-accent md:text-sm',
                focusVisibleRing
              )}
            >
              {activeCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </label>
        </div>
      </AdaptiveSheet>

      <AdaptiveSheet
        open={budgetEditorOpen}
        title="Monthly budget"
        description={`${monthLabel} · ${budgetCurrency}`}
        onClose={() => setBudgetEditorOpen(false)}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setBudgetEditorOpen(false)} disabled={saving === 'monthly'}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={() => void saveMonthlyBudget()} loading={saving === 'monthly'}>
              Save budget
            </Button>
          </div>
        }
      >
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-secondary">Monthly ceiling</span>
          <div className="relative">
            <input
              inputMode="decimal"
              value={budgetDraft}
              aria-invalid={monthlyError ? true : undefined}
              onChange={(event) => {
                setBudgetDraft(event.target.value);
                setMonthlyError('');
              }}
              className={cn(
                'min-h-12 w-full rounded-xl border border-subtle bg-surface px-3.5 pr-16 text-lg font-semibold tabular-nums text-primary outline-none focus-visible:border-accent',
                monthlyError && 'border-danger focus-visible:border-danger',
                focusVisibleRing
              )}
              autoFocus
            />
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-semibold text-muted">
              {budgetCurrency}
            </span>
          </div>
          {monthlyError ? <p role="alert" className="text-sm font-medium text-danger">{monthlyError}</p> : null}
        </label>
      </AdaptiveSheet>

      <AdaptiveSheet
        open={categoryEditorOpen}
        title={editingCategoryId ? 'Edit category limit' : 'Add category limit'}
        description={`${monthLabel} · ${budgetCurrency}`}
        onClose={() => setCategoryEditorOpen(false)}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setCategoryEditorOpen(false)} disabled={Boolean(saving)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={() => void saveCategoryLimit()} loading={Boolean(saving)}>
              {editingCategoryId ? 'Save limit' : 'Add limit'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editingCategoryId && currentEditingCategory ? (
            <div className="flex items-center gap-3 rounded-2xl bg-surface-muted p-3.5">
              <CategoryIcon icon={currentEditingCategory.icon} color={currentEditingCategory.color} className="h-10 w-10 rounded-2xl" />
              <div>
                <p className="text-sm font-semibold text-primary">{currentEditingCategory.name}</p>
                <p className="mt-0.5 text-xs font-medium text-muted">Monthly category limit</p>
              </div>
            </div>
          ) : (
            <CategoryPicker
              categories={availableCategories}
              value={categoryDraftId}
              onChange={setCategoryDraftId}
            />
          )}

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-secondary">Monthly limit</span>
            <div className="relative">
              <input
                inputMode="decimal"
                value={categoryDraftAmount}
                onChange={(event) => {
                  setCategoryDraftAmount(event.target.value);
                  setCategoryError('');
                }}
                className={cn(
                  'min-h-12 w-full rounded-xl border border-subtle bg-surface px-3.5 pr-16 text-lg font-semibold tabular-nums text-primary outline-none focus-visible:border-accent',
                  categoryError && 'border-danger focus-visible:border-danger',
                  focusVisibleRing
                )}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-semibold text-muted">
                {budgetCurrency}
              </span>
            </div>
            {categoryError ? <p role="alert" className="text-sm font-medium text-danger">{categoryError}</p> : null}
          </label>

          {editingCategoryId ? (
            <button
              type="button"
              onClick={() => void removeCategoryLimit()}
              disabled={Boolean(saving)}
              className={cn(
                'min-h-11 rounded-lg px-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-muted disabled:opacity-50',
                focusVisibleRing
              )}
            >
              Remove this category limit
            </button>
          ) : null}
        </div>
      </AdaptiveSheet>
    </div>
  );
}

function BudgetsSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-busy="true" aria-label="Loading budgets">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Plan</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-primary">Budgets</h1>
        </div>
        <Skeleton className="h-11 w-36 rounded-xl sm:w-44" />
      </header>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7" data-layout="budgets-content">
        <section className="min-h-[15.5rem] rounded-[1.75rem] bg-surface p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-11 w-44 max-w-[72%] rounded-xl" />
              <Skeleton className="mt-3 h-4 w-52 max-w-[75%]" />
            </div>
            <Skeleton className="h-11 w-24 rounded-xl" />
          </div>
          <Skeleton className="mt-7 h-2 w-full rounded-full" />
          <div className="mt-6 grid grid-cols-2 gap-5 border-t border-subtle pt-4">
            <div>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
            <div>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-32" />
            </div>
            <Skeleton className="h-11 w-32 rounded-xl" />
          </div>
          <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70">
            <SkeletonListRows count={4} />
          </div>
        </section>
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-blue-100/60">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums text-white">{value}</p>
    </div>
  );
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
