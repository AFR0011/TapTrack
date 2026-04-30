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
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="-120 coffee cash"
          disabled={saving}
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Add
        </button>
      </div>
      {error && <p className="text-red-500 mt-2">{error}</p>}

      {preview && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
          <h3 className="font-semibold mb-2">Preview</h3>
          <div className="space-y-1">
            <p>Type: {preview.type}</p>
            <p>Amount: {preview.amount} {preview.currency}</p>
            <p>Title: {preview.title}</p>
            <p>Category: {previewCategory?.name ?? preview.categoryId}</p>
            <p>Method: {preview.method}</p>
            <p>Date: {preview.date}</p>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-green-500 text-white rounded-lg disabled:opacity-60"
            >
              {saving ? 'Saving' : 'Save'}
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={saving}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
