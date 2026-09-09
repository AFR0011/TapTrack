'use client';

import { useRef } from 'react';
import type { Category } from '@/types';
import { CategoryIcon } from '@/categories/categoryVisuals';
import { cn, focusVisibleRing } from '@/lib/cn';

export function CategoryPicker({
  categories,
  value,
  onChange,
  label = 'Category',
  disabled = false,
}: {
  categories: Category[];
  value: string;
  onChange: (categoryId: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const selected = categories.find((category) => category.id === value) ?? categories[0];

  return (
    <div className="min-w-0">
      <span className="text-sm font-medium text-secondary">{label}</span>
      <details
        ref={detailsRef}
        className="group relative mt-1"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && detailsRef.current?.open) {
            event.preventDefault();
            detailsRef.current.open = false;
            detailsRef.current.querySelector('summary')?.focus();
          }
        }}
      >
        <summary
          aria-disabled={disabled || undefined}
          onClick={(event) => {
            if (disabled) event.preventDefault();
          }}
          className={cn(
            'flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg border border-subtle bg-surface px-3 py-2 text-left transition-colors select-none hover:border-accent/50 [&::-webkit-details-marker]:hidden',
            disabled && 'cursor-not-allowed opacity-50',
            focusVisibleRing
          )}
        >
          {selected ? (
            <>
              <CategoryIcon icon={selected.icon} color={selected.color} className="h-8 w-8 rounded-lg" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{selected.name}</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-sm font-medium text-muted">No categories available</span>
          )}
          <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
        </summary>

        {!disabled && categories.length > 0 ? (
          <div
            role="group"
            aria-label={`${label} options`}
            className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-40 max-h-72 overflow-y-auto rounded-xl border border-subtle bg-surface p-1.5 shadow-[var(--shadow-overlay)]"
          >
            {categories.map((category) => {
              const active = category.id === selected?.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onChange(category.id);
                    if (detailsRef.current) detailsRef.current.open = false;
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    focusVisibleRing,
                    active ? 'bg-accent-muted' : 'hover:bg-surface-muted'
                  )}
                >
                  <CategoryIcon icon={category.icon} color={category.color} className="h-8 w-8 rounded-lg" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{category.name}</span>
                  {active ? <span className="text-sm font-bold text-accent" aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </details>
    </div>
  );
}
