'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { parseCommands } from '@/parser/parseCommand';
import { InsufficientBalanceError, createTransactions } from '@/transactions/createTransaction';
import type { Category, TransactionDraft } from '@/types';

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
  const [input, setInput] = useState('');
  const [previews, setPreviews] = useState<TransactionDraft[]>([]);
  const [aiOverrides, setAiOverrides] = useState<AISuggestions>({});
  const [aiLoading, setAiLoading] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID), []);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const handleSubmit = () => {
    const results = parseCommands(input, {
      categories,
      defaultMethod: settings?.lastUsedMethod,
    });

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      setPreviews([]);
      setAiOverrides({});
      setAiLoading(new Set());
      if (results.length === 1) {
        setError(failures[0]!.ok === false ? failures[0]!.message : '');
      } else {
        const messages = results.map((r, i) => (!r.ok ? `Entry ${i + 1}: ${r.message}` : null)).filter(Boolean);
        setError(messages.join(' · '));
      }
      return;
    }

    const drafts = results.flatMap((r) => (r.ok ? [r.transaction] : []));
    setPreviews(drafts);
    setAiOverrides({});
    setAiLoading(new Set());
    setError('');

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
    setError('');
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
      setPreviews([]);
      setAiOverrides({});
      setAiLoading(new Set());
      setInput('');
      setError('');
    } catch (err) {
      setError(err instanceof InsufficientBalanceError ? err.message : 'Could not save transaction(s).');
    } finally {
      setSaving(false);
    }
  };

  const isMulti = previews.length > 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-shadow hover:shadow-md">
      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Quick command</h2>
          <p className="text-sm text-slate-500">
            Examples: -120 coffee cash, +20000 salary card, -250 dinner -500 lunch
          </p>
        </div>
        {settings?.aiCategorizationEnabled && (
          <span className="self-start rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-600 md:self-auto">
            AI categorization on
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="-120 coffee cash"
          disabled={saving}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-950 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100/50"
        />
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="min-h-11 rounded-lg bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-600 disabled:opacity-60"
        >
          Preview
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}

      <AnimatePresence>
      {previews.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-950">
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
                  className={`${isMulti ? 'rounded-lg border border-slate-200 bg-white p-3' : ''}`}
                >
                  {isMulti && (
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      {index + 1} of {previews.length}
                    </p>
                  )}
                  <div className="grid gap-2 text-sm md:grid-cols-3">
                    <PreviewItem label="Type" value={preview.type} />
                    <PreviewItem label="Amount" value={`${preview.amount} ${preview.currency}`} />
                    <PreviewItem label="Title" value={preview.title} />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Category</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-950">{displayCategoryName}</span>
                        {isAiLoading && (
                          <span className="animate-pulse rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-500">
                            AI…
                          </span>
                        )}
                        {aiOverride && !isAiLoading && (
                          <>
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-600">
                              AI
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setAiOverrides((prev) => {
                                  const next = { ...prev };
                                  delete next[index];
                                  return next;
                                })
                              }
                              className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                            >
                              revert
                            </button>
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
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : isMulti ? `Save All (${previews.length})` : 'Save'}
            </button>
            <button
              onClick={handleEditPreview}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
            >
              Edit
            </button>
            <button
              onClick={() => {
                setPreviews([]);
                setAiOverrides({});
                setAiLoading(new Set());
              }}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-100"
            >
              Cancel
            </button>
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
      <p className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
