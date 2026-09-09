'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
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
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard, SkeletonListCard } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
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

type FieldErrors = {
  amount?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
};

function emptyForm(defaultCurrency: Currency): RecurringFormState {
  return {
    type: 'expense',
    amount: '',
    currency: defaultCurrency,
    title: '',
    categoryId: 'cat-other',
    method: 'card',
    frequency: 'monthly',
    startDate: formatLocalDate(new Date()),
    endDate: '',
  };
}

export default function RecurringWorkspace() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const recurringTransactions = useLiveQuery(() => db.recurringTransactions.toArray());
  const { currencies: activeCurrencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
  const isLoading = categories === undefined || recurringTransactions === undefined || currenciesLoading;
  const [form, setForm] = useState<RecurringFormState>(() => emptyForm('TRY'));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringTransaction | null>(null);
  const { success, error: toastError } = {
    success: (msg: string) => toast.success(msg),
    error: (msg: string) => toast.error(msg),
  };
  const typedCategories = (categories ?? []).filter((category) => category.type === form.type);
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId)
    ? form.categoryId
    : typedCategories[0]?.id ?? form.categoryId;

  useEffect(() => {
    if (editing || currenciesLoading) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setForm((current) =>
        current.currency === 'TRY' && defaultCurrency !== 'TRY'
          ? { ...current, currency: defaultCurrency }
          : current
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currenciesLoading, defaultCurrency, editing]);

  const setField = <K extends keyof RecurringFormState>(field: K, value: RecurringFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const setType = (type: TransactionType) => {
    setForm((current) => ({
      ...current,
      type,
      categoryId: categories?.find((category) => category.type === type)?.id ?? current.categoryId,
    }));
  };

  const validateForm = (): boolean => {
    const nextErrors: FieldErrors = {};
    if (parseAmountInput(form.amount) <= 0) nextErrors.amount = 'Enter an amount greater than zero.';
    if (!form.title.trim()) nextErrors.title = 'Add a short description.';
    if (!form.startDate) nextErrors.startDate = 'Choose a start date.';
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      nextErrors.endDate = 'End date must be on or after the start date.';
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
      setForm(emptyForm(defaultCurrency));
      setEditing(null);
      setFieldErrors({});
      success('Recurring transaction saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recurring transaction could not be saved. Check the details and try again.';
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
      setForm(emptyForm(defaultCurrency));
      setEditing(null);
      setFieldErrors({});
      success('Recurring transaction updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recurring transaction could not be updated. Check the details and try again.';
      setStatus(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('');
    if (!validateForm()) return;
    void (editing ? handleUpdate() : handleCreate());
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
    setFieldErrors({});
    setStatus('');
  };

  const runDueCheck = async () => {
    setSaving(true);
    setStatus('');
    try {
      const result = await createDueRecurringTransactions();
      success(formatDueCheckMessage(result));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Due transactions could not be added. Try again.';
      setStatus(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    await deleteRecurringTransaction(item.id);
    setConfirmDelete(null);
    if (editing?.id === item.id) setEditing(null);
    success('Recurring transaction deleted.');
  };

  const toggleActive = async (item: RecurringTransaction) => {
    await updateRecurringTransaction(item.id, { isActive: !item.isActive });
    success(item.isActive ? 'Recurring transaction paused.' : 'Recurring transaction resumed.');
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading recurring transactions">
        <PageHeader title="Recurring" description="Plan regular income and expenses." />
        <SkeletonCard />
        <SkeletonListCard titleWidth="w-56" count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recurring"
        description="Plan regular income and expenses."
        action={
          <Button type="button" variant="secondary" onClick={runDueCheck} loading={saving} disabled={saving}>
            Add due transactions
          </Button>
        }
      />

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 id="recurring-form-title" className="text-base font-semibold text-primary">
          {editing ? 'Edit recurring transaction' : 'New recurring transaction'}
        </h2>
        <form onSubmit={handleSubmit} aria-labelledby="recurring-form-title" className="mt-4" noValidate>
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
              error={fieldErrors.amount}
              required
            />
            <SelectField
              label="Currency"
              value={form.currency}
              onChange={(event) => setField('currency', event.target.value)}
              options={activeCurrencies.map((currency) => ({ value: currency, label: currency }))}
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
              error={fieldErrors.title}
              required
            />
            <SelectField
              label="Category"
              value={selectedCategoryId}
              onChange={(event) => setField('categoryId', event.target.value)}
              options={typedCategories.map((category) => ({ value: category.id, label: category.name }))}
            />
            <SelectField
              label="Frequency"
              value={form.frequency}
              onChange={(event) => setField('frequency', event.target.value as Frequency)}
              options={RECURRING_FREQUENCIES.map((frequency) => ({
                value: frequency,
                label: formatFrequencyLabel(frequency),
              }))}
            />
            <Field
              label="Start date"
              type="date"
              value={form.startDate}
              onChange={(event) => setField('startDate', event.target.value)}
              error={fieldErrors.startDate}
              required
            />
            <Field
              label="End date (optional)"
              type="date"
              value={form.endDate}
              onChange={(event) => setField('endDate', event.target.value)}
              error={fieldErrors.endDate}
            />
          </div>
          {status ? (
            <p role="alert" aria-live="polite" className="mt-3 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
              {status}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button type="submit" loading={saving} disabled={saving}>
              {editing ? 'Save changes' : 'Save recurring transaction'}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm(defaultCurrency));
                  setFieldErrors({});
                  setStatus('');
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface">
        {recurringTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-secondary">No recurring transactions yet.</p>
            <p className="mt-1 text-sm font-medium text-muted">
              Add rent, subscriptions, salary, or anything else that repeats.
            </p>
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
                      Next on {item.nextRunDate} · {formatFrequencyLabel(item.frequency)} · {item.method}
                    </p>
                  </div>
                  <p className={`text-right text-sm font-semibold tabular-nums ${item.type === 'income' ? 'text-success' : 'text-danger'}`}>
                    {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount, item.currency)}
                  </p>
                  <div className="flex items-center gap-2 md:justify-end">
                    <Toggle checked={item.isActive} onChange={() => void toggleActive(item)} label={item.isActive ? `Pause ${item.title}` : `Resume ${item.title}`} />
                    <Button type="button" variant="secondary" className="min-h-11 min-w-11 px-4" onClick={() => openEdit(item)}>Edit</Button>
                    <Button type="button" variant="dangerGhost" className="min-h-11 min-w-11 px-4" onClick={() => setConfirmDelete(item)}>Delete</Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete recurring transaction"
        message={`Delete "${confirmDelete?.title ?? ''}"? No future transactions will be added from it.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function formatDueCheckMessage(result: { created: number; skipped: number; failed: number }) {
  const parts = [`Added ${result.created} due transaction${result.created === 1 ? '' : 's'}`];
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.failed > 0) parts.push(`${result.failed} need attention`);
  return parts.join(' · ');
}

function formatFrequencyLabel(frequency: Frequency) {
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

function RecurringStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={cn(
      'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
      isActive ? 'bg-success-muted text-success' : 'bg-surface-raised text-muted'
    )}>
      {isActive ? 'Active' : 'Paused'}
    </span>
  );
}
