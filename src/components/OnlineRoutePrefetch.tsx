'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const APP_ROUTES = [
  '/app',
  '/app/add',
  '/app/transactions',
  '/app/budgets',
  '/app/reports',
  '/app/balances',
  '/app/conversions',
  '/app/recurring',
  '/app/settings',
] as const;

export default function OnlineRoutePrefetch() {
  const router = useRouter();

  useEffect(() => {
    let timeout: number | null = null;

    const prefetchRoutes = () => {
      if (navigator.onLine === false) return;
      for (const route of APP_ROUTES) router.prefetch(route);
    };

    const schedulePrefetch = () => {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = window.setTimeout(prefetchRoutes, 120);
    };

    schedulePrefetch();
    window.addEventListener('online', schedulePrefetch);

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener('online', schedulePrefetch);
    };
  }, [router]);

  return null;
}
