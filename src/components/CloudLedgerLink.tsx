'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  adoptCloudLedger,
  inspectCloudAdoption,
  linkEmptyCloudLedger,
  mergeLocalLedgerIntoCloud,
} from '@/sync/syncAdoption';
import type { LedgerLinkPlan } from '@/sync/syncBinding';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

type CloudLedgerLinkProps = {
  onLinked: () => Promise<void> | void;
};

export function CloudLedgerLink({ onLinked }: CloudLedgerLinkProps) {
  const [plan, setPlan] = useState<LedgerLinkPlan | null>(null);
  const [open, setOpen] = useState(false);
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
        toast.success('This device is already linked to this account.');
        return;
      }
      setPlan(nextPlan);
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cloud sync could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: 'empty' | 'cloud' | 'merge') => {
    setBusy(true);
    try {
      if (action === 'empty') await linkEmptyCloudLedger();
      if (action === 'cloud') await adoptCloudLedger();
      if (action === 'merge') await mergeLocalLedgerIntoCloud();
      setOpen(false);
      setPlan(null);
      await onLinked();
      toast.success(
        action === 'cloud'
          ? 'Cloud ledger loaded on this device.'
          : action === 'merge'
            ? 'This device ledger was merged into the account.'
            : 'This device ledger is now linked and synced.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cloud ledger could not be linked.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
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
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
  }, [busy, open]);

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
        Link this device ledger
      </Button>

      {open && plan ? (
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
            className="w-full max-w-md rounded-xl border border-subtle bg-surface p-5 shadow-[var(--shadow-overlay)]"
          >
            <h3 id={titleId} className="text-base font-semibold text-primary">
              {plan.state === 'merge-choice' ? 'Choose how to link this device' : 'Link cloud sync'}
            </h3>
            <p id={descriptionId} className="mt-2 text-sm font-medium text-secondary">
              {plan.state === 'remote-empty'
                ? 'This account has no TapTrack cloud ledger yet. This device will become its starting ledger.'
                : plan.state === 'cloud-only'
                  ? 'This device has no local finance data to preserve. TapTrack can safely load the existing cloud ledger here.'
                  : 'Both this device and the account contain TapTrack data. Choose which reconciliation you want. TapTrack will not remember a default choice.'}
            </p>

            {plan.state === 'merge-choice' ? (
              <div className="mt-5 grid gap-3">
                <div className="rounded-lg border border-subtle bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-primary">Use cloud data</p>
                  <p className="mt-1 text-xs font-medium text-muted">
                    Replace this device’s local ledger with the account’s cloud ledger. The full cloud snapshot is validated before local data is replaced.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() => void run('cloud')}
                    disabled={busy}
                    loading={busy}
                  >
                    Use cloud data
                  </Button>
                </div>
                <div className="rounded-lg border border-subtle bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-primary">Merge this device</p>
                  <p className="mt-1 text-xs font-medium text-muted">
                    Upload this device’s canonical records into the account, then download the resulting ledger. For the same record, the later successful sync wins.
                  </p>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    onClick={() => void run('merge')}
                    disabled={busy}
                    loading={busy}
                  >
                    Merge this device
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                className="mt-5 w-full"
                onClick={() => void run(plan.state === 'cloud-only' ? 'cloud' : 'empty')}
                disabled={busy}
                loading={busy}
              >
                {plan.state === 'cloud-only' ? 'Use cloud data' : 'Link and sync'}
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
    </>
  );
}
