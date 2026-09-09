import { Skeleton } from '@/components/ui/Skeleton';

export default function ReportsLoadingFrame() {
  return (
    <div
      className="space-y-5 sm:space-y-6"
      data-route-skeleton="reports"
      aria-busy="true"
      aria-label="Loading Reports"
    >
      <span className="sr-only">Loading Reports…</span>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-9 w-36 max-w-[48vw] rounded-xl" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-11 w-36 max-w-[38vw] rounded-xl" />
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </header>

      <div
        data-layout="reports-summary"
        className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.4fr)] lg:items-stretch lg:gap-6"
      >
        <section className="min-w-0">
          <div className="flex min-h-[14rem] flex-col rounded-[1.75rem] bg-surface p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-11 w-48 max-w-[72%] rounded-xl" />
            <Skeleton className="mt-3 h-4 w-44 max-w-[66%]" />
            <div className="mt-auto grid grid-cols-2 gap-5 border-t border-subtle pt-5">
              <MetricLine />
              <MetricLine />
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-[1.75rem] bg-surface p-4 shadow-[0_10px_34px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-6 w-52 max-w-[75%]" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="mt-5 h-56 w-full rounded-2xl sm:h-64" />
          <Skeleton className="mt-4 h-11 w-full rounded-xl" />
        </section>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-muted p-1">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)] lg:items-start">
        <section className="rounded-[1.5rem] bg-surface p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-6 w-32" />
            </div>
            <Skeleton className="h-11 w-28 rounded-xl" />
          </div>
          <div className="mt-3 divide-y divide-subtle">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-start gap-3 py-3.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-28 max-w-[55%]" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-32 max-w-[65%]" />
                  <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.5rem] bg-surface p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:p-5">
          <Skeleton className="h-3 w-20" />
          <div className="mt-5 space-y-5">
            <InsightLine />
            <div className="h-px bg-border" />
            <InsightLine />
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricLine() {
  return (
    <div>
      <Skeleton className="h-3 w-14" />
      <Skeleton className="mt-2 h-6 w-24 max-w-full" />
    </div>
  );
}

function InsightLine() {
  return (
    <div>
      <Skeleton className="h-3 w-28" />
      <div className="mt-2 flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-32 max-w-[60%]" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}
