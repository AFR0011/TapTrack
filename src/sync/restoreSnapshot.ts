'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Table } from 'dexie';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import type { RavelDatabase } from '@/database';

export type CanonicalSnapshotTableName =
  | 'transactions'
  | 'balanceCheckpoints'
  | 'categories'
  | 'monthlyBudgets'
  | 'categoryBudgets'
  | 'recurringTransactions'
  | 'conversions'
  | 'settings';

const CANONICAL_TABLES: Array<{ local: CanonicalSnapshotTableName; remote: string }> = [
  { local: 'transactions', remote: 'transactions' },
  { local: 'balanceCheckpoints', remote: 'balance_checkpoints' },
  { local: 'categories', remote: 'categories' },
  { local: 'monthlyBudgets', remote: 'monthly_budgets' },
  { local: 'categoryBudgets', remote: 'category_budgets' },
  { local: 'recurringTransactions', remote: 'recurring_transactions' },
  { local: 'conversions', remote: 'conversions' },
  { local: 'settings', remote: 'settings' },
];

export type CloudCanonicalSnapshot = Record<
  CanonicalSnapshotTableName,
  Array<Record<string, unknown>>
>;

function emptySnapshot(): CloudCanonicalSnapshot {
  return {
    transactions: [],
    balanceCheckpoints: [],
    categories: [],
    monthlyBudgets: [],
    categoryBudgets: [],
    recurringTransactions: [],
    conversions: [],
    settings: [],
  };
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
}

function deserializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'user_id' || key === 'deleted_at') continue;
    result[toCamelCase(key)] = value;
  }
  return result;
}

function getLocalTable(
  database: RavelDatabase,
  tableName: CanonicalSnapshotTableName
): Table<Record<string, unknown>, string> {
  return database[tableName] as unknown as Table<Record<string, unknown>, string>;
}

export async function fetchActiveCloudCanonicalSnapshot(
  client: SupabaseClient,
  userId: string
): Promise<CloudCanonicalSnapshot> {
  const snapshot = emptySnapshot();

  for (const { local, remote } of CANONICAL_TABLES) {
    const { data, error } = await client
      .from(remote)
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) throw new Error(`Restored cloud snapshot could not be loaded from ${remote}: ${error.message}`);
    if (!Array.isArray(data)) throw new Error(`Restored cloud snapshot from ${remote} was invalid.`);
    snapshot[local] = (data as Array<Record<string, unknown>>).map(deserializeRow);
  }

  return snapshot;
}

/**
 * Used only after an account-wide restore generation changes. Stale optimistic
 * operations are intentionally discarded and the active cloud snapshot becomes
 * the local canonical ledger before any further upload is allowed.
 */
export async function replaceLocalWithRestoredCloudSnapshot(
  snapshot: CloudCanonicalSnapshot,
  database: RavelDatabase
): Promise<void> {
  const tables = CANONICAL_TABLES.map(({ local }) => getLocalTable(database, local));

  await database.transaction(
    'rw',
    [...tables, database.balances, database.syncOutbox],
    async () => {
      for (const table of tables) await table.clear();
      await database.balances.clear();
      await database.syncOutbox.clear();

      for (const { local } of CANONICAL_TABLES) {
        const rows = snapshot[local];
        if (rows.length > 0) await getLocalTable(database, local).bulkPut(rows);
      }

      await rebuildDerivedBalances(database);
    }
  );
}
