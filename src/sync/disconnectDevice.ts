'use client';

import { db, type TapTrackDatabase } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';

/**
 * Disconnects only this browser from cloud sync. Canonical local finance data is
 * deliberately preserved. Pending outbox operations belong to the old binding,
 * so they are cleared atomically with the binding; a later explicit merge will
 * re-enqueue the current canonical local state under the newly chosen account.
 */
export async function disconnectDeviceLedger(
  database: TapTrackDatabase = db
): Promise<boolean> {
  let disconnected = false;

  await database.transaction(
    'rw',
    [database.deviceMetadata, database.syncOutbox],
    async () => {
      const binding = await database.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID);
      if (!binding) return;

      await database.syncOutbox.clear();
      await database.deviceMetadata.delete(DEVICE_LEDGER_BINDING_ID);
      disconnected = true;
    }
  );

  return disconnected;
}
