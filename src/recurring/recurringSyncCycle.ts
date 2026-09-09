import type { DueRecurringResult } from '@/recurring/recurringService';

export type RecurringSyncCycleDependencies = {
  online: boolean;
  sync: () => Promise<void>;
  createDue: () => Promise<DueRecurringResult>;
};

export class RecurringSyncCycleError extends Error {
  constructor(
    readonly phase: 'sync' | 'recurring',
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'RecurringSyncCycleError';
  }
}

/**
 * Online recurring generation is deliberately bracketed by successful syncs.
 * If the pre-sync fails, no stale local template can manufacture an occurrence
 * that a later successful push would publish before learning about remote edits.
 * Offline startup still generates from the local ledger immediately.
 */
export async function runRecurringSyncCycle({
  online,
  sync,
  createDue,
}: RecurringSyncCycleDependencies): Promise<DueRecurringResult> {
  if (online) {
    try {
      await sync();
    } catch (error) {
      throw new RecurringSyncCycleError('sync', error);
    }
  }

  let result: DueRecurringResult;
  try {
    result = await createDue();
  } catch (error) {
    throw new RecurringSyncCycleError('recurring', error);
  }

  if (online) {
    try {
      await sync();
    } catch (error) {
      throw new RecurringSyncCycleError('sync', error);
    }
  }
  return result;
}
