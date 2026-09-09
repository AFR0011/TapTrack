import { Skeleton } from '@/components/ui/Skeleton';

export default function BalancesLoadingFrame() {
  return (
    <section
      data-route-skeleton="balances"
      aria-busy="true"
      aria-label="Loading Balances"
      className="space-y-5 sm:space-y-6"
    >
      <span className="sr-only">Loading Balances…</span>

      <header className="min-w-0">
        <Skeleton className="h-8 w-36 rounded-xl" />
        <Skeleton className="mt-2 h-4 w-72 max-w-[78vw]" />
      </header>

      <div className="grid min-w-0 gap-4 md:grid-cols-2" data-layout="balances-grid-skeleton">
        <BalanceGroupFrame />
        <BalanceGroupFrame />
      </div>

      <div className="rounded-[1.35rem] bg-surface px-5 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)] ring-1 ring-subtle/70 dark:shadow-none">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-2 h-3 w-48 max-w-[70%]" />
          </div>
          <Skeleton className="h-5 w-5 rounded-lg" />
        </div>
      </div>
    </section>
  );
}

function BalanceGroupFrame() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
      <div className="p-5 sm:p-6">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-3 h-9 w-44 max-w-[72%] rounded-xl" />
      </div>
      <div className="divide-y divide-subtle border-t border-subtle">
        <BalanceRowFrame />
        <BalanceRowFrame />
      </div>
    </div>
  );
}

function BalanceRowFrame() {
  return (
    <div className="flex min-h-16 items-center gap-3 px-5 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
      <Skeleton className="h-4 w-16" />
      <div className="ml-auto flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-5 rounded-lg" />
      </div>
    </div>
  );
}
