import { clsx, type ClassValue } from 'clsx';

export const focusVisibleRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
