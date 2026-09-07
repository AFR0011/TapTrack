'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Table } from 'dexie';
import { db, type TapTrackDatabase } from '@/database';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import {
  getSyncAccess,
  requireLinkedSyncAccess,
  type SyncBindingState,
} from '@/sync/syncBinding';
import type { SyncOutboxItem } from '@/types';

export type SyncedDexieTableName = keyof Pick<
  TapTrackDatabase,
  | 'transactions'
  | 'balanceCheckpoints'
  | 'categories'
  | 'monthlyBudgets'
  | 'categoryBudgets'
  | 'recurringTransactions'
  | 'conversions'
  | 'settings'
>;

export type PublicSyncTableName = SyncedDexieTableName | 'balances';

const DEXIE_TO_SUPABASE: Record<SyncedDexieTableName, string> = {
  transactions: 'transactions',
  balanceCheckpoints: 'balance_checkpoints',
  categories: 'categories',
  monthlyBudgets: 'monthly_budgets',
  categoryBudgets: 'category_budgets',
  recurringTransactions: 'recurring_transactions',
  conversions: 'conversions',
  settings: 'settings',
};

const CANONICAL_TABLE_NAMES = Object.keys(DEXIE_TO_SUPABASE) as SyncedDexieTableName[];
const LAST_SYNC_PREFIX = 'taptrack_last_pull:';
const LAST_PUSH_PREFIX = 'taptrack_last_push:';

interface SupabaseRow extends Record<string, unknown> {
  id?: string;
  user_id?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export type SyncStatusSnapshot = {
  authenticated: boolean;
  userId: string | null;
  bindingState: SyncBindingState;
  syncAllowed: boolean;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  pendingRetryCount: number;
  online: boolean;
};

function isCanonicalTableName(value: string): value is SyncedDexieTableName {
  return value in DEXIE_TO_SUPABASE;
}

function getRecordId(record: Record<string, unknown>): string | null {
  const value = record.id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getOutboxId(tableName: string, recordId: string): string {
  return `${tableName}:${recordId}`;
}

function getDexieTable(
  database: TapTrackDatabase,
  tableName: SyncedDexieTableName
): Table<Record<string, unknown>, string> {
  return database[tableName] as unknown as Table<Record<string, unknown>, string>;
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
}

function serializeForSupabase(
  record: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    user_id: userId,
    deleted_at: null,
  };

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    result[toSnakeCase(key)] = value;
  }

  return result;
}

function deserializeFromSupabase(row: SupabaseRow): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === 'user_id' || key === 'deleted_at') continue;
    result[toCamelCase(key)] = value;
  }

  return result;
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sync correctness never depends on localStorage. These timestamps are UI only.
  }
}

function getStatusTimestamp(prefix: string, userId: string | null): string | null {
  return userId ? readStorage(`${prefix}${userId}`) : null;
}

function setStatusTimestamp(prefix: string, userId: string, value = new Date().toISOString()) {
  writeStorage(`${prefix}${userId}`, value);
}

async function queueOutboxOperation(
  tableName: SyncedDexieTableName,
  operation: SyncOutboxItem['operation'],
  recordId: string,
  database: TapTrackDatabase,
  record?: Record<string, unknown>
): Promise<SyncOutboxItem> {
  const queuedAt = new Date().toISOString();
  const item: SyncOutboxItem = {
    id: getOutboxId(tableName, recordId),
    operationId: crypto.randomUUID(),
    tableName,
    operation,
    recordId,
    record,
    queuedAt,
    attempts: 0,
  };

  // When called from an existing Dexie rw transaction that includes syncOutbox,
  // this put joins that transaction. Local state and sync intent can therefore
  // commit or roll back as one IndexedDB unit.
  await database.syncOutbox.put(item);
  return item;
}

/**
 * Durably queues an upsert without performing network I/O. Callers may invoke
 * this inside their own Dexie rw transaction to make local state + sync intent atomic.
 */
