import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn, focusVisibleRing } from '@/lib/cn';

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  id?: string;
  error?: string;
  hint?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, id, error, hint, className, ...props }, ref) => {
    const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-');

    return (
      <label htmlFor={fieldId} className="grid gap-1.5">
        <span className="text-sm font-medium text-secondary">{label}</span>
        <input
          ref={ref}
          id={fieldId}
          className={cn(
            'min-h-11 w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm font-medium text-primary outline-none transition-colors placeholder:text-muted focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60',
            focusVisibleRing,
            error && 'border-danger focus-visible:border-danger focus-visible:outline-danger',
            className
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
        {hint && !error ? (
          <span id={`${fieldId}-hint`} className="text-xs text-muted">
            {hint}
          </span>
        ) : null}
        {error ? (
          <span id={`${fieldId}-error`} role="alert" className="text-sm font-medium text-danger">
            {error}
          </span>
        ) : null}
      </label>
    );
  }
);

Field.displayName = 'Field';
