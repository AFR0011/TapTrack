import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center', compact ? 'py-4' : 'py-8', className)}>
      <p className="text-sm font-semibold text-secondary">{title}</p>
      {description ? <p className="mt-1 text-sm font-medium text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
