'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ensureDatabaseSeeded } from '@/database';
import {
  createDueRecurringTransactions,
  resolveRecurringOccurrenceOrdering,
  type RecurringOrderingConflict,
} from '@/recurring/recurringService';
import {
  RecurringSyncCycleError,
  runRecurringSyncCycle,
} from '@/recurring/recurringSyncCycle';
import { syncNow } from '@/sync/syncService';
import { Button } from '@/components/ui/Button';

const AUTO_SYNC_INTERVAL_MS = 60_000;

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [localError, setLocalError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [recurringConflicts, setRecurringConflicts] = useState<RecurringOrderingConflict[]>([]);
  const [resolvingConflict, setResolvingConflict] = useState('');
  const cycleRunning = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const runCycle = useCallback(async () => {
    if (cycleRunning.current) return;
    cycleRunning.current = true;

    try {
      const result = await runRecurringSyncCycle({
        online: navigator.onLine !== false,
        sync: () => syncNow(),
        createDue: () => createDueRecurringTransactions(),
      });
      if (!mounted.current) return;
      setRecurringConflicts(result.conflicts);
      setLocalError('');
      setSyncError('');
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof RecurringSyncCycleError && error.phase === 'recurring') {
        setLocalError(error.message || 'Unknown database error');
      } else {
        setSyncError(error instanceof Error ? error.message : 'Unknown sync error');
      }
    } finally {
      cycleRunning.current = false;
    }
  }, []);

  useEffect(() => {
    let ready = false;

    const bootstrap = async () => {
      try {
        await ensureDatabaseSeeded();
        ready = true;
        await runCycle();
      } catch (error: unknown) {
        if (!mounted.current) return;
        setLocalError(error instanceof Error ? error.message : 'Unknown database error');
      }
    };

    void bootstrap();

    const triggerCycle = () => {
      if (ready) void runCycle();
    };

    window.addEventListener('online', triggerCycle);
    window.addEventListener('focus', triggerCycle);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') triggerCycle();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (ready && document.visibilityState === 'visible') void runCycle();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', triggerCycle);
      window.removeEventListener('focus', triggerCycle);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [runCycle]);

  const resolveRecurringConflict = async (
    conflict: RecurringOrderingConflict,
    relation: 'before' | 'after'
  ) => {
    const conflictKey = `${conflict.recurringId}:${conflict.occurrenceDate}`;
    if (resolvingConflict) return;
    setResolvingConflict(conflictKey);
    try {
      await resolveRecurringOccurrenceOrdering(conflict, relation);
      if (!mounted.current) return;
      setRecurringConflicts((current) =>
        current.filter(
          (item) =>
            item.recurringId !== conflict.recurringId ||
            item.occurrenceDate !== conflict.occurrenceDate
        )
      );
      setLocalError('');
      await runCycle();
    } catch (error) {
      if (mounted.current) {
        setLocalError(
          error instanceof Error
            ? error.message
            : 'Recurring transaction ordering could not be resolved.'
        );
      }
    } finally {
      if (mounted.current) setResolvingConflict('');
    }
  };

  const firstConflict = recurringConflicts[0] ?? null;
  const conflictKey = firstConflict
    ? `${firstConflict.recurringId}:${firstConflict.occurrenceDate}`
    : '';

  return (
    <>
      {children}
      {firstConflict ? (
        <div
          role="alert"
          className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-warning/30 bg-surface p-4 text-sm text-secondary shadow-lg sm:left-auto sm:max-w-lg"
        >
          <p className="font-semibold text-primary">Recurring transaction needs ordering</p>
          <p className="mt-1 leading-5">
            “{firstConflict.title}” is due on {firstConflict.occurrenceDate}, the same date as a balance check.
            Choose whether it happened before or after that recorded balance so TapTrack does not guess.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={resolvingConflict === conflictKey}
              disabled={Boolean(resolvingConflict)}
              onClick={() => void resolveRecurringConflict(firstConflict, 'before')}
            >
              Before balance check
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={Boolean(resolvingConflict)}
              onClick={() => void resolveRecurringConflict(firstConflict, 'after')}
            >
              After balance check
            </Button>
          </div>
          {recurringConflicts.length > 1 ? (
            <p className="mt-2 text-xs text-muted">
              {recurringConflicts.length - 1} more recurring occurrence{recurringConflicts.length === 2 ? '' : 's'} will follow.
            </p>
          ) : null}
        </div>
      ) : localError ? (
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
