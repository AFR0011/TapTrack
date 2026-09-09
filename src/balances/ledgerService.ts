import { db, type TapTrackDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import type {
  Balance,
  BalanceCheckpoint,
  Conversion,
  Transaction,
} from '@/types';

export class AmbiguousLedgerOrderingError extends Error {
  constructor(
    readonly activityKind: 'transaction' | 'conversion',
    readonly activityId: string,
    readonly checkpointId: string,
    readonly date: string
  ) {
    super(
      `The ${activityKind} ${activityId} is on the same date as reconciliation ${checkpointId}; choose whether it happened before or after reconciliation.`
    );
    this.name = 'AmbiguousLedgerOrderingError';
  }
}

type LedgerActivity = {
  kind: 'transaction' | 'conversion';
  id: string;
  date: string;
  occurredAt?: string;
  createdAt: string;
};

/**
 * Rebuilds the local balance cache from authoritative ledger records.
 *
 * For each balance bucket, the latest absolute checkpoint is the base. Only
 * transactions/conversions that happened after that checkpoint are applied.
 * Balance buckets are derived from the ledger itself rather than a static
 * currency catalog, so newly activated currencies remain first-class across
 * restore, sync, and ordinary local mutations.
 */
export async function rebuildDerivedBalances(
  database: TapTrackDatabase = db,
  updatedAt = new Date().toISOString()
): Promise<Balance[]> {
  const [checkpoints, transactions, conversions] = await Promise.all([
    database.balanceCheckpoints.toArray(),
    database.transactions.toArray(),
    database.conversions.toArray(),
  ]);

  const latestCheckpointByBalance = getLatestCheckpointByBalance(checkpoints);
  const balanceMap = new Map<string, Balance>();

  // Opening/reconciliation checkpoints are the normal source of active balance
  // buckets. Activity is also allowed to materialize a zero-based bucket
  // defensively so older/in-flight data is never silently discarded.
  for (const checkpoint of latestCheckpointByBalance.values()) {
    ensureBalanceBucket(
      balanceMap,
      checkpoint.currency,
      checkpoint.method,
      checkpoint,
      updatedAt
    );
  }

  for (const transaction of transactions) {
    const balanceId = getBalanceId(transaction.currency, transaction.method);
    const checkpoint = latestCheckpointByBalance.get(balanceId);
    const balance = ensureBalanceBucket(
      balanceMap,
      transaction.currency,
      transaction.method,
      checkpoint,
      updatedAt
    );
    if (!isActivityAfterCheckpoint(toTransactionActivity(transaction), checkpoint)) continue;

    balance.amount += transaction.type === 'income' ? transaction.amount : -transaction.amount;
  }

  for (const conversion of conversions) {
    const activity = toConversionActivity(conversion);
    const fromId = getBalanceId(conversion.fromCurrency, conversion.fromMethod);
    const toId = getBalanceId(conversion.toCurrency, conversion.toMethod);
    const fromCheckpoint = latestCheckpointByBalance.get(fromId);
    const toCheckpoint = latestCheckpointByBalance.get(toId);
    const fromBalance = ensureBalanceBucket(
      balanceMap,
      conversion.fromCurrency,
      conversion.fromMethod,
      fromCheckpoint,
      updatedAt
    );
    const toBalance = ensureBalanceBucket(
      balanceMap,
      conversion.toCurrency,
      conversion.toMethod,
      toCheckpoint,
      updatedAt
    );

    if (isActivityAfterCheckpoint(activity, fromCheckpoint)) {
      fromBalance.amount -= conversion.fromAmount;
    }
    if (isActivityAfterCheckpoint(activity, toCheckpoint)) {
      toBalance.amount += conversion.toAmount;
    }
  }

  const balances = [...balanceMap.values()].sort((left, right) => left.id.localeCompare(right.id));
  await database.transaction('rw', database.balances, async () => {
    await database.balances.clear();
    if (balances.length > 0) await database.balances.bulkPut(balances);
  });
  return balances;
}

export function getLatestCheckpointByBalance(checkpoints: BalanceCheckpoint[]) {
  const latest = new Map<string, BalanceCheckpoint>();
  for (const checkpoint of checkpoints) {
    const current = latest.get(checkpoint.balanceId);
    if (!current || checkpoint.effectiveAt > current.effectiveAt) {
      latest.set(checkpoint.balanceId, checkpoint);
    }
  }
  return latest;
}

function ensureBalanceBucket(
  balanceMap: Map<string, Balance>,
  currency: Balance['currency'],
  method: Balance['method'],
  checkpoint: BalanceCheckpoint | undefined,
  updatedAt: string
): Balance {
  const id = getBalanceId(currency, method);
  const existing = balanceMap.get(id);
  if (existing) return existing;

  const balance: Balance = {
    id,
    currency,
    method,
    amount: checkpoint?.observedAmount ?? 0,
    updatedAt,
  };
  balanceMap.set(id, balance);
  return balance;
}

function isActivityAfterCheckpoint(
  activity: LedgerActivity,
  checkpoint: BalanceCheckpoint | undefined
): boolean {
  if (!checkpoint) return true;

  if (activity.occurredAt) {
    return activity.occurredAt > checkpoint.effectiveAt;
  }

  // If the activity already existed when the absolute observation was made,
  // its effect was already reflected in the balance being reconciled/migrated.
  if (activity.createdAt <= checkpoint.effectiveAt) return false;

  if (activity.date > checkpoint.date) return true;
  if (activity.date < checkpoint.date) return false;

  throw new AmbiguousLedgerOrderingError(
    activity.kind,
    activity.id,
    checkpoint.id,
    activity.date
  );
}

function toTransactionActivity(transaction: Transaction): LedgerActivity {
  return {
    kind: 'transaction',
    id: transaction.id,
    date: transaction.date,
    occurredAt: transaction.occurredAt,
    createdAt: transaction.createdAt,
  };
}

function toConversionActivity(conversion: Conversion): LedgerActivity {
  return {
    kind: 'conversion',
    id: conversion.id,
    date: conversion.date,
    occurredAt: conversion.occurredAt,
    createdAt: conversion.createdAt,
  };
}
