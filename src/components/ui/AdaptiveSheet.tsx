'use client';

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn, focusVisibleRing } from '@/lib/cn';

interface AdaptiveSheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function AdaptiveSheet({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: AdaptiveSheetProps) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>(
        '[data-sheet-autofocus], input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)'
      );
      (preferred ?? panel).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements || focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
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
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, [open]);

  const widthClass =
    size === 'lg' ? 'sm:max-w-2xl' : size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex min-h-dvh items-end justify-center bg-[var(--overlay)] sm:items-center sm:p-4"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseRef.current();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-surface shadow-[var(--shadow-overlay)] ring-1 ring-subtle outline-none sm:rounded-[1.5rem]',
              widthClass
            )}
            initial={reduceMotion ? false : { opacity: 0, y: 36, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.99 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
          >
            <div className="shrink-0 px-4 pt-2 sm:hidden" aria-hidden="true">
              <div className="mx-auto h-1 w-10 rounded-full bg-border-strong/70" />
            </div>

            <div className="flex shrink-0 items-start gap-4 border-b border-subtle px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold tracking-tight text-primary">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm font-medium text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onCloseRef.current()}
                aria-label="Close"
                className={cn(
                  'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-muted hover:text-primary',
                  focusVisibleRing
                )}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {children}
            </div>

            {footer ? (
              <div className="shrink-0 border-t border-subtle bg-surface px-4 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
