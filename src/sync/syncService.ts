'use client';

import type { Table } from 'dexie';
import { db, type RavelDatabase } from '@/database';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import {
  getSyncAccess,
  requireLinkedSyncAccess,
  type SyncBindingState,
} from '@/sync/syncBinding';
import type { SyncOutboxItem } from '@/types';
import {
  bindingMatchesLedgerVersion,
  ensureCloudLedgerVersion,
  type CloudLedgerVersion,
} from '@/sync/ledgerVersion';
import {
  fetchActiveCloudCanonicalSnapshot,
  replaceLocalWithRestoredCloudSnapshot,
} from '@/sync/restoreSnapshot';

export type SyncedDexieTableName = keyof Pick<
  RavelDatabase,
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
const LAST_SYNC_PREFIX = 'ravel_last_pull:';
const LAST_PUSH_PREFIX = 'ravel_last_push:';
const LEGACY_LAST_SYNC_PREFIX = 'taptrack_last_pull:';
const LEGACY_LAST_PUSH_PREFIX = 'taptrack_last_push:';

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
  database: RavelDatabase,
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

function getStatusTimestamp(prefix: string, legacyPrefix: string, userId: string | null): string | null {
  if (!userId) return null;
  const current = readStorage(`${prefix}${userId}`);
  if (current) return current;
  const legacy = readStorage(`${legacyPrefix}${userId}`);
  if (legacy) writeStorage(`${prefix}${userId}`, legacy);
  return legacy;
}

function setStatusTimestamp(prefix: string, userId: string, value = new Date().toISOString()) {
  writeStorage(`${prefix}${userId}`, value);
}

async function queueOutboxOperation(
  tableName: SyncedDexieTableName,
  operation: SyncOutboxItem['operation'],
  recordId: string,
  database: RavelDatabase,
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
  database: RavelDatabase = db
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
  database: RavelDatabase = db
): Promise<SyncOutboxItem | null> {
  if (tableName === 'balances' || !recordId) return null;
  return queueOutboxOperation(tableName, 'delete', recordId, database);
}

async function acknowledgeExactOperation(
  item: SyncOutboxItem,
  database: RavelDatabase
): Promise<void> {
  const current = await database.syncOutbox.get(item.id);
  if (current?.operationId === item.operationId) {
    await database.syncOutbox.delete(item.id);
  }
}

