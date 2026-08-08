'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureDatabaseSeeded } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { parseAmountInput } from '@/format';
import { exportCSV, exportJSON, exportPDF, importJSON } from '@/exports/exportService';
import { deleteCategory, updateCategory } from '@/budgets/budgetService';
import { SUPPORTED_METHODS, type Category, type Method, type TransactionType } from '@/types';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';
import {
  getSyncStatus,
  pushRecord,
  syncAllLocalData,
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
  const categories = useLiveQuery(() => db.categories.toArray());
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID));
  const isLoading = balances === undefined || categories === undefined || settings === undefined;
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
  const [signingOut, setSigningOut] = useState(false);
  const darkModeEnabled = settings?.darkModeEnabled ?? (resolveStoredTheme() === 'dark');

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
    void getSignedInEmail().then(setAccountEmail);
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

  const updateBalance = async (id: string, value: string) => {
    const existing = await db.balances.get(id);
    if (!existing) return;

    const updatedBalance = {
      ...existing,
      amount: parseAmountInput(value),
      updatedAt: new Date().toISOString(),
    };
    await db.balances.put(updatedBalance);
    void pushRecord('balances', updatedBalance as unknown as Record<string, unknown>);
    toast.success('Balance updated.');
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
    await syncAllLocalData();
    await refreshSyncStatus();
    toast.success('JSON backup imported.');
  };

  const resetAppData = async () => {
    await db.transaction(
      'rw',
      [
        db.transactions,
        db.balances,
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
    await syncAllLocalData();
    await refreshSyncStatus();
    toast.success('App data reset. Setup will show again.');
  };

  const handleChangeDefaultMethod = async (method: Method) => {
    if (!settings) return;
    const updatedSettings = { ...settings, lastUsedMethod: method, updatedAt: new Date().toISOString() };
    await db.settings.put(updatedSettings);
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>);
    toast.success('Default method updated.');
  };

  const handleToggleAI = async () => {
    if (!settings) return;
    const next = !settings.aiCategorizationEnabled;
    const updatedSettings = { ...settings, aiCategorizationEnabled: next, updatedAt: new Date().toISOString() };
    await db.settings.put(updatedSettings);
    void pushRecord('settings', updatedSettings as unknown as Record<string, unknown>);
    toast.success(next ? 'AI categorization enabled.' : 'AI categorization disabled.');
  };

  const handleToggleDarkMode = async () => {
    if (!settings) return;
    const next = !(settings.darkModeEnabled ?? false);
    const updatedSettings = { ...settings, darkModeEnabled: next, updatedAt: new Date().toISOString() };
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

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Account, preferences, and data." />

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Account</h2>
        <p className="mt-1 text-sm text-muted">
          {accountEmail ? `Signed in as ${accountEmail}` : 'Signed in'}
        </p>
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
            When enabled, the quick command can suggest a category using AI on your device.
          </p>
          <ToggleRow
            className="mt-4"
            label={settings.aiCategorizationEnabled ? 'AI categorization enabled' : 'AI categorization disabled'}
            checked={settings.aiCategorizationEnabled ?? false}
            onChange={handleToggleAI}
            variant="ai"
          />
          {settings.aiCategorizationEnabled ? (
            <p className="mt-3 rounded-md border border-ai-border bg-ai-muted px-3 py-2 text-xs font-medium text-ai-text">
              Set <code className="font-mono">OLLAMA_BASE_URL</code> and <code className="font-mono">OLLAMA_MODEL</code> in your environment.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-primary">Money</h2>
        <p className="mt-1 text-sm text-muted">Update your cash and card balances. TRY is the main currency; USD and EUR stay separate.</p>
        <div className="mt-4 grid gap-3">
          {balances.map((balance) => (
            <BalanceRow
              key={`${balance.id}:${balance.amount}`}
              label={`${balance.currency} ${balance.method}`}
              amount={balance.amount}
              onSave={(value) => updateBalance(balance.id, value)}
            />
          ))}
        </div>
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
            <Button type="button" className="w-full sm:w-auto" onClick={editingCategory ? saveCategoryEdit : addCategory}>
              {editingCategory ? 'Save' : 'Add'}
            </Button>
            {editingCategory ? (
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={cancelCategoryEdit}>
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
                  <span className="min-w-0 truncate text-sm font-semibold text-primary">{category.name}</span>
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
            disabled={syncing || !syncStatus?.authenticated}
          >
            Sync now
          </Button>
        </div>
        <p className="mt-4 text-sm font-medium text-secondary">
          {buildSyncSummary(syncStatus)}
        </p>
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
            <SyncDetailRow label="Account" value={syncStatus?.authenticated ? 'Signed in' : 'Not signed in'} />
            <SyncDetailRow label="Network" value={syncStatus?.online ? 'Online' : 'Offline'} />
            <SyncDetailRow label="Last download" value={formatSyncTimestamp(syncStatus?.lastSyncAt)} />
            <SyncDetailRow label="Last upload" value={formatSyncTimestamp(syncStatus?.lastPushAt)} />
            {(syncStatus?.pendingRetryCount ?? 0) > 0 ? (
              <SyncDetailRow label="Waiting to sync" value={String(syncStatus?.pendingRetryCount ?? 0)} />
            ) : null}
          </dl>
          <p className="border-t border-subtle px-3 py-2 text-xs font-medium text-muted">
            Cloud sync is optional. Tracking, import, export, and manual entry work without it.
          </p>
        </details>
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
          <Button type="button" variant="secondary" size="sm" onClick={() => importInputRef.current?.click()}>
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
          Permanently erase all transactions, balances, budgets, categories, and settings. This cannot be undone.
        </p>
        <Button type="button" variant="danger" className="mt-4" onClick={() => setShowResetConfirm(true)}>
          Reset all data
        </Button>
      </section>

      <ConfirmDialog
        open={showResetConfirm}
        title="Reset all app data"
        message="This will permanently erase all transactions, balances, budgets, categories, and settings. This cannot be undone."
        confirmLabel="Reset everything"
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

function parseBalanceAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function BalanceRow({
  label,
  amount,
  onSave,
}: {
  label: string;
  amount: number;
  onSave: (value: string) => Promise<void>;
}) {
  const [input, setInput] = useState(String(amount));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = parseBalanceAmount(input);
  const dirty = parsed !== null && parsed !== amount;
  const showInvalid = input.trim() !== '' && parsed === null;

  const handleSave = async () => {
    if (parsed === null) {
      setError('Enter a valid amount.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Balance could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_140px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold text-primary">{label}</p>
      </div>
      <input
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
          setError('');
        }}
        inputMode="decimal"
        className={cn(
          'min-h-11 rounded-lg border border-subtle px-3 py-2 text-sm font-medium text-primary outline-none focus-visible:border-accent',
          focusVisibleRing
        )}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-w-11 shrink-0"
        loading={saving}
        disabled={saving || !dirty}
        onClick={handleSave}
      >
        Save
      </Button>
      {error || showInvalid ? (
        <p className="text-sm font-medium text-danger md:col-span-3">{error || 'Enter a valid amount.'}</p>
      ) : null}
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

  const syncPart = status.authenticated ? formatRelativeSyncTime(status.lastSyncAt) : 'Not signed in';
  const networkPart = status.online ? 'Online' : 'Offline';
  const pendingPart = `${status.pendingRetryCount} pending`;

  return `${syncPart} · ${networkPart} · ${pendingPart}`;
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

