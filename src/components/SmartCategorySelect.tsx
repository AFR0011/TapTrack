'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { fetchAICategorySuggestion } from '@/categories/categorySuggestion';
import { useAICategorySuggestion } from '@/categories/useAICategorySuggestion';
import { SelectField } from '@/components/ui/SelectField';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getSignedInEmail } from '@/lib/auth';
import type { Category, TransactionType } from '@/types';

export function SmartCategorySelect({
  categories,
  type,
  title,
  value,
  onChange,
  autoApply,
}: {
  categories: Category[];
  type: TransactionType;
  title: string;
  value: string;
  onChange: (categoryId: string) => void;
  autoApply: boolean;
}) {
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const [accountSignedIn, setAccountSignedIn] = useState(false);
  const [manualChoice, setManualChoice] = useState<{ type: TransactionType; chosen: boolean }>({
    type,
    chosen: false,
  });
  const [manualSuggestionState, setManualSuggestionState] = useState<
    'idle' | 'loading' | 'suggested' | 'unavailable'
  >('idle');
  const manualChoiceActive = manualChoice.type === type && manualChoice.chosen;
  const aiActive = Boolean(settings?.aiCategorizationEnabled && accountSignedIn);
  const automaticSuggestion = useAICategorySuggestion({
    title,
    type,
    categories,
    enabled: aiActive && autoApply,
    blocked: manualChoiceActive,
  });

  useEffect(() => {
    let active = true;
    void getSignedInEmail().then((email) => {
      if (active) setAccountSignedIn(Boolean(email));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      !autoApply ||
      manualChoiceActive ||
      automaticSuggestion.status !== 'suggested' ||
      !automaticSuggestion.categoryId ||
      automaticSuggestion.categoryId === value
    ) {
      return;
    }
    onChange(automaticSuggestion.categoryId);
  }, [
    autoApply,
    automaticSuggestion.categoryId,
    automaticSuggestion.status,
    manualChoiceActive,
    onChange,
    value,
  ]);

  const requestSuggestion = async () => {
    if (!aiActive || !title.trim()) return;
    setManualSuggestionState('loading');
    const result = await fetchAICategorySuggestion(title, type, categories);
    if (result.status === 'suggested' && result.categoryId) {
      onChange(result.categoryId);
      setManualSuggestionState('suggested');
      return;
    }
    setManualSuggestionState(result.status === 'unavailable' ? 'unavailable' : 'idle');
  };

  return (
    <div className="min-w-0">
      <SelectField
        label="Category"
        value={value}
        onChange={(event) => {
          setManualChoice({ type, chosen: true });
          setManualSuggestionState('idle');
          onChange(event.target.value);
        }}
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
      />
      {autoApply && !manualChoiceActive && automaticSuggestion.status === 'loading' ? (
        <p className="mt-1.5 text-xs font-medium text-ai-text">✦ Finding a smart category…</p>
      ) : autoApply && !manualChoiceActive && automaticSuggestion.status === 'suggested' ? (
        <p className="mt-1.5 text-xs font-semibold text-ai-text">✦ AI suggestion</p>
      ) : autoApply && !manualChoiceActive && automaticSuggestion.status === 'unavailable' ? (
        <p className="mt-1.5 text-xs font-medium text-muted">Using the local suggestion for now.</p>
      ) : !autoApply && aiActive ? (
        <div className="mt-1.5 flex min-h-7 items-center gap-2">
          <button
            type="button"
            onClick={() => void requestSuggestion()}
            disabled={manualSuggestionState === 'loading' || !title.trim()}
            className="text-xs font-semibold text-ai-text hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {manualSuggestionState === 'loading' ? 'Finding suggestion…' : '✦ Suggest category'}
          </button>
          {manualSuggestionState === 'suggested' ? (
            <span className="text-xs font-semibold text-ai-text">AI</span>
          ) : manualSuggestionState === 'unavailable' ? (
            <span className="text-xs font-medium text-muted">Unavailable</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
