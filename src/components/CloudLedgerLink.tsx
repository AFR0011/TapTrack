'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  adoptCloudLedger,
  inspectCloudAdoption,
  linkEmptyCloudLedger,
  mergeLocalLedgerIntoCloud,
} from '@/sync/syncAdoption';
import type { LedgerLinkPlan } from '@/sync/syncBinding';
import { db } from '@/database';
import { exportJSON } from '@/exports/exportService';
import { downloadText } from '@/lib/download';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';

type CloudLedgerLinkProps = {
  onLinked: () => Promise<void> | void;
};

export function CloudLedgerLink({ onLinked }: CloudLedgerLinkProps) {
  const [plan, setPlan] = useState<LedgerLinkPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const inspect = async () => {
    setBusy(true);
    try {
      const nextPlan = await inspectCloudAdoption();
      if (nextPlan.state === 'already-linked') {
        await onLinked();
        toast.success('This device is already connected to your synced account.');
        return;
      }
      setPlan(nextPlan);
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'TapTrack could not check sync right now. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const persistPreAdoptionSafetyBackup = async () => {
    const backup = await exportJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(`taptrack-pre-sync-replace-${timestamp}.json`, backup, 'application/json');
  };

  const run = async (action: 'empty' | 'account' | 'merge') => {
    setBusy(true);
    try {
      if (action === 'empty') await linkEmptyCloudLedger();
      if (action === 'account') {
        await adoptCloudLedger(
          db,
          plan?.state === 'merge-choice' ? persistPreAdoptionSafetyBackup : undefined
        );
      }
      if (action === 'merge') await mergeLocalLedgerIntoCloud();
      const replacedLocalData = action === 'account' && plan?.state === 'merge-choice';
      setOpen(false);
      setConfirmReplace(false);
      setPlan(null);
      await onLinked();
      toast.success(
        action === 'account'
          ? replacedLocalData
            ? 'Synced account data loaded. A safety backup of this device was downloaded first.'
            : 'Synced account data loaded on this device.'
          : action === 'merge'
            ? 'The data on this device was combined with your synced account.'
            : 'This device is now connected to sync.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'This device could not be connected to sync. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || confirmReplace) return;
    const previousActive = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActive?.focus();
    };
  }, [busy, confirmReplace, open]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="mt-4"
        onClick={() => void inspect()}
        loading={busy && !open}
        disabled={busy}
      >
        Connect this device to sync
      </Button>

      {open && plan && !confirmReplace ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="w-full max-w-md rounded-[1.5rem] bg-surface p-5 shadow-[var(--shadow-overlay)] ring-1 ring-subtle"
          >
            <h3 id={titleId} className="text-base font-semibold text-primary">
              {plan.state === 'merge-choice' ? 'Choose what to keep' : 'Connect this device to sync'}
            </h3>
            <p id={descriptionId} className="mt-2 text-sm font-medium leading-6 text-secondary">
              {plan.state === 'remote-empty'
                ? 'Your synced account does not have TapTrack data yet. The data on this device will become the starting copy.'
                : plan.state === 'cloud-only'
                  ? 'There is no TapTrack data on this device to preserve. TapTrack can load the data already saved to your account.'
                  : 'This device and your synced account both contain TapTrack data. Keeping both is the safest choice.'}
            </p>

            {plan.state === 'merge-choice' ? (
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-accent/30 bg-accent-muted/40 p-4">
                  <span className="inline-flex rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-accent">Recommended</span>
                  <p className="mt-2 text-sm font-semibold text-primary">Keep both</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-muted">
                    Combine the data on this device with the data already saved to your account.
                  </p>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    onClick={() => void run('merge')}
                    disabled={busy}
                    loading={busy}
                  >
                    Keep both and connect
                  </Button>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface-muted p-4">
                  <p className="text-sm font-semibold text-primary">Use synced account only</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-muted">
                    Replace the TapTrack data on this device with the copy already saved to your account. A safety backup of this device will be downloaded first.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() => setConfirmReplace(true)}
                    disabled={busy}
                  >
                    Use synced account
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                className="mt-5 w-full"
                onClick={() => void run(plan.state === 'cloud-only' ? 'account' : 'empty')}
                disabled={busy}
                loading={busy}
              >
                {plan.state === 'cloud-only' ? 'Load synced account data' : 'Connect and sync'}
              </Button>
            )}

            <Button
              ref={cancelRef}
              type="button"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmReplace}
        title="Replace the data on this device?"
        message="TapTrack will first download a safety backup, then replace the current data on this device with the data in your synced account. The two ledgers will not be combined."
        confirmLabel="Use synced account"
        confirmVariant="danger"
        onConfirm={() => void run('account')}
        onCancel={() => setConfirmReplace(false)}
        confirmLoading={busy}
        cancelDisabled={busy}
      />
    </>
  );
}