export async function queueRecordForSync(
  tableName: PublicSyncTableName,
  record: Record<string, unknown>,
  database: TapTrackDatabase = db
): Promise<SyncOutboxItem | null> {
  if (tableName === 'balances') return null;

  const recordId = getRecordId(record);
  if (!recordId) return null;

  return queueOutboxOperation(tableName, 'upsert', recordId, database, record);
}

/** Durably queues a soft-delete without performing network I/O. */
export async function queueDeleteForSync(
  tableName: PublicSyncTableName,
  recordId: string,
  database: TapTrackDatabase = db
): Promise<SyncOutboxItem | null> {
  if (tableName === 'balances' || !recordId) return null;
  return queueOutboxOperation(tableName, 'delete', recordId, database);
}

async function acknowledgeExactOperation(
  item: SyncOutboxItem,
  database: TapTrackDatabase
): Promise<void> {
  const current = await database.syncOutbox.get(item.id);
  if (current?.operationId === item.operationId) {
    await database.syncOutbox.delete(item.id);
  }
}

async function recordOperationFailure(
  item: SyncOutboxItem,
  database: TapTrackDatabase
): Promise<void> {
  const current = await database.syncOutbox.get(item.id);
  if (current?.operationId !== item.operationId) return;

  await database.syncOutbox.put({
    ...current,
    attempts: current.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

async function sendOutboxItem(
  item: SyncOutboxItem,
  client: SupabaseClient,
  userId: string,
  database: TapTrackDatabase
): Promise<boolean> {
  if (!isCanonicalTableName(item.tableName)) {
    // Old derived-cache operations are intentionally discarded during migration.
    await acknowledgeExactOperation(item, database);
    return true;
  }

  const remoteTable = DEXIE_TO_SUPABASE[item.tableName];

  try {
    if (item.operation === 'upsert') {
      if (!item.record) {
        await recordOperationFailure(item, database);
        return false;
      }

      const { error } = await client
        .from(remoteTable)
        .upsert(serializeForSupabase(item.record, userId), { onConflict: 'user_id,id' });
      if (error) {
        await recordOperationFailure(item, database);
        return false;
      }
    } else {
      const { error } = await client
        .from(remoteTable)
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', item.recordId);
      if (error) {
        await recordOperationFailure(item, database);
        return false;
      }
    }

    await acknowledgeExactOperation(item, database);
    setStatusTimestamp(LAST_PUSH_PREFIX, userId);
    return true;
  } catch {
    await recordOperationFailure(item, database);
    return false;
  }
}

/**
 * Attempts delivery of one already-durable operation. Provider/network failures
 * are intentionally non-fatal because correctness resides in the outbox.
 */
export async function deliverQueuedOperationBestEffort(
  item: SyncOutboxItem | null,
  database: TapTrackDatabase = db
): Promise<void> {
  if (!item) return;

  try {
    const access = await requireLinkedSyncAccess(database);
    if (!access) return;
    await sendOutboxItem(item, access.client, access.userId, database);
  } catch {
    // Leave the operation durable for a later retry cycle.
  }
}

/**
 * Queues one canonical record durably before any network attempt. `balances` is
 * accepted as a compatibility no-op while old callers are removed; the derived
 * balance cache can never be uploaded.
 */
export async function pushRecord(
  tableName: PublicSyncTableName,
  record: Record<string, unknown>,
  database: TapTrackDatabase = db
): Promise<void> {
  const item = await queueRecordForSync(tableName, record, database);
  await deliverQueuedOperationBestEffort(item, database);
}

/** Queues a durable soft-delete. No separate tombstone write is required. */
export async function deleteRecord(
  tableName: PublicSyncTableName,
  recordId: string,
  database: TapTrackDatabase = db
): Promise<void> {
  const item = await queueDeleteForSync(tableName, recordId, database);
  await deliverQueuedOperationBestEffort(item, database);
}

/**
 * Destructive snapshot replacement remains intentionally unavailable. Linking
 * uses explicit cloud-adoption or local-merge workflows instead.
 */
export async function syncAllLocalData(database: TapTrackDatabase = db): Promise<void> {
  void database;
  throw new Error(
    'Remote snapshot replacement is disabled until an atomic, reviewed workflow is available.'
  );
}

/** Processes every durable pending operation in queue order. Failed items remain queued. */
export async function processRetryQueue(database: TapTrackDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;

  const items = await database.syncOutbox.orderBy('queuedAt').toArray();
  for (const item of items) {
    await sendOutboxItem(item, access.client, access.userId, database);
  }
}

/** Starts a retry pass without allowing provider/network failures to escape. */
export async function flushSyncQueueBestEffort(database: TapTrackDatabase = db): Promise<void> {
  try {
    await processRetryQueue(database);
  } catch {
    // Pending operations remain in IndexedDB for the next automatic sync cycle.
  }
}

/**
 * Explicit local-ledger backfill used by the user's "Merge this device" choice.
 * Normal sync never performs an implicit full upload.
 */
export async function pushLocalChanges(database: TapTrackDatabase = db): Promise<void> {
  for (const tableName of CANONICAL_TABLE_NAMES) {
    const rows = await getDexieTable(database, tableName).toArray();
    for (const record of rows) {
      const recordId = getRecordId(record);
      if (!recordId) continue;
      await queueOutboxOperation(tableName, 'upsert', recordId, database, record);
    }
  }

  await processRetryQueue(database);
}

/**
 * Pulls complete canonical server state. A pending local operation protects its
 * optimistic record until that exact operation succeeds. Remote soft-deletes
 * remove local canonical rows. Balances are rebuilt once from pulled ledger data.
 */
export async function pullUpdates(database: TapTrackDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;

  const pending = new Set(
    (await database.syncOutbox.toArray()).map((item) => getOutboxId(item.tableName, item.recordId))
  );

  for (const tableName of CANONICAL_TABLE_NAMES) {
    const remoteTable = DEXIE_TO_SUPABASE[tableName];
    const { data, error } = await access.client
      .from(remoteTable)
      .select('*')
      .eq('user_id', access.userId);

    if (error) {
      throw new Error(`Cloud pull failed for ${remoteTable}: ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`Cloud pull returned an invalid response for ${remoteTable}.`);
    }

    const localTable = getDexieTable(database, tableName);
    for (const raw of data as SupabaseRow[]) {
      if (typeof raw.id !== 'string' || raw.id.length === 0) continue;
      if (pending.has(getOutboxId(tableName, raw.id))) continue;

      if (raw.deleted_at) {
        await localTable.delete(raw.id);
      } else {
        await localTable.put(deserializeFromSupabase(raw));
      }
    }
  }

  await rebuildDerivedBalances(database);
  setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
}

/** A normal cycle sends durable local changes first, then adopts canonical server state. */
export async function syncNow(database: TapTrackDatabase = db): Promise<void> {
  await processRetryQueue(database);
  await pullUpdates(database);
}

export async function getSyncStatus(
  database: TapTrackDatabase = db
): Promise<SyncStatusSnapshot> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

  try {
    const access = await getSyncAccess(database);
    const userId = access.userId;

    return {
      authenticated: userId !== null,
      userId,
      bindingState: access.state,
      syncAllowed: access.state === 'linked',
      lastSyncAt: getStatusTimestamp(LAST_SYNC_PREFIX, userId),
      lastPushAt: getStatusTimestamp(LAST_PUSH_PREFIX, userId),
      pendingRetryCount: await database.syncOutbox.count(),
      online,
    };
  } catch {
    return {
      authenticated: false,
      userId: null,
      bindingState: 'provider-unavailable',
      syncAllowed: false,
      lastSyncAt: null,
      lastPushAt: null,
      pendingRetryCount: await database.syncOutbox.count().catch(() => 0),
      online,
    };
  }
}
