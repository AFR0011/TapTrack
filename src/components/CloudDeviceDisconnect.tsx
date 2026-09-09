'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';
import { disconnectDeviceLedger } from '@/sync/disconnectDevice';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from './ConfirmDialog';

type CloudDeviceDisconnectProps = {
  onDisconnected?: () => void | Promise<void>;
};

export function CloudDeviceDisconnect({ onDisconnected }: CloudDeviceDisconnectProps) {
  const binding = useLiveQuery(() => db.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!binding) return null;

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const changed = await disconnectDeviceLedger(db);
      if (changed) {
        toast.success('This device was disconnected from sync. Its TapTrack data was kept.');
      }
      setConfirmOpen(false);
      await onDisconnected?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'This device could not be disconnected. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-3 rounded-xl border border-subtle bg-surface-muted p-4">
        <p className="text-sm font-semibold text-primary">This device</p>
        <p className="mt-1 text-xs font-medium text-muted">
          Disconnecting stops this device from syncing. The TapTrack data already on this device stays here, and your synced account is not changed.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          Disconnect from sync
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect this device from sync?"
        message="TapTrack will keep the data already on this device and leave your synced account unchanged. If you connect this device again later, TapTrack will ask how you want to combine the two sets of data."
        confirmLabel="Disconnect device"
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
