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
        toast.success('This device was disconnected from cloud sync. Local finance data was kept.');
      }
      setConfirmOpen(false);
      await onDisconnected?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'This device could not be disconnected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-3 rounded-xl border border-subtle bg-surface-muted p-4">
        <p className="text-sm font-semibold text-primary">Device cloud link</p>
        <p className="mt-1 text-xs font-medium text-muted">
          Disconnecting keeps this browser’s ledger and leaves the cloud account unchanged. Pending
          sync operations for the current link are cleared; relinking later requires an explicit
          cloud/adoption choice.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          Disconnect this device
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect this device from cloud sync?"
        message="Your local finance ledger will stay on this browser and the cloud account will not be changed. Pending sync operations for this device link will be discarded. If you link again later, TapTrack will ask how to reconcile local and cloud data."
        confirmLabel="Disconnect device"
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
