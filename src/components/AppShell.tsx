'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/transactions', label: 'History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/conversions', label: 'Transfer', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { href: '/budgets', label: 'Budgets', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/recurring', label: 'Recurring', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/reports', label: 'Reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37zM9 5a3 3 0 100-6 3 3 0 000 6z' },
];

const HEADER_NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/conversions', label: 'Transfers' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/recurring', label: 'Recurring' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
];

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Desktop header — glassmorphism */}
      <header className="sticky top-0 z-30 hidden border-b border-white/60 bg-white/95 shadow-sm shadow-slate-200/30 backdrop-blur-md md:block">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              TapTrack
            </Link>
            <p className="text-xs font-medium text-slate-500">Local-first finance console</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1 md:pb-0" aria-label="Primary">
            {HEADER_NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Page content with transition */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="mx-auto max-w-7xl px-4 py-5 md:py-7"
        >
          {children}
        </motion.main>
      </AnimatePresence>

      {/* Mobile bottom nav — glassmorphism + gradient pill */}
      <nav className="fixed inset-x-1 bottom-2 z-40 md:hidden" aria-label="Mobile">
        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_3rem] items-stretch gap-1 overflow-hidden rounded-2xl border border-white/60 bg-white/95 px-2 pt-2 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] shadow-glass backdrop-blur-md">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-xs leading-none transition-all ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-pill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon d={item.icon} className={`relative z-10 h-5 w-5 ${active ? 'stroke-[2]' : 'stroke-[1.5]'}`} />
                <span className="relative z-10 truncate">{item.label}</span>
              </Link>
            );
          })}
          {/* FAB for quick-log */}
          <Link
            href="/"
            aria-label="Quick log"
            className="relative -mt-5 flex h-12 w-12 items-center justify-center justify-self-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg shadow-blue-500/30 transition-all hover:opacity-90 active:scale-95"
          >
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          {/* Overflow dropdown for remaining items */}
          <div className="relative flex items-center justify-center">
            <details className="group">
              <summary className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-xs leading-none cursor-pointer text-slate-400 hover:text-slate-600 select-none">
                <Icon d="M4 6h16M4 12h16M4 18h16" />
                <span className="relative z-10 truncate">More</span>
                <motion.svg
                  d="M6 9l6 6 6-6"
                  className="h-3 w-3 transition-transform group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
              </summary>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {NAV_ITEMS.slice(5).map((item) => {
                  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
                        active ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon d={item.icon} className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </details>
          </div>
        </div>
      </nav>
    </div>
  );
}
