import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';

export const CATEGORY_ICON_OPTIONS = [
  ['circle', 'Other', 'M12 20a8 8 0 100-16 8 8 0 000 16z'],
  ['utensils', 'Food', 'M7 3v7m3-7v7M7 7h3m-1.5 3v11M16 3c2 3 2 7 0 10v8m0-18v10'],
  ['coffee', 'Coffee', 'M5 8h11v6a5 5 0 01-5 5H9a4 4 0 01-4-4V8zm11 2h2a2 2 0 010 4h-2M7 4h7'],
  ['cart', 'Groceries', 'M3 4h2l2 11h10l3-8H6m3 12a1 1 0 100 2 1 1 0 000-2zm7 0a1 1 0 100 2 1 1 0 000-2z'],
  ['home', 'Home', 'M3 11l9-8 9 8M5 10v10h14V10m-9 10v-6h4v6'],
  ['bolt', 'Utilities', 'M13 2L5 13h6l-1 9 9-13h-6V2z'],
  ['car', 'Car', 'M5 16l1-6 2-4h8l2 4 1 6M4 13h16M7 17v2m10-2v2M7 10h10'],
  ['bus', 'Transit', 'M6 3h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zm-2 9h16M8 21l2-3m6 3l-2-3M8 7h8'],
  ['plane', 'Travel', 'M3 12l18-7-6 7 6 7-18-7zm8 0l4-7m-4 7l4 7'],
  ['fuel', 'Fuel', 'M6 3h8v18H6V3zm2 4h4m2 3h2l2 2v6a1 1 0 002 0V9l-2-2'],
  ['bag', 'Shopping', 'M5 8h14l-1 13H6L5 8zm4 0a3 3 0 016 0'],
  ['shirt', 'Clothing', 'M8 4l4 2 4-2 4 4-3 2v10H7V10L4 8l4-4z'],
  ['gift', 'Gifts', 'M4 10h16v11H4V10zm8 0v11M3 6h18v4H3V6zm9 0H8a2 2 0 110-4c2 0 4 4 4 4zm0 0h4a2 2 0 100-4c-2 0-4 4-4 4z'],
  ['heart', 'Health', 'M12 21S4 16 4 9a4 4 0 017-3l1 1 1-1a4 4 0 017 3c0 7-8 12-8 12z'],
  ['pill', 'Pharmacy', 'M7 17L17 7a4 4 0 00-6-6L1 11a4 4 0 006 6zm2-8l6 6'],
  ['dumbbell', 'Fitness', 'M5 8v8M2 10v4m17-6v8m3-6v4M5 12h14'],
  ['ticket', 'Entertainment', 'M4 7h16v4a2 2 0 000 4v2H4v-2a2 2 0 000-4V7zm8 2v6'],
  ['gamepad', 'Games', 'M7 8h10a5 5 0 014 8l-1 2a2 2 0 01-3 0l-2-2H9l-2 2a2 2 0 01-3 0l-1-2a5 5 0 014-8zm1 3v4m-2-2h4m6-1h.01m2 2h.01'],
  ['music', 'Music', 'M9 18V5l10-2v13M9 8l10-2M6 18a3 2 0 106 0 3 2 0 10-6 0zm10-2a3 2 0 106 0 3 2 0 10-6 0z'],
  ['book', 'Education', 'M4 4h7a3 3 0 013 3v13a3 3 0 00-3-3H4V4zm16 0h-3a3 3 0 00-3 3v13a3 3 0 013-3h3V4z'],
  ['briefcase', 'Work', 'M4 7h16v13H4V7zm5 0V4h6v3m-11 5h16'],
  ['laptop', 'Technology', 'M5 5h14v10H5V5zM3 19h18'],
  ['repeat', 'Subscriptions', 'M4 7h12l-3-3m3 3l-3 3m7 7H8l3 3m-3-3l3-3'],
  ['shield', 'Insurance', 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z'],
  ['receipt', 'Bills', 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6m-6 4h4'],
  ['landmark', 'Taxes', 'M3 9l9-6 9 6M5 10h14M6 10v7m4-7v7m4-7v7m4-7v7M4 19h16'],
  ['bank', 'Banking', 'M3 9l9-6 9 6M5 10h14M7 10v7m5-7v7m5-7v7M4 19h16'],
  ['wallet', 'Wallet', 'M4 6h14a2 2 0 012 2v11H5a2 2 0 01-2-2V7a3 3 0 013-3h11v2M15 12h5v4h-5a2 2 0 010-4z'],
  ['arrow-down', 'Income', 'M12 3v15m-6-6l6 6 6-6M5 21h14'],
  ['salary', 'Salary', 'M4 6h16v12H4V6zm4 4h8m-8 4h5M12 3v3'],
  ['refund', 'Refund', 'M8 7H4v-4m0 4a8 8 0 111 10'],
  ['chart', 'Investments', 'M4 19V9m5 10V5m5 14v-7m5 7V3'],
  ['coins', 'Savings', 'M12 6c4 0 7-1 7-2s-3-2-7-2-7 1-7 2 3 2 7 2zm-7-2v8c0 1 3 2 7 2s7-1 7-2V4m-14 8v4c0 1 3 2 7 2s7-1 7-2v-4'],
  ['pet', 'Pets', 'M8 10a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zm-4 2c-4 0-7 4-5 7 2 2 4 0 5 0s3 2 5 0c2-3-1-7-5-7zM5 14a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z'],
  ['users', 'Family', 'M9 11a4 4 0 100-8 4 4 0 000 8zm8-1a3 3 0 100-6M2 21a7 7 0 0114 0m0-6a6 6 0 016 6'],
] as const;

export type CategoryIconId = (typeof CATEGORY_ICON_OPTIONS)[number][0];

export const CATEGORY_COLOR_OPTIONS = [
  { value: '#2563eb', label: 'Blue' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#db2777', label: 'Pink' },
  { value: '#dc2626', label: 'Red' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#ca8a04', label: 'Gold' },
  { value: '#16a34a', label: 'Green' },
  { value: '#059669', label: 'Emerald' },
  { value: '#0891b2', label: 'Cyan' },
  { value: '#4f46e5', label: 'Indigo' },
  { value: '#475569', label: 'Slate' },
  { value: '#9333ea', label: 'Purple' },
] as const;

const CATEGORY_ICON_PATHS = new Map<string, string>(
  CATEGORY_ICON_OPTIONS.map(([id, , path]) => [id, path])
);

export function isCategoryIconId(value: string): value is CategoryIconId {
  return CATEGORY_ICON_PATHS.has(value);
}

export function isCategoryColor(value: string): boolean {
  return CATEGORY_COLOR_OPTIONS.some((item) => item.value === value);
}

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
