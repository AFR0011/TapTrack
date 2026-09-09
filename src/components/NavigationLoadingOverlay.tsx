'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import RouteLoadingFrame, {
  resolveRouteContentWidth,
  resolveRouteLoadingKind,
} from '@/components/RouteLoadingFrame';

const NAVIGATION_TIMEOUT_MS = 20_000;

type PendingNavigation = {
  fromPath: string;
  toPath: string;
};

export default function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const pendingPath =
    pendingNavigation?.fromPath === pathname ? pendingNavigation.toPath : null;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith('/app')) return;
      if (url.pathname === pathname) return;

      setPendingNavigation({ fromPath: pathname, toPath: url.pathname });
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname]);

  useEffect(() => {
    if (!pendingPath) return;
    const timeout = window.setTimeout(() => setPendingNavigation(null), NAVIGATION_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [pendingPath]);

  if (!pendingPath) return null;

  return (
    <div
      data-navigation-loading
      className="fixed inset-0 z-20 overflow-y-auto bg-background md:pt-[69px]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={`mx-auto w-full px-4 pt-5 pb-28 md:py-7 ${resolveRouteContentWidth(pendingPath)}`}
      >
        <RouteLoadingFrame kind={resolveRouteLoadingKind(pendingPath)} />
      </div>
    </div>
  );
}
