'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db } from '@/database';
import { createCustomCategory } from '@/categories/categoryService';
import { deleteCategory, updateCategory } from '@/budgets/budgetService';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
} from '@/categories/categoryVisuals';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn, focusVisibleRing } from '@/lib/cn';
import type { Category, TransactionType } from '@/types';

type EditorState = {
  category: Category | null;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
};

function emptyEditor(type: TransactionType): EditorState {
  return {
    category: null,
    name: '',
    type,
    icon: type === 'income' ? 'arrow-down' : 'circle',
    color: type === 'income' ? '#059669' : '#2563eb',
  };
}

export function CategoryManager() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const [type, setType] = useState<TransactionType>('expense');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [error, setError] = useState('');

  const visibleCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((category) => category.type === type)
        .sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    [categories, type]
  );

  if (!categories) {
    return (
      <section className="rounded-2xl border border-subtle bg-surface p-5" aria-busy="true">
        <div className="h-48 animate-pulse rounded-xl bg-surface-muted" aria-hidden="true" />
      </section>
    );
  }

  const openNew = () => {
    setError('');
    setEditor(emptyEditor(type));
  };

  const openEdit = (category: Category) => {
    setError('');
    setEditor({
      category,
      name: category.name,
      type: category.type,
      icon: category.icon ?? 'circle',
      color: category.color ?? '#475569',
    });
  };

  const save = async () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setError('Add a category name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editor.category) {
        await updateCategory({
          id: editor.category.id,
          name,
          type: editor.type,
          icon: editor.icon,
          color: editor.color,
        });
        toast.success('Category updated.');
      } else {
        await createCustomCategory({
          name,
          type: editor.type,
          icon: editor.icon,
          color: editor.color,
        });
        toast.success('Category added.');
      }
      setEditor(null);
    } catch {
      setError('This category could not be saved. Check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      toast.success('Category deleted.');
      if (editor?.category?.id === deleteTarget.id) setEditor(null);
    } catch {
      toast.error('This category could not be deleted. Try again.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">Categories</h2>
          <p className="mt-1 text-sm text-muted">Keep the list small enough that choosing a category stays effortless.</p>
        </div>
        {!editor ? (
          <Button type="button" onClick={openNew}>+ New category</Button>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-xl bg-surface-muted p-1" role="group" aria-label="Category type">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={type === option}
            onClick={() => {
              setType(option);
              setEditor(null);
              setError('');
            }}
            className={cn(
              'min-h-11 rounded-lg px-3 text-sm font-semibold capitalize transition-colors',
              focusVisibleRing,
              type === option ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'
            )}
          >
            {option === 'expense' ? 'Expenses' : 'Income'}
          </button>
        ))}
      </div>

      {editor ? (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-accent-muted/30 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {editor.category ? 'Edit category' : 'New category'}
              </p>
              <h3 className="mt-1 text-base font-semibold text-primary">
                {editor.name.trim() || 'Untitled category'}
              </h3>
            </div>
            <CategoryIcon icon={editor.icon} color={editor.color} className="h-11 w-11" />
          </div>

          <div className="mt-5 grid gap-4">
            <Field
              label="Name"
              value={editor.name}
              onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)}
              placeholder="Travel"
              error={error}
              maxLength={80}
            />

            {!editor.category?.isDefault ? (
              <fieldset>
                <legend className="text-sm font-medium text-secondary">Type</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['expense', 'income'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={editor.type === option}
                      onClick={() => setEditor((current) => current ? { ...current, type: option } : current)}
                      className={cn(
                        'min-h-11 rounded-lg border px-3 text-sm font-semibold capitalize',
                        focusVisibleRing,
                        editor.type === option
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-subtle bg-surface text-secondary hover:text-primary'
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <fieldset>
              <legend className="text-sm font-medium text-secondary">Icon</legend>
              <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-9">
                {CATEGORY_ICON_OPTIONS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={editor.icon === id}
                    onClick={() => setEditor((current) => current ? { ...current, icon: id } : current)}
                    className={cn(
                      'grid min-h-11 min-w-11 place-items-center rounded-xl border transition-colors',
                      focusVisibleRing,
                      editor.icon === id
                        ? 'border-accent bg-accent-muted ring-1 ring-accent/30'
                        : 'border-subtle bg-surface hover:border-accent/40'
                    )}
                  >
                    <CategoryIcon icon={id} color={editor.color} className="h-8 w-8 rounded-lg" />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-secondary">Color</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORY_COLOR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={editor.color === option.value}
                    onClick={() => setEditor((current) => current ? { ...current, color: option.value } : current)}
                    className={cn(
                      'grid h-11 w-11 place-items-center rounded-xl border bg-surface',
                      focusVisibleRing,
                      editor.color === option.value ? 'border-primary ring-2 ring-accent/25' : 'border-subtle'
                    )}
                  >
                    <span className="h-6 w-6 rounded-full" style={{ backgroundColor: option.value }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {editor.category && !editor.category.isDefault ? (
              <Button
                type="button"
                variant="dangerGhost"
                onClick={() => setDeleteTarget(editor.category)}
                disabled={saving}
              >
                Delete category
              </Button>
            ) : null}
            <div className="flex flex-1 justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditor(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void save()} loading={saving} disabled={saving}>
                {editor.category ? 'Save changes' : 'Create category'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">
        {visibleCategories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => openEdit(category)}
            className={cn(
              'flex min-h-16 w-full items-center gap-3 bg-surface-muted px-4 py-3 text-left transition-colors hover:bg-surface-raised',
              focusVisibleRing
            )}
          >
            <CategoryIcon icon={category.icon} color={category.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-primary">{category.name}</span>
              <span className="mt-0.5 block text-xs font-medium text-muted">
                {category.isDefault ? 'Built-in category' : 'Custom category'}
              </span>
            </span>
            <span className="text-lg text-muted" aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete category"
        message={`Delete "${deleteTarget?.name ?? ''}"? Existing transactions will move to ${deleteTarget?.type === 'income' ? 'Income' : 'Other'}, and any budget limits for this category will be removed.`}
        confirmLabel="Delete category"
        confirmVariant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
