'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import OnboardingFlow from './OnboardingFlow';

export default function SetupGate({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID), []);

  if (settings === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm font-medium text-muted">
        Preparing TapTrack...
      </div>
    );
  }

  if (!settings.setupCompleted) {
    return <OnboardingFlow />;
  }

  return <>{children}</>;
}