async function recordOperationFailure(
  item: SyncOutboxItem,
  database: RavelDatabase
): Promise<void> {
  const current = await database.syncOutbox.get(item.id);
  if (current?.operationId !== item.operationId) return;

  await database.syncOutbox.put({
    ...current,
    attempts: current.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

async function adoptChangedLedgerGeneration(
  access: NonNullable<Awaited<ReturnType<typeof requireLinkedSyncAccess>>>,
  database: RavelDatabase,
  remoteVersion?: CloudLedgerVersion
): Promise<void> {
  const version = remoteVersion ?? (await ensureCloudLedgerVersion(access.client, access.userId));
  const snapshot = await fetchActiveCloudCanonicalSnapshot(access.client, access.userId);
  await replaceLocalWithRestoredCloudSnapshot(snapshot, database);
  await database.deviceMetadata.put({
    ...access.binding,
    cloudRevision: version.revision,
    cloudGeneration: version.generation,
  });
}

async function ensurePushLedgerVersion(
  access: NonNullable<Awaited<ReturnType<typeof requireLinkedSyncAccess>>>,
  database: RavelDatabase
): Promise<CloudLedgerVersion | null> {
  const remote = await ensureCloudLedgerVersion(access.client, access.userId);
  const binding = access.binding;

  if (binding.cloudRevision === undefined || !binding.cloudGeneration) {
    if (remote.revision === 1) {
      await database.deviceMetadata.put({
        ...binding,
        cloudRevision: remote.revision,
        cloudGeneration: remote.generation,
      });
      return remote;
    }

    await adoptChangedLedgerGeneration(access, database, remote);
    return null;
  }

  if (!bindingMatchesLedgerVersion(binding, remote)) {
    await adoptChangedLedgerGeneration(access, database, remote);
    return null;
  }

  return remote;
}

async function sendOutboxItem(
  item: SyncOutboxItem,
  access: NonNullable<Awaited<ReturnType<typeof requireLinkedSyncAccess>>>,
  version: CloudLedgerVersion,
  database: RavelDatabase
): Promise<boolean> {
  if (!isCanonicalTableName(item.tableName)) {
    await acknowledgeExactOperation(item, database);
    return true;
  }

  const remoteTable = DEXIE_TO_SUPABASE[item.tableName];

  try {
    const response = await fetch('/api/sync/operation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        revision: version.revision,
        generation: version.generation,
        table: remoteTable,
        operation: item.operation,
        recordId: item.recordId,
        record:
          item.operation === 'upsert' && item.record
            ? serializeForSupabase(item.record, access.userId)
            : null,
      }),
    });

    if (response.status === 409) {
      const body = (await response.json().catch(() => null)) as
        | { revision?: number; generation?: string }
        | null;
      const remoteVersion =
        body && Number.isInteger(body.revision) && typeof body.generation === 'string'
          ? {
              revision: body.revision as number,
              generation: body.generation,
              updatedAt: new Date().toISOString(),
            }
          : undefined;
      await adoptChangedLedgerGeneration(access, database, remoteVersion);
      return false;
    }

    if (!response.ok) {
      await recordOperationFailure(item, database);
      return false;
    }

    await acknowledgeExactOperation(item, database);
    setStatusTimestamp(LAST_PUSH_PREFIX, access.userId);
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
  database: RavelDatabase = db
): Promise<void> {
  if (!item) return;

  try {
    const access = await requireLinkedSyncAccess(database);
    if (!access) return;
    const version = await ensurePushLedgerVersion(access, database);
    if (!version) return;
    if (!(await database.syncOutbox.get(item.id))) return;
    await sendOutboxItem(item, access, version, database);
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
  database: RavelDatabase = db
): Promise<void> {
  const item = await queueRecordForSync(tableName, record, database);
  await deliverQueuedOperationBestEffort(item, database);
}

/** Queues a durable soft-delete. No separate tombstone write is required. */
export async function deleteRecord(
  tableName: PublicSyncTableName,
  recordId: string,
  database: RavelDatabase = db
): Promise<void> {
  const item = await queueDeleteForSync(tableName, recordId, database);
  await deliverQueuedOperationBestEffort(item, database);
}

/**
 * Destructive snapshot replacement remains intentionally unavailable. Linking
 * uses explicit cloud-adoption or local-merge workflows instead.
 */
export async function syncAllLocalData(database: RavelDatabase = db): Promise<void> {
  void database;
  throw new Error(
    'Remote snapshot replacement is disabled until an atomic, reviewed workflow is available.'
  );
}

/** Processes every durable pending operation in queue order. Failed items remain queued. */
export async function processRetryQueue(database: RavelDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;
  const version = await ensurePushLedgerVersion(access, database);
  if (!version) return;

  const items = await database.syncOutbox.orderBy('queuedAt').toArray();
  for (const item of items) {
    const sent = await sendOutboxItem(item, access, version, database);
    if (!sent && !(await database.syncOutbox.get(item.id))) break;
  }
}

/** Starts a retry pass without allowing provider/network failures to escape. */
export async function flushSyncQueueBestEffort(database: RavelDatabase = db): Promise<void> {
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
export async function pushLocalChanges(database: RavelDatabase = db): Promise<void> {
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
export async function pullUpdates(database: RavelDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;

  // Establish the generation this pull belongs to before reading any canonical
  // table. This also stamps legacy revision-1 bindings or adopts an already
  // changed generation before a partial read can be applied locally.
  const startVersion = await ensurePushLedgerVersion(access, database);
  if (!startVersion) return;

  const pending = new Set(
    (await database.syncOutbox.toArray()).map((item) => getOutboxId(item.tableName, item.recordId))
  );
  const pulled = new Map<SyncedDexieTableName, SupabaseRow[]>();

  // Fetch every table before mutating IndexedDB. If an account restore commits
  // during these sequential reads, the post-read generation check below rejects
  // the mixed snapshot and adopts one fresh canonical cloud snapshot instead.
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
    pulled.set(tableName, data as SupabaseRow[]);
  }

  const afterReadVersion = await ensureCloudLedgerVersion(access.client, access.userId);
  if (!sameLedgerVersion(startVersion, afterReadVersion)) {
    await adoptChangedLedgerGeneration(access, database, afterReadVersion);
    setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
    return;
  }

  for (const tableName of CANONICAL_TABLE_NAMES) {
    const localTable = getDexieTable(database, tableName);
    for (const raw of pulled.get(tableName) ?? []) {
      if (typeof raw.id !== 'string' || raw.id.length === 0) continue;
      if (pending.has(getOutboxId(tableName, raw.id))) continue;

      if (raw.deleted_at) {
        await localTable.delete(raw.id);
      } else {
        await localTable.put(deserializeFromSupabase(raw));
      }
    }
  }

  // A restore can still win the tiny interval between the post-read check and
  // local application. Detect that before rebuilding balances or reporting a
  // completed pull; adoption replaces the just-applied stale snapshot.
  const afterApplyVersion = await ensureCloudLedgerVersion(access.client, access.userId);
  if (!sameLedgerVersion(startVersion, afterApplyVersion)) {
    await adoptChangedLedgerGeneration(access, database, afterApplyVersion);
    setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
    return;
  }

  await rebuildDerivedBalances(database);
  setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
}

function sameLedgerVersion(a: CloudLedgerVersion, b: CloudLedgerVersion): boolean {
  return a.revision === b.revision && a.generation === b.generation;
}

/** A normal cycle sends durable local changes first, then adopts canonical server state. */
export async function syncNow(database: RavelDatabase = db): Promise<void> {
  await processRetryQueue(database);
  await pullUpdates(database);
}

export async function getSyncStatus(
  database: RavelDatabase = db
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
      lastSyncAt: getStatusTimestamp(LAST_SYNC_PREFIX, LEGACY_LAST_SYNC_PREFIX, userId),
      lastPushAt: getStatusTimestamp(LAST_PUSH_PREFIX, LEGACY_LAST_PUSH_PREFIX, userId),
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
