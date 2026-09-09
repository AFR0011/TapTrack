'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { formatMoney } from '@/format';
import { exportCSV, exportJSON, exportPDF, importJSON } from '@/exports/exportService';
import { normalizeBackupJSON } from '@/exports/backupService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
} from '@/exports/linkedRestoreService';
import { resetOnlyThisDevice, resetSyncedAccount } from '@/exports/resetService';
import { deleteCategory, updateCategory } from '@/budgets/budgetService';
import { createCustomCategory } from '@/categories/categoryService';
import { getAdjustmentHistory } from '@/balances/reconciliationService';
import { updateSettingsPreferences } from '@/settings/settingsService';
import {
  SUPPORTED_METHODS,
  type BalanceCheckpoint,
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
import { downloadBlob, downloadText } from '@/lib/download';

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

export default function SettingsWorkspace() {
  const router = useRouter();
  const balances = useLiveQuery(() => db.balances.toArray());
  const adjustments = useLiveQuery(() => getAdjustmentHistory());
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const isLoading =
    balances === undefined ||
    adjustments === undefined ||
    categories === undefined ||
    settings === undefined;
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [month, setMonth] = useState(getCurrentMonth());
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

  const handleExportPDF = async () => {
    downloadBlob(`taptrack-${month}-report.pdf`, await exportPDF(month));
    toast.success('PDF downloaded.');
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
      toast.error(err instanceof Error ? err.message : 'Backup could not be restored. Check the file and try again.');
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
      toast.error(err instanceof Error ? err.message : 'Your synced account could not be restored. Try again.');
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
      toast.error(err instanceof Error ? err.message : 'Data on this device could not be reset. Try again.');
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
      toast.error(err instanceof Error ? err.message : 'Your synced account could not be reset. Try again.');
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
      toast.error(err instanceof Error ? err.message : 'Sync could not finish. Check your connection and try again.');
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading settings">
        <PageHeader title="Settings" description="Make TapTrack yours." />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const aiEnabled = settings.aiCategorizationEnabled ?? false;
  const aiActive = Boolean(aiEnabled && accountEmail);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Make TapTrack yours." />

      <nav aria-label="Settings sections" className="flex flex-wrap gap-2 rounded-xl border border-subtle bg-surface p-2">
        <SettingsJump href="#preferences">Personalize</SettingsJump>
        <SettingsJump href="#quick-capture">Capture</SettingsJump>
        <SettingsJump href="#balances">Ledger</SettingsJump>
        <SettingsJump href="#account">Account & sync</SettingsJump>
        <SettingsJump href="#data">Data</SettingsJump>
      </nav>

      <section id="preferences" className="scroll-mt-24 rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Preferences</h2>
        <div className="mt-4">
          <SelectField
            label="Default payment method"
            value={settings.lastUsedMethod ?? 'card'}
            onChange={(event) => handleChangeDefaultMethod(event.target.value as Method)}
            options={SUPPORTED_METHODS.map((method) => ({
              value: method,
              label: method.charAt(0).toUpperCase() + method.slice(1),
            }))}
          />
        </div>
        <ToggleRow
          className="mt-5"
          label="Dark mode"
          checked={darkModeEnabled}
          onChange={handleToggleDarkMode}
        />
        <div className="mt-5 border-t border-subtle pt-5">
          <ToggleRow
            label="Smart Categories"
            description={accountEmail ? 'Suggest categories while you type.' : 'Sign in to use smart suggestions.'}
            checked={aiEnabled}
            onChange={handleToggleAI}
            disabled={!accountChecked}
            variant="ai"
          />
          {aiActive ? (
            <span className="mt-3 inline-flex rounded-full border border-ai-border bg-ai-muted px-2.5 py-1 text-xs font-semibold text-ai-text">✦ On</span>
          ) : null}
        </div>
      </section>

      <CurrencySettingsCard />

      <div id="quick-capture" className="scroll-mt-24">
        <QuickCaptureSettings signedIn={Boolean(accountEmail)} />
      </div>

      <section id="balances" className="scroll-mt-24 rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-primary">Balances</h2>
          <details className="relative">
            <summary className={cn('cursor-pointer list-none rounded-lg px-2 py-1 text-xs font-semibold text-accent [&::-webkit-details-marker]:hidden', focusVisibleRing)}>
              How balance checks work
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-subtle bg-surface p-3 text-xs leading-5 text-muted shadow-lg">
              Your starting balances stay unchanged. When you correct a balance, TapTrack records the new amount from that point forward without changing older transactions.
            </div>
          </details>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {balances.map((balance) => (
            <div key={balance.id} className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-muted px-3 py-3">
              <span className="text-sm font-semibold capitalize text-secondary">{balance.currency} {balance.method}</span>
              <span className="text-sm font-semibold tabular-nums text-primary">{formatMoney(balance.amount, balance.currency)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Balance checks</h2>
        {adjustments.length === 0 ? (
          <p className="mt-4 rounded-lg border border-subtle bg-surface-muted p-3 text-sm text-muted">No balance corrections yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
            {adjustments.map((checkpoint) => <AdjustmentRow key={checkpoint.id} checkpoint={checkpoint} />)}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Categories</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
            onChange={(event) => setCategoryType(event.target.value as TransactionType)}
            options={CATEGORY_TYPE_OPTIONS}
          />
          <SelectField label="Icon" value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value)} options={CATEGORY_ICON_OPTIONS} />
          <label htmlFor="category-color" className="grid gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-secondary">Color</span>
            <input
              id="category-color"
              type="color"
              value={categoryColor}
              onChange={(event) => setCategoryColor(event.target.value)}
              className={cn('min-h-11 w-full cursor-pointer rounded-lg border border-subtle bg-surface px-2 py-1 outline-none focus-visible:border-accent', focusVisibleRing)}
              aria-label="Category color"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
            <Button type="button" className="w-full sm:w-auto" onClick={editingCategory ? saveCategoryEdit : addCategory}>
              {editingCategory ? 'Save changes' : 'Add category'}
            </Button>
            {editingCategory ? (
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={cancelCategoryEdit}>Cancel</Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {categories.map((category) => (
            <div key={category.id} className="rounded-lg border border-subtle bg-surface-muted p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: category.color ?? '#64748b' }} aria-hidden />
                  <span className="min-w-0 truncate text-sm font-semibold text-primary">{category.name}</span>
                  <CategoryTypeBadge type={category.type} />
                </div>
                <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-auto">
                  <Button type="button" variant="secondary" className="min-h-11 min-w-11 flex-1 px-4 sm:flex-none" onClick={() => startCategoryEdit(category)}>Edit</Button>
                  {category.isDefault ? null : (
                    <Button type="button" variant="dangerGhost" className="min-h-11 min-w-11 flex-1 px-4 sm:flex-none" onClick={() => setCategoryDeleteConfirm(category)}>Delete</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="account" className="scroll-mt-24 rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">Account</h2>
            <p className="mt-1 text-sm text-muted">
              {!accountChecked ? 'Checking…' : accountEmail ? accountEmail : 'Not signed in'}
            </p>
          </div>
          {accountEmail ? (
            <Button type="button" variant="secondary" onClick={handleSignOut} loading={signingOut} disabled={signingOut}>
              Sign out
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => router.push('/login')} disabled={!accountChecked}>
              Sign in
            </Button>
          )}
        </div>
      </section>

      <section id="sync" className="scroll-mt-24 rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">Sync</h2>
            <p className="mt-1 text-sm font-medium text-secondary">{buildSyncSummary(syncStatus)}</p>
          </div>
          <Button type="button" onClick={handleSyncNow} loading={syncing} disabled={syncing || !syncStatus?.syncAllowed}>Sync now</Button>
        </div>
        <details className="group mt-3 rounded-lg border border-subtle bg-surface-muted">
          <summary className={cn('flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-medium text-secondary select-none [&::-webkit-details-marker]:hidden', focusVisibleRing)}>
            <span>Sync details</span>
            <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <dl className="divide-y divide-subtle border-t border-subtle px-3 text-sm">
            <SyncDetailRow label="Account" value={syncStatus?.authenticated ? 'Signed in' : 'Not signed in'} />
            <SyncDetailRow label="Connection" value={syncStatus?.online ? 'Online' : 'Offline'} />
            <SyncDetailRow label="Received from account" value={formatSyncTimestamp(syncStatus?.lastSyncAt)} />
            <SyncDetailRow label="Saved to account" value={formatSyncTimestamp(syncStatus?.lastPushAt)} />
            {(syncStatus?.pendingRetryCount ?? 0) > 0 ? <SyncDetailRow label="Waiting to sync" value={String(syncStatus?.pendingRetryCount ?? 0)} /> : null}
          </dl>
        </details>
        {syncStatus?.bindingState === 'unlinked' ? <CloudLedgerLink onLinked={refreshSyncStatus} /> : null}
        <CloudDeviceDisconnect onDisconnected={refreshSyncStatus} />
        {syncStatus?.bindingState === 'account-mismatch' ? (
          <p role="alert" className="mt-4 rounded-lg border border-danger bg-danger-muted p-3 text-sm text-danger">
            This device is connected to a different account. Sign in with that account before syncing.
          </p>
        ) : null}
      </section>

      <section id="data" className="scroll-mt-24 rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Data & exports</h2>
        <p className="mt-1 text-sm text-muted">Download reports or keep a restorable copy of your TapTrack data.</p>
        <div className="mt-4 max-w-xs">
          <Field label="Report month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleExportCSV}>Export CSV</Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleExportJSON}>Download backup</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => importInputRef.current?.click()}>Restore backup</Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleExportPDF}>Export PDF</Button>
        </div>
        <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
      </section>

      <section className="rounded-2xl border border-danger/30 bg-danger-muted p-5">
        <h2 className="text-base font-semibold text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-muted">A safety backup is downloaded before reset. If sync is on, you can reset only this device or your synced account.</p>
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

function SettingsJump({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-muted hover:text-primary',
        focusVisibleRing
      )}
    >
      {children}
    </a>
  );
}

function AdjustmentRow({ checkpoint }: { checkpoint: BalanceCheckpoint }) {
  const deltaLabel =
    checkpoint.deltaAmount === 0
      ? 'No change'
      : `${checkpoint.deltaAmount > 0 ? '+' : ''}${formatMoney(checkpoint.deltaAmount, checkpoint.currency)}`;

  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold capitalize text-primary">{checkpoint.currency} {checkpoint.method}</p>
        <p className="mt-0.5 text-xs font-medium text-muted">
          {checkpoint.month ?? checkpoint.date ?? 'Balance check'} · recorded {formatMoney(checkpoint.observedAmount, checkpoint.currency)}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          checkpoint.deltaAmount > 0 ? 'text-success' : checkpoint.deltaAmount < 0 ? 'text-danger' : 'text-muted'
        )}
      >
        {deltaLabel}
      </span>
    </div>
  );
}

function CategoryTypeBadge({ type }: { type: TransactionType }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize', type === 'income' ? 'bg-success-muted text-success' : 'bg-danger-muted text-danger')}>
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
