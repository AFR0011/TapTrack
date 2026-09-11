'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import RecurringLoadingFrame from '@/components/RecurringLoadingFrame';
import { AdaptiveSheet } from '@/components/ui/AdaptiveSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { formatLocalDate, parseLocalDate } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import { cn, focusVisibleRing } from '@/lib/cn';
import {
  createDueRecurringTransactions,
  createRecurringTransaction,
  deleteRecurringTransaction,
  getInitialNextRunDate,
  getNextScheduledOccurrenceDate,
  resumeRecurringTransaction,
  updateRecurringTransaction,
} from '@/recurring/recurringService';
import {
  RECURRING_FREQUENCIES,
  SUPPORTED_METHODS,
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
  const [dueChecking, setDueChecking] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
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
  const activeRecurring = sortedRecurring.filter((item) => item.isActive);
  const pausedRecurring = sortedRecurring.filter((item) => !item.isActive);
  const nextUp = activeRecurring[0] ?? null;
  const scheduleChanged = Boolean(
    editing && (form.frequency !== editing.frequency || form.startDate !== editing.startDate)
  );
  const previewNextRunDate = form.startDate
    ? editing
      ? scheduleChanged
        ? getNextScheduledOccurrenceDate(form.startDate, form.frequency)
        : editing.nextRunDate
      : getInitialNextRunDate(form.startDate)
    : '';

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
    if (form.endDate && form.endDate < form.startDate) {
      next.endDate = 'End date must be on or after the start date.';
    }
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
        const nextRunDate = scheduleChanged
          ? getNextScheduledOccurrenceDate(form.startDate, form.frequency)
          : editing.nextRunDate;
        const isActive =
          editing.isActive && (!draft.endDate || nextRunDate <= draft.endDate);
        await updateRecurringTransaction(editing.id, { ...draft, nextRunDate, isActive });
        toast.success(
          editing.isActive && !isActive
            ? 'Recurring transaction updated and marked complete.'
            : 'Recurring transaction updated.'
        );
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
    setDueChecking(true);
    try {
      const result = await createDueRecurringTransactions();
      toast.success(formatDueCheckMessage(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Due transactions could not be added.');
    } finally {
      setDueChecking(false);
    }
  };

  const toggleActive = async (item: RecurringTransaction) => {
    setBusyRuleId(item.id);
    try {
      if (item.isActive) {
        await updateRecurringTransaction(item.id, { isActive: false });
        toast.success('Recurring transaction paused.');
      } else {
        await resumeRecurringTransaction(item.id);
        toast.success('Recurring transaction resumed from the next scheduled date.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The recurring transaction could not be updated.');
    } finally {
      setBusyRuleId(null);
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
    return <RecurringLoadingFrame />;
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6" data-layout="recurring-content">
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Recurring</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-muted">
            Keep repeating income and expenses on schedule. Ravel posts due occurrences to your ledger automatically.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="w-full sm:w-auto">
          <span aria-hidden="true">+</span>
          New recurring
        </Button>
      </header>

      <section className="grid min-w-0 gap-3 sm:grid-cols-3" data-layout="recurring-summary">
        <SummaryCard label="Active rules" value={String(activeRecurring.length)} detail="Currently generating transactions" />
        <SummaryCard label="Paused" value={String(pausedRecurring.length)} detail="No transactions created while paused" />
        <SummaryCard
          label="Next up"
          value={nextUp ? formatDateLabel(nextUp.nextRunDate, true) : 'Nothing scheduled'}
          detail={nextUp ? nextUp.title : 'Create a recurring rule when you need one'}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-2xl bg-accent-muted px-4 py-4 ring-1 ring-subtle/70 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Automatic due posting is on</p>
          <p className="mt-1 text-xs font-medium text-muted">
            Ravel checks active rules when the app starts. Checking manually is safe and will not duplicate an occurrence.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void runDueCheck()}
          loading={dueChecking}
          disabled={dueChecking || activeRecurring.length === 0}
          className="shrink-0"
        >
          Check due now
        </Button>
      </section>

      <section className="min-w-0" data-recurring-active>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-primary">Active schedule</h2>
            <p className="mt-0.5 text-xs font-medium text-muted">Rules are ordered by their next occurrence.</p>
          </div>
          {activeRecurring.length > 0 ? (
            <span className="text-xs font-semibold text-muted">{activeRecurring.length} active</span>
          ) : null}
        </div>

        {activeRecurring.length === 0 ? (
          <EmptyState
            title="No active recurring transactions."
            description={pausedRecurring.length > 0 ? 'Resume a paused rule or create a new one.' : 'Add rent, subscriptions, salary, or anything else that repeats.'}
            action={<Button type="button" onClick={openCreate}>New recurring</Button>}
            className="rounded-[1.5rem] bg-surface p-6 ring-1 ring-subtle/70"
          />
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2" data-layout="recurring-rules-grid">
            {activeRecurring.map((item) => (
              <RecurringRuleCard
                key={item.id}
                item={item}
                category={categoryById.get(item.categoryId)}
                onEdit={() => openEdit(item)}
                onToggle={() => void toggleActive(item)}
                busy={busyRuleId === item.id}
              />
            ))}
          </div>
        )}
      </section>

      {pausedRecurring.length > 0 ? (
        <details className="group overflow-hidden rounded-[1.5rem] bg-surface ring-1 ring-subtle/70" data-recurring-paused>
          <summary
            className={cn(
              'flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 select-none [&::-webkit-details-marker]:hidden sm:px-6',
              focusVisibleRing
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">Paused rules</p>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {pausedRecurring.length} rule{pausedRecurring.length === 1 ? '' : 's'} · missed dates stay skipped
              </p>
            </div>
            <Chevron className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-subtle border-t border-subtle">
            {pausedRecurring.map((item) => (
              <PausedRuleRow
                key={item.id}
                item={item}
                category={categoryById.get(item.categoryId)}
                onEdit={() => openEdit(item)}
                onResume={() => void toggleActive(item)}
                busy={busyRuleId === item.id}
              />
            ))}
          </div>
        </details>
      ) : null}

      <AdaptiveSheet
        open={editorOpen}
        onClose={closeEditor}
        size="lg"
        title={editing ? 'Edit recurring transaction' : 'New recurring transaction'}
        description={editing ? 'Changes affect future generated transactions only.' : 'Create one rule and let Ravel handle each due occurrence.'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button type="submit" form="recurring-editor-form" loading={saving} disabled={saving}>
              {editing ? 'Save changes' : 'Save recurring'}
            </Button>
          </div>
        }
      >
        <form id="recurring-editor-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Transaction</p>
              <p className="mt-1 text-sm font-medium text-muted">What should each occurrence add to the ledger?</p>
            </div>

            <div role="group" aria-label="Recurring transaction type" className="grid grid-cols-2 rounded-xl bg-surface-muted p-1">
              <TypeButton active={form.type === 'expense'} onClick={() => setType('expense')}>Expense</TypeButton>
              <TypeButton active={form.type === 'income'} onClick={() => setType('income')}>Income</TypeButton>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field
                label="Amount"
                value={form.amount}
                onChange={(event) => setField('amount', event.target.value)}
                inputMode="decimal"
                error={fieldErrors.amount}
                required
                autoComplete="off"
              />
              <SelectField
                label="Currency"
                value={form.currency}
                onChange={(event) => setField('currency', event.target.value)}
                options={currencyOptions.map((currency) => ({ value: currency, label: currency }))}
              />
            </div>

            <Field
              label="Description"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
              error={fieldErrors.title}
              placeholder={form.type === 'expense' ? 'Rent, Netflix, gym…' : 'Salary, stipend…'}
              required
              data-sheet-autofocus
            />

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <CategoryPicker
                categories={typedCategories}
                value={selectedCategoryId}
                onChange={(categoryId) => setField('categoryId', categoryId)}
              />
              <SelectField
                label="Method"
                value={form.method}
                onChange={(event) => setField('method', event.target.value as Method)}
                options={SUPPORTED_METHODS.map((method) => ({ value: method, label: capitalize(method) }))}
              />
            </div>
          </section>

          <div className="h-px bg-border" />

          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Schedule</p>
              <p className="mt-1 text-sm font-medium text-muted">When should this rule produce transactions?</p>
            </div>

            <SelectField
              label="Frequency"
              value={form.frequency}
              onChange={(event) => setField('frequency', event.target.value as Frequency)}
              options={RECURRING_FREQUENCIES.map((frequency) => ({
                value: frequency,
                label: frequencyLabel(frequency),
              }))}
            />

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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

            {previewNextRunDate ? (
              <div className="rounded-xl bg-surface-muted px-4 py-3 ring-1 ring-subtle/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {editing && !editing.isActive ? 'Scheduled position' : 'Next occurrence'}
                  </p>
                  <span className="text-xs font-semibold text-secondary">{frequencyLabel(form.frequency)}</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-primary">{formatDateLabel(previewNextRunDate)}</p>
                {editing && scheduleChanged ? (
                  <p className="mt-1 text-xs font-medium text-muted">Changing the schedule recalculates the next occurrence from today.</p>
                ) : null}
              </div>
            ) : null}
          </section>

          {status ? (
            <p role="alert" className="rounded-xl bg-danger-muted px-4 py-3 text-sm font-medium text-danger ring-1 ring-danger/20">
              {status}
            </p>
          ) : null}

          {editing ? (
            <section className="rounded-xl bg-danger-muted/50 p-4 ring-1 ring-danger/15">
              <p className="text-sm font-semibold text-primary">Delete rule</p>
              <p className="mt-1 text-xs font-medium text-muted">Existing ledger transactions stay untouched.</p>
              <Button
                type="button"
                variant="dangerGhost"
                className="mt-2 px-0"
                onClick={() => setConfirmDelete(editing)}
              >
                Delete recurring transaction
              </Button>
            </section>
          ) : null}
        </form>
      </AdaptiveSheet>

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

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface px-4 py-4 ring-1 ring-subtle/70 sm:px-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight text-primary">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-muted">{detail}</p>
    </div>
  );
}

function RecurringRuleCard({
  item,
  category,
  onEdit,
  onToggle,
  busy,
}: {
  item: RecurringTransaction;
  category?: { icon?: string; color?: string };
  onEdit: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  return (
    <article className="min-w-0 rounded-[1.35rem] bg-surface p-4 ring-1 ring-subtle/70 sm:p-5" data-recurring-rule>
      <button
        type="button"
        onClick={onEdit}
        className={cn('block w-full min-w-0 rounded-xl text-left', focusVisibleRing)}
      >
        <div className="flex min-w-0 items-start gap-3">
          <CategoryIcon icon={category?.icon} color={category?.color} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-primary">{item.title}</h3>
                <p className="mt-1 text-xs font-medium text-muted">
                  {frequencyLabel(item.frequency)} · {capitalize(item.method)}
                </p>
              </div>
              <p className={cn('shrink-0 text-base font-semibold tabular-nums', item.type === 'income' ? 'text-success' : 'text-danger')}>
                {item.type === 'income' ? '+' : '−'}{formatMoney(item.amount, item.currency)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-muted px-2.5 py-1 text-xs font-semibold text-secondary">
                Next {formatDateLabel(item.nextRunDate, true)}
              </span>
              {item.endDate ? (
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
                  Until {formatDateLabel(item.endDate, true)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>
      <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3">
        <span className="text-xs font-medium text-muted">Tap the rule to edit future occurrences.</span>
        <Button type="button" variant="ghost" size="sm" onClick={onToggle} loading={busy} disabled={busy}>
          Pause
        </Button>
      </div>
    </article>
  );
}

function PausedRuleRow({
  item,
  category,
  onEdit,
  onResume,
  busy,
}: {
  item: RecurringTransaction;
  category?: { icon?: string; color?: string };
  onEdit: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const resumeDate = getNextScheduledOccurrenceDate(item.startDate, item.frequency);
  const ended = Boolean(item.endDate && resumeDate > item.endDate);
  return (
    <div className="flex min-w-0 items-center gap-3 px-5 py-4 sm:px-6" data-recurring-paused-rule>
      <button type="button" onClick={onEdit} className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left', focusVisibleRing)}>
        <CategoryIcon icon={category?.icon} color={category?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-primary">{item.title}</p>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">Paused</span>
          </div>
          <p className="mt-1 text-xs font-medium text-muted">
            {ended ? 'Schedule ended' : `If resumed: ${formatDateLabel(resumeDate, true)}`} · {frequencyLabel(item.frequency)}
          </p>
        </div>
        <p className={cn('shrink-0 text-sm font-semibold tabular-nums', item.type === 'income' ? 'text-success' : 'text-danger')}>
          {item.type === 'income' ? '+' : '−'}{formatMoney(item.amount, item.currency)}
        </p>
      </button>
      <Button type="button" variant="subtle" size="sm" onClick={onResume} loading={busy} disabled={busy || ended}>
        Resume
      </Button>
    </div>
  );
}

function TypeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
        focusVisibleRing,
        active ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}

function formatDueCheckMessage(result: { created: number; skipped: number; failed: number }) {
  if (result.created === 0 && result.failed === 0) return 'Everything recurring is up to date.';
  const parts = [`Added ${result.created} due transaction${result.created === 1 ? '' : 's'}`];
  if (result.skipped > 0) parts.push(`${result.skipped} already recorded`);
  if (result.failed > 0) parts.push(`${result.failed} need attention`);
  return parts.join(' · ');
}

function frequencyLabel(value: Frequency) {
  if (value === 'daily') return 'Every day';
  if (value === 'weekly') return 'Every week';
  if (value === 'monthly') return 'Every month';
  return 'Every year';
}

function formatDateLabel(value: string, compact = false) {
  return parseLocalDate(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: compact ? undefined : 'numeric',
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
