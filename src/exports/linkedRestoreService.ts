'use client';

import { db, type RavelDatabase } from '@/database';
import {
  applyPreparedBackupRestore,
  prepareBackupRestoreJSON,
  type RestoreBackupResult,
} from '@/exports/backupService';
import { getSyncAccess } from '@/sync/syncBinding';

export type RestoreSafetyBackupHandler = (safetyBackup: string) => void | Promise<void>;

type AccountRestoreResponse = {
  revision?: unknown;
  generation?: unknown;
  error?: unknown;
};

export async function restoreOnlyThisDevice(
  jsonData: string,
  beforeReplace: RestoreSafetyBackupHandler,
  database: RavelDatabase = db
): Promise<RestoreBackupResult> {
  const prepared = await prepareBackupRestoreJSON(jsonData, database);
  await beforeReplace(prepared.safetyBackup);
  return applyPreparedBackupRestore(prepared, database, { linkedMode: 'detach-device' });
}

export async function restoreSyncedAccount(
  jsonData: string,
  beforeReplace: RestoreSafetyBackupHandler,
  database: RavelDatabase = db
): Promise<RestoreBackupResult> {
  const access = await getSyncAccess(database);
  if (access.state !== 'linked' || !access.userId || !access.binding) {
    throw new Error('This browser ledger is not linked to the signed-in cloud account.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Account-wide restore requires an internet connection.');
  }

  const prepared = await prepareBackupRestoreJSON(jsonData, database);
  await beforeReplace(prepared.safetyBackup);

  let response: Response;
  try {
    response = await fetch('/api/restore-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backup: prepared.backup }),
    });
  } catch {
    throw new Error('The synced account could not be reached. Local data was not changed.');
  }

  const body = (await response.json().catch(() => null)) as AccountRestoreResponse | null;
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : 'Synced account restore failed.';
    throw new Error(`${message} Local data was not changed.`);
  }

  if (
    !body ||
    !Number.isInteger(body.revision) ||
    Number(body.revision) < 2 ||
    typeof body.generation !== 'string' ||
    body.generation.length === 0
  ) {
    throw new Error(
      'The synced account was restored but returned an invalid generation. Reload while online before making more changes.'
    );
  }

  try {
    return await applyPreparedBackupRestore(prepared, database, {
      linkedMode: 'preserve-binding',
      cloudVersion: {
        revision: Number(body.revision),
        generation: body.generation,
      },
    });
  } catch {
    throw new Error(
      'The synced account was restored, but this browser could not replace its local copy. Reload while online to adopt the restored ledger before making more changes.'
    );
  }
}
