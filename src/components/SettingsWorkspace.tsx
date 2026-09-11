'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { exportCSV, exportJSON, importJSON } from '@/exports/exportService';
import { normalizeBackupJSON } from '@/exports/backupService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
} from '@/exports/linkedRestoreService';
import { resetOnlyThisDevice, resetSyncedAccount } from '@/exports/resetService';
import { updateSettingsPreferences } from '@/settings/settingsService';
import { SUPPORTED_METHODS, type Method } from '@/types';
import { ConfirmDialog } from './ConfirmDialog';
import { CloudLedgerLink } from './CloudLedgerLink';
import { CloudDeviceDisconnect } from './CloudDeviceDisconnect';
import { CurrencySettingsCard } from './CurrencySettingsCard';
import { QuickCaptureSettings } from './QuickCaptureSettings';
import { RestoreScopeDialog } from './RestoreScopeDialog';
import { ResetScopeDialog } from './ResetScopeDialog';
import { CategoryManager } from './CategoryManager';
import {
  getSyncStatus,
  syncNow,
  type SyncStatusSnapshot,
} from '@/sync/syncService';
import { applyTheme, resolveStoredTheme, setStoredTheme, type ThemeMode } from '@/theme';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ToggleRow } from '@/components/ui/Toggle';
import { cn, focusVisibleRing } from '@/lib/cn';
import { getSignedInEmail, signOutUser } from '@/lib/auth';
import { downloadText } from '@/lib/download';

type SettingsSection = 'general' | 'categories' | 'capture' | 'account' | 'data';

type SettingsSectionConfig = {
  id: SettingsSection;
  label: string;
  description: string;
  icon: string;
};

const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Everyday defaults, currencies, appearance, and AI.',
    icon: 'M4 6h16M7 6a2 2 0 104 0 2 2 0 10-4 0zM4 12h16m-7 0a2 2 0 104 0 2 2 0 10-4 0zM4 18h16M9 18a2 2 0 104 0 2 2 0 10-4 0z',
  },
  {
    id: 'categories',
    label: 'Categories',
    description: 'Organize the labels used for income and spending.',
    icon: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
  },
  {
    id: 'capture',
    label: 'Quick Capture',
    description: 'Connect iPhone Shortcuts for faster logging.',
    icon: 'M13 2L4.5 13H11l-1 9L19.5 11H13V2z',
  },
  {
    id: 'account',
    label: 'Account & Sync',
    description: 'Identity, sync health, and this device connection.',
    icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0M17 11.5a4.5 4.5 0 110 9h-1',
  },
  {
    id: 'data',
    label: 'Data',
    description: 'Export, back up, restore, or reset your ledger.',
    icon: 'M5 4h14v16H5V4zm3 4h8M8 12h8M8 16h5',
  },
];

