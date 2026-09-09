'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn, focusVisibleRing } from '@/lib/cn';
import MonthlyReconciliationPrompt from '@/components/MonthlyReconciliationPrompt';

const HOME_ICON = 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6';
const TRANSACTIONS_ICON = 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2';
const TRANSFERS_ICON = 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4';
const BUDGETS_ICON = 'M4 7h16M4 12h16M4 17h10';
const RECURRING_ICON = 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0011.9 2M18.5 9A7 7 0 006.6 7';
const REPORTS_ICON = 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z';
const BALANCES_ICON = 'M3 7.5A2.5 2.5 0 015.5 5H18a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3V7.5zm0 0A2.5 2.5 0 005.5 10H21m-5 4h2';
const SETTINGS_ICON = 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543-.94-3.31.826-2.37-2.37a1.724 1.724 0 001.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37z';
const MORE_ICON = 'M5 12h.01M12 12h.01M19 12h.01';

const PRIMARY_NAV_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: HOME_ICON },
  { href: '/app/transactions', label: 'Transactions', icon: TRANSACTIONS_ICON },
  { href: '/app/budgets', label: 'Budgets', icon: BUDGETS_ICON },
  { href: '/app/reports', label: 'Reports', icon: REPORTS_ICON },
];

const MORE_NAV_ITEMS = [
  { href: '/app/balances', label: 'Balances', icon: BALANCES_ICON },
  { href: '/app/conversions', label: 'Transfers', icon: TRANSFERS_ICON },
  { href: '/app/recurring', label: 'Recurring', icon: RECURRING_ICON },
  { href: '/app/settings', label: 'Settings', icon: SETTINGS_ICON },
];

