import { describe, expect, it } from 'vitest';
import {
  addFrequency,
  formatDisplayMonth,
  formatLocalDate,
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

  it('returns previous month across year boundaries', () => {
    expect(getPreviousMonth('2026-01')).toBe('2025-12');
    expect(getPreviousMonth('2026-05')).toBe('2026-04');
  });

  it('adds frequency correctly', () => {
    const start = parseLocalDate('2026-05-18');
    expect(formatLocalDate(addFrequency(start, 'daily'))).toBe('2026-05-19');
    expect(formatLocalDate(addFrequency(start, 'weekly'))).toBe('2026-05-25');
    expect(formatLocalDate(addFrequency(start, 'monthly'))).toBe('2026-06-18');
    expect(formatLocalDate(addFrequency(start, 'yearly'))).toBe('2027-05-18');
  });

  it('formats month for display', () => {
    expect(formatDisplayMonth('2026-05')).toContain('2026');
  });
});
