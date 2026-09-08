'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { resolveHistoricalOccurrenceAroundCheckpoint, type HistoricalOrderingRelation } from '@/balances/reconciliationService';
import { fetchAICategorySuggestion } from '@/categories/categorySuggestion';
import { activeCurrenciesFromBalances } from '@/currencies/currencyCatalog';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { parseCommands } from '@/parser/parseCommand';
import { InsufficientBalanceError, createTransactions } from '@/transactions/createTransaction';
import { findHistoricalTransactionOrderingRequirements } from '@/transactions/historicalOrdering';
import type { TransactionDraft } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { getSignedInEmail } from '@/lib/auth';
import { toast } from 'sonner';

type AISuggestions = Record<number, { categoryId: string; label: string } | null>;
type OrderingChoice = { checkpointId: string; relation?: HistoricalOrderingRelation };
type OrderingChoices = Record<number, OrderingChoice>;

export default function CommandInput() {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [previews, setPreviews] = useState<TransactionDraft[]>([]);
  const [aiOverrides, setAiOverrides] = useState<AISuggestions>({});
  const [aiLoading, setAiLoading] = useState<Set<number>>(new Set());
  const [aiUnavailable, setAiUnavailable] = useState<Set<number>>(new Set());
  const [orderingChoices, setOrderingChoices] = useState<OrderingChoices>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [accountSignedIn, setAccountSignedIn] = useState(false);
  const categories = useLiveQuery(() => db.categories.toArray());
  const balances = useLiveQuery(() => db.balances.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const isDataLoading = categories === undefined || balances === undefined || settings === undefined;
  const activeCurrencies = useMemo(
    () => activeCurrenciesFromBalances(balances ?? [], settings?.defaultCurrency),
    [balances, settings?.defaultCurrency]
  );
  const categoriesById = useMemo(() => new Map((categories ?? []).map((category) => [category.id, category])), [categories]);

  useEffect(() => { if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus(); }, []);
  useEffect(() => { void getSignedInEmail().then((email) => setAccountSignedIn(Boolean(email))); }, []);

  const clearPreviewState = () => {
    setPreviews([]); setAiOverrides({}); setAiLoading(new Set()); setAiUnavailable(new Set()); setOrderingChoices({});
  };

  const handleSubmit = () => {
    if (!categories || !settings) return;
    const results = parseCommands(input, {
      categories,
      defaultMethod: settings.lastUsedMethod,
      defaultCurrency: settings.defaultCurrency,
      activeCurrencies,
    });
    const failureMessages = results.map((result, index) => !result.ok ? (results.length === 1 ? result.message : `Entry ${index + 1}: ${result.message}`) : null).filter((message): message is string => message !== null);
    if (failureMessages.length) { clearPreviewState(); setErrors(failureMessages); return; }

    const drafts = results.flatMap((result) => result.ok ? [result.transaction] : []);
    setPreviews(drafts); setAiOverrides({}); setAiLoading(new Set()); setAiUnavailable(new Set()); setOrderingChoices({}); setErrors([]);
    if (settings.aiCategorizationEnabled && accountSignedIn) {
      setAiLoading(new Set(drafts.map((_, index) => index)));
      drafts.forEach((draft, index) => {
        void fetchAICategorySuggestion(draft.title, draft.type, categories).then((result) => {
          const suggestedId = result.categoryId;
          if (result.status === 'suggested' && suggestedId) {
            setAiOverrides((current) => ({
              ...current,
              [index]: { categoryId: suggestedId, label: categoriesById.get(suggestedId)?.name ?? suggestedId },
            }));
          } else if (result.status === 'unavailable') {
            setAiUnavailable((current) => new Set(current).add(index));
          }
          setAiLoading((current) => { const next = new Set(current); next.delete(index); return next; });
        });
      });
    }
  };

  const handleSave = async () => {
    if (!previews.length) return;
    const draftsWithAI = previews.map((draft, index) => aiOverrides[index] ? { ...draft, categoryId: aiOverrides[index]!.categoryId } : draft);
    setSaving(true);
    try {
      const requirements = await findHistoricalTransactionOrderingRequirements(draftsWithAI, db);
      const requirementByIndex = new Map(requirements.map((requirement) => [requirement.index, requirement]));
      const nextChoices: OrderingChoices = {};
      let missingChoice = false;
      for (const requirement of requirements) {
        const existing = orderingChoices[requirement.index];
        nextChoices[requirement.index] = existing?.checkpointId === requirement.checkpoint.id ? existing : { checkpointId: requirement.checkpoint.id };
        if (!nextChoices[requirement.index]?.relation) missingChoice = true;
      }
      setOrderingChoices(nextChoices);
      if (missingChoice) { setErrors(['Choose whether each transaction on a balance-check date happened before or after that balance was recorded.']); return; }
      const finalDrafts = draftsWithAI.map((draft, index) => {
        const requirement = requirementByIndex.get(index);
        const relation = nextChoices[index]?.relation;
        return requirement && relation ? { ...draft, occurredAt: resolveHistoricalOccurrenceAroundCheckpoint(requirement.checkpoint, relation) } : draft;
      });
      await createTransactions(finalDrafts);
      toast.success(`Saved ${finalDrafts.length} transaction${finalDrafts.length === 1 ? '' : 's'}.`);
      clearPreviewState(); setInput(''); setErrors([]); inputRef.current?.focus();
    } catch (err) {
      setErrors([err instanceof InsufficientBalanceError ? err.message : 'Transactions could not be saved. Check the preview and try again.']);
    } finally { setSaving(false); }
  };

  const setOrderingRelation = (index: number, checkpointId: string, relation: HistoricalOrderingRelation) => setOrderingChoices((current) => ({ ...current, [index]: { checkpointId, relation } }));
  const isMulti = previews.length > 1;
  const aiActive = Boolean(settings?.aiCategorizationEnabled && accountSignedIn);

  return (
    <section id="quick-log" aria-busy={isDataLoading || undefined} className="rounded-2xl border border-subtle bg-surface p-5 ring-1 ring-accent/15">
      {isDataLoading ? (
        <div className="flex flex-col gap-2 sm:flex-row" aria-hidden="true"><Skeleton className="h-12 min-h-12 flex-1 rounded-lg" /><Skeleton className="h-12 w-24 rounded-lg" /></div>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`-120 coffee cash · uses ${settings?.defaultCurrency ?? 'TRY'} unless specified`}
            disabled={saving}
            aria-label="Transaction command"
            className={cn('h-12 min-h-12 flex-1 rounded-lg border border-subtle px-4 text-base font-medium text-primary outline-none transition-colors placeholder:text-muted focus-visible:border-accent md:text-sm', focusVisibleRing)}
          />
          <Button type="submit" disabled={saving}>Preview</Button>
        </form>
      )}
      {!isDataLoading ? <div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-xs font-medium text-muted">Examples:</p>{['-120 coffee cash', '+20000 salary card'].map((example) => <button key={example} type="button" onClick={() => setInput(example)} disabled={saving} className={cn('min-h-11 rounded-full border border-subtle bg-surface-muted px-2.5 py-1 text-xs font-medium text-secondary hover:bg-surface-raised hover:text-primary', focusVisibleRing)}>{example}</button>)}{aiActive ? <span className="rounded-full border border-ai-border bg-ai-muted px-2 py-0.5 text-xs font-semibold text-ai-text">Smart Categories on</span> : null}</div> : null}

      {errors.length ? <div role="alert" aria-live="polite" className="mt-3 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">{errors.length === 1 ? <p>{errors[0]}</p> : <ul className="list-disc space-y-1 pl-5">{errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>}</div> : null}

      <AnimatePresence>{previews.length > 0 ? <motion.div initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={reduceMotion ? { duration: 0 } : undefined} className="mt-4 rounded-xl border border-subtle bg-surface-muted p-4"><h3 className="mb-3 text-sm font-semibold text-primary">{isMulti ? `Preview (${previews.length} transactions)` : 'Preview'}</h3><div className="flex flex-col gap-3">{previews.map((preview, index) => {
        const aiOverride = aiOverrides[index];
        const displayCategoryId = aiOverride?.categoryId ?? preview.categoryId;
        const orderingChoice = orderingChoices[index];
        return <div key={index} className={isMulti ? 'rounded-lg border border-subtle bg-surface p-3' : ''}>{isMulti ? <p className="mb-2 text-xs font-medium text-muted">{index + 1} of {previews.length}</p> : null}<div className="grid gap-2 text-sm md:grid-cols-3"><PreviewItem label="Type" value={preview.type} /><PreviewItem label="Amount" value={`${preview.amount} ${preview.currency}`} /><PreviewItem label="Description" value={preview.title} /><div><p className="text-xs font-medium text-muted">Category</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="font-semibold text-primary">{categoriesById.get(displayCategoryId)?.name ?? displayCategoryId}</span>{aiLoading.has(index) ? <span className="animate-pulse rounded-full bg-ai-muted px-1.5 py-0.5 text-xs font-semibold text-ai-text">Finding category…</span> : null}{aiOverride && !aiLoading.has(index) ? <><span className="rounded-full bg-ai-muted px-1.5 py-0.5 text-xs font-semibold text-ai-text">Suggested</span><Button type="button" variant="secondary" size="sm" onClick={() => setAiOverrides((current) => { const next = { ...current }; delete next[index]; return next; })}>Use previous</Button></> : null}{aiUnavailable.has(index) && !aiOverride && !aiLoading.has(index) ? <span className="text-xs font-medium text-muted">Using the best available match</span> : null}</div></div><PreviewItem label="Method" value={preview.method} /><PreviewItem label="Date" value={preview.date} /></div>{orderingChoice ? <div className="mt-3 rounded-lg border border-accent bg-accent-muted/40 p-3"><p className="text-xs font-semibold text-secondary">Was this before or after the balance was checked?</p><div className="mt-2 flex gap-2"><Button type="button" size="sm" variant={orderingChoice.relation === 'before' ? 'primary' : 'secondary'} onClick={() => setOrderingRelation(index, orderingChoice.checkpointId, 'before')} disabled={saving}>Before</Button><Button type="button" size="sm" variant={orderingChoice.relation === 'after' ? 'primary' : 'secondary'} onClick={() => setOrderingRelation(index, orderingChoice.checkpointId, 'after')} disabled={saving}>After</Button></div></div> : null}</div>;
      })}</div><div className="mt-4 flex flex-wrap gap-2"><Button variant="success" onClick={() => void handleSave()} disabled={saving} loading={saving}>{isMulti ? `Save all (${previews.length})` : 'Save'}</Button><Button variant="secondary" onClick={() => { clearPreviewState(); setErrors([]); inputRef.current?.focus(); }} disabled={saving}>Edit command</Button><Button variant="ghost" onClick={clearPreviewState} disabled={saving}>Cancel</Button></div></motion.div> : null}</AnimatePresence>
    </section>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 font-semibold text-primary">{value}</p></div>; }
