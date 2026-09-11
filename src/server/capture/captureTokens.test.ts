import { describe, expect, it } from 'vitest';
import {
  CAPTURE_TOKEN_PREFIX,
  createCaptureToken,
  hashCaptureToken,
  isCaptureToken,
} from './captureTokens';

describe('captureTokens', () => {
  it('creates a high-entropy token with the Ravel capture prefix', () => {
    const first = createCaptureToken();
    const second = createCaptureToken();

    expect(first).toMatch(/^ravel_capture_[A-Za-z0-9_-]{40,60}$/);
    expect(second).toMatch(/^ravel_capture_[A-Za-z0-9_-]{40,60}$/);
    expect(first).not.toBe(second);
    expect(isCaptureToken(first)).toBe(true);
  });

  it('accepts capture tokens issued before the Ravel rename', () => {
    expect(isCaptureToken(`taptrack_capture_${'a'.repeat(43)}`)).toBe(true);
  });

  it('rejects malformed or unrelated bearer values', () => {
    expect(isCaptureToken('')).toBe(false);
    expect(isCaptureToken('not_a_capture_token')).toBe(false);
    expect(isCaptureToken(`${CAPTURE_TOKEN_PREFIX}short`)).toBe(false);
    expect(isCaptureToken(`${CAPTURE_TOKEN_PREFIX}${'a'.repeat(41)}!`)).toBe(false);
  });

  it('hashes tokens deterministically without preserving the raw secret', () => {
    const token = `${CAPTURE_TOKEN_PREFIX}${'A'.repeat(43)}`;
    const hash = hashCaptureToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashCaptureToken(token));
    expect(hash).not.toContain(token);
    expect(hashCaptureToken(`${CAPTURE_TOKEN_PREFIX}${'B'.repeat(43)}`)).not.toBe(hash);
  });
});
