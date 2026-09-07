'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
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
  SUPPORTED_CURRENCIES,
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
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';
import { toast } from 'sonner';

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

export default function TransactionsWorkspace() {
  const router = useRouter();
  const categories = useLiveQuery(() => db.categories.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const isLoading = categories === undefined || transactions === undefined;
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
        .filter((transaction) => categoryFilter === 'all' || transaction.categoryId === categoryFilter)
        .filter((transaction) => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            transaction.title.toLowerCase().includes(q) ||
            (transaction.note ?? '').toLowerCase().includes(q) ||
            (categoryById.get(transaction.categoryId)?.name ?? '').toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const dateDiff = b.date.localeCompare(a.date);
          if (dateDiff !== 0) return dateDiff;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [categoryFilter, categoryById, methodFilter, month, searchQuery, transactions, typeFilter]
  );
  const transactionsByDate = useMemo(() => {
    const groups: Array<{ date: string; label: string; transactions: Transaction[] }> = [];

    for (const transaction of filteredTransactions) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.date === transaction.date) {
        lastGroup.transactions.push(transaction);
      } else {
        groups.push({
          date: transaction.date,
          label: formatTransactionDateGroupLabel(transaction.date),
          transactions: [transaction],
        });
      }
    }

    return groups;
  }, [filteredTransactions]);

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
      const msg = err instanceof InsufficientBalanceError ? err.message : 'Could not delete transaction.';
      setError(msg);
      toast.error(msg);
    }
  };

  const openTransactionEditor = (transaction: Transaction) => {
    setEditing(transaction);
    setShowForm(false);
    setError('');
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
            <Button type="button" variant="secondary" onClick={() => router.push('/app/recurring')}>
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
              {showForm ? 'Close form' : 'Add transaction'}
            </Button>
          </div>
        }
      />

      {(showForm || editing) && (
        <TransactionForm
          key={editing?.id ?? 'new'}
          categories={categories}
          transaction={editing}
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
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Title, note, or category"
          />
          <Field label="Month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          <SecondaryTransactionFilters
            className="hidden md:contents"
            categories={categories}
            typeFilter={typeFilter}
            methodFilter={methodFilter}
            categoryFilter={categoryFilter}
            onTypeFilterChange={setTypeFilter}
            onMethodFilterChange={setMethodFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </div>
        <details className="mt-3 rounded-lg border border-subtle bg-surface-muted md:hidden">
          <summary
            className={cn(
              'flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2.5 text-sm font-medium text-secondary select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            Filters
          </summary>
          <SecondaryTransactionFilters
            className="grid gap-3 border-t border-subtle p-3"
            categories={categories}
            typeFilter={typeFilter}
            methodFilter={methodFilter}
            categoryFilter={categoryFilter}
            onTypeFilterChange={setTypeFilter}
            onMethodFilterChange={setMethodFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </details>
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

      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface ">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-secondary">No transactions match these filters.</p>
            <p className="mt-1 text-sm font-medium text-muted">Clear the filters or add a transaction for this month.</p>
            <Button
              type="button"
              className="mt-4"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
                setError('');
              }}
            >
              Add transaction
            </Button>
          </div>
        ) : (
          <div>
            {transactionsByDate.map((group, groupIndex) => (
              <div key={group.date} className={groupIndex > 0 ? 'border-t border-subtle' : undefined}>
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
                        onClick={() => openTransactionEditor(transaction)}
                        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg px-1 text-left transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-primary">{transaction.title}</p>
                          <p className="mt-1 text-xs font-medium text-muted">
                            {categoryById.get(transaction.categoryId)?.name ?? transaction.categoryId} · {transaction.method}
                          </p>
                          {transaction.note ? <p className="mt-1 text-sm text-muted">{transaction.note}</p> : null}
                        </div>
                        <p
                          className={`shrink-0 text-right text-sm font-semibold tabular-nums md:hidden ${transaction.type === 'income' ? 'text-success' : 'text-danger'}`}
                        >
                          {transaction.type === 'income' ? '+' : '-'}
                          {formatMoney(transaction.amount, transaction.currency)}
                        </p>
                      </button>
                      <p
                        className={`hidden text-right text-sm font-semibold tabular-nums md:block ${transaction.type === 'income' ? 'text-success' : 'text-danger'}`}
                      >
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatMoney(transaction.amount, transaction.currency)}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${transaction.title}`}
                          onClick={() => openTransactionEditor(transaction)}
                        >
                          <StrokeIcon d={PENCIL_ICON} />
                        </Button>
                        <Button
                          type="button"
                          variant="dangerGhost"
                          size="icon"
                          aria-label={`Delete ${transaction.title}`}
                          onClick={() => setConfirmDelete(transaction)}
                        >
                          <StrokeIcon d={TRASH_ICON} />
                        </Button>
                      </div>
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
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function TransactionForm({
  categories,
  transaction,
  onCancel,
  onSubmit,
}: {
  categories: Category[];
  transaction: Transaction | null;
  onCancel: () => void;
  onSubmit: (draft: TransactionDraft) => Promise<void>;
}) {
  const [form, setForm] = useState<TransactionFormState>(() => ({
    type: transaction?.type ?? 'expense',
    amount: transaction?.amount.toString() ?? '',
    currency: transaction?.currency ?? 'TRY',
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

  const clearPendingOrdering = () => {
    setPendingOrdering(null);
    setError('');
  };

  const setField = <K extends keyof TransactionFormState>(field: K, value: TransactionFormState[K]) => {
    clearPendingOrdering();
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setType = (type: TransactionType) => {
    clearPendingOrdering();
    setForm((current) => ({
      ...current,
      type,
      categoryId: categories.find((category) => category.type === type)?.id ?? current.categoryId,
    }));
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
        setError('This transaction is on the same date as a balance reconciliation. Choose when it happened.');
      } else {
        setPendingOrdering(null);
        setError(err instanceof InsufficientBalanceError ? err.message : 'Transaction could not be saved.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPendingOrdering(null);

    const trimmedTitle = form.title.trim();
    const amount = parseAmountInput(form.amount);

    if (!trimmedTitle) {
      setError('Enter a title for this transaction.');
      return;
    }

    if (amount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    const draft: TransactionDraft = {
      type: form.type,
      amount,
      currency: form.currency,
      title: trimmedTitle,
      categoryId: selectedCategoryId,
      method: form.method,
      date: form.date,
      note: form.note.trim() || undefined,
      recurringSourceId: transaction?.recurringSourceId,
    };
    await persistDraft(draft);
  };

  const resolveOrdering = async (relation: HistoricalOrderingRelation) => {
    if (!pendingOrdering) return;
    const checkpoint = await db.balanceCheckpoints.get(pendingOrdering.checkpointId);
    if (!checkpoint) {
      setError('The reconciliation checkpoint could not be found.');
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
        {transaction ? 'Edit transaction' : 'Add transaction'}
      </h2>
      <form onSubmit={handleSubmit} aria-labelledby="transaction-form-title" className="mt-4 space-y-4" noValidate>
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField
            label="Type"
            value={form.type}
            onChange={(event) => setType(event.target.value as TransactionType)}
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
            onChange={(event) => setField('currency', event.target.value as Currency)}
            options={SUPPORTED_CURRENCIES}
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
            label="Title"
            value={form.title}
            onChange={(event) => setField('title', event.target.value)}
            autoComplete="off"
            required
          />
          <SelectField
            label="Category"
            value={selectedCategoryId}
            onChange={(event) => setField('categoryId', event.target.value)}
            options={typedCategories.map((category) => ({ value: category.id, label: category.name }))}
          />
          <Field
            label="Date"
            type="date"
            value={form.date}
            onChange={(event) => setField('date', event.target.value)}
            required
          />
          <Field label="Note" value={form.note} onChange={(event) => setField('note', event.target.value)} />
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
                  Before reconciliation
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void resolveOrdering('after')}
                  disabled={saving}
                >
                  After reconciliation
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

const PENCIL_ICON =
  'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z';
const TRASH_ICON =
  'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';

function StrokeIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
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
