'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol === 'file:') return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await registration.update();
      } catch {
        // PWA support is optional; local finance tracking must remain usable.
      }
    };

    void register();
  }, []);

  return null;
}
