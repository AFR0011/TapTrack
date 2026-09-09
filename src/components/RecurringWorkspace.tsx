'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonListCard } from '@/components/ui/Skeleton';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
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
  type RecurringTransaction,
  type TransactionType,
} from '@/types';

type FormState = {
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
type FieldErrors = { amount?: string; title?: string; startDate?: string; endDate?: string };

function blankForm(currency: Currency): FormState {
  return {
    type: 'expense',
    amount: '',
    currency,
    title: '',
    categoryId: 'cat-other',
    method: 'card',
    frequency: 'monthly',
    startDate: formatLocalDate(new Date()),
    endDate: '',
  };
}

function formFromItem(item: RecurringTransaction): FormState {
  return {
    type: item.type,
    amount: item.amount.toString(),
    currency: item.currency,
    title: item.title,
    categoryId: item.categoryId,
    method: item.method,
    frequency: item.frequency,
    startDate: item.startDate,
    endDate: item.endDate ?? '',
  };
}

export default function RecurringWorkspace() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const recurring = useLiveQuery(() => db.recurringTransactions.toArray());
  const { currencies, defaultCurrency, loading: currenciesLoading } = useActiveCurrencies();
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankForm('TRY'));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RecurringTransaction | null>(null);

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );
  const typedCategories = useMemo(
    () => (categories ?? []).filter((category) => category.type === form.type),
    [categories, form.type]
  );
  const selectedCategoryId = typedCategories.some((category) => category.id === form.categoryId)
    ? form.categoryId
    : typedCategories[0]?.id ?? form.categoryId;
  const currencyOptions = useMemo(
    () => [...new Set([editing?.currency, ...currencies].filter(Boolean) as Currency[])],
    [currencies, editing?.currency]
  );
  const sortedRecurring = useMemo(
    () => [...(recurring ?? [])].sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate)),
    [recurring]
  );

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setFieldErrors({});
    setStatus('');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm(defaultCurrency));
    setFieldErrors({});
    setStatus('');
    setEditorOpen(true);
  };

  const openEdit = (item: RecurringTransaction) => {
    setEditing(item);
    setForm(formFromItem(item));
    setFieldErrors({});
    setStatus('');
    setEditorOpen(true);
  };

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setStatus('');
  };

  const setType = (type: TransactionType) => {
    setForm((current) => ({
      ...current,
      type,
      categoryId: categories?.find((category) => category.type === type)?.id ?? current.categoryId,
    }));
    setStatus('');
  };

  const validate = () => {
    const next: FieldErrors = {};
    if (parseAmountInput(form.amount) <= 0) next.amount = 'Enter an amount greater than zero.';
    if (!form.title.trim()) next.title = 'Add a short description.';
    if (!form.startDate) next.startDate = 'Choose a start date.';
    if (form.endDate && form.endDate < form.startDate) next.endDate = 'End date must be on or after the start date.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setStatus('');
    try {
      const draft = {
        type: form.type,
        amount: parseAmountInput(form.amount),
        currency: form.currency,
        title: form.title.trim(),
        categoryId: selectedCategoryId,
        method: form.method,
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
      };
      if (editing) {
        await updateRecurringTransaction(editing.id, { ...draft, nextRunDate: editing.nextRunDate });
        toast.success('Recurring transaction updated.');
      } else {
        await createRecurringTransaction({
          ...draft,
          nextRunDate: getInitialNextRunDate(form.startDate),
          isActive: true,
        });
        toast.success('Recurring transaction saved.');
      }
      closeEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The recurring transaction could not be saved.';
      setStatus(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const runDueCheck = async () => {
    setSaving(true);
    try {
      const result = await createDueRecurringTransactions();
      toast.success(formatDueCheckMessage(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Due transactions could not be added.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: RecurringTransaction) => {
    try {
      await updateRecurringTransaction(item.id, { isActive: !item.isActive });
      toast.success(item.isActive ? 'Recurring transaction paused.' : 'Recurring transaction resumed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The recurring transaction could not be updated.');
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    try {
      await deleteRecurringTransaction(item.id);
      setConfirmDelete(null);
      closeEditor();
      toast.success('Recurring transaction deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The recurring transaction could not be deleted.');
    }
  };

  if (categories === undefined || recurring === undefined || currenciesLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading recurring transactions">
        <PageHeader title="Recurring" description="Plan regular income and expenses." />
        <SkeletonListCard titleWidth="w-56" count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recurring"
        description="Plan repeating income and expenses without crowding your everyday transaction list."
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void runDueCheck()} loading={saving} disabled={saving}>
              Add due transactions
            </Button>
            <Button type="button" onClick={editorOpen && !editing ? closeEditor : openCreate}>
              {editorOpen && !editing ? 'Close editor' : 'New recurring'}
            </Button>
          </div>
        }
      />

      {editorOpen ? (
        <section className="rounded-2xl border border-subtle bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="recurring-form-title" className="text-base font-semibold text-primary">
                {editing ? 'Edit recurring transaction' : 'New recurring transaction'}
              </h2>
              <p className="mt-1 text-sm font-medium text-muted">
                {editing ? 'Existing transactions stay unchanged.' : 'Set the repeating rule once and add due transactions when they are ready.'}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={closeEditor}>Close</Button>
          </div>

          <form onSubmit={handleSubmit} aria-labelledby="recurring-form-title" className="mt-5 space-y-4" noValidate>
            <div className="grid gap-3 md:grid-cols-4">
              <SelectField label="Type" value={form.type} onChange={(event) => setType(event.target.value as TransactionType)} options={TRANSACTION_TYPES.map((type) => ({ value: type, label: capitalize(type) }))} />
              <Field label="Amount" value={form.amount} onChange={(event) => setField('amount', event.target.value)} inputMode="decimal" error={fieldErrors.amount} required />
              <SelectField label="Currency" value={form.currency} onChange={(event) => setField('currency', event.target.value)} options={currencyOptions.map((currency) => ({ value: currency, label: currency }))} />
              <SelectField label="Method" value={form.method} onChange={(event) => setField('method', event.target.value as Method)} options={SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))} />
              <Field label="Description" value={form.title} onChange={(event) => setField('title', event.target.value)} error={fieldErrors.title} required />
              <CategoryPicker categories={typedCategories} value={selectedCategoryId} onChange={(categoryId) => setField('categoryId', categoryId)} />
              <SelectField label="Frequency" value={form.frequency} onChange={(event) => setField('frequency', event.target.value as Frequency)} options={RECURRING_FREQUENCIES.map((frequency) => ({ value: frequency, label: capitalize(frequency) }))} />
              <Field label="Start date" type="date" value={form.startDate} onChange={(event) => setField('startDate', event.target.value)} error={fieldErrors.startDate} required />
              <Field label="End date (optional)" type="date" value={form.endDate} onChange={(event) => setField('endDate', event.target.value)} error={fieldErrors.endDate} />
            </div>
            {status ? <p role="alert" className="rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">{status}</p> : null}
            <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-4">
              <Button type="submit" loading={saving} disabled={saving}>{editing ? 'Save changes' : 'Save recurring transaction'}</Button>
              <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>
              {editing ? <Button type="button" variant="dangerGhost" className="ml-auto" onClick={() => setConfirmDelete(editing)}>Delete recurring transaction</Button> : null}
            </div>
          </form>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-subtle bg-surface">
        {sortedRecurring.length === 0 ? (
          <EmptyState title="No recurring transactions yet." description="Add rent, subscriptions, salary, or anything else that repeats." action={<Button type="button" onClick={openCreate}>New recurring</Button>} className="m-5" />
        ) : (
          <div className="divide-y divide-subtle">
            {sortedRecurring.map((item) => {
              const category = categoryById.get(item.categoryId);
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <button type="button" onClick={() => openEdit(item)} className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left', focusVisibleRing)}>
                    <CategoryIcon icon={category?.icon} color={category?.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-primary">{item.title}</p>
                        {!item.isActive ? <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-semibold text-muted">Paused</span> : null}
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted">Next {item.nextRunDate} · {capitalize(item.frequency)} · {capitalize(item.method)}</p>
                    </div>
                    <p className={cn('shrink-0 text-sm font-semibold tabular-nums', item.type === 'income' ? 'text-success' : 'text-danger')}>
                      {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount, item.currency)}
                    </p>
                  </button>
                  <Button type="button" variant="subtle" size="sm" onClick={() => void toggleActive(item)}>{item.isActive ? 'Pause' : 'Resume'}</Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete recurring transaction"
        message={`Delete "${confirmDelete?.title ?? ''}"? Existing transactions stay in your history, but no future ones will be created from this rule.`}
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
