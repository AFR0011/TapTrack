'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import { useAICategorySuggestion } from '@/categories/useAICategorySuggestion';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID, findCategoryForTransaction } from '@/defaultData';
import { formatLocalDate } from '@/dates';
import { parseAmountInput } from '@/format';
import { getSignedInEmail } from '@/lib/auth';
import {
  createTransaction,
  InsufficientBalanceError,
} from '@/transactions/createTransaction';
import {
  SUPPORTED_CURRENCIES,
  type Currency,
  type Method,
  type TransactionDraft,
  type TransactionType,
} from '@/types';

export type QuickAddPrefill = {
  type?: TransactionType;
  amount?: string;
  title?: string;
  method?: Method;
  currency?: Currency;
  date?: string;
};

type PendingOrdering = {
  draft: TransactionDraft;
  checkpointId: string;
};

export function QuickAddTransaction({
  prefill,
  onSaved,
}: {
  prefill?: QuickAddPrefill;
  onSaved?: () => void;
}) {
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const [type, setType] = useState<TransactionType>(() => prefill?.type ?? 'expense');
  const [amount, setAmount] = useState(() => prefill?.amount ?? '');
  const [title, setTitle] = useState(() => prefill?.title ?? '');
  const [methodOverride, setMethodOverride] = useState<Method | null>(() => prefill?.method ?? null);
  const [currency, setCurrency] = useState<Currency>(() => prefill?.currency ?? 'TRY');
  const [date, setDate] = useState(() => prefill?.date ?? formatLocalDate(new Date()));
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryManuallyChosen, setCategoryManuallyChosen] = useState(false);
  const [accountSignedIn, setAccountSignedIn] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingOrdering, setPendingOrdering] = useState<PendingOrdering | null>(null);

  useEffect(() => {
    let active = true;
    void getSignedInEmail().then((email) => {
      if (active) setAccountSignedIn(Boolean(email));
    });
    return () => {
      active = false;
    };
  }, []);

  const method = methodOverride ?? settings?.lastUsedMethod ?? 'card';
  const typedCategories = useMemo(
    () => (categories ?? []).filter((category) => category.type === type),
    [categories, type]
  );
  const inferredCategory = useMemo(
    () => findCategoryForTransaction(categories ?? [], type, title),
    [categories, title, type]
  );
  const aiActive = Boolean(settings?.aiCategorizationEnabled && accountSignedIn);
  const aiSuggestion = useAICategorySuggestion({
    title,
    type,
    categories: categories ?? [],
    enabled: aiActive,
    blocked: categoryManuallyChosen,
  });
  const manualCategoryValid = typedCategories.some((category) => category.id === categoryId);
  const aiCategoryValid = typedCategories.some(
    (category) => category.id === aiSuggestion.categoryId
  );
  const selectedCategoryId = manualCategoryValid
    ? categoryId
    : aiCategoryValid && aiSuggestion.categoryId
      ? aiSuggestion.categoryId
      : inferredCategory?.id ??
        typedCategories[0]?.id ??
        (type === 'income' ? 'cat-income' : 'cat-other');
  const today = formatLocalDate(new Date());
  const collapsedDateLabel = date === today ? 'Today' : date;

  const resetAfterSave = () => {
    setAmount('');
    setTitle('');
    setNote('');
    setCategoryId('');
    setCategoryManuallyChosen(false);
    setDate(formatLocalDate(new Date()));
    setError('');
    setPendingOrdering(null);
  };

  const persistDraft = async (draft: TransactionDraft) => {
    setSaving(true);
    setError('');
    try {
      await createTransaction(draft);
      toast.success('Transaction saved.');
      resetAfterSave();
      onSaved?.();
    } catch (err) {
      if (err instanceof AmbiguousLedgerOrderingError) {
        setPendingOrdering({ draft, checkpointId: err.checkpointId });
        setError('This transaction is on the same date as a balance reconciliation. Choose when it happened.');
      } else {
        setError(
          err instanceof InsufficientBalanceError
            ? err.message
            : 'Transaction could not be saved.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseAmountInput(amount);
    const trimmedTitle = title.trim();

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    if (!trimmedTitle) {
      setError('Add a short title for this transaction.');
      return;
    }

    const draft: TransactionDraft = {
      type,
      amount: parsedAmount,
      currency,
      title: trimmedTitle,
      categoryId: selectedCategoryId,
      method,
      date,
      note: note.trim() || undefined,
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

  if (!categories || !settings) {
    return (
      <section className="rounded-2xl border border-subtle bg-surface p-5" aria-busy="true">
        <div className="h-36 animate-pulse rounded-xl bg-surface-muted" aria-hidden="true" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5 ring-1 ring-accent/15">
      <div className="grid grid-cols-2 rounded-xl bg-surface-muted p-1" aria-label="Transaction type">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setType(option);
              setCategoryId('');
              setCategoryManuallyChosen(false);
              setPendingOrdering(null);
            }}
            aria-pressed={type === option}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
              type === option
                ? 'bg-surface text-primary shadow-sm'
                : 'text-muted hover:text-primary'
            }`}
          >
            {option === 'expense' ? 'Expense' : 'Income'}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <label htmlFor="quick-add-amount" className="text-xs font-semibold text-muted">
          Amount
        </label>
        <div className="mt-1 flex items-baseline gap-2 border-b border-subtle pb-2 focus-within:border-accent">
          <span className="text-xl font-semibold text-secondary">{currency}</span>
          <input
            id="quick-add-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tabular-nums text-primary outline-none placeholder:text-muted/50"
          />
        </div>
      </div>

      <div className="mt-4">
        <Field
          label="What was it?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={type === 'expense' ? 'Coffee, groceries, rent…' : 'Salary, refund, freelance…'}
          autoComplete="off"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <SelectField
            label="Category"
            value={selectedCategoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setCategoryManuallyChosen(true);
            }}
            options={typedCategories.map((category) => ({ value: category.id, label: category.name }))}
          />
          {!categoryManuallyChosen && aiSuggestion.status === 'loading' ? (
            <p className="mt-1.5 text-xs font-medium text-ai-text">✦ Finding a smart category…</p>
          ) : !categoryManuallyChosen && aiSuggestion.status === 'suggested' && aiCategoryValid ? (
            <p className="mt-1.5 text-xs font-semibold text-ai-text">✦ AI suggestion</p>
          ) : !categoryManuallyChosen && aiSuggestion.status === 'unavailable' ? (
            <p className="mt-1.5 text-xs font-medium text-muted">Using the local suggestion for now.</p>
          ) : null}
        </div>
        <div>
          <p className="text-sm font-medium text-secondary">Paid with</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(['card', 'cash'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMethodOverride(option)}
                aria-pressed={method === option}
                className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                  method === option
                    ? 'border-accent bg-accent-muted text-accent'
                    : 'border-subtle bg-surface text-secondary hover:text-primary'
                }`}
              >
                {option === 'card' ? 'Card' : 'Cash'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((current) => !current)}
        className="mt-4 flex min-h-11 w-full items-center text-left text-sm font-semibold text-accent hover:underline"
        aria-expanded={showDetails}
      >
        {showDetails ? 'Hide details' : `${collapsedDateLabel} · ${currency} · Add details`}
      </button>

      {showDetails ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
            options={SUPPORTED_CURRENCIES}
          />
          <Field
            label="Date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
          <div className="sm:col-span-2">
            <Field
              label="Note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"
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

      <div className="mt-5 flex justify-end border-t border-subtle pt-4">
        <Button
          type="button"
          className="w-full sm:w-auto sm:min-w-36"
          onClick={() => void handleSave()}
          loading={saving}
          disabled={saving}
        >
          Save {type}
        </Button>
      </div>
    </section>
  );
}
