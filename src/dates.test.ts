import { describe, expect, it } from 'vitest';
import {
  addFrequency,
  formatDisplayMonth,
  formatLocalDate,
  getAutomaticOccurredAt,
  getCurrentMonth,
  getPreviousMonth,
  parseLocalDate,
} from './dates';

describe('date helpers', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns current month string', () => {
    expect(getCurrentMonth(new Date(2026, 4, 18))).toBe('2026-05');
  });

  it('adds an exact occurrence timestamp only for current-day activity', () => {
    const now = new Date(2026, 4, 18, 14, 30, 0);
    expect(getAutomaticOccurredAt('2026-05-18', now)).toBe(now.toISOString());
    expect(getAutomaticOccurredAt('2026-05-17', now)).toBeUndefined();
  });

  it('returns previous month across year boundaries', () => {
    expect(getPreviousMonth('2026-01')).toBe('2025-12');
    expect(getPreviousMonth('2026-05')).toBe('2026-04');
  });

  it('adds ordinary frequencies correctly', () => {
    const start = parseLocalDate('2026-05-18');
    expect(formatLocalDate(addFrequency(start, 'daily'))).toBe('2026-05-19');
    expect(formatLocalDate(addFrequency(start, 'weekly'))).toBe('2026-05-25');
    expect(formatLocalDate(addFrequency(start, 'monthly'))).toBe('2026-06-18');
    expect(formatLocalDate(addFrequency(start, 'yearly'))).toBe('2027-05-18');
  });

  it('clamps monthly recurrences without losing the original day anchor', () => {
    const anchor = parseLocalDate('2027-01-31');
    const february = addFrequency(anchor, 'monthly', anchor);
    const march = addFrequency(february, 'monthly', anchor);
    const april = addFrequency(march, 'monthly', anchor);

    expect(formatLocalDate(february)).toBe('2027-02-28');
    expect(formatLocalDate(march)).toBe('2027-03-31');
    expect(formatLocalDate(april)).toBe('2027-04-30');
  });

  it('uses February 29 again when a yearly leap-day recurrence reaches a leap year', () => {
    const anchor = parseLocalDate('2024-02-29');
    const y2025 = addFrequency(anchor, 'yearly', anchor);
    const y2026 = addFrequency(y2025, 'yearly', anchor);
    const y2027 = addFrequency(y2026, 'yearly', anchor);
    const y2028 = addFrequency(y2027, 'yearly', anchor);

    expect(formatLocalDate(y2025)).toBe('2025-02-28');
    expect(formatLocalDate(y2026)).toBe('2026-02-28');
    expect(formatLocalDate(y2027)).toBe('2027-02-28');
    expect(formatLocalDate(y2028)).toBe('2028-02-29');
  });

  it('formats month for display', () => {
    expect(formatDisplayMonth('2026-05')).toContain('2026');
  });
});
