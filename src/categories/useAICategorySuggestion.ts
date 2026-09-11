'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchAICategorySuggestion,
  type AICategorySuggestionResult,
} from '@/categories/categorySuggestion';
import type { Category, TransactionType } from '@/types';

type SuggestionSnapshot = Omit<AICategorySuggestionResult, 'status'> & {
  key: string;
  status: AICategorySuggestionResult['status'] | 'loading';
};

const EMPTY: SuggestionSnapshot = {
  key: '',
  kind: 'none',
  categoryId: null,
  newCategory: null,
  confidence: null,
  status: 'none',
};

export function useAICategorySuggestion({
  title,
  type,
  categories,
  enabled,
  recommendNewCategories = false,
  blocked = false,
  delayMs = 180,
}: {
  title: string;
  type: TransactionType;
  categories: Category[];
  enabled: boolean;
  recommendNewCategories?: boolean;
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
  const requestKey = `${type}|${trimmedTitle.toLowerCase()}|${recommendNewCategories ? 'new' : 'existing'}|${relevantCategoryKey}`;
  const active = enabled && !blocked && trimmedTitle.length >= 2;
  const [snapshot, setSnapshot] = useState<SuggestionSnapshot>(EMPTY);

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSnapshot({ ...EMPTY, key: requestKey, status: 'loading' });
      void fetchAICategorySuggestion(trimmedTitle, type, categories, {
        recommendNewCategories,
        signal: controller.signal,
      }).then((result) => {
        if (controller.signal.aborted) return;
        setSnapshot({ key: requestKey, ...result });
      });
    }, delayMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, categories, delayMs, recommendNewCategories, requestKey, trimmedTitle, type]);

  if (!active || snapshot.key !== requestKey) return EMPTY;
  return snapshot;
}
