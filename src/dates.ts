import type { Frequency } from '@/types';

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonth(date = new Date()) {
  return formatLocalDate(date).slice(0, 7);
}

/**
 * Exact ordering is trustworthy when activity is being recorded for today.
 * Historical entries keep only their business date until a reconciliation on
 * that same date makes before/after ordering necessary.
 */
export function getAutomaticOccurredAt(date: string, now = new Date()): string | undefined {
  return date === formatLocalDate(now) ? now.toISOString() : undefined;
}

export function formatDisplayMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

export function getPreviousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const previousDate = new Date(year, monthNumber - 2, 1);
  return formatLocalDate(previousDate).slice(0, 7);
}

export function addFrequency(date: Date, frequency: Frequency) {
  const nextDate = new Date(date);

  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  return nextDate;
}

export function parseLocalDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}
