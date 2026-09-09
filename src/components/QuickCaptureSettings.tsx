'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { db } from '@/database';
import { DEVICE_LEDGER_BINDING_ID } from '@/sync/syncBinding';
import { getSyncStatus } from '@/sync/syncService';

type CaptureTokenMetadata = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
type ShortcutType = 'expense' | 'income';
type SetupSession = { token: string; device: CaptureTokenMetadata };

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
  const [setupSession, setSetupSession] = useState<SetupSession | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const connectedTokens = useMemo(
    () => tokens.filter((token) => !token.revoked_at && Boolean(token.last_used_at)),
    [tokens]
  );
  const incompleteTokens = useMemo(
    () => tokens.filter((token) => !token.revoked_at && !token.last_used_at),
    [tokens]
  );

  useEffect(() => {
    if (binding === null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!signedIn) {
        setLinked(false);
        setLinkChecked(true);
        return;
      }
      void getSyncStatus().then((status) => {
        if (!cancelled) {
          setLinked(status.bindingState === 'linked');
          setLinkChecked(true);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [binding, signedIn]);

  const loadTokens = async (): Promise<CaptureTokenMetadata[]> => {
    const response = await fetch('/api/capture-tokens');
    const body = (await response.json()) as { tokens?: CaptureTokenMetadata[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'iPhone connections could not be loaded.');
    const next = body.tokens ?? [];
    setTokens(next);
    return next;
  };

  const refresh = async () => {
    if (!signedIn || !linked) return;
    setLoading(true);
    try {
      await loadTokens();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'iPhone connections could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn || !linked || !linkChecked) return;
    queueMicrotask(() => {
      void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, linked, linkChecked]);

  const openSetup = () => {
    setSetupSession(null);
    setSetupOpen(true);
  };

  const createSetupKey = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/capture-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || 'My iPhone' }),
      });
      const body = (await response.json()) as {
        token?: string;
        device?: CaptureTokenMetadata;
        error?: string;
      };
      if (!response.ok || !body.token || !body.device) {
        throw new Error(body.error ?? 'A setup key could not be created.');
      }
      setSetupSession({ token: body.token, device: body.device });
      toast.success('Setup key created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A setup key could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    const response = await fetch('/api/capture-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'This iPhone key could not be removed.');
    setTokens((current) =>
      current.map((token) =>
        token.id === id ? { ...token, revoked_at: new Date().toISOString() } : token
      )
    );
  };

  const disconnect = async (id: string) => {
    try {
      await revokeToken(id);
      toast.success('iPhone disconnected.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'This iPhone could not be disconnected.');
    }
  };

  const removeIncomplete = async (id: string) => {
    try {
      await revokeToken(id);
      toast.success('Incomplete setup removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'This incomplete setup could not be removed.');
    }
  };

  const verifySetup = async (): Promise<boolean> => {
    if (!setupSession) return false;
    try {
      const next = await loadTokens();
      const device = next.find((token) => token.id === setupSession.device.id);
      if (device?.last_used_at && !device.revoked_at) {
        setSetupSession((current) => (current ? { ...current, device } : current));
        return true;
      }
      return false;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'TapTrack could not verify the shortcut yet.');
      return false;
    }
  };

  const cancelSetup = async () => {
    const session = setupSession;
    if (session && !session.device.last_used_at) {
      try {
        const next = await loadTokens();
        const current = next.find((token) => token.id === session.device.id);
        if (current?.last_used_at && !current.revoked_at) {
          setTokens(next);
        } else if (current && !current.revoked_at) {
          await revokeToken(current.id);
        }
      } catch {
        // Leave the credential intact if connection state cannot be checked safely.
        // It will appear as an incomplete setup on the next successful refresh.
      }
    }
    setSetupOpen(false);
    setSetupSession(null);
  };

  const finishSetup = async () => {
    const connected = await verifySetup();
    if (!connected) {
      toast.error('Run the shortcut once on your iPhone, then check the connection.');
      return;
    }
    setSetupOpen(false);
    setSetupSession(null);
    toast.success('iPhone Quick Capture connected.');
  };

  if (!signedIn || !linked) {
    return (
      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex items-center gap-3">
          <QuickCaptureIcon />
          <div>
            <h2 className="text-base font-semibold text-primary">Quick Capture</h2>
            <p className="mt-0.5 text-sm text-muted">
              {!signedIn
                ? 'Sign in to add transactions from iPhone Shortcuts.'
                : !linkChecked
                  ? 'Checking sync…'
                  : 'Turn on sync for this device before setting up iPhone Shortcuts.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-subtle bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <QuickCaptureIcon />
            <div>
              <h2 className="text-base font-semibold text-primary">Quick Capture</h2>
              <p className="mt-1 text-sm text-muted">
                Add transactions from Siri, Home Screen, Back Tap, or the Action Button on supported iPhones.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-subtle bg-surface-muted px-2.5 py-1 text-xs font-semibold text-secondary">
            {connectedTokens.length > 0
              ? `${connectedTokens.length} connected`
              : 'Not set up'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field
            label="Device name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="My iPhone"
            maxLength={80}
          />
          <Button type="button" onClick={openSetup}>Set up iPhone</Button>
        </div>

        {loading ? (
          <div className="mt-4 h-14 animate-pulse rounded-xl bg-surface-muted" aria-hidden="true" />
        ) : connectedTokens.length > 0 ? (
          <div className="mt-5 divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">
            {connectedTokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between gap-3 bg-surface-muted px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{token.label}</p>
                  <p className="mt-0.5 text-xs font-medium text-muted">
                    Last used {formatWhen(token.last_used_at!)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="dangerGhost"
                  size="sm"
                  onClick={() => void disconnect(token.id)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && incompleteTokens.length > 0 ? (
          <details className="group mt-4 rounded-xl border border-subtle bg-surface-muted">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-secondary">Incomplete setups</p>
                <p className="text-xs font-medium text-muted">
                  {incompleteTokens.length} key{incompleteTokens.length === 1 ? '' : 's'} created but never used
                </p>
              </div>
              <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="divide-y divide-subtle border-t border-subtle">
              {incompleteTokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary">{token.label}</p>
                    <p className="mt-0.5 text-xs font-medium text-muted">
                      Never connected · created {formatWhen(token.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="dangerGhost"
                    size="sm"
                    onClick={() => void removeIncomplete(token.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {setupOpen ? (
        <ShortcutSetupSheet
          session={setupSession}
          creating={creating}
          onCreate={() => void createSetupKey()}
          onVerify={verifySetup}
          onCancel={() => void cancelSetup()}
          onDone={() => void finishSetup()}
        />
      ) : null}
    </>
  );
}

function ShortcutSetupSheet({
  session,
  creating,
  onCreate,
  onVerify,
  onCancel,
  onDone,
}: {
  session: SetupSession | null;
  creating: boolean;
  onCreate: () => void;
  onVerify: () => Promise<boolean>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState('');
  const [shortcutType, setShortcutType] = useState<ShortcutType>('expense');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const templateUrl = SHORTCUT_LINKS[shortcutType];
  const endpoint = typeof window === 'undefined' ? '/api/capture' : `${window.location.origin}/api/capture`;
  const shortcutName = shortcutType === 'expense' ? 'TapTrack Expense' : 'TapTrack Income';
  const verified = Boolean(session?.device.last_used_at);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActive?.focus();
    };
  }, []);

  useEffect(() => {
    if (verified) setCheckMessage('Connected. TapTrack received a test transaction from this key.');
  }, [verified]);

  const copyToken = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(session.token);
    setCopied(true);
    toast.success('Setup key copied.');
  };

  const checkConnection = async () => {
    if (!session) return;
    setChecking(true);
    setCheckMessage('');
    const connected = await onVerify();
    setCheckMessage(
      connected
        ? 'Connected. TapTrack received a transaction from this shortcut.'
        : 'Not connected yet. Run the shortcut once on your iPhone, then check again.'
    );
    setChecking(false);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--overlay)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-setup-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-subtle bg-surface p-5 shadow-[var(--shadow-overlay)] sm:max-w-lg sm:rounded-3xl sm:p-6"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-surface-raised sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-accent">iPhone Quick Capture</p>
            <h2 id="shortcut-setup-title" className="mt-1 text-2xl font-semibold tracking-tight text-primary">
              Connect your iPhone.
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Cancel iPhone setup"
            onClick={onCancel}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-muted text-xl text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-surface-muted p-1" role="group" aria-label="Shortcut type">
          {(['expense', 'income'] as ShortcutType[]).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={shortcutType === type}
              onClick={() => setShortcutType(type)}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold capitalize ${
                shortcutType === type ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <SetupStep number="1" title="Create a one-time setup key">
            {session ? (
              <>
                <p className="text-sm text-muted">
                  Paste this key into the shortcut once. TapTrack stores only a hash and will not show the key again.
                </p>
                <Button type="button" variant="secondary" className="mt-3" onClick={() => void copyToken()}>
                  {copied ? 'Copied ✓' : 'Copy setup key'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Nothing is connected yet. Generate the key only when you are ready to finish setup on your phone.
                </p>
                <Button type="button" variant="secondary" className="mt-3" onClick={onCreate} loading={creating} disabled={creating}>
                  Generate setup key
                </Button>
              </>
            )}
          </SetupStep>

          <SetupStep number="2" title={templateUrl ? `Install ${shortcutName}` : `Build ${shortcutName} in Apple Shortcuts`}>
            {!session ? (
              <p className="text-sm text-muted">Generate your setup key first.</p>
            ) : templateUrl ? (
              <>
                <p className="text-sm text-muted">
                  Apple will ask for the setup key you copied, then add the shortcut to your library.
                </p>
                <a
                  href={templateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-action-primary px-4 text-sm font-semibold text-white hover:bg-action-primary-hover"
                >
                  Install Shortcut
                </a>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  TapTrack’s capture API is ready, but this deployment does not have a prebuilt iCloud Shortcut link configured. Manual setup works with the same secure key.
                </p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
                  <li>
                    Tap <a href="shortcuts://create-shortcut" className="font-semibold text-accent">Create Shortcut</a> and name it <strong>{shortcutName}</strong>.
                  </li>
                  <li>Add <strong>Ask for Input</strong> as Number for “Amount”, then another as Text for “What was it?”.</li>
                  <li>
                    Add <strong>Get Contents of URL</strong>, use <code className="rounded bg-surface px-1">{endpoint}</code>, method POST, and a JSON body with <code>type</code> = <strong>{shortcutType}</strong>, <code>amount</code> = Amount, and <code>title</code> = What was it?.
                  </li>
                  <li>
                    Add the Authorization header as <code className="rounded bg-surface px-1">Bearer [your setup key]</code>.
                  </li>
                </ol>
                <p className="mt-3 text-xs text-muted">TapTrack supplies the current date automatically.</p>
              </>
            )}
          </SetupStep>

          <SetupStep number="3" title="Run once to verify">
            <p className="text-sm text-muted">
              Run the shortcut on your iPhone and save one transaction. TapTrack will only call the device connected after that first successful capture.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => void checkConnection()}
              loading={checking}
              disabled={!session || checking}
            >
              Check connection
            </Button>
            {checkMessage ? (
              <p className={`mt-2 text-xs font-semibold ${verified ? 'text-success' : 'text-muted'}`} role="status">
                {checkMessage}
              </p>
            ) : null}
          </SetupStep>

          <div className="rounded-2xl bg-accent-muted p-4">
            <p className="text-sm font-semibold text-accent">After it connects</p>
            <p className="mt-1 text-sm text-secondary">
              Assign {shortcutName} to Siri, a Home Screen icon, Back Tap, or the Action Button. Closing this setup before verification cancels an unused key.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel setup</Button>
          <Button type="button" onClick={onDone} disabled={!verified}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function SetupStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-subtle p-4">
      <div className="flex gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action-primary text-xs font-bold text-white">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

function QuickCaptureIcon() {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M13 2L4.5 13H11l-1 9L19.5 11H13l0-9z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
