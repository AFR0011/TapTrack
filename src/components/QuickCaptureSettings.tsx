'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { db } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';
import { getSyncStatus } from '@/sync/syncService';

type CaptureTokenMetadata = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type ShortcutType = 'expense' | 'income';

const SHORTCUT_LINKS: Record<ShortcutType, string | undefined> = {
  expense: process.env.NEXT_PUBLIC_TAPTRACK_EXPENSE_SHORTCUT_URL,
  income: process.env.NEXT_PUBLIC_TAPTRACK_INCOME_SHORTCUT_URL,
};

export function QuickCaptureSettings({ signedIn }: { signedIn: boolean }) {
  const binding = useLiveQuery(() => db.deviceMetadata.get(DEVICE_LEDGER_BINDING_ID), [], null);
  const [linked, setLinked] = useState(false);
  const [linkChecked, setLinkChecked] = useState(false);
  const [tokens, setTokens] = useState<CaptureTokenMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('My iPhone');
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const activeTokens = useMemo(() => tokens.filter((token) => !token.revoked_at), [tokens]);

  useEffect(() => {
    if (binding === null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!signedIn) { setLinked(false); setLinkChecked(true); return; }
      void getSyncStatus().then((status) => { if (!cancelled) { setLinked(status.bindingState === 'linked'); setLinkChecked(true); } });
    });
    return () => { cancelled = true; };
  }, [binding, signedIn]);

  const refresh = async () => {
    if (!signedIn || !linked) return;
    setLoading(true);
    try {
      const response = await fetch('/api/capture-tokens');
      const body = (await response.json()) as { tokens?: CaptureTokenMetadata[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Quick Capture devices could not be loaded.');
      setTokens(body.tokens ?? []);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Quick Capture devices could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!signedIn || !linked || !linkChecked) return;
    queueMicrotask(() => { void refresh(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, linked, linkChecked]);

  const createDevice = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/capture-tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label.trim() || 'My iPhone' }) });
      const body = (await response.json()) as { token?: string; device?: CaptureTokenMetadata; error?: string };
      if (!response.ok || !body.token || !body.device) throw new Error(body.error ?? 'Quick Capture key could not be created.');
      setSetupToken(body.token); setSetupOpen(true); setTokens((current) => [body.device!, ...current]);
      toast.success('Quick Capture key created.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Quick Capture key could not be created.'); }
    finally { setCreating(false); }
  };

  const revoke = async (id: string) => {
    try {
      const response = await fetch('/api/capture-tokens', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Quick Capture device could not be revoked.');
      setTokens((current) => current.map((token) => token.id === id ? { ...token, revoked_at: new Date().toISOString() } : token));
      toast.success('Quick Capture device revoked.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Quick Capture device could not be revoked.'); }
  };

  if (!signedIn || !linked) {
    return <section className="rounded-2xl border border-subtle bg-surface p-5"><div className="flex items-center gap-3"><QuickCaptureIcon /><div><h2 className="text-base font-semibold text-primary">Quick Capture</h2><p className="mt-0.5 text-sm text-muted">{!signedIn ? 'Sign in to add transactions from iPhone Shortcuts.' : !linkChecked ? 'Checking cloud sync…' : 'Link cloud sync on this device before setting up iPhone Shortcuts.'}</p></div></div></section>;
  }

  return <>
    <section className="rounded-2xl border border-subtle bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><QuickCaptureIcon /><div><h2 className="text-base font-semibold text-primary">Quick Capture</h2><p className="mt-1 text-sm text-muted">Log from Siri, Home Screen, Back Tap, or the Action Button on supported iPhones.</p></div></div><span className="w-fit rounded-full border border-subtle bg-surface-muted px-2.5 py-1 text-xs font-semibold text-secondary">{activeTokens.length > 0 ? `${activeTokens.length} connected` : 'Not set up'}</span></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="Device name" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="My iPhone" maxLength={80} /><Button type="button" onClick={() => void createDevice()} loading={creating} disabled={creating}>Set up iPhone</Button></div>
      {loading ? <div className="mt-4 h-14 animate-pulse rounded-xl bg-surface-muted" aria-hidden="true" /> : activeTokens.length > 0 ? <div className="mt-5 divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">{activeTokens.map((token) => <div key={token.id} className="flex items-center justify-between gap-3 bg-surface-muted px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-primary">{token.label}</p><p className="mt-0.5 text-xs font-medium text-muted">{token.last_used_at ? `Last used ${formatWhen(token.last_used_at)}` : 'Ready to connect'}</p></div><Button type="button" variant="dangerGhost" size="sm" onClick={() => void revoke(token.id)}>Revoke</Button></div>)}</div> : null}
    </section>
    {setupOpen && setupToken ? <ShortcutSetupSheet token={setupToken} onClose={() => { setSetupOpen(false); setSetupToken(null); }} /> : null}
  </>;
}

