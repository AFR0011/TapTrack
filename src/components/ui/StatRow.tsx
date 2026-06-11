import { cn } from '@/lib/cn';

type StatRowProps = {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad';
  className?: string;
};

const toneClasses = {
  default: 'text-primary',
  good: 'text-success',
  bad: 'text-danger',
};

export function StatRow({ label, value, tone = 'default', className }: StatRowProps) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2', className)}>
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', toneClasses[tone])}>{value}</span>
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  className?: string;
};

export function StatCard({ label, value, tone, className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border border-subtle bg-surface p-5', className)}>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums',
          tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-primary'
        )}
      >
        {value}
      </p>
    </div>
  );
}
