'use client';

import { db, type TapTrackDatabase } from '@/database';
import { createDefaultCategories, createDefaultSettings } from '@/defaultData';
import {
  TAPTRACK_BACKUP_FORMAT,
  TAPTRACK_BACKUP_VERSION,
  type RestoreBackupResult,
  type TapTrackBackupV2,
} from '@/exports/backupService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
  type RestoreSafetyBackupHandler,
} from '@/exports/linkedRestoreService';

/**
 * Builds the canonical state of a fresh TapTrack ledger. Reset deliberately
 * contains no transactions, checkpoints, budgets, recurring rules, or
 * conversions. Default categories/settings are included so the restored local
 * state is immediately valid and setup can run again.
 */
export function createFreshLedgerBackup(now = new Date()): TapTrackBackupV2 {
  const timestamp = now.toISOString();
  return {
    format: TAPTRACK_BACKUP_FORMAT,
    version: TAPTRACK_BACKUP_VERSION,
    exportedAt: timestamp,
    transactions: [],
    balanceCheckpoints: [],
    categories: createDefaultCategories(timestamp),
    monthlyBudgets: [],
    categoryBudgets: [],
    recurringTransactions: [],
    conversions: [],
    settings: [createDefaultSettings(timestamp)],
  };
}

export function createFreshLedgerBackupJSON(now = new Date()): string {
  return JSON.stringify(createFreshLedgerBackup(now), null, 2);
}

export async function resetOnlyThisDevice(
  beforeReplace: RestoreSafetyBackupHandler,
  database: TapTrackDatabase = db,
  now = new Date()
): Promise<RestoreBackupResult> {
  return restoreOnlyThisDevice(createFreshLedgerBackupJSON(now), beforeReplace, database);
}

export async function resetSyncedAccount(
  beforeReplace: RestoreSafetyBackupHandler,
  database: TapTrackDatabase = db,
  now = new Date()
): Promise<RestoreBackupResult> {
  return restoreSyncedAccount(createFreshLedgerBackupJSON(now), beforeReplace, database);
}
