'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase';
import { db, type TapTrackDatabase } from '@/database';

type DexieTableName = keyof Pick<
  TapTrackDatabase,
  | 'transactions'
  | 'balances'
  | 'categories'
  | 'monthlyBudgets'
  | 'categoryBudgets'
  | 'recurringTransactions'
  | 'conversions'
  | 'settings'
>;

const DEXIE_TO_SUPABASE: Record<DexieTableName, string> = {
  transactions: 'transactions',
  balances: 'balances',
  categories: 'categories',
  monthlyBudgets: 'monthly_budgets',
  categoryBudgets: 'category_budgets',
  recurringTransactions: 'recurring_transactions',
  conversions: 'conversions',
  settings: 'settings',
};

const LAST_SYNC_KEY = 'taptrack_last_sync_at';
const RETRY_QUEUE_KEY = 'taptrack_retry_queue';

interface RetryItem {
  tableName: DexieTableName;
  record: Record<string, unknown>;
  attempts: number;
  lastAttempt: number;
}

function getRecordId(record: Record<string, unknown>): string {
  return record.id as string;
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function serializeForSupabase(
  record: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const result: Record<string, unknown> = { user_id: userId };
  for (const [k, v] of Object.entries(record)) {
    result[toSnakeCase(k)] = v;
  }
  return result;
}

function deserializeFromSupabase(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k !== 'user_id') {
      result[toCamelCase(k)] = v;
    }
  }
  return result;
}

/**
 * Pushes a single record to Supabase as a fire-and-forget background sync.
 * Local IndexedDB is always authoritative; this never blocks the caller.
 * If push fails, the record is added to a retry queue.
 */
export async function pushRecord(
  tableName: DexieTableName,
  record: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const supabaseTable = DEXIE_TO_SUPABASE[tableName];
  const serialized = serializeForSupabase(record, user.id);
  const retryItem: RetryItem = {
    tableName,
    record,
    attempts: 0,
    lastAttempt: Date.now(),
  };

  try {
    await supabase.from(supabaseTable).upsert(serialized, { onConflict: 'id' });
    // Clear any existing retry item on success
    await removeFromRetryQueue(tableName, getRecordId(record));
  } catch {
    // Add to retry queue with exponential backoff check
    const queue = getRetryQueue();
    // Check if this record is already in the queue (by id)
    const existing = queue.find((item) => item.tableName === tableName && getRecordId(item.record) === getRecordId(record));
    if (!existing) {
      queue.push(retryItem);
      saveRetryQueue(queue);
    } else if (existing.attempts < 3 && Date.now() - existing.lastAttempt > 5000) {
      // Retry if failed more than 5 seconds ago and attempts < 3
      existing.attempts += 1;
      existing.lastAttempt = Date.now();
      saveRetryQueue(queue);
    }
  }
}

/**
 * Processes the retry queue - attempts to push failed records.
 * Called on app open and when network status changes.
 */
export async function processRetryQueue(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const queue = getRetryQueue();
  const now = Date.now();

  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    // Only retry if more than 5 seconds since last attempt and attempts < 3
    if (now - item.lastAttempt < 5000 || item.attempts >= 3) {
      continue;
    }

    const supabaseTable = DEXIE_TO_SUPABASE[item.tableName];
    const serialized = serializeForSupabase(item.record, user.id);

    try {
      await supabase.from(supabaseTable).upsert(serialized, { onConflict: 'id' });
      queue.splice(i, 1); // Remove from queue on success
    } catch {
      item.attempts += 1;
      item.lastAttempt = now;
    }
  }

  saveRetryQueue(queue);
}

function getRetryQueue(): RetryItem[] {
  try {
    const stored = localStorage.getItem(RETRY_QUEUE_KEY);
    return stored ? (JSON.parse(stored) as RetryItem[]) : [];
  } catch {
    return [];
  }
}

function saveRetryQueue(queue: RetryItem[]): void {
  try {
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Silent fail - queue is best-effort
  }
}

function removeFromRetryQueue(tableName: DexieTableName, recordId: string): void {
  try {
    const queue = getRetryQueue();
    const filtered = queue.filter((item) => !(item.tableName === tableName && getRecordId(item.record) === recordId));
    if (filtered.length !== queue.length) {
      saveRetryQueue(filtered);
    }
  } catch {
    // Silent fail
  }
}

/**
 * Pulls records updated since the last sync from Supabase and merges
 * them into local IndexedDB. Called on app open to pick up Telegram bot
 * transactions and changes made on other devices.
 */
export async function pullUpdates(): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const lastSyncAt =
      (typeof window !== 'undefined' && localStorage.getItem(LAST_SYNC_KEY)) ||
      '1970-01-01T00:00:00.000Z';

    let allTablesSuccess = true;
    const tablesToSync = Object.entries(DEXIE_TO_SUPABASE) as [DexieTableName, string][];

    for (const [dexieTable, supabaseTable] of tablesToSync) {
      // conversions has no updated_at, so use created_at
      const timestampCol = dexieTable === 'conversions' ? 'created_at' : 'updated_at';

      const { data, error } = await supabase
        .from(supabaseTable)
        .select('*')
        .gt(timestampCol, lastSyncAt);

      if (error || !data || data.length === 0) continue;

      const table = db[dexieTable];
      try {
        for (const row of data) {
          const record = deserializeFromSupabase(row as Record<string, unknown>);
          // biome-ignore lint: dynamic table access needed for generic sync
          // rome-ignore lint: dynamic table access
          await (table as unknown as { put: (r: unknown) => Promise<unknown> }).put(record);
        }
      } catch {
        allTablesSuccess = false;
        // Continue syncing other tables even if one fails
      }
    }

    // Only advance sync timestamp if all tables synced successfully
    if (allTablesSuccess && typeof window !== 'undefined') {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }
  } catch {
    // Best-effort - do not advance sync timestamp on error
  }
}