function ShortcutSetupSheet({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [shortcutType, setShortcutType] = useState<ShortcutType>('expense');
  const templateUrl = SHORTCUT_LINKS[shortcutType];
  const endpoint = typeof window === 'undefined' ? '/api/capture' : `${window.location.origin}/api/capture`;
  const shortcutName = shortcutType === 'expense' ? 'TapTrack Expense' : 'TapTrack Income';

  const copyToken = async () => { await navigator.clipboard.writeText(token); setCopied(true); toast.success('Private key copied.'); };

  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--overlay)] p-0 sm:items-center sm:p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="shortcut-setup-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-subtle bg-surface p-5 shadow-[var(--shadow-overlay)] sm:max-w-lg sm:rounded-3xl sm:p-6">
    <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-surface-raised sm:hidden" />
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-accent">iPhone Quick Capture</p><h2 id="shortcut-setup-title" className="mt-1 text-2xl font-semibold tracking-tight text-primary">Two steps. No API assembly required.</h2></div><button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-muted text-xl text-secondary">×</button></div>

    <div className="mt-5 grid grid-cols-2 rounded-xl bg-surface-muted p-1" aria-label="Shortcut type">{(['expense', 'income'] as ShortcutType[]).map((type) => <button key={type} type="button" aria-pressed={shortcutType === type} onClick={() => setShortcutType(type)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold capitalize ${shortcutType === type ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>{type}</button>)}</div>

    <div className="mt-6 space-y-4">
      <SetupStep number="1" title="Copy your private key"><p className="text-sm text-muted">Your shortcut asks for this once during installation. TapTrack never shows it again.</p><Button type="button" variant="secondary" className="mt-3" onClick={() => void copyToken()}>{copied ? 'Copied ✓' : 'Copy private key'}</Button></SetupStep>
      <SetupStep number="2" title={`Install ${shortcutName}`}>
        {templateUrl ? <><p className="text-sm text-muted">Apple will ask for the private key you just copied, then add the shortcut to your library.</p><a href={templateUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white">Install Shortcut</a></> : <><p className="text-sm text-muted">The shared template link has not been published yet. The temporary manual fallback below uses only two prompts and one web request.</p><details className="mt-3 rounded-xl border border-subtle bg-surface-muted p-3"><summary className="cursor-pointer text-sm font-semibold text-secondary">Manual fallback</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted"><li>Tap <a href="shortcuts://create-shortcut" className="font-semibold text-accent">Create Shortcut</a> and name it <strong>{shortcutName}</strong>.</li><li>Add <strong>Ask for Input</strong> as Number for “Amount”, then another as Text for “What was it?”.</li><li>Add <strong>Get Contents of URL</strong>, use <code className="rounded bg-surface px-1">{endpoint}</code>, method POST, JSON body with <code>type</code> = <strong>{shortcutType}</strong>, <code>amount</code> = Amount, <code>title</code> = What was it?, and Authorization header <code>Bearer [your private key]</code>.</li></ol><p className="mt-3 text-xs text-muted">No UUID or date action is required. TapTrack handles those server-side.</p></details></>}
      </SetupStep>
      <div className="rounded-2xl bg-accent-muted p-4"><p className="text-sm font-semibold text-accent">On iPhone 14 Pro</p><p className="mt-1 text-sm text-secondary">Try Settings → Accessibility → Touch → Back Tap and assign {shortcutName}. Siri and a Home Screen icon work too.</p></div>
    </div>
    <Button type="button" fullWidth className="mt-6" onClick={onClose}>Done</Button>
  </div></div>;
}

function SetupStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-subtle p-4"><div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{number}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-primary">{title}</h3><div className="mt-2">{children}</div></div></div></div>; }
function QuickCaptureIcon() { return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M13 2L4.5 13H11l-1 9L19.5 11H13l0-9z" strokeLinejoin="round" /></svg></div>; }
function formatWhen(value: string): string { const date = new Date(value); if (Number.isNaN(date.getTime())) return 'recently'; return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
