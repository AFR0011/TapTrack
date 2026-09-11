'use client';

import { db, type RavelDatabase } from '@/database';
import { createDefaultCategories, createDefaultSettings } from '@/defaultData';
import {
  RAVEL_BACKUP_FORMAT,
  RAVEL_BACKUP_VERSION,
  type RestoreBackupResult,
  type RavelBackupV2,
} from '@/exports/backupService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
  type RestoreSafetyBackupHandler,
} from '@/exports/linkedRestoreService';

/**
 * Builds the canonical state of a fresh Ravel ledger. Reset deliberately
 * contains no transactions, checkpoints, budgets, recurring rules, or
 * conversions. Default categories/settings are included so the restored local
 * state is immediately valid and setup can run again.
 */
export function createFreshLedgerBackup(now = new Date()): RavelBackupV2 {
  const timestamp = now.toISOString();
  return {
    format: RAVEL_BACKUP_FORMAT,
    version: RAVEL_BACKUP_VERSION,
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
  database: RavelDatabase = db,
  now = new Date()
): Promise<RestoreBackupResult> {
  return restoreOnlyThisDevice(createFreshLedgerBackupJSON(now), beforeReplace, database);
}

export async function resetSyncedAccount(
  beforeReplace: RestoreSafetyBackupHandler,
  database: RavelDatabase = db,
  now = new Date()
): Promise<RestoreBackupResult> {
  return restoreSyncedAccount(createFreshLedgerBackupJSON(now), beforeReplace, database);
}
