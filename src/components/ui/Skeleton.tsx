import { cn } from '@/lib/cn';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-shimmer rounded-lg bg-surface-muted', className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-subtle bg-surface p-5', className)} aria-hidden="true">
      <Skeleton className="mb-4 h-5 w-1/3" />
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-subtle bg-surface p-5', className)} aria-hidden="true">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-8 w-28" />
    </div>
  );
}

export function SkeletonListRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-subtle', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonListCard({
  titleWidth = 'w-40',
  count = 5,
  className,
}: {
  titleWidth?: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-subtle bg-surface', className)} aria-hidden="true">
      <div className="border-b border-subtle p-4">
        <Skeleton className={cn('h-5', titleWidth)} />
      </div>
      <SkeletonListRows count={count} />
    </div>
  );
}
