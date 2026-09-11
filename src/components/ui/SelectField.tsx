import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn, focusVisibleRing } from '@/lib/cn';

export type SelectOption = string | { value: string; label: string };

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  id?: string;
  options: readonly SelectOption[];
  error?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, id, options, error, className, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;

    return (
      <label htmlFor={fieldId} className="grid min-w-0 gap-1.5">
        <span className="text-sm font-medium text-secondary">{label}</span>
        <select
          ref={ref}
          id={fieldId}
          className={cn(
            'min-h-11 min-w-0 w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-base font-medium text-primary outline-none transition-colors focus-visible:border-accent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted md:text-sm',
            focusVisibleRing,
            error && 'border-danger focus-visible:border-danger focus-visible:outline-danger',
            className
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...props}
        >
          {options.map((option) => {
            const value = typeof option === 'string' ? option : option.value;
            const optionLabel = typeof option === 'string' ? option : option.label;
            return (
              <option key={value} value={value}>
                {optionLabel}
              </option>
            );
          })}
        </select>
        {error ? (
          <span id={`${fieldId}-error`} role="alert" className="text-sm font-medium text-danger">
            {error}
          </span>
        ) : null}
      </label>
    );
  }
);

SelectField.displayName = 'SelectField';
