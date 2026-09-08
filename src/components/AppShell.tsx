'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn, focusVisibleRing } from '@/lib/cn';
import MonthlyReconciliationPrompt from '@/components/MonthlyReconciliationPrompt';

const HOME_ICON = 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6';
const TRANSACTIONS_ICON = 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2';
const TRANSFERS_ICON = 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4';
const BUDGETS_ICON = 'M4 7h16M4 12h16M4 17h10';
const RECURRING_ICON = 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0011.9 2M18.5 9A7 7 0 006.6 7';
const REPORTS_ICON = 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z';
const SETTINGS_ICON = 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 001.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37z';
const MORE_ICON = 'M5 12h.01M12 12h.01M19 12h.01';

const MOBILE_PRIMARY_NAV_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: HOME_ICON },
  { href: '/app/transactions', label: 'Transactions', icon: TRANSACTIONS_ICON },
  { href: '/app/conversions', label: 'Transfers', icon: TRANSFERS_ICON },
  { href: '/app/reports', label: 'Reports', icon: REPORTS_ICON },
];

const MOBILE_MORE_NAV_ITEMS = [
  { href: '/app/budgets', label: 'Budgets', icon: BUDGETS_ICON },
  { href: '/app/recurring', label: 'Recurring', icon: RECURRING_ICON },
  { href: '/app/settings', label: 'Settings', icon: SETTINGS_ICON },
];

function resolveMainMaxWidth(pathname: string) {
  if (pathname === '/app' || pathname.startsWith('/app/add')) return 'max-w-2xl';
  if (pathname.startsWith('/app/settings')) return 'max-w-2xl';
  if (pathname.startsWith('/app/reports')) return 'max-w-7xl';
  if (pathname.startsWith('/app/transactions')) return 'max-w-6xl';
  return 'max-w-6xl';
}

const HEADER_NAV = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/transactions', label: 'Transactions' },
  { href: '/app/conversions', label: 'Transfers' },
  { href: '/app/budgets', label: 'Budgets' },
  { href: '/app/recurring', label: 'Recurring' },
  { href: '/app/reports', label: 'Reports' },
  { href: '/app/settings', label: 'Settings' },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function isNavItemActive(pathname: string, href: string) {
  return href === '/app' ? pathname === '/app' : pathname.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMorePath, setMobileMorePath] = useState<string | null>(null);
  const mobileMoreOpen = mobileMorePath === pathname;

  const forceDocumentNavigationOffline = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (navigator.onLine !== false) return;
    event.preventDefault();
    window.location.assign(href);
  };

  const mobileMoreActive = MOBILE_MORE_NAV_ITEMS.some((item) => isNavItemActive(pathname, item.href));

  return (
    <div className="min-h-screen bg-background text-primary" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <MonthlyReconciliationPrompt />

      <header className="sticky top-0 z-30 hidden border-b border-subtle bg-surface md:block">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/app"
              prefetch={false}
              onClick={(event) => forceDocumentNavigationOffline(event, '/app')}
              className={cn('rounded-lg text-xl font-bold tracking-tight text-accent', focusVisibleRing)}
            >
              TapTrack
            </Link>
            <p className="text-xs font-medium text-muted">Personal finance tracker</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/add"
              prefetch={false}
              onClick={(event) => forceDocumentNavigationOffline(event, '/app/add')}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90',
                focusVisibleRing
              )}
            >
              <span className="text-lg leading-none" aria-hidden="true">+</span>
              Add
            </Link>
            <nav className="flex gap-1 overflow-x-auto pb-1 md:pb-0" aria-label="Primary">
              {HEADER_NAV.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(event) => forceDocumentNavigationOffline(event, item.href)}
                    className={cn(
                      'relative inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      focusVisibleRing,
                      active
                        ? 'bg-accent text-white'
                        : 'text-secondary hover:bg-surface-muted hover:text-primary'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 pt-5 pb-28 md:py-7', resolveMainMaxWidth(pathname))}>
        {children}
      </main>

      {mobileMoreOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
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
          'fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl font-light leading-none text-white shadow-lg transition-all hover:scale-105 md:hidden',
          mobileMoreOpen && 'pointer-events-none opacity-0',
          focusVisibleRing
        )}
      >
        <span aria-hidden="true">+</span>
      </Link>

      <nav className="fixed inset-x-2 bottom-2 z-40 md:hidden" aria-label="Mobile">
        <div className="relative grid grid-cols-5 items-stretch gap-1 rounded-2xl border border-subtle bg-surface px-2 pt-2 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] shadow-sm">
          {MOBILE_PRIMARY_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={(event) => forceDocumentNavigationOffline(event, item.href)}
                className={cn(
                  'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] leading-none transition-all sm:text-xs',
                  focusVisibleRing,
                  active ? 'text-white' : 'text-muted hover:text-secondary'
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-pill"
                    className="absolute inset-0 rounded-xl bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                ) : null}
                <Icon d={item.icon} className={`relative z-10 h-5 w-5 ${active ? 'stroke-[2]' : 'stroke-[1.5]'}`} />
                <span className="relative z-10 max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={mobileMoreOpen}
            onClick={() => setMobileMorePath((current) => (current === pathname ? null : pathname))}
            className={cn(
              'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] leading-none transition-all sm:text-xs',
              focusVisibleRing,
              mobileMoreActive ? 'text-white' : 'text-muted hover:text-secondary'
            )}
          >
            {mobileMoreActive ? (
              <motion.span
                layoutId="mobile-pill"
                className="absolute inset-0 rounded-xl bg-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            ) : null}
            <Icon d={MORE_ICON} className={`relative z-10 h-5 w-5 ${mobileMoreActive ? 'stroke-[2]' : 'stroke-[1.5]'}`} />
            <span className="relative z-10">More</span>
          </button>

          {mobileMoreOpen ? (
            <div
              role="menu"
              className="absolute right-0 bottom-[calc(100%+0.5rem)] w-52 overflow-hidden rounded-2xl border border-subtle bg-surface p-1.5 shadow-lg"
            >
              {MOBILE_MORE_NAV_ITEMS.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    prefetch={false}
                    onClick={(event) => {
                      setMobileMorePath(null);
                      forceDocumentNavigationOffline(event, item.href);
                    }}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      focusVisibleRing,
                      active ? 'bg-accent text-white' : 'text-secondary hover:bg-surface-muted hover:text-primary'
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
