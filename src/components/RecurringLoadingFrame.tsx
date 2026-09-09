import { Skeleton } from '@/components/ui/Skeleton';

export default function RecurringLoadingFrame() {
  return (
    <section
      data-route-skeleton="recurring"
      aria-busy="true"
      aria-label="Loading recurring transactions"
      className="space-y-5 sm:space-y-6"
    >
      <span className="sr-only">Loading recurring transactions…</span>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-8 w-44 rounded-xl" />
          <Skeleton className="mt-2 h-4 w-[32rem] max-w-[88vw]" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg sm:w-36" />
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryFrame />
        <SummaryFrame />
        <SummaryFrame wide />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-subtle/70 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-2 h-3 w-[28rem] max-w-[90%]" />
        </div>
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>

      <div>
        <Skeleton className="h-6 w-36 rounded-lg" />
        <Skeleton className="mt-2 h-3 w-56" />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <RuleFrame />
          <RuleFrame />
          <RuleFrame />
          <RuleFrame />
        </div>
      </div>

      <div className="rounded-[1.5rem] bg-surface px-5 py-4 ring-1 ring-subtle/70 sm:px-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-3 w-44" />
      </div>
    </section>
  );
}

function SummaryFrame({ wide = false }: { wide?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-4 ring-1 ring-subtle/70 sm:px-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className={`mt-3 h-6 rounded-lg ${wide ? 'w-28' : 'w-10'}`} />
      <Skeleton className="mt-2 h-3 w-36 max-w-[90%]" />
    </div>
  );
}

function RuleFrame() {
  return (
    <div className="rounded-[1.35rem] bg-surface p-4 ring-1 ring-subtle/70 sm:p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-36 max-w-[80%]" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3">
        <Skeleton className="h-3 w-44 max-w-[65%]" />
        <Skeleton className="h-11 w-16 rounded-lg" />
      </div>
    </div>
  );
}
