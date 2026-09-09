import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalCaptureRequestId, parseCaptureBody } from './route';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Quick Capture request validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a minimal current expense and applies server defaults later', () => {
    expect(
      parseCaptureBody({
        requestId: REQUEST_ID,
        type: 'expense',
        amount: 250,
        title: 'coffee',
        date: '2026-09-08',
      })
    ).toEqual({
      ok: true,
      requestId: REQUEST_ID,
      type: 'expense',
      amount: 250,
      currency: undefined,
      title: 'coffee',
      method: undefined,
      date: '2026-09-08',
      note: undefined,
    });
  });

  it('accepts arbitrary supported three-letter currencies', () => {
    const parsed = parseCaptureBody({
      type: 'expense',
      amount: 25,
      currency: 'gbp',
      title: 'lunch',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.currency).toBe('GBP');
  });

  it('allows an omitted request marker for the simplified Shortcut flow', () => {
    const parsed = parseCaptureBody({ type: 'expense', amount: 1, title: 'coffee' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.requestId).toBe('');
  });

  it('canonicalizes a stable non-UUID marker deterministically', () => {
    const first = canonicalCaptureRequestId('shortcut-run-123');
    const second = canonicalCaptureRequestId('shortcut-run-123');
    expect(first).toBe(second);
    expect(first).toMatch(UUID_PATTERN);
    expect(first[14]).toBe('5');
  });

  it('preserves a supplied UUID and generates one when no marker is supplied', () => {
    expect(canonicalCaptureRequestId(REQUEST_ID)).toBe(REQUEST_ID);
    expect(canonicalCaptureRequestId('')).toMatch(UUID_PATTERN);
  });

  it('rejects invalid amounts, overlong request markers, and historical capture attempts', () => {
    expect(
      parseCaptureBody({ requestId: 'x'.repeat(201), type: 'expense', amount: 1, title: 'coffee' })
    ).toMatchObject({ ok: false });
    expect(
      parseCaptureBody({ requestId: REQUEST_ID, type: 'expense', amount: 0, title: 'coffee' })
    ).toMatchObject({ ok: false });
    expect(
      parseCaptureBody({
        requestId: REQUEST_ID,
        type: 'expense',
        amount: 20,
        title: 'coffee',
        date: '2026-09-01',
      })
    ).toEqual({ ok: false, error: 'Quick Capture only accepts transactions happening now.' });
  });

  it('allows a one-day timezone boundary around the server date', () => {
    for (const date of ['2026-09-07', '2026-09-08', '2026-09-09']) {
      expect(
        parseCaptureBody({
          requestId: REQUEST_ID,
          type: 'income',
          amount: '100',
          title: 'refund',
          date,
        }).ok
      ).toBe(true);
    }
  });
});
