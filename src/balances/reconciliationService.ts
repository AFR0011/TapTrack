import { db, ensureDatabaseSeeded, type RavelDatabase } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { formatLocalDate, getCurrentMonth } from '@/dates';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import { resolveActiveCurrencies } from '@/currencies/activeCurrencySelection';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';
import type { Balance, BalanceCheckpoint, Settings } from '@/types';

export type ReconciliationObservedAmounts = Record<string, number>;

export type MonthlyReconciliationState = {
  month: string;
  required: boolean;
  balances: Balance[];
  completedBalanceIds: string[];
};

export type HistoricalOrderingRelation = 'before' | 'after';

export class InvalidReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReconciliationError';
  }
}

async function getMonthCompletionCheckpoints(
  month: string,
  database: RavelDatabase
): Promise<BalanceCheckpoint[]> {
  return database.balanceCheckpoints
    .filter(
      (checkpoint) =>
        checkpoint.month === month ||
        (checkpoint.kind === 'opening' && checkpoint.date.startsWith(month))
    )
    .toArray();
}

function getActiveBalances(settings: Settings, balances: Balance[]): Balance[] {
  const activeCurrencies = new Set(resolveActiveCurrencies(settings, balances));
  return balances.filter((balance) => activeCurrencies.has(balance.currency));
}

/**
 * Pure ledger read used by live-query observers. Database bootstrap/seeding must
 * happen before this function is observed; doing writes from a Dexie live query
 * can inherit its read-only transaction and fail with ReadOnlyError.
 */
export async function getMonthlyReconciliationState(
  month = getCurrentMonth(),
  database: RavelDatabase = db
): Promise<MonthlyReconciliationState> {
  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  const allBalances = await database.balances.toArray();
  const balances = settings ? getActiveBalances(settings, allBalances) : allBalances;
  if (!settings?.setupCompleted) {
    return { month, required: false, balances, completedBalanceIds: [] };
  }

  const checkpoints = await getMonthCompletionCheckpoints(month, database);
  const activeBalanceIds = new Set(balances.map((balance) => balance.id));
  const completedBalanceIds = [
    ...new Set(
      checkpoints
        .map((checkpoint) => checkpoint.balanceId)
        .filter((balanceId) => activeBalanceIds.has(balanceId))
    ),
  ];
  const completed = new Set(completedBalanceIds);

  return {
    month,
    required: balances.length > 0 && balances.some((balance) => !completed.has(balance.id)),
    balances,
    completedBalanceIds,
  };
}

/**
 * Records absolute observations for active balances that have not already been
 * confirmed in this calendar month. Opening checkpoints created by a newly
 * activated currency count only for those new balance buckets; they no longer
 * block reconciliation of the older buckets. Archived currencies are excluded.
 */
export async function reconcileCurrentMonth(
  observedAmounts: ReconciliationObservedAmounts,
  database: RavelDatabase = db,
  nowDate = new Date()
): Promise<BalanceCheckpoint[]> {
  await ensureDatabaseSeeded(database);

  const settings = await database.settings.get(DEFAULT_SETTINGS_ID);
  if (!settings?.setupCompleted) {
    throw new InvalidReconciliationError('Complete initial setup before reconciling balances.');
  }

  const month = getCurrentMonth(nowDate);
  const date = formatLocalDate(nowDate);
  const effectiveAt = nowDate.toISOString();
  const allBalances = await database.balances.toArray();
  const balances = getActiveBalances(settings, allBalances);
  if (balances.length === 0) {
    throw new InvalidReconciliationError('No active balances are available to reconcile.');
  }

  const completionCheckpoints = await getMonthCompletionCheckpoints(month, database);
  const completed = new Set(completionCheckpoints.map((checkpoint) => checkpoint.balanceId));
  const pendingBalances = balances.filter((balance) => !completed.has(balance.id));
  if (pendingBalances.length === 0) {
    throw new InvalidReconciliationError('This month has already been reconciled.');
  }

  for (const balance of pendingBalances) {
    const observed = observedAmounts[balance.id];
    if (typeof observed !== 'number' || !Number.isFinite(observed) || observed < 0) {
      throw new InvalidReconciliationError(
        `Enter a valid non-negative observed balance for ${balance.currency} ${balance.method}.`
      );
    }
  }

  const checkpoints: BalanceCheckpoint[] = pendingBalances.map((balance) => {
    const observedAmount = observedAmounts[balance.id]!;
    return {
      id: `reconciliation-${month}-${balance.id}`,
      balanceId: balance.id,
      currency: balance.currency,
      method: balance.method,
      kind: 'reconciliation',
      observedAmount,
      deltaAmount: observedAmount - balance.amount,
      date,
      effectiveAt,
      month,
      createdAt: effectiveAt,
      updatedAt: effectiveAt,
    };
  });

  await database.transaction(
    'rw',
    [
      database.transactions,
      database.conversions,
      database.balanceCheckpoints,
      database.balances,
      database.syncOutbox,
    ],
    async () => {
      await database.balanceCheckpoints.bulkAdd(checkpoints);
      await rebuildDerivedBalances(database, effectiveAt);

      for (const checkpoint of checkpoints) {
        await queueRecordForSync(
          'balanceCheckpoints',
          checkpoint as unknown as Record<string, unknown>,
          database
        );
      }
    }
  );

  void flushSyncQueueBestEffort(database);
  return checkpoints;
}

export async function getAdjustmentHistory(
  database: RavelDatabase = db
): Promise<BalanceCheckpoint[]> {
  const checkpoints = await database.balanceCheckpoints
    .filter((checkpoint) => checkpoint.kind === 'reconciliation')
    .toArray();

  return checkpoints.sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));
}

/**
 * Returns the latest checkpoint on the selected local date for any balance an
 * activity touches. A missing occurredAt on that date requires a before/after
 * choice before the activity can participate in deterministic balance rebuilds.
 */
export async function findSameDayOrderingCheckpoint(
  date: string,
  balanceIds: string[],
  database: RavelDatabase = db
): Promise<BalanceCheckpoint | null> {
  if (balanceIds.length === 0) return null;

  const checkpoints = await database.balanceCheckpoints
    .where('balanceId')
    .anyOf([...new Set(balanceIds)])
    .and((checkpoint) => checkpoint.date === date)
    .toArray();

  if (checkpoints.length === 0) return null;
  return checkpoints.sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0] ?? null;
}

export function resolveHistoricalOccurrenceAroundCheckpoint(
  checkpoint: BalanceCheckpoint,
  relation: HistoricalOrderingRelation
): string {
  const boundary = new Date(checkpoint.effectiveAt).getTime();
  if (!Number.isFinite(boundary)) {
    throw new Error('Checkpoint ordering timestamp is invalid.');
  }

  return new Date(boundary + (relation === 'before' ? -1 : 1)).toISOString();
}
