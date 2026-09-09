'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { exportCSV, exportJSON, importJSON } from '@/exports/exportService';
import { normalizeBackupJSON } from '@/exports/backupService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
} from '@/exports/linkedRestoreService';
import { resetOnlyThisDevice, resetSyncedAccount } from '@/exports/resetService';
import { deleteCategory, updateCategory } from '@/budgets/budgetService';
import { createCustomCategory } from '@/categories/categoryService';
import { updateSettingsPreferences } from '@/settings/settingsService';
import {
  SUPPORTED_METHODS,
  type Category,
  type Method,
  type TransactionType,
} from '@/types';
import { ConfirmDialog } from './ConfirmDialog';
import { CloudLedgerLink } from './CloudLedgerLink';
import { CloudDeviceDisconnect } from './CloudDeviceDisconnect';
import { CurrencySettingsCard } from './CurrencySettingsCard';
import { QuickCaptureSettings } from './QuickCaptureSettings';
import { RestoreScopeDialog } from './RestoreScopeDialog';
import { ResetScopeDialog } from './ResetScopeDialog';
import { toast } from 'sonner';
import {
  getSyncStatus,
  syncNow,
  type SyncStatusSnapshot,
} from '@/sync/syncService';
import { applyTheme, resolveStoredTheme, setStoredTheme, type ThemeMode } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ToggleRow } from '@/components/ui/Toggle';
import { cn, focusVisibleRing } from '@/lib/cn';
import { getSignedInEmail, signOutUser } from '@/lib/auth';
import { downloadText } from '@/lib/download';

const CATEGORY_ICON_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'utensils', label: 'Utensils' },
  { value: 'home', label: 'Home' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'arrow-down', label: 'Arrow down' },
] as const;

const CATEGORY_TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

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
    description: 'Currency, payment defaults, appearance, and smart categories.',
    icon: 'M4 6h16M7 6a2 2 0 104 0 2 2 0 10-4 0zM4 12h16m-7 0a2 2 0 104 0 2 2 0 10-4 0zM4 18h16M9 18a2 2 0 104 0 2 2 0 10-4 0z',
  },
  {
    id: 'categories',
    label: 'Categories',
    description: 'Organize income and spending categories.',
    icon: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
  },
  {
    id: 'capture',
    label: 'Quick Capture',
    description: 'Set up iPhone shortcuts for faster logging.',
    icon: 'M13 2L4.5 13H11l-1 9L19.5 11H13V2z',
  },
  {
    id: 'account',
    label: 'Account & Sync',
    description: 'Sign in, sync this device, and review connection status.',
    icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0M17 11.5a4.5 4.5 0 110 9h-1',
  },
  {
    id: 'data',
    label: 'Data',
    description: 'Export, back up, restore, or reset TapTrack.',
    icon: 'M5 4h14v16H5V4zm3 4h8M8 12h8M8 16h5',
  },
];

