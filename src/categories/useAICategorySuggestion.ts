'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchAICategorySuggestion, type AICategorySuggestionStatus } from '@/categories/categorySuggestion';
import type { Category, TransactionType } from '@/types';

type SuggestionSnapshot = {
  key: string;
  categoryId: string | null;
  status: AICategorySuggestionStatus | 'loading';
};

export function useAICategorySuggestion({
  title,
  type,
  categories,
  enabled,
  blocked = false,
  delayMs = 450,
}: {
  title: string;
  type: TransactionType;
  categories: Category[];
  enabled: boolean;
  blocked?: boolean;
  delayMs?: number;
}) {
  const relevantCategoryKey = useMemo(
    () =>
      categories
        .filter((category) => category.type === type)
        .map((category) => `${category.id}:${category.name}:${category.updatedAt}`)
        .join('|'),
    [categories, type]
  );
  const trimmedTitle = title.trim();
  const requestKey = `${type}|${trimmedTitle.toLowerCase()}|${relevantCategoryKey}`;
  const active = enabled && !blocked && trimmedTitle.length >= 2;
  const [snapshot, setSnapshot] = useState<SuggestionSnapshot>({
    key: '',
    categoryId: null,
    status: 'none',
  });

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSnapshot({ key: requestKey, categoryId: null, status: 'loading' });
      void fetchAICategorySuggestion(trimmedTitle, type, categories, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setSnapshot({
          key: requestKey,
          categoryId: result.categoryId,
          status: result.status,
        });
      });
    }, delayMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, categories, delayMs, requestKey, trimmedTitle, type]);

  if (!active || snapshot.key !== requestKey) {
    return { categoryId: null, status: 'none' as const };
  }

  return { categoryId: snapshot.categoryId, status: snapshot.status };
}
