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
      <div className="min-h-dvh bg-background" role="status" aria-live="polite">
        <span className="sr-only">Preparing TapTrack...</span>
      </div>
    );
  }

  if (!settings.setupCompleted) {
    return <OnboardingFlow />;
  }

  return <>{children}</>;
}
