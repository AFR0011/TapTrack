'use client';

import { useState, type ReactNode } from 'react';
import TransactionsWorkspaceB004 from './TransactionsWorkspaceB004';
import TransactionsHistoryWorkspace from './TransactionsHistoryWorkspace';
import { cn, focusVisibleRing } from '@/lib/cn';

type TransactionView = 'month' | 'history';

export default function TransactionsWorkspace() {
  const [view, setView] = useState<TransactionView>('month');

  return (
    <div className="space-y-4">
      <div className="flex justify-start">
        <div
          className="inline-flex rounded-xl border border-subtle bg-surface-muted p-1"
          role="group"
          aria-label="Transaction date scope"
        >
          <ViewButton active={view === 'month'} onClick={() => setView('month')}>
            Month
          </ViewButton>
          <ViewButton active={view === 'history'} onClick={() => setView('history')}>
            All history
          </ViewButton>
        </div>
      </div>

      {view === 'month' ? <TransactionsWorkspaceB004 /> : <TransactionsHistoryWorkspace />}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors',
        focusVisibleRing,
        active ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}
