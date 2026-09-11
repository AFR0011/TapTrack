'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/Button';

type RestoreScopeDialogProps = {
  open: boolean;
  busy: boolean;
  onRestoreAccount: () => void;
  onRestoreDevice: () => void;
  onCancel: () => void;
};

export function RestoreScopeDialog({
  open,
  busy,
  onRestoreAccount,
  onRestoreDevice,
  onCancel,
}: RestoreScopeDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
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
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-xl border border-subtle bg-surface p-5 shadow-[var(--shadow-overlay)]"
      >
        <h3 id={titleId} className="text-base font-semibold text-primary">
          Where should this backup be restored?
        </h3>
        <p id={descriptionId} className="mt-2 text-sm font-medium text-secondary">
          This device is connected to sync. Choose whether the backup should replace data only here or across your synced account.
        </p>

        <div className="mt-5 grid gap-3">
          <div className="rounded-lg border border-danger/40 bg-danger-muted p-4">
            <p className="text-sm font-semibold text-danger">Restore synced account</p>
            <p className="mt-1 text-xs font-medium text-secondary">
              Replace the Ravel data in your synced account with this backup. Other connected devices will receive the restored data when they next sync.
            </p>
            <Button
              type="button"
              variant="danger"
              className="mt-3 w-full"
              onClick={onRestoreAccount}
              disabled={busy}
            >
              Restore synced account
            </Button>
          </div>

          <div className="rounded-lg border border-subtle bg-surface-muted p-4">
            <p className="text-sm font-semibold text-primary">Restore only this device</p>
            <p className="mt-1 text-xs font-medium text-muted">
              Disconnect this device from sync, restore the backup here, and leave your synced account and other devices unchanged.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full"
              onClick={onRestoreDevice}
              disabled={busy}
            >
              Restore only this device
            </Button>
          </div>
        </div>

        <Button
          ref={cancelRef}
          type="button"
          variant="ghost"
          className="mt-3 w-full"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
