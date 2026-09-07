'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureDatabaseSeeded } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { formatMoney } from '@/format';
import { exportCSV, exportJSON, exportPDF, importJSON } from '@/exports/exportService';
import { deleteCategory, updateCategory } from '@/budgets/budgetService';
import { getAdjustmentHistory } from '@/balances/reconciliationService';
import {
  SUPPORTED_METHODS,
  type BalanceCheckpoint,
  type Category,
  type Method,
  type TransactionType,
} from '@/types';
import { ConfirmDialog } from './ConfirmDialog';
import { CloudLedgerLink } from './CloudLedgerLink';
import { toast } from 'sonner';
import {
  getSyncStatus,
  pushRecord,
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
  const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState<Category | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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
    const now = new Date().toISOString();
    const category = {
      id: `cat-${crypto.randomUUID()}`,
      name: categoryName.trim(),
      color: categoryColor,
      icon: categoryIcon,
      isDefault: false,
      type: categoryType,
      createdAt: now,
      updatedAt: now,
    };
    await db.categories.add(category);
    void pushRecord('categories', category as unknown as Record<string, unknown>);
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
      toast.error(err instanceof Error ? err.message : 'Category could not be updated.');
    }
  };

  const handleExportCSV = async () => {
    downloadText('taptrack-transactions.csv', await exportCSV(), 'text/csv');
    toast.success('CSV export created.');
  };

  const handleExportJSON = async () => {
    downloadText('taptrack-backup.json', await exportJSON(), 'application/json');
    toast.success('JSON backup created.');
  };

  const handleExportPDF = async () => {
    downloadBlob(`taptrack-${month}-report.pdf`, await exportPDF(month));
    toast.success('PDF report created.');
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    await importJSON(await file.text());
    await refreshSyncStatus();
    toast.success('JSON backup imported locally.');
  };

  const resetAppData = async () => {
    await db.transaction(
      'rw',
      [
        db.transactions,
        db.balances,
        db.balanceCheckpoints,
        db.categories,
        db.monthlyBudgets,
        db.categoryBudgets,
        db.recurringTransactions,
        db.conversions,
        db.settings,
      ],
      async () => {
        await Promise.all([
          db.transactions.clear(),
          db.balances.clear(),
          db.balanceCheckpoints.clear(),
          db.categories.clear(),
          db.monthlyBudgets.clear(),
          db.categoryBudgets.clear(),
          db.recurringTransactions.clear(),
          db.conversions.clear(),
          db.settings.clear(),
        ]);
      }
    );
    await ensureDatabaseSeeded();
    await refreshSyncStatus();
    toast.success('Local app data reset. Setup will show again.');
  };

  const handleChangeDefaultMethod = async (method: Method) => {
    if (!settings) return;
    const updatedSettings = {
      ...settings,
      lastUsedMethod: method,
      updatedAt: new Date().toISOString(),
    };
    await db.settings.put(updatedSettings);
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>);
    toast.success('Default method updated.');
  };

  const handleToggleAI = async () => {
    if (!settings) return;
    const next = !settings.aiCategorizationEnabled;

    if (next && !accountEmail) {
      toast.info('Sign in to enable AI categorization.');
      router.push('/login');
      return;
    }

    const updatedSettings = {
      ...settings,
      aiCategorizationEnabled: next,
      updatedAt: new Date().toISOString(),
    };
    await db.settings.put(updatedSettings);
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>);
    toast.success(next ? 'AI categorization enabled.' : 'AI categorization disabled.');
  };

  const handleToggleDarkMode = async () => {
    if (!settings) return;
    const next = !(settings.darkModeEnabled ?? false);
    const updatedSettings = {
      ...settings,
      darkModeEnabled: next,
      updatedAt: new Date().toISOString(),
    };
    await db.settings.put(updatedSettings);
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>);

    const theme: ThemeMode = next ? 'dark' : 'light';
    setStoredTheme(theme);
    applyTheme(theme);
    toast.success(next ? 'Dark mode enabled.' : 'Dark mode disabled.');
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
      await refreshSyncStatus();
      toast.success('Sync completed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading settings">
        <PageHeader title="Settings" description="Account, preferences, and data." />
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
      <PageHeader title="Settings" description="Account, preferences, and data." />

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Account</h2>
        <p className="mt-1 text-sm text-muted">
          {!accountChecked
            ? 'Checking account…'
            : accountEmail
              ? `Signed in as ${accountEmail}`
              : 'No cloud account signed in'}
        </p>
        {accountEmail ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
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
            className="mt-4"
            onClick={() => router.push('/login')}
            disabled={!accountChecked}
          >
            Optional account sign in
          </Button>
        )}
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
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
          label={`Dark mode ${darkModeEnabled ? 'on' : 'off'}`}
          checked={darkModeEnabled}
          onChange={handleToggleDarkMode}
        />
        <div className="mt-5 border-t border-subtle pt-5">
          <p className="text-sm text-muted">
            AI categorization sends the transaction title and available category names to TapTrack's
            server, which asks Groq for a category suggestion. A signed-in account is required.
          </p>
          <ToggleRow
            className="mt-4"
            label={
              aiEnabled
                ? aiActive
                  ? 'AI categorization enabled'
                  : 'AI categorization paused until sign-in'
                : 'AI categorization disabled'
            }
            description={
              accountEmail
                ? 'Hosted Groq suggestions are used only while you are signed in.'
                : 'Sign in before enabling hosted AI categorization.'
            }
            checked={aiEnabled}
            onChange={handleToggleAI}
            disabled={!accountChecked}
            variant="ai"
          />
          {aiActive ? (
            <p className="mt-3 rounded-md border border-ai-border bg-ai-muted px-3 py-2 text-xs font-medium text-ai-text">
              Hosted Groq categorization is active for this signed-in account.
            </p>
          ) : aiEnabled && accountChecked ? (
            <p className="mt-3 rounded-md border border-ai-border bg-ai-muted px-3 py-2 text-xs font-medium text-ai-text">
              Sign in to resume AI categorization. Local transaction tracking continues normally.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Money</h2>
        <p className="mt-1 text-sm text-muted">
          Starting balances are set once during setup. After that, balances change only through
          recorded activity and monthly reconciliation.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {balances.map((balance) => (
            <div
              key={balance.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-muted px-3 py-3"
            >
              <span className="text-sm font-semibold capitalize text-secondary">
                {balance.currency} {balance.method}
              </span>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {formatMoney(balance.amount, balance.currency)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Adjustment history</h2>
        <p className="mt-1 text-sm text-muted">
          Monthly reconciliation corrections are kept separate from income and spending reports.
        </p>
        {adjustments.length === 0 ? (
          <p className="mt-4 rounded-lg border border-subtle bg-surface-muted p-3 text-sm text-muted">
            No monthly reconciliations recorded yet.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
            {adjustments.map((checkpoint) => (
              <AdjustmentRow key={checkpoint.id} checkpoint={checkpoint} />
            ))}
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
              {editingCategory ? 'Save' : 'Add'}
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
        <div className="mt-4 grid gap-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className="rounded-lg border border-subtle bg-surface-muted p-3"
            >
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

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">Sync</h2>
            <p className="mt-1 text-sm text-muted">
              Cloud sync is optional. Your data stays on this device even if sync is off.
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
        <p className="mt-4 text-sm font-medium text-secondary">{buildSyncSummary(syncStatus)}</p>
        <details className="mt-3 rounded-lg border border-subtle bg-surface-muted">
          <summary
            className={cn(
              'flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-medium text-secondary select-none [&::-webkit-details-marker]:hidden',
              focusVisibleRing
            )}
          >
            Sync details
          </summary>
          <dl className="divide-y divide-subtle border-t border-subtle px-3 text-sm">
            <SyncDetailRow
              label="Account"
              value={syncStatus?.authenticated ? 'Signed in' : 'Not signed in'}
            />
            <SyncDetailRow label="Network" value={syncStatus?.online ? 'Online' : 'Offline'} />
            <SyncDetailRow
              label="Last download"
              value={formatSyncTimestamp(syncStatus?.lastSyncAt)}
            />
            <SyncDetailRow
              label="Last upload"
              value={formatSyncTimestamp(syncStatus?.lastPushAt)}
            />
            {(syncStatus?.pendingRetryCount ?? 0) > 0 ? (
              <SyncDetailRow
                label="Waiting to sync"
                value={String(syncStatus?.pendingRetryCount ?? 0)}
              />
            ) : null}
          </dl>
          <p className="border-t border-subtle px-3 py-2 text-xs font-medium text-muted">
            This ledger belongs to the browser profile. Cloud sync is optional and must be linked
            explicitly to one account.
          </p>
        </details>
        {syncStatus?.bindingState === 'unlinked' ? (
          <CloudLedgerLink onLinked={refreshSyncStatus} />
        ) : null}
        {syncStatus?.bindingState === 'account-mismatch' ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger bg-danger-muted p-3 text-sm text-danger"
          >
            This browser ledger is linked to a different account. Local tracking remains available,
            but every cloud read and write is blocked.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Data &amp; export</h2>
        <p className="mt-1 text-sm text-muted">Export a backup or import from a JSON file.</p>
        <div className="mt-4 max-w-xs">
          <Field
            label="Report month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleExportJSON}>
            Export JSON
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => importInputRef.current?.click()}
          >
            Import JSON
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleExportPDF}>
            Export PDF
          </Button>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => handleImportFile(event.target.files?.[0])}
        />
      </section>

      <section className="rounded-2xl border border-danger/30 bg-danger-muted p-5">
        <h2 className="text-base font-semibold text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-muted">
          Permanently erase local transactions, balances, reconciliation history, budgets,
          categories, and settings. This cannot be undone.
        </p>
        <Button
          type="button"
          variant="danger"
          className="mt-4"
          onClick={() => setShowResetConfirm(true)}
        >
          Reset all data
        </Button>
      </section>

      <ConfirmDialog
        open={showResetConfirm}
        title="Reset local app data"
        message="This will erase the local finance ledger and reconciliation history on this browser. Cloud reset behavior is handled separately."
        confirmLabel="Reset local data"
        confirmVariant="danger"
        onConfirm={async () => {
          setShowResetConfirm(false);
          await resetAppData();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <ConfirmDialog
        open={categoryDeleteConfirm !== null}
        title="Delete category"
        message={`Delete "${categoryDeleteConfirm?.name}"? Transactions using this category will move to a similar category.`}
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

function AdjustmentRow({ checkpoint }: { checkpoint: BalanceCheckpoint }) {
  const deltaLabel =
    checkpoint.deltaAmount === 0
      ? 'No change'
      : `${checkpoint.deltaAmount > 0 ? '+' : ''}${formatMoney(
          checkpoint.deltaAmount,
          checkpoint.currency
        )}`;

  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold capitalize text-primary">
          {checkpoint.currency} {checkpoint.method}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted">
          {checkpoint.month ?? checkpoint.date ?? 'Reconciliation'} · observed{' '}
          {formatMoney(checkpoint.observedAmount, checkpoint.currency)}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          checkpoint.deltaAmount > 0
            ? 'text-success'
            : checkpoint.deltaAmount < 0
              ? 'text-danger'
              : 'text-muted'
        )}
      >
        {deltaLabel}
      </span>
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
  if (!status) return 'Checking sync status…';

  const stateLabel = {
    'provider-unconfigured': 'Cloud sync not configured',
    'signed-out': 'Not signed in',
    unlinked: 'Account signed in; ledger not linked',
    linked: formatRelativeSyncTime(status.lastSyncAt),
    'account-mismatch': 'Account mismatch; sync blocked',
    'provider-unavailable': 'Cloud provider unavailable',
  }[status.bindingState];
  const networkPart = status.online ? 'Online' : 'Offline';
  const pendingPart = `${status.pendingRetryCount} pending`;

  return `${stateLabel} · ${networkPart} · ${pendingPart}`;
}

function formatRelativeSyncTime(value: string | null | undefined): string {
  if (!value) return 'Never synced';

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
