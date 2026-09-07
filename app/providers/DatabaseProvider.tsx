'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ensureDatabaseSeeded } from '@/database';
import { createDueRecurringTransactions } from '@/recurring/recurringService';
import { syncNow } from '@/sync/syncService';

const AUTO_SYNC_INTERVAL_MS = 60_000;

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [localError, setLocalError] = useState('');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    let mounted = true;
    let syncing = false;

    const runSync = async () => {
      if (syncing) return;
      if (navigator.onLine === false) return;
      syncing = true;

      try {
        await syncNow();
        if (mounted) setSyncError('');
      } catch (err: unknown) {
        if (!mounted) return;
        setSyncError(err instanceof Error ? err.message : 'Unknown sync error');
      } finally {
        syncing = false;
      }
    };

    const bootstrap = async () => {
      try {
        await ensureDatabaseSeeded();
        await createDueRecurringTransactions();
        await runSync();
      } catch (err: unknown) {
        if (!mounted) return;
        setLocalError(err instanceof Error ? err.message : 'Unknown database error');
      }
    };

    void bootstrap();

    const handleOnline = () => {
      void runSync();
    };
    const handleFocus = () => {
      void runSync();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void runSync();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        void runSync();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      {children}
      {localError ? (
        <div className="fixed bottom-4 left-4 right-4 rounded border border-subtle bg-danger-muted p-3 text-sm text-danger shadow">
          Local database failed to initialize: {localError}
        </div>
      ) : syncError ? (
        <div className="fixed bottom-4 left-4 right-4 rounded border border-subtle bg-surface p-3 text-sm text-secondary shadow">
          Optional cloud sync is unavailable: {syncError}
        </div>
      ) : null}
    </>
  );
}
