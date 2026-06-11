import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function PageHeader({ title, description, action, compact = false, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        compact ? 'gap-2' : 'gap-3',
        className
      )}
    >
      <div>
        <h1 className={cn('font-semibold text-primary', compact ? 'text-xl' : 'text-2xl')}>{title}</h1>
        {description ? <p className="mt-1 text-sm font-medium text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
