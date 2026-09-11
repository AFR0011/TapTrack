'use client';

import type { Table } from 'dexie';
import { rebuildDerivedBalances } from '@/balances/ledgerService';
import { db, type RavelDatabase } from '@/database';
import {
  createDefaultCategories,
  createDefaultSettings,
  DEFAULT_SETTINGS_ID,
} from '@/defaultData';
import { createBackup } from '@/exports/backupService';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import {
  inspectDeviceLedgerLinkToCurrentUser,
  linkDeviceLedgerToCurrentUser,
  prepareDeviceLedgerBindingToCurrentUser,
  type LedgerLinkPlan,
} from '@/sync/syncBinding';
import { pullUpdates, pushLocalChanges, pushRecord } from '@/sync/syncService';
import type { DeviceMetadata } from '@/types';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RemoteSnapshot = Record<CanonicalTableName, Array<Record<string, unknown>>>;

type AdoptionRepairs = {
  settings: Record<string, unknown> | null;
  categories: Array<Record<string, unknown>>;
};

type EmptyLedgerClaimResponse = {
  error?: unknown;
  revision?: unknown;
  generation?: unknown;
};

function createEmptySnapshot(): RemoteSnapshot {
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

function getLocalTable(
  database: RavelDatabase,
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

  const snapshot = createEmptySnapshot();

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
  binding: DeviceMetadata,
  database: RavelDatabase
): Promise<AdoptionRepairs> {
  const tables = CANONICAL_TABLES.map(({ local }) => getLocalTable(database, local));
  const now = new Date().toISOString();
  let synthesizedSettings: Record<string, unknown> | null = null;

  const cloudCategoryIds = new Set(
    snapshot.categories
      .map((category) => category.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const repairedCategories = createDefaultCategories(now).filter(
    (category) => !cloudCategoryIds.has(category.id)
  );

  await database.transaction(
    'rw',
    [...tables, database.balances, database.syncOutbox, database.deviceMetadata],
    async () => {
      for (const table of tables) await table.clear();
      await database.balances.clear();
      await database.syncOutbox.clear();

      for (const { local } of CANONICAL_TABLES) {
        const rows = snapshot[local];
        if (rows.length > 0) await getLocalTable(database, local).bulkPut(rows);
      }

      // Legacy cloud accounts could be missing the globally-colliding settings
      // row. Repair seed state inside the same transaction as adoption so a
      // failure cannot leave a bound browser with only half of a cloud ledger.
      if (snapshot.settings.length === 0) {
        const repaired = {
          ...createDefaultSettings(now),
          id: DEFAULT_SETTINGS_ID,
          setupCompleted: CANONICAL_TABLES.some(
            ({ local }) => local !== 'settings' && snapshot[local].length > 0
          ),
          updatedAt: now,
        };
        synthesizedSettings = repaired as unknown as Record<string, unknown>;
        await database.settings.put(repaired);
      }

      if (repairedCategories.length > 0) {
        await database.categories.bulkPut(repairedCategories);
      }

      await rebuildDerivedBalances(database, now);

      const existingBinding = await database.deviceMetadata.get(binding.id);
      if (
        existingBinding &&
        existingBinding.syncOwnerUserId !== binding.syncOwnerUserId
      ) {
        throw new Error('This device ledger was linked by another operation.');
      }
      await database.deviceMetadata.put(binding);
    }
  );

  return {
    settings: synthesizedSettings,
    categories: repairedCategories as unknown as Array<Record<string, unknown>>,
  };
}

async function claimEmptyCloudLedger(
  database: RavelDatabase,
  preparedBinding: DeviceMetadata
): Promise<DeviceMetadata> {
  const backup = await createBackup(database);
  const response = await fetch('/api/sync/claim-empty-ledger', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ backup }),
  });

  let payload: EmptyLedgerClaimResponse = {};
  try {
    payload = (await response.json()) as EmptyLedgerClaimResponse;
  } catch {
    // The status still determines the fail-closed error below.
  }

  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : 'Cloud ledger could not be initialized. Nothing was linked.'
    );
  }

  if (
    !Number.isInteger(payload.revision) ||
    Number(payload.revision) < 1 ||
    typeof payload.generation !== 'string' ||
    !UUID_PATTERN.test(payload.generation)
  ) {
    throw new Error('Cloud ledger initialization returned an invalid version. Nothing was linked.');
  }

  return {
    ...preparedBinding,
    cloudRevision: Number(payload.revision),
    cloudGeneration: payload.generation,
  };
}

async function commitPreparedBinding(
  binding: DeviceMetadata,
  database: RavelDatabase
): Promise<void> {
  await database.transaction('rw', database.deviceMetadata, async () => {
    const existing = await database.deviceMetadata.get(binding.id);
    if (existing) {
      if (existing.syncOwnerUserId !== binding.syncOwnerUserId) {
        throw new Error('This device ledger was linked by another operation.');
      }
      return;
    }
    await database.deviceMetadata.add(binding);
  });
}

/** Returns the exact preflight state the UI should present to the user. */
export async function inspectCloudAdoption(
  database: RavelDatabase = db
): Promise<LedgerLinkPlan> {
  return inspectDeviceLedgerLinkToCurrentUser(database);
}

/**
 * Use cloud data: validate the complete snapshot and prepare the account binding
 * without mutating IndexedDB. The canonical replacement, outbox clear, derived
 * balance rebuild, seed repair, and device binding then commit as one Dexie
 * transaction. Any failure leaves the original unbound local ledger intact.
 */
export async function adoptCloudLedger(
  database: RavelDatabase = db,
  beforeReplace?: () => void | Promise<void>
): Promise<void> {
  const plan = await inspectDeviceLedgerLinkToCurrentUser(database);
  const snapshot = await fetchValidatedCloudSnapshot(plan.userId);
  const binding = await prepareDeviceLedgerBindingToCurrentUser(database, 'use-cloud');
  if (binding.syncOwnerUserId !== plan.userId) {
    throw new Error('The signed-in account changed during cloud adoption. Nothing was replaced.');
  }
  await beforeReplace?.();
  const repairs = await replaceLocalCanonicalSnapshot(snapshot, binding, database);

  // Repair only rows the legacy cloud snapshot was missing. Re-uploading the
  // whole adopted ledger would make this newly linked device the latest writer
  // for unrelated records and could overwrite a concurrent real edit.
  for (const category of repairs.categories) {
    await pushRecord('categories', category, database);
  }
  if (repairs.settings) {
    await pushRecord('settings', repairs.settings, database);
  }
}

/** Merge this device: later successful local upserts win same-record conflicts. */
export async function mergeLocalLedgerIntoCloud(
  database: RavelDatabase = db
): Promise<void> {
  await linkDeviceLedgerToCurrentUser(database, 'merge-local');
  await pushLocalChanges(database);
  await pullUpdates(database);
}

/**
 * Empty cloud account: prepare the intended owner, atomically claim + seed the
 * server ledger, then persist the local binding. Any local changes made while
 * the server request was in flight remain in the outbox and are replayed after
 * binding, so the initial snapshot cannot silently erase concurrent local work.
 */
export async function linkEmptyCloudLedger(
  database: RavelDatabase = db
): Promise<void> {
  const preparedBinding = await prepareDeviceLedgerBindingToCurrentUser(database, 'empty-only');
  const binding = await claimEmptyCloudLedger(database, preparedBinding);
  await commitPreparedBinding(binding, database);
  await pushLocalChanges(database);
  await pullUpdates(database);
}
