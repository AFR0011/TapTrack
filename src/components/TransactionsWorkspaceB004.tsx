'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
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
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
import {
  createTransaction,
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

export default function TransactionsWorkspaceB004() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const { currencies: activeCurrencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
  const [month, setMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | Method>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const isLoading = categories === undefined || transactions === undefined || currenciesLoading;

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );
  const filteredTransactions = useMemo(
    () =>
      (transactions ?? [])
        .filter((transaction) => transaction.date.startsWith(month))
        .filter((transaction) => typeFilter === 'all' || transaction.type === typeFilter)
        .filter((transaction) => methodFilter === 'all' || transaction.method === methodFilter)
        .filter((transaction) => categoryFilter === 'all' || transaction.categoryId === categoryFilter)
        .filter((transaction) => {
          const query = searchQuery.trim().toLowerCase();
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
        }),
    [categoryById, categoryFilter, methodFilter, month, searchQuery, transactions, typeFilter]
  );
  const transactionsByDate = useMemo(() => {
    const groups: Array<{ date: string; label: string; transactions: Transaction[] }> = [];
    for (const transaction of filteredTransactions) {
      const last = groups.at(-1);
      if (last?.date === transaction.date) last.transactions.push(transaction);
      else groups.push({ date: transaction.date, label: formatTransactionDateGroupLabel(transaction.date), transactions: [transaction] });
    }
    return groups;
  }, [filteredTransactions]);
  const advancedFilterCount = [typeFilter !== 'all', methodFilter !== 'all', categoryFilter !== 'all'].filter(Boolean).length;
  const hasFilters = advancedFilterCount > 0 || Boolean(searchQuery.trim());

  const clearFilters = () => {
    setTypeFilter('all');
    setMethodFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
  };

  const closeEditor = () => {
    setShowForm(false);
    setEditing(null);
    setError('');
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
    setError('');
  };

  const handleCreate = async (draft: TransactionDraft) => {
    await createTransaction(draft);
    closeEditor();
    toast.success('Transaction saved.');
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
      const message = deleteError instanceof InsufficientBalanceError ? deleteError.message : 'Could not delete this transaction. Try again.';
      setError(message);
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading transactions">
        <PageHeader title="Transactions" description="Search and review your history." />
        <SkeletonCard />
        <SkeletonListCard titleWidth="w-48" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description="Search and review your history. Open a transaction to edit it."
        action={<Button type="button" onClick={showForm && !editing ? closeEditor : openCreate}>{showForm && !editing ? 'Close editor' : 'New transaction'}</Button>}
      />

      {(showForm || editing) ? (
        <TransactionForm
          key={editing?.id ?? `new-${defaultCurrency}`}
          categories={categories ?? []}
          transaction={editing}
          activeCurrencies={activeCurrencies}
          defaultCurrency={defaultCurrency}
          onCancel={closeEditor}
          onSubmit={editing ? handleUpdate : handleCreate}
          onDelete={editing ? () => setConfirmDelete(editing) : undefined}
        />
      ) : null}

      <section className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
          <Field label="Search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Description, note, or category" />
          <Field label="Month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <details className="group mt-3 rounded-lg border border-subtle bg-surface-muted">
          <summary className={cn('flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2.5 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden', focusVisibleRing)}>
            <span>More filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}</span>
            <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="grid gap-3 border-t border-subtle p-3 sm:grid-cols-3">
            <SelectField label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | TransactionType)} options={[{ value: 'all', label: 'All types' }, ...TRANSACTION_TYPES.map((type) => ({ value: type, label: capitalize(type) }))]} />
            <SelectField label="Method" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as 'all' | Method)} options={[{ value: 'all', label: 'All methods' }, ...SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))]} />
            <SelectField label="Category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} options={[{ value: 'all', label: 'All categories' }, ...(categories ?? []).map((category) => ({ value: category.id, label: category.name }))]} />
          </div>
        </details>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted" aria-live="polite">{filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'}</p>
          {hasFilters ? <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
        </div>
        {error ? <p role="alert" className="mt-3 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface">
        {filteredTransactions.length === 0 ? (
          <EmptyState
            title="No transactions match this view."
            description="Change the filters or add a transaction for this month."
            action={<div className="flex flex-wrap justify-center gap-2">{hasFilters ? <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}<Button type="button" onClick={openCreate}>New transaction</Button></div>}
            className="m-5"
          />
        ) : (
          <div>
            {transactionsByDate.map((group, groupIndex) => (
              <div key={group.date} className={groupIndex > 0 ? 'border-t border-subtle' : undefined}>
                <div className="bg-surface-muted px-4 py-2"><h2 className="text-xs font-semibold text-muted">{group.label}</h2></div>
                <div className="divide-y divide-subtle">
                  {group.transactions.map((transaction) => {
                    const category = categoryById.get(transaction.categoryId);
                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => { setEditing(transaction); setShowForm(false); setError(''); }}
                        className={cn('flex min-h-16 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-muted sm:p-4', focusVisibleRing)}
                      >
                        <CategoryIcon icon={category?.icon} color={category?.color} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-primary">{transaction.title}</p>
                          <p className="mt-1 text-xs font-medium text-muted">{category?.name ?? transaction.categoryId} · {capitalize(transaction.method)}{transaction.note ? ` · ${transaction.note}` : ''}</p>
                        </div>
                        <p className={cn('shrink-0 text-right text-sm font-semibold tabular-nums', transaction.type === 'income' ? 'text-success' : 'text-danger')}>
                          {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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

function TransactionForm({ categories, transaction, activeCurrencies, defaultCurrency, onCancel, onSubmit, onDelete }: {
  categories: Category[];
  transaction: Transaction | null;
  activeCurrencies: Currency[];
  defaultCurrency: Currency;
  onCancel: () => void;
  onSubmit: (draft: TransactionDraft) => Promise<void>;
  onDelete?: () => void;
}) {
  const amountRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const currencyOptions = useMemo(() => [...new Set([transaction?.currency, ...activeCurrencies].filter(Boolean) as Currency[])], [activeCurrencies, transaction?.currency]);
  const [form, setForm] = useState<TransactionFormState>(() => ({
    type: transaction?.type ?? 'expense',
    amount: transaction?.amount.toString() ?? '',
    currency: transaction?.currency ?? defaultCurrency,
    title: transaction?.title ?? '',
    categoryId: transaction?.categoryId ?? 'cat-other',
    method: transaction?.method ?? 'card',
    date: transaction?.date ?? formatLocalDate(new Date()),
    note: transaction?.note ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pendingOrdering, setPendingOrdering] = useState<PendingOrdering | null>(null);
  const typedCategories = categories.filter((category) => category.type === form.type);
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId) ? form.categoryId : typedCategories[0]?.id ?? form.categoryId;

  const setField = <K extends keyof TransactionFormState>(field: K, value: TransactionFormState[K]) => {
    setPendingOrdering(null);
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'amount' || field === 'title') setFieldErrors((current) => ({ ...current, [field]: undefined }));
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
        setError(saveError instanceof InsufficientBalanceError ? saveError.message : 'Transaction could not be saved. Check the details and try again.');
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
      recurringSourceId: transaction?.recurringSourceId,
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
    await persistDraft({ ...pendingOrdering.draft, occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(checkpoint, relation) });
  };

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="transaction-form-title" className="text-base font-semibold text-primary">{transaction ? 'Edit transaction' : 'New transaction'}</h2><p className="mt-1 text-sm font-medium text-muted">{transaction ? 'Change the details below. The related balance updates with the transaction.' : 'Use this editor when you need more control than Quick Add.'}</p></div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Close</Button>
      </div>
      <form onSubmit={handleSubmit} aria-labelledby="transaction-form-title" className="mt-5 space-y-4" noValidate>
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField label="Type" value={form.type} onChange={(event) => { const type = event.target.value as TransactionType; setForm((current) => ({ ...current, type, categoryId: categories.find((category) => category.type === type)?.id ?? current.categoryId })); }} options={TRANSACTION_TYPES.map((type) => ({ value: type, label: capitalize(type) }))} />
          <Field ref={amountRef} label="Amount" value={form.amount} onChange={(event) => setField('amount', event.target.value)} inputMode="decimal" autoComplete="off" error={fieldErrors.amount} required />
          <SelectField label="Currency" value={form.currency} onChange={(event) => setField('currency', event.target.value)} options={currencyOptions.map((currency) => ({ value: currency, label: currency }))} />
          <SelectField label="Method" value={form.method} onChange={(event) => setField('method', event.target.value as Method)} options={SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))} />
          <Field ref={titleRef} label="Description" value={form.title} onChange={(event) => setField('title', event.target.value)} autoComplete="off" error={fieldErrors.title} required />
          <CategoryPicker categories={typedCategories} value={selectedCategoryId} onChange={(categoryId) => setField('categoryId', categoryId)} />
          <Field label="Date" type="date" value={form.date} onChange={(event) => setField('date', event.target.value)} required />
          <Field label="Note" value={form.note} onChange={(event) => setField('note', event.target.value)} />
        </div>
        {error ? <div role="alert" className="rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"><p>{error}</p>{pendingOrdering ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => void resolveOrdering('before')} disabled={saving}>Before balance check</Button><Button type="button" variant="secondary" onClick={() => void resolveOrdering('after')} disabled={saving}>After balance check</Button></div> : null}</div> : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-4">
          <Button type="submit" loading={saving} disabled={saving}>Save transaction</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          {onDelete ? <Button type="button" variant="dangerGhost" className="ml-auto" onClick={onDelete}>Delete transaction</Button> : null}
        </div>
      </form>
    </section>
  );
}

function formatTransactionDateGroupLabel(date: string): string {
  const today = formatLocalDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLabel = formatLocalDate(yesterday);
  if (date === today) return 'Today';
  if (date === yesterdayLabel) return 'Yesterday';
  return date;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
