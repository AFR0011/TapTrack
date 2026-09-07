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

/**
 * Advances one recurrence while preserving the schedule's original calendar
 * anchor. Monthly/yearly dates that do not exist are clamped to the last valid
 * day of the target month without changing the anchor for later occurrences.
 *
 * Example with a Jan 31 anchor: Jan 31 -> Feb 28 -> Mar 31.
 * Example with a Feb 29 yearly anchor: Feb 29 -> Feb 28 -> Feb 28 -> Feb 28 -> Feb 29.
 */
export function addFrequency(date: Date, frequency: Frequency, anchorDate: Date = date) {
  const nextDate = new Date(date);

  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      return nextDate;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      return nextDate;
    case 'monthly': {
      const targetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return createClampedDate(
        targetMonth.getFullYear(),
        targetMonth.getMonth(),
        anchorDate.getDate(),
        date
      );
    }
    case 'yearly':
      return createClampedDate(
        date.getFullYear() + 1,
        anchorDate.getMonth(),
        anchorDate.getDate(),
        date
      );
  }
}

function createClampedDate(year: number, month: number, requestedDay: number, source: Date) {
  const lastValidDay = new Date(year, month + 1, 0).getDate();
  return new Date(
    year,
    month,
    Math.min(requestedDay, lastValidDay),
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds()
  );
}

export function parseLocalDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}
