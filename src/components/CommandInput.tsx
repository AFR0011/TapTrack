'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { parseCommands } from '@/parser/parseCommand';
import { InsufficientBalanceError, createTransactions } from '@/transactions/createTransaction';
import type { Category, TransactionDraft } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn, focusVisibleRing } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from 'sonner';

/** Tracks which preview index has an in-flight AI suggestion. */
type AISuggestions = Record<number, { categoryId: string; label: string } | null>;

async function fetchAISuggestion(
  title: string,
  transactionType: 'income' | 'expense',
  categories: Category[]
): Promise<{ categoryId: string } | null> {
  try {
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        transactionType,
        categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { categoryId: string | null };
    return data.categoryId ? { categoryId: data.categoryId } : null;
  } catch {
    return null;
  }
}

export default function CommandInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [previews, setPreviews] = useState<TransactionDraft[]>([]);
  const [aiOverrides, setAiOverrides] = useState<AISuggestions>({});
  const [aiLoading, setAiLoading] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const isDataLoading = categories === undefined || settings === undefined;
  const categoriesById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories]
  );

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      inputRef.current?.focus();
    }
  }, []);

  const handleSubmit = () => {
    if (!categories || !settings) return;

    const results = parseCommands(input, {
      categories,
      defaultMethod: settings.lastUsedMethod,
    });

    const failureMessages = results
      .map((r, i) => (!r.ok ? (results.length === 1 ? r.message : `Entry ${i + 1}: ${r.message}`) : null))
      .filter((message): message is string => message !== null);

    if (failureMessages.length > 0) {
      setPreviews([]);
      setAiOverrides({});
      setAiLoading(new Set());
      setErrors(failureMessages);
      return;
    }

    const drafts = results.flatMap((r) => (r.ok ? [r.transaction] : []));
    setPreviews(drafts);
    setAiOverrides({});
    setAiLoading(new Set());
    setErrors([]);

    if (settings?.aiCategorizationEnabled) {
      const loadingSet = new Set(drafts.map((_, i) => i));
      setAiLoading(loadingSet);

      drafts.forEach((draft, index) => {
        void fetchAISuggestion(draft.title, draft.type, categories).then((result) => {
          if (result) {
            const label = categoriesById.get(result.categoryId)?.name ?? result.categoryId;
            setAiOverrides((prev) => ({ ...prev, [index]: { categoryId: result.categoryId, label } }));
          }
          setAiLoading((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        });
      });
    }
  };

  const handleEditPreview = () => {
    setPreviews([]);
    setAiOverrides({});
    setAiLoading(new Set());
    setErrors([]);
  };

  const handleSave = async () => {
    if (previews.length === 0) return;

    // Apply AI overrides before saving
    const finalDrafts = previews.map((draft, i) => {
      const override = aiOverrides[i];
      return override ? { ...draft, categoryId: override.categoryId } : draft;
    });

    setSaving(true);
    try {
      await createTransactions(finalDrafts);
      const count = finalDrafts.length;
      toast.success(`Saved ${count} transaction${count === 1 ? '' : 's'}.`);
      setPreviews([]);
      setAiOverrides({});
      setAiLoading(new Set());
      setInput('');
      setErrors([]);
      inputRef.current?.focus();
    } catch (err) {
      setErrors([
        err instanceof InsufficientBalanceError
          ? `Balance check failed: ${err.message}`
          : 'Could not save transaction(s).',
      ]);
    } finally {
      setSaving(false);
    }
  };

  const isMulti = previews.length > 1;

  return (
    <section
      id="quick-log"
      aria-busy={isDataLoading || undefined}
      aria-label={isDataLoading ? 'Loading quick command' : undefined}
      className="rounded-2xl border border-subtle bg-surface p-5 ring-1 ring-accent/15"
    >
      {isDataLoading ? (
        <div className="flex flex-col gap-2 sm:flex-row" aria-hidden="true">
          <Skeleton className="h-12 min-h-12 flex-1 rounded-lg" />
          <Skeleton className="h-12 w-24 rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="-120 coffee cash"
            disabled={saving}
            aria-label="Quick transaction command"
            className={cn(
              'h-12 min-h-12 flex-1 rounded-lg border border-subtle px-4 text-base font-medium text-primary outline-none transition-all placeholder:text-muted focus-visible:border-accent md:text-sm',
              focusVisibleRing
            )}
          />
          <Button onClick={handleSubmit} disabled={saving}>
            Preview
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isDataLoading ? (
          <>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-32" />
          </>
        ) : (
          <>
        <p className="text-xs font-medium text-muted">Examples:</p>
        {['-120 coffee cash', '+20000 salary card'].map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setInput(example)}
            disabled={saving}
            className={cn(
              'min-h-11 rounded-full border border-subtle bg-surface-muted px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-primary disabled:opacity-60',
              focusVisibleRing
            )}
          >
            {example}
          </button>
        ))}
        {settings.aiCategorizationEnabled ? (
          <span className="rounded-full border border-ai-border bg-ai-muted px-2 py-0.5 text-xs font-semibold text-ai-text">
            AI on
          </span>
        ) : null}
          </>
        )}
      </div>
      {errors.length > 0 ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"
        >
          {errors.length === 1 ? (
            <p>{errors[0]}</p>
          ) : (
            <>
              <p>Fix {errors.length} entries before previewing:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errors.map((message, index) => (
                  <li key={`${index}-${message}`}>{message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      <AnimatePresence>
      {previews.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mt-4 rounded-xl border border-subtle bg-surface-muted p-4 transition-all"
        >
          <h3 className="mb-3 text-sm font-semibold text-primary">
            {isMulti ? `Preview (${previews.length} transactions)` : 'Preview'}
          </h3>

          <div className="flex flex-col gap-3">
            {previews.map((preview, index) => {
              const aiOverride = aiOverrides[index];
              const isAiLoading = aiLoading.has(index);
              const displayCategoryId = aiOverride?.categoryId ?? preview.categoryId;
              const displayCategoryName = categoriesById.get(displayCategoryId)?.name ?? displayCategoryId;

              return (
                <div
                  key={index}
                  className={`${isMulti ? 'rounded-lg border border-subtle bg-surface p-3' : ''}`}
                >
                  {isMulti && (
                    <p className="mb-2 text-xs font-medium text-muted">
                      {index + 1} of {previews.length}
                    </p>
                  )}
                  <div className="grid gap-2 text-sm md:grid-cols-3">
                    <PreviewItem label="Type" value={preview.type} />
                    <PreviewItem label="Amount" value={`${preview.amount} ${preview.currency}`} />
                    <PreviewItem label="Title" value={preview.title} />
                    <div>
                      <p className="text-xs font-medium text-muted">Category</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-primary">{displayCategoryName}</span>
                        {isAiLoading && (
                          <span className="animate-pulse rounded-full bg-ai-muted px-1.5 py-0.5 text-xs font-semibold text-ai">
                            AI…
                          </span>
                        )}
                        {aiOverride && !isAiLoading && (
                          <>
                            <span className="rounded-full bg-ai-muted px-1.5 py-0.5 text-xs font-semibold text-ai-text">
                              AI
                            </span>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="min-w-11 shrink-0"
                              aria-label={`Revert AI category for line ${index + 1}`}
                              onClick={() =>
                                setAiOverrides((prev) => {
                                  const next = { ...prev };
                                  delete next[index];
                                  return next;
                                })
                              }
                            >
                              Revert
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <PreviewItem label="Method" value={preview.method} />
                    <PreviewItem label="Date" value={preview.date} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="success" onClick={handleSave} disabled={saving} loading={saving}>
              {isMulti ? `Save All (${previews.length})` : 'Save'}
            </Button>
            <Button variant="secondary" onClick={handleEditPreview} disabled={saving}>
              Edit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPreviews([]);
                setAiOverrides({});
                setAiLoading(new Set());
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </section>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-semibold text-primary">{value}</p>
    </div>
  );
}
