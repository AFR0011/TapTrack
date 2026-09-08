import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCaptureBody } from './route';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

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

  it('rejects malformed identity, amount, and historical capture attempts', () => {
    expect(
      parseCaptureBody({ requestId: 'retry-me', type: 'expense', amount: 1, title: 'coffee' })
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
