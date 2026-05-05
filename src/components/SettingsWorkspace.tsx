'use client';

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureDatabaseSeeded } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { getCurrentMonth } from '@/dates';
import { formatMoney, parseAmountInput } from '@/format';
import { exportCSV, exportJSON, exportPDF, importJSON } from '@/exports/exportService';
import { SUPPORTED_METHODS, type Method, type TransactionType } from '@/types';

export default function SettingsWorkspace() {
  const balances = useLiveQuery(() => db.balances.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get(DEFAULT_SETTINGS_ID), []);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState(getCurrentMonth());
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<TransactionType>('expense');
  const [categoryColor, setCategoryColor] = useState('#2563eb');

  const updateDefaultMethod = async (method: Method) => {
    if (!settings) return;
    await db.settings.put({ ...settings, lastUsedMethod: method, updatedAt: new Date().toISOString() });
  };

  const updateBalance = async (id: string, value: string) => {
    await db.balances.update(id, { amount: parseAmountInput(value), updatedAt: new Date().toISOString() });
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    const now = new Date().toISOString();
    await db.categories.add({
      id: `cat-${crypto.randomUUID()}`,
      name: categoryName.trim(),
      color: categoryColor,
      icon: 'circle',
      isDefault: false,
      type: categoryType,
      createdAt: now,
      updatedAt: now,
    });
    setCategoryName('');
  };

  const handleExportCSV = async () => {
    downloadText('taptrack-transactions.csv', await exportCSV(), 'text/csv');
    setStatus('CSV export created.');
  };

  const handleExportJSON = async () => {
    downloadText('taptrack-backup.json', await exportJSON(), 'application/json');
    setStatus('JSON backup created.');
  };

  const handleExportPDF = async () => {
    downloadBlob(`taptrack-${month}-report.pdf`, await exportPDF(month));
    setStatus('PDF report created.');
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    await importJSON(await file.text());
    setStatus('JSON backup imported.');
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
    setStatus('App data reset. Setup will show again.');
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Settings</h1>
        <p className="text-sm font-medium text-slate-500">Local data controls, balances, categories, and exports.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Balances</h2>
          <div className="mt-4 grid gap-3">
            {balances.map((balance) => (
              <BalanceRow key={balance.id} label={`${balance.currency} ${balance.method}`} value={formatMoney(balance.amount, balance.currency)} onSave={(value) => updateBalance(balance.id, value)} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Defaults</h2>
          <label className="mt-4 grid gap-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            Last-used method fallback
            <select value={settings?.lastUsedMethod ?? 'card'} onChange={(event) => updateDefaultMethod(event.target.value as Method)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium normal-case text-slate-950 outline-none focus:border-blue-500">
              {SUPPORTED_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          <div className="mt-5 rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-600">
            Default currency is TRY for V1. USD/EUR are tracked as separate balances without conversion.
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Categories</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_120px_auto]">
          <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500" />
          <select value={categoryType} onChange={(event) => setCategoryType(event.target.value as TransactionType)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500">
            <option value="expense">expense</option>
            <option value="income">income</option>
          </select>
          <input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-2 py-1" />
          <button type="button" onClick={addCategory} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">Add</button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: category.color ?? '#64748b' }} />
                <span className="text-sm font-semibold text-slate-950">{category.name}</span>
              </div>
              <span className="text-xs font-medium uppercase tracking-normal text-slate-500">{category.type}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
            <button type="button" onClick={resetAppData} className="rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Reset data</button>
          </div>
        </div>
        <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={(event) => handleImportFile(event.target.files?.[0])} />
        {status ? <p className="mt-3 text-sm font-medium text-slate-600">{status}</p> : null}
      </section>
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
