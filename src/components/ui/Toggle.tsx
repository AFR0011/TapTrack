import { cn } from '@/lib/cn';

type ToggleProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  variant?: 'default' | 'ai';
  className?: string;
};

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  variant = 'default',
  className,
}: ToggleProps) {
  const trackOn = variant === 'ai' ? 'bg-ai' : 'bg-accent';
  const focusRing =
    variant === 'ai' ? 'focus-visible:outline-[var(--ai)]' : 'focus-visible:outline-accent';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-transparent bg-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        focusRing,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-11 rounded-full transition-colors',
          checked ? trackOn : 'bg-surface-raised'
        )}
      >
        <span
          className={cn(
            'pointer-events-none absolute top-0.5 left-0.5 inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </span>
    </button>
  );
}

type ToggleRowProps = ToggleProps & {
  description?: string;
};

export function ToggleRow({ label, description, checked, onChange, disabled, variant, className }: ToggleRowProps) {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-4 py-3', className)}>
      <div className="min-w-0">
        <span className="text-sm font-semibold text-secondary">{label}</span>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        label={label}
        disabled={disabled}
        variant={variant}
      />
    </div>
  );
}
