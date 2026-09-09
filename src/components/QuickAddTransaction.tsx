'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AmbiguousLedgerOrderingError } from '@/balances/ledgerService';
import {
  resolveHistoricalOccurrenceAroundCheckpoint,
  type HistoricalOrderingRelation,
} from '@/balances/reconciliationService';
import { createCustomCategory } from '@/categories/categoryService';
import { useAICategorySuggestion } from '@/categories/useAICategorySuggestion';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { CategoryPicker } from '@/components/CategoryPicker';
import { useActiveCurrencies } from '@/currencies/useActiveCurrencies';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID, findCategoryForTransaction } from '@/defaultData';
import { formatLocalDate } from '@/dates';
import { parseAmountInput } from '@/format';
import { getSignedInEmail } from '@/lib/auth';
import { createTransaction, InsufficientBalanceError } from '@/transactions/createTransaction';
import type { Currency, Method, TransactionDraft, TransactionType } from '@/types';

export type QuickAddPrefill = {
  type?: TransactionType;
  amount?: string;
  title?: string;
  method?: Method;
  currency?: Currency;
  date?: string;
};

type PendingOrdering = { draft: TransactionDraft; checkpointId: string };
type FieldErrors = { amount?: string; title?: string };

export function QuickAddTransaction({
  prefill,
  onSaved,
}: {
  prefill?: QuickAddPrefill;
  onSaved?: () => void;
}) {
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const {
    currencies: activeCurrencies,
    defaultCurrency,
    loading: currenciesLoading,
  } = useActiveCurrencies();
  const amountRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [type, setType] = useState<TransactionType>(() => prefill?.type ?? 'expense');
  const [amount, setAmount] = useState(() => prefill?.amount ?? '');
  const [title, setTitle] = useState(() => prefill?.title ?? '');
  const [methodOverride, setMethodOverride] = useState<Method | null>(() => prefill?.method ?? null);
  const [currencyOverride, setCurrencyOverride] = useState<Currency | null>(() => prefill?.currency ?? null);
  const [date, setDate] = useState(() => prefill?.date ?? formatLocalDate(new Date()));
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryManuallyChosen, setCategoryManuallyChosen] = useState(false);
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState('');
  const [accountSignedIn, setAccountSignedIn] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
  const currency =
    currencyOverride && activeCurrencies.includes(currencyOverride)
      ? currencyOverride
      : defaultCurrency;
  const typedCategories = useMemo(
    () => (categories ?? []).filter((category) => category.type === type),
    [categories, type]
  );
  const inferredCategory = useMemo(
    () => findCategoryForTransaction(categories ?? [], type, title),
    [categories, title, type]
  );
  const aiMaster = Boolean(settings?.aiCategorizationEnabled && accountSignedIn);
  const aiAutoCategorize = settings?.aiAutoCategorizationEnabled ?? true;
  const aiRecommendNew = settings?.aiRecommendNewCategoriesEnabled ?? true;
  const suggestionKey = `${type}|${title.trim().toLowerCase()}`;
  const aiSuggestion = useAICategorySuggestion({
    title,
    type,
    categories: categories ?? [],
    enabled: aiMaster && (aiAutoCategorize || aiRecommendNew),
    recommendNewCategories: aiRecommendNew,
    blocked: categoryManuallyChosen || dismissedSuggestionKey === suggestionKey,
  });
  const manualCategoryValid = typedCategories.some((category) => category.id === categoryId);
  const aiCategoryValid =
    aiAutoCategorize &&
    aiSuggestion.kind === 'existing' &&
    typedCategories.some((category) => category.id === aiSuggestion.categoryId);
  const selectedCategoryId = manualCategoryValid
    ? categoryId
    : aiCategoryValid && aiSuggestion.categoryId
      ? aiSuggestion.categoryId
      : inferredCategory?.id ??
        typedCategories[0]?.id ??
        (type === 'income' ? 'cat-income' : 'cat-other');
  const today = formatLocalDate(new Date());
  const collapsedDateLabel = date === today ? 'Today' : date;
  const showNewCategorySuggestion =
    aiRecommendNew &&
    !categoryManuallyChosen &&
    dismissedSuggestionKey !== suggestionKey &&
    aiSuggestion.kind === 'new' &&
    aiSuggestion.newCategory;

  const resetAfterSave = () => {
    setAmount('');
    setTitle('');
    setNote('');
    setCategoryId('');
    setCategoryManuallyChosen(false);
    setDismissedSuggestionKey('');
    setDate(formatLocalDate(new Date()));
    setError('');
    setFieldErrors({});
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
        setError(
          'This transaction is on the same date as a balance check. Choose whether it happened before or after that balance was recorded.'
        );
      } else {
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

  const handleSave = async () => {
    const parsedAmount = parseAmountInput(amount);
    const trimmedTitle = title.trim();
    const nextFieldErrors: FieldErrors = {};
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      nextFieldErrors.amount = 'Enter an amount greater than zero.';
    }
    if (!trimmedTitle) nextFieldErrors.title = 'Add a short description.';

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError('');
      setPendingOrdering(null);
      requestAnimationFrame(() => {
        if (nextFieldErrors.amount) amountRef.current?.focus();
        else titleRef.current?.focus();
      });
      return;
    }

    setFieldErrors({});
    await persistDraft({
      type,
      amount: parsedAmount,
      currency,
      title: trimmedTitle,
      categoryId: selectedCategoryId,
      method,
      date,
      note: note.trim() || undefined,
    });
  };

  const createSuggestedCategory = async () => {
    if (!aiSuggestion.newCategory || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const category = await createCustomCategory(aiSuggestion.newCategory);
      setCategoryId(category.id);
      setCategoryManuallyChosen(true);
      toast.success(`${category.name} category created.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Category could not be created.');
    } finally {
      setCreatingCategory(false);
    }
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

  if (!categories || !settings || currenciesLoading) {
    return (
      <section className="rounded-2xl border border-subtle bg-surface p-5" aria-busy="true">
        <div className="h-36 animate-pulse rounded-xl bg-surface-muted" aria-hidden="true" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5 ring-1 ring-accent/15">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
        noValidate
      >
        <fieldset>
          <legend className="sr-only">Transaction type</legend>
          <div className="grid grid-cols-2 rounded-xl bg-surface-muted p-1">
            {(['expense', 'income'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setType(option);
                  setCategoryId('');
                  setCategoryManuallyChosen(false);
                  setDismissedSuggestionKey('');
                  setPendingOrdering(null);
                  setError('');
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
        </fieldset>

        <div className="mt-5">
          <label htmlFor="quick-add-amount" className="text-xs font-semibold text-muted">Amount</label>
          <div
            className={`mt-1 flex items-baseline gap-2 border-b pb-2 focus-within:border-accent ${
              fieldErrors.amount ? 'border-danger' : 'border-subtle'
            }`}
          >
            <span className="text-xl font-semibold text-secondary">{currency}</span>
            <input
              ref={amountRef}
              id="quick-add-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (fieldErrors.amount) {
                  setFieldErrors((current) => ({ ...current, amount: undefined }));
                }
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-invalid={fieldErrors.amount ? true : undefined}
              aria-describedby={fieldErrors.amount ? 'quick-add-amount-error' : undefined}
              className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tabular-nums text-primary outline-none placeholder:text-muted/50"
            />
          </div>
          {fieldErrors.amount ? (
            <p id="quick-add-amount-error" role="alert" className="mt-1.5 text-sm font-medium text-danger">
              {fieldErrors.amount}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <Field
            ref={titleRef}
            label="What was it?"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (fieldErrors.title) {
                setFieldErrors((current) => ({ ...current, title: undefined }));
              }
            }}
            error={fieldErrors.title}
            placeholder={type === 'expense' ? 'Coffee, groceries, rent…' : 'Salary, refund, freelance…'}
            autoComplete="off"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <CategoryPicker
              categories={typedCategories}
              value={selectedCategoryId}
              onChange={(nextCategoryId) => {
                setCategoryId(nextCategoryId);
                setCategoryManuallyChosen(true);
              }}
            />
            {showNewCategorySuggestion && aiSuggestion.newCategory ? (
              <div className="mt-2 rounded-xl border border-ai-border bg-ai-muted p-3">
                <div className="flex items-start gap-3">
                  <CategoryIcon
                    icon={aiSuggestion.newCategory.icon}
                    color={aiSuggestion.newCategory.color}
                    className="h-10 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ai-text">Suggested new category</p>
                    <p className="mt-0.5 text-sm font-semibold text-primary">{aiSuggestion.newCategory.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void createSuggestedCategory()}
                        loading={creatingCategory}
                        disabled={creatingCategory}
                      >
                        Create category
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDismissedSuggestionKey(suggestionKey)}
                      >
                        Not now
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-secondary">Paid with</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['card', 'cash'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMethodOverride(option)}
                  aria-pressed={method === option}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
                    method === option
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-subtle bg-surface text-secondary hover:text-primary'
                  }`}
                >
                  {option === 'card' ? 'Card' : 'Cash'}
                </button>
              ))}
            </div>
          </fieldset>
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
              onChange={(event) => setCurrencyOverride(event.target.value)}
              options={activeCurrencies.map((code) => ({ value: code, label: code }))}
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
        <div className="mt-5 flex justify-end border-t border-subtle pt-4">
          <Button
            type="submit"
            className="w-full sm:w-auto sm:min-w-36"
            loading={saving}
            disabled={saving}
          >
            Save {type}
          </Button>
        </div>
      </form>
    </section>
  );
}
