'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureDatabaseSeeded } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
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

const CATEGORY_ICON_OPTIONS = ['circle', 'utensils', 'home', 'repeat', 'ticket', 'arrow-down'];

export default function SettingsWorkspace() {
  const balances = useLiveQuery(() => db.balances.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID), []);
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
    void refreshSyncStatus();
    window.addEventListener('online', refreshSyncStatus);
    window.addEventListener('offline', refreshSyncStatus);
    return () => {
      window.removeEventListener('online', refreshSyncStatus);
      window.removeEventListener('offline', refreshSyncStatus);
    };
  }, [refreshSyncStatus]);

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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Settings</h1>
        <p className="text-sm font-medium text-slate-500">Local data controls, balances, categories, and exports.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
          <h2 className="text-base font-semibold text-slate-950">Balances</h2>
          <div className="mt-4 grid gap-3">
            {balances.map((balance) => (
              <BalanceRow key={balance.id} label={`${balance.currency} ${balance.method}`} value={formatMoney(balance.amount, balance.currency)} onSave={(value) => updateBalance(balance.id, value)} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
          <h2 className="text-base font-semibold text-slate-950">Defaults</h2>
          <label className="mt-4 grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Last-used method fallback
            <select value={settings?.lastUsedMethod ?? 'card'} onChange={(event) => handleChangeDefaultMethod(event.target.value as Method)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500">
              {SUPPORTED_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          <div className="mt-5 rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-600">
            Default currency is TRY for V1. USD/EUR are tracked as separate balances without conversion.
          </div>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <span className="text-sm font-semibold text-slate-700">
              Dark mode {darkModeEnabled ? 'on' : 'off'}
            </span>
            <button
              type="button"
              onClick={handleToggleDarkMode}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                darkModeEnabled ? 'bg-violet-600' : 'bg-slate-200'
              }`}
              role="switch"
              aria-checked={darkModeEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  darkModeEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
          <h2 className="text-base font-semibold text-slate-950">AI categorization</h2>
          <p className="mt-1 text-sm text-slate-500">
            When enabled, the preview card sends the transaction title to a local Ollama model and suggests a category. Falls back to keyword rules if unreachable.
          </p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-slate-700">
              {settings?.aiCategorizationEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              type="button"
              onClick={handleToggleAI}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                settings?.aiCategorizationEnabled ? 'bg-violet-600' : 'bg-slate-200'
              }`}
              role="switch"
              aria-checked={settings?.aiCategorizationEnabled ?? false}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  settings?.aiCategorizationEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {settings?.aiCategorizationEnabled && (
            <p className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700">
              Set <code className="font-mono">OLLAMA_BASE_URL</code> and <code className="font-mono">OLLAMA_MODEL</code> in your environment. Model recommendation: <code className="font-mono">qwen2.5:1.5b</code> or <code className="font-mono">llama3.2:1b</code>.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Sync status</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cloud sync is optional and local data remains usable when remote services fail.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing || !syncStatus?.authenticated}
            className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? 'Syncing' : 'Sync now'}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <SyncMetric label="Account" value={syncStatus?.authenticated ? 'Signed in' : 'Not signed in'} />
          <SyncMetric label="Network" value={syncStatus?.online ? 'Online' : 'Offline'} />
          <SyncMetric label="Last pull" value={formatSyncTimestamp(syncStatus?.lastSyncAt)} />
          <SyncMetric label="Last push" value={formatSyncTimestamp(syncStatus?.lastPushAt)} />
          <SyncMetric label="Pending retries" value={String(syncStatus?.pendingRetryCount ?? 0)} />
        </div>
        <p className="mt-3 text-xs font-medium text-slate-400">
          Telegram and AI remain optional integrations. Local tracking, import, export, and manual entry do not depend on them.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        <h2 className="text-base font-semibold text-slate-950">Categories</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_150px_130px_120px_auto]">
          <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500" />
          <select value={categoryType} disabled={editingCategory?.isDefault} onChange={(event) => setCategoryType(event.target.value as TransactionType)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400">
            <option value="expense">expense</option>
            <option value="income">income</option>
          </select>
          <select value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500">
            {CATEGORY_ICON_OPTIONS.map((icon) => (
              <option key={icon} value={icon}>{icon}</option>
            ))}
          </select>
          <input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 py-1" />
          <div className="flex gap-2">
            <button type="button" onClick={editingCategory ? saveCategoryEdit : addCategory} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">
              {editingCategory ? 'Save' : 'Add'}
            </button>
            {editingCategory ? (
              <button type="button" onClick={cancelCategoryEdit} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: category.color ?? '#64748b' }} />
                <div>
                  <span className="text-sm font-semibold text-slate-950">{category.name}</span>
                  <p className="text-xs font-medium text-slate-400">{category.icon ?? 'circle'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-normal text-slate-500">{category.type}</span>
                <button type="button" onClick={() => startCategoryEdit(category)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Edit
                </button>
                {category.isDefault ? null : (
                  <button type="button" onClick={() => setCategoryDeleteConfirm(category)} className="text-xs font-semibold text-red-500 hover:text-red-700">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs shadow-slate-200/50 transition-all hover:shadow-md">
        <h2 className="text-base font-semibold text-slate-950">Exports and backup</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr] md:items-end">
          <label className="grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Report month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleExportCSV} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Export CSV</button>
            <button type="button" onClick={handleExportJSON} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Export JSON</button>
            <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Import JSON</button>
            <button type="button" onClick={handleExportPDF} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Export PDF</button>
            <button type="button" onClick={() => setShowResetConfirm(true)} className="rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Reset data</button>
          </div>
        </div>
        <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={(event) => handleImportFile(event.target.files?.[0])} />
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
        message={`Delete "${categoryDeleteConfirm?.name}"? Transactions using this category will move to the matching fallback category.`}
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

function BalanceRow({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => Promise<void> }) {
  const [input, setInput] = useState('');

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_140px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold text-slate-950">{label}</p>
        <p className="text-xs font-medium text-slate-500">{value}</p>
      </div>
      <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="New amount" inputMode="decimal" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500" />
      <button type="button" onClick={() => { onSave(input); setInput(''); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Save</button>
    </div>
  );
}

function SyncMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatSyncTimestamp(value: string | null | undefined) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function downloadText(filename: string, text: string, type: string) {
  downloadBlob(filename, new Blob([text], { type }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
