'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ensureDatabaseSeeded } from '@/database';
import { createDueRecurringTransactions } from '@/recurring/recurringService';
import { pullUpdates, syncNow } from '@/sync/syncService';

const AUTO_SYNC_INTERVAL_MS = 60_000;

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let syncing = false;

    const runSync = async () => {
      if (syncing) return;
      syncing = true;

      try {
        await syncNow();
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unknown sync error');
      } finally {
        syncing = false;
      }
    };

    const bootstrap = async () => {
      try {
        // Pull remote rows before local seeding. Otherwise a fresh device can
        // create newer zero balances/default categories and block older real
        // remote records from being applied.
        await pullUpdates();
        await ensureDatabaseSeeded();
        await createDueRecurringTransactions();
        await runSync();
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unknown database error');
      }
    };

    void bootstrap();

    const handleOnline = () => {
      void runSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runSync();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (navigator.onLine !== false) {
        void runSync();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      {children}
      {error ? (
        <div className="fixed bottom-4 left-4 right-4 rounded border border-subtle bg-danger-muted p-3 text-sm text-danger shadow">
          Local database failed to initialize or sync: {error}
        </div>
      ) : null}
    </>
  );
}
