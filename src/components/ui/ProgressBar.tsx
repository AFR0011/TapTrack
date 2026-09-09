import { cn } from '@/lib/cn';

type ProgressBarProps = {
  percent: number;
  compact?: boolean;
  className?: string;
  showLabel?: boolean;
  label?: string;
  usedLabel?: string;
  remainingLabel?: string;
  ariaLabel?: string;
  ariaValueText?: string;
};

function barColor(percent: number) {
  if (percent >= 100) return 'bg-danger';
  if (percent >= 80) return 'bg-warning';
  return 'bg-accent';
}

export function ProgressBar({
  percent,
  compact = false,
  className,
  showLabel = false,
  label,
  usedLabel,
  remainingLabel,
  ariaLabel,
  ariaValueText,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const hasFooter = Boolean(usedLabel || remainingLabel);
  const accessibleLabel = ariaLabel ?? label ?? 'Progress';
  const accessibleValueText = ariaValueText ?? usedLabel ?? `${Math.round(clamped)}%`;

  return (
    <div className={className}>
      {showLabel && label ? (
        <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      ) : null}
      <div
        className={cn('overflow-hidden rounded-full bg-surface-muted', compact ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-label={accessibleLabel}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={accessibleValueText}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-out', barColor(percent))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {hasFooter ? (
        <div className="mt-2 flex justify-between gap-3 text-xs font-medium text-muted">
          <span>{usedLabel}</span>
          <span className="text-right">{remainingLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
