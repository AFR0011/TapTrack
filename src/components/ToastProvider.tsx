'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

const toastSurfaceStyle = {
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-overlay)',
} as const;

function useDocumentTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light');

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useDocumentTheme();

  return (
    <>
      {children}
      <Toaster
        theme={theme}
        position="bottom-center"
        duration={3000}
        offset="1.5rem"
        mobileOffset={{
          bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
        }}
        toastOptions={{
          style: toastSurfaceStyle,
          descriptionClassName: '!text-muted',
          classNames: {
            toast: 'rounded-lg border border-subtle bg-surface text-primary shadow-[var(--shadow-overlay)]',
            title: 'text-primary',
            description: 'text-muted',
            success:
              '!border-[var(--success)] !bg-[var(--success-muted)] !text-[var(--success)] [&_[data-description]]:!text-[var(--success)]',
            error:
              '!border-[var(--danger)] !bg-[var(--danger-muted)] !text-[var(--danger)] [&_[data-description]]:!text-[var(--danger)]',
          },
        }}
      />
    </>
  );
}
