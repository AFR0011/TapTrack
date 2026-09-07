export type TransactionInputMode = 'quick' | 'command';

const STORAGE_KEY = 'taptrack:transaction-input-mode';
const CHANGE_EVENT = 'taptrack:transaction-input-mode-change';

export function getTransactionInputMode(): TransactionInputMode {
  if (typeof window === 'undefined') return 'quick';

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'command' ? 'command' : 'quick';
  } catch {
    return 'quick';
  }
}

export function getServerTransactionInputMode(): TransactionInputMode {
  return 'quick';
}

export function subscribeTransactionInputMode(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function setTransactionInputMode(mode: TransactionInputMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Input preference is device convenience only. Transaction correctness does
    // not depend on localStorage being writable.
  }
}
