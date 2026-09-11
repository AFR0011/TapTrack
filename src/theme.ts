export const THEME_STORAGE_KEY = 'ravel-theme';
const LEGACY_THEME_STORAGE_KEY = 'taptrack-theme';

export type ThemeMode = 'light' | 'dark';

export function resolveStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const current = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (current === 'dark' || current === 'light') return current;
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === 'dark' || legacy === 'light') {
      window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {
    // Theme preference is convenience only.
  }
  return 'light';
}

export function setStoredTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme preference is convenience only.
  }
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}
