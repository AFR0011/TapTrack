export const THEME_STORAGE_KEY = 'taptrack-theme';

export type ThemeMode = 'light' | 'dark';

export function resolveStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function setStoredTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}
