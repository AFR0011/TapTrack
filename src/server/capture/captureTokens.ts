import { createHash, randomBytes } from 'node:crypto';

export const CAPTURE_TOKEN_PREFIX = 'taptrack_capture_';

export function createCaptureToken(): string {
  return `${CAPTURE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isCaptureToken(value: string): boolean {
  if (!value.startsWith(CAPTURE_TOKEN_PREFIX)) return false;
  const secret = value.slice(CAPTURE_TOKEN_PREFIX.length);
  return /^[A-Za-z0-9_-]{40,60}$/.test(secret);
}

export function hashCaptureToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
