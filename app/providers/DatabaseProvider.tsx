'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ensureDatabaseSeeded } from '@/database';
import { createDueRecurringTransactions } from '@/recurring/recurringService';
import { processRetryQueue, pullUpdates } from '@/sync/syncService';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    ensureDatabaseSeeded()
      .then(() => createDueRecurringTransactions())
      .then(() => pullUpdates())
      .then(() => processRetryQueue())
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unknown database error');
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      {children}
      {error ? (
        <div className="fixed bottom-4 left-4 right-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow">
          Local database failed to initialize: {error}
        </div>
      ) : null}
    </>
  );
}