function isSettingsSection(value: string | null): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export default function SettingsWorkspace() {
  const router = useRouter();
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetScope, setShowResetScope] = useState(false);
  const [showAccountResetConfirm, setShowAccountResetConfirm] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);
  const [showRestoreScope, setShowRestoreScope] = useState(false);
  const [showAccountRestoreConfirm, setShowAccountRestoreConfirm] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const darkModeEnabled = settings?.darkModeEnabled ?? resolveStoredTheme() === 'dark';
  const selectedSection = activeSection ?? 'general';

  useEffect(() => {
    const syncSectionFromHash = () => {
      const value = window.location.hash.replace(/^#/, '');
      setActiveSection(isSettingsSection(value) ? value : null);
    };
    syncSectionFromHash();
    window.addEventListener('hashchange', syncSectionFromHash);
    return () => window.removeEventListener('hashchange', syncSectionFromHash);
  }, []);

  useEffect(() => {
    if (settings?.darkModeEnabled === undefined) return;
    const theme: ThemeMode = settings.darkModeEnabled ? 'dark' : 'light';
    setStoredTheme(theme);
    applyTheme(theme);
  }, [settings?.darkModeEnabled]);

  const refreshSyncStatus = useCallback(async () => {
    setSyncStatus(await getSyncStatus());
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshSyncStatus());
    window.addEventListener('online', refreshSyncStatus);
    window.addEventListener('offline', refreshSyncStatus);
    return () => {
      window.removeEventListener('online', refreshSyncStatus);
      window.removeEventListener('offline', refreshSyncStatus);
    };
  }, [refreshSyncStatus]);

  useEffect(() => {
    void getSignedInEmail().then((email) => {
      setAccountEmail(email);
      setAccountChecked(true);
    });
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutUser();
      router.replace('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  const handleExportCSV = async () => {
    downloadText('ravel-transactions.csv', await exportCSV(), 'text/csv');
    toast.success('CSV downloaded.');
  };

  const handleExportJSON = async () => {
    downloadText('ravel-backup.json', await exportJSON(), 'application/json');
    toast.success('Backup downloaded.');
  };

  const persistPreRestoreSafetyBackup = useCallback((safetyBackup: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(`ravel-pre-restore-${timestamp}.json`, safetyBackup, 'application/json');
  }, []);

  const persistPreResetSafetyBackup = useCallback((safetyBackup: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(`ravel-pre-reset-${timestamp}.json`, safetyBackup, 'application/json');
  }, []);

  const clearPendingRestore = useCallback(() => {
    setPendingRestoreJson(null);
    setShowRestoreScope(false);
    setShowAccountRestoreConfirm(false);
    if (importInputRef.current) importInputRef.current.value = '';
  }, []);

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    let keepPendingFile = false;
    try {
      const jsonData = await file.text();
      normalizeBackupJSON(jsonData);
      if (syncStatus?.bindingState === 'linked') {
        setPendingRestoreJson(jsonData);
        setShowRestoreScope(true);
        keepPendingFile = true;
        return;
      }
      const result = await importJSON(jsonData, db, {
        beforeReplace: persistPreRestoreSafetyBackup,
      });
      await refreshSyncStatus();
      toast.success(
        result.legacyMigrated
          ? 'Backup restored and updated to the current format. A safety backup was downloaded first.'
          : 'Backup restored on this device. A safety backup was downloaded first.'
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Backup could not be restored. Check the file and try again.'
      );
    } finally {
      if (!keepPendingFile && importInputRef.current) importInputRef.current.value = '';
    }
  };

  const executeDeviceOnlyRestore = async () => {
    if (!pendingRestoreJson || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const result = await restoreOnlyThisDevice(
        pendingRestoreJson,
        persistPreRestoreSafetyBackup,
        db
      );
      await refreshSyncStatus();
      toast.success(
        result.legacyMigrated
          ? 'Backup restored and updated on this device. Your synced account was not changed.'
          : 'Backup restored on this device. Your synced account was not changed.'
      );
      clearPendingRestore();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'This device could not be restored. Try again.');
      setShowRestoreScope(true);
    } finally {
      setRestoreBusy(false);
    }
  };

  const executeAccountRestore = async () => {
    if (!pendingRestoreJson || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const result = await restoreSyncedAccount(
        pendingRestoreJson,
        persistPreRestoreSafetyBackup,
        db
      );
      await refreshSyncStatus();
      toast.success(
        result.legacyMigrated
          ? 'Backup restored and updated across your synced account.'
          : 'Synced account restored from backup.'
      );
      clearPendingRestore();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Your synced account could not be restored. Try again.'
      );
      setShowRestoreScope(true);
    } finally {
      setRestoreBusy(false);
    }
  };

  const executeDeviceOnlyReset = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      await resetOnlyThisDevice(persistPreResetSafetyBackup, db);
      await refreshSyncStatus();
      setShowResetConfirm(false);
      setShowResetScope(false);
      toast.success(
        syncStatus?.bindingState === 'linked'
          ? 'Data on this device was reset. Your synced account was not changed.'
          : 'Data on this device was reset. A safety backup was downloaded first.'
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Data on this device could not be reset. Try again.'
      );
    } finally {
      setResetBusy(false);
    }
  };

  const executeAccountReset = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      await resetSyncedAccount(persistPreResetSafetyBackup, db);
      await refreshSyncStatus();
      setShowAccountResetConfirm(false);
      setShowResetScope(false);
      toast.success('Synced account data reset.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Your synced account could not be reset. Try again.'
      );
      setShowResetScope(true);
    } finally {
      setResetBusy(false);
    }
  };

  const handleChangeDefaultMethod = async (method: Method) => {
    if (!settings) return;
    await updateSettingsPreferences({ lastUsedMethod: method });
    toast.success('Default payment method updated.');
  };

  const handleToggleAI = async () => {
    if (!settings) return;
    const next = !settings.aiCategorizationEnabled;
    if (next && !accountEmail) {
      toast.info('Sign in to use Smart Categories.');
      router.push('/login');
      return;
    }
    await updateSettingsPreferences({ aiCategorizationEnabled: next });
    toast.success(next ? 'Smart Categories on.' : 'Smart Categories off.');
  };

  const handleToggleAutoCategorization = async () => {
    if (!settings) return;
    await updateSettingsPreferences({
      aiAutoCategorizationEnabled: !(settings.aiAutoCategorizationEnabled ?? true),
    });
  };

  const handleToggleNewCategoryRecommendations = async () => {
    if (!settings) return;
    await updateSettingsPreferences({
      aiRecommendNewCategoriesEnabled: !(settings.aiRecommendNewCategoriesEnabled ?? true),
    });
  };

  const handleToggleDarkMode = async () => {
    if (!settings) return;
    const next = !(settings.darkModeEnabled ?? false);
    await updateSettingsPreferences({ darkModeEnabled: next });
    const theme: ThemeMode = next ? 'dark' : 'light';
    setStoredTheme(theme);
    applyTheme(theme);
    toast.success(next ? 'Dark mode on.' : 'Dark mode off.');
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
      await refreshSyncStatus();
      toast.success('Sync complete.');
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Sync could not finish. Check your connection and try again.'
      );
    } finally {
      setSyncing(false);
    }
  };

  if (!settings) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading settings">
        <PageHeader
          title="Settings"
          description="Control Ravel's defaults, connections, and data on this device."
        />
        <div className="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const aiEnabled = settings.aiCategorizationEnabled ?? false;

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6" data-layout="settings-workspace">
      <PageHeader
        title="Settings"
        description="Set everyday defaults, connect devices, and keep control of where your Ravel data lives."
      />

      <div className="grid min-w-0 gap-5 md:grid-cols-[260px_minmax(0,1fr)] md:items-start">
        <nav
          aria-label="Settings sections"
          data-settings-navigation
          className={cn(
            'min-w-0 rounded-[1.5rem] bg-surface p-2 ring-1 ring-subtle/70 md:sticky md:top-24',
            activeSection ? 'hidden md:block' : 'block'
          )}
        >
          <div className="hidden px-3 pb-2 pt-2 md:block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Control center</p>
            <p className="mt-1 text-xs font-medium leading-5 text-muted">
              Changes are saved immediately unless an action asks for confirmation.
            </p>
          </div>
          <div className="grid gap-1">
            {SETTINGS_SECTIONS.map((section) => (
              <SettingsSectionLink
                key={section.id}
                section={section}
                active={selectedSection === section.id}
              />
            ))}
          </div>
        </nav>

        <div
          className={cn('min-w-0', activeSection ? 'block' : 'hidden md:block')}
          data-settings-panel={selectedSection}
        >
          {activeSection ? (
            <Link
              href="/app/settings"
              className={cn(
                'mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-accent md:hidden',
                focusVisibleRing
              )}
            >
              <span aria-hidden="true">←</span>
              All settings
            </Link>
          ) : null}

          {selectedSection === 'general' ? (
            <div className="space-y-4" data-settings-section="general">
              <section className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-subtle/70 sm:p-6">
                <SectionHeading
                  eyebrow="Everyday behavior"
                  title="Defaults & appearance"
                  description="Choose how Ravel starts common actions on this device."
                />

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl bg-surface-muted p-4 ring-1 ring-subtle/70">
                    <SelectField
                      label="Default payment method"
                      value={settings.lastUsedMethod ?? 'card'}
                      onChange={(event) =>
                        void handleChangeDefaultMethod(event.target.value as Method)
                      }
                      options={SUPPORTED_METHODS.map((method) => ({
                        value: method,
                        label: method.charAt(0).toUpperCase() + method.slice(1),
                      }))}
                    />
                    <p className="mt-2 text-xs font-medium leading-5 text-muted">
                      New transactions start here. You can still change the method while logging.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-surface-muted px-4 ring-1 ring-subtle/70">
                    <ToggleRow
                      className="py-4"
                      label="Dark mode"
                      description="Use Ravel's dark appearance on this device."
                      checked={darkModeEnabled}
                      onChange={handleToggleDarkMode}
                    />
                  </div>
                </div>
              </section>

              <CurrencySettingsCard />

              <section className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-ai-border/70 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <SectionHeading
                    eyebrow="Optional assistance"
                    title="Smart Categories"
                    description={
                      accountEmail
                        ? 'Let AI help organize transactions while keeping you in control of the final category.'
                        : 'Sign in before enabling AI-assisted categorization.'
                    }
                  />
                  <span className="w-fit rounded-full border border-ai-border bg-ai-muted/50 px-2.5 py-1 text-xs font-semibold text-secondary">
                    {aiEnabled ? 'On' : 'Off'}
                  </span>
                </div>

                <div className="mt-5 divide-y divide-subtle rounded-2xl bg-ai-muted/30 px-4 ring-1 ring-ai-border/70">
                  <ToggleRow
                    className="py-4"
                    label="Smart Categories"
                    description={
                      accountEmail
                        ? 'Use AI suggestions when classifying transactions.'
                        : 'Requires a signed-in account.'
                    }
                    checked={aiEnabled}
                    onChange={handleToggleAI}
                    disabled={!accountChecked}
                    variant="ai"
                  />
                  {aiEnabled ? (
                    <>
                      <ToggleRow
                        className="py-4"
                        label="Auto-categorize"
                        description="Choose the best existing category while you type."
                        checked={settings.aiAutoCategorizationEnabled ?? true}
                        onChange={handleToggleAutoCategorization}
                        variant="ai"
                      />
                      <ToggleRow
                        className="py-4"
                        label="Recommend new categories"
                        description="Suggest a reusable category when none of yours fits well."
                        checked={settings.aiRecommendNewCategoriesEnabled ?? true}
                        onChange={handleToggleNewCategoryRecommendations}
                        variant="ai"
                      />
                    </>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {selectedSection === 'categories' ? (
            <div data-settings-section="categories">
              <CategoryManager />
            </div>
          ) : null}

          {selectedSection === 'capture' ? (
            <div data-settings-section="capture">
              <QuickCaptureSettings signedIn={Boolean(accountEmail)} />
            </div>
          ) : null}

          {selectedSection === 'account' ? (
            <div className="space-y-4" data-settings-section="account">
              <section className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-subtle/70 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Identity</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">Account</h2>
                    <p className="mt-1 truncate text-sm font-medium text-muted">
                      {!accountChecked ? 'Checking account…' : accountEmail ? accountEmail : 'Not signed in'}
                    </p>
                  </div>
                  {accountEmail ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSignOut}
                      loading={signingOut}
                      disabled={signingOut}
                    >
                      Sign out
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => router.push('/login')}
                      disabled={!accountChecked}
                    >
                      Sign in
                    </Button>
                  )}
                </div>
              </section>

              <section className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-subtle/70 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Device connection</p>
                      <SyncStateBadge status={syncStatus} />
                    </div>
                    <h2 className="mt-2 text-lg font-semibold tracking-tight text-primary">Sync</h2>
                    <p className="mt-1 max-w-2xl text-sm font-medium text-secondary">
                      {buildSyncSummary(syncStatus)}
                    </p>
                    <p className="mt-2 max-w-2xl text-xs font-medium leading-5 text-muted">
                      Ravel keeps this device usable on its own. Sync is an optional way to copy ledger changes between devices signed into the same account.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleSyncNow}
                    loading={syncing}
                    disabled={syncing || !syncStatus?.syncAllowed}
                    className="shrink-0"
                  >
                    Sync now
                  </Button>
                </div>

                {syncStatus?.bindingState === 'account-mismatch' ? (
                  <p role="alert" className="mt-4 rounded-xl border border-danger bg-danger-muted p-3 text-sm font-medium text-danger">
                    This device is connected to a different account. Sign in with that account before syncing, or disconnect this device below.
                  </p>
                ) : null}

                {syncStatus?.bindingState === 'unlinked' ? (
                  <div className="mt-4 rounded-2xl bg-accent-muted/40 p-4 ring-1 ring-accent/25">
                    <p className="text-sm font-semibold text-primary">This device is not connected yet</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-muted">
                      Connecting never silently chooses between two ledgers. If both this device and your account contain data, Ravel will ask what you want to keep.
                    </p>
                    <CloudLedgerLink onLinked={refreshSyncStatus} />
                  </div>
                ) : null}

                <details className="group mt-4 rounded-2xl bg-surface-muted ring-1 ring-subtle/70">
                  <summary
                    className={cn(
                      'flex min-h-12 cursor-pointer list-none items-center rounded-2xl px-4 py-3 text-sm font-semibold text-secondary select-none [&::-webkit-details-marker]:hidden',
                      focusVisibleRing
                    )}
                  >
                    <span>Sync details</span>
                    <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
                  </summary>
                  <dl className="divide-y divide-subtle border-t border-subtle px-4 text-sm">
                    <SyncDetailRow
                      label="Account"
                      value={syncStatus?.authenticated ? 'Signed in' : 'Not signed in'}
                    />
                    <SyncDetailRow
                      label="Connection"
                      value={syncStatus?.online ? 'Online' : 'Offline'}
                    />
                    <SyncDetailRow
                      label="Received from account"
                      value={formatSyncTimestamp(syncStatus?.lastSyncAt)}
                    />
                    <SyncDetailRow
                      label="Saved to account"
                      value={formatSyncTimestamp(syncStatus?.lastPushAt)}
                    />
                    {(syncStatus?.pendingRetryCount ?? 0) > 0 ? (
                      <SyncDetailRow
                        label="Waiting to sync"
                        value={String(syncStatus?.pendingRetryCount ?? 0)}
                      />
                    ) : null}
                  </dl>
                </details>

                <CloudDeviceDisconnect onDisconnected={refreshSyncStatus} />
              </section>
            </div>
          ) : null}

          {selectedSection === 'data' ? (
            <div className="space-y-4" data-settings-section="data">
              <section className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-subtle/70 sm:p-6">
                <SectionHeading
                  eyebrow="Portability"
                  title="Your data"
                  description="Take a readable export or a complete restorable copy whenever you want."
                />

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  <DataAction
                    eyebrow="Readable"
                    title="Export transactions"
                    description="Download transaction history as CSV for spreadsheets or analysis."
                    action={
                      <Button type="button" variant="secondary" onClick={handleExportCSV}>
                        Export CSV
                      </Button>
                    }
                  />
                  <DataAction
                    eyebrow="Complete copy"
                    title="Backup Ravel"
                    description="Download a restorable JSON backup of your ledger and settings."
                    action={
                      <Button type="button" variant="secondary" onClick={handleExportJSON}>
                        Download backup
                      </Button>
                    }
                  />
                  <DataAction
                    eyebrow="Replacement"
                    title="Restore backup"
                    description="Replace Ravel data from a backup. A safety backup is created before anything is replaced."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => importInputRef.current?.click()}
                      >
                        Choose backup
                      </Button>
                    }
                  />
                </div>

                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => void handleImportFile(event.target.files?.[0])}
                />
              </section>

              <section className="rounded-[1.5rem] border border-danger/30 bg-danger-muted p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">Danger zone</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-danger">Reset Ravel data</h2>
                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-muted">
                  Reset clears ledger data after downloading a safety backup. When sync is connected, Ravel asks whether you mean only this device or the synced account everywhere.
                </p>
                <Button
                  type="button"
                  variant="danger"
                  className="mt-4"
                  onClick={() => {
                    if (syncStatus?.bindingState === 'linked') setShowResetScope(true);
                    else setShowResetConfirm(true);
                  }}
                >
                  Reset Ravel data
                </Button>
              </section>
            </div>
          ) : null}
        </div>
      </div>

      <RestoreScopeDialog
        open={showRestoreScope}
        busy={restoreBusy}
        onRestoreAccount={() => {
          setShowRestoreScope(false);
          setShowAccountRestoreConfirm(true);
        }}
        onRestoreDevice={() => void executeDeviceOnlyRestore()}
        onCancel={clearPendingRestore}
      />
      <ResetScopeDialog
        open={showResetScope}
        busy={resetBusy}
        onResetAccount={() => {
          setShowResetScope(false);
          setShowAccountResetConfirm(true);
        }}
        onResetDevice={() => void executeDeviceOnlyReset()}
        onCancel={() => setShowResetScope(false)}
      />
      <ConfirmDialog
        open={showAccountRestoreConfirm}
        title="Replace data in your synced account"
        message="This replaces the Ravel data in your synced account with the selected backup. Other connected devices will receive the restored data when they next sync. A safety backup is downloaded first."
        confirmLabel="Replace synced account data"
        confirmVariant="danger"
        onConfirm={() => {
          setShowAccountRestoreConfirm(false);
          void executeAccountRestore();
        }}
        onCancel={() => {
          setShowAccountRestoreConfirm(false);
          setShowRestoreScope(true);
        }}
      />
      <ConfirmDialog
        open={showAccountResetConfirm}
        title="Reset synced account everywhere"
        message="This clears the Ravel data in your synced account. Other connected devices will receive the empty account when they next sync. A safety backup is downloaded first."
        confirmLabel="Reset synced account"
        confirmVariant="danger"
        onConfirm={() => {
          setShowAccountResetConfirm(false);
          void executeAccountReset();
        }}
        onCancel={() => {
          setShowAccountResetConfirm(false);
          setShowResetScope(true);
        }}
      />
      <ConfirmDialog
        open={showResetConfirm}
        title="Reset data on this device"
        message="This clears Ravel on this device and starts it with an empty account. A safety backup is downloaded first."
        confirmLabel="Reset this device"
        confirmVariant="danger"
        onConfirm={() => void executeDeviceOnlyReset()}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-muted">{description}</p>
    </div>
  );
}

