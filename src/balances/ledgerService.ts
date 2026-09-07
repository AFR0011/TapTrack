import { db, type TapTrackDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_METHODS,
  type Balance,
  type BalanceCheckpoint,
  type Conversion,
  type Transaction,
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
 * This makes balances deterministic across devices and removes mutable balance
 * rows from the set of records that need conflict resolution.
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

  for (const currency of SUPPORTED_CURRENCIES) {
    for (const method of SUPPORTED_METHODS) {
      const id = getBalanceId(currency, method);
      const checkpoint = latestCheckpointByBalance.get(id);
      balanceMap.set(id, {
        id,
        currency,
        method,
        amount: checkpoint?.observedAmount ?? 0,
        updatedAt,
      });
    }
  }

  for (const transaction of transactions) {
    const balanceId = getBalanceId(transaction.currency, transaction.method);
    const checkpoint = latestCheckpointByBalance.get(balanceId);
    if (!isActivityAfterCheckpoint(toTransactionActivity(transaction), checkpoint)) continue;

    const balance = balanceMap.get(balanceId);
    if (!balance) continue;
    balance.amount += transaction.type === 'income' ? transaction.amount : -transaction.amount;
  }

  for (const conversion of conversions) {
    const activity = toConversionActivity(conversion);
    const fromId = getBalanceId(conversion.fromCurrency, conversion.fromMethod);
    const toId = getBalanceId(conversion.toCurrency, conversion.toMethod);

    if (isActivityAfterCheckpoint(activity, latestCheckpointByBalance.get(fromId))) {
      const fromBalance = balanceMap.get(fromId);
      if (fromBalance) fromBalance.amount -= conversion.fromAmount;
    }
    if (isActivityAfterCheckpoint(activity, latestCheckpointByBalance.get(toId))) {
      const toBalance = balanceMap.get(toId);
      if (toBalance) toBalance.amount += conversion.toAmount;
    }
  }

  const balances = [...balanceMap.values()];
  await database.balances.bulkPut(balances);
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
