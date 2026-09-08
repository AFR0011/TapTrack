'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  InsufficientBalanceError,
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
import { ConfirmDialog } from './ConfirmDialog';
import { SmartCategorySelect } from './SmartCategorySelect';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';

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

type PendingOrdering = {
  draft: TransactionDraft;
  checkpointId: string;
};

export default function TransactionsWorkspaceB004() {
  const router = useRouter();
  const categories = useLiveQuery(() => db.categories.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const { currencies: activeCurrencies, defaultCurrency, loading: currenciesLoading } =
    useActiveCurrencies();
  const isLoading =
    categories === undefined || transactions === undefined || currenciesLoading;
  const [month, setMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | Method>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);

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
        .filter(
          (transaction) =>
            categoryFilter === 'all' || transaction.categoryId === categoryFilter
        )
        .filter((transaction) => {
          if (!searchQuery.trim()) return true;
          const query = searchQuery.toLowerCase();
          return (
            transaction.title.toLowerCase().includes(query) ||
            (transaction.note ?? '').toLowerCase().includes(query) ||
            (categoryById.get(transaction.categoryId)?.name ?? '')
              .toLowerCase()
              .includes(query)
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
      else {
        groups.push({
          date: transaction.date,
          label: formatTransactionDateGroupLabel(transaction.date),
          transactions: [transaction],
        });
      }
    }
    return groups;
  }, [filteredTransactions]);

  const activeSecondaryFilterCount = [
    typeFilter !== 'all',
    methodFilter !== 'all',
    categoryFilter !== 'all',
  ].filter(Boolean).length;
  const hasFilters = activeSecondaryFilterCount > 0 || Boolean(searchQuery.trim());

  const clearFilters = () => {
    setTypeFilter('all');
    setMethodFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
  };

  const handleCreate = async (draft: TransactionDraft) => {
    await createTransaction(draft);
    setShowForm(false);
    toast.success('Transaction saved.');
  };

  const handleUpdate = async (draft: TransactionDraft) => {
    if (!editing) return;
    await updateTransaction(editing.id, draft);
    setEditing(null);
    toast.success('Transaction updated.');
  };

  const handleDelete = async (transaction: Transaction) => {
    setError('');
    try {
      await deleteTransaction(transaction.id);
      setConfirmDelete(null);
      toast.success('Transaction deleted.');
    } catch (err) {
      const message =
        err instanceof InsufficientBalanceError ? err.message : 'Could not delete this transaction. Try again.';
      setError(message);
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading transactions">
        <PageHeader title="Transactions" description="Search, filter, and edit." />
        <SkeletonCard />
        <SkeletonListCard titleWidth="w-48" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description="Search, filter, and edit."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/app/recurring')}
            >
              Recurring
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowForm((current) => !current);
                setError('');
              }}
            >
              {showForm ? 'Close editor' : 'New transaction'}
            </Button>
          </div>
        }
      />

      {(showForm || editing) && (
        <TransactionForm
          key={editing?.id ?? `new-${defaultCurrency}`}
          categories={categories ?? []}
          transaction={editing}
          activeCurrencies={activeCurrencies}
          defaultCurrency={defaultCurrency}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
            setError('');
          }}
          onSubmit={editing ? handleUpdate : handleCreate}
        />
      )}

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          <Field
            label="Search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Description, note, or category"
          />
          <Field
            label="Month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
          <SecondaryTransactionFilters
            className="hidden md:contents"
            categories={categories ?? []}
            typeFilter={typeFilter}
            methodFilter={methodFilter}
            categoryFilter={categoryFilter}
            onTypeFilterChange={setTypeFilter}
            onMethodFilterChange={setMethodFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </div>
        <details className="group mt-3 rounded-lg border border-subtle bg-surface-muted md:hidden">
          <summary
            className={cn(
              'flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2.5 text-sm font-medium text-secondary select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            <span>Filters{activeSecondaryFilterCount > 0 ? ` (${activeSecondaryFilterCount})` : ''}</span>
            <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <SecondaryTransactionFilters
            className="grid gap-3 border-t border-subtle p-3"
            categories={categories ?? []}
            typeFilter={typeFilter}
            methodFilter={methodFilter}
            categoryFilter={categoryFilter}
            onTypeFilterChange={setTypeFilter}
            onMethodFilterChange={setMethodFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </details>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted" aria-live="polite">
            {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'}
          </p>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-3 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-secondary">No transactions match this view.</p>
            <p className="mt-1 text-sm font-medium text-muted">
              Change the filters or add a transaction for this month.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {hasFilters ? <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}
              <Button type="button" onClick={() => router.push('/app/add')}>Add transaction</Button>
            </div>
          </div>
        ) : (
          <div>
            {transactionsByDate.map((group, groupIndex) => (
              <div
                key={group.date}
                className={groupIndex > 0 ? 'border-t border-subtle' : undefined}
              >
                <div className="bg-surface-muted px-4 py-2">
                  <h3 className="text-xs font-semibold text-muted">{group.label}</h3>
                </div>
                <div className="divide-y divide-subtle">
                  {group.transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center gap-2 p-3 md:grid md:grid-cols-[1fr_auto_auto] md:items-center md:gap-3 md:p-4"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(transaction);
                          setShowForm(false);
                          setError('');
                        }}
                        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-1 text-left transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-primary">{transaction.title}</p>
                          <p className="mt-1 text-xs font-medium text-muted">
                            {categoryById.get(transaction.categoryId)?.name ?? transaction.categoryId} ·{' '}
                            {transaction.method}
                          </p>
                          {transaction.note ? (
                            <p className="mt-1 text-sm text-muted">{transaction.note}</p>
                          ) : null}
                        </div>
                        <p
                          className={`shrink-0 text-right text-sm font-semibold tabular-nums md:hidden ${
                            transaction.type === 'income' ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {transaction.type === 'income' ? '+' : '-'}
                          {formatMoney(transaction.amount, transaction.currency)}
                        </p>
                      </button>
                      <p
                        className={`hidden text-right text-sm font-semibold tabular-nums md:block ${
                          transaction.type === 'income' ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatMoney(transaction.amount, transaction.currency)}
                      </p>
                      <Button
                        type="button"
                        variant="dangerGhost"
                        size="sm"
                        onClick={() => setConfirmDelete(transaction)}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete transaction"
        message={`Delete "${confirmDelete?.title ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function TransactionForm({
  categories,
  transaction,
  activeCurrencies,
  defaultCurrency,
  onCancel,
  onSubmit,
}: {
  categories: Category[];
  transaction: Transaction | null;
  activeCurrencies: Currency[];
  defaultCurrency: Currency;
  onCancel: () => void;
  onSubmit: (draft: TransactionDraft) => Promise<void>;
}) {
  const currencyOptions = useMemo(
    () => [...new Set([transaction?.currency, ...activeCurrencies].filter(Boolean) as Currency[])],
    [activeCurrencies, transaction?.currency]
  );
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
  const [pendingOrdering, setPendingOrdering] = useState<PendingOrdering | null>(null);
  const typedCategories = categories.filter((category) => category.type === form.type);
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId)
    ? form.categoryId
    : typedCategories[0]?.id ?? form.categoryId;

  const setField = <K extends keyof TransactionFormState>(
    field: K,
    value: TransactionFormState[K]
  ) => {
    setPendingOrdering(null);
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
  };

  const persistDraft = async (draft: TransactionDraft) => {
    setSaving(true);
    setError('');
    try {
      await onSubmit(draft);
      setPendingOrdering(null);
    } catch (err) {
      if (err instanceof AmbiguousLedgerOrderingError) {
        setPendingOrdering({ draft, checkpointId: err.checkpointId });
        setError(
          'This transaction is on the same date as a balance check. Choose whether it happened before or after that balance was recorded.'
        );
      } else {
        setPendingOrdering(null);
        setError(
          err instanceof InsufficientBalanceError
            ? err.message
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
    if (!title) return setError('Add a short description.');
    if (amount <= 0) return setError('Enter an amount greater than zero.');

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
    await persistDraft({
      ...pendingOrdering.draft,
      occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(checkpoint, relation),
    });
  };

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5">
      <h2 id="transaction-form-title" className="text-base font-semibold text-primary">
        {transaction ? 'Edit transaction' : 'New transaction'}
      </h2>
      <form
        onSubmit={handleSubmit}
        aria-labelledby="transaction-form-title"
        className="mt-4 space-y-4"
        noValidate
      >
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField
            label="Type"
            value={form.type}
            onChange={(event) => {
              const type = event.target.value as TransactionType;
              setForm((current) => ({
                ...current,
                type,
                categoryId:
                  categories.find((category) => category.type === type)?.id ?? current.categoryId,
              }));
            }}
            options={TRANSACTION_TYPES.map((type) => ({
              value: type,
              label: type.charAt(0).toUpperCase() + type.slice(1),
            }))}
          />
          <Field
            label="Amount"
            value={form.amount}
            onChange={(event) => setField('amount', event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            required
          />
          <SelectField
            label="Currency"
            value={form.currency}
            onChange={(event) => setField('currency', event.target.value)}
            options={currencyOptions.map((currency) => ({ value: currency, label: currency }))}
          />
          <SelectField
            label="Method"
            value={form.method}
            onChange={(event) => setField('method', event.target.value as Method)}
            options={SUPPORTED_METHODS.map((method) => ({
              value: method,
              label: method.charAt(0).toUpperCase() + method.slice(1),
            }))}
          />
          <Field
            label="Description"
            value={form.title}
            onChange={(event) => setField('title', event.target.value)}
            autoComplete="off"
            required
          />
          <SmartCategorySelect
            categories={typedCategories}
            type={form.type}
            title={form.title}
            value={selectedCategoryId}
            onChange={(categoryId) => setField('categoryId', categoryId)}
            autoApply={!transaction}
          />
          <Field
            label="Date"
            type="date"
            value={form.date}
            onChange={(event) => setField('date', event.target.value)}
            required
          />
          <Field
            label="Note"
            value={form.note}
            onChange={(event) => setField('note', event.target.value)}
          />
        </div>

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"
          >
            <p>{error}</p>
            {pendingOrdering ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void resolveOrdering('before')}
                  disabled={saving}
                >
                  Before balance check
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void resolveOrdering('after')}
                  disabled={saving}
                >
                  After balance check
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving} disabled={saving}>
            Save transaction
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

function SecondaryTransactionFilters({
  className,
  categories,
  typeFilter,
  methodFilter,
  categoryFilter,
  onTypeFilterChange,
  onMethodFilterChange,
  onCategoryFilterChange,
}: {
  className?: string;
  categories: Category[];
  typeFilter: 'all' | TransactionType;
  methodFilter: 'all' | Method;
  categoryFilter: string;
  onTypeFilterChange: (value: 'all' | TransactionType) => void;
  onMethodFilterChange: (value: 'all' | Method) => void;
  onCategoryFilterChange: (value: string) => void;
}) {
  return (
    <div className={className}>
      <SelectField
        label="Type"
        value={typeFilter}
        onChange={(event) => onTypeFilterChange(event.target.value as 'all' | TransactionType)}
        options={[
          { value: 'all', label: 'All' },
          ...TRANSACTION_TYPES.map((type) => ({
            value: type,
            label: type.charAt(0).toUpperCase() + type.slice(1),
          })),
        ]}
      />
      <SelectField
        label="Method"
        value={methodFilter}
        onChange={(event) => onMethodFilterChange(event.target.value as 'all' | Method)}
        options={[
          { value: 'all', label: 'All' },
          ...SUPPORTED_METHODS.map((method) => ({
            value: method,
            label: method.charAt(0).toUpperCase() + method.slice(1),
          })),
        ]}
      />
      <SelectField
        label="Category"
        value={categoryFilter}
        onChange={(event) => onCategoryFilterChange(event.target.value)}
        options={[
          { value: 'all', label: 'All' },
          ...categories.map((category) => ({ value: category.id, label: category.name })),
        ]}
      />
    </div>
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
