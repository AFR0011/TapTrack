'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    const root = document.documentElement;
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
      root.dataset.offlineShell = 'unavailable';
      return;
    }

    let mounted = true;
    root.dataset.offlineShell = 'preparing';

    const markControlled = () => {
      if (!mounted) return;
      if (navigator.serviceWorker.controller) root.dataset.offlineShell = 'ready';
    };

    navigator.serviceWorker.addEventListener('controllerchange', markControlled);

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await registration.update();
        await navigator.serviceWorker.ready;
        markControlled();
      } catch {
        if (mounted) root.dataset.offlineShell = 'unavailable';
      }
    };

    void register();

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', markControlled);
    };
  }, []);

  return null;
}
