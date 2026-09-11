import { cn } from '@/lib/cn';

type RavelMarkProps = {
  className?: string;
  title?: string;
};

export function RavelMark({ className, title = 'Ravel' }: RavelMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="16" fill="var(--brand-espresso)" />
      <path
        d="M18 46c0-14 5-24 18-31v13c-7 4-11 9-13 18H18Z"
        fill="var(--brand-bone)"
      />
      <path
        d="M25 46c1-12 6-21 19-27v11c-7 4-11 9-13 16h-6Z"
        fill="var(--brand-olive)"
      />
      <path
        d="M33 46c2-10 7-17 18-22v10c-6 3-9 7-11 12h-7Z"
        fill="var(--brand-copper)"
      />
      <path
        d="M41 46c2-7 6-12 12-15v9c-3 2-5 4-6 6h-6Z"
        fill="var(--brand-plum)"
      />
    </svg>
  );
}
