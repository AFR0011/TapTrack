'use client';

import type { Table } from 'dexie';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import { db, ensureDatabaseSeeded, type TapTrackDatabase } from '@/database';
import { createDefaultSettings, DEFAULT_SETTINGS_ID } from '@/defaultData';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import {
  inspectDeviceLedgerLinkToCurrentUser,
  linkDeviceLedgerToCurrentUser,
  type LedgerLinkPlan,
} from '@/sync/syncBinding';
import { pullUpdates, pushLocalChanges } from '@/sync/syncService';

type CanonicalTableName =
  | 'transactions'
  | 'balanceCheckpoints'
  | 'categories'
  | 'monthlyBudgets'
  | 'categoryBudgets'
  | 'recurringTransactions'
  | 'conversions'
  | 'settings';

const CANONICAL_TABLES: Array<{ local: CanonicalTableName; remote: string }> = [
  { local: 'transactions', remote: 'transactions' },
  { local: 'balanceCheckpoints', remote: 'balance_checkpoints' },
  { local: 'categories', remote: 'categories' },
  { local: 'monthlyBudgets', remote: 'monthly_budgets' },
  { local: 'categoryBudgets', remote: 'category_budgets' },
  { local: 'recurringTransactions', remote: 'recurring_transactions' },
  { local: 'conversions', remote: 'conversions' },
  { local: 'settings', remote: 'settings' },
];

type RemoteSnapshot = Record<CanonicalTableName, Array<Record<string, unknown>>>;

function getLocalTable(
  database: TapTrackDatabase,
  tableName: CanonicalTableName
): Table<Record<string, unknown>, string> {
  return database[tableName] as unknown as Table<Record<string, unknown>, string>;
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

async function fetchValidatedCloudSnapshot(userId: string): Promise<RemoteSnapshot> {
  const client = createSupabaseBrowserClient();
  if (!client) throw new Error('Cloud sync is not configured.');

  const snapshot = Object.fromEntries(
    CANONICAL_TABLES.map(({ local }) => [local, []])
  ) as RemoteSnapshot;

  for (const { local, remote } of CANONICAL_TABLES) {
    const { data, error } = await client
      .from(remote)
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) throw new Error(`Cloud data could not be loaded from ${remote}: ${error.message}`);
    if (!Array.isArray(data)) throw new Error(`Cloud data from ${remote} was invalid.`);

    snapshot[local] = (data as Array<Record<string, unknown>>).map(deserializeRow);
  }

  return snapshot;
}

async function replaceLocalCanonicalSnapshot(
  snapshot: RemoteSnapshot,
  database: TapTrackDatabase
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

      // Legacy cloud accounts could be missing the globally-colliding settings
      // row. Keep an existing cloud ledger usable without pretending setup is new.
      if (snapshot.settings.length === 0) {
        const now = new Date().toISOString();
        await database.settings.put({
          ...createDefaultSettings(now),
          id: DEFAULT_SETTINGS_ID,
          setupCompleted: CANONICAL_TABLES.some(
            ({ local }) => local !== 'settings' && snapshot[local].length > 0
          ),
          updatedAt: now,
        });
      }

      await rebuildDerivedBalances(database);
    }
  );

  await ensureDatabaseSeeded(database);
}

/** Returns the exact preflight state the UI should present to the user. */
export async function inspectCloudAdoption(
  database: TapTrackDatabase = db
): Promise<LedgerLinkPlan> {
  return inspectDeviceLedgerLinkToCurrentUser(database);
}

/**
 * Use cloud data: validate the complete snapshot before binding or clearing any
 * local canonical rows, then replace atomically and rebuild derived balances.
 */
export async function adoptCloudLedger(
  database: TapTrackDatabase = db
): Promise<void> {
  const plan = await inspectDeviceLedgerLinkToCurrentUser(database);
  const snapshot = await fetchValidatedCloudSnapshot(plan.userId);
  await linkDeviceLedgerToCurrentUser(database, 'use-cloud');
  await replaceLocalCanonicalSnapshot(snapshot, database);
}

/** Merge this device: later successful local upserts win same-record conflicts. */
export async function mergeLocalLedgerIntoCloud(
  database: TapTrackDatabase = db
): Promise<void> {
  await linkDeviceLedgerToCurrentUser(database, 'merge-local');
  await pushLocalChanges(database);
  await pullUpdates(database);
}

/** Empty cloud account: link safely, then seed it from this device if needed. */
export async function linkEmptyCloudLedger(
  database: TapTrackDatabase = db
): Promise<void> {
  await linkDeviceLedgerToCurrentUser(database, 'empty-only');
  await pushLocalChanges(database);
  await pullUpdates(database);
}
