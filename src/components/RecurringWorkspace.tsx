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
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
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
  const categories = useLiveQuery(() => db.categories.toArray());
  const recurringTransactions = useLiveQuery(() => db.recurringTransactions.toArray());
  const isLoading = categories === undefined || recurringTransactions === undefined;
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
  const [confirmDelete, setConfirmDelete] = useState<RecurringTransaction | null>(null);
  const { success, error: toastError } = { success: (msg: string) => toast.success(msg), error: (msg: string) => toast.error(msg) };
  const typedCategories = (categories ?? []).filter((category) => category.type === form.type);
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
      categoryId: categories?.find((category) => category.type === type)?.id ?? current.categoryId,
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
        nextRunDate: editing.nextRunDate,
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
      success(formatDueCheckMessage(result));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Due recurring check failed.';
      setStatus(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    await deleteRecurringTransaction(item.id);
    setConfirmDelete(null);
    if (editing?.id === item.id) {
      setEditing(null);
    }
    success('Recurring transaction deleted.');
  };

  const toggleActive = async (item: RecurringTransaction) => {
    await updateRecurringTransaction(item.id, { isActive: !item.isActive });
    success(item.isActive ? 'Recurring item paused.' : 'Recurring item resumed.');
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading recurring transactions">
        <header>
          <h1 className="text-2xl font-semibold text-primary">Recurring</h1>
          <p className="text-sm font-medium text-muted">Set up rent, subscriptions, salary, and other repeating entries.</p>
        </header>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Recurring</h1>
          <p className="text-sm font-medium text-muted">Set up rent, subscriptions, salary, and other repeating entries.</p>
        </div>
        <Button type="button" variant="secondary" onClick={runDueCheck} loading={saving} disabled={saving}>
          Process due items
        </Button>
      </header>

      <section className="rounded-2xl border border-subtle bg-surface p-5 ">
        <h2 className="text-base font-semibold text-primary">{editing ? 'Edit recurring transaction' : 'New recurring transaction'}</h2>
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
        {status ? <p className="mt-3 text-sm font-medium text-secondary">{status}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={editing ? handleUpdate : handleCreate} loading={saving} disabled={saving}>
            {editing ? 'Update recurring' : 'Save recurring'}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={() => { setEditing(null); setForm({ type: 'expense', amount: '', currency: 'TRY', title: '', categoryId: 'cat-other', method: 'card', frequency: 'monthly', startDate: formatLocalDate(new Date()), endDate: '' }); }}>
              Cancel
            </Button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface ">
        {recurringTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-secondary">No recurring transactions yet.</p>
            <p className="mt-1 text-sm font-medium text-muted">Use the form above for rent, subscriptions, salary, or other repeated entries.</p>
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {recurringTransactions
              .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
              .map((item) => (
                <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-primary">{item.title}</p>
                      <RecurringStatusBadge isActive={item.isActive} />
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted">
                      Next run {item.nextRunDate} · {formatFrequencyLabel(item.frequency)} · {item.method}
                    </p>
                  </div>
                  <p
                    className={`text-right text-sm font-semibold tabular-nums ${item.type === 'income' ? 'text-success' : 'text-danger'}`}
                  >
                    {item.type === 'income' ? '+' : '-'}
                    {formatMoney(item.amount, item.currency)}
                  </p>
                  <div className="flex items-center gap-2 md:justify-end">
                    <Toggle
                      checked={item.isActive}
                      onChange={() => void toggleActive(item)}
                      label={item.isActive ? `Pause ${item.title}` : `Resume ${item.title}`}
                    />
                    <Button type="button" variant="secondary" className="min-h-11 min-w-11 px-4" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="dangerGhost"
                      className="min-h-11 min-w-11 px-4"
                      onClick={() => setConfirmDelete(item)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete recurring transaction"
        message={`Delete "${confirmDelete?.title ?? ''}"? Future scheduled entries from this rule will stop.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function formatDueCheckMessage(result: { created: number; skipped: number; failed: number }) {
  const parts = [`Added ${result.created} scheduled transaction${result.created === 1 ? '' : 's'}`];
  if (result.skipped > 0) {
    parts.push(`skipped ${result.skipped}`);
  }
  if (result.failed > 0) {
    parts.push(`failed ${result.failed}`);
  }
  return parts.join(' · ');
}

function formatFrequencyLabel(frequency: Frequency) {
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

function RecurringStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
        isActive ? 'bg-success-muted text-success' : 'bg-surface-raised text-muted'
      )}
    >
      {isActive ? 'Active' : 'Paused'}
    </span>
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
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-secondary">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'min-h-11 rounded-lg border border-subtle px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent',
          focusVisibleRing
        )}
      />
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
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-secondary">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'min-h-11 rounded-lg border border-subtle px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent',
          focusVisibleRing
        )}
      >
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          return <option key={optionValue} value={optionValue}>{label}</option>;
        })}
      </select>
    </label>
  );
}
