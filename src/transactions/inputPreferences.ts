export type TransactionInputMode = 'quick' | 'command';

const STORAGE_KEY = 'taptrack:transaction-input-mode';

export function getTransactionInputMode(): TransactionInputMode {
  if (typeof window === 'undefined') return 'quick';

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'command' ? 'command' : 'quick';
  } catch {
    return 'quick';
  }
}

export function setTransactionInputMode(mode: TransactionInputMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Input preference is device convenience only. Transaction correctness does
    // not depend on localStorage being writable.
  }
}