function SettingsSectionLink({
  section,
  active,
}: {
  section: SettingsSectionConfig;
  active: boolean;
}) {
  return (
    <a
      href={`#${section.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors',
        focusVisibleRing,
        active
          ? 'bg-action-primary text-white'
          : 'text-secondary hover:bg-surface-muted hover:text-primary'
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
          active
            ? 'bg-white/15 text-white'
            : 'bg-surface-muted text-muted group-hover:text-primary'
        )}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d={section.icon} />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{section.label}</span>
        <span className={cn('mt-0.5 block text-xs leading-4', active ? 'text-white/75' : 'text-muted')}>
          {section.description}
        </span>
      </span>
      <span className="ml-auto text-lg md:hidden" aria-hidden="true">›</span>
    </a>
  );
}

function DataAction({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex min-h-44 min-w-0 flex-col rounded-2xl bg-surface-muted p-4 ring-1 ring-subtle/70">
      <div className="min-w-0 flex-1">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</p>
        <h3 className="mt-1 text-sm font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-sm font-medium leading-5 text-muted">{description}</p>
      </div>
      <div className="mt-4">{action}</div>
    </div>
  );
}

function SyncStateBadge({ status }: { status: SyncStatusSnapshot | null }) {
  const danger = status?.bindingState === 'account-mismatch';
  const linked = status?.bindingState === 'linked';
  const label = !status
    ? 'Checking'
    : danger
      ? 'Account mismatch'
      : linked
        ? status.online
          ? 'Connected'
          : 'Connected · offline'
        : status.bindingState === 'unlinked'
          ? 'Not connected'
          : status.bindingState === 'signed-out'
            ? 'Signed out'
            : status.bindingState === 'provider-unconfigured'
              ? 'Unavailable'
              : 'Temporarily unavailable';

  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-semibold',
        danger
          ? 'border-danger/40 bg-danger-muted text-danger'
          : linked
            ? 'border-accent/30 bg-accent-muted text-accent'
            : 'border-subtle bg-surface-muted text-muted'
      )}
    >
      {label}
    </span>
  );
}

function buildSyncSummary(status: SyncStatusSnapshot | null): string {
  if (!status) return 'Checking sync…';
  const stateLabel = {
    'provider-unconfigured': 'Sync is not available on this setup',
    'signed-out': 'Sign in to use sync',
    unlinked: 'Ready to connect this device',
    linked: formatRelativeSyncTime(status.lastSyncAt),
    'account-mismatch': 'A different account owns this device connection',
    'provider-unavailable': 'Sync is temporarily unavailable',
  }[status.bindingState];
  const pendingPart =
    status.pendingRetryCount > 0 ? ` · ${status.pendingRetryCount} waiting to sync` : '';
  return `${stateLabel}${status.online ? '' : ' · Offline'}${pendingPart}`;
}

function formatRelativeSyncTime(value: string | null | undefined): string {
  if (!value) return 'Connected · not synced yet';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Synced just now';
  if (diffMin < 60) return `Synced ${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Synced ${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Synced ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function SyncDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="text-right font-semibold text-primary">{value}</dd>
    </div>
  );
}

function formatSyncTimestamp(value: string | null | undefined) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}
