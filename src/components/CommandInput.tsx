'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { parseCommand } from '@/parser/parseCommand';
import { InsufficientBalanceError, createTransaction } from '@/transactions/createTransaction';
import type { TransactionDraft } from '@/types';

export default function CommandInput() {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<TransactionDraft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID), []);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const handleSubmit = () => {
    const parsed = parseCommand(input, {
      categories,
      defaultMethod: settings?.lastUsedMethod,
    });

    if (parsed.ok) {
      setPreview(parsed.transaction);
      setError('');
    } else {
      setPreview(null);
      setError(parsed.message);
    }
  };

  const handleEditPreview = () => {
    setPreview(null);
    setError('');
  };

  const handleSave = async () => {
    if (!preview) return;

    setSaving(true);
    try {
      await createTransaction(preview);
      setPreview(null);
      setInput('');
      setError('');
    } catch (err) {
      setError(err instanceof InsufficientBalanceError ? err.message : 'Could not save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const previewCategory = preview ? categoriesById.get(preview.categoryId) : undefined;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-shadow hover:shadow-md">
      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Quick command</h2>
          <p className="text-sm text-slate-500">Examples: -120 coffee cash, +20000 salary card</p>
        </div>
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

      {preview && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all">
          <h3 className="mb-3 text-sm font-semibold text-slate-950">Preview</h3>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <PreviewItem label="Type" value={preview.type} />
            <PreviewItem label="Amount" value={`${preview.amount} ${preview.currency}`} />
            <PreviewItem label="Title" value={preview.title} />
            <PreviewItem label="Category" value={previewCategory?.name ?? preview.categoryId} />
            <PreviewItem label="Method" value={preview.method} />
            <PreviewItem label="Date" value={preview.date} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving' : 'Save'}
            </button>
            <button
              onClick={handleEditPreview}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
            >
              Edit
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
