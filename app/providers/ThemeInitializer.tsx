'use client';

import { useEffect } from 'react';
import { applyTheme, resolveStoredTheme } from '@/theme';

export function ThemeInitializer() {
  useEffect(() => {
    applyTheme(resolveStoredTheme());
  }, []);

  return null;
}