function isSettingsSection(value: string | null): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export default function SettingsWorkspace() {
  const router = useRouter();
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const isLoading = categories === undefined || settings === undefined;
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<TransactionType>('expense');
  const [categoryColor, setCategoryColor] = useState('#2563eb');
  const [categoryIcon, setCategoryIcon] = useState('circle');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetScope, setShowResetScope] = useState(false);
  const [showAccountResetConfirm, setShowAccountResetConfirm] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState<Category | null>(null);
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
    queueMicrotask(() => {
      void refreshSyncStatus();
    });
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

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    await createCustomCategory({
      name: categoryName,
      color: categoryColor,
      icon: categoryIcon,
      type: categoryType,
    });
    setCategoryName('');
    setCategoryIcon('circle');
    toast.success('Category added.');
  };

  const startCategoryEdit = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryType(category.type);
    setCategoryColor(category.color ?? '#2563eb');
    setCategoryIcon(category.icon ?? 'circle');
  };

  const cancelCategoryEdit = () => {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryType('expense');
    setCategoryColor('#2563eb');
    setCategoryIcon('circle');
  };

  const saveCategoryEdit = async () => {
    if (!editingCategory) return;
    try {
      await updateCategory({
        id: editingCategory.id,
        name: categoryName,
        type: categoryType,
        color: categoryColor,
        icon: categoryIcon,
      });
      toast.success('Category updated.');
      cancelCategoryEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Category could not be updated. Try again.');
    }
  };

  const handleExportCSV = async () => {
    downloadText('taptrack-transactions.csv', await exportCSV(), 'text/csv');
    toast.success('CSV downloaded.');
  };

  const handleExportJSON = async () => {
    downloadText('taptrack-backup.json', await exportJSON(), 'application/json');
    toast.success('Backup downloaded.');
  };

  const persistPreRestoreSafetyBackup = useCallback((safetyBackup: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(`taptrack-pre-restore-${timestamp}.json`, safetyBackup, 'application/json');
  }, []);

  const persistPreResetSafetyBackup = useCallback((safetyBackup: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(`taptrack-pre-reset-${timestamp}.json`, safetyBackup, 'application/json');
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

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading settings">
        <PageHeader title="Settings" />
        <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
        <nav
          aria-label="Settings sections"
          className={cn(
            'rounded-2xl border border-subtle bg-surface p-2 md:sticky md:top-24',
            activeSection ? 'hidden md:block' : 'block'
          )}
        >
          <div className="grid gap-1">
            {SETTINGS_SECTIONS.map((section) => (
              <SettingsSectionLink
                key={section.id}
                section={section}
                active={activeSection === section.id}
              />
            ))}
          </div>
        </nav>

        <div className={cn(activeSection ? 'block' : 'hidden md:block')}>
          {activeSection ? (
            <Link
              href="/app/settings"
              className={cn(
                'mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-accent md:hidden',
                focusVisibleRing
              )}
            >
              <span aria-hidden="true">←</span>
              Settings
            </Link>
          ) : null}

          {selectedSection === 'general' ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-subtle bg-surface p-5">
                <h2 className="text-lg font-semibold text-primary">General</h2>
                <div className="mt-5 max-w-md">
                  <SelectField
                    label="Default payment method"
                    value={settings.lastUsedMethod ?? 'card'}
                    onChange={(event) =>
                      handleChangeDefaultMethod(event.target.value as Method)
                    }
                    options={SUPPORTED_METHODS.map((method) => ({
                      value: method,
                      label: method.charAt(0).toUpperCase() + method.slice(1),
                    }))}
                  />
                </div>
                <div className="mt-5 divide-y divide-subtle rounded-xl border border-subtle bg-surface-muted px-4">
                  <ToggleRow
                    className="py-4"
                    label="Dark mode"
                    checked={darkModeEnabled}
                    onChange={handleToggleDarkMode}
                  />
                  <ToggleRow
                    className="py-4"
                    label="Smart Categories"
                    description={
                      accountEmail
                        ? 'Suggest categories while you type.'
                        : 'Sign in to use smart suggestions.'
                    }
                    checked={settings.aiCategorizationEnabled ?? false}
                    onChange={handleToggleAI}
                    disabled={!accountChecked}
                    variant="ai"
                  />
                </div>
              </section>

              <CurrencySettingsCard />
            </div>
          ) : null}

          {selectedSection === 'categories' ? (
            <section className="rounded-2xl border border-subtle bg-surface p-5">
              <div>
                <h2 className="text-lg font-semibold text-primary">Categories</h2>
                <p className="mt-1 text-sm text-muted">
                  Organize transactions so budgets and reports stay meaningful.
                </p>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Field
                  label="Category name"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Groceries"
                  className="md:col-span-2"
                />
                <SelectField
                  label="Type"
                  value={categoryType}
                  disabled={editingCategory?.isDefault}
                  onChange={(event) =>
                    setCategoryType(event.target.value as TransactionType)
                  }
                  options={CATEGORY_TYPE_OPTIONS}
                />
                <SelectField
                  label="Icon"
                  value={categoryIcon}
                  onChange={(event) => setCategoryIcon(event.target.value)}
                  options={CATEGORY_ICON_OPTIONS}
                />
                <label htmlFor="category-color" className="grid gap-1.5 md:col-span-2">
                  <span className="text-sm font-medium text-secondary">Color</span>
                  <input
                    id="category-color"
                    type="color"
                    value={categoryColor}
                    onChange={(event) => setCategoryColor(event.target.value)}
                    className={cn(
                      'min-h-11 w-full cursor-pointer rounded-lg border border-subtle bg-surface px-2 py-1 outline-none focus-visible:border-accent',
                      focusVisibleRing
                    )}
                    aria-label="Category color"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={editingCategory ? saveCategoryEdit : addCategory}
                  >
                    {editingCategory ? 'Save changes' : 'Add category'}
                  </Button>
                  {editingCategory ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={cancelCategoryEdit}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-2">
                {categories.map((category) => (
                  <div key={category.id} className="rounded-xl border border-subtle bg-surface-muted p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ background: category.color ?? '#64748b' }}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate text-sm font-semibold text-primary">
                          {category.name}
                        </span>
                        <CategoryTypeBadge type={category.type} />
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 min-w-11 flex-1 px-4 sm:flex-none"
                          onClick={() => startCategoryEdit(category)}
                        >
                          Edit
                        </Button>
                        {category.isDefault ? null : (
                          <Button
                            type="button"
                            variant="dangerGhost"
                            className="min-h-11 min-w-11 flex-1 px-4 sm:flex-none"
                            onClick={() => setCategoryDeleteConfirm(category)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {selectedSection === 'capture' ? (
            <QuickCaptureSettings signedIn={Boolean(accountEmail)} />
          ) : null}

          {selectedSection === 'account' ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-subtle bg-surface p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-primary">Account</h2>
                    <p className="mt-1 text-sm text-muted">
                      {!accountChecked ? 'Checking…' : accountEmail ? accountEmail : 'Not signed in'}
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

              <section className="rounded-2xl border border-subtle bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-primary">Sync</h2>
                    <p className="mt-1 text-sm font-medium text-secondary">
                      {buildSyncSummary(syncStatus)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleSyncNow}
                    loading={syncing}
                    disabled={syncing || !syncStatus?.syncAllowed}
                  >
                    Sync now
                  </Button>
                </div>
                <details className="group mt-4 rounded-xl border border-subtle bg-surface-muted">
                  <summary
                    className={cn(
                      'flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 py-2 text-sm font-medium text-secondary select-none [&::-webkit-details-marker]:hidden',
                      focusVisibleRing
                    )}
                  >
                    <span>Sync details</span>
                    <span
                      aria-hidden="true"
                      className="ml-auto text-muted transition-transform group-open:rotate-180"
                    >
                      ⌄
                    </span>
                  </summary>
                  <dl className="divide-y divide-subtle border-t border-subtle px-3 text-sm">
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
                {syncStatus?.bindingState === 'unlinked' ? (
                  <CloudLedgerLink onLinked={refreshSyncStatus} />
                ) : null}
                <CloudDeviceDisconnect onDisconnected={refreshSyncStatus} />
                {syncStatus?.bindingState === 'account-mismatch' ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg border border-danger bg-danger-muted p-3 text-sm text-danger"
                  >
                    This device is connected to a different account. Sign in with that account before syncing.
                  </p>
                ) : null}
              </section>
            </div>
          ) : null}

          {selectedSection === 'data' ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-subtle bg-surface p-5">
                <h2 className="text-lg font-semibold text-primary">Your data</h2>
                <p className="mt-1 text-sm text-muted">
                  Export transactions or keep a restorable backup of TapTrack.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <DataAction
                    title="Export transactions"
                    description="Download your transaction history as CSV."
                    action={<Button type="button" variant="secondary" onClick={handleExportCSV}>Export CSV</Button>}
                  />
                  <DataAction
                    title="Backup"
                    description="Download a complete restorable copy of your TapTrack data."
                    action={<Button type="button" variant="secondary" onClick={handleExportJSON}>Download backup</Button>}
                  />
                  <DataAction
                    title="Restore"
                    description="Replace TapTrack data from a backup file."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => importInputRef.current?.click()}
                      >
                        Restore backup
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

              <section className="rounded-2xl border border-danger/30 bg-danger-muted p-5">
                <h2 className="text-base font-semibold text-danger">Reset TapTrack</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  A safety backup is downloaded first. If sync is on, you can reset only this device or the synced account.
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
                  Reset TapTrack data
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
        message="This replaces the TapTrack data in your synced account with the selected backup. Other connected devices will receive the restored data when they next sync. A safety backup is downloaded first."
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
        message="This clears the TapTrack data in your synced account. Other connected devices will receive the empty account when they next sync. A safety backup is downloaded first."
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
        message="This clears TapTrack on this device and starts it with an empty account. A safety backup is downloaded first."
        confirmLabel="Reset this device"
        confirmVariant="danger"
        onConfirm={() => void executeDeviceOnlyReset()}
        onCancel={() => setShowResetConfirm(false)}
      />

      <ConfirmDialog
        open={categoryDeleteConfirm !== null}
        title="Delete category"
        message={`Delete "${categoryDeleteConfirm?.name}"? Transactions using this category will move to the closest matching category.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={async () => {
          if (categoryDeleteConfirm) {
            await deleteCategory(categoryDeleteConfirm.id);
            toast.success('Category deleted.');
          }
          setCategoryDeleteConfirm(null);
        }}
        onCancel={() => setCategoryDeleteConfirm(null)}
      />
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
        'group flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
        focusVisibleRing,
        active
          ? 'bg-action-primary text-white'
          : 'text-secondary hover:bg-surface-muted hover:text-primary'
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
          active ? 'bg-white/15 text-white' : 'bg-surface-muted text-muted group-hover:text-primary'
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
        <span
          className={cn(
            'mt-0.5 block text-xs leading-4',
            active ? 'text-white/75' : 'text-muted'
          )}
        >
          {section.description}
        </span>
      </span>
      <span className="ml-auto text-lg md:hidden" aria-hidden="true">›</span>
    </a>
  );
}

function DataAction({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex min-h-36 flex-col rounded-xl border border-subtle bg-surface-muted p-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
      </div>
      <div className="mt-4">{action}</div>
    </div>
  );
}

function CategoryTypeBadge({ type }: { type: TransactionType }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
        type === 'income' ? 'bg-success-muted text-success' : 'bg-danger-muted text-danger'
      )}
    >
      {type}
    </span>
  );
}

function buildSyncSummary(status: SyncStatusSnapshot | null): string {
  if (!status) return 'Checking sync…';

  const stateLabel = {
    'provider-unconfigured': 'Sync is not available on this setup',
    'signed-out': 'Sign in to sync',
    unlinked: 'Ready to connect',
    linked: formatRelativeSyncTime(status.lastSyncAt),
    'account-mismatch': 'Different account required',
    'provider-unavailable': 'Sync is temporarily unavailable',
  }[status.bindingState];
  const pendingPart = status.pendingRetryCount > 0 ? ` · ${status.pendingRetryCount} waiting to sync` : '';
  return `${stateLabel}${status.online ? '' : ' · Offline'}${pendingPart}`;
}

function formatRelativeSyncTime(value: string | null | undefined): string {
  if (!value) return 'Not synced yet';
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
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="text-right font-semibold text-primary">{value}</dd>
    </div>
  );
}

function formatSyncTimestamp(value: string | null | undefined) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}
