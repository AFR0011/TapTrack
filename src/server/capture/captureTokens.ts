import { createHash, randomBytes } from 'node:crypto';

export const CAPTURE_TOKEN_PREFIX = 'ravel_capture_';
const LEGACY_CAPTURE_TOKEN_PREFIX = 'taptrack_capture_';

export function createCaptureToken(): string {
  return `${CAPTURE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isCaptureToken(value: string): boolean {
  const prefix = value.startsWith(CAPTURE_TOKEN_PREFIX)
    ? CAPTURE_TOKEN_PREFIX
    : value.startsWith(LEGACY_CAPTURE_TOKEN_PREFIX)
      ? LEGACY_CAPTURE_TOKEN_PREFIX
      : null;
  if (!prefix) return false;
  const secret = value.slice(prefix.length);
  return /^[A-Za-z0-9_-]{40,60}$/.test(secret);
}

export function hashCaptureToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
