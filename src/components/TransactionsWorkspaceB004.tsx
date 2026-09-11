'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AdaptiveSheet } from '@/components/ui/AdaptiveSheet';
import { Button, buttonVariants } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonListCard } from '@/components/ui/Skeleton';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
import {
  deleteTransaction,
  InsufficientBalanceError,
  updateTransaction,
} from '@/transactions/createTransaction';
import {
  SUPPORTED_METHODS,
  TRANSACTION_TYPES,
  type Category,
  type Currency,
  type Method,
  type Transaction,
  type TransactionDraft,
  type TransactionType,
} from '@/types';

type TransactionFormState = {
  type: TransactionType;
  amount: string;
  currency: Currency;
  title: string;
  categoryId: string;
  method: Method;
  date: string;
  note: string;
};

type PendingOrdering = { draft: TransactionDraft; checkpointId: string };
type FieldErrors = { amount?: string; title?: string };
type DateScope = 'month' | 'all' | 'range';

const PAGE_SIZE = 80;

export default function TransactionsWorkspaceB004() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const { currencies: activeCurrencies, loading: currenciesLoading } = useActiveCurrencies();

  const [dateScope, setDateScope] = useState<DateScope>('month');
  const [month, setMonth] = useState(getCurrentMonth());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | Method>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [draftTypeFilter, setDraftTypeFilter] = useState<'all' | TransactionType>('all');
  const [draftMethodFilter, setDraftMethodFilter] = useState<'all' | Method>('all');
  const [draftCategoryFilter, setDraftCategoryFilter] = useState('all');
  const [draftDateScope, setDraftDateScope] = useState<DateScope>('month');
  const [draftMonth, setDraftMonth] = useState(getCurrentMonth());
  const [draftFromDate, setDraftFromDate] = useState('');
  const [draftToDate, setDraftToDate] = useState('');

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoading = categories === undefined || transactions === undefined || currenciesLoading;

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (transactions ?? [])
      .filter((transaction) => {
        if (dateScope === 'month') return transaction.date.startsWith(month);
        if (dateScope === 'range') {
          if (fromDate && transaction.date < fromDate) return false;
          if (toDate && transaction.date > toDate) return false;
        }
        return true;
      })
      .filter((transaction) => typeFilter === 'all' || transaction.type === typeFilter)
      .filter((transaction) => methodFilter === 'all' || transaction.method === methodFilter)
      .filter((transaction) => categoryFilter === 'all' || transaction.categoryId === categoryFilter)
      .filter((transaction) => {
        if (!query) return true;
        return (
          transaction.title.toLowerCase().includes(query) ||
          (transaction.note ?? '').toLowerCase().includes(query) ||
          (categoryById.get(transaction.categoryId)?.name ?? '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        return dateDiff !== 0 ? dateDiff : b.createdAt.localeCompare(a.createdAt);
      });
  }, [categoryById, categoryFilter, dateScope, fromDate, methodFilter, month, searchQuery, toDate, transactions, typeFilter]);

  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleCount),
    [filteredTransactions, visibleCount]
  );

  const transactionsByDate = useMemo(() => {
    const groups: Array<{ date: string; label: string; transactions: Transaction[] }> = [];
    for (const transaction of visibleTransactions) {
      const last = groups.at(-1);
      if (last?.date === transaction.date) last.transactions.push(transaction);
      else groups.push({
        date: transaction.date,
        label: formatTransactionDateGroupLabel(transaction.date),
        transactions: [transaction],
      });
    }
    return groups;
  }, [visibleTransactions]);

  const advancedFilterCount = [
    typeFilter !== 'all',
    methodFilter !== 'all',
    categoryFilter !== 'all',
  ].filter(Boolean).length;
  const hasFilters = advancedFilterCount > 0 || Boolean(searchQuery.trim());
  const hasMore = visibleCount < filteredTransactions.length;
  const invalidDraftRange =
    draftDateScope === 'range' && Boolean(draftFromDate && draftToDate && draftFromDate > draftToDate);

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current || typeof IntersectionObserver === 'undefined') return;
    const node = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredTransactions.length));
        }
      },
      { rootMargin: '320px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredTransactions.length, hasMore]);

  const resetVisible = () => setVisibleCount(PAGE_SIZE);

  const openFilters = () => {
    setDraftTypeFilter(typeFilter);
    setDraftMethodFilter(methodFilter);
    setDraftCategoryFilter(categoryFilter);
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    setTypeFilter(draftTypeFilter);
    setMethodFilter(draftMethodFilter);
    setCategoryFilter(draftCategoryFilter);
    resetVisible();
    setFilterSheetOpen(false);
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setMethodFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
    setSearchOpen(false);
    resetVisible();
  };

  const openDatePicker = () => {
    setDraftDateScope(dateScope);
    setDraftMonth(month);
    setDraftFromDate(fromDate);
    setDraftToDate(toDate);
    setDateSheetOpen(true);
  };

  const applyDateScope = () => {
    if (invalidDraftRange) return;
    setDateScope(draftDateScope);
    setMonth(draftMonth);
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    resetVisible();
    setDateSheetOpen(false);
  };

  const removeFilter = (kind: 'search' | 'type' | 'method' | 'category') => {
    if (kind === 'search') setSearchQuery('');
    if (kind === 'type') setTypeFilter('all');
    if (kind === 'method') setMethodFilter('all');
    if (kind === 'category') setCategoryFilter('all');
    resetVisible();
  };

  const closeEditor = () => {
    setEditing(null);
    setError('');
  };

  const handleUpdate = async (draft: TransactionDraft) => {
    if (!editing) return;
    await updateTransaction(editing.id, draft);
    closeEditor();
    toast.success('Transaction updated.');
  };

  const handleDelete = async (transaction: Transaction) => {
    setError('');
    try {
      await deleteTransaction(transaction.id);
      setConfirmDelete(null);
      closeEditor();
      toast.success('Transaction deleted.');
    } catch (deleteError) {
      const message =
        deleteError instanceof InsufficientBalanceError
          ? deleteError.message
          : 'Could not delete this transaction. Try again.';
      setError(message);
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading transactions">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ledger</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-primary">Transactions</h1>
        </header>
        <SkeletonListCard titleWidth="w-48" count={7} />
      </div>
    );
  }

  const periodLabel = formatPeriodLabel(dateScope, month, fromDate, toDate);
  const selectedCategoryName = categoryFilter === 'all' ? '' : categoryById.get(categoryFilter)?.name ?? 'Category';

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ledger</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-primary">Transactions</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={searchOpen || searchQuery ? 'subtle' : 'secondary'}
              size="sm"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((current) => !current)}
            >
              <SearchIcon />
              <span className="hidden sm:inline">Search</span>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={openFilters}>
              <FilterIcon />
              <span className="hidden sm:inline">Filter</span>
              {advancedFilterCount > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                  {advancedFilterCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="subtle" size="sm" onClick={openDatePicker}>
            <CalendarIcon />
            <span>{periodLabel}</span>
            <span aria-hidden="true" className="text-muted">⌄</span>
          </Button>
          <p className="text-xs font-semibold tabular-nums text-muted" aria-live="polite">
            {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'}
          </p>
        </div>

        {searchOpen || searchQuery ? (
          <div className="rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-subtle">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field
                  label="Search transactions"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    resetVisible();
                  }}
                  placeholder="Description, note, or category"
                  autoFocus={searchOpen}
                />
              </div>
              {searchQuery ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeFilter('search')}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {hasFilters ? (
          <div className="flex flex-wrap gap-2" aria-label="Active transaction filters">
            {searchQuery.trim() ? (
              <FilterChip label={`Search: ${truncateLabel(searchQuery.trim(), 22)}`} onRemove={() => removeFilter('search')} />
            ) : null}
            {typeFilter !== 'all' ? (
              <FilterChip label={capitalize(typeFilter)} onRemove={() => removeFilter('type')} />
            ) : null}
            {methodFilter !== 'all' ? (
              <FilterChip label={capitalize(methodFilter)} onRemove={() => removeFilter('method')} />
            ) : null}
            {categoryFilter !== 'all' ? (
              <FilterChip label={selectedCategoryName} onRemove={() => removeFilter('category')} />
            ) : null}
            <button
              type="button"
              onClick={clearFilters}
              className={cn('min-h-9 rounded-full px-3 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-primary', focusVisibleRing)}
            >
              Clear all
            </button>
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-muted px-4 py-3 text-sm font-medium text-danger ring-1 ring-danger/20">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
        {filteredTransactions.length === 0 ? (
          <EmptyState
            title="No transactions match this view."
            description="Try another period or clear your filters."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {hasFilters ? <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}
                <Link href="/app/add" prefetch={false} className={buttonVariants({ variant: 'primary' })}>
                  Add transaction
                </Link>
              </div>
            }
            className="m-5"
          />
        ) : (
          <div>
            {transactionsByDate.map((group, groupIndex) => (
              <div key={group.date} className={groupIndex > 0 ? 'border-t border-subtle' : undefined}>
                <div className="bg-surface-muted/70 px-4 py-2.5 sm:px-5">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</h2>
                </div>
                <div className="divide-y divide-subtle">
                  {group.transactions.map((transaction) => {
                    const category = categoryById.get(transaction.categoryId);
                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => {
                          setEditing(transaction);
                          setError('');
                        }}
                        className={cn(
                          'flex min-h-[4.25rem] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-muted/70 sm:px-5 sm:py-3.5',
                          focusVisibleRing
                        )}
                      >
                        <CategoryIcon icon={category?.icon} color={category?.color} className="h-10 w-10 rounded-2xl" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-primary">{transaction.title}</p>
                          <p className="mt-0.5 truncate text-xs font-medium text-muted">
                            {category?.name ?? transaction.categoryId} · {capitalize(transaction.method)}
                            {transaction.note ? ` · ${transaction.note}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn(
                            'text-sm font-bold tabular-nums',
                            transaction.type === 'income' ? 'text-success' : 'text-primary'
                          )}>
                            {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-muted">{transaction.currency}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasMore ? (
              <div ref={loadMoreRef} className="border-t border-subtle px-4 py-4 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredTransactions.length))}
                >
                  Load older transactions
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <AdaptiveSheet
        open={filterSheetOpen}
        title="Filter transactions"
        description="Narrow the ledger without changing your date range."
        onClose={() => setFilterSheetOpen(false)}
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraftTypeFilter('all');
                setDraftMethodFilter('all');
                setDraftCategoryFilter('all');
              }}
            >
              Reset
            </Button>
            <Button type="button" onClick={applyFilters}>Apply filters</Button>
          </div>
        }
      >
        <div className="space-y-5">
          <FilterChoiceGroup
            label="Type"
            value={draftTypeFilter}
            options={[
              { value: 'all', label: 'All' },
              ...TRANSACTION_TYPES.map((type) => ({ value: type, label: capitalize(type) })),
            ]}
            onChange={(value) => setDraftTypeFilter(value as 'all' | TransactionType)}
          />
          <FilterChoiceGroup
            label="Payment method"
            value={draftMethodFilter}
            options={[
              { value: 'all', label: 'All' },
              ...SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) })),
            ]}
            onChange={(value) => setDraftMethodFilter(value as 'all' | Method)}
          />
          <CategoryFilterChoices
            categories={categories ?? []}
            value={draftCategoryFilter}
            onChange={setDraftCategoryFilter}
          />
        </div>
      </AdaptiveSheet>

      <AdaptiveSheet
        open={dateSheetOpen}
        title="Transaction period"
        description="Choose the part of your history you want to see."
        onClose={() => setDateSheetOpen(false)}
        footer={
          <div>
            {invalidDraftRange ? (
              <p className="mb-3 text-sm font-medium text-danger">The start date must be before the end date.</p>
            ) : null}
            <Button type="button" fullWidth onClick={applyDateScope} disabled={invalidDraftRange}>
              Show transactions
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <DateScopeChoice
            selected={draftDateScope === 'month'}
            title="Month"
            description="Focus on one calendar month."
            onClick={() => setDraftDateScope('month')}
          />
          {draftDateScope === 'month' ? (
            <div className="pl-4">
              <Field label="Month" type="month" value={draftMonth} onChange={(event) => setDraftMonth(event.target.value)} />
            </div>
          ) : null}

          <DateScopeChoice
            selected={draftDateScope === 'all'}
            title="All history"
            description="Browse the full ledger, newest first."
            onClick={() => setDraftDateScope('all')}
          />

          <DateScopeChoice
            selected={draftDateScope === 'range'}
            title="Custom range"
            description="Choose your own start and end dates."
            onClick={() => setDraftDateScope('range')}
          />
          {draftDateScope === 'range' ? (
            <div className="grid gap-3 pl-4 sm:grid-cols-2">
              <Field label="From" type="date" value={draftFromDate} onChange={(event) => setDraftFromDate(event.target.value)} />
              <Field label="To" type="date" value={draftToDate} onChange={(event) => setDraftToDate(event.target.value)} />
            </div>
          ) : null}
        </div>
      </AdaptiveSheet>

      <AdaptiveSheet
        open={editing !== null}
        title="Edit transaction"
        description="Changes update the related balance automatically."
        onClose={closeEditor}
        size="lg"
      >
        {editing ? (
          <TransactionForm
            key={editing.id}
            categories={categories ?? []}
            transaction={editing}
            activeCurrencies={activeCurrencies}
            onCancel={closeEditor}
            onSubmit={handleUpdate}
            onDelete={() => setConfirmDelete(editing)}
          />
        ) : null}
      </AdaptiveSheet>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete transaction"
        message={`Delete "${confirmDelete?.title ?? ''}"? This changes the related balance and cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function TransactionForm({ categories, transaction, activeCurrencies, onCancel, onSubmit, onDelete }: {
  categories: Category[];
  transaction: Transaction;
  activeCurrencies: Currency[];
  onCancel: () => void;
  onSubmit: (draft: TransactionDraft) => Promise<void>;
  onDelete?: () => void;
}) {
  const amountRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const currencyOptions = useMemo(
    () => [...new Set([transaction.currency, ...activeCurrencies])],
    [activeCurrencies, transaction.currency]
  );
  const [form, setForm] = useState<TransactionFormState>(() => ({
    type: transaction.type,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    title: transaction.title,
    categoryId: transaction.categoryId,
    method: transaction.method,
    date: transaction.date,
    note: transaction.note ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pendingOrdering, setPendingOrdering] = useState<PendingOrdering | null>(null);
  const typedCategories = categories.filter((category) => category.type === form.type);
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId)
    ? form.categoryId
    : typedCategories[0]?.id ?? form.categoryId;
  const today = formatLocalDate(new Date());

  const setField = <K extends keyof TransactionFormState>(field: K, value: TransactionFormState[K]) => {
    setPendingOrdering(null);
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'amount' || field === 'title') {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const persistDraft = async (draft: TransactionDraft) => {
    setSaving(true);
    setError('');
    try {
      await onSubmit(draft);
      setPendingOrdering(null);
    } catch (saveError) {
      if (saveError instanceof AmbiguousLedgerOrderingError) {
        setPendingOrdering({ draft, checkpointId: saveError.checkpointId });
        setError('This transaction is on the same date as a balance check. Choose whether it happened before or after that balance was recorded.');
      } else {
        setPendingOrdering(null);
        setError(
          saveError instanceof InsufficientBalanceError
            ? saveError.message
            : 'Transaction could not be saved. Check the details and try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();
    const amount = parseAmountInput(form.amount);
    const nextErrors: FieldErrors = {};
    if (amount <= 0) nextErrors.amount = 'Enter an amount greater than zero.';
    if (!title) nextErrors.title = 'Add a short description.';
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      requestAnimationFrame(() => {
        if (nextErrors.amount) amountRef.current?.focus();
        else titleRef.current?.focus();
      });
      return;
    }
    if (form.date > today) {
      setError('Transactions cannot be dated in the future.');
      setPendingOrdering(null);
      return;
    }
    setFieldErrors({});
    await persistDraft({
      type: form.type,
      amount,
      currency: form.currency,
      title,
      categoryId: selectedCategoryId,
      method: form.method,
      date: form.date,
      note: form.note.trim() || undefined,
      recurringSourceId: transaction.recurringSourceId,
    });
  };

  const resolveOrdering = async (relation: HistoricalOrderingRelation) => {
    if (!pendingOrdering) return;
    const checkpoint = await db.balanceCheckpoints.get(pendingOrdering.checkpointId);
    if (!checkpoint) {
      setError('That balance check could not be found. Return to Balances and try again.');
      setPendingOrdering(null);
      return;
    }
    await persistDraft({
      ...pendingOrdering.draft,
      occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(checkpoint, relation),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <SelectField
          label="Type"
          value={form.type}
          onChange={(event) => {
            const type = event.target.value as TransactionType;
            setForm((current) => ({
              ...current,
              type,
              categoryId: categories.find((category) => category.type === type)?.id ?? current.categoryId,
            }));
          }}
          options={TRANSACTION_TYPES.map((type) => ({ value: type, label: capitalize(type) }))}
        />
        <Field
          ref={amountRef}
          label="Amount"
          value={form.amount}
          onChange={(event) => setField('amount', event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          error={fieldErrors.amount}
          required
        />
        <SelectField
          label="Currency"
          value={form.currency}
          onChange={(event) => setField('currency', event.target.value as Currency)}
          options={currencyOptions.map((currency) => ({ value: currency, label: currency }))}
        />
        <SelectField
          label="Method"
          value={form.method}
          onChange={(event) => setField('method', event.target.value as Method)}
          options={SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))}
        />
        <Field
          ref={titleRef}
          label="Description"
          value={form.title}
          onChange={(event) => setField('title', event.target.value)}
          autoComplete="off"
          error={fieldErrors.title}
          required
        />
        <CategoryPicker
          categories={typedCategories}
          value={selectedCategoryId}
          onChange={(categoryId) => setField('categoryId', categoryId)}
        />
        <Field
          label="Date"
          type="date"
          value={form.date}
          max={today}
          onChange={(event) => setField('date', event.target.value)}
          required
        />
        <Field label="Note" value={form.note} onChange={(event) => setField('note', event.target.value)} />
      </div>

      {error ? (
        <div role="alert" className="rounded-xl bg-danger-muted px-3 py-3 text-sm font-medium text-danger ring-1 ring-danger/20">
          <p>{error}</p>
          {pendingOrdering ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void resolveOrdering('before')} disabled={saving}>
                Before balance check
              </Button>
              <Button type="button" variant="secondary" onClick={() => void resolveOrdering('after')} disabled={saving}>
                After balance check
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-4">
        <Button type="submit" loading={saving} disabled={saving}>Save changes</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        {onDelete ? (
          <Button type="button" variant="dangerGhost" className="ml-auto" onClick={onDelete}>
            Delete transaction
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function FilterChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-secondary">{label}</legend>
      <div className="grid grid-cols-3 rounded-2xl bg-surface-muted p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors',
              value === option.value ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-secondary',
              focusVisibleRing
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CategoryFilterChoices({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-secondary">Category</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          aria-pressed={value === 'all'}
          onClick={() => onChange('all')}
          className={cn(
            'flex min-h-12 items-center justify-center rounded-xl px-3 text-sm font-semibold ring-1 transition-colors',
            value === 'all'
              ? 'bg-accent-muted text-primary ring-accent/25'
              : 'bg-surface text-secondary ring-subtle hover:bg-surface-muted',
            focusVisibleRing
          )}
        >
          All categories
        </button>
        {categories.map((category) => {
          const active = value === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(category.id)}
              className={cn(
                'flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl px-3 text-left ring-1 transition-colors',
                active
                  ? 'bg-accent-muted text-primary ring-accent/25'
                  : 'bg-surface text-secondary ring-subtle hover:bg-surface-muted',
                focusVisibleRing
              )}
            >
              <CategoryIcon icon={category.icon} color={category.color} className="h-8 w-8 rounded-xl" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{category.name}</span>
              {active ? <span className="shrink-0 text-sm font-bold text-accent" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function DateScopeChoice({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
        selected ? 'bg-accent-muted ring-1 ring-accent/25' : 'bg-surface-muted hover:bg-surface-raised',
        focusVisibleRing
      )}
    >
      <span
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
          selected ? 'border-accent bg-accent' : 'border-strong bg-surface'
        )}
        aria-hidden="true"
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary">{title}</span>
        <span className="mt-0.5 block text-xs font-medium text-muted">{description}</span>
      </span>
    </button>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-semibold text-secondary shadow-sm ring-1 ring-subtle transition-colors hover:bg-surface-muted',
        focusVisibleRing
      )}
      aria-label={`Remove ${label} filter`}
    >
      <span className="max-w-44 truncate">{label}</span>
      <span aria-hidden="true" className="text-muted">×</span>
    </button>
  );
}

function formatPeriodLabel(scope: DateScope, month: string, fromDate: string, toDate: string) {
  if (scope === 'all') return 'All history';
  if (scope === 'month') return formatMonth(month);
  if (fromDate && toDate) return `${formatCompactDate(fromDate)} – ${formatCompactDate(toDate)}`;
  if (fromDate) return `From ${formatCompactDate(fromDate)}`;
  if (toDate) return `Until ${formatCompactDate(toDate)}`;
  return 'Custom range';
}

function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatCompactDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatTransactionDateGroupLabel(date: string): string {
  const today = formatLocalDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLabel = formatLocalDate(yesterday);
  if (date === today) return 'Today';
  if (date === yesterdayLabel) return 'Yesterday';
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function truncateLabel(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
