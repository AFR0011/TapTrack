import { Skeleton } from '@/components/ui/Skeleton';

export default function ConversionsLoadingFrame() {
  return (
    <section
      data-route-skeleton="conversions"
      aria-busy="true"
      aria-label="Loading transfers and exchanges"
      className="space-y-5 sm:space-y-6"
    >
      <span className="sr-only">Loading transfers and exchanges…</span>

      <header>
        <Skeleton className="h-8 w-64 max-w-[78vw] rounded-xl" />
        <Skeleton className="mt-2 h-4 w-96 max-w-[88vw]" />
      </header>

      <div className="flex gap-1 rounded-2xl bg-surface-muted p-1 sm:w-fit">
        <Skeleton className="h-11 flex-1 rounded-xl sm:w-28" />
        <Skeleton className="h-11 flex-1 rounded-xl sm:w-28" />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]" data-layout="conversions-workspace-skeleton">
        <div className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-subtle/70 sm:p-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-7 w-56 max-w-[80%] rounded-xl" />
          <Skeleton className="mt-2 h-4 w-80 max-w-[92%]" />
          <div className="mt-6 space-y-4">
            <MovePanelFrame />
            <div className="flex items-center gap-3 px-2">
              <Skeleton className="h-px flex-1" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-px flex-1" />
            </div>
            <MovePanelFrame />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-subtle/70 sm:p-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-7 w-44 rounded-xl" />
          <Skeleton className="mt-2 h-4 w-56 max-w-[80%]" />
          <Skeleton className="mt-6 h-28 w-full rounded-[1.25rem]" />
          <Skeleton className="mt-5 h-24 w-full rounded-xl" />
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
          <Skeleton className="mt-5 h-16 w-full rounded-xl" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] bg-surface ring-1 ring-subtle/70">
        <div className="border-b border-subtle px-5 py-4 sm:px-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
        <div className="divide-y divide-subtle">
          <MoveRowFrame />
          <MoveRowFrame />
          <MoveRowFrame />
        </div>
      </div>
    </section>
  );
}

function MovePanelFrame() {
  return (
    <div className="rounded-[1.25rem] bg-surface-muted/70 p-4 ring-1 ring-subtle/70 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-3 w-10" />
          <Skeleton className="mt-2 h-5 w-28" />
        </div>
        <div className="flex flex-col items-end">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-5 w-24" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-20 w-full rounded-lg" />
    </div>
  );
}

function MoveRowFrame() {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-40 max-w-[70%]" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
