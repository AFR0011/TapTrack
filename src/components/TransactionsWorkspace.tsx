'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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

export default function TransactionsWorkspace() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
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
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const filteredTransactions = useMemo(
    () =>
      transactions
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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Transactions</h1>
          <p className="text-sm font-medium text-slate-500">Filter, search, add, edit, delete, and backdate local records.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm((current) => !current);
            setError('');
          }}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
        >
          {showForm ? 'Close form' : 'Add transaction'}
        </button>
      </header>

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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Search
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Title, note, or category"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | TransactionType)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500">
              <option value="all">all</option>
              {TRANSACTION_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Method
            <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as 'all' | Method)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500">
              <option value="all">all</option>
              {SUPPORTED_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Category
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500">
              <option value="all">all</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-slate-500">No transactions match these filters.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{transaction.title}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-normal text-slate-500">
                    {transaction.date} / {categoryById.get(transaction.categoryId)?.name ?? transaction.categoryId} / {transaction.method}
                  </p>
                  {transaction.note ? <p className="mt-1 text-sm text-slate-500">{transaction.note}</p> : null}
                </div>
                <p className={`text-sm font-semibold ${transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditing(transaction); setShowForm(false); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    Edit
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(transaction)} className="rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                    Delete
                  </button>
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
  const typedCategories = categories.filter((category) => category.type === form.type);
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId)
    ? form.categoryId
    : typedCategories[0]?.id ?? form.categoryId;

  const setField = <K extends keyof TransactionFormState>(field: K, value: TransactionFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setType = (type: TransactionType) => {
    setForm((current) => ({
      ...current,
      type,
      categoryId: categories.find((category) => category.type === type)?.id ?? current.categoryId,
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');

    try {
      await onSubmit({
        type: form.type,
        amount: parseAmountInput(form.amount),
        currency: form.currency,
        title: form.title.trim(),
        categoryId: selectedCategoryId,
        method: form.method,
        date: form.date,
        note: form.note.trim() || undefined,
        recurringSourceId: transaction?.recurringSourceId,
      });
    } catch (err) {
      setError(err instanceof InsufficientBalanceError ? err.message : 'Transaction could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
      <h2 className="text-base font-semibold text-slate-950">{transaction ? 'Edit transaction' : 'Add transaction'}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <FormSelect label="Type" value={form.type} onChange={(value) => setType(value as TransactionType)} options={TRANSACTION_TYPES} />
        <FormInput label="Amount" value={form.amount} onChange={(value) => setField('amount', value)} inputMode="decimal" />
        <FormSelect label="Currency" value={form.currency} onChange={(value) => setField('currency', value as Currency)} options={SUPPORTED_CURRENCIES} />
        <FormSelect label="Method" value={form.method} onChange={(value) => setField('method', value as Method)} options={SUPPORTED_METHODS} />
        <FormInput label="Title" value={form.title} onChange={(value) => setField('title', value)} />
        <FormSelect label="Category" value={selectedCategoryId} onChange={(value) => setField('categoryId', value)} options={typedCategories.map((category) => ({ value: category.id, label: category.name }))} />
        <FormInput label="Date" type="date" value={form.date} onChange={(value) => setField('date', value)} />
        <FormInput label="Note" value={form.note} onChange={(value) => setField('note', value)} />
      </div>
      {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60">
          {saving ? 'Saving' : 'Save transaction'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </section>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: 'decimal';
}) {
  return (
    <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
      {label}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[] | Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500"
      >
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
