'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import {
  createDueRecurringTransactions,
  createRecurringTransaction,
  deleteRecurringTransaction,
  getInitialNextRunDate,
  updateRecurringTransaction,
} from '@/recurring/recurringService';
import {
  RECURRING_FREQUENCIES,
  SUPPORTED_CURRENCIES,
  SUPPORTED_METHODS,
  TRANSACTION_TYPES,
  type Currency,
  type Frequency,
  type Method,
  type TransactionType,
  type RecurringTransaction,
} from '@/types';
import { toast } from 'sonner';

type RecurringFormState = {
  type: TransactionType;
  amount: string;
  currency: Currency;
  title: string;
  categoryId: string;
  method: Method;
  frequency: Frequency;
  startDate: string;
  endDate: string;
};

export default function RecurringWorkspace() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const recurringTransactions = useLiveQuery(() => db.recurringTransactions.toArray(), [], []);
  const [form, setForm] = useState<RecurringFormState>({
    type: 'expense',
    amount: '',
    currency: 'TRY',
    title: '',
    categoryId: 'cat-other',
    method: 'card',
    frequency: 'monthly',
    startDate: formatLocalDate(new Date()),
    endDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const { success, error: toastError } = { success: (msg: string) => toast.success(msg), error: (msg: string) => toast.error(msg) };
  const typedCategories = categories.filter((category) => category.type === form.type);
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId)
    ? form.categoryId
    : typedCategories[0]?.id ?? form.categoryId;

  const setField = <K extends keyof RecurringFormState>(field: K, value: RecurringFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setType = (type: TransactionType) => {
    setForm((current) => ({
      ...current,
      type,
      categoryId: categories.find((category) => category.type === type)?.id ?? current.categoryId,
    }));
  };

  const handleCreate = async () => {
    setSaving(true);
    setStatus('');
    try {
      await createRecurringTransaction({
        type: form.type,
        amount: parseAmountInput(form.amount),
        currency: form.currency,
        title: form.title.trim(),
        categoryId: selectedCategoryId,
        method: form.method,
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        nextRunDate: getInitialNextRunDate(form.startDate),
        isActive: true,
      });
      setForm((current) => ({ ...current, amount: '', title: '', endDate: '' }));
      setEditing(null);
      success('Recurring transaction saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recurring transaction could not be saved.';
      setStatus(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setSaving(true);
    setStatus('');
    try {
      await updateRecurringTransaction(editing.id, {
        type: form.type,
        amount: parseAmountInput(form.amount),
        currency: form.currency,
        title: form.title.trim(),
        categoryId: selectedCategoryId,
        method: form.method,
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        nextRunDate: getInitialNextRunDate(form.startDate),
      });
      setForm({
        type: 'expense',
        amount: '',
        currency: 'TRY',
        title: '',
        categoryId: 'cat-other',
        method: 'card',
        frequency: 'monthly',
        startDate: formatLocalDate(new Date()),
        endDate: '',
      });
      setEditing(null);
      success('Recurring transaction updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recurring transaction could not be updated.';
      setStatus(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: RecurringTransaction) => {
    setEditing(item);
    setForm({
      type: item.type,
      amount: item.amount.toString(),
      currency: item.currency,
      title: item.title,
      categoryId: item.categoryId,
      method: item.method,
      frequency: item.frequency,
      startDate: item.startDate,
      endDate: item.endDate ?? '',
    });
    setStatus('');
  };

  const runDueCheck = async () => {
    setSaving(true);
    setStatus('');
    try {
      const result = await createDueRecurringTransactions();
      const msg = `Created ${result.created}, skipped ${result.skipped}, failed ${result.failed}.`;
      success(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Due recurring check failed.';
      setStatus(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Recurring</h1>
          <p className="text-sm font-medium text-slate-500">Create scheduled records that are processed when the app opens.</p>
        </div>
        <button type="button" onClick={runDueCheck} disabled={saving} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
          Run due check
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        <h2 className="text-base font-semibold text-slate-950">{editing ? 'Edit recurring transaction' : 'New recurring transaction'}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Select label="Type" value={form.type} onChange={(value) => setType(value as TransactionType)} options={TRANSACTION_TYPES} />
          <Input label="Amount" value={form.amount} onChange={(value) => setField('amount', value)} inputMode="decimal" />
          <Select label="Currency" value={form.currency} onChange={(value) => setField('currency', value as Currency)} options={SUPPORTED_CURRENCIES} />
          <Select label="Method" value={form.method} onChange={(value) => setField('method', value as Method)} options={SUPPORTED_METHODS} />
          <Input label="Title" value={form.title} onChange={(value) => setField('title', value)} />
          <Select label="Category" value={selectedCategoryId} onChange={(value) => setField('categoryId', value)} options={typedCategories.map((category) => ({ value: category.id, label: category.name }))} />
          <Select label="Frequency" value={form.frequency} onChange={(value) => setField('frequency', value as Frequency)} options={RECURRING_FREQUENCIES} />
          <Input label="Start date" type="date" value={form.startDate} onChange={(value) => setField('startDate', value)} />
          <Input label="End date (optional)" type="date" value={form.endDate} onChange={(value) => setField('endDate', value)} />
        </div>
        {status ? <p className="mt-3 text-sm font-medium text-slate-600">{status}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={editing ? handleUpdate : handleCreate} disabled={saving} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60">
            {saving ? 'Saving' : editing ? 'Update recurring' : 'Save recurring'}
          </button>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); setForm({ type: 'expense', amount: '', currency: 'TRY', title: '', categoryId: 'cat-other', method: 'card', frequency: 'monthly', startDate: formatLocalDate(new Date()), endDate: '' }); }} className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        {recurringTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-slate-500">No recurring transactions yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recurringTransactions
              .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
              .map((item) => (
                <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-normal text-slate-500">
                      {item.frequency} / next {item.nextRunDate} / {item.method}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold ${item.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount, item.currency)}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => updateRecurringTransaction(item.id, { isActive: !item.isActive })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                      {item.isActive ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" onClick={() => openEdit(item)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteRecurringTransaction(item.id)} className="rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Input({
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
      <input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500" />
    </label>
  );
}

function Select({
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
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500">
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          return <option key={optionValue} value={optionValue}>{label}</option>;
        })}
      </select>
    </label>
  );
}
