import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  type CategoryIconId,
  isCategoryColor,
  isCategoryIconId,
} from '@/categories/categoryVisualTokens';

export {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  isCategoryColor,
  isCategoryIconId,
};
export type { CategoryIconId };

const CATEGORY_ICON_PATHS = new Map<string, string>(
  CATEGORY_ICON_OPTIONS.map(([id, , path]) => [id, path])
);

export function CategoryIcon({
  icon,
  color,
  className,
  ...props
}: {
  icon?: string;
  color?: string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'color'>) {
  const path = CATEGORY_ICON_PATHS.get(icon ?? '') ?? CATEGORY_ICON_PATHS.get('circle')!;
  return (
    <span
      className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', className)}
      style={{ backgroundColor: `${color ?? '#64748b'}18`, color: color ?? '#64748b' }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        {...props}
      >
        <path d={path} />
      </svg>
    </span>
  );
}
