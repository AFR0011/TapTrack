'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import SetupForm from './SetupForm';

export default function SetupGate({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID), []);

  if (settings === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm font-medium text-slate-500">
        Preparing local ledger...
      </div>
    );
  }

  if (!settings.setupCompleted) {
    return <SetupForm />;
  }

  return <>{children}</>;
}