function resolveMainMaxWidth(pathname: string) {
  if (pathname.startsWith('/app/add')) return 'max-w-2xl';
  if (
    pathname === '/app' ||
    pathname.startsWith('/app/reports') ||
    pathname.startsWith('/app/transactions') ||
    pathname.startsWith('/app/budgets')
  ) {
    return 'max-w-7xl';
  }
  if (pathname.startsWith('/app/settings')) return 'max-w-6xl';
  return 'max-w-6xl';
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function isNavItemActive(pathname: string, href: string) {
  return href === '/app' ? pathname === '/app' : pathname.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [mobileMorePath, setMobileMorePath] = useState<string | null>(null);
  const mobileMoreOpen = mobileMorePath === pathname;
  const mobileMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousPathRef = useRef(pathname);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileMorePath(null);
      requestAnimationFrame(() => mobileMoreButtonRef.current?.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMoreOpen]);

  useEffect(() => {
    if (previousPathRef.current === pathname) return;
    previousPathRef.current = pathname;
    const frame = requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const forceDocumentNavigationOffline = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (navigator.onLine !== false) return;
    event.preventDefault();
    window.location.assign(href);
  };

  const moreActive = MORE_NAV_ITEMS.some((item) => isNavItemActive(pathname, item.href));
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 500, damping: 35 };

  return (
    <div
      className="min-h-dvh bg-background text-primary"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-[var(--shadow-overlay)]"
      >
        Skip to main content
      </a>

      <MonthlyReconciliationPrompt />

      <header className="sticky top-0 z-30 hidden border-b border-subtle bg-surface md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3">
          <Link
            href="/app"
            prefetch={false}
            onClick={(event) => forceDocumentNavigationOffline(event, '/app')}
            className={cn('rounded-lg text-xl font-bold tracking-tight text-accent', focusVisibleRing)}
          >
            TapTrack
          </Link>

          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1" aria-label="Primary">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(event) => forceDocumentNavigationOffline(event, item.href)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      focusVisibleRing,
                      active
                        ? 'bg-action-primary text-white'
                        : 'text-secondary hover:bg-surface-muted hover:text-primary'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <details key={pathname} className="group relative">
                <summary
                  className={cn(
                    'flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors select-none [&::-webkit-details-marker]:hidden',
                    focusVisibleRing,
                    moreActive
                      ? 'bg-action-primary text-white'
                      : 'text-secondary hover:bg-surface-muted hover:text-primary'
                  )}
                >
                  More
                  <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div
                  role="group"
                  aria-label="More navigation"
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-2xl border border-subtle bg-surface p-1.5 shadow-[var(--shadow-overlay)]"
                >
                  {MORE_NAV_ITEMS.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={(event) => forceDocumentNavigationOffline(event, item.href)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                          focusVisibleRing,
                          active
                            ? 'bg-action-primary text-white'
                            : 'text-secondary hover:bg-surface-muted hover:text-primary'
                        )}
                      >
                        <Icon d={item.icon} className="h-5 w-5 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            </nav>

            <Link
              href="/app/add"
              prefetch={false}
              onClick={(event) => forceDocumentNavigationOffline(event, '/app/add')}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover',
                focusVisibleRing
              )}
            >
              <span className="text-lg leading-none" aria-hidden="true">+</span>
              Add
            </Link>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn('mx-auto px-4 pt-5 pb-28 outline-none md:py-7', resolveMainMaxWidth(pathname))}
      >
        {children}
      </main>

      {mobileMoreOpen ? (
        <button
          type="button"
          aria-label="Close more navigation"
          className="fixed inset-0 z-30 bg-transparent md:hidden"
          onClick={() => setMobileMorePath(null)}
        />
      ) : null}

      <Link
        href="/app/add"
        prefetch={false}
        onClick={(event) => forceDocumentNavigationOffline(event, '/app/add')}
        aria-label="Add transaction"
        className={cn(
          'fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-action-primary text-3xl font-light leading-none text-white shadow-lg transition-transform hover:scale-105 md:hidden',
          mobileMoreOpen && 'pointer-events-none opacity-0',
          focusVisibleRing
        )}
      >
        <span aria-hidden="true">+</span>
      </Link>

      <nav className="fixed inset-x-2 bottom-2 z-40 md:hidden" aria-label="Mobile">
        <div className="relative grid grid-cols-5 items-stretch gap-1 rounded-2xl border border-subtle bg-surface px-2 pt-2 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] shadow-sm">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={(event) => forceDocumentNavigationOffline(event, item.href)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] leading-none transition-colors sm:text-xs',
                  focusVisibleRing,
                  active ? 'text-white' : 'text-muted hover:text-secondary'
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-pill"
                    className="absolute inset-0 rounded-xl bg-action-primary"
                    transition={pillTransition}
                  />
                ) : null}
                <Icon
                  d={item.icon}
                  className={`relative z-10 h-5 w-5 ${active ? 'stroke-[2]' : 'stroke-[1.5]'}`}
                />
                <span className="relative z-10 max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            ref={mobileMoreButtonRef}
            type="button"
            aria-expanded={mobileMoreOpen}
            aria-controls="mobile-more-links"
            onClick={() => setMobileMorePath((current) => (current === pathname ? null : pathname))}
            className={cn(
              'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] leading-none transition-colors sm:text-xs',
              focusVisibleRing,
              moreActive ? 'text-white' : 'text-muted hover:text-secondary'
            )}
          >
            {moreActive ? (
              <motion.span
                layoutId="mobile-pill"
                className="absolute inset-0 rounded-xl bg-action-primary"
                transition={pillTransition}
              />
            ) : null}
            <Icon
              d={MORE_ICON}
              className={`relative z-10 h-5 w-5 ${moreActive ? 'stroke-[2]' : 'stroke-[1.5]'}`}
            />
            <span className="relative z-10">More</span>
          </button>

          {mobileMoreOpen ? (
            <div
              id="mobile-more-links"
              role="group"
              aria-label="More navigation"
              className="absolute right-0 bottom-[calc(100%+0.5rem)] w-56 overflow-hidden rounded-2xl border border-subtle bg-surface p-1.5 shadow-lg"
            >
              {MORE_NAV_ITEMS.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(event) => {
                      setMobileMorePath(null);
                      forceDocumentNavigationOffline(event, item.href);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      focusVisibleRing,
                      active
                        ? 'bg-action-primary text-white'
                        : 'text-secondary hover:bg-surface-muted hover:text-primary'
                    )}
                  >
                    <Icon d={item.icon} className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
