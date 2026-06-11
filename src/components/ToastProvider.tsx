'use client';

import { Toaster } from 'sonner';

const toastSurfaceStyle = {
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-center"
        duration={3000}
        offset="1.5rem"
        mobileOffset={{
          bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
        }}
        toastOptions={{
          style: toastSurfaceStyle,
          descriptionClassName: 'text-muted',
          classNames: {
            toast: 'rounded-lg shadow-sm',
            title: 'text-primary',
            description: 'text-muted',
            success: '!bg-[var(--success-muted)] !text-[var(--success)] !border-[var(--success)]',
            error: '!bg-[var(--danger-muted)] !text-[var(--danger)] !border-[var(--danger)]',
          },
        }}
      />
    </>
  );
}
